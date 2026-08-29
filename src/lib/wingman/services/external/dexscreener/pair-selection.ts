/**
 * Deterministic primary-pair selection.
 *
 * A token can trade in many pools. Wingman never uses "whatever DexScreener
 * returned first", and never merges market data from unrelated pools.
 *
 * v1 rules (in order):
 *   1. Pair must be on Solana.
 *   2. Pair must actually contain the requested token (base or quote).
 *   3. Pair must have a usable pair address.
 *   4. Highest reported USD liquidity wins.
 *   5. Ties break on 24h volume, then oldest pair, then pair address —
 *      so the same input always yields the same pair.
 *
 * Every eligible pair is reported back so a future revision (e.g. quote-token
 * preference, DEX allow-lists) can change the rule without losing information.
 */
import type { DsPair } from "./types";

export const SOLANA_CHAIN_ID = "solana";
export const PAIR_SELECTION_VERSION = "pair-selection/v1-highest-liquidity";

export interface PairSelection {
  primary: DsPair;
  eligible: DsPair[];
  /** Pairs excluded because they were not Solana pairs for this token. */
  rejectedCount: number;
  /** True when several eligible pools exist — kept for auditing. */
  ambiguous: boolean;
  version: string;
}

function containsToken(pair: DsPair, address: string): boolean {
  const target = address.toLowerCase();
  return (
    pair.baseToken?.address?.toLowerCase() === target ||
    pair.quoteToken?.address?.toLowerCase() === target
  );
}

export function isEligible(pair: DsPair, address: string): boolean {
  return (
    pair.chainId === SOLANA_CHAIN_ID && Boolean(pair.pairAddress) && containsToken(pair, address)
  );
}

const num = (value: number | undefined | null): number =>
  typeof value === "number" && Number.isFinite(value) ? value : -1;

export function selectPrimaryPair(pairs: DsPair[], address: string): PairSelection | null {
  const eligible = pairs.filter((p) => isEligible(p, address));
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    const liq = num(b.liquidity?.usd) - num(a.liquidity?.usd);
    if (liq !== 0) return liq;
    const vol = num(b.volume?.h24) - num(a.volume?.h24);
    if (vol !== 0) return vol;
    const age = (a.pairCreatedAt ?? Number.MAX_SAFE_INTEGER) - (b.pairCreatedAt ?? Number.MAX_SAFE_INTEGER);
    if (age !== 0) return age;
    return (a.pairAddress ?? "").localeCompare(b.pairAddress ?? "");
  });

  return {
    primary: sorted[0]!,
    eligible: sorted,
    rejectedCount: pairs.length - eligible.length,
    ambiguous: eligible.length > 1,
    version: PAIR_SELECTION_VERSION,
  };
}
