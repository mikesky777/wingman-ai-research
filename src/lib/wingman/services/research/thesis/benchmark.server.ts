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

/**
 * Cost plan: the full cohort is synthesised ONCE by the challenger model, and
 * repeat (stability) passes are intentionally concentrated on the four
 * near-threshold / highest-interest candidates only.
 */
export const THESIS_BENCHMARK_STABILITY_SYMBOLS = ["STONK", "KEKODYSSEUS", "1", "Shrek"];
export const THESIS_BENCHMARK_FULL_COHORT_PASSES = 1;
export const THESIS_BENCHMARK_STABILITY_PASSES = 3;
export const THESIS_BENCHMARK_MAX_CONCURRENCY = 3;

export interface RunThesisBenchmarkOptions {
  fullCohortPasses?: number;
  stabilityPasses?: number;
  /** Bounded parallelism for challenger requests (1–3). */
  concurrency?: number;
  /** Restrict the benchmark to a subset of mints (debugging / partial reruns). */
  mints?: string[];
  /** Legacy uniform pass count; treated as the stability pass count. */
  runCount?: number;
}

export async function runThesisModelBenchmark(
  options: RunThesisBenchmarkOptions = {},
): Promise<ThesisBenchmarkResult> {
  const fullCohortPasses = Math.min(
    Math.max(options.fullCohortPasses ?? THESIS_BENCHMARK_FULL_COHORT_PASSES, 1),
    3,
  );
  const stabilityPasses = Math.min(
    Math.max(options.stabilityPasses ?? options.runCount ?? THESIS_BENCHMARK_STABILITY_PASSES, 1),
    5,
  );
  const concurrency = Math.min(Math.max(options.concurrency ?? THESIS_BENCHMARK_MAX_CONCURRENCY, 1), 3);


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

  const stabilityMints = new Set(
    baselines
      .filter((b) => THESIS_BENCHMARK_STABILITY_SYMBOLS.includes((b.symbol ?? "").trim()))
      .map((b) => b.mint),
  );
  const targetPasses = (mint: string) =>
    stabilityMints.has(mint) ? stabilityPasses : fullCohortPasses;

  // Reuse everything the challenger has already produced over this exact evidence.
  let samplesByMint = await loadChallengerSamples(baselines);

  const tasks: FrozenThesisBaseline[] = [];
  for (const b of baselines) {
    const have = samplesByMint.get(b.mint)?.length ?? 0;
    for (let i = have; i < targetPasses(b.mint); i += 1) tasks.push(b);
  }

  const executed: ThesisBatchResult[] = [];
  await runWithConcurrency(tasks, concurrency, async (b) => {
    const batch = await runThesisSynthesis({
      mode: "calibration", // never production: no opportunities, no THESIS_CALL, no history
      limit: 1,
      reportIds: [b.deepResearchReportId],
      provider,
    });
    executed.push(batch);
  });

  if (tasks.length > 0) samplesByMint = await loadChallengerSamples(baselines);

  return buildBenchmarkComparison({
    base,
    access,
    baselines,
    samplesByMint,
    stabilityMints,
    plan: {
      fullCohortPasses,
      stabilityPasses,
      concurrency,
      synthesisCallsExecuted: tasks.length,
      reusedSamples: baselines.reduce(
        (a, b) => a + Math.min(samplesByMint.get(b.mint)?.length ?? 0, targetPasses(b.mint)),
        0,
      ) - tasks.length,
    },
    executed,
    cohortRunId: cohort.runId,
    cohortModel: cohort.model,
    pairByMint: await loadPairAddresses(baselines.map((b) => b.mint)),
  });
}

/** Bounded parallelism — never fires every challenger request at once. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

/**
 * Persisted challenger samples over the EXACT frozen deep-research evidence,
 * oldest first, so repeat passes are reused instead of re-purchased.
 */
async function loadChallengerSamples(
  baselines: FrozenThesisBaseline[],
): Promise<Map<string, BenchmarkRunSample[]>> {
  const out = new Map<string, BenchmarkRunSample[]>();
  if (baselines.length === 0) return out;

  const { data: runRows } = await supabaseAdmin
    .from("thesis_synthesis_runs")
    .select("id, model_identifier")
    .eq("is_calibration", true);
  const challengerRunIds = ((runRows as Row[] | null) ?? [])
    .filter((r) => ((r["model_identifier"] as string) ?? "").toLowerCase().includes("gpt"))
    .map((r) => r["id"] as string);
  if (challengerRunIds.length === 0) return out;

  const reportIds = baselines.map((b) => b.deepResearchReportId);
  const { data } = await supabaseAdmin
    .from("thesis_reports")
    .select("*")
    .in("thesis_synthesis_run_id", challengerRunIds)
    .in("deep_research_report_id", reportIds)
    .order("created_at", { ascending: true });

  for (const r of ((data as Row[] | null) ?? [])) {
    const mint = r["mint"] as string;
    const list = out.get(mint) ?? [];
    list.push({
      runId: (r["thesis_synthesis_run_id"] as string) ?? "",
      thesisScore: (r["thesis_score"] as number) ?? null,
      evidenceConfidence: (r["evidence_confidence"] as number) ?? null,
      verdict: (r["verdict"] as string) ?? null,
      bearSeverity: (r["bear_case_severity"] as string) ?? null,
      components: (r["component_scores"] as ComponentScores) ?? null,
      catalystKind: (r["catalyst_kind"] as string) ?? "NONE",
      strongestCatalyst: (r["strongest_catalyst"] as string) ?? null,
      strongestBearCase: (r["strongest_bear_case"] as string) ?? null,
      status: (r["status"] as string) ?? "unknown",
    });
    out.set(mint, list);
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

export interface BenchmarkPlan {
  fullCohortPasses: number;
  stabilityPasses: number;
  concurrency: number;
  synthesisCallsExecuted: number;
  reusedSamples: number;
}

export function buildBenchmarkComparison(args: {
  base: ThesisBenchmarkResult;
  access: { selectedModel: string | null; usedFallback: boolean; attempts: OpenAiModelAccessAttempt[] };
  baselines: FrozenThesisBaseline[];
  samplesByMint: Map<string, BenchmarkRunSample[]>;
  stabilityMints: Set<string>;
  plan: BenchmarkPlan;
  executed: ThesisBatchResult[];
  cohortRunId: string;
  cohortModel: string | null;
  pairByMint: Map<string, string | null>;
}): ThesisBenchmarkResult {
  const { base, access, baselines, cohortRunId, cohortModel, pairByMint, plan, executed } = args;
  const batches = executed;

  const comparisons: BenchmarkCandidateComparison[] = baselines.map((b) => {
    const target = args.stabilityMints.has(b.mint) ? plan.stabilityPasses : plan.fullCohortPasses;
    const samples: BenchmarkRunSample[] = (args.samplesByMint.get(b.mint) ?? []).slice(0, target);


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
      catalystDisagreement: samples.some(
        (s) => (s.catalystKind || "NONE") !== (b.catalystKind || "NONE"),
      ),
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
