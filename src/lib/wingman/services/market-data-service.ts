import { supabase } from "../data/supabase";
import type { TokenSnapshot } from "../types";

interface SnapshotRow {
  token_id: string;
  captured_at: string;
  price_usd: number | null;
  market_cap: number | null;
  liquidity_usd: number | null;
  volume_24h: number | null;
  holder_count: number | null;
}

const SELECT = "token_id, captured_at, price_usd, market_cap, liquidity_usd, volume_24h, holder_count";

function toDomain(row: SnapshotRow): TokenSnapshot {
  return {
    tokenId: row.token_id,
    capturedAt: row.captured_at,
    marketCapUsd: row.market_cap ?? 0,
    liquidityUsd: row.liquidity_usd ?? 0,
    volume24hUsd: row.volume_24h ?? 0,
    priceUsd: row.price_usd ?? 0,
    holderCount: row.holder_count ?? 0,
  };
}

/**
 * MarketDataService — time-series market state.
 *
 * Currently reads seeded snapshots from the database. A future ingestion job
 * will append normalized DexScreener / Birdeye rows to `token_snapshots`;
 * nothing above this interface has to change.
 */
export const MarketDataService = {
  /** Latest snapshot per token, keyed by token id. Never overwrites history. */
  async latestByToken(tokenIds?: string[]): Promise<Record<string, TokenSnapshot>> {
    let query = supabase
      .from("token_snapshots")
      .select(SELECT)
      .order("captured_at", { ascending: false });
    if (tokenIds && tokenIds.length > 0) query = query.in("token_id", tokenIds);

    const { data, error } = await query;
    if (error) throw error;

    const out: Record<string, TokenSnapshot> = {};
    for (const row of data as SnapshotRow[]) {
      if (!out[row.token_id]) out[row.token_id] = toDomain(row);
    }
    return out;
  },

  async history(tokenId: string, limit = 200): Promise<TokenSnapshot[]> {
    const { data, error } = await supabase
      .from("token_snapshots")
      .select(SELECT)
      .eq("token_id", tokenId)
      .order("captured_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data as SnapshotRow[]).map(toDomain);
  },
};
