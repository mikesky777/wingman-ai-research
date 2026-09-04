/**
 * Manual per-token market refresh (server-only).
 *
 * Reuses the EXISTING DexScreener provider path and the existing append-only
 * snapshot persistence. It writes one new `token_snapshots` row and then
 * recomputes derived outcome fields from persisted observations.
 *
 * It never: mutates a scan candidate, creates a scan run, changes selection,
 * setups, priority, recurrence, structural eligibility, price integrity or
 * historical OHLCV, and never overwrites an established First Seen/First Call.
 */
import { DexScreenerAdapter, isValidSolanaAddress } from "./external/dexscreener";
import { ExternalDataError } from "./external/dexscreener/errors";
import { normalizeIdentity, normalizeSnapshot } from "./external/dexscreener/normalizer";
import { insertSnapshot, upsertTokenIdentity } from "./ingestion.server";
import { refreshOutcomes } from "./outcomes/outcome-persistence.server";
import { deriveTurnover, isPersistableObservation, type RefreshMarketValues } from "./market-refresh";

export interface MarketRefreshResult {
  ok: boolean;
  message: string | null;
  contractAddress: string;
  tokenId: string | null;
  snapshotId: string | null;
  observedAt: string | null;
  values: RefreshMarketValues | null;
  pair: {
    pairAddress: string | null;
    dexId: string | null;
    quoteTokenSymbol: string | null;
    pairCreatedAt: string | null;
  } | null;
}

function failure(contractAddress: string, message: string): MarketRefreshResult {
  // Provider failure never becomes a market observation: no snapshot is
  // written and the caller keeps whatever values it already had.
  return {
    ok: false,
    message,
    contractAddress,
    tokenId: null,
    snapshotId: null,
    observedAt: null,
    values: null,
    pair: null,
  };
}

export async function refreshTokenMarket(contractAddress: string): Promise<MarketRefreshResult> {
  const address = contractAddress.trim();
  if (!isValidSolanaAddress(address)) {
    return failure(address, "Not a valid Solana contract address.");
  }

  try {
    const selection = await DexScreenerAdapter.resolvePrimaryPair(address, { noCache: true });
    const identity = normalizeIdentity(selection.primary, address);
    const snapshot = normalizeSnapshot(selection.primary);

    if (!isPersistableObservation(snapshot)) {
      return failure(address, "Provider returned no usable market reading — values left unchanged.");
    }

    const token = await upsertTokenIdentity(identity);
    const inserted = await insertSnapshot(token.id, snapshot);

    // Derived outcome fields only. Baselines are insert-once inside this call.
    await refreshOutcomes([token.id], new Map([[token.id, address]]));

    return {
      ok: true,
      message: null,
      contractAddress: address,
      tokenId: token.id,
      snapshotId: inserted.id,
      observedAt: inserted.capturedAt,
      values: {
        priceUsd: snapshot.priceUsd,
        marketCap: snapshot.marketCap,
        liquidityUsd: snapshot.liquidityUsd,
        volume24h: snapshot.volume24h,
        turnover24h: deriveTurnover(snapshot.volume24h, snapshot.marketCap),
      },
      pair: {
        pairAddress: identity.dexPairAddress,
        dexId: identity.primaryDexId,
        quoteTokenSymbol: identity.primaryQuoteTokenSymbol,
        pairCreatedAt: identity.pairCreatedAt,
      },
    };
  } catch (error) {
    if (!(error instanceof ExternalDataError)) console.error("refreshTokenMarket failed", error);
    const code = error instanceof ExternalDataError ? error.code : "PROVIDER_FAILED";
    return failure(address, `Refresh failed (${code}) — previous values kept.`);
  }
}
