/**
 * Calibration Experiment Tracks v1 — server read/write model.
 *
 * CALIBRATION ONLY. This module writes exclusively to
 * `calibration_experiments` / `calibration_experiment_results`. It never
 * touches production milestones, Thesis Calls, Entry, Live lifecycle or any
 * production policy row, and it never calls a market-data provider.
 *
 * Execution order is architectural, not conventional:
 *
 *   FROZEN DECISION INPUT -> VARIANT DECISION -> persist result
 *   ... only afterwards ...
 *   persisted result + OUTCOME OBSERVATIONS -> evaluation metrics
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadHistoryArtifacts } from "../history/artifacts.server";
import { OPPORTUNITY_GATE_VERSION } from "../research/thesis/contracts";
import {
  EXPERIMENT_INPUT_CONTRACT,
  EXPERIMENT_VERSION,
  buildFrozenDecisionInput,
  classifyExperimentCompatibility,
  evaluateControl,
  evaluateVariant,
  isWithinShadowWindow,
  type ChallengerRule,
  type ExperimentCompatibility,
  type ExperimentFrozenInput,
  type JsonRecord,
  type ExperimentResultRow,
  type ExperimentSpec,
  type ExperimentVariantSpec,
  type ProductionDecision,
  type VariantKey,
} from "./experiments";


type Row = Record<string, unknown>;

const str = (row: Row, key: string): string | null => (row[key] as string | null) ?? null;
const num = (row: Row, key: string): number | null => {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const obj = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const chunk = <T,>(items: T[], size = 100): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/* ------------------------------------------------------------------ *
 * Specs
 * ------------------------------------------------------------------ */

function mapSpec(row: Row): ExperimentSpec {
  const variants = Array.isArray(row["challenger_variants"])
    ? (row["challenger_variants"] as ExperimentVariantSpec[])
    : [];
  return {
    experimentId: row["id"] as string,
    name: str(row, "name") ?? "",
    hypothesis: str(row, "hypothesis") ?? "",
    createdAt: str(row, "created_at"),
    experimentVersion: str(row, "experiment_version") ?? EXPERIMENT_VERSION,
    experimentType: (str(row, "experiment_type") ?? "RETROSPECTIVE_BACKTEST") as
      ExperimentSpec["experimentType"],
    status: (str(row, "status") ?? "DRAFT") as ExperimentSpec["status"],
    sourceStage: (str(row, "source_stage") ?? "THESIS_SYNTHESIZED") as
      ExperimentSpec["sourceStage"],
    sourcePolicyFilters: obj(row["source_policy_filters"]),
    populationDefinition: obj(row["population_definition"]),
    populationSemantics: str(row, "population_semantics") ?? "DECISIONS_AND_UNIQUE_TOKENS",
    controlPolicy: obj(row["control_policy"]),
    challengerVariants: variants,
    evaluationHorizons: (row["evaluation_horizons"] as string[] | null) ?? [],
    predeclared: Boolean(row["predeclared"]),
    shadowStartAt: str(row, "shadow_start_at"),
    promotionState: (str(row, "promotion_state") ?? "NONE") as ExperimentSpec["promotionState"],
    lastEvaluatedAt: str(row, "last_evaluated_at"),
  };
}

export async function listExperiments(): Promise<ExperimentSpec[]> {
  const { data } = await supabaseAdmin
    .from("calibration_experiments")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data as Row[]) ?? []).map(mapSpec);
}

export async function getExperiment(experimentId: string): Promise<ExperimentSpec | null> {
  const { data } = await supabaseAdmin
    .from("calibration_experiments")
    .select("*")
    .eq("id", experimentId)
    .maybeSingle();
  return data ? mapSpec(data as Row) : null;
}

/* ------------------------------------------------------------------ *
 * Frozen population
 * ------------------------------------------------------------------ */

export interface FrozenPopulationEntry {
  eventKey: string;
  input: ExperimentFrozenInput;
  /** Exactly what production persisted for this artifact. */
  productionQualifiedAsOpportunity: boolean;
  /** Whether this frozen artifact carries the semantics the experiment needs. */
  compatibility: ExperimentCompatibility;
  incompatibleReason: string | null;
}


/**
 * The frozen eligible population for the Thesis Call gate family: canonical
 * production Thesis Synthesized artifacts only. Same-cohort reruns are
 * excluded — they are preserved in History but are not independent decisions.
 */
export async function loadFrozenThesisPopulation(
  spec: ExperimentSpec,
): Promise<FrozenPopulationEntry[]> {
  const artifacts = (await loadHistoryArtifacts()).thesis.filter(
    (a) => a.canonicalWithinCohortMint && !a.sameCohortRerun,
  );

  const policyFilter = spec.sourcePolicyFilters["thesisPolicyVersion"];
  const filtered = artifacts.filter((a) => {
    if (typeof policyFilter === "string" && policyFilter !== "ALL") {
      if (a.thesisPolicyVersion !== policyFilter) return false;
    }
    return isWithinShadowWindow(spec, a.synthesizedAt);
  });

  const detail = new Map<string, Row>();
  for (const ids of chunk(filtered.map((a) => a.reportId), 100)) {
    const { data } = await supabaseAdmin
      .from("thesis_reports")
      .select(
        "id, thesis_score, evidence_confidence, verdict, bear_case_severity, gate_diagnostics, source_mix, evidence_polarity_counts, current_eligibility, qualified_as_opportunity, rubric_version, thesis_policy_version",
      )
      .in("id", ids);
    for (const row of (data as Row[]) ?? []) detail.set(row["id"] as string, row);
  }

  const out: FrozenPopulationEntry[] = [];
  for (const a of filtered) {
    const row = detail.get(a.reportId);
    if (!row) continue;
    const gate = obj(row["gate_diagnostics"]);
    const originGate = obj(gate["originGate"]);
    const sourceMix = obj(row["source_mix"]);
    const polarity = obj(row["evidence_polarity_counts"]);
    const eligibility = obj(row["current_eligibility"]);

    const origins = originGate["distinctIndependentEvidenceOrigins"];
    const primaryQuality = typeof sourceMix["primaryQuality"] === "number"
      ? (sourceMix["primaryQuality"] as number)
      : 0;
    const positive = typeof polarity["positive"] === "number"
      ? (polarity["positive"] as number)
      : 0;

    const input = buildFrozenDecisionInput({
      mint: a.mint,
      thesisReportId: a.reportId,
      cohortId: a.triageRunId ?? a.sourceScanId,
      sourceScanId: a.sourceScanId,
      decisionAt: a.synthesizedAt,
      thesisScore: num(row, "thesis_score"),
      evidenceConfidence: num(row, "evidence_confidence"),
      verdict: str(row, "verdict"),
      bearSeverity: str(row, "bear_case_severity"),
      distinctIndependentEvidenceOrigins:
        typeof origins === "number" && Number.isFinite(origins) ? origins : null,
      independentSourceCount:
        typeof gate["independentSourceCount"] === "number"
          ? (gate["independentSourceCount"] as number)
          : null,
      primarySourceCount:
        typeof gate["primarySourceCount"] === "number"
          ? (gate["primarySourceCount"] as number)
          : null,
      // Affirmative, primary-source-quality evidence actually present.
      verifiedPrimarySourceEvidence: primaryQuality >= 1 && positive >= 1,
      operationallyEligible: Boolean(eligibility["researchEligibleNow"]),
      setups: a.setups,
      thesisPolicyVersion: a.thesisPolicyVersion,
      rubricVersion: a.rubricVersion,
      opportunityGateVersion: OPPORTUNITY_GATE_VERSION,
    });

    const rules = spec.challengerVariants.map((v) => v.differsBy);
    const compat = classifyExperimentCompatibility(input, rules);

    out.push({
      eventKey: `THESIS_SYNTHESIZED:${a.reportId}`,
      input,
      productionQualifiedAsOpportunity: Boolean(row["qualified_as_opportunity"]),
      compatibility: compat.status,
      incompatibleReason: compat.reason,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Historical semantics compatibility audit
 * ------------------------------------------------------------------ */

export interface CompatibilityAudit {
  totalFrozenEvents: number;
  compatibleEvents: number;
  incompatibleEvents: number;
  /** Reason code -> count. Excluded from the denominator, never hidden. */
  incompatibleReasons: Record<string, number>;
  compatiblePolicyVersions: string[];
}

export async function auditExperimentCompatibility(
  experimentId: string,
): Promise<CompatibilityAudit> {
  const spec = await getExperiment(experimentId);
  if (!spec) throw new Error("EXPERIMENT_NOT_FOUND");
  const population = await loadFrozenThesisPopulation(spec);
  const reasons: Record<string, number> = {};
  const versions = new Set<string>();
  let compatible = 0;
  for (const entry of population) {
    if (entry.compatibility === "COMPATIBLE") {
      compatible += 1;
      if (entry.input.thesisPolicyVersion) versions.add(entry.input.thesisPolicyVersion);
    } else {
      const key = entry.incompatibleReason ?? "NOT_EVALUABLE_FOR_EXPERIMENT_VERSION";
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
  }
  return {
    totalFrozenEvents: population.length,
    compatibleEvents: compatible,
    incompatibleEvents: population.length - compatible,
    incompatibleReasons: reasons,
    compatiblePolicyVersions: [...versions].sort(),
  };
}


/* ------------------------------------------------------------------ *
 * Run — decisions only, no outcomes in scope
 * ------------------------------------------------------------------ */

export interface RunExperimentResult {
  experimentId: string;
  status: ExperimentSpec["status"];
  /** Compatible frozen events only — the experiment denominator. */
  populationN: number;
  /** Excluded as NOT_EVALUABLE_FOR_EXPERIMENT_VERSION, reported not hidden. */
  incompatibleN: number;

  uniqueMints: number;
  variantsRun: VariantKey[];
  persistedRows: number;
}

export async function runExperiment(experimentId: string): Promise<RunExperimentResult> {
  const spec = await getExperiment(experimentId);
  if (!spec) throw new Error("EXPERIMENT_NOT_FOUND");
  if (spec.status === "ARCHIVED") throw new Error("EXPERIMENT_ARCHIVED");

  await supabaseAdmin
    .from("calibration_experiments")
    .update({ status: "RUNNING" })
    .eq("id", experimentId);

  const population = await loadFrozenThesisPopulation(spec);

  const variants: { key: VariantKey; rule: ChallengerRule }[] = [
    { key: "CONTROL", rule: "NONE" },
    ...spec.challengerVariants.map((v) => ({ key: v.key, rule: v.differsBy })),
  ];

  interface ResultInsert {
    experiment_id: string;
    variant_key: string;
    source_stage: string;
    event_key: string;
    mint: string;
    cohort_id: string | null;
    decision_at: string | null;
    production_decision: string;
    challenger_decision: string;
    differs: boolean;
    differing_rule: string | null;
    failed_gates: string[];
    frozen_input: JsonRecord;
    input_contract_version: string;
  }
  const rows: ResultInsert[] = [];
  // Incompatible frozen artifacts are counted, never evaluated: current
  // semantics are not reconstructed backwards into an older decision.
  const compatible = population.filter((p) => p.compatibility === "COMPATIBLE");
  for (const entry of compatible) {

    const control = evaluateControl(entry.input);
    const productionDecision = control.decision as ProductionDecision;
    for (const variant of variants) {
      const result =
        variant.key === "CONTROL"
          ? control
          : evaluateVariant({ key: variant.key, label: variant.key, differsBy: variant.rule,
              description: "" }, entry.input);
      rows.push({
        experiment_id: experimentId,
        variant_key: variant.key,
        source_stage: spec.sourceStage,
        event_key: entry.eventKey,
        mint: entry.input.mint,
        cohort_id: entry.input.cohortId,
        decision_at: entry.input.decisionAt,
        production_decision: productionDecision,
        challenger_decision: result.decision,
        differs:
          variant.key !== "CONTROL" &&
          (result.decision === "SHADOW_CALL") !== (productionDecision === "CALL"),
        differing_rule: variant.key === "CONTROL" ? null : variant.rule,
        failed_gates: result.failedGates,
        frozen_input: entry.input as unknown as JsonRecord,
        input_contract_version: EXPERIMENT_INPUT_CONTRACT,
      });
    }
  }

  for (const batch of chunk(rows, 200)) {
    await supabaseAdmin
      .from("calibration_experiment_results")
      .upsert(batch, { onConflict: "experiment_id,variant_key,event_key" });
  }

  await supabaseAdmin
    .from("calibration_experiments")
    .update({ status: "COMPLETE", last_evaluated_at: new Date().toISOString() })
    .eq("id", experimentId);

  return {
    experimentId,
    status: "COMPLETE",
    populationN: compatible.length,
    incompatibleN: population.length - compatible.length,
    uniqueMints: new Set(compatible.map((p) => p.input.mint)).size,
    variantsRun: variants.map((v) => v.key),
    persistedRows: rows.length,
  };

}

export async function loadExperimentResults(
  experimentId: string,
): Promise<ExperimentResultRow[]> {
  const { data } = await supabaseAdmin
    .from("calibration_experiment_results")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("decision_at", { ascending: false });
  return ((data as Row[]) ?? []).map((row) => ({
    id: row["id"] as string,
    experimentId: row["experiment_id"] as string,
    variantKey: row["variant_key"] as VariantKey,
    sourceStage: row["source_stage"] as ExperimentSpec["sourceStage"],
    eventKey: row["event_key"] as string,
    mint: row["mint"] as string,
    cohortId: str(row, "cohort_id"),
    decisionAt: str(row, "decision_at"),
    productionDecision: str(row, "production_decision") as ProductionDecision,
    challengerDecision: str(row, "challenger_decision") as ExperimentResultRow["challengerDecision"],
    differs: Boolean(row["differs"]),
    differingRule: str(row, "differing_rule"),
    failedGates: (row["failed_gates"] as string[] | null) ?? [],
    frozenInput: obj(row["frozen_input"]) as unknown as ExperimentFrozenInput,
    inputContractVersion: str(row, "input_contract_version") ?? EXPERIMENT_INPUT_CONTRACT,
    decidedAt: str(row, "decided_at"),
  }));
}

/** Calibration-only bookkeeping. There is no production promotion path. */
export async function setPromotionState(
  experimentId: string,
  promotionState: "NONE" | "CANDIDATE_FOR_PROSPECTIVE_SHADOW" | "PROPOSED_FOR_REVIEW",
): Promise<void> {
  await supabaseAdmin
    .from("calibration_experiments")
    .update({ promotion_state: promotionState })
    .eq("id", experimentId);
}

/* ------------------------------------------------------------------ *
 * Prospective shadow activation — no historical backfill
 * ------------------------------------------------------------------ */

/**
 * Creates a PROSPECTIVE_SHADOW twin of an existing retrospective experiment,
 * activated at `now`. Events decided before activation are structurally
 * excluded by `isWithinShadowWindow`, so no backfill is possible.
 */
export async function activateProspectiveShadow(
  experimentId: string,
): Promise<{ experimentId: string; shadowStartAt: string; created: boolean }> {
  const source = await getExperiment(experimentId);
  if (!source) throw new Error("EXPERIMENT_NOT_FOUND");

  const name = `${source.name} — Prospective Shadow`;
  const { data: existing } = await supabaseAdmin
    .from("calibration_experiments")
    .select("id, shadow_start_at")
    .eq("name", name)
    .maybeSingle();
  if (existing) {
    return {
      experimentId: (existing as Row)["id"] as string,
      shadowStartAt: ((existing as Row)["shadow_start_at"] as string | null) ?? "",
      created: false,
    };
  }

  const shadowStartAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("calibration_experiments")
    .insert({
      name,
      hypothesis: source.hypothesis,
      experiment_version: EXPERIMENT_VERSION,
      experiment_type: "PROSPECTIVE_SHADOW",
      status: "RUNNING",
      source_stage: source.sourceStage,
      source_policy_filters: source.sourcePolicyFilters,
      population_definition: source.populationDefinition,
      population_semantics: source.populationSemantics,
      control_policy: source.controlPolicy,
      challenger_variants: source.challengerVariants as unknown as JsonRecord[],
      evaluation_horizons: source.evaluationHorizons,
      predeclared: true,
      shadow_start_at: shadowStartAt,
      promotion_state: "NONE",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { experimentId: (data as Row)["id"] as string, shadowStartAt, created: true };
}
