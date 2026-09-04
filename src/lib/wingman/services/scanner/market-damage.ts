/**
 * Recent Catastrophic Collapse gate (pure).
 *
 * A lightweight CURRENT-MARKET veto: a token whose confirmed 1h price change
 * is at or below the configured threshold is temporarily ineligible for
 * Survivor selection. It is:
 *
 *   - NOT a structural verdict
 *   - NOT a Price Integrity verdict
 *   - NOT a permanent blacklist
 *   - NEVER an input to Quantitative Research Priority, setup qualification,
 *     ranking, recurrence or outcomes
 *
 * Missing or provider-failed data is UNKNOWN and never blocks. `null` is never
 * treated as zero.
 */
import { RECENT_MARKET_DAMAGE } from "./config";

export type MarketDamageStatus = "PASS" | "FAIL" | "UNKNOWN";

export const RECENT_CATASTROPHIC_COLLAPSE = "RECENT_CATASTROPHIC_COLLAPSE";

export interface MarketDamageAssessment {
  status: MarketDamageStatus;
  /** Confirmed 1h price change in percent, or `null` when unavailable. */
  priceChange1hPct: number | null;
  thresholdPct: number;
  reason: string | null;
}

export function assessRecentMarketDamage(
  priceChange1hPct: number | null | undefined,
): MarketDamageAssessment {
  const threshold = RECENT_MARKET_DAMAGE.maxPriceChange1hPct;
  if (
    priceChange1hPct === null ||
    priceChange1hPct === undefined ||
    !Number.isFinite(priceChange1hPct)
  ) {
    return { status: "UNKNOWN", priceChange1hPct: null, thresholdPct: threshold, reason: null };
  }
  if (priceChange1hPct <= threshold) {
    return {
      status: "FAIL",
      priceChange1hPct,
      thresholdPct: threshold,
      reason: RECENT_CATASTROPHIC_COLLAPSE,
    };
  }
  return { status: "PASS", priceChange1hPct, thresholdPct: threshold, reason: null };
}

/** Only a confirmed FAIL removes current Survivor eligibility. */
export function isRecentMarketDamageEligible(
  priceChange1hPct: number | null | undefined,
): boolean {
  return assessRecentMarketDamage(priceChange1hPct).status !== "FAIL";
}
