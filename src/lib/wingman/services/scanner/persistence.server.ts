/**
 * Scanner persistence (server-only, service-role).
 *
 * Rules:
 *   - `scan_runs` is the run ledger; a unique partial index guarantees only one
 *     run can be `running` at a time.
 *   - A failed run is marked failed and never touches earlier completed runs.
 *   - Token identity rows are inserted for discovered tokens but existing
 *     richer metadata is never overwritten by thin discovery data.
 *   - Snapshots stay append-only; nothing here updates history.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SCANNER_VERSION } from "./config";
import type {
  DiscoveredToken,
  EvaluatedCandidate,
  HistoricalPoint,
  ProviderCallTelemetry,
} from "./types";

type Row = Record<string, unknown>;

export interface StartRunInput {
  calibrationMode: boolean;
  discoveryConfigVersion: string;
}

export class ConcurrentScanError extends Error {
  constructor() {
    super("A scan is already running.");
    this.name = "ConcurrentScanError";
  }
}

export async function startScanRun(input: StartRunInput): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("scan_runs")
    .insert({
      status: "running",
      started_at: new Date().toISOString(),
      scanner_version: SCANNER_VERSION,
      discovery_config_version: input.discoveryConfigVersion,
      calibration_mode: input.calibrationMode,
    } as never)
    .select("id")
    .single();

  if (error) {
    // 23505 = unique violation on the single-running-scan index.
    if (error.code === "23505") throw new ConcurrentScanError();
    throw new Error(`Could not start scan run: ${error.message}`);
  }
  return (data as Row)["id"] as string;
}

export interface CompleteRunInput {
  runId: string;
  tokensDiscovered: number;
  passedHardFilters: number;
  quantitativelyRanked: number;
  enriched: number;
  telemetry: ProviderCallTelemetry[];
  notes?: string | null;
}

export async function completeScanRun(input: CompleteRunInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from("scan_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      tokens_discovered: input.tokensDiscovered,
      // Legacy column kept in sync so existing reads keep working.
      tokens_scanned: input.tokensDiscovered,
      passed_hard_filters: input.passedHardFilters,
      passed_quantitative_ranking: input.quantitativelyRanked,
      quantitatively_ranked: input.quantitativelyRanked,
      enriched_count: input.enriched,
      deep_researched: 0,
      passed_ai_triage: 0,
      actionable_count: 0,
      provider_telemetry: input.telemetry as never,
      notes: input.notes ?? null,
    } as never)
    .eq("id", input.runId);
  if (error) throw new Error(`Could not complete scan run: ${error.message}`);
}

export async function failScanRun(runId: string, message: string): Promise<void> {
  await supabaseAdmin
    .from("scan_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message.slice(0, 500),
    } as never)
    .eq("id", runId);
}

/**
 * Insert identity rows for tokens we have never seen, then resolve ids for the
 * whole set. `ignoreDuplicates` protects existing, richer metadata.
 */
export async function resolveTokenIds(
  tokens: DiscoveredToken[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (tokens.length === 0) return map;

  const addresses = [...new Set(tokens.map((t) => t.contractAddress))];

  const payload = tokens.map((t) => ({
    contract_address: t.contractAddress,
    chain: t.chain,
    symbol: t.symbol ?? t.contractAddress.slice(0, 6),
    name: t.name ?? "Unknown token",
    image_url: t.imageUrl,
    metadata_source: "birdeye",
  }));

  const { error: insertError } = await supabaseAdmin
    .from("tokens")
    .upsert(payload as never, { onConflict: "contract_address", ignoreDuplicates: true });
  if (insertError) throw new Error(`Could not persist discovered tokens: ${insertError.message}`);

  // Chunked so a large discovery set never builds an oversized query string.
  for (let i = 0; i < addresses.length; i += 200) {
    const chunk = addresses.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("tokens")
      .select("id, contract_address, pair_created_at, token_created_at")
      .in("contract_address", chunk);
    if (error) throw new Error(`Could not resolve token ids: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      map.set(row["contract_address"] as string, row["id"] as string);
    }
  }
  return map;
}

export interface TokenContext {
  tokenId: string;
  pairCreatedAt: string | null;
  tokenCreatedAt: string | null;
  history: HistoricalPoint[];
}

/** Age fallbacks + prior snapshots, used by persistence and reacceleration. */
export async function loadTokenContext(
  addresses: string[],
): Promise<Map<string, TokenContext>> {
  const out = new Map<string, TokenContext>();
  if (addresses.length === 0) return out;

  const byId = new Map<string, string>();
  for (let i = 0; i < addresses.length; i += 200) {
    const chunk = addresses.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("tokens")
      .select("id, contract_address, pair_created_at, token_created_at")
      .in("contract_address", chunk);
    if (error) throw new Error(`Could not load token context: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      const address = row["contract_address"] as string;
      const id = row["id"] as string;
      byId.set(id, address);
      out.set(address, {
        tokenId: id,
        pairCreatedAt: (row["pair_created_at"] as string | null) ?? null,
        tokenCreatedAt: (row["token_created_at"] as string | null) ?? null,
        history: [],
      });
    }
  }

  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("token_snapshots")
      .select("token_id, captured_at, market_cap, liquidity_usd, volume_1h, volume_24h, price_usd")
      .in("token_id", chunk)
      .order("captured_at", { ascending: true })
      .limit(2000);
    if (error) continue; // History is optional; signals degrade to UNKNOWN.
    for (const row of (data ?? []) as Row[]) {
      const address = byId.get(row["token_id"] as string);
      if (!address) continue;
      out.get(address)?.history.push({
        capturedAt: row["captured_at"] as string,
        marketCap: (row["market_cap"] as number | null) ?? null,
        liquidityUsd: (row["liquidity_usd"] as number | null) ?? null,
        volume1h: (row["volume_1h"] as number | null) ?? null,
        volume24h: (row["volume_24h"] as number | null) ?? null,
        priceUsd: (row["price_usd"] as number | null) ?? null,
      });
    }
  }

  return out;
}

/** Append candidate rows. Rejections are recorded, never silently dropped. */
export async function persistCandidates(
  runId: string,
  candidates: EvaluatedCandidate[],
  tokenIds: Map<string, string>,
): Promise<number> {
  const rows = candidates
    .map((c) => {
      const tokenId = tokenIds.get(c.token.contractAddress);
      if (!tokenId) return null;
      const m = c.metrics;
      return {
        scan_run_id: runId,
        token_id: tokenId,
        contract_address: c.token.contractAddress,
        chain: c.token.chain,
        stage_reached: c.stageReached,
        scanner_version: SCANNER_VERSION,
        discovery_lanes: c.lanes,
        discovery_sources: [...new Set(c.token.discovery.map((d) => d.source))],
        discovery_queries: [...new Set(c.token.discovery.map((d) => d.queryId))],
        discovery_ranks: c.token.discovery.map((d) => ({
          queryId: d.queryId,
          family: d.family,
          rank: d.rank,
        })),
        token_age_minutes: m.age.minutes,
        age_basis: m.age.basis,
        market_cap: c.token.marketCap,
        liquidity_usd: c.token.liquidityUsd,
        volume_24h: c.token.volume24h,
        volume_1h: c.token.volume1h,
        volume_to_market_cap_24h: m.volumeToMarketCap24h,
        volume_to_liquidity_24h: m.volumeToLiquidity24h,
        minutes_since_last_trade: m.minutesSinceLastTrade,
        activity_state: c.signals.activityState,
        persistence_signal: c.signals.persistenceSignal,
        reacceleration_signal: c.signals.reaccelerationSignal,
        extension_risk: c.signals.extensionRisk,
        attention_price_divergence: c.signals.attentionPriceDivergence,
        quantitative_priority: c.quantitativePriority,
        priority_components: c.priority?.components ?? null,
        rejection_reason: c.rejection?.reason ?? null,
        rejection_details: c.rejection
          ? { detail: c.rejection.detail, values: c.rejection.values, lanes: c.laneRejections }
          : { lanes: c.laneRejections },
        enriched: c.enriched,
        // Scanner v1 produces no thesis score.
        quantitative_score: null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error, count } = await supabaseAdmin
      .from("scan_candidates")
      .insert(chunk as never, { count: "exact" });
    if (error) {
      console.error("persistCandidates chunk failed", error.message);
      continue;
    }
    inserted += count ?? chunk.length;
  }
  return inserted;
}
