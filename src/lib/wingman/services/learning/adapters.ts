/**
 * Thin stage adapters: each maps an explicit allow-list of FROZEN artifact
 * fields to versioned feature keys. Adding a DB column never makes it a
 * learning feature. Pure — inputs are already-loaded artifact rows only.
 */
import { OPPORTUNITY_GATE_VERSION, OPPORTUNITY_POLICY } from "../research/thesis/contracts";
import {
  LEARNING_EVENT_VERSION,
  LEARNING_PROJECTION_VERSION,
  feature,
  statusFeature,
  type EntryPopulationClass,
  type FeatureContext,
  type LearningDecisionEvent,
  type LearningFeature,
  type LearningFunnelStage,
  type ProjectionMode,
  type ProjectionResult,
} from "./contracts";

// Frozen artifact rows are loosely typed; adapters read an explicit allow-list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
const arrLen = (v: unknown): number | null => (Array.isArray(v) ? v.length : null);

function baseEvent(
  stage: LearningFunnelStage,
  artifactType: string,
  row: Row,
  decisionAt: string,
  mode: ProjectionMode,
  extra: Partial<LearningDecisionEvent>,
): LearningDecisionEvent {
  const mint = str(row.contract_address) ?? str(row.mint) ?? "";
  return {
    schemaVersion: LEARNING_EVENT_VERSION,
    sourceEventId: String(row.id),
    sourceArtifactType: artifactType,
    sourceArtifactVersion: null,
    funnelStage: stage,
    tokenId: str(row.token_id),
    contractAddress: mint,
    chain: str(row.chain) ?? "solana",
    attributionStatus: mint ? "RESOLVED_MINT" : "UNRESOLVED_TOKEN_ATTRIBUTION",
    decisionAt,
    scanRunId: null,
    triageRunId: null,
    deepResearchRunId: null,
    thesisReportId: null,
    entryEvaluationId: null,
    productionCycleRunId: null,
    cohortRef: null,
    productionPolicyVersion: null,
    inputSchemaVersion: null,
    populationClass: null,
    projectionVersion: LEARNING_PROJECTION_VERSION,
    projectionMode: mode,
    ...extra,
  };
}

function ctxFor(table: string, row: Row, decisionAt: string): FeatureContext {
  return { source: table, sourceReference: `${table}:${String(row.id)}`, observedAt: decisionAt, decisionAt };
}

// ---------------------------------------------------------------- Scanner
export function projectScannerCandidate(
  row: Row,
  scan: { production_cycle_run_id?: string | null } | null,
  mode: ProjectionMode,
): ProjectionResult {
  const decisionAt = String(row.created_at);
  const ctx = ctxFor("scan_candidates", row, decisionAt);
  const pc = obj(row.priority_components) ?? {};
  const component = (name: string) => obj(pc[name])?.score ?? null;
  const n = (k: string, v: unknown) => feature(k, "number", v, ctx);
  const t = (k: string, v: unknown) => feature(k, "text", v, ctx);
  const features: LearningFeature[] = [
    t("scanner.setups/v1", Array.isArray(row.discovery_lanes) ? [...(row.discovery_lanes as string[])].sort().join(",") : null),
    n("scanner.token_age_minutes/v1", row.token_age_minutes),
    t("scanner.age_basis/v1", row.age_basis),
    n("market.market_cap_usd/v1", row.market_cap),
    n("market.liquidity_usd/v1", row.liquidity_usd),
    n("market.volume_24h_usd/v1", row.volume_24h),
    n("market.volume_1h_usd/v1", row.volume_1h),
    n("scanner.turnover_mcap_24h/v1", row.volume_to_market_cap_24h),
    n("scanner.turnover_liquidity_24h/v1", row.volume_to_liquidity_24h),
    t("scanner.activity_state/v1", row.activity_state),
    n("scanner.minutes_since_last_trade/v1", row.minutes_since_last_trade),
    t("scanner.persistence_signal/v1", row.persistence_signal),
    t("scanner.reacceleration_signal/v1", row.reacceleration_signal),
    t("scanner.extension_risk/v1", row.extension_risk),
    t("scanner.attention_price_divergence/v1", row.attention_price_divergence),
    t("participation.status/v1", row.participation_status),
    t("scanner.recurrence_state/v1", row.recurrence_state),
    n("scanner.scans_seen_count/v1", row.scans_seen_count),
    n("scanner.quant_priority/v1", row.quantitative_priority),
    n("scanner.qp_acceleration/v1", component("acceleration")),
    n("scanner.qp_activity_quality/v1", component("activityQuality")),
    n("scanner.qp_persistence/v1", component("persistence")),
    n("scanner.qp_reacceleration/v1", component("reacceleration")),
    n("scanner.qp_participation/v1", component("participation")),
    n("scanner.qp_turnover/v1", component("turnover")),
    n("scanner.qp_liquidity_quality/v1", component("liquidityQuality")),
    t("scanner.structural_status/v1", row.structural_status),
    t("scanner.price_integrity_status/v1", row.price_integrity_status),
    t("scanner.discovery_sources/v1", Array.isArray(row.discovery_sources) ? [...(row.discovery_sources as string[])].sort().join(",") : null),
    n("scanner.global_rank/v1", row.global_rank),
    // Non-advancement: existing semantics, namespaced, never reinterpreted.
    t("nonadvance.stage_reached/v1", row.stage_reached),
    feature("nonadvance.rejection_reason/v1", "text", row.rejection_reason, ctx, { missingStatus: "NOT_APPLICABLE" }),
    feature("nonadvance.lane_rejection_count/v1", "number", arrLen(row.lane_rejections) ?? (obj(row.lane_rejections) ? Object.keys(obj(row.lane_rejections)!).length : null), ctx, { missingStatus: "NOT_APPLICABLE" }),
  ];
  return {
    event: baseEvent("SCANNER_CANDIDATE", "scan_candidate", row, decisionAt, mode, {
      sourceArtifactVersion: str(row.scanner_version),
      scanRunId: str(row.scan_run_id),
      productionCycleRunId: scan?.production_cycle_run_id ?? null,
      cohortRef: row.scan_run_id ? `scan_runs:${row.scan_run_id}` : null,
      productionPolicyVersion: str(row.scanner_version),
    }),
    features,
  };
}

// ---------------------------------------------------------------- Triage
export function projectTriageDecision(row: Row, run: Row | null, mode: ProjectionMode): ProjectionResult {
  const decisionAt = String(row.created_at);
  const ctx = ctxFor("ai_triage_decisions", row, decisionAt);
  const n = (k: string, v: unknown) => feature(k, "number", v, ctx);
  const t = (k: string, v: unknown) => feature(k, "text", v, ctx);
  const features = [
    t("triage.decision/v1", row.decision), // SKIP / WATCH / DEEP_RESEARCH verbatim
    t("triage.confidence/v1", row.confidence),
    n("triage.quant_priority/v1", row.quant_priority),
    n("triage.quant_rank/v1", row.quant_rank),
    n("triage.triage_rank/v1", row.triage_rank),
    n("triage.rank_delta/v1", row.rank_delta),
    t("triage.setup/v1", row.setup),
    t("triage.price_structure/v1", row.price_structure),
    t("triage.participation/v1", row.participation),
    feature("triage.has_strongest_positive/v1", "boolean", row.strongest_positive == null ? null : Boolean(str(row.strongest_positive)), ctx),
    feature("triage.has_strongest_concern/v1", "boolean", row.strongest_concern == null ? null : Boolean(str(row.strongest_concern)), ctx),
    n("triage.unresolved_question_count/v1", arrLen(row.unresolved_questions)),
  ];
  return {
    event: baseEvent("AI_TRIAGE", "ai_triage_decision", row, decisionAt, mode, {
      sourceArtifactVersion: str(run?.prompt_version),
      triageRunId: str(row.triage_run_id),
      scanRunId: str(run?.source_scan_id),
      cohortRef: run?.source_scan_id ? `scan_runs:${run.source_scan_id}` : null,
      productionPolicyVersion: str(run?.triage_policy_version),
      inputSchemaVersion: str(row.research_packet_version),
      populationClass: run?.is_calibration ? "CALIBRATION" : "PRODUCTION",
    }),
    features,
  };
}

// ---------------------------------------------------------------- Deep Research
export function projectDeepResearchReport(row: Row, mode: ProjectionMode): ProjectionResult {
  const decisionAt = String(row.created_at);
  const ctx = ctxFor("deep_research_reports", row, decisionAt);
  const health = str(row.search_health);
  const n = (k: string, v: unknown, affiliation: string | null = null) =>
    feature(k, "number", v, ctx, { affiliation, collectionHealth: health });
  const t = (k: string, v: unknown) => feature(k, "text", v, ctx, { collectionHealth: health });
  const features = [
    t("research.status/v1", row.status),
    t("research.search_health/v1", row.search_health),
    n("research.search_failed_attempts/v1", row.search_failed_attempts),
    n("research.source_count/v1", row.source_count),
    n("research.primary_source_count/v1", row.primary_source_count),
    n("research.source_domain_diversity/v1", row.source_domain_diversity),
    // Raw affiliation counts: storage of affiliation never implies corroboration.
    n("research.independent_source_count_raw/v1", row.independent_source_count, "INDEPENDENT"),
    n("research.project_owned_source_count/v1", row.project_owned_source_count, "PROJECT"),
    n("research.project_affiliated_source_count/v1", row.project_affiliated_source_count, "PROJECT"),
    n("research.community_source_count/v1", row.community_source_count, "COMMUNITY"),
    n("research.mirror_source_count/v1", row.on_chain_mirror_count, "MIRROR"),
    n("research.unknown_affiliation_source_count/v1", row.unknown_independence_source_count, "UNKNOWN"),
    n("research.distinct_evidence_origins_raw/v1", row.distinct_evidence_origins),
    n("research.unresolved_gap_count/v1", row.unresolved_gap_count),
    n("research.conflicting_claim_count/v1", row.conflicting_claim_count),
    n("research.corroborated_claim_count/v1", row.corroborated_claim_count),
    n("research.evidence_coverage_pct/v1", row.evidence_coverage_pct),
    t("research.token_identity_confidence/v1", row.token_identity_confidence),
    t("research.project_attribution_confidence/v1", row.project_attribution_confidence),
    feature("research.narrative_resolved/v1", "boolean", row.narrative_resolved, ctx),
  ];
  return {
    event: baseEvent("DEEP_RESEARCH", "deep_research_report", row, decisionAt, mode, {
      sourceArtifactVersion: str(row.dossier_version),
      deepResearchRunId: str(row.deep_research_run_id),
      productionPolicyVersion: str(row.research_policy_version),
      inputSchemaVersion: str(row.evidence_semantics_version),
      populationClass: row.is_calibration ? "CALIBRATION" : "PRODUCTION",
    }),
    features,
  };
}

// ---------------------------------------------------------------- Thesis
const SEVERITY: Record<string, number> = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

/**
 * Gate diagnostics are projected from the frozen report against the existing
 * opportunity policy, and only when the report was decided under that exact
 * gate version. Older reports are NOT_EVALUATED — never re-judged.
 */
export function projectThesisGates(row: Row, ctx: FeatureContext): LearningFeature[] {
  const gd = obj(row.gate_diagnostics);
  const origin = obj(gd?.originGate);
  const keys: [string, string, string, string, string, string] = [
    "gate.operational_eligibility/v1",
    "gate.allowed_verdict/v1",
    "gate.thesis_score/v1",
    "gate.evidence_confidence/v1",
    "gate.bear_severity/v1",
    "gate.independent_origins/v1",
  ];
  if (!origin || origin.version !== OPPORTUNITY_GATE_VERSION) {
    return keys.map((k) => statusFeature(k, "NOT_EVALUATED", ctx));
  }
  const p = OPPORTUNITY_POLICY;
  const pf = (k: string, pass: boolean | null) =>
    pass === null ? statusFeature(k, "NOT_EVALUATED", ctx) : feature(k, "text", pass ? "PASS" : "FAIL", ctx);
  const elig = obj(row.current_eligibility);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const score = num(row.thesis_score);
  const ec = num(row.evidence_confidence);
  const sev = str(row.bear_case_severity);
  const originStatus = str(origin.status);
  return [
    pf(keys[0], typeof elig?.actionable === "boolean" ? (elig.actionable as boolean) : null),
    pf(keys[1], str(row.verdict) ? p.allowedVerdicts.includes(row.verdict as never) : null),
    pf(keys[2], score === null ? null : score >= p.minThesisScore),
    pf(keys[3], ec === null ? null : ec >= p.minEvidenceConfidence),
    pf(keys[4], sev && sev in SEVERITY ? (SEVERITY[sev] ?? 9) <= (SEVERITY[p.maxBearSeverity] ?? 1) : null),
    originStatus === "PASS" || originStatus === "FAIL"
      ? feature(keys[5], "text", originStatus, ctx)
      : statusFeature(keys[5], "NOT_EVALUATED", ctx),
  ];
}

export function projectThesisReport(row: Row, mode: ProjectionMode): ProjectionResult {
  const decisionAt = String(row.created_at);
  const ctx = ctxFor("thesis_reports", row, decisionAt);
  const n = (k: string, v: unknown) => feature(k, "number", v, ctx);
  const t = (k: string, v: unknown) => feature(k, "text", v, ctx);
  const origin = obj(obj(row.gate_diagnostics)?.originGate);
  const features = [
    n("thesis.score/v1", row.thesis_score),
    t("thesis.verdict/v1", row.verdict),
    n("thesis.evidence_confidence/v1", row.evidence_confidence),
    t("thesis.bear_severity/v1", row.bear_case_severity),
    n("thesis.meme_lore_score/v1", row.score_meme_quality),
    n("thesis.narrative_catalyst_score/v1", row.score_catalyst_narrative),
    n("thesis.distribution_score/v1", row.score_distribution),
    n("thesis.liquidity_score/v1", row.score_liquidity),
    n("thesis.dev_score/v1", row.score_dev_integrity),
    n("thesis.mindshare_score/v1", row.score_mindshare),
    n("thesis.valuation_score/v1", row.score_valuation),
    n("thesis.distinct_independent_origins/v1", origin?.distinctIndependentEvidenceOrigins),
    t("thesis.catalyst_kind/v1", row.catalyst_kind),
    t("thesis.narrative_maturity/v1", row.narrative_maturity),
    // Canonical call status — read from the production milestone, never from score.
    feature("thesis.is_canonical_thesis_call/v1", "boolean", Boolean(str(row.thesis_call_milestone_id)), ctx),
    ...projectThesisGates(row, ctx),
  ];
  return {
    event: baseEvent("THESIS_SYNTHESIZED", "thesis_report", row, decisionAt, mode, {
      sourceArtifactVersion: str(row.rubric_version),
      thesisReportId: String(row.id),
      triageRunId: str(row.triage_run_id),
      deepResearchRunId: str(row.deep_research_run_id),
      productionPolicyVersion: str(row.thesis_policy_version),
      inputSchemaVersion: str(row.input_policy_version),
      populationClass: row.is_calibration ? "CALIBRATION" : "PRODUCTION",
    }),
    features,
  };
}

// ---------------------------------------------------------------- Entry
export function classifyEntryPopulation(row: Row, thesis: Row | null): EntryPopulationClass {
  if (row.is_calibration) return "CALIBRATION";
  return thesis && str(thesis.thesis_call_milestone_id)
    ? "CANONICAL_POST_THESIS_CALL"
    : "LEGACY_DIAGNOSTIC_PRE_THESIS_CALL_GATE";
}

export function projectEntryEvaluation(row: Row, thesis: Row | null, mode: ProjectionMode): ProjectionResult {
  const decisionAt = String(row.evaluated_at ?? row.created_at);
  const ctx = ctxFor("entry_state_evaluations", row, decisionAt);
  const n = (k: string, v: unknown) => feature(k, "number", v, ctx);
  const t = (k: string, v: unknown) => feature(k, "text", v, ctx);
  const elig = obj(row.current_eligibility);
  const population = classifyEntryPopulation(row, thesis);
  const features = [
    t("entry.state/v1", row.state),
    n("entry.score/v1", row.entry_score),
    n("entry.structure_score/v1", row.score_structure),
    n("entry.extension_score/v1", row.score_extension),
    n("entry.volume_flow_score/v1", row.score_volume_flow),
    n("entry.risk_definition_score/v1", row.score_risk_definition),
    t("entry.price_attention_divergence/v1", row.price_attention_divergence),
    t("entry.timing_resolution/v1", row.timing_resolution),
    t("entry.price_history_source/v1", row.price_history_source),
    feature("entry.actionable/v1", "boolean", elig?.actionable, ctx),
    t("entry.population_class/v1", population),
  ];
  return {
    event: baseEvent("ENTRY_EVALUATED", "entry_state_evaluation", row, decisionAt, mode, {
      sourceArtifactVersion: str(row.feature_version),
      entryEvaluationId: String(row.id),
      thesisReportId: str(row.thesis_report_id),
      scanRunId: str(row.source_scan_id),
      cohortRef: row.source_scan_id ? `scan_runs:${row.source_scan_id}` : null,
      productionPolicyVersion: str(row.entry_policy_version),
      inputSchemaVersion: str(row.research_packet_version),
      populationClass: population,
    }),
    features,
  };
}
