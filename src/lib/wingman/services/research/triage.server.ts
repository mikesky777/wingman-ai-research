/**
 * AI Triage orchestration (server-only).
 *
 * Production triage may run ONLY against a scan that satisfies the AI
 * scan-source invariant. There is no fallback to legacy scans, failed scans,
 * stale packets or historical candidate universes: when nothing qualifies the
 * answer is NO_ELIGIBLE_CURRENT_SCAN.
 *
 * Calibration / dry-run exists to validate model behaviour against a
 * historical packet universe. It is visually and structurally marked, never
 * creates milestones, and never mutates scanner, history or outcome state.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAiStageMilestone } from "../history/milestones.server";
import { SELECTION_POLICY_VERSION } from "../history/policy-epochs";
import { selectAiScanSource, type AiScanSourceCandidate, type AiScanSourceResult } from "./ai-scan-source";
import { assessResearchEligibility } from "./packet";
import { chunkIds, fetchAllPages, loadCurrentMarkets, loadRunCandidates } from "./packet.server";
import {
  createLovableTriageProvider,
  parseModelJson,
  type AiTriageProvider,
} from "./triage-provider.server";
import {
  TRIAGE_CONFIG,
  TRIAGE_POLICY_VERSION,
  TRIAGE_PROMPT_VERSION,
  analyzeCalibration,
  buildCohortSummary,
  buildTriagePrompt,
  compareWithQuant,
  inputPolicyVersionFor,
  orderCandidates,
  validateTriageOutput,
  withQuantRanks,
  type CalibrationAnalysis,
  extractPacketIdentity,
  type ComparedDecision,
  type TriageCandidateInput,
  type TriageInputAblation,
  type TriageMode,
} from "./triage";
import type { CandidateSource, ExclusionReason } from "./types";

type Row = Record<string, unknown>;

/** Flat, serializable provider usage counters as reported by the provider. */
export type TriageUsage = Record<string, number | string | null>;

function sanitizeUsage(usage: unknown): TriageUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const out: TriageUsage = {};
  for (const [key, value] of Object.entries(usage as Record<string, unknown>)) {
    if (typeof value === "number" || typeof value === "string" || value === null) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

export type TriageRunStatus =
  | "completed"
  | "failed"
  | "failed_validation"
  | "no_eligible_current_scan";

export interface TriageRunResult {
  mode: TriageMode;
  status: TriageRunStatus;
  code: "OK" | "NO_ELIGIBLE_CURRENT_SCAN" | "PROVIDER_FAILED" | "VALIDATION_FAILED" | "NO_CANDIDATES";
  triageRunId: string | null;
  sourceScanId: string | null;
  scannerPolicyVersion: string | null;
  triagePolicyVersion: string;
  promptVersion: string;
  modelProvider: string | null;
  modelIdentifier: string | null;
  isCalibration: boolean;
  packetCount: number;
  deepResearchCount: number;
  watchCount: number;
  skipCount: number;
  blockedCount: number;
  shortlistMilestonesCreated: number;
  promptBytes: number;
  /** Input-serialization policy actually applied to the model input. */
  inputPolicyVersion: string;
  /** Calibration presentation-order seed, null for natural packet order. */
  shuffleSeed: number | null;
  /** Wall-clock duration of the provider call, ms. */
  providerLatencyMs: number | null;
  /** Provider-reported token usage, verbatim. Never fabricated. */
  providerUsage: TriageUsage | null;
  responseBytes: number | null;
  decisions: ComparedDecision[];
  blockedMints: { mint: string; reasons: ExclusionReason[] }[];
  calibration: CalibrationAnalysis | null;
  eligibility: AiScanSourceResult | null;
  error: string | null;
}

/** Runs with their packet counts, for the scan-source invariant. */
async function loadScanSourceCandidates(limit = 25): Promise<AiScanSourceCandidate[]> {
  const { data, error } = await supabaseAdmin
    .from("scan_runs")
    .select(
      "id, status, started_at, completed_at, tokens_discovered, discovery_health, selection_policy_version, policy_epoch",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const runs = (data ?? []) as Row[];
  const counts = await packetCountsByRun(runs.map((r) => r["id"] as string));
  return runs.map((r) => ({
    id: r["id"] as string,
    status: (r["status"] as string) ?? "unknown",
    startedAt: (r["started_at"] as string) ?? null,
    completedAt: (r["completed_at"] as string) ?? null,
    tokensDiscovered: (r["tokens_discovered"] as number) ?? 0,
    discoveryHealth: (r["discovery_health"] as string) ?? null,
    selectionPolicyVersion: (r["selection_policy_version"] as string) ?? null,
    policyEpoch: (r["policy_epoch"] as string) ?? null,
    researchPacketCount: counts.get(r["id"] as string) ?? 0,
  }));
}

async function packetCountsByRun(runIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const ids of chunkIds(runIds)) {
    const rows = await fetchAllPages((from, to) =>
      supabaseAdmin.from("research_packets").select("scan_run_id").in("scan_run_id", ids).range(from, to),
    );
    for (const r of rows) {
      const id = r["scan_run_id"] as string;
      out.set(id, (out.get(id) ?? 0) + 1);
    }
  }
  return out;
}

interface LoadedPacketRow {
  packetId: string;
  tokenId: string;
  mint: string;
  candidateSource: CandidateSource;
  packetVersion: string;
  compact: Record<string, unknown>;
  generatedAt: string;
}

/** Newest packet per exact mint for one scan. Paginated, deduplicated. */
async function loadPacketsForRun(scanRunId: string): Promise<LoadedPacketRow[]> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("research_packets")
      .select(
        "id, token_id, contract_address, candidate_source, packet_version, compact, generated_at",
      )
      .eq("scan_run_id", scanRunId)
      .order("generated_at", { ascending: false })
      .range(from, to),
  );
  const byMint = new Map<string, LoadedPacketRow>();
  for (const r of rows) {
    const mint = (r["contract_address"] as string) ?? "";
    if (!mint || byMint.has(mint)) continue;
    byMint.set(mint, {
      packetId: r["id"] as string,
      tokenId: r["token_id"] as string,
      mint,
      candidateSource: ((r["candidate_source"] as string) ?? "EXPLORATION") as CandidateSource,
      packetVersion: (r["packet_version"] as string) ?? "unknown",
      compact: ((r["compact"] as Record<string, unknown>) ?? {}),
      generatedAt: (r["generated_at"] as string) ?? "",
    });
  }
  return [...byMint.values()];
}

/** The newest run that actually has packets — calibration source only. */
async function latestRunWithPackets(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("research_packets")
    .select("scan_run_id, generated_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ((data as Row)["scan_run_id"] as string) : null;
}

export interface RunAiTriageOptions {
  mode?: TriageMode;
  /** Calibration only: which historical scan's packet universe to replay. */
  scanRunId?: string | null;
  maxDeepResearch?: number;
  provider?: AiTriageProvider;
  /**
   * Calibration only: deterministically reorder candidate presentation to test
   * whether presentation order changes the result. Quant ranks are computed
   * before reordering, so the evidence itself is identical.
   */
  shuffleSeed?: number | null;
  /**
   * Calibration only: ablate what the model may see (scanner provenance, setup
   * label, counterfactual source labels). Rejected for production input.
   */
  ablation?: TriageInputAblation | null;
}

/**
 * Execute one triage pass. Never throws for an expected operational outcome —
 * ineligibility, provider failure and schema failure all resolve to a
 * persisted, explicit result.
 */
export async function runAiTriage(options: RunAiTriageOptions = {}): Promise<TriageRunResult> {
  const mode: TriageMode = options.mode ?? "PRODUCTION";
  const isCalibration = mode === "CALIBRATION";
  const maxDeepResearch = options.maxDeepResearch ?? TRIAGE_CONFIG.maxDeepResearch;
  // Standing input policy (ai_triage/v1.2): scanner-selection provenance is
  // hidden from the model. The Exploration source-bias audit showed triage
  // rationales citing "non-survivor routing" as a concern in its own right, so
  // triage no longer inherits the scanner's selection decision as a label. All
  // market/evidence facts, including SETUP, are unchanged, and provenance is
  // still persisted on every decision for analysis and UI.
  // Calibration may pass an explicit ablation (including an unblinded baseline).
  const ablation: TriageInputAblation | null = isCalibration
    ? (options.ablation ?? { blindSource: true })
    : { blindSource: true };
  const inputPolicyVersion = inputPolicyVersionFor(ablation);

  const base: TriageRunResult = {
    mode,
    status: "failed",
    code: "OK",
    triageRunId: null,
    sourceScanId: null,
    scannerPolicyVersion: null,
    triagePolicyVersion: TRIAGE_POLICY_VERSION,
    promptVersion: TRIAGE_PROMPT_VERSION,
    modelProvider: null,
    modelIdentifier: null,
    isCalibration,
    packetCount: 0,
    deepResearchCount: 0,
    watchCount: 0,
    skipCount: 0,
    blockedCount: 0,
    shortlistMilestonesCreated: 0,
    promptBytes: 0,
    inputPolicyVersion,
    shuffleSeed: options.shuffleSeed ?? null,
    providerLatencyMs: null,
    providerUsage: null,
    responseBytes: null,
    decisions: [],
    blockedMints: [],
    calibration: null,
    eligibility: null,
    error: null,
  };

  // 1. Source scan.
  let sourceScanId: string | null = null;
  let eligibility: AiScanSourceResult | null = null;

  if (isCalibration) {
    sourceScanId = options.scanRunId ?? (await latestRunWithPackets());
    if (!sourceScanId) {
      return { ...base, status: "failed", code: "NO_CANDIDATES", error: "No historical research packets to calibrate against." };
    }
  } else {
    eligibility = selectAiScanSource(await loadScanSourceCandidates(), SELECTION_POLICY_VERSION);
    if (!eligibility.ok) {
      const runId = await persistRun({
        sourceScanId: null,
        isCalibration,
        status: "no_eligible_current_scan",
        modelProvider: null,
        modelIdentifier: null,
        counts: { packet: 0, deep: 0, watch: 0, skip: 0, blocked: 0 },
        error: "NO_ELIGIBLE_CURRENT_SCAN",
        diagnostics: { rejections: eligibility.rejections },
        completed: true,
      });
      return {
        ...base,
        status: "no_eligible_current_scan",
        code: "NO_ELIGIBLE_CURRENT_SCAN",
        triageRunId: runId,
        eligibility,
      };
    }
    sourceScanId = eligibility.runId;
  }

  // 2. Packet universe for that exact scan, deduplicated by exact mint.
  const packets = await loadPacketsForRun(sourceScanId!);
  if (packets.length === 0) {
    return { ...base, sourceScanId, status: "failed", code: "NO_CANDIDATES", error: "No research packets for the source scan." };
  }

  // 3. CURRENT eligibility re-check — a historically eligible packet is not enough.
  const candidateRows = await loadRunCandidates(sourceScanId!);
  const byToken = new Map(candidateRows.map((c) => [c.tokenId, c]));
  const markets = await loadCurrentMarkets([...new Set(packets.map((p) => p.tokenId))]);

  const eligiblePackets: LoadedPacketRow[] = [];
  const blocked: { packet: LoadedPacketRow; reasons: ExclusionReason[] }[] = [];
  for (const p of packets) {
    const candidate = byToken.get(p.tokenId);
    if (!candidate) {
      eligiblePackets.push(p);
      continue;
    }
    const current1h = markets.get(p.tokenId)?.priceChange1h ?? candidate.priceChange1h;
    const verdict = assessResearchEligibility({ candidate, currentPriceChange1h: current1h });
    if (verdict.researchEligibleNow) eligiblePackets.push(p);
    else blocked.push({ packet: p, reasons: verdict.exclusionReasons });
  }

  if (eligiblePackets.length === 0) {
    return {
      ...base,
      sourceScanId,
      status: "failed",
      code: "NO_CANDIDATES",
      blockedCount: blocked.length,
      blockedMints: blocked.map((b) => ({ mint: b.packet.mint, reasons: b.reasons })),
      error: "Every packet in the universe is currently blocked.",
    };
  }

  const candidates: TriageCandidateInput[] = withQuantRanks(
    eligiblePackets.map((p) => ({
      mint: p.mint,
      candidateSource: p.candidateSource,
      researchPacketId: p.packetId,
      researchPacketVersion: p.packetVersion,
      quantPriority: byToken.get(p.tokenId)?.quantitativePriority ?? null,
      compact: p.compact,
    })),
  );

  const presented = orderCandidates(candidates, options.shuffleSeed ?? null);
  const cohort = buildCohortSummary(presented);
  const prompt = buildTriagePrompt({
    header: {
      scanId: sourceScanId!,
      scannerPolicyVersion: SELECTION_POLICY_VERSION,
      triagePolicyVersion: TRIAGE_POLICY_VERSION,
      promptVersion: TRIAGE_PROMPT_VERSION,
      mode,
      candidateCount: candidates.length,
      generatedAt: new Date().toISOString(),
      maxDeepResearch,
    },
    cohort,
    candidates: presented,
    ablation,
  });

  // 4. Provider.
  let provider = options.provider ?? null;
  if (!provider) {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { ...base, sourceScanId, status: "failed", code: "PROVIDER_FAILED", error: "Missing LOVABLE_API_KEY." };
    }
    provider = createLovableTriageProvider({ apiKey });
  }

  const triageRunId = await persistRun({
    sourceScanId,
    isCalibration,
    status: "running",
    modelProvider: provider.provider,
    modelIdentifier: provider.model,
    counts: { packet: candidates.length, deep: 0, watch: 0, skip: 0, blocked: blocked.length },
    error: null,
    diagnostics: { promptBytes: prompt.bytes, cohort },
    completed: false,
  });

  let responseText: string;
  let diagnostics: Record<string, unknown>;
  const providerStartedAt = Date.now();
  let providerLatencyMs: number | null = null;
  try {
    const response = await provider.complete({ system: prompt.system, user: prompt.user });
    providerLatencyMs = Date.now() - providerStartedAt;
    responseText = response.text;
    diagnostics = response.diagnostics;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(triageRunId, {
      status: "failed",
      error: message,
      counts: { packet: candidates.length, deep: 0, watch: 0, skip: 0, blocked: blocked.length },
      diagnostics: { providerError: message },
    });
    // Provider failure is NEVER "nothing worth researching": no decisions at all.
    return {
      ...base,
      sourceScanId,
      triageRunId,
      modelProvider: provider.provider,
      modelIdentifier: provider.model,
      packetCount: candidates.length,
      blockedCount: blocked.length,
      blockedMints: blocked.map((b) => ({ mint: b.packet.mint, reasons: b.reasons })),
      promptBytes: prompt.bytes,
      status: "failed",
      code: "PROVIDER_FAILED",
      error: message,
      eligibility,
    };
  }

  // 5. Strict schema validation.
  const parsed = parseModelJson(responseText);
  const validation = validateTriageOutput(
    parsed,
    candidates.map((c) => c.mint),
    maxDeepResearch,
  );
  if (!validation.ok) {
    await finishRun(triageRunId, {
      status: "failed_validation",
      error: validation.errors.map((e) => `${e.code}:${e.detail}`).slice(0, 20).join("; "),
      counts: { packet: candidates.length, deep: 0, watch: 0, skip: 0, blocked: blocked.length },
      diagnostics: { validationErrors: validation.errors, rawResponse: responseText.slice(0, 20000), providerDiagnostics: diagnostics },
    });
    return {
      ...base,
      sourceScanId,
      triageRunId,
      modelProvider: provider.provider,
      modelIdentifier: provider.model,
      packetCount: candidates.length,
      blockedCount: blocked.length,
      blockedMints: blocked.map((b) => ({ mint: b.packet.mint, reasons: b.reasons })),
      promptBytes: prompt.bytes,
      status: "failed_validation",
      code: "VALIDATION_FAILED",
      error: validation.errors.map((e) => e.code).join(", "),
      eligibility,
    };
  }

  const compared = compareWithQuant(validation.decisions, candidates);
  const deep = compared.filter((d) => d.decision === "DEEP_RESEARCH");
  const watch = compared.filter((d) => d.decision === "WATCH").length;
  const skip = compared.filter((d) => d.decision === "SKIP").length;

  // 6. Persist decisions (append-only) including blocked candidates.
  const tokenIdByMint = new Map(packets.map((p) => [p.mint, p.tokenId]));
  await persistDecisions(
    triageRunId,
    compared.map((d) => ({ ...d, tokenId: tokenIdByMint.get(d.mint) ?? null })),
  );
  await persistDecisions(
    triageRunId,
    blocked.map((b) => ({
      mint: b.packet.mint,
      tokenId: b.packet.tokenId,
      decision: "BLOCKED_BEFORE_SHORTLIST" as const,
      confidence: null,
      rationale: `Operationally blocked before shortlist: ${b.reasons.join(", ")}`,
      strongestPositive: null,
      strongestConcern: null,
      unresolvedQuestions: [],
      requestedResearchDomains: [],
      triageRank: null,
      quantRank: null,
      quantPriority: null,
      rankDelta: null,
      candidateSource: b.packet.candidateSource,
      researchPacketId: b.packet.packetId,
      researchPacketVersion: b.packet.packetVersion,
      setup: null,
      priceStructure: null,
      participation: null,
    })),
  );

  // 7. AI_SHORTLIST milestones — production DEEP_RESEARCH only, idempotent.
  let milestones = 0;
  if (!isCalibration) {
    const nowIso = new Date().toISOString();
    for (const d of deep) {
      const tokenId = tokenIdByMint.get(d.mint);
      if (!tokenId) continue;
      const candidate = byToken.get(tokenId);
      const market = markets.get(tokenId) ?? null;
      await recordAiStageMilestone({
        stage: "AI_SHORTLIST",
        tokenId,
        contractAddress: d.mint,
        chain: candidate?.chain ?? "solana",
        enteredAt: nowIso,
        setups: candidate?.lanes ?? [],
        marketCap: market?.marketCap ?? candidate?.marketCap ?? null,
        priceUsd: market?.priceUsd ?? candidate?.priceUsd ?? null,
        liquidityUsd: market?.liquidityUsd ?? candidate?.liquidityUsd ?? null,
        policyEpoch: "CURRENT_V1",
        aiPolicyVersion: TRIAGE_POLICY_VERSION,
        researchModelVersion: `${provider.provider}:${provider.model}`,
        provenance: {
          sourceType: "AI_TRIAGE",
          sourceId: triageRunId,
          sourceRef: `ai_triage_runs:${triageRunId}`,
          sourceScanId,
          researchPacketId: d.researchPacketId,
          researchPacketVersion: d.researchPacketVersion,
          researchRunId: triageRunId,
          policyVersion: TRIAGE_POLICY_VERSION,
        },
      });
      milestones += 1;
    }
  }

  await finishRun(triageRunId, {
    status: "completed",
    error: null,
    counts: {
      packet: candidates.length,
      deep: deep.length,
      watch,
      skip,
      blocked: blocked.length,
    },
    diagnostics: {
      promptBytes: prompt.bytes,
      responseBytes: new TextEncoder().encode(responseText).length,
      providerLatencyMs,
      inputPolicyVersion,
      ablation,
      shuffleSeed: options.shuffleSeed ?? null,
      providerDiagnostics: diagnostics,
      cohort,
    },
  });

  return {
    mode,
    status: "completed",
    code: "OK",
    triageRunId,
    sourceScanId,
    scannerPolicyVersion: SELECTION_POLICY_VERSION,
    triagePolicyVersion: TRIAGE_POLICY_VERSION,
    promptVersion: TRIAGE_PROMPT_VERSION,
    modelProvider: provider.provider,
    modelIdentifier: provider.model,
    isCalibration,
    packetCount: candidates.length,
    deepResearchCount: deep.length,
    watchCount: watch,
    skipCount: skip,
    blockedCount: blocked.length,
    shortlistMilestonesCreated: milestones,
    promptBytes: prompt.bytes,
    inputPolicyVersion,
    shuffleSeed: options.shuffleSeed ?? null,
    providerLatencyMs,
    providerUsage: sanitizeUsage(diagnostics["usage"]),
    responseBytes: new TextEncoder().encode(responseText).length,
    decisions: compared,
    blockedMints: blocked.map((b) => ({ mint: b.packet.mint, reasons: b.reasons })),
    calibration: analyzeCalibration(compared),
    eligibility,
    error: null,
  };
}

async function persistRun(input: {
  sourceScanId: string | null;
  isCalibration: boolean;
  status: string;
  modelProvider: string | null;
  modelIdentifier: string | null;
  counts: { packet: number; deep: number; watch: number; skip: number; blocked: number };
  error: string | null;
  diagnostics: Record<string, unknown>;
  completed: boolean;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("ai_triage_runs")
    .insert({
      source_scan_id: input.sourceScanId,
      scanner_policy_version: SELECTION_POLICY_VERSION,
      triage_policy_version: TRIAGE_POLICY_VERSION,
      model_provider: input.modelProvider,
      model_identifier: input.modelIdentifier,
      prompt_version: TRIAGE_PROMPT_VERSION,
      is_calibration: input.isCalibration,
      status: input.status,
      packet_count: input.counts.packet,
      deep_research_count: input.counts.deep,
      watch_count: input.counts.watch,
      skip_count: input.counts.skip,
      blocked_count: input.counts.blocked,
      error: input.error,
      diagnostics: input.diagnostics,
      completed_at: input.completed ? new Date().toISOString() : null,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as Row)["id"] as string;
}

async function finishRun(
  triageRunId: string,
  input: {
    status: TriageRunStatus;
    error: string | null;
    counts: { packet: number; deep: number; watch: number; skip: number; blocked: number };
    diagnostics: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("ai_triage_runs")
    .update({
      status: input.status,
      error: input.error,
      completed_at: new Date().toISOString(),
      packet_count: input.counts.packet,
      deep_research_count: input.counts.deep,
      watch_count: input.counts.watch,
      skip_count: input.counts.skip,
      blocked_count: input.counts.blocked,
      diagnostics: input.diagnostics,
    } as never)
    .eq("id", triageRunId);
  if (error) throw new Error(error.message);
}

interface PersistableDecision {
  mint: string;
  tokenId: string | null;
  decision: string;
  confidence: string | null;
  rationale: string | null;
  strongestPositive: string | null;
  strongestConcern: string | null;
  unresolvedQuestions: string[];
  requestedResearchDomains: string[];
  triageRank: number | null;
  quantRank: number | null;
  quantPriority: number | null;
  rankDelta: number | null;
  candidateSource: string;
  researchPacketId: string | null;
  researchPacketVersion: string;
  setup: string | null;
  priceStructure: string | null;
  participation: string | null;
}

/** Append-only. An existing decision for this run + mint is never overwritten. */
async function persistDecisions(triageRunId: string, rows: PersistableDecision[]): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((d) => ({
    triage_run_id: triageRunId,
    token_id: d.tokenId,
    mint: d.mint,
    research_packet_id: d.researchPacketId,
    research_packet_version: d.researchPacketVersion,
    candidate_source: d.candidateSource,
    quant_priority: d.quantPriority,
    quant_rank: d.quantRank,
    triage_rank: d.triageRank,
    rank_delta: d.rankDelta,
    decision: d.decision,
    confidence: d.confidence,
    rationale: d.rationale,
    strongest_positive: d.strongestPositive,
    strongest_concern: d.strongestConcern,
    unresolved_questions: d.unresolvedQuestions,
    requested_research_domains: d.requestedResearchDomains,
    setup: d.setup,
    price_structure: d.priceStructure,
    participation: d.participation,
  }));
  for (const chunk of chunkIds(payload, 100)) {
    const { error } = await supabaseAdmin
      .from("ai_triage_decisions")
      .upsert(chunk as never, { onConflict: "triage_run_id,mint", ignoreDuplicates: true });
    if (error) throw new Error(`Could not persist triage decisions: ${error.message}`);
  }
}

export interface TriageRunSummary {
  id: string;
  sourceScanId: string | null;
  isCalibration: boolean;
  status: string;
  startedAt: string;
  completedAt: string | null;
  packetCount: number;
  deepResearchCount: number;
  watchCount: number;
  skipCount: number;
  blockedCount: number;
  triagePolicyVersion: string | null;
  promptVersion: string | null;
  modelProvider: string | null;
  modelIdentifier: string | null;
  error: string | null;
}

export interface PersistedTriageDecision {
  mint: string;
  /** Token identity from the exact persisted Research Packet the triage read. */
  symbol: string | null;
  name: string | null;
  pairAddress: string | null;
  candidateSource: string | null;
  setup: string | null;
  decision: string;
  confidence: string | null;
  quantPriority: number | null;
  quantRank: number | null;
  triageRank: number | null;
  rankDelta: number | null;
  rationale: string | null;
  strongestPositive: string | null;
  strongestConcern: string | null;
  unresolvedQuestions: string[];
  requestedResearchDomains: string[];
  researchPacketId: string | null;
  researchPacketVersion: string | null;
  priceStructure: string | null;
  participation: string | null;
}

/** Newest persisted triage run plus its decisions. Read-only. */
export async function loadLatestTriage(): Promise<{
  run: TriageRunSummary;
  decisions: PersistedTriageDecision[];
} | null> {
  const { data, error } = await supabaseAdmin
    .from("ai_triage_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Row;
  const run: TriageRunSummary = {
    id: r["id"] as string,
    sourceScanId: (r["source_scan_id"] as string) ?? null,
    isCalibration: Boolean(r["is_calibration"]),
    status: (r["status"] as string) ?? "unknown",
    startedAt: (r["started_at"] as string) ?? "",
    completedAt: (r["completed_at"] as string) ?? null,
    packetCount: (r["packet_count"] as number) ?? 0,
    deepResearchCount: (r["deep_research_count"] as number) ?? 0,
    watchCount: (r["watch_count"] as number) ?? 0,
    skipCount: (r["skip_count"] as number) ?? 0,
    blockedCount: (r["blocked_count"] as number) ?? 0,
    triagePolicyVersion: (r["triage_policy_version"] as string) ?? null,
    promptVersion: (r["prompt_version"] as string) ?? null,
    modelProvider: (r["model_provider"] as string) ?? null,
    modelIdentifier: (r["model_identifier"] as string) ?? null,
    error: (r["error"] as string) ?? null,
  };

  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("ai_triage_decisions")
      .select("*")
      .eq("triage_run_id", run.id)
      .order("triage_rank", { ascending: true, nullsFirst: false })
      .range(from, to),
  );
  // Resolve token identity from the exact persisted Research Packet each
  // decision referenced. Read-only: never changes decisions or packets.
  const packetIds = [
    ...new Set(
      rows
        .map((d) => (d["research_packet_id"] as string) ?? null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const identityByPacketId = new Map<
    string,
    { symbol: string | null; name: string | null; pairAddress: string | null; packetMint: string | null }
  >();
  if (packetIds.length) {
    for (const chunk of chunkIds(packetIds)) {
      const { data: packets, error: packetError } = await supabaseAdmin
        .from("research_packets")
        .select("id, packet")
        .in("id", chunk);
      if (packetError) throw new Error(packetError.message);
      for (const p of packets ?? []) {
        const idn = extractPacketIdentity(p["packet"]);
        // Only trust identity when the packet's own mint matches the decision's.
        identityByPacketId.set(p["id"] as string, {
          symbol: idn.symbol,
          name: idn.name,
          pairAddress: idn.pairAddress,
          packetMint: idn.packetMint,
        });
      }
    }
  }

  const decisions: PersistedTriageDecision[] = rows.map((d) => ({
    mint: d["mint"] as string,
    ...(() => {
      const mint = d["mint"] as string;
      const pid = (d["research_packet_id"] as string) ?? null;
      const idn = pid ? identityByPacketId.get(pid) : undefined;
      // Same-ticker safety: identity is only shown when the packet's own mint
      // matches this decision's exact mint.
      const trusted = idn && (!idn.packetMint || idn.packetMint === mint) ? idn : undefined;
      return {
        symbol: trusted?.symbol ?? null,
        name: trusted?.name ?? null,
        pairAddress: trusted?.pairAddress ?? null,
      };
    })(),
    candidateSource: (d["candidate_source"] as string) ?? null,
    setup: (d["setup"] as string) ?? null,
    decision: d["decision"] as string,
    confidence: (d["confidence"] as string) ?? null,
    quantPriority: (d["quant_priority"] as number) ?? null,
    quantRank: (d["quant_rank"] as number) ?? null,
    triageRank: (d["triage_rank"] as number) ?? null,
    rankDelta: (d["rank_delta"] as number) ?? null,
    rationale: (d["rationale"] as string) ?? null,
    strongestPositive: (d["strongest_positive"] as string) ?? null,
    strongestConcern: (d["strongest_concern"] as string) ?? null,
    unresolvedQuestions: (d["unresolved_questions"] as string[]) ?? [],
    requestedResearchDomains: (d["requested_research_domains"] as string[]) ?? [],
    researchPacketId: (d["research_packet_id"] as string) ?? null,
    researchPacketVersion: (d["research_packet_version"] as string) ?? null,
    priceStructure: (d["price_structure"] as string) ?? null,
    participation: (d["participation"] as string) ?? null,
  }));

  return { run, decisions };
}
