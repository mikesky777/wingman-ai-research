/**
 * Exploration source-bias ablation executor (server-only, CALIBRATION ONLY).
 *
 * Every run here is a calibration run over the SAME immutable historical
 * packet cohort: it never touches production policy, never writes milestones
 * or history, and never changes scanner selection or Quantitative Research
 * Priority. Only what the model is allowed to SEE varies between variants.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAiTriage, type TriageRunResult, type TriageUsage } from "./triage.server";
import type { TriageInputAblation } from "./triage";
import {
  chooseCounterfactualPairs,
  swapMapFor,
  type AblationVariant,
  type CounterfactualPair,
  type PairCandidate,
} from "./triage-ablation";

export interface AblationRunSummary {
  variant: AblationVariant;
  index: number;
  triageRunId: string | null;
  inputPolicyVersion: string;
  status: string;
  code: string;
  packetCount: number;
  deepResearchCount: number;
  watchCount: number;
  skipCount: number;
  promptBytes: number;
  responseBytes: number | null;
  providerLatencyMs: number | null;
  providerUsage: TriageUsage | null;
  milestonesCreated: number;
  error: string | null;
}

export interface AblationBatchResult {
  variant: AblationVariant;
  sourceScanId: string | null;
  ablation: TriageInputAblation | null;
  counterfactualPairs: CounterfactualPair[];
  runs: AblationRunSummary[];
  milestonesCreatedTotal: number;
  aiShortlistMilestonesDuringBatch: number;
}

function summarize(
  variant: AblationVariant,
  index: number,
  result: TriageRunResult,
): AblationRunSummary {
  return {
    variant,
    index,
    triageRunId: result.triageRunId,
    inputPolicyVersion: result.inputPolicyVersion,
    status: result.status,
    code: result.code,
    packetCount: result.packetCount,
    deepResearchCount: result.deepResearchCount,
    watchCount: result.watchCount,
    skipCount: result.skipCount,
    promptBytes: result.promptBytes,
    responseBytes: result.responseBytes,
    providerLatencyMs: result.providerLatencyMs,
    providerUsage: result.providerUsage,
    milestonesCreated: result.shortlistMilestonesCreated,
    error: result.error,
  };
}

/** Read the cohort's source labels and scale metrics, for counterfactual pairing. */
export async function loadPairCandidates(scanRunId: string): Promise<PairCandidate[]> {
  const { data, error } = await supabaseAdmin
    .from("research_packets")
    .select("contract_address, candidate_source, compact")
    .eq("scan_run_id", scanRunId)
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const compact = (row as Record<string, unknown>)["compact"] as Record<string, unknown>;
    const mkt = (compact?.["mkt"] ?? {}) as Record<string, unknown>;
    return {
      mint: (row as Record<string, unknown>)["contract_address"] as string,
      candidateSource: (row as Record<string, unknown>)["candidate_source"] as string,
      marketCap: typeof mkt["mc"] === "number" ? (mkt["mc"] as number) : null,
      liquidityUsd: typeof mkt["liq"] === "number" ? (mkt["liq"] as number) : null,
    };
  });
}

async function latestScanWithPackets(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("research_packets")
    .select("scan_run_id, generated_at")
    .order("generated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0]?.["scan_run_id"] as string | undefined) ?? null;
}

async function countShortlistMilestonesSince(since: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("token_stage_milestones")
    .select("id", { count: "exact", head: true })
    .eq("stage", "AI_SHORTLIST")
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface RunAblationBatchOptions {
  variant: AblationVariant;
  runs?: number;
  scanRunId?: string | null;
  /** COUNTERFACTUAL_SOURCE only: how many Exploration/Survivor pairs to swap. */
  pairCount?: number;
}

/**
 * Run one ablation variant N times over a single historical cohort. Runs are
 * sequential so every run sees the identical cohort and provider conditions.
 */
export async function runTriageAblationBatch(
  options: RunAblationBatchOptions,
): Promise<AblationBatchResult> {
  const variant = options.variant;
  const runs = Math.min(Math.max(options.runs ?? 3, 1), 5);
  const startedAt = new Date().toISOString();

  // Anchor every variant to one scan so the cohort is identical throughout.
  let scanRunId = options.scanRunId ?? null;
  if (!scanRunId) scanRunId = await latestScanWithPackets();
  if (!scanRunId) throw new Error("No historical research packets to calibrate against.");

  let ablation: TriageInputAblation | null = null;
  let pairs: CounterfactualPair[] = [];

  if (variant === "SOURCE_BLIND") ablation = { blindSource: true };
  if (variant === "NEUTRAL_SETUP") ablation = { neutralSetup: true };
  if (variant === "COUNTERFACTUAL_SOURCE") {
    const candidates = await loadPairCandidates(scanRunId!);
    pairs = chooseCounterfactualPairs(candidates, options.pairCount ?? 3);
    ablation = { sourceLabelOverrides: swapMapFor(pairs) };
  }

  const summaries: AblationRunSummary[] = [];
  for (let i = 0; i < runs; i += 1) {
    const result = await runAiTriage({
      mode: "CALIBRATION",
      scanRunId,
      ablation,
    });
    summaries.push(summarize(variant, i + 1, result));
  }

  return {
    variant,
    sourceScanId: scanRunId,
    ablation,
    counterfactualPairs: pairs,
    runs: summaries,
    milestonesCreatedTotal: summaries.reduce((sum, r) => sum + r.milestonesCreated, 0),
    aiShortlistMilestonesDuringBatch: await countShortlistMilestonesSince(startedAt),
  };
}
