/**
 * Thesis model benchmark (CALIBRATION ONLY, server-only).
 *
 * Runs a stronger OpenAI reasoning model over the EXACT frozen evidence of the
 * authoritative production thesis cohort and compares it against the persisted
 * Gemini results.
 *
 * Hard invariants:
 *  - the frozen production thesis run and its reports are never modified
 *  - every benchmark synthesis runs in calibration mode: no Opportunities,
 *    no THESIS_CALL milestones, no history writes, no threshold changes
 *  - the OpenAI model never sees Gemini scores, verdicts or narratives; the
 *    Gemini output only becomes comparison data after synthesis
 *  - the rubric, prompt, evidence redaction and catalyst semantics are the
 *    same objects production uses
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createOpenAiThesisProvider,
  OPENAI_THESIS_MODEL_PREFERENCE,
  OPENAI_THESIS_REASONING_EFFORT,
  preflightOpenAiThesisModels,
  type OpenAiModelAccessAttempt,
} from "./provider.server";
import { runThesisSynthesis, type ThesisBatchResult } from "./thesis.server";
import { THESIS_COMPONENTS, type ComponentScores } from "./contracts";

type Row = Record<string, unknown>;

export const THESIS_BENCHMARK_VERSION = "thesis_model_benchmark/v1";
export const THESIS_BENCHMARK_RUN_COUNT = 3;

export type ThesisBenchmarkCode =
  | "OK"
  | "MISSING_OPENAI_API_KEY"
  | "OPENAI_THESIS_MODEL_UNAVAILABLE"
  | "NO_PRODUCTION_THESIS_COHORT";

export interface FrozenThesisBaseline {
  mint: string;
  symbol: string | null;
  name: string | null;
  deepResearchReportId: string;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: string | null;
  bearSeverity: string | null;
  components: ComponentScores | null;
  catalystKind: string;
  strongestCatalyst: string | null;
  strongestBearCase: string | null;
}

export interface BenchmarkRunSample {
  runId: string;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: string | null;
  bearSeverity: string | null;
  components: ComponentScores | null;
  catalystKind: string;
  strongestCatalyst: string | null;
  strongestBearCase: string | null;
  status: string;
}

export interface BenchmarkCandidateComparison {
  mint: string;
  symbol: string | null;
  name: string | null;
  pairAddress: string | null;
  baseline: FrozenThesisBaseline;
  samples: BenchmarkRunSample[];
  challengerMedianScore: number | null;
  challengerMinScore: number | null;
  challengerMaxScore: number | null;
  challengerScoreSpread: number | null;
  challengerMedianConfidence: number | null;
  scoreDelta: number | null;
  confidenceDelta: number | null;
  verdictStable: boolean;
  verdictChanged: boolean;
  componentDeltas: { key: string; label: string; baseline: number | null; challenger: number | null; delta: number | null }[];
  catalystDisagreement: boolean;
  wouldQualifyDifferently: boolean;
}

export interface ThesisBenchmarkResult {
  version: string;
  code: ThesisBenchmarkCode;
  baselineRunId: string | null;
  baselineModel: string | null;
  challengerModel: string | null;
  challengerReasoningEffort: string;
  usedFallbackModel: boolean;
  modelAccessAttempts: OpenAiModelAccessAttempt[];
  runIds: string[];
  cohortSize: number;
  productionWritesPerformed: number;
  opportunitiesCreated: number;
  thesisCallsCreated: number;
  comparisons: BenchmarkCandidateComparison[];
  summary: {
    meanScoreDelta: number | null;
    meanConfidenceDelta: number | null;
    verdictChanges: number;
    unstableCandidates: number;
    maxScoreSpread: number | null;
    catalystDisagreements: number;
  };
  recommendation: string;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const lo = s[mid - 1];
  const hi = s[mid];
  if (s.length % 2 === 1) return hi ?? null;
  return lo !== undefined && hi !== undefined ? (lo + hi) / 2 : null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** The authoritative frozen production cohort — read-only. */
export async function loadFrozenProductionCohort(): Promise<{
  runId: string | null;
  model: string | null;
  baselines: FrozenThesisBaseline[];
}> {
  const { data: runRow } = await supabaseAdmin
    .from("thesis_synthesis_runs")
    .select("id, model_identifier")
    .eq("is_calibration", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!runRow) return { runId: null, model: null, baselines: [] };
  const runId = (runRow as Row)["id"] as string;

  const { data, error } = await supabaseAdmin
    .from("thesis_reports")
    .select("*")
    .eq("thesis_synthesis_run_id", runId)
    .order("thesis_score", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);

  const baselines: FrozenThesisBaseline[] = [];
  for (const r of ((data as Row[]) ?? [])) {
    const reportId = (r["deep_research_report_id"] as string) ?? null;
    if (!reportId) continue;
    baselines.push({
      mint: r["mint"] as string,
      symbol: (r["symbol"] as string) ?? null,
      name: (r["name"] as string) ?? null,
      deepResearchReportId: reportId,
      thesisScore: (r["thesis_score"] as number) ?? null,
      evidenceConfidence: (r["evidence_confidence"] as number) ?? null,
      verdict: (r["verdict"] as string) ?? null,
      bearSeverity: (r["bear_case_severity"] as string) ?? null,
      components: (r["component_scores"] as ComponentScores) ?? null,
      catalystKind: (r["catalyst_kind"] as string) ?? "NONE",
      strongestCatalyst: (r["strongest_catalyst"] as string) ?? null,
      strongestBearCase: (r["strongest_bear_case"] as string) ?? null,
    });
  }
  return {
    runId,
    model: ((runRow as Row)["model_identifier"] as string) ?? null,
    baselines,
  };
}

export interface RunThesisBenchmarkOptions {
  runCount?: number;
  /** Restrict the benchmark to a subset of mints (debugging / partial reruns). */
  mints?: string[];
}

export async function runThesisModelBenchmark(
  options: RunThesisBenchmarkOptions = {},
): Promise<ThesisBenchmarkResult> {
  const runCount = Math.min(Math.max(options.runCount ?? THESIS_BENCHMARK_RUN_COUNT, 1), 5);

  const base: ThesisBenchmarkResult = {
    version: THESIS_BENCHMARK_VERSION,
    code: "OK",
    baselineRunId: null,
    baselineModel: null,
    challengerModel: null,
    challengerReasoningEffort: OPENAI_THESIS_REASONING_EFFORT,
    usedFallbackModel: false,
    modelAccessAttempts: [],
    runIds: [],
    cohortSize: 0,
    productionWritesPerformed: 0,
    opportunitiesCreated: 0,
    thesisCallsCreated: 0,
    comparisons: [],
    summary: {
      meanScoreDelta: null,
      meanConfidenceDelta: null,
      verdictChanges: 0,
      unstableCandidates: 0,
      maxScoreSpread: null,
      catalystDisagreements: 0,
    },
    recommendation: "",
  };

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    return { ...base, code: "MISSING_OPENAI_API_KEY", recommendation: "KEEP_CURRENT_MODEL" };
  }

  const cohort = await loadFrozenProductionCohort();
  let baselines = cohort.baselines;
  if (options.mints?.length) {
    const wanted = new Set(options.mints);
    baselines = baselines.filter((b) => wanted.has(b.mint));
  }
  if (!cohort.runId || baselines.length === 0) {
    return { ...base, code: "NO_PRODUCTION_THESIS_COHORT", recommendation: "KEEP_CURRENT_MODEL" };
  }

  const access = await preflightOpenAiThesisModels({
    apiKey,
    models: OPENAI_THESIS_MODEL_PREFERENCE,
  });
  if (!access.selectedModel) {
    return {
      ...base,
      code: "OPENAI_THESIS_MODEL_UNAVAILABLE",
      baselineRunId: cohort.runId,
      baselineModel: cohort.model,
      modelAccessAttempts: access.attempts,
      cohortSize: baselines.length,
      recommendation: "KEEP_CURRENT_MODEL",
    };
  }

  const provider = createOpenAiThesisProvider({
    apiKey,
    model: access.selectedModel,
    reasoningEffort: OPENAI_THESIS_REASONING_EFFORT,
  });

  const reportIds = baselines.map((b) => b.deepResearchReportId);
  const batches: ThesisBatchResult[] = [];
  for (let i = 0; i < runCount; i += 1) {
    batches.push(
      await runThesisSynthesis({
        mode: "calibration", // never production: no opportunities, no THESIS_CALL, no history
        limit: Math.min(reportIds.length, 15),
        reportIds,
        provider,
      }),
    );
  }

  return buildBenchmarkComparison({
    base,
    access,
    baselines,
    batches,
    cohortRunId: cohort.runId,
    cohortModel: cohort.model,
    pairByMint: await loadPairAddresses(baselines.map((b) => b.mint)),
    narrativeByRunMint: await loadBenchmarkNarratives(
      batches.map((b) => b.runId ?? "").filter(Boolean),
    ),
  });
}

export interface BenchmarkNarrative {
  catalystKind: string;
  strongestCatalyst: string | null;
  strongestBearCase: string | null;
}

/** Catalyst / bear text lives on the persisted calibration reports. */
async function loadBenchmarkNarratives(
  runIds: string[],
): Promise<Map<string, BenchmarkNarrative>> {
  const out = new Map<string, BenchmarkNarrative>();
  if (runIds.length === 0) return out;
  const { data } = await supabaseAdmin
    .from("thesis_reports")
    .select(
      "thesis_synthesis_run_id, mint, catalyst_kind, strongest_catalyst, strongest_bear_case",
    )
    .in("thesis_synthesis_run_id", runIds);
  for (const r of ((data as Row[] | null) ?? [])) {
    out.set(`${r["thesis_synthesis_run_id"] as string}:${r["mint"] as string}`, {
      catalystKind: (r["catalyst_kind"] as string) ?? "NONE",
      strongestCatalyst: (r["strongest_catalyst"] as string) ?? null,
      strongestBearCase: (r["strongest_bear_case"] as string) ?? null,
    });
  }
  return out;
}

async function loadPairAddresses(mints: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (mints.length === 0) return out;
  const { data } = await supabaseAdmin
    .from("tokens")
    .select("contract_address, dex_pair_address")
    .in("contract_address", mints);
  for (const t of ((data as Row[] | null) ?? [])) {
    out.set(t["contract_address"] as string, (t["dex_pair_address"] as string) ?? null);
  }
  return out;
}

export function buildBenchmarkComparison(args: {
  base: ThesisBenchmarkResult;
  access: { selectedModel: string | null; usedFallback: boolean; attempts: OpenAiModelAccessAttempt[] };
  baselines: FrozenThesisBaseline[];
  batches: ThesisBatchResult[];
  cohortRunId: string;
  cohortModel: string | null;
  pairByMint: Map<string, string | null>;
}): ThesisBenchmarkResult {
  const { base, access, baselines, batches, cohortRunId, cohortModel, pairByMint } = args;

  const comparisons: BenchmarkCandidateComparison[] = baselines.map((b) => {
    const samples: BenchmarkRunSample[] = [];
    for (const batch of batches) {
      const c = batch.candidates.find((x) => x.mint === b.mint);
      if (!c) continue;
      samples.push({
        runId: batch.runId ?? "",
        thesisScore: c.thesisScore,
        evidenceConfidence: c.evidenceConfidence,
        verdict: c.verdict,
        bearSeverity: c.bearSeverity,
        components: c.components,
        catalystKind: "NONE",
        strongestCatalyst: null,
        strongestBearCase: null,
        status: c.status,
      });
    }

    const scores = samples.map((s) => s.thesisScore).filter((v): v is number => v !== null);
    const confs = samples.map((s) => s.evidenceConfidence).filter((v): v is number => v !== null);
    const medScore = median(scores);
    const medConf = median(confs);
    const verdicts = new Set(samples.map((s) => s.verdict ?? "NONE"));
    const challengerVerdict = samples[0]?.verdict ?? null;

    const componentDeltas = THESIS_COMPONENTS.map((comp) => {
      const key = comp.key as keyof ComponentScores;
      const baselineValue = b.components?.[key] ?? null;
      const challengerValues = samples
        .map((s) => s.components?.[key] ?? null)
        .filter((v): v is number => v !== null);
      const challengerValue = median(challengerValues);
      return {
        key: comp.key,
        label: comp.label,
        baseline: baselineValue,
        challenger: challengerValue,
        delta:
          baselineValue !== null && challengerValue !== null
            ? Math.round((challengerValue - baselineValue) * 10) / 10
            : null,
      };
    });

    return {
      mint: b.mint,
      symbol: b.symbol,
      name: b.name,
      pairAddress: pairByMint.get(b.mint) ?? null,
      baseline: b,
      samples,
      challengerMedianScore: medScore,
      challengerMinScore: scores.length ? Math.min(...scores) : null,
      challengerMaxScore: scores.length ? Math.max(...scores) : null,
      challengerScoreSpread: scores.length ? Math.max(...scores) - Math.min(...scores) : null,
      challengerMedianConfidence: medConf,
      scoreDelta:
        medScore !== null && b.thesisScore !== null
          ? Math.round((medScore - b.thesisScore) * 10) / 10
          : null,
      confidenceDelta:
        medConf !== null && b.evidenceConfidence !== null
          ? Math.round((medConf - b.evidenceConfidence) * 10) / 10
          : null,
      verdictStable: verdicts.size <= 1,
      verdictChanged: challengerVerdict !== null && challengerVerdict !== b.verdict,
      componentDeltas,
      catalystDisagreement: false,
      wouldQualifyDifferently:
        medScore !== null &&
        b.thesisScore !== null &&
        (medScore >= 70) !== (b.thesisScore >= 70),
    };
  });

  const scoreDeltas = comparisons.map((c) => c.scoreDelta).filter((v): v is number => v !== null);
  const confDeltas = comparisons.map((c) => c.confidenceDelta).filter((v): v is number => v !== null);
  const spreads = comparisons.map((c) => c.challengerScoreSpread).filter((v): v is number => v !== null);
  const verdictChanges = comparisons.filter((c) => c.verdictChanged).length;
  const unstable = comparisons.filter((c) => !c.verdictStable || (c.challengerScoreSpread ?? 0) > 10).length;

  const meanScoreDelta = mean(scoreDeltas);
  const recommendation = deriveBenchmarkRecommendation({
    meanScoreDelta,
    unstable,
    total: comparisons.length,
    qualifyChanges: comparisons.filter((c) => c.wouldQualifyDifferently).length,
  });

  return {
    ...base,
    code: "OK",
    baselineRunId: cohortRunId,
    baselineModel: cohortModel,
    challengerModel: access.selectedModel,
    usedFallbackModel: access.usedFallback,
    modelAccessAttempts: access.attempts,
    runIds: batches.map((b) => b.runId ?? "").filter(Boolean),
    cohortSize: comparisons.length,
    productionWritesPerformed: 0,
    opportunitiesCreated: batches.reduce((a, b) => a + b.opportunities, 0),
    thesisCallsCreated: batches.reduce((a, b) => a + b.thesisCalls, 0),
    comparisons,
    summary: {
      meanScoreDelta,
      meanConfidenceDelta: mean(confDeltas),
      verdictChanges,
      unstableCandidates: unstable,
      maxScoreSpread: spreads.length ? Math.max(...spreads) : null,
      catalystDisagreements: comparisons.filter((c) => c.catalystDisagreement).length,
    },
    recommendation,
  };
}

/** Exactly one recommendation, derived from stability and separation only. */
export function deriveBenchmarkRecommendation(args: {
  meanScoreDelta: number | null;
  unstable: number;
  total: number;
  qualifyChanges: number;
}): string {
  const { meanScoreDelta, unstable, total, qualifyChanges } = args;
  if (total === 0) return "KEEP_CURRENT_MODEL";
  const unstableRate = unstable / total;
  if (unstableRate > 0.34) return "KEEP_CURRENT_MODEL";
  if (Math.abs(meanScoreDelta ?? 0) < 5 && qualifyChanges === 0) return "KEEP_CURRENT_MODEL";
  return "ADOPT_CHALLENGER_MODEL_FOR_FUTURE_THESIS_RUNS";
}
