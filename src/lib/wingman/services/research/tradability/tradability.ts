/**
 * pre_deep_research_tradability/v1 — pure operational gate.
 *
 * Answers ONE question immediately before expensive Deep Research provider
 * execution: is this exact mint still tradable RIGHT NOW?
 *
 * This is an operational spend guard, never a Triage decision, never a Thesis
 * judgment and never negative evidence. A frozen AI Triage DEEP_RESEARCH
 * decision stays exactly as it was recorded; a later liquidity collapse only
 * means research spend is not operationally justified at this moment.
 *
 * Explicitly NOT gated here: LP lock, LP burn, DexScreener icon/banner/paid
 * profile, boosts, MC/liquidity ratios. Absence of that metadata is missing
 * evidence, not adverse evidence.
 */
import { ACTIVITY_FLOOR } from "../../scanner/config";

export const TRADABILITY_POLICY_VERSION = "pre_deep_research_tradability/v1";

/**
 * The existing authoritative catastrophic-liquidity floor. Deliberately reused
 * — this gate invents no new threshold.
 */
export const MIN_CURRENT_LIQUIDITY_USD = ACTIVITY_FLOOR.catastrophicLiquidityUsd;

export type TradabilityResult = "TRADABLE" | "BLOCKED" | "NOT_EVALUABLE";

export type TradabilityReasonCode =
  | "CURRENT_LIQUIDITY_OK"
  | "CURRENT_LIQUIDITY_BELOW_MINIMUM"
  | "CURRENT_TRADABILITY_NOT_EVALUABLE";

/** A fresh, exact-mint current market observation (never a scan snapshot). */
export interface CurrentMarketObservation {
  mint: string;
  /** Pair resolved by exact mint only — never by ticker or name. */
  pairAddress: string | null;
  dexId: string | null;
  liquidityUsd: number | null;
  /** e.g. "dexscreener". */
  source: string;
  observedAt: string;
  /** True when the provider call itself failed (never "zero liquidity"). */
  providerFailed: boolean;
  providerErrorCode: string | null;
}

export interface TradabilityAssessment {
  result: TradabilityResult;
  reasonCode: TradabilityReasonCode;
  detail: string;
  liquidityUsd: number | null;
  pairAddress: string | null;
  minLiquidityUsd: number;
}

/**
 * Missing or unverifiable market data is NEVER inferred as zero liquidity.
 * Only a confirmed liquidity value at or below the floor blocks spend.
 */
export function evaluateCurrentTradability(
  observation: CurrentMarketObservation | null,
): TradabilityAssessment {
  const base = {
    minLiquidityUsd: MIN_CURRENT_LIQUIDITY_USD,
    liquidityUsd: observation?.liquidityUsd ?? null,
    pairAddress: observation?.pairAddress ?? null,
  };

  if (!observation || observation.providerFailed) {
    return {
      ...base,
      result: "NOT_EVALUABLE",
      reasonCode: "CURRENT_TRADABILITY_NOT_EVALUABLE",
      detail: observation?.providerErrorCode
        ? `Current market could not be verified (${observation.providerErrorCode}).`
        : "Current market could not be verified.",
    };
  }

  if (!observation.pairAddress) {
    return {
      ...base,
      result: "NOT_EVALUABLE",
      reasonCode: "CURRENT_TRADABILITY_NOT_EVALUABLE",
      detail: "No current market/pair could be resolved for this exact mint.",
    };
  }

  if (typeof observation.liquidityUsd !== "number" || !Number.isFinite(observation.liquidityUsd)) {
    return {
      ...base,
      result: "NOT_EVALUABLE",
      reasonCode: "CURRENT_TRADABILITY_NOT_EVALUABLE",
      detail: "Resolved current pair reports no usable USD liquidity value.",
    };
  }

  if (observation.liquidityUsd <= MIN_CURRENT_LIQUIDITY_USD) {
    return {
      ...base,
      result: "BLOCKED",
      reasonCode: "CURRENT_LIQUIDITY_BELOW_MINIMUM",
      detail: `Current liquidity $${Math.round(observation.liquidityUsd).toLocaleString()} is at or below the $${MIN_CURRENT_LIQUIDITY_USD.toLocaleString()} operational minimum.`,
    };
  }

  return {
    ...base,
    result: "TRADABLE",
    reasonCode: "CURRENT_LIQUIDITY_OK",
    detail: `Current liquidity $${Math.round(observation.liquidityUsd).toLocaleString()} clears the $${MIN_CURRENT_LIQUIDITY_USD.toLocaleString()} operational minimum.`,
  };
}

/** Human-facing sentence for a blocked/unverifiable DEEP candidate. */
export function tradabilityStatement(reasonCode: TradabilityReasonCode): string {
  switch (reasonCode) {
    case "CURRENT_LIQUIDITY_BELOW_MINIMUM":
      return `Current liquidity fell below the $${MIN_CURRENT_LIQUIDITY_USD.toLocaleString()} operational minimum after Triage.`;
    case "CURRENT_TRADABILITY_NOT_EVALUABLE":
      return "Current tradability could not be verified; research spend withheld.";
    default:
      return "Current tradability verified.";
  }
}
