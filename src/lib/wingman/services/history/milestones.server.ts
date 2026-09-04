/**
 * Funnel-stage milestone persistence + backfill (server-only, service-role).
 *
 * Append-only. An existing milestone row is NEVER updated or deleted: the
 * unique (token_id, stage) constraint plus `ignoreDuplicates` guarantees the
 * first entry stays frozen. Historical scan rows, outcome baselines and
 * research packets are never mutated by this module.
 *
 * AI_SHORTLIST and THESIS_CALL are never written here — only future AI triage
 * and thesis synthesis may create them, with real provenance.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MILESTONE_VERSION,
  deriveSetupQualifiedMilestone,
  deriveSurvivorMilestone,
  type FunnelStage,
  type StageAppearance,
  type StageMilestone,
} from "./milestones";

type Row = Record<string, unknown>;

const PAGE = 1000;

/** PostgREST caps a response at 1000 rows, so every read pages through range(). */
async function fetchAllPages(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

const num = (row: Row, key: string): number | null => {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Every candidate appearance in a COMPLETED scan, keyed by exact token id. */
async function loadAppearances(): Promise<Map<string, StageAppearance[]>> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("scan_candidates")
      .select(
        "token_id, scan_run_id, contract_address, chain, discovery_lanes, market_cap, price_usd, liquidity_usd, quantitative_priority, selected_by_lane_reservation, selected_by_global_ranking, run:scan_runs!inner(status, completed_at)",
      )
      .order("id", { ascending: true })
      .range(from, to),
  );

  const out = new Map<string, StageAppearance[]>();
  for (const row of rows) {
    const run = row["run"] as { status?: string; completed_at?: string | null } | null;
    if (!run || run.status !== "completed" || !run.completed_at) continue;
    const tokenId = row["token_id"] as string;
    const list = out.get(tokenId) ?? [];
    list.push({
      scanRunId: row["scan_run_id"] as string,
      completedAt: run.completed_at,
      setups: (row["discovery_lanes"] as string[] | null) ?? [],
      marketCap: num(row, "market_cap"),
      priceUsd: num(row, "price_usd"),
      liquidityUsd: num(row, "liquidity_usd"),
      quantitativePriority: num(row, "quantitative_priority"),
      survivor:
        Boolean(row["selected_by_lane_reservation"]) || Boolean(row["selected_by_global_ranking"]),
    });
    out.set(tokenId, list);
  }
  return out;
}

async function loadAddresses(): Promise<Map<string, { address: string; chain: string }>> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("tokens")
      .select("id, contract_address, chain")
      .order("id", { ascending: true })
      .range(from, to),
  );
  const out = new Map<string, { address: string; chain: string }>();
  for (const row of rows) {
    out.set(row["id"] as string, {
      address: row["contract_address"] as string,
      chain: (row["chain"] as string | null) ?? "solana",
    });
  }
  return out;
}

async function loadFirstCalls(): Promise<Row[]> {
  return fetchAllPages((from, to) =>
    supabaseAdmin
      .from("token_scanner_outcomes")
      .select(
        "token_id, contract_address, first_call_at, first_call_scan_id, first_call_market_cap_usd, first_call_price_usd",
      )
      .not("first_call_at", "is", null)
      .order("token_id", { ascending: true })
      .range(from, to),
  );
}

async function loadExistingMilestones(): Promise<Map<string, Row>> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("token_stage_milestones")
      .select("token_id, stage, first_entered_at, source_scan_id")
      .order("id", { ascending: true })
      .range(from, to),
  );
  const out = new Map<string, Row>();
  for (const row of rows) out.set(`${row["token_id"]}:${row["stage"]}`, row);
  return out;
}

function toInsertRow(milestone: StageMilestone, sourceType: string): Row {
  return {
    token_id: milestone.tokenId,
    contract_address: milestone.contractAddress,
    chain: milestone.chain,
    stage: milestone.stage,
    first_entered_at: milestone.firstEnteredAt,
    source_scan_id: milestone.provenance.sourceScanId,
    setup_at_entry: milestone.setupAtEntry,
    first_setup: milestone.firstSetup,
    first_base_at: milestone.firstBaseAt,
    first_reaccel_at: milestone.firstReaccelAt,
    market_cap_at_entry: milestone.marketCapAtEntry,
    price_at_entry: milestone.priceAtEntry,
    liquidity_at_entry: milestone.liquidityAtEntry,
    quantitative_priority_at_entry: milestone.quantitativePriorityAtEntry,
    source_type: sourceType,
    source_id: milestone.provenance.sourceId,
    source_ref: milestone.provenance.sourceRef,
    research_packet_id: milestone.provenance.researchPacketId,
    research_packet_version: milestone.provenance.researchPacketVersion,
    research_run_id: milestone.provenance.researchRunId,
    research_report_id: milestone.provenance.researchReportId,
    policy_version: milestone.provenance.policyVersion,
    milestone_version: MILESTONE_VERSION,
    baseline_complete: milestone.baselineComplete,
  };
}

export interface MilestoneBackfillResult {
  stagesWritten: Record<FunnelStage, number>;
  setupQualifiedTotal: number;
  survivorTotal: number;
  firstCallRecords: number;
  /** SURVIVOR milestones whose baseline disagrees with the frozen First Call. */
  reconciliationMismatches: { tokenId: string; reason: string }[];
  incompleteBaselines: number;
  tokensConsidered: number;
}

/**
 * Derive and append missing SETUP_QUALIFIED / SURVIVOR milestones from
 * persisted scanner and outcome records only. Nothing is inferred from a name
 * or symbol; missing baselines stay unavailable.
 */
export async function backfillStageMilestones(): Promise<MilestoneBackfillResult> {
  const [appearances, addresses, firstCalls, existing] = await Promise.all([
    loadAppearances(),
    loadAddresses(),
    loadFirstCalls(),
    loadExistingMilestones(),
  ]);

  const inserts: Row[] = [];
  const mismatches: { tokenId: string; reason: string }[] = [];
  let incomplete = 0;

  // SETUP_QUALIFIED — first BASE/REACCEL qualification in a completed scan.
  for (const [tokenId, list] of appearances) {
    if (existing.has(`${tokenId}:SETUP_QUALIFIED`)) continue;
    const identity = addresses.get(tokenId);
    const fallback = list.find((a) => a.setups.length >= 0);
    const address = identity?.address ?? null;
    if (!address || !fallback) continue;
    const milestone = deriveSetupQualifiedMilestone(
      { tokenId, contractAddress: address, chain: identity?.chain ?? "solana" },
      list,
    );
    if (!milestone) continue;
    if (!milestone.baselineComplete) incomplete += 1;
    inserts.push(toInsertRow(milestone, "BACKFILL"));
  }

  // SURVIVOR — copied verbatim from the frozen First Call record.
  for (const row of firstCalls) {
    const tokenId = row["token_id"] as string;
    if (existing.has(`${tokenId}:SURVIVOR`)) {
      const prior = existing.get(`${tokenId}:SURVIVOR`)!;
      if (String(prior["first_entered_at"]) !== String(row["first_call_at"])) {
        mismatches.push({
          tokenId,
          reason: `existing SURVIVOR milestone ${String(prior["first_entered_at"])} != First Call ${String(row["first_call_at"])}`,
        });
      }
      continue;
    }
    const address =
      ((row["contract_address"] as string | null) ?? addresses.get(tokenId)?.address) || null;
    if (!address) {
      mismatches.push({ tokenId, reason: "First Call record has no exact mint" });
      continue;
    }
    const callScanId = (row["first_call_scan_id"] as string | null) ?? null;
    const callAppearance =
      (appearances.get(tokenId) ?? []).find((a) => a.scanRunId === callScanId) ?? null;
    if (callScanId && !callAppearance) {
      mismatches.push({ tokenId, reason: `no persisted candidate row for call scan ${callScanId}` });
    }
    const milestone = deriveSurvivorMilestone(
      {
        tokenId,
        contractAddress: address,
        firstCallAt: (row["first_call_at"] as string | null) ?? null,
        firstCallScanId: callScanId,
        firstCallMarketCap: num(row, "first_call_market_cap_usd"),
        firstCallPriceUsd: num(row, "first_call_price_usd"),
      },
      callAppearance,
    );
    if (!milestone) continue;
    if (!milestone.baselineComplete) incomplete += 1;
    inserts.push(toInsertRow(milestone, "BACKFILL"));
  }

  const written: Record<FunnelStage, number> = {
    SETUP_QUALIFIED: 0,
    SURVIVOR: 0,
    AI_SHORTLIST: 0,
    THESIS_CALL: 0,
  };

  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("token_stage_milestones")
      // Append-only: a pre-existing first entry is left exactly as it is.
      .upsert(chunk as never, { onConflict: "token_id,stage", ignoreDuplicates: true });
    if (error) throw error;
    for (const row of chunk) written[row["stage"] as FunnelStage] += 1;
  }

  const after = await loadExistingMilestones();
  let setupTotal = 0;
  let survivorTotal = 0;
  for (const key of after.keys()) {
    if (key.endsWith(":SETUP_QUALIFIED")) setupTotal += 1;
    if (key.endsWith(":SURVIVOR")) survivorTotal += 1;
  }

  return {
    stagesWritten: written,
    setupQualifiedTotal: setupTotal,
    survivorTotal,
    firstCallRecords: firstCalls.length,
    reconciliationMismatches: mismatches.slice(0, 50),
    incompleteBaselines: incomplete,
    tokensConsidered: appearances.size,
  };
}
