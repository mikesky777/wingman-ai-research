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

/**
 * Call-time vs current separation (pure, display-only).
 *
 * Call-time eligibility is what the scan row froze at Survivor selection and
 * is NEVER recomputed or rewritten. Current eligibility is a live reading. A
 * token that passed at call time and fails now is a POST_CALL_COLLAPSE: the
 * historical Survivor row, First Call baseline and outcome tracking all stay
 * exactly as they are, but the token is not eligible for current AI research.
 */
export type DamageTimelineState =
  | "ELIGIBLE"
  | "POST_CALL_COLLAPSE"
  | "BLOCKED_AT_CALL"
  | "CURRENTLY_BLOCKED"
  | "UNKNOWN";

export interface DamageTimelineInput {
  /** 1h change persisted on the scan row used by Survivor selection. */
  callTime1hPct: number | null | undefined;
  /** When the scan row was captured. */
  callTimeAt: string | null;
  /** Latest live 1h change, or null when no current reading exists. */
  current1hPct: number | null | undefined;
  /** When the live reading was taken. */
  currentAt: string | null;
}

export interface DamageTimeline {
  callTime: MarketDamageAssessment;
  callTimeAt: string | null;
  current: MarketDamageAssessment;
  currentAt: string | null;
  state: DamageTimelineState;
  /** True only when it passed at call time and fails now. */
  postCallCollapse: boolean;
  /** Current AI research eligibility. A confirmed current FAIL blocks it. */
  researchEligibleNow: boolean;
}

export function deriveDamageTimeline(input: DamageTimelineInput): DamageTimeline {
  const callTime = assessRecentMarketDamage(input.callTime1hPct);
  const current = assessRecentMarketDamage(input.current1hPct);
  const postCallCollapse = callTime.status === "PASS" && current.status === "FAIL";

  const state: DamageTimelineState = postCallCollapse
    ? "POST_CALL_COLLAPSE"
    : callTime.status === "FAIL"
      ? "BLOCKED_AT_CALL"
      : current.status === "FAIL"
        ? "CURRENTLY_BLOCKED"
        : callTime.status === "PASS" && current.status === "PASS"
          ? "ELIGIBLE"
          : "UNKNOWN";

  return {
    callTime,
    callTimeAt: input.callTimeAt,
    current,
    currentAt: input.currentAt,
    state,
    postCallCollapse,
    // Missing current data never blocks research — only a confirmed FAIL does.
    researchEligibleNow: current.status !== "FAIL",
  };
}
