/**
 * Raw DexScreener response shapes.
 *
 * These types describe the *external* API only. Nothing outside the
 * `external/dexscreener` folder should import them — the rest of Wingman
 * consumes the normalized models in `normalizer.ts`.
 *
 * Every field is optional/nullable on purpose: DexScreener frequently omits
 * values, and "missing" must never be silently turned into 0.
 */

export interface DsTokenRef {
  address?: string;
  name?: string;
  symbol?: string;
}

export interface DsTxnWindow {
  buys?: number;
  sells?: number;
}

export interface DsPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: DsTokenRef;
  quoteToken?: DsTokenRef;
  priceNative?: string;
  priceUsd?: string;
  txns?: Partial<Record<"m5" | "h1" | "h6" | "h24", DsTxnWindow>>;
  volume?: Partial<Record<"m5" | "h1" | "h6" | "h24", number>>;
  priceChange?: Partial<Record<"m5" | "h1" | "h6" | "h24", number>>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number; // epoch ms
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: { label?: string; url?: string }[];
    socials?: { type?: string; url?: string }[];
  };
  boosts?: { active?: number };
}

/** `/token-profiles/latest/v1` and `/token-boosts/*` share this envelope. */
export interface DsTokenProfile {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  header?: string;
  description?: string;
  links?: { type?: string; label?: string; url?: string }[];
}

export interface DsTokenBoost extends DsTokenProfile {
  amount?: number;
  totalAmount?: number;
}
