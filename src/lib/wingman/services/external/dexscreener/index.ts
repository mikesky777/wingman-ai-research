/**
 * DexScreener adapter — the only place in Wingman that knows DexScreener's
 * response shapes. Services consume normalized models from `normalizer.ts`.
 *
 * Endpoints used (public API, no credentials required):
 *   GET /token-pairs/v1/solana/{address}   — all pools for one token
 *   GET /tokens/v1/solana/{addresses}      — batch pool lookup (max 30)
 *   GET /token-profiles/latest/v1          — discovery candidates
 *   GET /token-boosts/latest/v1            — promotional attention (latest)
 *   GET /token-boosts/top/v1               — promotional attention (top)
 */
import { dexRequest } from "./client";
import { ExternalDataError } from "./errors";
import { SOLANA_CHAIN_ID, selectPrimaryPair, type PairSelection } from "./pair-selection";
import { normalizeDiscovery, type DiscoveryCandidate } from "./normalizer";
import type { DsPair, DsTokenBoost, DsTokenProfile } from "./types";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BATCH_LIMIT = 30;

/** Basic base58 / length validation. Cheap guard before any network call. */
export function isValidSolanaAddress(address: string): boolean {
  return SOLANA_ADDRESS_RE.test(address.trim());
}

function asPairArray(payload: unknown): DsPair[] {
  if (Array.isArray(payload)) return payload as DsPair[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { pairs?: unknown }).pairs)) {
    return (payload as { pairs: DsPair[] }).pairs;
  }
  if (payload === null) return [];
  throw new ExternalDataError("MALFORMED_RESPONSE");
}

export const DexScreenerAdapter = {
  /** Every DexScreener pool associated with one Solana token address. */
  async getPairsForToken(address: string, options?: { noCache?: boolean }): Promise<DsPair[]> {
    if (!isValidSolanaAddress(address)) throw new ExternalDataError("INVALID_ADDRESS");
    const payload = await dexRequest<unknown>(
      `/token-pairs/v1/${SOLANA_CHAIN_ID}/${encodeURIComponent(address.trim())}`,
      options ?? {},
    );
    return asPairArray(payload);
  },

  /** Batch market lookup for known Solana addresses (chunked to the API limit). */
  async getPairsForTokens(addresses: string[]): Promise<DsPair[]> {
    const valid = [...new Set(addresses.map((a) => a.trim()).filter(isValidSolanaAddress))];
    const out: DsPair[] = [];
    for (let i = 0; i < valid.length; i += BATCH_LIMIT) {
      const chunk = valid.slice(i, i + BATCH_LIMIT);
      const payload = await dexRequest<unknown>(`/tokens/v1/${SOLANA_CHAIN_ID}/${chunk.join(",")}`);
      out.push(...asPairArray(payload));
    }
    return out;
  },

  /**
   * Discovery candidates — latest token profiles. This is an attention feed,
   * NOT the complete Solana token universe.
   */
  async getDiscoveryProfiles(chain = SOLANA_CHAIN_ID): Promise<DiscoveryCandidate[]> {
    const payload = await dexRequest<DsTokenProfile[]>("/token-profiles/latest/v1");
    if (!Array.isArray(payload)) throw new ExternalDataError("MALFORMED_RESPONSE");
    return payload
      .filter((entry) => entry.chainId === chain)
      .map((entry) => normalizeDiscovery(entry, "token-profiles"))
      .filter((entry): entry is DiscoveryCandidate => entry !== null);
  },

  /**
   * Promotional-attention candidates. Boosts are PAID placement and must never
   * be treated as positive evidence in scoring.
   */
  async getBoostedTokens(
    kind: "latest" | "top" = "latest",
    chain = SOLANA_CHAIN_ID,
  ): Promise<DiscoveryCandidate[]> {
    const payload = await dexRequest<DsTokenBoost[]>(`/token-boosts/${kind}/v1`);
    if (!Array.isArray(payload)) throw new ExternalDataError("MALFORMED_RESPONSE");
    return payload
      .filter((entry) => entry.chainId === chain)
      .map((entry) => normalizeDiscovery(entry, "token-boosts"))
      .filter((entry): entry is DiscoveryCandidate => entry !== null);
  },

  /** Fetch + deterministic primary-pair resolution in one step. */
  async resolvePrimaryPair(address: string, options?: { noCache?: boolean }): Promise<PairSelection> {
    const pairs = await this.getPairsForToken(address, options);
    if (pairs.length === 0) throw new ExternalDataError("TOKEN_NOT_FOUND");
    const selection = selectPrimaryPair(pairs, address.trim());
    if (!selection) throw new ExternalDataError("NO_ELIGIBLE_PAIR");
    return selection;
  },
};

export { ExternalDataError, type PairSelection };
export * from "./normalizer";
export { PAIR_SELECTION_VERSION, selectPrimaryPair } from "./pair-selection";
export type { DsPair, DsTokenBoost, DsTokenProfile } from "./types";
