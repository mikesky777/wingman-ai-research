/**
 * Persisted market-observation read model (server-only).
 *
 * History and (later) the Calibration Observatory read ONLY from here. This
 * module performs no external provider call whatsoever, so filtering, sorting
 * and variant switching can never generate DexScreener traffic.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { LiveMarketValues } from "../history/live-market";
import { coverageStatusFor, type CoverageStatus } from "./sampler";

type Row = Record<string, unknown>;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export interface PersistedMarketState {
  values: LiveMarketValues[];
  coverage: Record<string, CoverageStatus>;
  /** Newest persisted observation across the requested mints. */
  observedAt: string | null;
  readAt: string;
  providerRequests: 0;
}

export async function readPersistedMarkets(addresses: string[]): Promise<PersistedMarketState> {
  const mints = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  const readAt = new Date().toISOString();
  if (mints.length === 0) {
    return { values: [], coverage: {}, observedAt: null, readAt, providerRequests: 0 };
  }

  const tokenRows: Row[] = [];
  for (let i = 0; i < mints.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("tokens")
      .select("id, contract_address")
      .in("contract_address", mints.slice(i, i + 200));
    tokenRows.push(...((data ?? []) as Row[]));
  }
  const addressByTokenId = new Map<string, string>();
  for (const row of tokenRows) {
    addressByTokenId.set(row["id"] as string, row["contract_address"] as string);
  }

  const tokenIds = [...addressByTokenId.keys()];
  const latest = new Map<string, Row>();
  for (let i = 0; i < tokenIds.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("token_snapshots")
      .select(
        "token_id, captured_at, price_usd, market_cap, fdv, liquidity_usd, volume_24h, price_change_5m, price_change_1h, price_change_6h, price_change_24h, buys_1h, sells_1h, source_pair_address, source_dex_id",
      )
      .in("token_id", tokenIds.slice(i, i + 200))
      .order("captured_at", { ascending: false })
      .limit(5000);
    for (const row of (data ?? []) as Row[]) {
      const tokenId = row["token_id"] as string;
      if (!latest.has(tokenId)) latest.set(tokenId, row);
    }
  }

  const values: LiveMarketValues[] = [];
  let newest: string | null = null;
  for (const [tokenId, row] of latest) {
    const address = addressByTokenId.get(tokenId);
    if (!address) continue;
    const observedAt = row["captured_at"] as string;
    if (!newest || observedAt > newest) newest = observedAt;
    values.push({
      contractAddress: address,
      priceUsd: num(row["price_usd"]),
      marketCap: num(row["market_cap"]),
      fdv: num(row["fdv"]),
      liquidityUsd: num(row["liquidity_usd"]),
      volume24h: num(row["volume_24h"]),
      priceChange5m: num(row["price_change_5m"]),
      priceChange1h: num(row["price_change_1h"]),
      priceChange6h: num(row["price_change_6h"]),
      priceChange24h: num(row["price_change_24h"]),
      buys24h: num(row["buys_1h"]),
      sells24h: num(row["sells_1h"]),
      pairAddress: (row["source_pair_address"] as string | null) ?? null,
      dexId: (row["source_dex_id"] as string | null) ?? null,
      observedAt,
    });
  }

  const coverage: Record<string, CoverageStatus> = {};
  for (let i = 0; i < mints.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("outcome_tracking")
      .select(
        "contract_address, latest_baseline_at, last_attempt_at, last_success_at, next_eligible_at, consecutive_failures, last_error_code",
      )
      .in("contract_address", mints.slice(i, i + 200));
    for (const row of (data ?? []) as Row[]) {
      const mint = row["contract_address"] as string;
      coverage[mint] = coverageStatusFor(
        {
          contractAddress: mint,
          latestBaselineAt: (row["latest_baseline_at"] as string | null) ?? null,
          lastAttemptAt: (row["last_attempt_at"] as string | null) ?? null,
          lastSuccessAt: (row["last_success_at"] as string | null) ?? null,
          nextEligibleAt: (row["next_eligible_at"] as string | null) ?? null,
          consecutiveFailures: (row["consecutive_failures"] as number | null) ?? 0,
          lastErrorCode: (row["last_error_code"] as string | null) ?? null,
        },
        readAt,
      );
    }
  }
  for (const mint of mints) coverage[mint] ??= "UNKNOWN";

  return { values, coverage, observedAt: newest, readAt, providerRequests: 0 };
}
