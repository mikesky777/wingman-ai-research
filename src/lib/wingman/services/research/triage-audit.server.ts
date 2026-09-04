/**
 * Calibration audit orchestration (server-only, analytical).
 *
 * Executes N identical calibration triage runs over one immutable packet
 * universe plus one presentation-order-shuffled run, then reports grounding,
 * missing-evidence handling, semantic bias, comparative value and stability.
 *
 * It never runs production triage, never writes milestones, never touches
 * scanner selection, Quantitative Research Priority or history.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAiTriage, type TriageRunResult } from "./triage.server";
import {
  TRIAGE_INPUT_POLICY_VERSION,
  TRIAGE_POLICY_VERSION,
  TRIAGE_PROMPT_VERSION,
  TRIAGE_REDACTED_KEYS,
  type ComparedDecision,
} from "./triage";
import {
  auditBias,
  auditClaims,
  auditComparativeValue,
  auditMissingEvidence,
  buildStabilityReport,
} from "./triage-audit";

export interface TriageAuditRunSummary {
  index: number;
  label: string;
  triageRunId: string | null;
  shuffleSeed: number | null;
  status: string;
  code: string;
  packetCount: number;
  deepResearchCount: number;
  watchCount: number;
  skipCount: number;
  blockedCount: number;
  promptBytes: number;
  responseBytes: number | null;
  providerLatencyMs: number | null;
  providerUsage: Record<string, unknown> | null;
  milestonesCreated: number;
  error: string | null;
}

export interface TriageAuditReport {
  sourceScanId: string | null;
  policy: {
    triagePolicyVersion: string;
    promptVersion: string;
    inputPolicyVersion: string;
    redactedFromModelInput: string[];
    modelProvider: string | null;
    modelIdentifier: string | null;
  };
  runs: TriageAuditRunSummary[];
  primary: {
    claims: ReturnType<typeof auditClaims>;
    missingEvidence: ReturnType<typeof auditMissingEvidence>;
    bias: ReturnType<typeof auditBias>;
    comparative: ReturnType<typeof auditComparativeValue>;
  } | null;
  stability: ReturnType<typeof buildStabilityReport> | null;
  shuffled: {
    deepResearchCount: number;
    shortlistOverlapPctVsPrimary: number;
    top5OverlapPctVsPrimary: number;
    top10OverlapPctVsPrimary: number;
    rankCorrelationVsPrimary: number | null;
    decisionAgreementPct: number;
  } | null;
  claimsAcrossAllRuns: ReturnType<typeof auditClaims>;
  milestonesCreatedTotal: number;
  milestoneAuditWindowStart: string;
  aiShortlistMilestonesDuringAudit: number;
  errors: string[];
}

function overlapPct(a: string[], b: string[]): number {
  const union = new Set([...a, ...b]).size;
  if (union === 0) return 100;
  const setB = new Set(b);
  return Math.round((a.filter((x) => setB.has(x)).length / union) * 1000) / 10;
}

function spearmanPairs(a: ComparedDecision[], b: ComparedDecision[]): number | null {
  const mapB = new Map(b.map((d) => [d.mint, d.triageRank]));
  const shared = a.filter((d) => mapB.has(d.mint));
  if (shared.length < 2) return null;
  const xs = shared.map((d) => d.triageRank);
  const ys = shared.map((d) => mapB.get(d.mint)!);
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    dx += (xs[i]! - mx) ** 2;
    dy += (ys[i]! - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 1000) / 1000;
}

function summarize(result: TriageRunResult, index: number, label: string): TriageAuditRunSummary {
  return {
    index,
    label,
    triageRunId: result.triageRunId,
    shuffleSeed: result.shuffleSeed,
    status: result.status,
    code: result.code,
    packetCount: result.packetCount,
    deepResearchCount: result.deepResearchCount,
    watchCount: result.watchCount,
    skipCount: result.skipCount,
    blockedCount: result.blockedCount,
    promptBytes: result.promptBytes,
    responseBytes: result.responseBytes,
    providerLatencyMs: result.providerLatencyMs,
    providerUsage: result.providerUsage,
    milestonesCreated: result.shortlistMilestonesCreated,
    error: result.error,
  };
}

export interface RunTriageAuditOptions {
  runs?: number;
  includeShuffled?: boolean;
  scanRunId?: string | null;
  shuffleSeed?: number;
}

/** Count AI_SHORTLIST milestones created since a timestamp — must stay 0. */
async function countShortlistMilestonesSince(since: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("token_stage_milestones")
    .select("id", { count: "exact", head: true })
    .eq("stage", "AI_SHORTLIST")
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function runTriageCalibrationAudit(
  options: RunTriageAuditOptions = {},
): Promise<TriageAuditReport> {
  const runCount = Math.max(1, Math.min(options.runs ?? 5, 8));
  const includeShuffled = options.includeShuffled ?? true;
  const windowStart = new Date().toISOString();
  const errors: string[] = [];

  const results: TriageRunResult[] = [];
  const summaries: TriageAuditRunSummary[] = [];
  let scanRunId = options.scanRunId ?? null;

  for (let i = 0; i < runCount; i += 1) {
    const result = await runAiTriage({ mode: "CALIBRATION", scanRunId });
    scanRunId = scanRunId ?? result.sourceScanId;
    results.push(result);
    summaries.push(summarize(result, i + 1, `calibration-${i + 1}`));
    if (result.status !== "completed") errors.push(`run ${i + 1}: ${result.code} ${result.error ?? ""}`);
  }

  let shuffledResult: TriageRunResult | null = null;
  if (includeShuffled) {
    shuffledResult = await runAiTriage({
      mode: "CALIBRATION",
      scanRunId,
      shuffleSeed: options.shuffleSeed ?? 7919,
    });
    results.push(shuffledResult);
    summaries.push(summarize(shuffledResult, runCount + 1, "calibration-shuffled"));
    if (shuffledResult.status !== "completed") {
      errors.push(`shuffled run: ${shuffledResult.code} ${shuffledResult.error ?? ""}`);
    }
  }

  const completed = results.filter((r) => r.status === "completed");
  const identicalOrderRuns = completed
    .filter((r) => r.shuffleSeed === null)
    .map((r) => r.decisions);
  const primaryDecisions = identicalOrderRuns[0] ?? null;

  const primary = primaryDecisions
    ? {
        claims: auditClaims(primaryDecisions),
        missingEvidence: auditMissingEvidence(primaryDecisions),
        bias: auditBias(primaryDecisions),
        comparative: auditComparativeValue(primaryDecisions),
      }
    : null;

  const stability = identicalOrderRuns.length >= 2 ? buildStabilityReport(identicalOrderRuns) : null;

  let shuffled: TriageAuditReport["shuffled"] = null;
  if (shuffledResult?.status === "completed" && primaryDecisions) {
    const a = primaryDecisions;
    const b = shuffledResult.decisions;
    const deepA = a.filter((d) => d.decision === "DEEP_RESEARCH").map((d) => d.mint);
    const deepB = b.filter((d) => d.decision === "DEEP_RESEARCH").map((d) => d.mint);
    const topN = (rows: ComparedDecision[], n: number) =>
      [...rows].sort((x, y) => x.triageRank - y.triageRank).slice(0, n).map((d) => d.mint);
    const mapB = new Map(b.map((d) => [d.mint, d.decision]));
    const agree = a.filter((d) => mapB.get(d.mint) === d.decision).length;
    shuffled = {
      deepResearchCount: deepB.length,
      shortlistOverlapPctVsPrimary: overlapPct(deepA, deepB),
      top5OverlapPctVsPrimary: overlapPct(topN(a, 5), topN(b, 5)),
      top10OverlapPctVsPrimary: overlapPct(topN(a, 10), topN(b, 10)),
      rankCorrelationVsPrimary: spearmanPairs(a, b),
      decisionAgreementPct: a.length ? Math.round((agree / a.length) * 1000) / 10 : 0,
    };
  }

  const allDecisions = completed.flatMap((r) => r.decisions);
  const milestonesTotal = results.reduce((s, r) => s + r.shortlistMilestonesCreated, 0);

  return {
    sourceScanId: scanRunId,
    policy: {
      triagePolicyVersion: TRIAGE_POLICY_VERSION,
      promptVersion: TRIAGE_PROMPT_VERSION,
      inputPolicyVersion: TRIAGE_INPUT_POLICY_VERSION,
      redactedFromModelInput: [...TRIAGE_REDACTED_KEYS],
      modelProvider: completed[0]?.modelProvider ?? null,
      modelIdentifier: completed[0]?.modelIdentifier ?? null,
    },
    runs: summaries,
    primary,
    stability,
    shuffled,
    claimsAcrossAllRuns: auditClaims(allDecisions),
    milestonesCreatedTotal: milestonesTotal,
    milestoneAuditWindowStart: windowStart,
    aiShortlistMilestonesDuringAudit: await countShortlistMilestonesSince(windowStart),
    errors,
  };
}
