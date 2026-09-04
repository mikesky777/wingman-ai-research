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
  QUALIFYING_SETUPS,
  deriveSetupMilestone,
  deriveSetupQualifiedMilestones,
  deriveSurvivorMilestone,
  emptyProvenance,
  type FunnelStage,
  type MilestoneSourceType,
  type QualifyingSetup,
  type StageAppearance,
  type StageMilestone,
  type StageProvenance,
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

/** Key of an existing frozen entry: mint + stage + setup dimension. */
const milestoneKey = (tokenId: string, stage: string, setupKey: string) =>
  `${tokenId}:${stage}:${setupKey}`;

async function loadExistingMilestones(): Promise<Map<string, Row>> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("token_stage_milestones")
      .select("token_id, stage, setup_key, first_entered_at, source_scan_id")
      .order("id", { ascending: true })
      .range(from, to),
  );
  const out = new Map<string, Row>();
  for (const row of rows) {
    out.set(
      milestoneKey(
        row["token_id"] as string,
        row["stage"] as string,
        (row["setup_key"] as string | null) ?? "ALL",
      ),
      row,
    );
  }
  return out;
}

function toInsertRow(milestone: StageMilestone, sourceType: MilestoneSourceType): Row {
  return {
    token_id: milestone.tokenId,
    contract_address: milestone.contractAddress,
    chain: milestone.chain,
    stage: milestone.stage,
    setup_key: milestone.setupKey,
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

/**
 * Append rows, never rewrite. The unique (token_id, stage, setup_key)
 * constraint plus ignoreDuplicates makes every write idempotent: a retry, a
 * later scan, or a delayed manual Sync can never replace an earlier
 * authoritative baseline.
 */
async function appendMilestones(rows: Row[]): Promise<number> {
  let attempted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("token_stage_milestones")
      .upsert(chunk as never, { onConflict: "token_id,stage,setup_key", ignoreDuplicates: true });
    if (error) throw error;
    attempted += chunk.length;
  }
  return attempted;
}


export interface MilestoneBackfillResult {
  stagesWritten: Record<FunnelStage, number>;
  setupQualifiedTotal: number;
  setupQualifiedBySetup: Record<QualifyingSetup, number>;
  dualSetupTokens: number;
  survivorTotal: number;
  firstCallRecords: number;
  /** SURVIVOR milestones whose baseline disagrees with the frozen First Call. */
  reconciliationMismatches: { tokenId: string; reason: string }[];
  incompleteBaselines: number;
  tokensConsidered: number;
}

/**
 * REPAIR / BACKFILL ONLY. Normal funnel events are written automatically by
 * `recordScanMilestones` at scan completion; this exists to fill gaps from
 * before automatic writes, or after an outage. It can only ever ADD a missing
 * entry — a delayed run never replaces an earlier authoritative baseline.
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
  let dualSetupTokens = 0;

  // SETUP_QUALIFIED — one frozen baseline PER SETUP (BASE, REACCEL).
  for (const [tokenId, list] of appearances) {
    const identity = addresses.get(tokenId);
    const address = identity?.address ?? null;
    if (!address) continue;
    const milestones = deriveSetupQualifiedMilestones(
      { tokenId, contractAddress: address, chain: identity?.chain ?? "solana" },
      list,
    );
    if (milestones.length > 1) dualSetupTokens += 1;
    for (const milestone of milestones) {
      if (existing.has(milestoneKey(tokenId, "SETUP_QUALIFIED", milestone.setupKey))) continue;
      if (!milestone.baselineComplete) incomplete += 1;
      inserts.push(toInsertRow(milestone, "BACKFILL"));
    }
  }

  // SURVIVOR — copied verbatim from the frozen First Call record.
  for (const row of firstCalls) {
    const tokenId = row["token_id"] as string;
    const priorKey = milestoneKey(tokenId, "SURVIVOR", "ALL");
    if (existing.has(priorKey)) {
      const prior = existing.get(priorKey)!;
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
  for (const row of inserts) written[row["stage"] as FunnelStage] += 1;
  await appendMilestones(inserts);

  const after = await loadExistingMilestones();
  let setupTotal = 0;
  let survivorTotal = 0;
  const bySetup: Record<QualifyingSetup, number> = { BASE: 0, REACCEL: 0 };
  for (const key of after.keys()) {
    if (key.includes(":SETUP_QUALIFIED:")) {
      setupTotal += 1;
      for (const setup of QUALIFYING_SETUPS) if (key.endsWith(`:${setup}`)) bySetup[setup] += 1;
    }
    if (key.includes(":SURVIVOR:")) survivorTotal += 1;
  }


  return {
    stagesWritten: written,
    setupQualifiedTotal: setupTotal,
    setupQualifiedBySetup: bySetup,
    dualSetupTokens,
    survivorTotal,
    firstCallRecords: firstCalls.length,
    reconciliationMismatches: mismatches.slice(0, 50),
    incompleteBaselines: incomplete,
    tokensConsidered: appearances.size,
  };
}

/* ------------------------------------------------------------------ */
/* Automatic milestone writes                                          */
/* ------------------------------------------------------------------ */

/** One candidate exactly as it was evaluated in the completed scan. */
export interface ScanMilestoneCandidate {
  tokenId: string;
  contractAddress: string | null;
  chain?: string | null;
  setups: string[];
  survivor: boolean;
  marketCap: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  quantitativePriority: number | null;
}

export interface ScanMilestoneWriteResult {
  setupQualifiedAttempted: number;
  survivorAttempted: number;
}

/**
 * AUTOMATIC funnel recording, called once a scan run is completed. Uses the
 * exact market state of that scan, appends only, and is safe to retry: an
 * existing first entry is never rewritten.
 */
export async function recordScanMilestones(input: {
  scanRunId: string;
  completedAt: string;
  candidates: ScanMilestoneCandidate[];
}): Promise<ScanMilestoneWriteResult> {
  const rows: Row[] = [];
  let setupCount = 0;
  let survivorCount = 0;

  for (const candidate of input.candidates) {
    const address = candidate.contractAddress;
    if (!address) continue;
    const identity = {
      tokenId: candidate.tokenId,
      contractAddress: address,
      chain: candidate.chain ?? "solana",
    };
    const appearance: StageAppearance = {
      scanRunId: input.scanRunId,
      completedAt: input.completedAt,
      setups: candidate.setups,
      marketCap: candidate.marketCap,
      priceUsd: candidate.priceUsd,
      liquidityUsd: candidate.liquidityUsd,
      quantitativePriority: candidate.quantitativePriority,
      survivor: candidate.survivor,
    };

    for (const setup of QUALIFYING_SETUPS) {
      const milestone = deriveSetupMilestone(identity, [appearance], setup);
      if (!milestone) continue;
      rows.push(toInsertRow(milestone, "SCANNER"));
      setupCount += 1;
    }

    if (candidate.survivor) {
      const milestone = deriveSurvivorMilestone(
        {
          tokenId: candidate.tokenId,
          contractAddress: address,
          firstCallAt: input.completedAt,
          firstCallScanId: input.scanRunId,
          firstCallMarketCap: candidate.marketCap,
          firstCallPriceUsd: candidate.priceUsd,
        },
        appearance,
      );
      if (milestone) {
        rows.push(toInsertRow(milestone, "SCANNER"));
        survivorCount += 1;
      }
    }
  }

  await appendMilestones(rows);
  return { setupQualifiedAttempted: setupCount, survivorAttempted: survivorCount };
}

/**
 * AUTOMATIC write for a future AI stage (AI_SHORTLIST / THESIS_CALL). The
 * caller supplies the evidence snapshot that produced the decision, so the
 * milestone is traceable back to it. Append-only and idempotent.
 */
export async function recordAiStageMilestone(input: {
  stage: Extract<FunnelStage, "AI_SHORTLIST" | "THESIS_CALL">;
  tokenId: string;
  contractAddress: string;
  chain?: string;
  enteredAt: string;
  setups?: string[];
  marketCap: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  provenance: Partial<StageProvenance> & { sourceType: MilestoneSourceType };
}): Promise<void> {
  const provenance: StageProvenance = {
    ...emptyProvenance(input.provenance.sourceType),
    ...input.provenance,
  };
  const milestone: StageMilestone = {
    tokenId: input.tokenId,
    contractAddress: input.contractAddress,
    chain: input.chain ?? "solana",
    stage: input.stage,
    setupKey: "ALL",
    firstEnteredAt: input.enteredAt,
    setupAtEntry: input.setups?.join("+") ?? null,
    firstSetup:
      QUALIFYING_SETUPS.find((s) => input.setups?.includes(s)) ?? null,
    firstBaseAt: null,
    firstReaccelAt: null,
    marketCapAtEntry: input.marketCap,
    priceAtEntry: input.priceUsd,
    liquidityAtEntry: input.liquidityUsd,
    quantitativePriorityAtEntry: null,
    baselineComplete: input.marketCap !== null && input.priceUsd !== null,
    provenance,
  };
  await appendMilestones([toInsertRow(milestone, provenance.sourceType)]);
}

