/**
 * Outcome market observation validity (pure, deterministic).
 *
 * `outcome_market_validity/v1`
 *
 * One question only: is this persisted market observation economically
 * meaningful enough to move Since Stage / Peak / drawdown metrics?
 *
 * Chosen from an audit of every affected observation rather than an invented
 * threshold. Findings across 4,821 persisted snapshots:
 *   - 855 observations carry liquidity below $100; the largest of them is
 *     $52.28 and there is NOT a single observation between $53 and $100, so
 *     the cohort is cleanly separated from real markets.
 *   - 767 of those combine that dust liquidity with a market cap more than
 *     1,000,000x the pooled depth (TUZKI: $2.50 liquidity quoting a $766bn
 *     market cap), which is a drained-pool quote, not a valuation.
 *   - Only 2 observations with real liquidity (>= $100) exceed a 10,000x
 *     market-cap-to-liquidity ratio.
 *
 * Rules, in order:
 *   1. liquidity evidence missing            -> UNKNOWN
 *   2. liquidity < $100                      -> INVALID_MARKET (drained pool)
 *   3. market cap / liquidity > 10,000       -> INVALID_MARKET (no credible
 *                                               market can absorb that float)
 *   4. otherwise                             -> VALID
 *
 * Invalid observations are never deleted, never clamped and never read as
 * zero. They are preserved and excluded from derived metrics.
 */

export const OUTCOME_MARKET_VALIDITY_VERSION = "outcome_market_validity/v1";

export type OutcomeMarketValidity = "VALID" | "INVALID_MARKET" | "UNKNOWN";

/** Below this pooled USD depth a quote is a drained-pool artifact. */
export const MIN_VALID_LIQUIDITY_USD = 100;

/** Above this market-cap-to-liquidity ratio a quote is not a real market. */
export const MAX_VALID_MC_TO_LIQUIDITY = 10_000;

export interface MarketValidityInput {
  liquidityUsd: number | null | undefined;
  marketCap: number | null | undefined;
}

export interface MarketValidityAssessment {
  validity: OutcomeMarketValidity;
  /** Machine-readable reason. `null` when VALID. */
  reason: "LIQUIDITY_EVIDENCE_MISSING" | "DRAINED_LIQUIDITY" | "IMPLAUSIBLE_MC_TO_LIQUIDITY" | null;
  mcToLiquidity: number | null;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function assessMarketValidity(input: MarketValidityInput): MarketValidityAssessment {
  const liquidity = input.liquidityUsd;
  const marketCap = input.marketCap;

  if (!isNumber(liquidity)) {
    return { validity: "UNKNOWN", reason: "LIQUIDITY_EVIDENCE_MISSING", mcToLiquidity: null };
  }

  const ratio = isNumber(marketCap) && liquidity > 0 ? marketCap / liquidity : null;

  if (liquidity < MIN_VALID_LIQUIDITY_USD) {
    return { validity: "INVALID_MARKET", reason: "DRAINED_LIQUIDITY", mcToLiquidity: ratio };
  }
  if (ratio !== null && ratio > MAX_VALID_MC_TO_LIQUIDITY) {
    return {
      validity: "INVALID_MARKET",
      reason: "IMPLAUSIBLE_MC_TO_LIQUIDITY",
      mcToLiquidity: ratio,
    };
  }
  return { validity: "VALID", reason: null, mcToLiquidity: ratio };
}

/** Only VALID observations may move outcome metrics. UNKNOWN never does. */
export function isMetricUsable(validity: OutcomeMarketValidity): boolean {
  return validity === "VALID";
}
