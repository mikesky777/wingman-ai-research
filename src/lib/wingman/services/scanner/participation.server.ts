/**
 * Participation Quality acquisition (server-only) — SHADOW / CALIBRATION.
 *
 * Fetches Birdeye trade-data for a NARROW target set (candidates already past
 * the cheap upstream gates that realistically compete for Survivor selection),
 * persists the raw provider facts as append-only participation evidence, and
 * runs the pure evaluator.
 *
 * v1.1 request discipline: bounded low concurrency, a minimum spacing between
 * request starts, and retry/backoff only for retryable (rate-limit/transport)
 * failures — handled inside the shared Birdeye client. Candidates with fresh
 * stored evidence are never re-requested. A provider failure after the allowed
 * retries stays UNKNOWN; participation values are never fabricated.
 */
import { fetchTokenParticipation } from "../external/birdeye/trade-data.server";
import { participationToEvidence } from "../evidence/participation-evidence";
import { appendEvidenceObservations } from "../evidence-persistence.server";
import {
  evaluateParticipation,
  unknownParticipation,
  PARTICIPATION_SHADOW_MODE,
  type ParticipationEvaluation,
  type ParticipationStatus,
} from "./participation";

export interface ParticipationTarget {
  contractAddress: string;
  chain: string;
  tokenId: string | null;
  liquidityUsd: number | null;
  volumeToLiquidity24h: number | null;
  turnover24h: number | null;
  /** True when stored participation evidence is still fresh (no fetch). */
  carryForward: boolean;
}

export interface ParticipationDiagnostics {
  shadowMode: boolean;
  targets: number;
  providerRequests: number;
  carriedForward: number;
  failures: number;
  evidenceObservationsWritten: number;
  /** v1.1 request-discipline telemetry. */
  requestsAttempted: number;
  requestsSucceeded: number;
  rateLimited: number;
  retries: number;
  recoveredAfterRetry: number;
  unknownFromProviderFailure: number;
  concurrency: number;
  minSpacingMs: number;
  statuses: Record<ParticipationStatus, number>;
}

/** Bounded discipline defaults — one shared knob set, never per call site. */
export const PARTICIPATION_REQUEST_CONCURRENCY = 2;
export const PARTICIPATION_REQUEST_SPACING_MS = 400;
export const PARTICIPATION_MAX_ATTEMPTS = 4;

export const EMPTY_PARTICIPATION_DIAGNOSTICS: ParticipationDiagnostics = {
  shadowMode: PARTICIPATION_SHADOW_MODE,
  targets: 0,
  providerRequests: 0,
  carriedForward: 0,
  failures: 0,
  evidenceObservationsWritten: 0,
  requestsAttempted: 0,
  requestsSucceeded: 0,
  rateLimited: 0,
  retries: 0,
  recoveredAfterRetry: 0,
  unknownFromProviderFailure: 0,
  concurrency: PARTICIPATION_REQUEST_CONCURRENCY,
  minSpacingMs: PARTICIPATION_REQUEST_SPACING_MS,
  statuses: { BROAD: 0, CONCENTRATED: 0, EXTREME: 0, UNKNOWN: 0 },
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function evaluateParticipationForTargets(
  targets: ParticipationTarget[],
  options: {
    scanRunId?: string | null;
    concurrency?: number;
    spacingMs?: number;
    track?: <T>(fn: () => Promise<T>) => Promise<T>;
    now?: Date;
  } = {},
): Promise<{
  evaluations: Map<string, ParticipationEvaluation>;
  diagnostics: ParticipationDiagnostics;
}> {
  const evaluations = new Map<string, ParticipationEvaluation>();
  const concurrency = Math.max(1, options.concurrency ?? PARTICIPATION_REQUEST_CONCURRENCY);
  const spacingMs = Math.max(0, options.spacingMs ?? PARTICIPATION_REQUEST_SPACING_MS);
  const diagnostics: ParticipationDiagnostics = {
    ...EMPTY_PARTICIPATION_DIAGNOSTICS,
    statuses: { BROAD: 0, CONCENTRATED: 0, EXTREME: 0, UNKNOWN: 0 },
    targets: targets.length,
    concurrency,
    minSpacingMs: spacingMs,
  };
  if (targets.length === 0) return { evaluations, diagnostics };

  const evaluatedAt = (options.now ?? new Date()).toISOString();
  let cursor = 0;
  // Shared spacing gate: request STARTS are separated globally, so raising
  // concurrency can never burst the provider.
  let nextSlot = 0;

  const takeSlot = async () => {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + spacingMs;
    if (at > now) await sleep(at - now);
  };

  const worker = async () => {
    while (cursor < targets.length) {
      const target = targets[cursor]!;
      cursor += 1;

      const context = {
        liquidityUsd: target.liquidityUsd,
        volumeToLiquidity24h: target.volumeToLiquidity24h,
        turnover24h: target.turnover24h,
        evaluatedAt,
      };

      if (target.carryForward) {
        // Fresh stored evidence: no provider call. The prior observation keeps
        // its own timestamps; nothing is re-stamped as if newly observed.
        diagnostics.carriedForward += 1;
        evaluations.set(
          target.contractAddress,
          unknownParticipation("PARTICIPATION_EVIDENCE_CARRIED_FORWARD", context),
        );
        continue;
      }

      await takeSlot();

      let retried = false;
      let sawRateLimit = false;
      try {
        diagnostics.requestsAttempted += 1;
        const run = () =>
          fetchTokenParticipation(target.contractAddress, {
            chain: target.chain,
            request: {
              maxAttempts: PARTICIPATION_MAX_ATTEMPTS,
              onRetry: ({ code }) => {
                retried = true;
                diagnostics.retries += 1;
                if (code === "RATE_LIMITED") {
                  sawRateLimit = true;
                  diagnostics.rateLimited += 1;
                }
              },
            },
          });
        const observation = options.track ? await options.track(run) : await run();
        diagnostics.providerRequests += 1;
        diagnostics.requestsSucceeded += 1;
        if (retried) diagnostics.recoveredAfterRetry += 1;

        // Evidence is appended exactly once per successful observation, so
        // internal retries can never duplicate stored evidence.
        if (target.tokenId) {
          const evidence = participationToEvidence(observation);
          const result = await appendEvidenceObservations(evidence, {
            tokenId: target.tokenId,
            scanRunId: options.scanRunId ?? null,
          });
          diagnostics.evidenceObservationsWritten += result.inserted;
        }

        evaluations.set(target.contractAddress, evaluateParticipation(observation, context));
      } catch (error) {
        // Provider failure is UNKNOWN and never blocks anything.
        const message = error instanceof Error ? error.message : "unknown error";
        if (/RATE_LIMITED/i.test(message) && !sawRateLimit) diagnostics.rateLimited += 1;
        diagnostics.providerRequests += 1;
        diagnostics.failures += 1;
        diagnostics.unknownFromProviderFailure += 1;
        evaluations.set(
          target.contractAddress,
          unknownParticipation(`PARTICIPATION_PROVIDER_UNAVAILABLE: ${message}`, context),
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));

  for (const evaluation of evaluations.values()) {
    diagnostics.statuses[evaluation.status] += 1;
  }

  return { evaluations, diagnostics };
}
