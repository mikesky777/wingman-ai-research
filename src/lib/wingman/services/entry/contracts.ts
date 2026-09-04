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

export const ENTRY_POLICY_VERSION = "entry_state/v1";
export const ENTRY_FEATURE_VERSION = "entry_features/v1";

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

  if (input.extensionVerdict === "PARABOLIC" || input.components.extension <= 0.5) {
    return { state: "EXTENDED", reasons: ["ENTRY_REQUIRES_CHASING"] };
  }

  if (
    input.total >= 7.5 &&
    input.structureVerdict === "CONSTRUCTIVE" &&
    (input.extensionVerdict === "RESET" || input.extensionVerdict === "MODERATE") &&
    input.components.riskDefinition >= 1.5 &&
    input.confirmations >= 3 &&
    input.divergence !== "NEGATIVE"
  ) {
    return { state: "BUY_ZONE", reasons: ["MULTIPLE_CONFIRMATIONS_WITH_DEFINED_RISK"] };
  }

  if (
    input.total >= 6 &&
    (input.structureVerdict === "CONSTRUCTIVE" || input.structureVerdict === "NEUTRAL") &&
    input.confirmations >= 2
  ) {
    return { state: "SETTING_UP", reasons: ["CONDITIONS_IMPROVING_WITHOUT_FULL_CONFIRMATION"] };
  }

  if (
    input.total >= 4.5 &&
    input.structureVerdict !== "DETERIORATING" &&
    input.components.riskDefinition >= 1
  ) {
    return { state: "ACCEPTABLE", reasons: ["REASONABLE_BUT_NOT_UNUSUALLY_ATTRACTIVE"] };
  }

  if (input.extensionVerdict === "STRETCHED" && input.components.structure <= 1) {
    return { state: "EXTENDED", reasons: ["PRICE_FAR_FROM_DEFENSIBLE_BASE"] };
  }

  reasons.push("NO_CURRENT_ENTRY_TRIGGER");
  return { state: "WATCH", reasons };
}
