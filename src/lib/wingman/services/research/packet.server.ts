/**
 * Research Packet assembly from persisted Wingman data (server-only).
 *
 * Every bulk read here is chunked AND paginated: the Data API silently caps a
 * single response at 1000 rows, which has already caused two production bugs.
 * A packet write is append-only; existing packets are never updated.
 *
 * Generating packets never creates a First Call, never changes Survivor state,
 * recurrence, scanner evidence or outcomes.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  RESEARCH_UNIVERSE_CONFIG,
  buildResearchPacket,
  selectResearchUniverse,
  type CurrentMarketObservation,
  type HolderEvidenceRow,
  type PacketCandidate,
  type ResearchUniverseConfig,
  type UniverseSelection,
} from "./packet";
import { compactJson, serializeCompact } from "./serialize";
import {
  RESEARCH_COMPACT_VERSION,
  RESEARCH_PACKET_VERSION,
  type CandidateSource,
  type ExclusionReason,
  type ResearchPacket,
} from "./types";

type Row = Record<string, unknown>;

/** Data API hard cap per response. Never read more than this in one request. */
export const PAGE_SIZE = 1000;
/** Conservative `in (...)` width so a chunk can never approach the cap alone. */
export const ID_CHUNK = 50;

/**
 * Read every row a query matches. Pages with `.range()` until a short page is
 * returned, so a >1000-row result can never be silently truncated.
 */
export async function fetchAllPages(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  pageSize: number = PAGE_SIZE,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await build(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

/** Chunk an id list so no single request carries an unbounded `in (...)`. */
export function chunkIds<T>(ids: T[], size: number = ID_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

const CANDIDATE_COLUMNS = [
  "token_id",
  "contract_address",
  "chain",
  "discovery_lanes",
  "token_age_minutes",
  "age_basis",
  "market_cap",
  "liquidity_usd",
  "price_usd",
  "volume_1h",
  "volume_24h",
  "trades_1h",
  "trades_24h",
  "buys_24h",
  "sells_24h",
  "holder_count",
  "price_change_1h",
  "price_change_24h",
  "volume_to_market_cap_24h",
  "volume_to_liquidity_24h",
  "quantitative_priority",
  "global_rank",
  "selected_by_lane_reservation",
  "selected_by_global_ranking",
  "recurrence_state",
  "scans_seen_count",
  "consecutive_scans_seen",
  "first_seen_scan_at",
  "previous_seen_scan_at",
  "universe_eligibility",
  "universe_category",
  "universe_reason",
  "structural_status",
  "structural_policy_version",
  "structural_detail",
  "price_integrity_status",
  "price_integrity_policy_version",
  "price_integrity_detail",
  "participation_status",
  "participation_policy_version",
  "participation_detail",
  "token:tokens!inner(id, name, symbol, dex_pair_address, primary_dex_id)",
].join(", ");

export interface LoadedCandidate extends PacketCandidate {
  pairAddress: string | null;
  dex: string | null;
  chain: string;
}

function num(row: Row, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function str(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

/** Every persisted candidate for a run. Paginated — never a single response. */
export async function loadRunCandidates(scanRunId: string): Promise<LoadedCandidate[]> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("scan_candidates")
      .select(CANDIDATE_COLUMNS)
      .eq("scan_run_id", scanRunId)
      .order("quantitative_priority", { ascending: false, nullsFirst: false })
      .range(from, to),
  );

  return rows.map((r) => {
    const token = (r["token"] ?? {}) as Record<string, string | null>;
    return {
      tokenId: (token["id"] as string) ?? (r["token_id"] as string),
      name: token["name"] ?? "",
      symbol: token["symbol"] ?? "",
      contractAddress: str(r, "contract_address"),
      chain: str(r, "chain") ?? "solana",
      pairAddress: token["dex_pair_address"] ?? null,
      dex: token["primary_dex_id"] ?? null,
      lanes: (r["discovery_lanes"] as string[] | null) ?? [],
      ageMinutes: num(r, "token_age_minutes"),
      ageBasis: str(r, "age_basis"),
      marketCap: num(r, "market_cap"),
      liquidityUsd: num(r, "liquidity_usd"),
      priceUsd: num(r, "price_usd"),
      volume1h: num(r, "volume_1h"),
      volume24h: num(r, "volume_24h"),
      trades1h: num(r, "trades_1h"),
      trades24h: num(r, "trades_24h"),
      buys24h: num(r, "buys_24h"),
      sells24h: num(r, "sells_24h"),
      holderCount: num(r, "holder_count"),
      priceChange1h: num(r, "price_change_1h"),
      priceChange24h: num(r, "price_change_24h"),
      turnover24h: num(r, "volume_to_market_cap_24h"),
      volumeToLiquidity24h: num(r, "volume_to_liquidity_24h"),
      quantitativePriority: num(r, "quantitative_priority"),
      globalRank: num(r, "global_rank"),
      selectedByLaneReservation: Boolean(r["selected_by_lane_reservation"]),
      selectedByGlobalRanking: Boolean(r["selected_by_global_ranking"]),
      recurrenceState: str(r, "recurrence_state") ?? "NEW",
      scansSeenCount: num(r, "scans_seen_count") ?? 1,
      consecutiveScansSeen: num(r, "consecutive_scans_seen") ?? 1,
      firstSeenScanAt: str(r, "first_seen_scan_at"),
      previousSeenScanAt: str(r, "previous_seen_scan_at"),
      universeEligibility: str(r, "universe_eligibility") ?? "UNKNOWN",
      universeCategory: str(r, "universe_category"),
      universeReason: str(r, "universe_reason"),
      structuralStatus: str(r, "structural_status"),
      structuralPolicyVersion: str(r, "structural_policy_version"),
      structuralDetail: (r["structural_detail"] as LoadedCandidate["structuralDetail"]) ?? null,
      priceIntegrityStatus: str(r, "price_integrity_status"),
      priceIntegrityPolicyVersion: str(r, "price_integrity_policy_version"),
      priceIntegrityDetail:
        (r["price_integrity_detail"] as LoadedCandidate["priceIntegrityDetail"]) ?? null,
      participationStatus: str(r, "participation_status"),
      participationPolicyVersion: str(r, "participation_policy_version"),
      participationDetail:
        (r["participation_detail"] as LoadedCandidate["participationDetail"]) ?? null,
      outcome: null,
    } satisfies LoadedCandidate;
  });
}

/** Newest persisted market observation per token. Chunked and paginated. */
export async function loadCurrentMarkets(
  tokenIds: string[],
): Promise<Map<string, CurrentMarketObservation>> {
  const out = new Map<string, CurrentMarketObservation>();
  for (const ids of chunkIds(tokenIds)) {
    const rows = await fetchAllPages((from, to) =>
      supabaseAdmin
        .from("token_snapshots")
        .select(
          "token_id, price_usd, market_cap, liquidity_usd, volume_1h, volume_24h, buys_1h, sells_1h, buys_5m, sells_5m, price_change_1h, price_change_24h, data_source, captured_at",
        )
        .in("token_id", ids)
        .order("captured_at", { ascending: false })
        .range(from, to),
    );
    for (const r of rows) {
      const tokenId = r["token_id"] as string;
      if (out.has(tokenId)) continue; // rows are newest-first
      out.set(tokenId, {
        priceUsd: num(r, "price_usd"),
        marketCap: num(r, "market_cap"),
        liquidityUsd: num(r, "liquidity_usd"),
        volume1h: num(r, "volume_1h"),
        volume24h: num(r, "volume_24h"),
        trades1h: null,
        trades24h: null,
        buys24h: null,
        sells24h: null,
        priceChange1h: num(r, "price_change_1h"),
        priceChange24h: num(r, "price_change_24h"),
        source: str(r, "data_source"),
        observedAt: str(r, "captured_at"),
      });
    }
  }
  return out;
}

/** Holder / creator evidence observations. Chunked and paginated. */
export async function loadHolderEvidence(
  tokenIds: string[],
): Promise<Map<string, HolderEvidenceRow[]>> {
  const out = new Map<string, HolderEvidenceRow[]>();
  for (const ids of chunkIds(tokenIds)) {
    const rows = await fetchAllPages((from, to) =>
      supabaseAdmin
        .from("evidence_observations")
        .select("token_id, domain, key, value_json, source, observed_at, captured_at, status")
        .in("token_id", ids)
        .in("domain", ["holders", "creator"])
        .order("captured_at", { ascending: false })
        .range(from, to),
    );
    for (const r of rows) {
      const tokenId = r["token_id"] as string;
      const list = out.get(tokenId) ?? [];
      list.push({
        domain: r["domain"] as string,
        key: r["key"] as string,
        value: (r["value_json"] ?? null) as HolderEvidenceRow["value"],
        source: (r["source"] as string) ?? "unknown",
        observedAt: str(r, "observed_at"),
        capturedAt: str(r, "captured_at") ?? "",
        status: (r["status"] as string) ?? "observed",
      });
      out.set(tokenId, list);
    }
  }
  return out;
}

/** Frozen outcome baselines. Chunked and paginated. */
export async function loadOutcomes(
  tokenIds: string[],
): Promise<Map<string, PacketCandidate["outcome"]>> {
  const out = new Map<string, PacketCandidate["outcome"]>();
  for (const ids of chunkIds(tokenIds)) {
    const rows = await fetchAllPages((from, to) =>
      supabaseAdmin
        .from("token_scanner_outcomes")
        .select(
          "token_id, first_seen_at, first_seen_market_cap_usd, first_call_at, first_call_market_cap_usd, first_call_price_usd, current_market_cap_usd, current_price_usd, current_observed_at, market_cap_change_since_first_seen_pct, market_cap_change_since_first_call_pct, peak_market_cap_since_call_pct, peak_since_call_pct, max_adverse_since_call_pct, max_peak_to_trough_drawdown_since_call_pct",
        )
        .in("token_id", ids)
        .range(from, to),
    );
    for (const r of rows) {
      out.set(r["token_id"] as string, {
        firstSeenAt: str(r, "first_seen_at"),
        firstSeenMarketCap: num(r, "first_seen_market_cap_usd"),
        firstCallAt: str(r, "first_call_at"),
        firstCallMarketCap: num(r, "first_call_market_cap_usd"),
        firstCallPriceUsd: num(r, "first_call_price_usd"),
        currentMarketCap: num(r, "current_market_cap_usd"),
        currentPriceUsd: num(r, "current_price_usd"),
        currentObservedAt: str(r, "current_observed_at"),
        sinceSeenPct: num(r, "market_cap_change_since_first_seen_pct"),
        sinceCallPct: num(r, "market_cap_change_since_first_call_pct"),
        peakMarketCapSinceCallPct: num(r, "peak_market_cap_since_call_pct"),
        peakSinceCallPct: num(r, "peak_since_call_pct"),
        maxAdverseSinceCallPctV2: num(r, "max_adverse_since_call_pct"),
        drawdownSinceCallPctV2: num(r, "max_peak_to_trough_drawdown_since_call_pct"),
      } as PacketCandidate["outcome"]);
    }
  }
  return out;
}

export interface GeneratedPacket {
  packet: ResearchPacket;
  compactBytes: number;
  candidateSource: CandidateSource;
}

export interface ResearchPacketRunResult {
  scanRunId: string;
  scanCompletedAt: string | null;
  packetVersion: string;
  serializationVersion: string;
  config: ResearchUniverseConfig;
  universeConsidered: number;
  counts: Record<CandidateSource, number>;
  exclusionCounts: Record<ExclusionReason, number>;
  excludedTotal: number;
  packets: GeneratedPacket[];
  persistedCount: number;
  averageCompactBytes: number;
  maxCompactBytes: number;
}

/** The newest completed run, when no run id is supplied. */
export async function latestCompletedRun(): Promise<{ id: string; completedAt: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("scan_runs")
    .select("id, completed_at")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Row;
  return { id: row["id"] as string, completedAt: str(row, "completed_at") };
}

/**
 * Assemble packets for one completed scan. Pure read + append-only write.
 */
export async function generateResearchPackets(options: {
  scanRunId?: string | null;
  config?: ResearchUniverseConfig;
  persist?: boolean;
} = {}): Promise<ResearchPacketRunResult> {
  const run = options.scanRunId
    ? { id: options.scanRunId, completedAt: null as string | null }
    : await latestCompletedRun();
  if (!run) throw new Error("No completed scan run to build research packets from.");

  let completedAt = run.completedAt;
  if (completedAt === null) {
    const { data } = await supabaseAdmin
      .from("scan_runs")
      .select("completed_at")
      .eq("id", run.id)
      .maybeSingle();
    completedAt = data ? str(data as Row, "completed_at") : null;
  }

  const candidates = await loadRunCandidates(run.id);
  const tokenIds = [...new Set(candidates.map((c) => c.tokenId))];
  const [markets, holderEvidence, outcomes] = await Promise.all([
    loadCurrentMarkets(tokenIds),
    loadHolderEvidence(tokenIds),
    loadOutcomes(tokenIds),
  ]);

  const withOutcomes: LoadedCandidate[] = candidates.map((c) => ({
    ...c,
    outcome: outcomes.get(c.tokenId) ?? null,
  }));

  const currentPriceChange1hByToken: Record<string, number | null> = {};
  for (const c of withOutcomes) {
    currentPriceChange1hByToken[c.tokenId] = markets.get(c.tokenId)?.priceChange1h ?? c.priceChange1h;
  }

  const selection: UniverseSelection = selectResearchUniverse(withOutcomes, {
    config: options.config ?? RESEARCH_UNIVERSE_CONFIG,
    currentPriceChange1hByToken,
  });

  const generatedAt = new Date().toISOString();
  const packets: GeneratedPacket[] = selection.members.map((member) => {
    const loaded = member.candidate as LoadedCandidate;
    const packet = buildResearchPacket({
      candidate: loaded,
      candidateSource: member.candidateSource,
      scanRunId: run.id,
      scanCompletedAt: completedAt,
      currentMarket: markets.get(loaded.tokenId) ?? null,
      holderEvidence: holderEvidence.get(loaded.tokenId) ?? [],
      pairAddress: loaded.pairAddress,
      dex: loaded.dex,
      chain: loaded.chain,
      generatedAt,
    });
    return {
      packet,
      compactBytes: compactJson(packet).bytes,
      candidateSource: member.candidateSource,
    };
  });

  let persistedCount = 0;
  if (options.persist !== false && packets.length > 0) {
    const rows = packets.map((p, index) => ({
      token_id: selection.members[index]!.candidate.tokenId,
      scan_run_id: run.id,
      contract_address: p.packet.identity.mint,
      chain: p.packet.identity.chain,
      packet_version: RESEARCH_PACKET_VERSION,
      serialization_version: RESEARCH_COMPACT_VERSION,
      candidate_source: p.candidateSource,
      research_eligible_now: p.packet.eligibility.researchEligibleNow,
      exclusion_reasons: p.packet.eligibility.exclusionReasons,
      evidence_gaps: p.packet.evidenceGaps,
      packet: p.packet,
      compact: serializeCompact(p.packet),
      compact_bytes: p.compactBytes,
      generated_at: generatedAt,
    }));
    for (const chunk of chunkIds(rows, 100)) {
      // Append-only: never an upsert, so historical packets stay immutable.
      const { error } = await supabaseAdmin.from("research_packets").insert(chunk as never);
      if (error) throw new Error(`Could not persist research packets: ${error.message}`);
      persistedCount += chunk.length;
    }
  }

  const sizes = packets.map((p) => p.compactBytes);
  return {
    scanRunId: run.id,
    scanCompletedAt: completedAt,
    packetVersion: RESEARCH_PACKET_VERSION,
    serializationVersion: RESEARCH_COMPACT_VERSION,
    config: options.config ?? RESEARCH_UNIVERSE_CONFIG,
    universeConsidered: selection.considered,
    counts: selection.counts,
    exclusionCounts: selection.exclusionCounts,
    excludedTotal: selection.excluded.length,
    packets,
    persistedCount,
    averageCompactBytes: sizes.length
      ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)
      : 0,
    maxCompactBytes: sizes.length ? Math.max(...sizes) : 0,
  };
}

/** Newest persisted packet for one mint. Read-only. */
export async function loadLatestPacketForMint(
  contractAddress: string,
): Promise<ResearchPacket | null> {
  const { data, error } = await supabaseAdmin
    .from("research_packets")
    .select("packet")
    .eq("contract_address", contractAddress)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return (data as Row)["packet"] as ResearchPacket;
}
