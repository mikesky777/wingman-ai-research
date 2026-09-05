/**
 * Entry State v1 — pure contracts.
 *
 * Entry State answers ONE question: "given the thesis we already hold, is the
 * CURRENT market structure a sensible place to enter?". It never changes the
 * Thesis Score, Evidence Confidence, scanner selection, Quantitative Research
 * Priority or Deep Research evidence, and it never produces a position size,
 * stop loss, buy/sell instruction or trade action.
 *
 * Responsibility split in v1:
 *   - DETERMINISTIC (this module + `features.ts` + `scoring.ts`):
 *     timing features, component scores, divergence classification, state
 *     mapping, rationale phrasing, improve/break conditions.
 *   - MODEL: nothing. v1 deliberately keeps the timing layer reproducible; a
 *     narration model may later rephrase rationale text WITHOUT being allowed
 *     to change the state or any component score.
 */

export const ENTRY_POLICY_VERSION = "entry_state/v1.1";
export const ENTRY_FEATURE_VERSION = "entry_features/v1";

/** Where the timing price series came from. */
export type PriceHistorySource = "CANDLES" | "WINGMAN_OBSERVATIONS" | "NONE";
/** How precise that timing evidence is. */
export type TimingResolution = "HIGH" | "COARSE" | "INSUFFICIENT";

/**
 * v1.1 resolution firewall.
 *
 * HIGH (candles) may prove candle-grade structure: breakout/reclaim, retest,
 * higher low, lower-high sequences, compression, consolidation-bar counting,
 * candle volume contraction/expansion, realized volatility, precise extension,
 * wick rejection.
 *
 * COARSE (irregular Wingman observations) may prove ONLY broad claims: broad
 * trajectory, broad stability/deterioration, approximate extension, broad
 * volume/participation trend, broad liquidity condition, broad attention-price
 * divergence. Candle-grade fields are still computed for diagnostics but carry
 * ZERO decision weight and are tagged UNSUPPORTED_AT_COARSE_RESOLUTION.
 */
export const CANDLE_GRADE_FEATURES = [
  "consolidationBars",
  "compressionRatio",
  "consolidationVolumeRatio",
  "realizedVolatilityPct",
  "higherLow",
  "lowerHighs",
  "reclaimHolding",
  "retracementDepthPct",
  "verticalExpansion",
] as const;

export const COARSE_UNSUPPORTED_REASON = "UNSUPPORTED_AT_COARSE_RESOLUTION";

export function supportsCandleGradeClaims(resolution: TimingResolution): boolean {
  return resolution === "HIGH";
}

export const ENTRY_STATES_V1 = [
  "WATCH",
  "SETTING_UP",
  "BUY_ZONE",
  "ACCEPTABLE",
  "EXTENDED",
  "BROKEN",
  "UNKNOWN",
] as const;
export type EntryStateV1 = (typeof ENTRY_STATES_V1)[number];

/** Component maxima are part of the policy: 3 / 3 / 2 / 2 → 10. */
export const ENTRY_COMPONENTS = [
  { key: "structure", label: "Structure", max: 3 },
  { key: "extension", label: "Extension", max: 3 },
  { key: "volumeFlow", label: "Volume / order flow", max: 2 },
  { key: "riskDefinition", label: "Risk definition", max: 2 },
] as const;

export type EntryComponentKey = (typeof ENTRY_COMPONENTS)[number]["key"];
export type EntryComponentScores = Record<EntryComponentKey, number>;

export const ENTRY_MAX_SCORE = ENTRY_COMPONENTS.reduce((sum, c) => sum + c.max, 0);

/** Clamp to the declared maxima and to a single decimal place. */
export function clampComponents(raw: Partial<Record<EntryComponentKey, number>>): EntryComponentScores {
  const out = {} as EntryComponentScores;
  for (const c of ENTRY_COMPONENTS) {
    const value = raw[c.key];
    const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
    out[c.key] = Math.round(Math.min(c.max, Math.max(0, safe)) * 10) / 10;
  }
  return out;
}

export function totalEntryScore(components: EntryComponentScores): number {
  const sum = ENTRY_COMPONENTS.reduce((acc, c) => acc + components[c.key], 0);
  return Math.round(sum * 10) / 10;
}

export const DIVERGENCE_STATES = ["POSITIVE", "NEUTRAL", "NEGATIVE", "UNKNOWN"] as const;
export type DivergenceState = (typeof DIVERGENCE_STATES)[number];

export interface DivergenceInput {
  /** Trade-count growth (recent window vs prior window), ratio. Null = unknown. */
  tradeGrowthRatio: number | null;
  /** Volume growth (recent window vs prior window), ratio. Null = unknown. */
  volumeGrowthRatio: number | null;
  /** Price change over the corresponding period, percent. Null = unknown. */
  priceChangePct: number | null;
  /** Participation breadth from the scanner, when fresh enough to use. */
  breadth: "BROAD" | "MODERATE" | "NARROW" | "UNKNOWN" | null;
}

export interface DivergenceResult {
  state: DivergenceState;
  detail: {
    activityGrowthRatio: number | null;
    priceChangePct: number | null;
    breadth: string | null;
    basis: string;
  };
}

/**
 * Attention/participation accelerating faster than price is constructive;
 * price accelerating while participation fails to broaden is not. Divergence
 * alone never determines the Entry State — it is one input among four.
 * Missing inputs stay UNKNOWN and are never treated as negative.
 */
export function classifyDivergence(input: DivergenceInput): DivergenceResult {
  const growthCandidates = [input.tradeGrowthRatio, input.volumeGrowthRatio].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
  const activityGrowthRatio = growthCandidates.length
    ? Math.round((growthCandidates.reduce((a, b) => a + b, 0) / growthCandidates.length) * 100) / 100
    : null;
  const priceChangePct =
    typeof input.priceChangePct === "number" && Number.isFinite(input.priceChangePct)
      ? input.priceChangePct
      : null;

  const detail = {
    activityGrowthRatio,
    priceChangePct,
    breadth: input.breadth ?? null,
    basis: "activity growth vs price change over the same window",
  };

  if (activityGrowthRatio === null || priceChangePct === null) {
    return { state: "UNKNOWN", detail };
  }

  const activityPct = (activityGrowthRatio - 1) * 100;
  const narrow = input.breadth === "NARROW";
  const broad = input.breadth === "BROAD";

  if (activityPct >= 25 && activityPct - priceChangePct >= 25 && !narrow) {
    return { state: "POSITIVE", detail };
  }
  if (priceChangePct >= 25 && (activityPct <= 0 || narrow)) {
    return { state: "NEGATIVE", detail };
  }
  if (broad && activityPct >= 10 && priceChangePct <= 10) return { state: "POSITIVE", detail };
  return { state: "NEUTRAL", detail };
}

/**
 * Operational gates re-checked immediately before an Entry evaluation.
 * These are current-time reads; they never rewrite call-time history.
 */
export interface EntryEligibilityInput {
  researchEligibleNow: boolean;
  universe: string | null;
  structural: string | null;
  marketDamage: "PASS" | "FAIL" | "UNKNOWN";
  marketObservationValid: boolean;
  marketEvidenceAgeMinutes: number | null;
  maxMarketAgeMinutes?: number;
}

export interface EntryEligibilityResult {
  actionable: boolean;
  evidenceUsable: boolean;
  reasons: string[];
}

export const ENTRY_MAX_MARKET_AGE_MINUTES = 30;

export function assessEntryEligibility(input: EntryEligibilityInput): EntryEligibilityResult {
  const reasons: string[] = [];
  const maxAge = input.maxMarketAgeMinutes ?? ENTRY_MAX_MARKET_AGE_MINUTES;

  const stale =
    input.marketEvidenceAgeMinutes === null || input.marketEvidenceAgeMinutes > maxAge;
  const evidenceUsable = input.marketObservationValid && !stale;
  if (!input.marketObservationValid) reasons.push("CURRENT_MARKET_OBSERVATION_INVALID");
  if (stale) reasons.push("CURRENT_MARKET_EVIDENCE_STALE");

  if (!input.researchEligibleNow) reasons.push("NOT_RESEARCH_ELIGIBLE_NOW");
  if (input.universe === "OUT_OF_SCOPE") reasons.push("UNIVERSE_OUT_OF_SCOPE");
  if (input.structural === "FAIL") reasons.push("STRUCTURAL_FAIL");
  if (input.marketDamage === "FAIL") reasons.push("RECENT_MARKET_DAMAGE_FAIL");

  return { actionable: reasons.length === 0, evidenceUsable, reasons };
}

/**
 * v1.1 composite collapse override.
 *
 * A single coarse constructive feature (a "higher low" read off two sparse
 * observations) must never outrank catastrophic damage confirmed across
 * several INDEPENDENT dimensions. Only dimensions with actual evidence count —
 * a missing input is never damage, so missing data still routes to UNKNOWN.
 */
export interface EntryDamageInput {
  drawdownFromHighPct: number | null;
  riseFromLowPct: number | null;
  volumeTrendRatio: number | null;
  liquidityUsd: number | null;
  reclaimHolding: boolean;
  /** Candle-grade reclaim/higher-low evidence is ignored at COARSE resolution. */
  resolution: TimingResolution;
}

export interface EntryDamageResult {
  collapsed: boolean;
  dimensions: string[];
  reasons: string[];
}

export const ENTRY_DAMAGE = {
  deepDrawdownPct: -80,
  severeDrawdownPct: -60,
  collapsedVolumeRatio: 0.1,
  weakVolumeRatio: 0.25,
  veryLowLiquidityUsd: 5_000,
  lowLiquidityUsd: 15_000,
  meaningfulRecoveryPct: 30,
} as const;

export function assessEntryDamage(input: EntryDamageInput): EntryDamageResult {
  const dimensions: string[] = [];
  const reasons: string[] = [];

  const dd = input.drawdownFromHighPct;
  if (dd !== null && dd <= ENTRY_DAMAGE.deepDrawdownPct) {
    dimensions.push("DEEP_DRAWDOWN_FROM_WINDOW_HIGH");
    reasons.push(`DRAWDOWN_${dd.toFixed(1)}PCT`);
  } else if (dd !== null && dd <= ENTRY_DAMAGE.severeDrawdownPct) {
    dimensions.push("SEVERE_DRAWDOWN_FROM_WINDOW_HIGH");
    reasons.push(`DRAWDOWN_${dd.toFixed(1)}PCT`);
  }

  const vr = input.volumeTrendRatio;
  if (vr !== null && vr <= ENTRY_DAMAGE.collapsedVolumeRatio) {
    dimensions.push("COLLAPSED_RELATIVE_VOLUME");
    reasons.push(`VOLUME_TREND_${vr.toFixed(2)}X`);
  } else if (vr !== null && vr <= ENTRY_DAMAGE.weakVolumeRatio) {
    dimensions.push("SEVERELY_REDUCED_RELATIVE_VOLUME");
    reasons.push(`VOLUME_TREND_${vr.toFixed(2)}X`);
  }

  const liq = input.liquidityUsd;
  if (liq !== null && liq < ENTRY_DAMAGE.veryLowLiquidityUsd) {
    dimensions.push("VERY_LOW_LIQUIDITY");
    reasons.push(`LIQUIDITY_${Math.round(liq)}USD`);
  } else if (liq !== null && liq < ENTRY_DAMAGE.lowLiquidityUsd) {
    dimensions.push("LOW_LIQUIDITY");
    reasons.push(`LIQUIDITY_${Math.round(liq)}USD`);
  }

  // Lack of meaningful recovery only counts when there IS a measured drawdown.
  const reclaimUsable = supportsCandleGradeClaims(input.resolution) && input.reclaimHolding;
  if (
    dd !== null &&
    dd <= ENTRY_DAMAGE.severeDrawdownPct &&
    input.riseFromLowPct !== null &&
    input.riseFromLowPct < ENTRY_DAMAGE.meaningfulRecoveryPct &&
    !reclaimUsable
  ) {
    dimensions.push("NO_MEANINGFUL_RECOVERY");
    reasons.push(`RISE_FROM_LOW_${input.riseFromLowPct.toFixed(1)}PCT`);
  }

  // Composite rule: catastrophic damage requires at least one severe dimension
  // plus corroboration from a second independent dimension.
  const severe = dimensions.some((d) =>
    ["DEEP_DRAWDOWN_FROM_WINDOW_HIGH", "COLLAPSED_RELATIVE_VOLUME", "VERY_LOW_LIQUIDITY"].includes(d),
  );
  const collapsed = severe && dimensions.length >= 2;
  return { collapsed, dimensions, reasons };
}

export interface EntryMappingInput {
  components: EntryComponentScores;
  total: number;
  /** Deterministic structural read of the current chart. */
  structureVerdict: "CONSTRUCTIVE" | "NEUTRAL" | "DETERIORATING" | "BROKEN" | "UNKNOWN";
  /** How stretched price is versus its recent base. */
  extensionVerdict: "RESET" | "MODERATE" | "STRETCHED" | "PARABOLIC" | "UNKNOWN";
  /** Number of independent confirmations observed (structure, flow, risk, divergence). */
  confirmations: number;
  divergence: DivergenceState;
  /** False when current market evidence is missing or stale. */
  evidenceUsable: boolean;
  /** Confirmed catastrophic recent damage. */
  damageFail: boolean;
  /** Enough candle history to make a structural judgement at all. */
  hasStructuralHistory: boolean;
  /** v1.1: resolution of the timing evidence behind the components. */
  resolution?: TimingResolution;
  /** v1.1: composite collapse evidence. */
  damage?: EntryDamageResult;
}

export interface EntryMappingResult {
  state: EntryStateV1;
  reasons: string[];
}

/**
 * Explicit evidence → state mapping. The score alone NEVER decides the state:
 * every branch requires a qualitative condition as well, and BUY_ZONE requires
 * multiple independent confirmations.
 */
export function mapEntryState(input: EntryMappingInput): EntryMappingResult {
  const reasons: string[] = [];

  if (!input.evidenceUsable || !input.hasStructuralHistory) {
    reasons.push(
      !input.evidenceUsable ? "CURRENT_EVIDENCE_UNUSABLE" : "INSUFFICIENT_PRICE_HISTORY",
    );
    return { state: "UNKNOWN", reasons };
  }

  if (input.structureVerdict === "BROKEN") {
    return { state: "BROKEN", reasons: ["MARKET_STRUCTURE_BROKEN"] };
  }

  // Confirmed catastrophic current damage can never be an actionable entry.
  if (input.damageFail) {
    return { state: "BROKEN", reasons: ["RECENT_MARKET_DAMAGE_FAIL"] };
  }

  // v1.1 collapse override: multi-dimensional confirmed damage outranks any
  // single constructive feature. Only real negative evidence reaches here.
  if (input.damage?.collapsed) {
    return {
      state: "BROKEN",
      reasons: [
        "COLLAPSE_OVERRIDE_MULTI_DIMENSIONAL_DAMAGE",
        ...input.damage.dimensions,
        ...input.damage.reasons,
      ],
    };
  }

  if (input.extensionVerdict === "PARABOLIC" || input.components.extension <= 0.5) {
    return { state: "EXTENDED", reasons: ["ENTRY_REQUIRES_CHASING"] };
  }

  const coarse = input.resolution !== undefined && !supportsCandleGradeClaims(input.resolution);

  if (
    input.total >= 7.5 &&
    input.structureVerdict === "CONSTRUCTIVE" &&
    (input.extensionVerdict === "RESET" || input.extensionVerdict === "MODERATE") &&
    input.components.riskDefinition >= 1.5 &&
    input.confirmations >= 3 &&
    input.divergence !== "NEGATIVE"
  ) {
    if (!coarse) {
      return { state: "BUY_ZONE", reasons: ["MULTIPLE_CONFIRMATIONS_WITH_DEFINED_RISK"] };
    }
    // v1.1 resolution gate: coarse observations cannot prove candle-grade
    // entry structure, so BUY_ZONE is unavailable. Cap at SETTING_UP only when
    // the broad evidence genuinely supports constructive timing.
    const broadlyConstructive =
      input.structureVerdict === "CONSTRUCTIVE" && input.components.volumeFlow >= 1;
    return {
      state: broadlyConstructive ? "SETTING_UP" : "WATCH",
      reasons: [
        "BUY_ZONE_REQUIRES_HIGH_RESOLUTION",
        broadlyConstructive
          ? "BROAD_EVIDENCE_SUPPORTS_CONSTRUCTIVE_TIMING"
          : "BROAD_EVIDENCE_INSUFFICIENT_FOR_CONSTRUCTIVE_TIMING",
      ],
    };
  }

  if (
    input.total >= 6 &&
    (input.structureVerdict === "CONSTRUCTIVE" || input.structureVerdict === "NEUTRAL") &&
    input.confirmations >= 2
  ) {
    return { state: "SETTING_UP", reasons: ["CONDITIONS_IMPROVING_WITHOUT_FULL_CONFIRMATION"] };
  }

  // v1.1: a single severe damage dimension is not enough to call the setup
  // BROKEN, but it does disqualify "reasonable" timing.
  const severeSingleDamage = (input.damage?.dimensions ?? []).some((d) =>
    /^(DEEP_DRAWDOWN|COLLAPSED_RELATIVE_VOLUME|VERY_LOW_LIQUIDITY)/.test(d),
  );

  if (
    input.total >= 4.5 &&
    input.structureVerdict !== "DETERIORATING" &&
    input.components.riskDefinition >= 1 &&
    input.components.volumeFlow >= 0.5 &&
    !severeSingleDamage
  ) {
    return { state: "ACCEPTABLE", reasons: ["REASONABLE_BUT_NOT_UNUSUALLY_ATTRACTIVE"] };
  }

  if (input.extensionVerdict === "STRETCHED" && input.components.structure <= 1) {
    return { state: "EXTENDED", reasons: ["PRICE_FAR_FROM_DEFENSIBLE_BASE"] };
  }

  reasons.push("NO_CURRENT_ENTRY_TRIGGER");
  return { state: "WATCH", reasons };
}
