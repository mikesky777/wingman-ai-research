/**
 * Wingman Sizing v1 — pure deterministic contracts.
 *
 * Sizing is the THIRD and final decision layer and is completely separate
 * from Thesis ("how compelling?") and Entry ("is now a good time?").
 * Sizing answers ONLY: "given both, how much exposure is justified?".
 *
 * Hard boundaries:
 *   - Never changes a Thesis Score, Thesis threshold or Entry State.
 *   - Never creates a THESIS_CALL and never places or connects execution.
 *   - No LLM. Every number here is reproducible from the inputs.
 *   - Percentages are of the dedicated Wingman STRATEGY BANKROLL, never of
 *     token supply and never of the user's net worth.
 *   - Lottery / speculative exposure is a separate future policy and is NOT
 *     implemented here.
 */

export const SIZING_POLICY_VERSION = "sizing/v1";

/* ------------------------------------------------------------------ */
/* Conviction bands                                                     */
/* ------------------------------------------------------------------ */

export interface ConvictionBand {
  /** Band identifier persisted with every recommendation. */
  id: "PASS" | "B50_59" | "B60_69" | "B70_79" | "B80_89" | "B90_100";
  label: string;
  /** Inclusive lower Thesis Score of the band. */
  scoreMin: number;
  /** Inclusive upper Thesis Score of the band. */
  scoreMax: number;
  /** Allocation floor of the band, percent of strategy bankroll. */
  allocMin: number;
  /** Allocation ceiling of the band, percent of strategy bankroll. */
  allocMax: number;
  note?: string;
}

export const CONVICTION_BANDS: readonly ConvictionBand[] = [
  {
    id: "PASS",
    label: "PASS / LOTTERY ONLY",
    scoreMin: 0,
    scoreMax: 49,
    allocMin: 0,
    allocMax: 0,
    note: "No thesis-sized position. Lottery exposure is a separate policy.",
  },
  { id: "B50_59", label: "50–59", scoreMin: 50, scoreMax: 59, allocMin: 2, allocMax: 4 },
  { id: "B60_69", label: "60–69", scoreMin: 60, scoreMax: 69, allocMin: 4, allocMax: 7 },
  { id: "B70_79", label: "70–79", scoreMin: 70, scoreMax: 79, allocMin: 7, allocMax: 10 },
  { id: "B80_89", label: "80–89", scoreMin: 80, scoreMax: 89, allocMin: 10, allocMax: 15 },
  {
    id: "B90_100",
    label: "90–100",
    scoreMin: 90,
    scoreMax: 100,
    allocMin: 15,
    allocMax: 20,
    note: "RARE / exceptional conviction.",
  },
] as const;

export function bandForScore(score: number): ConvictionBand {
  const clamped = Math.min(100, Math.max(0, score));
  return (
    CONVICTION_BANDS.find((b) => clamped >= b.scoreMin && clamped <= b.scoreMax) ??
    CONVICTION_BANDS[0]!
  );
}

/** Round to two decimals — sizing must be exactly reproducible. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Deterministic within-band interpolation.
 *
 *   position = (score - scoreMin) / (scoreMax - scoreMin)
 *   raw      = allocMin + position * (allocMax - allocMin)
 *
 * So 70 → bottom of 7–10 (7.00%), 79 → top (10.00%), 84 → 12.22%.
 * The PASS band always interpolates to 0.
 */
export function interpolateWithinBand(score: number, band: ConvictionBand): number {
  if (band.allocMax === band.allocMin) return round2(band.allocMin);
  const span = band.scoreMax - band.scoreMin;
  const clamped = Math.min(band.scoreMax, Math.max(band.scoreMin, score));
  const position = span === 0 ? 0 : (clamped - band.scoreMin) / span;
  return round2(band.allocMin + position * (band.allocMax - band.allocMin));
}

/* ------------------------------------------------------------------ */
/* Structural / current-risk modifier                                   */
/* ------------------------------------------------------------------ */

export type StructuralRiskLevel =
  | "CLEAN"
  | "CONCERN"
  | "SIGNIFICANT_CONCERN"
  | "BORDERLINE"
  | "FATAL"
  | "UNKNOWN";

export const STRUCTURAL_MODIFIERS: Record<StructuralRiskLevel, number> = {
  CLEAN: 1.0,
  CONCERN: 0.75,
  SIGNIFICANT_CONCERN: 0.5,
  BORDERLINE: 0.25,
  FATAL: 0,
  /** Missing evidence is NEVER reinterpreted as clean. */
  UNKNOWN: 0.5,
};

/** Maps persisted scanner structural status strings onto the risk ladder. */
export function structuralRiskFromStatus(status: string | null): StructuralRiskLevel {
  if (!status) return "UNKNOWN";
  const s = status.toUpperCase();
  if (s === "PASS" || s === "CLEAN" || s === "OK") return "CLEAN";
  if (s === "CONCERN" || s === "WARN" || s === "WARNING") return "CONCERN";
  if (s === "SIGNIFICANT_CONCERN") return "SIGNIFICANT_CONCERN";
  if (s === "BORDERLINE") return "BORDERLINE";
  if (s === "FAIL" || s === "FATAL") return "FATAL";
  return "UNKNOWN";
}

/* ------------------------------------------------------------------ */
/* Evidence Confidence cap                                              */
/* ------------------------------------------------------------------ */

/**
 * Evidence Confidence is NOT a second Thesis Score. It can only ever REDUCE
 * exposure where evidence is materially weaker; it never adds conviction.
 * Production calls already require Evidence Confidence >= 60.
 */
export const EVIDENCE_CONFIDENCE_PRODUCTION_FLOOR = 60;

export function evidenceConfidenceCapMultiplier(confidence: number | null): {
  multiplier: number;
  reason: string | null;
} {
  if (confidence == null) return { multiplier: 0.5, reason: "EVIDENCE_CONFIDENCE_UNKNOWN" };
  if (confidence >= EVIDENCE_CONFIDENCE_PRODUCTION_FLOOR) return { multiplier: 1, reason: null };
  if (confidence >= 45) return { multiplier: 0.75, reason: "EVIDENCE_CONFIDENCE_BELOW_FLOOR" };
  return { multiplier: 0.5, reason: "EVIDENCE_CONFIDENCE_MATERIALLY_WEAK" };
}

/* ------------------------------------------------------------------ */
/* Entry deployment policy                                              */
/* ------------------------------------------------------------------ */

export type SizingEntryState =
  | "WATCH"
  | "SETTING_UP"
  | "BUY_ZONE"
  | "ACCEPTABLE"
  | "EXTENDED"
  | "BROKEN"
  | "UNKNOWN"
  | "NOT_EVALUATED";

export const BUY_ZONE_DEPLOYMENT_FRACTION = 0.65;
export const SETTING_UP_DEPLOYMENT_FRACTION = 0.25;
/** ACCEPTABLE is a tolerable but not optimal location: half a starter. */
export const ACCEPTABLE_DEPLOYMENT_FRACTION = 0.35;

export type PriceHistorySourceInput = "CANDLES" | "WINGMAN_OBSERVATIONS" | "NONE" | null;
export type TimingResolutionInput = "HIGH" | "COARSE" | "INSUFFICIENT" | null;

export interface DeploymentDecision {
  fraction: number;
  label: string;
  reasons: string[];
}

/**
 * Entry controls DEPLOY NOW only. It can never reduce max thesis allocation.
 * Defense in depth: a BUY_ZONE without CANDLES/HIGH provenance is rejected
 * even though Entry v1.1 should make that impossible.
 */
export function deploymentForEntry(input: {
  state: SizingEntryState;
  priceHistorySource: PriceHistorySourceInput;
  timingResolution: TimingResolutionInput;
  thesisScore: number | null;
}): DeploymentDecision {
  const strongThesis = (input.thesisScore ?? 0) >= 70;
  switch (input.state) {
    case "BUY_ZONE": {
      const provenanceOk =
        input.priceHistorySource === "CANDLES" && input.timingResolution === "HIGH";
      if (!provenanceOk) {
        return {
          fraction: 0,
          label: "NO_DEPLOYMENT",
          reasons: ["INVALID_BUY_ZONE_PROVENANCE"],
        };
      }
      return {
        fraction: BUY_ZONE_DEPLOYMENT_FRACTION,
        label: "INITIAL_DEPLOYMENT",
        reasons: ["ENTRY_BUY_ZONE_CONFIRMED", "RESERVE_HELD_FOR_ADDS"],
      };
    }
    case "SETTING_UP":
      return {
        fraction: SETTING_UP_DEPLOYMENT_FRACTION,
        label: "STARTER_ONLY",
        reasons: ["ENTRY_SETTING_UP_STARTER_ONLY"],
      };
    case "ACCEPTABLE":
      return {
        fraction: ACCEPTABLE_DEPLOYMENT_FRACTION,
        label: "STARTER_ONLY",
        reasons: ["ENTRY_ACCEPTABLE_PARTIAL_ONLY"],
      };
    case "EXTENDED":
      return {
        fraction: 0,
        label: "NO_DEPLOYMENT",
        reasons: strongThesis ? ["GOOD_THESIS_BAD_ENTRY"] : ["ENTRY_EXTENDED"],
      };
    case "WATCH":
      return { fraction: 0, label: "NO_DEPLOYMENT", reasons: ["ENTRY_WATCH_NO_TRIGGER"] };
    case "BROKEN":
      return { fraction: 0, label: "NO_DEPLOYMENT", reasons: ["ENTRY_BROKEN"] };
    case "UNKNOWN":
      return {
        fraction: 0,
        label: "NO_DEPLOYMENT",
        reasons: ["INSUFFICIENT_TIMING_EVIDENCE"],
      };
    case "NOT_EVALUATED":
    default:
      return {
        fraction: 0,
        label: "NO_DEPLOYMENT",
        reasons: ["ENTRY_NOT_EVALUATED", "INSUFFICIENT_TIMING_EVIDENCE"],
      };
  }
}

/* ------------------------------------------------------------------ */
/* Recommendation                                                       */
/* ------------------------------------------------------------------ */

export interface SizingInput {
  mint: string;
  thesisCallId: string | null;
  thesisReportId?: string | null;
  entryEvaluationId?: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  structuralStatus: string | null;
  /** Current operational eligibility. FAIL/blocked forces 0% exposure. */
  operationalStatus: "OPERATIONAL" | "BLOCKED" | "UNKNOWN";
  operationalReason?: string | null;
  entryState: SizingEntryState;
  priceHistorySource: PriceHistorySourceInput;
  timingResolution: TimingResolutionInput;
  isCalibration: boolean;
  calculatedAt?: string;
}

export interface SizingRecommendation {
  sizingPolicyVersion: string;
  mint: string;
  thesisCallId: string | null;
  thesisReportId: string | null;
  entryEvaluationId: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  convictionBand: ConvictionBand["id"];
  convictionBandLabel: string;
  rawInterpolatedMaxPct: number;
  structuralRisk: StructuralRiskLevel;
  structuralModifier: number;
  evidenceCapMultiplier: number;
  effectiveMaxAllocationPct: number;
  entryState: SizingEntryState;
  priceHistorySource: PriceHistorySourceInput;
  timingResolution: TimingResolutionInput;
  deploymentFraction: number;
  deploymentLabel: string;
  deployNowPct: number;
  reservePct: number;
  operationalStatus: SizingInput["operationalStatus"];
  reasonCodes: string[];
  isCalibration: boolean;
  calculatedAt: string;
}

/**
 * The whole of sizing/v1. Pure, deterministic, side-effect free.
 *
 *   band            = bandForScore(thesisScore)
 *   raw             = interpolateWithinBand(thesisScore, band)
 *   effectiveMax    = raw * structuralModifier * evidenceCap   (0 if blocked)
 *   deployNow       = effectiveMax * deploymentFraction(entry)
 *   reserve         = effectiveMax - deployNow
 */
export function computeSizing(input: SizingInput): SizingRecommendation {
  const reasons: string[] = [];
  const score = input.thesisScore;
  const band = bandForScore(score ?? 0);
  const rawMax = score == null ? 0 : interpolateWithinBand(score, band);
  if (score == null) reasons.push("THESIS_SCORE_UNAVAILABLE");
  if (band.id === "PASS") reasons.push("BELOW_THESIS_CONVICTION_FLOOR");

  const structuralRisk = structuralRiskFromStatus(input.structuralStatus);
  let structuralModifier = STRUCTURAL_MODIFIERS[structuralRisk];
  if (structuralRisk === "UNKNOWN") reasons.push("STRUCTURAL_EVIDENCE_MISSING");
  if (structuralRisk === "FATAL") reasons.push("STRUCTURAL_FATAL_NO_POSITION");

  const evidence = evidenceConfidenceCapMultiplier(input.evidenceConfidence);
  if (evidence.reason) reasons.push(evidence.reason);

  if (input.operationalStatus === "BLOCKED") {
    structuralModifier = 0;
    reasons.push("CURRENTLY_BLOCKED");
  } else if (input.operationalStatus === "UNKNOWN") {
    reasons.push("CURRENT_ELIGIBILITY_UNKNOWN");
  }

  const effectiveMax = round2(rawMax * structuralModifier * evidence.multiplier);

  const deployment = deploymentForEntry({
    state: input.entryState,
    priceHistorySource: input.priceHistorySource,
    timingResolution: input.timingResolution,
    thesisScore: score,
  });
  reasons.push(...deployment.reasons);

  const deployNow = round2(effectiveMax * deployment.fraction);
  const reserve = round2(effectiveMax - deployNow);

  return {
    sizingPolicyVersion: SIZING_POLICY_VERSION,
    mint: input.mint,
    thesisCallId: input.thesisCallId,
    thesisReportId: input.thesisReportId ?? null,
    entryEvaluationId: input.entryEvaluationId ?? null,
    thesisScore: score,
    evidenceConfidence: input.evidenceConfidence,
    convictionBand: band.id,
    convictionBandLabel: band.label,
    rawInterpolatedMaxPct: rawMax,
    structuralRisk,
    structuralModifier,
    evidenceCapMultiplier: evidence.multiplier,
    effectiveMaxAllocationPct: effectiveMax,
    entryState: input.entryState,
    priceHistorySource: input.priceHistorySource,
    timingResolution: input.timingResolution,
    deploymentFraction: deployment.fraction,
    deploymentLabel: deployment.label,
    deployNowPct: deployNow,
    reservePct: reserve,
    operationalStatus: input.operationalStatus,
    reasonCodes: [...new Set(reasons)],
    isCalibration: input.isCalibration,
    calculatedAt: input.calculatedAt ?? new Date().toISOString(),
  };
}

/** Human summary used by the UI; never affects the numbers. */
export function sizingHeadline(rec: SizingRecommendation): string {
  if (rec.operationalStatus === "BLOCKED") return "CURRENTLY BLOCKED — NO POSITION";
  if (rec.effectiveMaxAllocationPct === 0) return "NO THESIS-SIZED POSITION";
  if (rec.deployNowPct === 0) {
    return (rec.thesisScore ?? 0) >= 70 && rec.entryState === "EXTENDED"
      ? "STRONG THESIS — ENTRY EXTENDED"
      : "MAX ALLOCATION HELD — NO DEPLOYMENT NOW";
  }
  if (rec.deploymentLabel === "STARTER_ONLY") return "STARTER ONLY";
  return "INITIAL DEPLOYMENT";
}
