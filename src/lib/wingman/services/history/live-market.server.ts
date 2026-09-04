/**
 * Batched live market refresh (server-only).
 *
 * Reuses the EXISTING DexScreener provider path and the EXISTING deterministic
 * pair-selection policy, applied per mint over the batch payload. It never
 * mutates a scan candidate, creates a scan run, changes selection, setups,
 * priority, recurrence, structural eligibility, price integrity, participation
 * quality, or an established First Seen / First Call baseline.
 *
 * Persistence is deliberately rate-limited: a snapshot is written only when no
 * observation exists inside `LIVE_HISTORY_PERSISTENCE_INTERVAL_MS`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DexScreenerAdapter, isValidSolanaAddress } from "../external/dexscreener";
import { ExternalDataError } from "../external/dexscreener/errors";
import { selectPrimaryPair } from "../external/dexscreener/pair-selection";
import { normalizeIdentity, normalizeSnapshot } from "../external/dexscreener/normalizer";
import type { DsPair } from "../external/dexscreener/types";
import { insertSnapshot, upsertTokenIdentity } from "../ingestion.server";
import { refreshOutcomes } from "../outcomes/outcome-persistence.server";
import { isPersistableObservation } from "../market-refresh";
import {
  batchAddresses,
  emptyDiagnostics,
  shouldPersistObservation,
  type LiveMarketValues,
  type LiveRefreshDiagnostics,
} from "./live-market";

export interface LiveMarketRefreshResult {
  ok: boolean;
  message: string | null;
  observedAt: string;
  values: LiveMarketValues[];
  diagnostics: LiveRefreshDiagnostics;
}

const numOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export async function refreshLiveMarkets(
  addresses: string[],
  options: { persist?: boolean } = {},
): Promise<LiveMarketRefreshResult> {
  const valid = [...new Set(addresses.map((a) => a.trim()))].filter(isValidSolanaAddress);
  const observedAt = new Date().toISOString();
  const diagnostics = emptyDiagnostics();

  if (valid.length === 0) {
    return { ok: true, message: null, observedAt, values: [], diagnostics };
  }

  const batches = batchAddresses(valid);
  const pairs: DsPair[] = [];
  let failure: string | null = null;

  for (const batch of batches) {
    diagnostics.batches += 1;
    // One provider request per batch — never one per table row.
    diagnostics.providerRequests += 1;
    try {
      pairs.push(...(await DexScreenerAdapter.getPairsForTokens(batch)));
    } catch (error) {
      const code = error instanceof ExternalDataError ? error.code : "PROVIDER_FAILED";
      failure = `Live refresh failed (${code}) — previous values kept.`;
    }
  }

  const values: LiveMarketValues[] = [];
  for (const address of valid) {
    // Same deterministic policy as every other Wingman market read.
    const selection = selectPrimaryPair(pairs, address);
    if (!selection) continue;
    const pair = selection.primary;
    const snapshot = normalizeSnapshot(pair);
    values.push({
      contractAddress: address,
      priceUsd: snapshot.priceUsd,
      marketCap: snapshot.marketCap,
      fdv: snapshot.fdv,
      liquidityUsd: snapshot.liquidityUsd,
      volume24h: snapshot.volume24h,
      priceChange5m: snapshot.priceChange5m,
      priceChange1h: snapshot.priceChange1h,
      priceChange6h: snapshot.priceChange6h,
      priceChange24h: snapshot.priceChange24h,
      buys24h: numOrNull(pair.txns?.h24?.buys),
      sells24h: numOrNull(pair.txns?.h24?.sells),
      pairAddress: snapshot.sourcePairAddress,
      dexId: snapshot.sourceDexId,
      observedAt,
    });
  }
  diagnostics.addressesRefreshed = values.length;

  if (options.persist !== false && values.length > 0) {
    await persistSlowSamples(values, pairs, observedAt, diagnostics);
  }

  return {
    ok: failure === null,
    message: failure,
    observedAt,
    values,
    diagnostics,
  };
}

/**
 * Slow longitudinal sampling. Writes at most one immutable observation per
 * token per persistence window; everything else is display-only.
 */
async function persistSlowSamples(
  values: LiveMarketValues[],
  pairs: DsPair[],
  observedAt: string,
  diagnostics: LiveRefreshDiagnostics,
): Promise<void> {
  const addresses = values.map((v) => v.contractAddress);

  const { data: tokenRows } = await supabaseAdmin
    .from("tokens")
    .select("id, contract_address")
    .in("contract_address", addresses);

  const tokenIdByAddress = new Map<string, string>();
  for (const row of (tokenRows ?? []) as { id: string; contract_address: string }[]) {
    tokenIdByAddress.set(row.contract_address, row.id);
  }

  const lastObservedAt = new Map<string, string>();
  const tokenIds = [...tokenIdByAddress.values()];
  if (tokenIds.length > 0) {
    const { data: snapshotRows } = await supabaseAdmin
      .from("token_snapshots")
      .select("token_id, captured_at")
      .in("token_id", tokenIds)
      .order("captured_at", { ascending: false })
      .limit(2000);
    for (const row of (snapshotRows ?? []) as { token_id: string; captured_at: string }[]) {
      if (!lastObservedAt.has(row.token_id)) lastObservedAt.set(row.token_id, row.captured_at);
    }
  }

  const persistedTokenIds: string[] = [];
  const addressByTokenId = new Map<string, string>();

  for (const value of values) {
    const tokenId = tokenIdByAddress.get(value.contractAddress) ?? null;
    const last = tokenId ? (lastObservedAt.get(tokenId) ?? null) : null;
    if (!shouldPersistObservation(last, observedAt)) {
      diagnostics.persistenceSkippedRecent += 1;
      continue;
    }

    const pairSelection = selectPrimaryPair(pairs, value.contractAddress);
    if (!pairSelection) continue;
    const snapshot = normalizeSnapshot(pairSelection.primary);
    if (!isPersistableObservation(snapshot)) {
      diagnostics.persistenceSkippedRecent += 1;
      continue;
    }

    try {
      const identity = normalizeIdentity(pairSelection.primary, value.contractAddress);
      const token = await upsertTokenIdentity(identity);
      await insertSnapshot(token.id, snapshot);
      diagnostics.persistedObservations += 1;
      persistedTokenIds.push(token.id);
      addressByTokenId.set(token.id, value.contractAddress);
    } catch (error) {
      console.error("live sample persistence failed", error);
    }
  }

  if (persistedTokenIds.length > 0) {
    // Derived outcome fields only — baselines stay insert-once/frozen.
    await refreshOutcomes(persistedTokenIds, addressByTokenId);
  }
}
