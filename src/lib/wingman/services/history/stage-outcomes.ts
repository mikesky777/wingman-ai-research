/**
 * Stage-relative outcome derivation (pure, deterministic, shared).
 *
 * ONE methodology for every stage that has a legitimate FROZEN market
 * baseline (Survivor, AI Shortlist, Thesis Call). Only the baseline changes
 * per stage; the formulas and the `outcome_market_validity/v1` rules do not.
 *
 * Hard rules:
 *   - Descriptive market outcomes only. Never trading returns or realized PnL.
 *   - Only observations at or after the frozen milestone timestamp are used.
 *   - Invalid / drained-pool observations never move current, peak or max DD.
 *   - Missing data stays `null`. A missing value is never `0`.
 *   - Evaluation-only: nothing here may flow back into scanner, triage, deep
 *     research, thesis, entry or sizing.
 */
import {
  buildObservationSeries,
  deriveOutcome,
  type CandidateAppearance,
  type SnapshotObservation,
} from "../outcomes/outcomes";

export const STAGE_OUTCOME_VERSION = "stage_outcome/v1";

export interface StageOutcomeBaseline {
  /** Frozen milestone timestamp. Never altered. */
  enteredAt: string | null;
  marketCapAtEntry: number | null;
  priceAtEntry: number | null;
}

export interface StageOutcomeSeries {
  candidates: CandidateAppearance[];
  snapshots: SnapshotObservation[];
}

export interface StageOutcomeResult {
  /** Market-cap change from the frozen baseline to the newest valid print. */
  sincePct: number | null;
  /** Best market-cap gain vs the baseline across valid post-entry prints. */
  peakPct: number | null;
  /** Worst market-cap move vs the baseline (negative). */
  maxAdversePct: number | null;
  /** Worst decline from a post-entry running peak (negative). */
  drawdownPct: number | null;
  currentMarketCap: number | null;
  currentPriceUsd: number | null;
  currentObservedAt: string | null;
  observationCount: number;
}

export function emptyStageOutcome(): StageOutcomeResult {
  return {
    sincePct: null,
    peakPct: null,
    maxAdversePct: null,
    drawdownPct: null,
    currentMarketCap: null,
    currentPriceUsd: null,
    currentObservedAt: null,
    observationCount: 0,
  };
}

/**
 * Derive the post-milestone outcome series. Delegates to the canonical
 * `deriveOutcome` so Survivors, AI Shortlist and Thesis Calls stay comparable.
 */
export function deriveStageOutcome(
  baseline: StageOutcomeBaseline,
  series: StageOutcomeSeries,
  nowIso: string = new Date().toISOString(),
): StageOutcomeResult {
  if (!baseline.enteredAt) return emptyStageOutcome();
  const observations = buildObservationSeries(series.candidates, series.snapshots);
  const outcome = deriveOutcome({
    baselineAt: baseline.enteredAt,
    baselinePriceUsd: baseline.priceAtEntry,
    baselineMarketCap: baseline.marketCapAtEntry,
    series: observations,
    nowIso,
  });
  return {
    sincePct: outcome.marketCapChangePct,
    peakPct: outcome.maxGainPct,
    maxAdversePct: outcome.maxAdverseChangePct,
    drawdownPct: outcome.maxPeakToTroughDrawdownPct,
    currentMarketCap: outcome.currentMarketCap,
    currentPriceUsd: outcome.currentPriceUsd,
    currentObservedAt: outcome.currentObservedAt,
    observationCount: outcome.observationCount,
  };
}
