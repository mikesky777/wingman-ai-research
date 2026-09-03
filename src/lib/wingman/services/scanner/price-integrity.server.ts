/**
 * Price / Launch Integrity acquisition (server-only) — SHADOW / CALIBRATION.
 *
 * Fetches (or reuses cached) historical candles for the narrow set of
 * candidates where launch structure actually matters, then runs the pure
 * evaluator. Nothing written here is read by ranking, setup qualification,
 * Structural Eligibility, survivor selection or outcomes.
 *
 * Fetch policy for v1:
 *   - structurally eligible BASE survivors only
 *   - never OUT_OF_SCOPE, never Structural FAIL
 *   - never the whole discovered universe
 *   - REACCEL needs no launch history in this build
 */
import { ensurePriceHistory, type PriceHistoryDiagnostics } from "./price-history.server";
import {
  evaluateFromCandles,
  PRICE_INTEGRITY_SHADOW_MODE,
  type IntegrityCandle,
  type PriceIntegrityEvaluation,
  type PriceIntegrityStatus,
} from "./price-integrity";

export interface PriceIntegrityTarget {
  contractAddress: string;
  chain: string;
  launchAt: string | null;
  setups: string[];
  pairAddress?: string | null;
}

export interface PriceIntegrityDiagnostics extends PriceHistoryDiagnostics {
  shadowMode: boolean;
  statuses: Record<PriceIntegrityStatus, number>;
}

export const EMPTY_PRICE_INTEGRITY_DIAGNOSTICS: PriceIntegrityDiagnostics = {
  shadowMode: PRICE_INTEGRITY_SHADOW_MODE,
  candidatesRequiringHistory: 0,
  providerRequests: 0,
  servedFullyFromCache: 0,
  candlesStored: 0,
  tokensWithHistory: 0,
  failures: 0,
  statuses: { HEALTHY: 0, CONCERN: 0, DAMAGED: 0, UNKNOWN: 0 },
};

export async function evaluatePriceIntegrityForTargets(
  targets: PriceIntegrityTarget[],
  options: {
    now?: Date;
    concurrency?: number;
    track?: <T>(fn: () => Promise<T>) => Promise<T>;
  } = {},
): Promise<{
  evaluations: Map<string, PriceIntegrityEvaluation>;
  diagnostics: PriceIntegrityDiagnostics;
}> {
  const evaluations = new Map<string, PriceIntegrityEvaluation>();
  const diagnostics: PriceIntegrityDiagnostics = {
    ...EMPTY_PRICE_INTEGRITY_DIAGNOSTICS,
    statuses: { HEALTHY: 0, CONCERN: 0, DAMAGED: 0, UNKNOWN: 0 },
    candidatesRequiringHistory: targets.length,
  };
  if (targets.length === 0) return { evaluations, diagnostics };

  const nowIso = (options.now ?? new Date()).toISOString();
  const limit = Math.max(1, options.concurrency ?? 2);
  let cursor = 0;

  const worker = async () => {
    while (cursor < targets.length) {
      const target = targets[cursor]!;
      cursor += 1;
      try {
        const history = await ensurePriceHistory(
          {
            contractAddress: target.contractAddress,
            chain: target.chain,
            launchAt: target.launchAt,
            pairAddress: target.pairAddress ?? null,
          },
          { now: options.now, track: options.track },
        );
        diagnostics.providerRequests += history.providerRequests;
        diagnostics.candlesStored += history.candlesStored;
        if (history.servedFromCache && history.candles.length > 0) {
          diagnostics.servedFullyFromCache += 1;
        }
        if (history.candles.length > 0) diagnostics.tokensWithHistory += 1;
        if (history.error) diagnostics.failures += 1;

        const candles: IntegrityCandle[] = history.candles.map((c) => ({
          interval: c.interval,
          candleTime: c.candleTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volumeUsd: c.volumeUsd,
        }));
        const evaluation = evaluateFromCandles(
          candles,
          history.launchAt,
          target.setups,
          nowIso,
        );
        evaluations.set(target.contractAddress, evaluation);
        diagnostics.statuses[evaluation.status] += 1;
      } catch {
        // A history failure is never damage and never fails the scan.
        diagnostics.failures += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, targets.length) }, worker));
  return { evaluations, diagnostics };
}
