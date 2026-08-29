/**
 * ingestTokenByAddress — the exact-token live ingestion pipeline.
 *
 *   DexScreener API → adapter → normalized model → persistence → caller
 *
 * No scoring, no research, no opportunity creation. Failures never insert
 * fake or zero-filled snapshots.
 */
import type { IngestTokenResult } from "../ingest-types";
import { DexScreenerAdapter, isValidSolanaAddress } from "./external/dexscreener";
import { ExternalDataError, toFailure } from "./external/dexscreener/errors";
import { normalizeIdentity, normalizeSnapshot } from "./external/dexscreener/normalizer";
import { insertSnapshot, upsertTokenIdentity } from "./ingestion.server";

export async function runIngestTokenByAddress(contractAddress: string): Promise<IngestTokenResult> {
  try {
    const address = contractAddress.trim();
    if (!isValidSolanaAddress(address)) throw new ExternalDataError("INVALID_ADDRESS");

    // One fetch per ingestion; the request layer dedupes identical calls.
    const selection = await DexScreenerAdapter.resolvePrimaryPair(address, { noCache: true });
    const pair = selection.primary;

    const identity = normalizeIdentity(pair, address);
    const snapshot = normalizeSnapshot(pair);

    if (snapshot.liquidityUsd === null || snapshot.liquidityUsd <= 0) {
      throw new ExternalDataError("PAIR_WITHOUT_LIQUIDITY");
    }

    const token = await upsertTokenIdentity(identity);
    const inserted = await insertSnapshot(token.id, snapshot);

    return {
      ok: true,
      token: {
        id: token.id,
        contractAddress: token.contractAddress,
        symbol: token.symbol,
        name: token.name,
        imageUrl: token.imageUrl,
        websiteUrl: token.websiteUrl,
        twitterUrl: token.twitterUrl,
        telegramUrl: token.telegramUrl,
      },
      snapshot: { ...snapshot, capturedAt: inserted.capturedAt },
      snapshotId: inserted.id,
      pair: {
        pairAddress: identity.dexPairAddress,
        dexId: identity.primaryDexId,
        quoteTokenSymbol: identity.primaryQuoteTokenSymbol,
        quoteTokenAddress: identity.primaryQuoteTokenAddress,
        pairCreatedAt: identity.pairCreatedAt,
        eligiblePairCount: selection.eligible.length,
        rejectedPairCount: selection.rejectedCount,
        ambiguous: selection.ambiguous,
        selectionVersion: selection.version,
      },
    };
  } catch (error) {
    if (!(error instanceof ExternalDataError)) console.error("ingestTokenByAddress failed", error);
    return toFailure(error);
  }
}
