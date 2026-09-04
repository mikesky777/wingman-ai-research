/**
 * Participation Quality acquisition (server-only) — SHADOW / CALIBRATION.
 *
 * Fetches Birdeye trade-data for a NARROW target set (candidates already past
 * the cheap upstream gates that realistically compete for Survivor selection),
 * persists the raw provider facts as append-only participation evidence, and
 * runs the pure evaluator.
 *
 * Costs exactly one provider request per evaluated token, and none at all for
 * a candidate whose stored participation evidence is still fresh.
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
  statuses: Record<ParticipationStatus, number>;
}

export const EMPTY_PARTICIPATION_DIAGNOSTICS: ParticipationDiagnostics = {
  shadowMode: PARTICIPATION_SHADOW_MODE,
  targets: 0,
  providerRequests: 0,
  carriedForward: 0,
  failures: 0,
  evidenceObservationsWritten: 0,
  statuses: { BROAD: 0, CONCENTRATED: 0, EXTREME: 0, UNKNOWN: 0 },
};

export async function evaluateParticipationForTargets(
  targets: ParticipationTarget[],
  options: {
    scanRunId?: string | null;
    concurrency?: number;
    track?: <T>(fn: () => Promise<T>) => Promise<T>;
    now?: Date;
  } = {},
): Promise<{
  evaluations: Map<string, ParticipationEvaluation>;
  diagnostics: ParticipationDiagnostics;
}> {
  const evaluations = new Map<string, ParticipationEvaluation>();
  const diagnostics: ParticipationDiagnostics = {
    ...EMPTY_PARTICIPATION_DIAGNOSTICS,
    statuses: { BROAD: 0, CONCENTRATED: 0, EXTREME: 0, UNKNOWN: 0 },
    targets: targets.length,
  };
  if (targets.length === 0) return { evaluations, diagnostics };

  const evaluatedAt = (options.now ?? new Date()).toISOString();
  const limit = Math.max(1, options.concurrency ?? 3);
  let cursor = 0;

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

      try {
        const run = () => fetchTokenParticipation(target.contractAddress, { chain: target.chain });
        const observation = options.track ? await options.track(run) : await run();
        diagnostics.providerRequests += 1;

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
        diagnostics.providerRequests += 1;
        diagnostics.failures += 1;
        evaluations.set(
          target.contractAddress,
          unknownParticipation(
            `PARTICIPATION_PROVIDER_UNAVAILABLE: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
            context,
          ),
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, targets.length) }, worker));

  for (const evaluation of evaluations.values()) {
    diagnostics.statuses[evaluation.status] += 1;
  }

  return { evaluations, diagnostics };
}
