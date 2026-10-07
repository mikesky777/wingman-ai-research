/**
 * Learning projection persistence + Calibration read path (server-only).
 *
 * Reads ONLY frozen production artifacts (scan_candidates, ai_triage_decisions,
 * deep_research_reports, thesis_reports, entry_state_evaluations) and
 * outcome_enrollments METADATA (never outcome observations/metrics).
 * Writes only learning_* tables. Idempotent: identity-keyed upserts that
 * ignore duplicates, so re-runs never create or rewrite feature facts.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  projectDeepResearchReport,
  projectEntryEvaluation,
  projectScannerCandidate,
  projectThesisReport,
  projectTriageDecision,
} from "./adapters";
import {
  LEARNING_PROJECTION_VERSION,
  type LearningFunnelStage,
  type ProjectionMode,
  type ProjectionResult,
} from "./contracts";

type Row = Record<string, unknown>;
// The learning tables are newer than some generated type helpers; keep writes loosely typed.
const db = supabaseAdmin as unknown as { from: (t: string) => any };

const ENROLLMENT_META =
  "id, enrollment_type, sampling_policy_version, sampling_stratum, inclusion_probability, contract_address, scan_run_id, triage_run_id, funnel_stage";

async function enrollmentLink(result: ProjectionResult): Promise<Row | null> {
  const e = result.event;
  let q = db.from("outcome_enrollments").select(ENROLLMENT_META).eq("contract_address", e.contractAddress);
  if (e.funnelStage === "SCANNER_CANDIDATE" && e.scanRunId) q = q.eq("scan_run_id", e.scanRunId).like("funnel_stage", "SCANNER_%");
  else if (e.funnelStage === "AI_TRIAGE" && e.triageRunId) q = q.eq("triage_run_id", e.triageRunId).eq("funnel_stage", "AI_TRIAGE");
  else return null;
  const { data } = await q.order("created_at", { ascending: true }).limit(1);
  return (data?.[0] as Row) ?? null;
}

export async function persistProjection(result: ProjectionResult): Promise<{ eventId: string; features: number }> {
  const e = result.event;
  const link = await enrollmentLink(result);
  const eventRow = {
    schema_version: e.schemaVersion,
    source_event_id: e.sourceEventId,
    source_artifact_type: e.sourceArtifactType,
    source_artifact_version: e.sourceArtifactVersion,
    funnel_stage: e.funnelStage,
    token_id: e.tokenId,
    contract_address: e.contractAddress,
    chain: e.chain,
    attribution_status: e.attributionStatus,
    decision_at: e.decisionAt,
    scan_run_id: e.scanRunId,
    triage_run_id: e.triageRunId,
    deep_research_run_id: e.deepResearchRunId,
    thesis_report_id: e.thesisReportId,
    entry_evaluation_id: e.entryEvaluationId,
    production_cycle_run_id: e.productionCycleRunId,
    cohort_ref: e.cohortRef,
    production_policy_version: e.productionPolicyVersion,
    input_schema_version: e.inputSchemaVersion,
    population_class: e.populationClass,
    outcome_enrollment_id: link?.id ?? null,
    enrollment_type: link?.enrollment_type ?? null,
    sampling_policy_version: link?.sampling_policy_version ?? null,
    sampling_stratum: link?.sampling_stratum ?? null,
    inclusion_probability: link?.inclusion_probability ?? null,
    projection_version: e.projectionVersion,
    projection_mode: e.projectionMode,
  };
  const identity = "source_artifact_type,source_event_id,funnel_stage,projection_version";
  const up = await db.from("learning_decision_events").upsert(eventRow, { onConflict: identity, ignoreDuplicates: true });
  if (up.error) throw new Error(`learning event persist failed: ${up.error.message}`);
  const { data: existing, error } = await db
    .from("learning_decision_events")
    .select("id")
    .eq("source_artifact_type", e.sourceArtifactType)
    .eq("source_event_id", e.sourceEventId)
    .eq("funnel_stage", e.funnelStage)
    .eq("projection_version", e.projectionVersion)
    .single();
  if (error || !existing) throw new Error(`learning event lookup failed: ${error?.message}`);
  const rows = result.features.map((f) => ({
    learning_event_id: existing.id,
    source_event_id: e.sourceEventId,
    contract_address: e.contractAddress,
    token_id: e.tokenId,
    funnel_stage: e.funnelStage,
    decision_at: e.decisionAt,
    feature_key: f.featureKey,
    feature_semantic_version: f.featureSemanticVersion,
    value_number: f.valueNumber,
    value_text: f.valueText,
    value_boolean: f.valueBoolean,
    status: f.status,
    observed_at: f.observedAt,
    captured_at: f.capturedAt,
    source: f.source,
    source_reference: f.sourceReference,
    affiliation: f.affiliation,
    collection_health: f.collectionHealth,
    production_policy_version: e.productionPolicyVersion,
    projection_version: e.projectionVersion,
  }));
  if (rows.length) {
    const fr = await db.from("learning_feature_snapshots").upsert(rows, {
      onConflict: "source_event_id,funnel_stage,feature_key,feature_semantic_version,projection_version",
      ignoreDuplicates: true,
    });
    if (fr.error) throw new Error(`learning feature persist failed: ${fr.error.message}`);
  }
  return { eventId: existing.id as string, features: rows.length };
}

/** Project one frozen artifact by id. Never touches providers or current state. */
export async function projectArtifact(
  stage: LearningFunnelStage,
  id: string,
  mode: ProjectionMode = "HISTORICAL_FROZEN_ARTIFACT_PROJECTION",
): Promise<{ eventId: string; features: number }> {
  const one = async (table: string, key = "id", value = id) => {
    const { data, error } = await db.from(table).select("*").eq(key, value).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Row | null;
  };
  let result: ProjectionResult;
  if (stage === "SCANNER_CANDIDATE") {
    const row = await one("scan_candidates");
    if (!row) throw new Error("scan candidate not found");
    const scan = await one("scan_runs", "id", String(row.scan_run_id));
    result = projectScannerCandidate(row, scan as never, mode);
  } else if (stage === "AI_TRIAGE") {
    const row = await one("ai_triage_decisions");
    if (!row) throw new Error("triage decision not found");
    result = projectTriageDecision(row, await one("ai_triage_runs", "id", String(row.triage_run_id)), mode);
  } else if (stage === "DEEP_RESEARCH") {
    const row = await one("deep_research_reports");
    if (!row) throw new Error("deep research report not found");
    result = projectDeepResearchReport(row, mode);
  } else if (stage === "THESIS_SYNTHESIZED") {
    const row = await one("thesis_reports");
    if (!row) throw new Error("thesis report not found");
    result = projectThesisReport(row, mode);
  } else {
    const row = await one("entry_state_evaluations");
    if (!row) throw new Error("entry evaluation not found");
    const thesis = row.thesis_report_id ? await one("thesis_reports", "id", String(row.thesis_report_id)) : null;
    result = projectEntryEvaluation(row, thesis, mode);
  }
  return persistProjection(result);
}

/** Read-only estimate for a separately-authorized historical backfill. */
export async function estimateHistoricalBackfill() {
  const count = async (table: string) => {
    const { count: n } = await db.from(table).select("id", { count: "exact", head: true });
    return n ?? 0;
  };
  const perStage = {
    SCANNER_CANDIDATE: { events: await count("scan_candidates"), featuresPerEvent: 33 },
    AI_TRIAGE: { events: await count("ai_triage_decisions"), featuresPerEvent: 12 },
    DEEP_RESEARCH: { events: await count("deep_research_reports"), featuresPerEvent: 20 },
    THESIS_SYNTHESIZED: { events: await count("thesis_reports"), featuresPerEvent: 21 },
    ENTRY_EVALUATED: { events: await count("entry_state_evaluations"), featuresPerEvent: 11 },
  };
  const events = Object.values(perStage).reduce((a, s) => a + s.events, 0);
  const features = Object.values(perStage).reduce((a, s) => a + s.events * s.featuresPerEvent, 0);
  return { projectionVersion: LEARNING_PROJECTION_VERSION, perStage, events, features, approxBytes: features * 400 + events * 600 };
}

export interface LearningQuery {
  learningEventId?: string;
  funnelStage?: LearningFunnelStage;
  featureKey?: string;
  contractAddress?: string;
  productionPolicyVersion?: string;
  cohortRef?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** Evaluation-only read API. No outcome joins, no statistics. */
export async function queryLearningFeatures(q: LearningQuery) {
  let fq = db.from("learning_feature_snapshots").select("*");
  if (q.learningEventId) fq = fq.eq("learning_event_id", q.learningEventId);
  if (q.funnelStage) fq = fq.eq("funnel_stage", q.funnelStage);
  if (q.featureKey) fq = fq.eq("feature_key", q.featureKey);
  if (q.contractAddress) fq = fq.eq("contract_address", q.contractAddress);
  if (q.productionPolicyVersion) fq = fq.eq("production_policy_version", q.productionPolicyVersion);
  if (q.from) fq = fq.gte("decision_at", q.from);
  if (q.to) fq = fq.lte("decision_at", q.to);
  const { data: features, error } = await fq.order("decision_at", { ascending: false }).limit(Math.min(q.limit ?? 500, 5000));
  if (error) throw new Error(error.message);
  const ids = [...new Set((features ?? []).map((f: Row) => f.learning_event_id as string))];
  let eq = db.from("learning_decision_events").select("*").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (q.cohortRef) eq = eq.eq("cohort_ref", q.cohortRef);
  const { data: events } = await eq;
  return { events: events ?? [], features: features ?? [] };
}
