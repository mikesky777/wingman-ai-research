/**
 * Universe Eligibility — Wingman's trading MANDATE, nothing else.
 *
 * This is not a thesis judgement, not a quality score, not a safety score and
 * never an input to Quantitative Research Priority. It answers exactly one
 * question: is this token the KIND of asset Wingman v0 is meant to scan
 * (Solana meme / speculative tokens)?
 *
 * Hard rules:
 *   - OUT_OF_SCOPE requires high-confidence evidence about the CANDIDATE TOKEN
 *     ITSELF: an exact verified mint in the registry below, or authoritative
 *     stored metadata about its own asset type.
 *   - Never fuzzy name or ticker matching. "Looks like a stablecoin" is not
 *     evidence, and neither is resembling a known protocol.
 *   - Never the pair's quote/base role. Trading against SOL, USDC, USDT or
 *     hyUSD says nothing about the candidate.
 *   - Anything short of that is UNKNOWN, and UNKNOWN stays fully eligible.
 *     False negatives are preferred over false positives.
 */

export type UniverseEligibility = "IN_SCOPE" | "OUT_OF_SCOPE" | "UNKNOWN";

export type UniverseCategory =
  | "STABLE_ASSET"
  | "WRAPPED_ASSET"
  | "LIQUID_STAKING"
  | "RECEIPT_OR_LP"
  | "OTHER_FINANCIAL_PRIMITIVE";

/** Why a candidate carries its eligibility. Machine-readable + human note. */
export interface UniverseAssessment {
  eligibility: UniverseEligibility;
  category: UniverseCategory | null;
  /** Short human-readable explanation. Never fabricated. */
  reason: string;
  /** What established the classification. */
  evidence: "exact_mint_registry" | "none";
}

export const OUT_OF_SCOPE_REASON = "OUT_OF_SCOPE_ASSET";

export interface RegistryEntry {
  /** Exact Solana mint. Never derived from a symbol or a name. */
  mint: string;
  category: UniverseCategory;
  /** Provenance note: what this mint is and how it was verified. */
  note: string;
}

/**
 * Exact-mint registry. Every entry was verified against mints already stored
 * in Wingman's own `tokens` records — no mint here was inferred from a symbol
 * or a token name. Add entries here only, never inline in scanner code.
 */
export const UNIVERSE_REGISTRY: RegistryEntry[] = [
  // Stable / synthetic-dollar assets.
  {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    category: "STABLE_ASSET",
    note: "USD Coin (USDC) — verified mint in Wingman token records.",
  },
  {
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    category: "STABLE_ASSET",
    note: "Tether (USDT) — verified mint in Wingman token records.",
  },
  {
    mint: "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT",
    category: "STABLE_ASSET",
    note: "Ethena USDe synthetic dollar — verified mint in Wingman token records.",
  },
  {
    mint: "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD",
    category: "STABLE_ASSET",
    note: "Jupiter USD (JupUSD) — verified mint in Wingman token records.",
  },
  {
    mint: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",
    category: "STABLE_ASSET",
    note: "Sky USDS — verified mint in Wingman token records.",
  },
  {
    mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
    category: "STABLE_ASSET",
    note: "PayPal USD (PYUSD) — verified mint in Wingman token records.",
  },

  // Wrapped / bridged representations of assets that exist elsewhere.
  {
    mint: "So11111111111111111111111111111111111111112",
    category: "WRAPPED_ASSET",
    note: "Wrapped SOL — verified mint in Wingman token records.",
  },
  {
    mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    category: "WRAPPED_ASSET",
    note: "Wrapped Ether (Wormhole) — verified mint in Wingman token records.",
  },
  {
    mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
    category: "WRAPPED_ASSET",
    note: "Wrapped BTC (Wormhole) — verified mint in Wingman token records.",
  },
  {
    mint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
    category: "WRAPPED_ASSET",
    note: "Coinbase Wrapped BTC — verified mint in Wingman token records.",
  },
  {
    mint: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
    category: "WRAPPED_ASSET",
    note: "Zcash (ZEC) Solana representation — verified mint in Wingman token records.",
  },
  {
    mint: "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
    category: "WRAPPED_ASSET",
    note: "Hyperliquid HYPE Solana representation — verified mint in Wingman token records.",
  },

  // Liquid-staking tokens.
  {
    mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    category: "LIQUID_STAKING",
    note: "Jito Staked SOL — verified mint in Wingman token records.",
  },
  {
    mint: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
    category: "LIQUID_STAKING",
    note: "Jupiter Staked SOL — verified mint in Wingman token records.",
  },
  {
    mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    category: "LIQUID_STAKING",
    note: "BlazeStake Staked SOL — verified mint in Wingman token records.",
  },

  // Receipt / staked-position tokens.
  {
    mint: "xorcaYqbXUNz3474ubUMJAdu2xgPsew3rUCe5ughT3N",
    category: "RECEIPT_OR_LP",
    note: "Staked Orca (xORCA) receipt token — verified mint in Wingman token records.",
  },
];

const REGISTRY_BY_MINT: Map<string, RegistryEntry> = new Map(
  UNIVERSE_REGISTRY.map((entry) => [entry.mint, entry]),
);

export const CATEGORY_LABELS: Record<UniverseCategory, string> = {
  STABLE_ASSET: "Stable / synthetic dollar",
  WRAPPED_ASSET: "Wrapped / bridged asset",
  LIQUID_STAKING: "Liquid staking token",
  RECEIPT_OR_LP: "Receipt / LP token",
  OTHER_FINANCIAL_PRIMITIVE: "Financial primitive",
};

export const UNKNOWN_ASSESSMENT: UniverseAssessment = {
  eligibility: "UNKNOWN",
  category: null,
  reason: "No high-confidence asset-type evidence; treated as eligible.",
  evidence: "none",
};

/**
 * Classify one candidate. Deterministic and pure: exact mint comparison only.
 * The token's symbol and name are deliberately NOT read.
 */
export function classifyUniverse(contractAddress: string): UniverseAssessment {
  const entry = REGISTRY_BY_MINT.get(contractAddress.trim());
  if (!entry) return UNKNOWN_ASSESSMENT;
  return {
    eligibility: "OUT_OF_SCOPE",
    category: entry.category,
    reason: entry.note,
    evidence: "exact_mint_registry",
  };
}

export interface UniverseDiagnostics {
  inScope: number;
  outOfScope: number;
  unknown: number;
  /** OUT_OF_SCOPE counts per category. Empty when nothing was excluded. */
  byCategory: Record<string, number>;
}

export function universeDiagnostics(
  assessments: { eligibility: UniverseEligibility; category: UniverseCategory | null }[],
): UniverseDiagnostics {
  const out: UniverseDiagnostics = { inScope: 0, outOfScope: 0, unknown: 0, byCategory: {} };
  for (const a of assessments) {
    if (a.eligibility === "IN_SCOPE") out.inScope += 1;
    else if (a.eligibility === "UNKNOWN") out.unknown += 1;
    else {
      out.outOfScope += 1;
      const key = a.category ?? "UNCATEGORIZED";
      out.byCategory[key] = (out.byCategory[key] ?? 0) + 1;
    }
  }
  return out;
}
