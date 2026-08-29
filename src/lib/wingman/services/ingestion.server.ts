/**
 * Server-only persistence for live external market data.
 *
 * Browser clients can no longer write `tokens` / `token_snapshots`; all writes
 * go through this trusted module using the service-role client.
 *
 * Invariants:
 *   - Token identity is upserted; existing higher-quality metadata is NEVER
 *     overwritten with a missing/null value from the provider.
 *   - Snapshots are append-only. Older rows are never updated or deleted.
 *   - Unavailable values are stored as NULL, never coerced to 0.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ExternalDataError } from "./external/dexscreener/errors";
import type { NormalizedSnapshot, NormalizedTokenIdentity } from "./external/dexscreener/normalizer";

export interface PersistedToken {
  id: string;
  contractAddress: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  websiteUrl: string | null;
  twitterUrl: string | null;
  telegramUrl: string | null;
  dexPairAddress: string | null;
  primaryDexId: string | null;
  primaryQuoteTokenSymbol: string | null;
  primaryQuoteTokenAddress: string | null;
  pairCreatedAt: string | null;
}

type Row = Record<string, unknown>;

/** Keep the existing value when the incoming one is null/undefined. */
function preferExisting<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null {
  return (incoming ?? existing ?? null) as T | null;
}

export async function upsertTokenIdentity(
  identity: NormalizedTokenIdentity,
): Promise<PersistedToken> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("tokens")
    .select("*")
    .eq("contract_address", identity.contractAddress)
    .maybeSingle();
  if (readError) throw new ExternalDataError("PERSISTENCE_FAILED");

  const prev = (existing ?? {}) as Row;
  const payload: Row = {
    contract_address: identity.contractAddress,
    chain: "solana",
    // Identity fields are NOT NULL in the schema; fall back to prior values,
    // then to a safe placeholder derived from the address.
    symbol:
      identity.symbol ?? (prev["symbol"] as string | undefined) ?? identity.contractAddress.slice(0, 6),
    name: identity.name ?? (prev["name"] as string | undefined) ?? "Unknown token",
    image_url: preferExisting(identity.imageUrl, prev["image_url"] as string | null),
    website_url: preferExisting(identity.websiteUrl, prev["website_url"] as string | null),
    twitter_url: preferExisting(identity.twitterUrl, prev["twitter_url"] as string | null),
    telegram_url: preferExisting(identity.telegramUrl, prev["telegram_url"] as string | null),
    dex_pair_address: preferExisting(identity.dexPairAddress, prev["dex_pair_address"] as string | null),
    primary_dex_id: preferExisting(identity.primaryDexId, prev["primary_dex_id"] as string | null),
    primary_quote_token_address: preferExisting(
      identity.primaryQuoteTokenAddress,
      prev["primary_quote_token_address"] as string | null,
    ),
    primary_quote_token_symbol: preferExisting(
      identity.primaryQuoteTokenSymbol,
      prev["primary_quote_token_symbol"] as string | null,
    ),
    pair_created_at: preferExisting(identity.pairCreatedAt, prev["pair_created_at"] as string | null),
    token_created_at: preferExisting(
      (prev["token_created_at"] as string | null) ?? null,
      identity.pairCreatedAt,
    ),
    metadata_source: "dexscreener",
    last_ingested_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("tokens")
    .upsert(payload, { onConflict: "contract_address" })
    .select("*")
    .single();
  if (error || !data) throw new ExternalDataError("PERSISTENCE_FAILED");

  const row = data as Row;
  return {
    id: row["id"] as string,
    contractAddress: row["contract_address"] as string,
    symbol: row["symbol"] as string,
    name: row["name"] as string,
    imageUrl: (row["image_url"] as string | null) ?? null,
    websiteUrl: (row["website_url"] as string | null) ?? null,
    twitterUrl: (row["twitter_url"] as string | null) ?? null,
    telegramUrl: (row["telegram_url"] as string | null) ?? null,
    dexPairAddress: (row["dex_pair_address"] as string | null) ?? null,
    primaryDexId: (row["primary_dex_id"] as string | null) ?? null,
    primaryQuoteTokenSymbol: (row["primary_quote_token_symbol"] as string | null) ?? null,
    primaryQuoteTokenAddress: (row["primary_quote_token_address"] as string | null) ?? null,
    pairCreatedAt: (row["pair_created_at"] as string | null) ?? null,
  };
}

/** Append-only. Historical snapshots are never mutated. */
export async function insertSnapshot(
  tokenId: string,
  snapshot: NormalizedSnapshot,
): Promise<{ id: string; capturedAt: string }> {
  const payload: Row = {
    token_id: tokenId,
    captured_at: snapshot.capturedAt,
    data_source: snapshot.dataSource,
    ingestion_version: snapshot.ingestionVersion,
    source_pair_address: snapshot.sourcePairAddress,
    source_dex_id: snapshot.sourceDexId,
    source_pair_created_at: snapshot.sourcePairCreatedAt,
    price_usd: snapshot.priceUsd,
    market_cap: snapshot.marketCap,
    fdv: snapshot.fdv,
    liquidity_usd: snapshot.liquidityUsd,
    volume_5m: snapshot.volume5m,
    volume_1h: snapshot.volume1h,
    volume_6h: snapshot.volume6h,
    volume_24h: snapshot.volume24h,
    price_change_5m: snapshot.priceChange5m,
    price_change_1h: snapshot.priceChange1h,
    price_change_6h: snapshot.priceChange6h,
    price_change_24h: snapshot.priceChange24h,
    buys_5m: snapshot.buys5m,
    sells_5m: snapshot.sells5m,
    buys_1h: snapshot.buys1h,
    sells_1h: snapshot.sells1h,
    paid_boost_count: snapshot.promotion.activeBoostCount,
    active_boost_count: snapshot.promotion.activeBoostCount,
    total_boost_amount: snapshot.promotion.totalBoostAmount,
    has_active_boost: snapshot.promotion.hasActiveBoost,
    has_paid_profile: snapshot.promotion.hasPaidProfile,
    // Not available from DexScreener — intentionally NULL, never 0.
    holder_count: null,
    unique_buyers_1h: null,
    unique_sellers_1h: null,
    top_10_holder_pct: null,
    top_20_holder_pct: null,
  };

  const { data, error } = await supabaseAdmin
    .from("token_snapshots")
    .insert(payload)
    .select("id, captured_at")
    .single();
  if (error || !data) throw new ExternalDataError("PERSISTENCE_FAILED");
  const row = data as Row;
  return { id: row["id"] as string, capturedAt: row["captured_at"] as string };
}
