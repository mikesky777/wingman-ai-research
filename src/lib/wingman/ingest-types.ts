/**
 * Client-safe result contract for live ingestion.
 *
 * The UI only ever sees these normalized shapes — never a DexScreener payload.
 * `null` always means "unavailable from this provider", never zero.
 */
import type { ExternalDataErrorCode } from "./services/external/dexscreener/errors";
import type { NormalizedSnapshot } from "./services/external/dexscreener/normalizer";

export interface SelectedPairMeta {
  pairAddress: string | null;
  dexId: string | null;
  quoteTokenSymbol: string | null;
  quoteTokenAddress: string | null;
  pairCreatedAt: string | null;
  /** How many eligible Solana pools existed for this token. */
  eligiblePairCount: number;
  /** Pools rejected as not-Solana / not-this-token. */
  rejectedPairCount: number;
  ambiguous: boolean;
  selectionVersion: string;
}

export interface IngestedToken {
  id: string;
  contractAddress: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  websiteUrl: string | null;
  twitterUrl: string | null;
  telegramUrl: string | null;
}

export interface IngestTokenSuccess {
  ok: true;
  token: IngestedToken;
  snapshot: NormalizedSnapshot;
  snapshotId: string;
  pair: SelectedPairMeta;
}

export interface IngestTokenFailure {
  ok: false;
  code: ExternalDataErrorCode;
  message: string;
}

export type IngestTokenResult = IngestTokenSuccess | IngestTokenFailure;
