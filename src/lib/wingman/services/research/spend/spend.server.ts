/**
 * research_spend_policy/v1 — server side (persistence, prior-artifact
 * resolution, budget accounting, transaction-safe claiming).
 *
 * Nothing here changes Scanner, Packets, Triage decisions or Thesis policy.
 * It only decides whether the pipeline pays for external Deep Research NOW,
 * and records that operational decision for audit and future calibration.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_RESEARCH_SPEND_CONFIG,
  RESEARCH_SPEND_POLICY_VERSION,
  applySpendControl,
  type ResearchSpendConfig,
  type SpendCandidateInput,
  type SpendDecisionRecord,
  type SpendPacketFacts,
  type PriorProductionResearch,
} from "./spend-policy";

type Row = Record<string, unknown>;

export interface SpendControlCandidate {
  mint: string;
  tokenId: string | null;
  triageDecisionId: string | null;
  researchPacketId: string | null;
  triageRank: number | null;
  quantRank: number | null;
  recurrenceState: string | null;
  recurrenceNumber: number | null;
  packetFacts: SpendPacketFacts | null;
}

export interface SpendClaim {
  /** Persisted decision row id (null only when persistence is disabled). */
  id: string | null;
  record: SpendDecisionRecord;
  /** True when THIS worker owns the right to spend on this mint. */
  claimed: boolean;
}

/** Extracts the deterministic packet facts the policy compares. */
export function packetFactsFromPacket(packet: unknown): SpendPacketFacts | null {
  if (!packet || typeof packet !== "object") return null;
  const p = packet as {
    identity?: { pairAddress?: { value?: unknown }; dex?: { value?: unknown } };
    structural?: { status?: unknown };
    holders?: {
      holderCount?: { value?: unknown };
      top10Pct?: { value?: unknown };
      top20Pct?: { value?: unknown };
    };
  };
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    holderCount: n(p.holders?.holderCount?.value),
    top10Pct: n(p.holders?.top10Pct?.value),
    top20Pct: n(p.holders?.top20Pct?.value),
    structuralStatus: s(p.structural?.status),
    pairAddress: s(p.identity?.pairAddress?.value),
    dex: s(p.identity?.dex?.value),
  };
}

/**
 * Latest canonical PRODUCTION Deep Research artifact per exact mint, from
 * cohorts OTHER than the current triage run.
 *
 * Calibration artifacts can never satisfy or reset a production cooldown, and
 * same-cohort reruns never create an additional cooldown event.
 */
export async function loadPriorProductionResearch(
  mints: readonly string[],
  currentTriageRunId: string,
): Promise<Map<string, PriorProductionResearch>> {
  const out = new Map<string, PriorProductionResearch>();
  if (mints.length === 0) return out;

  const { data, error } = await supabaseAdmin
    .from("deep_research_reports")
    .select(
      "id, mint, status, dossier_version, search_health, evidence_coverage_pct, created_at, deep_research_run_id, is_calibration",
    )
    .in("mint", [...mints])
    .eq("is_calibration", false)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const reports = (data as Row[]) ?? [];
  const runIds = [
    ...new Set(reports.map((r) => r["deep_research_run_id"] as string).filter(Boolean)),
  ];
  const runs = new Map<string, Row>();
  if (runIds.length) {
    const { data: runRows, error: runError } = await supabaseAdmin
      .from("deep_research_runs")
      .select("id, triage_run_id, research_packet_id, is_calibration")
      .in("id", runIds);
    if (runError) throw new Error(runError.message);
    for (const r of (runRows as Row[]) ?? []) runs.set(r["id"] as string, r);
  }

  const triageIds = [
    ...new Set(
      [...runs.values()]
        .map((r) => r["triage_run_id"] as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const triageScan = new Map<string, string | null>();
  if (triageIds.length) {
    const { data: triageRows } = await supabaseAdmin
      .from("ai_triage_runs")
      .select("id, source_scan_id")
      .in("id", triageIds);
    for (const t of (triageRows as Row[]) ?? []) {
      triageScan.set(t["id"] as string, (t["source_scan_id"] as string) ?? null);
    }
  }

  const packetIds = [
    ...new Set(
      [...runs.values()]
        .map((r) => r["research_packet_id"] as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const packetFacts = new Map<string, SpendPacketFacts | null>();
  if (packetIds.length) {
    const { data: packetRows } = await supabaseAdmin
      .from("research_packets")
      .select("id, packet")
      .in("id", packetIds);
    for (const p of (packetRows as Row[]) ?? []) {
      packetFacts.set(p["id"] as string, packetFactsFromPacket(p["packet"]));
    }
  }

  for (const report of reports) {
    const mint = report["mint"] as string;
    if (out.has(mint)) continue; // newest first
    const run = runs.get(report["deep_research_run_id"] as string) ?? null;
    if (!run) continue;
    if (run["is_calibration"] === true) continue;
    const triageRunId = (run["triage_run_id"] as string) ?? null;
    if (triageRunId === currentTriageRunId) continue; // same cohort ≠ cooldown event
    const packetId = (run["research_packet_id"] as string) ?? null;
    out.set(mint, {
      reportId: report["id"] as string,
      deepResearchRunId: (report["deep_research_run_id"] as string) ?? null,
      scanRunId: triageRunId ? (triageScan.get(triageRunId) ?? null) : null,
      triageRunId,
      researchedAt: report["created_at"] as string,
      status: (report["status"] as string) ?? null,
      dossierVersion: (report["dossier_version"] as string) ?? null,
      searchHealth: (report["search_health"] as string) ?? null,
      coveragePct: (report["evidence_coverage_pct"] as number) ?? null,
      packetFacts: packetId ? (packetFacts.get(packetId) ?? null) : null,
    });
  }
  return out;
}

/** Deep Research jobs already spent in this cohort and in the rolling window. */
export async function loadBudgetUsage(
  triageRunId: string,
  config: ResearchSpendConfig,
  nowMs: number,
): Promise<{ scanUsed: number; windowUsed: number }> {
  const since = new Date(nowMs - config.budgetWindowHours * 3600_000).toISOString();
  const [{ data: cohortRows }, { count: windowCount }] = await Promise.all([
    supabaseAdmin
      .from("deep_research_runs")
      .select("mint")
      .eq("triage_run_id", triageRunId)
      .eq("is_calibration", false),
    supabaseAdmin
      .from("deep_research_runs")
      .select("id", { count: "exact", head: true })
      .eq("is_calibration", false)
      .gte("started_at", since),
  ]);
  const scanUsed = new Set(((cohortRows as Row[]) ?? []).map((r) => r["mint"] as string)).size;
  return { scanUsed, windowUsed: windowCount ?? 0 };
}

/**
 * Evaluates and CLAIMS spend decisions for a production cohort.
 *
 * The unique index on (triage_run_id, mint, policy_version) is the claim: the
 * worker that inserts the row owns the right to spend. A concurrent worker
 * hitting the conflict reads the existing decision and never spends again.
 */
export async function claimSpendDecisions(input: {
  triageRunId: string;
  scanRunId: string | null;
  candidates: readonly SpendControlCandidate[];
  config?: ResearchSpendConfig;
  now?: Date;
  persist?: boolean;
}): Promise<SpendClaim[]> {
  const config = input.config ?? DEFAULT_RESEARCH_SPEND_CONFIG;
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  if (input.candidates.length === 0) return [];

  const prior = await loadPriorProductionResearch(
    input.candidates.map((c) => c.mint),
    input.triageRunId,
  );
  const usage = await loadBudgetUsage(input.triageRunId, config, nowMs);

  const policyInputs: SpendCandidateInput[] = input.candidates.map((c) => ({
    mint: c.mint,
    triageRank: c.triageRank,
    quantRank: c.quantRank,
    recurrenceState: c.recurrenceState,
    recurrenceNumber: c.recurrenceNumber,
    researchPacketId: c.researchPacketId,
    triageDecisionId: c.triageDecisionId,
    tokenId: c.tokenId,
    packetFacts: c.packetFacts,
    prior: prior.get(c.mint) ?? null,
  }));

  const records = applySpendControl({
    candidates: policyInputs,
    budget: {
      scanUsed: usage.scanUsed,
      scanLimit: config.maxDeepResearchPerScan,
      windowUsed: usage.windowUsed,
      windowLimit: config.maxDeepResearchPerWindow,
    },
    nowMs,
    config,
  });

  if (input.persist === false) {
    return records.map((record) => ({ id: null, record, claimed: record.spendDecision === "RUN_DEEP_RESEARCH" }));
  }

  const claims: SpendClaim[] = [];
  for (const record of records) {
    const row = {
      policy_version: RESEARCH_SPEND_POLICY_VERSION,
      is_calibration: false,
      scan_run_id: input.scanRunId,
      triage_run_id: input.triageRunId,
      triage_decision_id: record.triageDecisionId,
      research_packet_id: record.researchPacketId,
      token_id: record.tokenId,
      mint: record.mint,
      chain: "solana",
      triage_rank: record.triageRank,
      quant_rank: record.quantRank,
      recurrence_state: record.recurrenceState,
      recurrence_number: record.recurrenceNumber,
      spend_decision: record.spendDecision,
      spend_decision_reason: record.spendDecisionReason,
      prior_research_report_id: record.priorResearchReportId,
      prior_research_run_id: record.priorResearchRunId,
      prior_scan_run_id: record.priorScanRunId,
      prior_triage_run_id: record.priorTriageRunId,
      prior_research_at: record.priorResearchAt,
      prior_research_age_minutes: record.priorResearchAgeMinutes,
      prior_research_status: record.priorResearchStatus,
      prior_research_version: record.priorResearchVersion,
      prior_search_health: record.priorSearchHealth,
      cooldown_minutes: record.cooldownMinutes,
      cooldown_remaining_minutes: record.cooldownRemainingMinutes,
      next_eligible_at: record.nextEligibleAt,
      material_change_override: record.materialChangeOverride,
      material_change_reason_codes: record.materialChangeReasonCodes,
      budget_state: record.budgetState,
      budget_scan_used: record.budgetScanUsed,
      budget_scan_limit: record.budgetScanLimit,
      budget_window_used: record.budgetWindowUsed,
      budget_window_limit: record.budgetWindowLimit,
      executed: false,
    };

    const { data, error } = await supabaseAdmin
      .from("research_spend_decisions")
      .insert(row as never)
      .select("id")
      .maybeSingle();

    if (!error && data) {
      claims.push({
        id: (data as Row)["id"] as string,
        record,
        claimed: record.spendDecision === "RUN_DEEP_RESEARCH",
      });
      continue;
    }

    // Conflict (or any insert failure): another worker already owns this
    // cohort × mint × policy decision. Never spend twice.
    const { data: existing } = await supabaseAdmin
      .from("research_spend_decisions")
      .select("id, spend_decision, spend_decision_reason")
      .eq("triage_run_id", input.triageRunId)
      .eq("mint", record.mint)
      .eq("policy_version", RESEARCH_SPEND_POLICY_VERSION)
      .maybeSingle();
    const e = (existing as Row | null) ?? null;
    claims.push({
      id: e ? (e["id"] as string) : null,
      record: e
        ? {
            ...record,
            spendDecision: (e["spend_decision"] as SpendDecisionRecord["spendDecision"]) ?? record.spendDecision,
            spendDecisionReason:
              (e["spend_decision_reason"] as SpendDecisionRecord["spendDecisionReason"]) ??
              record.spendDecisionReason,
          }
        : record,
      claimed: false,
    });
  }
  return claims;
}

/** Marks a granted decision as actually executed, with its run provenance. */
export async function markSpendExecuted(
  decisionId: string | null,
  deepResearchRunId: string | null,
): Promise<void> {
  if (!decisionId) return;
  await supabaseAdmin
    .from("research_spend_decisions")
    .update({ executed: true, deep_research_run_id: deepResearchRunId })
    .eq("id", decisionId);
}

export interface SpendDecisionSummary {
  mint: string;
  spendDecision: string;
  spendDecisionReason: string;
  policyVersion: string;
  priorResearchReportId: string | null;
  priorResearchAt: string | null;
  priorResearchAgeMinutes: number | null;
  priorScanRunId: string | null;
  priorTriageRunId: string | null;
  cooldownRemainingMinutes: number | null;
  nextEligibleAt: string | null;
  materialChangeOverride: boolean;
  materialChangeReasonCodes: string[];
  budgetState: string | null;
  executed: boolean;
  recurrenceState: string | null;
  recurrenceNumber: number | null;
  triageRank: number | null;
  researchPacketId: string | null;
}

/** Persisted spend decisions of one production cohort, keyed by exact mint. */
export async function loadSpendDecisionsForCohort(
  triageRunId: string,
): Promise<Map<string, SpendDecisionSummary>> {
  const out = new Map<string, SpendDecisionSummary>();
  const { data, error } = await supabaseAdmin
    .from("research_spend_decisions")
    .select("*")
    .eq("triage_run_id", triageRunId)
    .eq("is_calibration", false);
  if (error) throw new Error(error.message);
  for (const r of (data as Row[]) ?? []) {
    out.set(r["mint"] as string, {
      mint: r["mint"] as string,
      spendDecision: r["spend_decision"] as string,
      spendDecisionReason: r["spend_decision_reason"] as string,
      policyVersion: r["policy_version"] as string,
      priorResearchReportId: (r["prior_research_report_id"] as string) ?? null,
      priorResearchAt: (r["prior_research_at"] as string) ?? null,
      priorResearchAgeMinutes: (r["prior_research_age_minutes"] as number) ?? null,
      priorScanRunId: (r["prior_scan_run_id"] as string) ?? null,
      priorTriageRunId: (r["prior_triage_run_id"] as string) ?? null,
      cooldownRemainingMinutes: (r["cooldown_remaining_minutes"] as number) ?? null,
      nextEligibleAt: (r["next_eligible_at"] as string) ?? null,
      materialChangeOverride: Boolean(r["material_change_override"]),
      materialChangeReasonCodes: (r["material_change_reason_codes"] as string[]) ?? [],
      budgetState: (r["budget_state"] as string) ?? null,
      executed: Boolean(r["executed"]),
      recurrenceState: (r["recurrence_state"] as string) ?? null,
      recurrenceNumber: (r["recurrence_number"] as number) ?? null,
      triageRank: (r["triage_rank"] as number) ?? null,
      researchPacketId: (r["research_packet_id"] as string) ?? null,
    });
  }
  return out;
}
