/**
 * Client-safe result contract for live ingestion.
 *
 * The UI only ever sees these normalized shapes — never a DexScreener payload.
 * `null` always means "unavailable from this provider", never zero.
 */
import type { ExternalDataErrorCode } from "./services/external/dexscreener/errors";
import type { NormalizedSnapshot } from "./services/external/dexscreener/normalizer";
import type { EvidenceObservation } from "./services/evidence/types";

/**
 * Per-provider outcome. Providers fail independently: Birdeye being down
 * leaves holder evidence unavailable while market evidence still renders.
 * Unavailable is uncertainty, never negative evidence.
 */
export interface ProviderOutcome {
  source: string;
  ok: boolean;
  message: string | null;
}

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
  /** Combined, provider-independent observations from every provider that answered. */
  evidence: EvidenceObservation[];
  providers: ProviderOutcome[];
  /** Whether the append-only evidence history accepted the observations. */
  evidencePersisted: boolean;
}

export interface IngestTokenFailure {
  ok: false;
  code: ExternalDataErrorCode;
  message: string;
}

export type IngestTokenResult = IngestTokenSuccess | IngestTokenFailure;
