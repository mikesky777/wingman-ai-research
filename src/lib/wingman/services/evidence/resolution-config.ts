/**
 * Centralized, provider-independent resolution configuration.
 *
 * Nothing here interprets evidence. These are comparison and freshness
 * mechanics only: how close two numbers must be to count as the same fact, how
 * long a fact stays fresh, and which provider wins a tie for a given metric.
 */
import type { EvidenceDomain, EvidenceSource } from "./types";

/** How two numeric observations of the SAME key are compared. */
export interface NumericTolerance {
  /** Allowed relative difference, 0.01 = 1%. */
  relative?: number;
  /** Allowed absolute difference (used for values near zero). */
  absolute?: number;
}

/**
 * Per-key tolerances. Keys are exact evidence keys; `keyPrefixes` and the
 * domain default provide graceful fallback for future keys. Tolerances are
 * deliberately NOT universal — provider methodologies differ per metric.
 */
export interface ToleranceConfig {
  byKey: Record<string, NumericTolerance>;
  byKeyPrefix: Array<{ prefix: string; tolerance: NumericTolerance }>;
  byDomain: Partial<Record<EvidenceDomain, NumericTolerance>>;
  fallback: NumericTolerance;
}

export const DEFAULT_TOLERANCES: ToleranceConfig = {
  byKey: {
    // Price is quoted continuously; only tiny drift is the "same" price.
    "market.price_usd": { relative: 0.002, absolute: 1e-12 },
    // Supply assumptions differ slightly between providers.
    "market.market_cap_usd": { relative: 0.02, absolute: 1 },
    "market.fdv_usd": { relative: 0.02, absolute: 1 },
    // Pool coverage differs a little more.
    "market.liquidity_usd": { relative: 0.05, absolute: 1 },
  },
  byKeyPrefix: [
    // Window boundaries and trade classification differ per provider.
    { prefix: "market.volume_", tolerance: { relative: 0.15, absolute: 1 } },
    { prefix: "market.price_change_", tolerance: { relative: 0.1, absolute: 0.25 } },
    { prefix: "market.buys_", tolerance: { relative: 0.1, absolute: 1 } },
    { prefix: "market.sells_", tolerance: { relative: 0.1, absolute: 1 } },
    // Only compared when the semantics are genuinely identical keys.
    { prefix: "holders.", tolerance: { relative: 0.01, absolute: 0.1 } },
  ],
  byDomain: {
    market: { relative: 0.05, absolute: 1 },
    holders: { relative: 0.01, absolute: 0.1 },
    provenance: { relative: 0, absolute: 0 },
  },
  fallback: { relative: 0.01, absolute: 0 },
};

export function toleranceFor(
  domain: EvidenceDomain,
  key: string,
  config: ToleranceConfig = DEFAULT_TOLERANCES,
): NumericTolerance {
  const exact = config.byKey[key];
  if (exact) return exact;
  const prefixed = config.byKeyPrefix.find((entry) => key.startsWith(entry.prefix));
  if (prefixed) return prefixed.tolerance;
  return config.byDomain[domain] ?? config.fallback;
}

/** Freshness windows in milliseconds, per evidence domain. */
export type FreshnessConfig = Record<EvidenceDomain, number>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_FRESHNESS: FreshnessConfig = {
  market: 5 * MINUTE,
  participation: 45 * MINUTE,
  social: 30 * MINUTE,
  holders: 6 * HOUR,
  creator: 7 * DAY,
  provenance: 30 * DAY,
  // Reserved evidence/v1.1 domains. Nothing emits these yet, so these windows
  // are placeholders only and cannot affect any current resolution.
  wallet: 30 * MINUTE,
  developer: 7 * DAY,
  liquidity_flow: 15 * MINUTE,
};

/**
 * Provider preference per metric — intentionally NOT a single global ranking.
 * Earlier entries win. Sources absent from a list rank after listed ones and
 * are then ordered deterministically by name.
 */
export interface ProviderPreferenceConfig {
  byKey: Record<string, EvidenceSource[]>;
  byDomain: Partial<Record<EvidenceDomain, EvidenceSource[]>>;
  fallback: EvidenceSource[];
}

export const DEFAULT_PROVIDER_PREFERENCE: ProviderPreferenceConfig = {
  byKey: {
    "market.price_usd": ["birdeye", "jupiter", "dexscreener"],
    "market.liquidity_usd": ["dexscreener", "birdeye"],
  },
  byDomain: {
    market: ["dexscreener", "birdeye", "jupiter"],
    holders: ["birdeye", "bubblemaps", "helius"],
    creator: ["birdeye", "helius"],
    provenance: ["dexscreener", "helius"],
    social: ["x"],
  },
  fallback: [],
};

export function preferenceFor(
  domain: EvidenceDomain,
  key: string,
  config: ProviderPreferenceConfig = DEFAULT_PROVIDER_PREFERENCE,
): EvidenceSource[] {
  return config.byKey[key] ?? config.byDomain[domain] ?? config.fallback;
}
