/**
 * Calibration Experiment Tracks v1 — pure rules.
 *
 * `calibration_experiment/v1` is CALIBRATION ONLY. Nothing in this module can
 * create, mutate or promote a production decision.
 *
 * Hard rules encoded here:
 *   - Production is always the CONTROL. Control never re-derives a new
 *     decision from scratch beyond replaying the exact versioned production
 *     policy over the exact frozen decision-time artifact.
 *   - Challenger decisions read ONLY the frozen decision-time input contract
 *     `experiment_input/v1_allowlist_no_outcomes`. Outcome observations are
 *     structurally unreachable at decision time — they are joined afterwards,
 *     in the evaluation view only.
 *   - A challenger "call" is a SHADOW_CALL. The string THESIS_CALL is never
 *     produced here.
 *   - Repeated events of one exact mint stay grouped; they are never treated
 *     as independent samples and never split across a train/test boundary.
 */
import {
  OPPORTUNITY_GATE_VERSION,
  OPPORTUNITY_POLICY,
  evaluateIndependentOriginGate,
  type BearSeverity,
  type OpportunityPolicy,
  type ThesisVerdict,
} from "../research/thesis/contracts";
import type { ObservatoryEvent, HorizonMeasurement } from "./observatory";
import { coverageFor, summarizeObservatory, type ObservatoryKpis } from "./observatory";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export const EXPERIMENT_VERSION = "calibration_experiment/v1";
export const EXPERIMENT_INPUT_CONTRACT = "experiment_input/v1_allowlist_no_outcomes";

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

export type ExperimentType = "RETROSPECTIVE_BACKTEST" | "PROSPECTIVE_SHADOW";
export type ExperimentStatus = "DRAFT" | "RUNNING" | "COMPLETE" | "ARCHIVED";
export type PromotionState =
  | "NONE"
  | "CANDIDATE_FOR_PROSPECTIVE_SHADOW"
  | "PROPOSED_FOR_REVIEW";

export type VariantKey = "CONTROL" | "CHALLENGER_A" | "CHALLENGER_B" | "CHALLENGER_C";

export const VARIANT_ORDER: VariantKey[] = [
  "CONTROL",
  "CHALLENGER_A",
  "CHALLENGER_B",
  "CHALLENGER_C",
];

/** v1 supports the Thesis Call gate family only. */
export type ExperimentSourceStage = "THESIS_SYNTHESIZED";

export const EXPERIMENT_TYPE_LABEL: Record<ExperimentType, string> = {
  RETROSPECTIVE_BACKTEST: "RETROSPECTIVE — HYPOTHESIS GENERATING",
  PROSPECTIVE_SHADOW: "PROSPECTIVE SHADOW — PREDECLARED",
};

export interface ExperimentVariantSpec {
  key: VariantKey;
  label: string;
  /** Exact rule this challenger changes relative to control. */
  differsBy: ChallengerRule;
  description: string;
}

export interface ExperimentSpec {
  experimentId: string;
  name: string;
  hypothesis: string;
  createdAt: string | null;
  experimentVersion: string;
  experimentType: ExperimentType;
  status: ExperimentStatus;
  sourceStage: ExperimentSourceStage;
  sourcePolicyFilters: JsonRecord;
  populationDefinition: JsonRecord;
  populationSemantics: string;
  controlPolicy: JsonRecord;
  challengerVariants: ExperimentVariantSpec[];
  evaluationHorizons: string[];
  predeclared: boolean;
  shadowStartAt: string | null;
  promotionState: PromotionState;
  lastEvaluatedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Frozen decision input — deny-by-default
 * ------------------------------------------------------------------ */

export interface ExperimentFrozenInput {
  mint: string;
  thesisReportId: string;
  cohortId: string | null;
  sourceScanId: string | null;
  decisionAt: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: string | null;
  bearSeverity: string | null;
  /** The value the production gate reads. `null` = missing v1.1 semantics. */
  distinctIndependentEvidenceOrigins: number | null;
  /** DIAGNOSTIC_ONLY — never gated on. */
  independentSourceCount: number | null;
  primarySourceCount: number | null;
  /** Affirmative primary-source-verified evidence exists in the dossier. */
  verifiedPrimarySourceEvidence: boolean;
  /** Exactly what production recorded as operational eligibility. */
  operationallyEligible: boolean;
  setups: string[] | null;
  thesisPolicyVersion: string | null;
  rubricVersion: string | null;
  opportunityGateVersion: string;
}

/**
 * Every key a challenger decision may ever see. Anything else — return, peak,
 * drawdown, outcome, live state, sampler data — is structurally dropped, not
 * deleted after the fact.
 */
export const EXPERIMENT_INPUT_ALLOWLIST: (keyof ExperimentFrozenInput)[] = [
  "mint",
  "thesisReportId",
  "cohortId",
  "sourceScanId",
  "decisionAt",
  "thesisScore",
  "evidenceConfidence",
  "verdict",
  "bearSeverity",
  "distinctIndependentEvidenceOrigins",
  "independentSourceCount",
  "primarySourceCount",
  "verifiedPrimarySourceEvidence",
  "operationallyEligible",
  "setups",
  "thesisPolicyVersion",
  "rubricVersion",
  "opportunityGateVersion",
];

/** Deny-by-default projection into the frozen decision input contract. */
export function buildFrozenDecisionInput(
  raw: Record<string, unknown>,
): ExperimentFrozenInput {
  const out: Record<string, unknown> = {};
  for (const key of EXPERIMENT_INPUT_ALLOWLIST) {
    if (key in raw && raw[key] !== undefined) out[key] = raw[key];
  }
  out["opportunityGateVersion"] = OPPORTUNITY_GATE_VERSION;
  out["verifiedPrimarySourceEvidence"] = Boolean(out["verifiedPrimarySourceEvidence"]);
  out["operationallyEligible"] = Boolean(out["operationallyEligible"]);
  return out as unknown as ExperimentFrozenInput;
}

/* ------------------------------------------------------------------ *
 * Variant decisions
 * ------------------------------------------------------------------ */

export type ChallengerRule =
  | "NONE"
  | "INDEPENDENT_ORIGIN_GATE_REMOVED"
  | "INDEPENDENT_ORIGIN_GATE_HYBRID";

export type ProductionDecision = "CALL" | "NO_CALL" | "NOT_EVALUABLE";
export type ChallengerDecision = "SHADOW_CALL" | "NO_SHADOW_CALL" | "NOT_EVALUABLE";

export const HYBRID_MIN_EVIDENCE_CONFIDENCE = 60;

const SEVERITY_ORDER: Record<BearSeverity, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export interface VariantDecisionResult {
  variantKey: VariantKey;
  rule: ChallengerRule;
  decision: ProductionDecision | ChallengerDecision;
  failedGates: string[];
  independenceStatus: "PASS" | "FAIL" | "NOT_EVALUABLE";
}

/**
 * Shared non-independence gates. Identical for every variant — a challenger
 * may only alter the single rule it declares.
 */
function sharedGateFailures(input: ExperimentFrozenInput, policy: OpportunityPolicy): string[] {
  const failed: string[] = [];
  if (!input.operationallyEligible) failed.push("OPERATIONAL_ELIGIBILITY");
  if (
    input.verdict === null ||
    !policy.allowedVerdicts.includes(input.verdict as ThesisVerdict)
  ) {
    failed.push("VERDICT");
  }
  if (input.thesisScore === null || input.thesisScore < policy.minThesisScore) {
    failed.push("THESIS_SCORE");
  }
  if (
    input.evidenceConfidence === null ||
    input.evidenceConfidence < policy.minEvidenceConfidence
  ) {
    failed.push("EVIDENCE_CONFIDENCE");
  }
  const severity = input.bearSeverity as BearSeverity | null;
  if (
    severity === null ||
    SEVERITY_ORDER[severity] === undefined ||
    SEVERITY_ORDER[severity] > SEVERITY_ORDER[policy.maxBearSeverity]
  ) {
    failed.push("BEAR_SEVERITY");
  }
  return failed;
}

/**
 * CONTROL — replays the exact versioned production Opportunity gate over the
 * exact frozen artifact. It never invents a decision production did not make.
 */
export function evaluateControl(
  input: ExperimentFrozenInput,
  policy: OpportunityPolicy = OPPORTUNITY_POLICY,
): VariantDecisionResult {
  const gate = evaluateIndependentOriginGate(input, policy);
  const failed = sharedGateFailures(input, policy);
  if (gate.status !== "PASS") failed.push("INDEPENDENT_ORIGINS");
  const decision: ProductionDecision =
    failed.length === 0
      ? "CALL"
      : gate.status === "NOT_EVALUABLE" && failed.length === 1
        ? "NOT_EVALUABLE"
        : "NO_CALL";
  return {
    variantKey: "CONTROL",
    rule: "NONE",
    decision,
    failedGates: failed,
    independenceStatus: gate.status,
  };
}

/**
 * CHALLENGER — identical to control except for the single declared rule.
 * The output vocabulary is deliberately SHADOW_*: a calibration variant can
 * never emit a production THESIS_CALL.
 */
export function evaluateChallenger(
  variantKey: VariantKey,
  rule: ChallengerRule,
  input: ExperimentFrozenInput,
  policy: OpportunityPolicy = OPPORTUNITY_POLICY,
): VariantDecisionResult {
  const failed = sharedGateFailures(input, policy);
  const gate = evaluateIndependentOriginGate(input, policy);
  let independence: "PASS" | "FAIL" | "NOT_EVALUABLE" = gate.status;

  if (rule === "INDEPENDENT_ORIGIN_GATE_REMOVED") {
    independence = "PASS";
  } else if (rule === "INDEPENDENT_ORIGIN_GATE_HYBRID") {
    const origins = input.distinctIndependentEvidenceOrigins;
    if (typeof origins !== "number" || !Number.isFinite(origins)) {
      independence = "NOT_EVALUABLE";
    } else if (origins >= policy.minIndependentSources) {
      independence = "PASS";
    } else if (
      origins >= 1 &&
      input.verifiedPrimarySourceEvidence &&
      (input.evidenceConfidence ?? -1) >= HYBRID_MIN_EVIDENCE_CONFIDENCE
    ) {
      independence = "PASS";
    } else {
      independence = "FAIL";
    }
  }

  if (independence !== "PASS") failed.push("INDEPENDENT_ORIGINS");

  const decision: ChallengerDecision =
    failed.length === 0
      ? "SHADOW_CALL"
      : independence === "NOT_EVALUABLE" && failed.length === 1
        ? "NOT_EVALUABLE"
        : "NO_SHADOW_CALL";

  return { variantKey, rule, decision, failedGates: failed, independenceStatus: independence };
}

export function evaluateVariant(
  variant: ExperimentVariantSpec | { key: "CONTROL"; differsBy?: ChallengerRule },
  input: ExperimentFrozenInput,
  policy: OpportunityPolicy = OPPORTUNITY_POLICY,
): VariantDecisionResult {
  if (variant.key === "CONTROL") return evaluateControl(input, policy);
  return evaluateChallenger(
    variant.key,
    (variant as ExperimentVariantSpec).differsBy,
    input,
    policy,
  );
}

export const isCallDecision = (decision: string): boolean =>
  decision === "CALL" || decision === "SHADOW_CALL";

/* ------------------------------------------------------------------ *
 * Persisted results
 * ------------------------------------------------------------------ */

export interface ExperimentResultRow {
  id: string;
  experimentId: string;
  variantKey: VariantKey;
  sourceStage: ExperimentSourceStage;
  /** Stable key of the frozen production event (stage:artifactId). */
  eventKey: string;
  mint: string;
  cohortId: string | null;
  decisionAt: string | null;
  productionDecision: ProductionDecision;
  challengerDecision: ProductionDecision | ChallengerDecision;
  differs: boolean;
  differingRule: string | null;
  failedGates: string[];
  frozenInput: ExperimentFrozenInput;
  inputContractVersion: string;
  decidedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Evaluation — outcomes join ONLY here, after decisions exist
 * ------------------------------------------------------------------ */

export interface VariantEvaluation {
  variantKey: VariantKey;
  label: string;
  rule: ChallengerRule;
  eligibleN: number;
  callN: number;
  uniqueCallMints: number;
  notEvaluableN: number;
  kpis: ObservatoryKpis;
}

export interface SelectionOverlap {
  both: number;
  controlOnly: number;
  challengerOnly: number;
  neither: number;
  /** Event keys where the challenger differs from control. */
  differingEventKeys: string[];
}

export function computeSelectionOverlap(
  control: ExperimentResultRow[],
  challenger: ExperimentResultRow[],
): SelectionOverlap {
  const controlCalls = new Set(
    control.filter((r) => isCallDecision(r.challengerDecision)).map((r) => r.eventKey),
  );
  const challengerCalls = new Set(
    challenger.filter((r) => isCallDecision(r.challengerDecision)).map((r) => r.eventKey),
  );
  const keys = new Set([...control, ...challenger].map((r) => r.eventKey));
  const overlap: SelectionOverlap = {
    both: 0,
    controlOnly: 0,
    challengerOnly: 0,
    neither: 0,
    differingEventKeys: [],
  };
  for (const key of keys) {
    const c = controlCalls.has(key);
    const x = challengerCalls.has(key);
    if (c && x) overlap.both += 1;
    else if (c) overlap.controlOnly += 1;
    else if (x) overlap.challengerOnly += 1;
    else overlap.neither += 1;
    if (c !== x) overlap.differingEventKeys.push(key);
  }
  overlap.differingEventKeys.sort();
  return overlap;
}

/**
 * Join persisted variant decisions to independently persisted outcome
 * observations. This is the ONLY place outcomes are allowed to appear, and it
 * runs strictly after decisions are already stored.
 */
export function evaluateVariantOutcomes(
  variantKey: VariantKey,
  label: string,
  rule: ChallengerRule,
  rows: ExperimentResultRow[],
  eventsByKey: Map<string, ObservatoryEvent>,
  horizonKey: string,
): VariantEvaluation {
  const calls = rows.filter((r) => isCallDecision(r.challengerDecision));
  const measurable = calls
    .map((r) => eventsByKey.get(r.eventKey))
    .filter((e): e is ObservatoryEvent => !!e);
  return {
    variantKey,
    label,
    rule,
    eligibleN: rows.length,
    callN: calls.length,
    uniqueCallMints: new Set(calls.map((r) => r.mint)).size,
    notEvaluableN: rows.filter((r) => r.challengerDecision === "NOT_EVALUABLE").length,
    kpis: summarizeObservatory(measurable, horizonKey),
  };
}

export function coverageForVariant(
  rows: ExperimentResultRow[],
  eventsByKey: Map<string, ObservatoryEvent>,
  horizonKey: string,
) {
  const events = rows
    .filter((r) => isCallDecision(r.challengerDecision))
    .map((r) => eventsByKey.get(r.eventKey))
    .filter((e): e is ObservatoryEvent => !!e);
  return coverageFor(events, horizonKey);
}

/* ------------------------------------------------------------------ *
 * Exact-mint grouping (train/test safety)
 * ------------------------------------------------------------------ */

export interface MintGroup {
  mint: string;
  eventKeys: string[];
  decisions: number;
}

/**
 * Repeated events of one exact mint are correlated. Any future split must move
 * a whole group at once — Shrek #1 and Shrek #3 can never land on opposite
 * sides of a train/test boundary.
 */
export function groupResultsByMint(rows: ExperimentResultRow[]): MintGroup[] {
  const byMint = new Map<string, ExperimentResultRow[]>();
  for (const row of rows) byMint.set(row.mint, [...(byMint.get(row.mint) ?? []), row]);
  return [...byMint.entries()]
    .map(([mint, list]) => ({
      mint,
      eventKeys: [...new Set(list.map((r) => r.eventKey))].sort(),
      decisions: list.length,
    }))
    .sort((a, b) => a.mint.localeCompare(b.mint));
}

/* ------------------------------------------------------------------ *
 * Candidate-level diff view
 * ------------------------------------------------------------------ */

export interface DecisionDiffRow {
  eventKey: string;
  mint: string;
  symbol: string | null;
  cohortId: string | null;
  decisionAt: string | null;
  productionDecision: ProductionDecision;
  challengerDecision: ProductionDecision | ChallengerDecision;
  differingRule: string | null;
  /** VERIFIED INPUT — frozen at the production decision time. */
  frozenInput: ExperimentFrozenInput;
  /** EVALUATION OUTCOME — joined afterwards, never a decision input. */
  outcome: HorizonMeasurement | null;
}

export function buildDecisionDiffs(
  challengerRows: ExperimentResultRow[],
  eventsByKey: Map<string, ObservatoryEvent>,
  horizonKey: string,
): DecisionDiffRow[] {
  return challengerRows
    .filter((r) => r.differs)
    .map((r) => {
      const event = eventsByKey.get(r.eventKey);
      return {
        eventKey: r.eventKey,
        mint: r.mint,
        symbol: event?.symbol ?? null,
        cohortId: r.cohortId,
        decisionAt: r.decisionAt,
        productionDecision: r.productionDecision,
        challengerDecision: r.challengerDecision,
        differingRule: r.differingRule,
        frozenInput: r.frozenInput,
        outcome: event?.horizons[horizonKey] ?? null,
      };
    })
    .sort((a, b) => (b.decisionAt ?? "").localeCompare(a.decisionAt ?? ""));
}

/* ------------------------------------------------------------------ *
 * Prospective shadow window
 * ------------------------------------------------------------------ */

/**
 * A prospective shadow track begins at its declared activation time. Events
 * decided before activation are never backfilled into it.
 */
export function isWithinShadowWindow(spec: ExperimentSpec, decisionAt: string | null): boolean {
  if (spec.experimentType !== "PROSPECTIVE_SHADOW") return true;
  if (!spec.shadowStartAt) return false;
  if (!decisionAt) return false;
  return Date.parse(decisionAt) >= Date.parse(spec.shadowStartAt);
}

export const RETROSPECTIVE_DISCLAIMER =
  "RETROSPECTIVE — HYPOTHESIS GENERATING. A replay over frozen historical artifacts describes what a challenger would have selected. It is not prospective validation and does not establish that a challenger is better.";

export const PROMOTION_NOTE =
  "Promotion to production is a separate deliberate, versioned action outside Calibration. Nothing here can change production policy.";

/* ------------------------------------------------------------------ *
 * Phase 2B.1 — historical semantics compatibility
 * ------------------------------------------------------------------ */

export type ExperimentCompatibility =
  | "COMPATIBLE"
  | "NOT_EVALUABLE_FOR_EXPERIMENT_VERSION";

export interface CompatibilityVerdict {
  status: ExperimentCompatibility;
  reason: string | null;
}

/**
 * A retrospective challenger may only evaluate an artifact whose FROZEN
 * content already contained the semantics the rule needs. Current semantics
 * are never reconstructed backwards into an older artifact.
 */
export function classifyExperimentCompatibility(
  input: ExperimentFrozenInput,
  rules: ChallengerRule[],
): CompatibilityVerdict {
  const needsOrigins = rules.some(
    (r) =>
      r === "INDEPENDENT_ORIGIN_GATE_REMOVED" || r === "INDEPENDENT_ORIGIN_GATE_HYBRID",
  );
  if (needsOrigins) {
    const origins = input.distinctIndependentEvidenceOrigins;
    if (typeof origins !== "number" || !Number.isFinite(origins)) {
      return {
        status: "NOT_EVALUABLE_FOR_EXPERIMENT_VERSION",
        reason: "MISSING_FROZEN_DISTINCT_INDEPENDENT_EVIDENCE_ORIGINS",
      };
    }
  }
  return { status: "COMPATIBLE", reason: null };
}

/* ------------------------------------------------------------------ *
 * Phase 2B.1 — gate masking decomposition + informativeness
 * ------------------------------------------------------------------ */

export const OTHER_GATE_KEYS = [
  "THESIS_SCORE",
  "EVIDENCE_CONFIDENCE",
  "VERDICT",
  "BEAR_SEVERITY",
  "OPERATIONAL_ELIGIBILITY",
] as const;
export type OtherGateKey = (typeof OTHER_GATE_KEYS)[number];

export const GATE_LABEL: Record<string, string> = {
  THESIS_SCORE: "Thesis Score >=70",
  EVIDENCE_CONFIDENCE: "Evidence Confidence >=60",
  VERDICT: "Verdict allowed",
  BEAR_SEVERITY: "Bear severity <=MODERATE",
  OPERATIONAL_ELIGIBILITY: "Operationally eligible",
  INDEPENDENT_ORIGINS: "Distinct independent origins >=2",
};

export interface GateFunnel {
  variantKey: VariantKey;
  rule: ChallengerRule;
  /** Compatible frozen events in the experiment denominator. */
  eligibleFrozenEvents: number;
  /** Events where the challenger's independence verdict differs from control. */
  changedRuleCandidates: number;
  /** Changed-rule events that pass every other gate — the rule can decide. */
  treatmentExposure: number;
  /** Changed-rule events blocked anyway by a different gate. */
  maskedByOtherGates: number;
  /** Among changed-rule events, how many pass each other gate. */
  passCounts: Record<OtherGateKey, number>;
  /** Among masked events, how often each other gate is the blocker. */
  maskCounts: Record<string, number>;
  primaryMask: string | null;
  finalShadowCalls: number;
  decisionDifferences: number;
}

export function buildGateFunnel(
  controlRows: ExperimentResultRow[],
  challengerRows: ExperimentResultRow[],
  rule: ChallengerRule,
  variantKey: VariantKey,
): GateFunnel {
  const controlByKey = new Map(controlRows.map((r) => [r.eventKey, r]));
  const passCounts = Object.fromEntries(OTHER_GATE_KEYS.map((k) => [k, 0])) as Record<
    OtherGateKey,
    number
  >;
  const maskCounts: Record<string, number> = {};

  let changed = 0;
  let exposure = 0;
  let masked = 0;

  for (const row of challengerRows) {
    const control = controlByKey.get(row.eventKey);
    if (!control) continue;
    const controlBlocked = control.failedGates.includes("INDEPENDENT_ORIGINS");
    const challengerBlocked = row.failedGates.includes("INDEPENDENT_ORIGINS");
    if (controlBlocked === challengerBlocked) continue;
    changed += 1;

    const others = row.failedGates.filter((g) => g !== "INDEPENDENT_ORIGINS");
    for (const key of OTHER_GATE_KEYS) if (!others.includes(key)) passCounts[key] += 1;
    if (others.length === 0) {
      exposure += 1;
    } else {
      masked += 1;
      for (const g of others) maskCounts[g] = (maskCounts[g] ?? 0) + 1;
    }
  }

  const primaryMask =
    Object.entries(maskCounts).sort(
      (a, b) =>
        b[1] - a[1] ||
        OTHER_GATE_KEYS.indexOf(a[0] as OtherGateKey) -
          OTHER_GATE_KEYS.indexOf(b[0] as OtherGateKey),
    )[0]?.[0] ?? null;

  return {
    variantKey,
    rule,
    eligibleFrozenEvents: controlRows.length,
    changedRuleCandidates: changed,
    treatmentExposure: exposure,
    maskedByOtherGates: masked,
    passCounts,
    maskCounts,
    primaryMask,
    finalShadowCalls: challengerRows.filter((r) => isCallDecision(r.challengerDecision)).length,
    decisionDifferences: challengerRows.filter((r) => r.differs).length,
  };
}

export type InterpretationState =
  | "INFORMATIVE"
  | "NO_TREATMENT_EXPOSURE"
  | "MASKED_BY_OTHER_GATES"
  | "INSUFFICIENT_COMPATIBLE_DATA"
  | "INSUFFICIENT_OUTCOME_COVERAGE";

/** Minimum compatible frozen events before a replay says anything at all. */
export const MIN_COMPATIBLE_EVENTS = 5;

export interface ExperimentInterpretation {
  state: InterpretationState;
  primaryMask: string | null;
  /** Plain diagnostic sentence. Never a performance claim. */
  detail: string;
}

/**
 * Calibration diagnostics only. These states describe whether the experiment
 * could observe anything — never whether a rule is good or bad.
 */
export function interpretExperiment(args: {
  funnel: GateFunnel;
  compatibleEvents: number;
  measuredOutcomes: number;
}): ExperimentInterpretation {
  const { funnel, compatibleEvents, measuredOutcomes } = args;
  const mask = funnel.primaryMask;
  const maskLabel = mask ? (GATE_LABEL[mask] ?? mask) : null;

  if (compatibleEvents < MIN_COMPATIBLE_EVENTS) {
    return {
      state: "INSUFFICIENT_COMPATIBLE_DATA",
      primaryMask: mask,
      detail: `Only ${compatibleEvents} frozen events carry the semantics this challenger needs.`,
    };
  }
  if (funnel.changedRuleCandidates === 0) {
    return {
      state: "NO_TREATMENT_EXPOSURE",
      primaryMask: mask,
      detail: "The challenger rule never changed its own gate verdict on this population.",
    };
  }
  if (funnel.treatmentExposure === 0) {
    return {
      state: "MASKED_BY_OTHER_GATES",
      primaryMask: mask,
      detail: `The rule changed on ${funnel.changedRuleCandidates} events, but every one was blocked anyway${
        maskLabel ? ` — most often by ${maskLabel}` : ""
      }. No treatment exposure.`,
    };
  }
  if (funnel.decisionDifferences > 0 && measuredOutcomes === 0) {
    return {
      state: "INSUFFICIENT_OUTCOME_COVERAGE",
      primaryMask: mask,
      detail: `${funnel.decisionDifferences} decision differences exist, but no persisted outcome observations cover them yet.`,
    };
  }
  return {
    state: "INFORMATIVE",
    primaryMask: mask,
    detail: `${funnel.treatmentExposure} events were exposed to the changed rule and ${funnel.decisionDifferences} final decisions differ.`,
  };
}

export const INTERPRETATION_NOTE =
  "Interpretation states are calibration diagnostics describing whether an experiment could observe anything. They are not performance labels and do not say a rule is useful or useless.";
