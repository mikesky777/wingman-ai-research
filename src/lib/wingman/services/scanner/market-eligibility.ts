/**
 * Universal live-market eligibility (pure).
 *
 * Before any setup classification or survivor selection, a candidate must have
 * a genuinely resolvable Solana DEX market. Missing data is NEVER treated as
 * zero: an absent liquidity value is a rejection, not a $0 market.
 *
 * This module only interprets already-fetched DexScreener pools; fetching
 * lives in `market-eligibility.server.ts`.
 */
import { selectPrimaryPair } from "../external/dexscreener/pair-selection";
import type { DsPair } from "../external/dexscreener/types";
import { ACTIVITY_FLOOR } from "./config";
import type { HardFilterRejection } from "./types";

export const NO_VALID_DEX_MARKET = "NO_VALID_DEX_MARKET";
/** Provider lookup failed — NOT evidence that the token has no market. */
export const MARKET_LOOKUP_UNAVAILABLE = "MARKET_LOOKUP_UNAVAILABLE";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface MarketResolution {
  ok: boolean;
  /** Present only when a primary Solana pair resolved. */
  pairAddress: string | null;
  /** Usable USD liquidity from the resolved pair. `null` = unavailable. */
  liquidityUsd: number | null;
  /** Why the market was not usable. `null` when ok. */
  reasonDetail: string | null;
  /** Descriptive provenance of the resolved pair (never a filter input). */
  dexId?: string | null;
  quoteTokenSymbol?: string | null;
  /**
   * True when the lookup itself failed. A provider failure is NOT a confirmed
   * absence of a market; only a completed lookup can confirm that.
   */
  providerFailure?: boolean;
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pairPriceUsd(pair: DsPair): number | null {
  const raw = pair.priceUsd;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Does the resolved pair carry usable market/trading evidence? */
function hasTradingEvidence(pair: DsPair): boolean {
  if (pairPriceUsd(pair) !== null) return true;
  if (isNum(pair.volume?.h24)) return true;
  const txns = pair.txns?.h24;
  return isNum(txns?.buys) || isNum(txns?.sells);
}

/**
 * Assess one candidate's live market from its DexScreener pools.
 * `pairs` may be empty — that is a rejection, never a zero-liquidity pass.
 */
export function assessMarket(address: string, pairs: DsPair[] | undefined | null): MarketResolution {
  const trimmed = address.trim();
  if (!SOLANA_ADDRESS_RE.test(trimmed)) {
    return {
      ok: false,
      pairAddress: null,
      liquidityUsd: null,
      reasonDetail: "Contract address is not a valid Solana mint.",
    };
  }

  if (!pairs || pairs.length === 0) {
    return {
      ok: false,
      pairAddress: null,
      liquidityUsd: null,
      reasonDetail: "No DexScreener Solana pool could be resolved for this token.",
    };
  }

  const selection = selectPrimaryPair(pairs, trimmed);
  if (!selection) {
    return {
      ok: false,
      pairAddress: null,
      liquidityUsd: null,
      reasonDetail: "No eligible Solana trading pair for this token.",
    };
  }

  const primary = selection.primary;
  const liquidityUsd = isNum(primary.liquidity?.usd) ? (primary.liquidity!.usd as number) : null;

  if (liquidityUsd === null) {
    return {
      ok: false,
      pairAddress: primary.pairAddress ?? null,
      liquidityUsd: null,
      reasonDetail: "Resolved pair reports no usable USD liquidity.",
    };
  }

  if (liquidityUsd <= ACTIVITY_FLOOR.catastrophicLiquidityUsd) {
    return {
      ok: false,
      pairAddress: primary.pairAddress ?? null,
      liquidityUsd,
      reasonDetail: `Resolved pair liquidity is at or below the $${ACTIVITY_FLOOR.catastrophicLiquidityUsd.toLocaleString()} floor.`,
    };
  }

  if (!hasTradingEvidence(primary)) {
    return {
      ok: false,
      pairAddress: primary.pairAddress ?? null,
      liquidityUsd,
      reasonDetail: "Resolved pair carries no usable market or trading evidence.",
    };
  }

  return {
    ok: true,
    pairAddress: primary.pairAddress ?? null,
    liquidityUsd,
    reasonDetail: null,
    dexId: primary.dexId ?? null,
    quoteTokenSymbol: primary.quoteToken?.symbol ?? null,
  };
}

/** Turn a failed resolution into the standard rejection record. */
export function marketRejection(
  address: string,
  resolution: MarketResolution | undefined | null,
): HardFilterRejection {
  return {
    reason: resolution?.providerFailure ? MARKET_LOOKUP_UNAVAILABLE : NO_VALID_DEX_MARKET,
    detail:
      resolution?.reasonDetail ??
      "No valid DexScreener Solana market could be resolved for this token.",
    values: {
      contractAddress: address,
      pairAddress: resolution?.pairAddress ?? null,
      liquidityUsd: resolution?.liquidityUsd ?? null,
    },
  };
}
