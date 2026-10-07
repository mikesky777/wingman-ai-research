/**
 * learning_decision_event/v1 + learning_feature_snapshot/v1
 *
 * EVALUATION-ONLY projection of what Wingman knew at T0 for one production
 * decision. Pure module: no I/O, no outcome reads, no provider calls.
 * Production stages must never import this layer (enforced by tests).
 */

export const LEARNING_EVENT_VERSION = "learning_decision_event/v1";
export const LEARNING_FEATURE_VERSION = "learning_feature_snapshot/v1";
export const LEARNING_PROJECTION_VERSION = "learning_projection/v1";

export type LearningFunnelStage =
  | "SCANNER_CANDIDATE"
  | "AI_TRIAGE"
  | "DEEP_RESEARCH"
  | "THESIS_SYNTHESIZED"
  | "ENTRY_EVALUATED";

export type FeatureStatus =
  | "OBSERVED"
  | "UNAVAILABLE"
  | "NOT_EVALUATED"
  | "NOT_APPLICABLE"
  | "UNRESOLVED";

export type ProjectionMode = "LIVE_DECISION_PROJECTION" | "HISTORICAL_FROZEN_ARTIFACT_PROJECTION";

export type EntryPopulationClass =
  | "CANONICAL_POST_THESIS_CALL"
  | "LEGACY_DIAGNOSTIC_PRE_THESIS_CALL_GATE"
  | "CALIBRATION";

export type FeatureValueType = "number" | "text" | "boolean";

export const FEATURE_KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\/v([0-9]+)$/;

export function featureSemanticVersion(key: string): number {
  const match = FEATURE_KEY_PATTERN.exec(key);
  if (!match) throw new Error(`Invalid learning feature key (expected <domain>.<feature>/v<major>): ${key}`);
  const version = Number(match[1]);
  if (!Number.isInteger(version) || version < 1) throw new Error(`Feature semantic version required: ${key}`);
  return version;
}

/** Words that may never appear in a decision-time feature key (outcome firewall). */
export const OUTCOME_KEY_DENYLIST = [
  "return",
  "peak",
  "maxdd",
  "drawdown",
  "time_to_peak",
  "ttp",
  "survival",
  "outcome",
  "win",
  "loss",
  "later_",
  "future",
];

export function assertNotOutcomeKey(key: string): void {
  const feature = key.split("/")[0].toLowerCase();
  for (const word of OUTCOME_KEY_DENYLIST) {
    if (feature.includes(word)) throw new Error(`OUTCOME_FIREWALL: feature key ${key} looks outcome-derived`);
  }
}

export interface LearningDecisionEvent {
  schemaVersion: typeof LEARNING_EVENT_VERSION;
  sourceEventId: string;
  sourceArtifactType: string;
  sourceArtifactVersion: string | null;
  funnelStage: LearningFunnelStage;
  tokenId: string | null;
  contractAddress: string;
  chain: string;
  attributionStatus: "RESOLVED_MINT" | "UNRESOLVED_TOKEN_ATTRIBUTION";
  decisionAt: string;
  scanRunId: string | null;
  triageRunId: string | null;
  deepResearchRunId: string | null;
  thesisReportId: string | null;
  entryEvaluationId: string | null;
  productionCycleRunId: string | null;
  cohortRef: string | null;
  productionPolicyVersion: string | null;
  inputSchemaVersion: string | null;
  populationClass: string | null;
  projectionVersion: string;
  projectionMode: ProjectionMode;
}

export interface LearningFeature {
  featureKey: string;
  featureSemanticVersion: number;
  valueNumber: number | null;
  valueText: string | null;
  valueBoolean: boolean | null;
  status: FeatureStatus;
  observedAt: string | null;
  capturedAt: string | null;
  source: string;
  sourceReference: string;
  affiliation: string | null;
  collectionHealth: string | null;
}

export interface FeatureContext {
  source: string;
  sourceReference: string;
  /** Frozen artifact timestamp; must not be later than decision time. */
  observedAt: string | null;
  decisionAt: string;
}

/**
 * Build one typed scalar feature. `null`/`undefined`/non-finite values become
 * `missingStatus` (default UNAVAILABLE) — never zero. A real observed 0 stays
 * OBSERVED + 0.
 */
export function feature(
  key: string,
  type: FeatureValueType,
  raw: unknown,
  ctx: FeatureContext,
  opts: { missingStatus?: FeatureStatus; affiliation?: string | null; collectionHealth?: string | null } = {},
): LearningFeature {
  const version = featureSemanticVersion(key);
  assertNotOutcomeKey(key);
  if (ctx.observedAt && Date.parse(ctx.observedAt) > Date.parse(ctx.decisionAt)) {
    throw new Error(`DECISION_TIME_VIOLATION: ${key} observed after decision`);
  }
  let valueNumber: number | null = null;
  let valueText: string | null = null;
  let valueBoolean: boolean | null = null;
  if (type === "number" && raw !== null && raw !== undefined && raw !== "") {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) valueNumber = n;
  } else if (type === "text" && typeof raw === "string" && raw.trim() !== "") {
    valueText = raw;
  } else if (type === "boolean" && typeof raw === "boolean") {
    valueBoolean = raw;
  }
  const observed = valueNumber !== null || valueText !== null || valueBoolean !== null;
  return {
    featureKey: key,
    featureSemanticVersion: version,
    valueNumber,
    valueText,
    valueBoolean,
    status: observed ? "OBSERVED" : (opts.missingStatus ?? "UNAVAILABLE"),
    observedAt: observed ? ctx.observedAt : null,
    capturedAt: ctx.observedAt,
    source: ctx.source,
    sourceReference: ctx.sourceReference,
    affiliation: opts.affiliation ?? null,
    collectionHealth: opts.collectionHealth ?? null,
  };
}

/** Explicit non-observed feature (e.g. NOT_EVALUATED gate). */
export function statusFeature(key: string, status: Exclude<FeatureStatus, "OBSERVED">, ctx: FeatureContext): LearningFeature {
  return { ...feature(key, "text", null, ctx, { missingStatus: status }) };
}

export interface ProjectionResult {
  event: LearningDecisionEvent;
  features: LearningFeature[];
}
