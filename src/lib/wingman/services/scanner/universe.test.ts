import { describe, expect, it } from "vitest";
import { evaluateCandidate } from "./evaluate";
import { classifyUniverse, universeDiagnostics, UNIVERSE_REGISTRY } from "./universe";
import type { DiscoveredToken } from "./types";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MEME = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

function token(address: string, overrides: Partial<DiscoveredToken> = {}): DiscoveredToken {
  return {
    chain: "solana",
    contractAddress: address,
    symbol: "TEST",
    name: "Test",
    priceUsd: 0.001,
    marketCap: 900_000,
    fdv: 900_000,
    liquidityUsd: 180_000,
    volume5m: 4_000,
    volume1h: 40_000,
    volume6h: 200_000,
    volume24h: 700_000,
    priceChange1h: 4,
    priceChange6h: 9,
    priceChange24h: 20,
    trades5m: 40,
    trades1h: 400,
    trades24h: 4_000,
    buys24h: 2_100,
    sells24h: 1_900,
    holderCount: 3_000,
    uniqueWallets24h: 900,
    pairCreatedAt: new Date(Date.now() - 20 * 24 * 3600_000).toISOString(),
    tokenCreatedAt: null,
    lastTradeAt: new Date().toISOString(),
    pairAddress: "pair",
    dexId: "raydium",
    discovery: [{ source: "birdeye", queryId: "q", family: "volume", rank: 1 }],
    ...overrides,
  } as DiscoveredToken;
}

describe("universe eligibility", () => {
  it("classifies an exact registry mint as OUT_OF_SCOPE with a category", () => {
    const a = classifyUniverse(USDC);
    expect(a.eligibility).toBe("OUT_OF_SCOPE");
    expect(a.category).toBe("STABLE_ASSET");
    expect(a.evidence).toBe("exact_mint_registry");
  });

  it("treats anything without exact evidence as UNKNOWN and eligible", () => {
    const a = classifyUniverse(MEME);
    expect(a.eligibility).toBe("UNKNOWN");
    expect(a.category).toBeNull();
    expect(a.evidence).toBe("none");
  });

  it("never classifies on a stablecoin-looking symbol or name", () => {
    // Fake mint, stable-sounding metadata: still eligible.
    const fake = classifyUniverse("USDCfakefakefakefakefakefakefakefakefake11");
    expect(fake.eligibility).toBe("UNKNOWN");
  });

  it("registry mints are unique", () => {
    const mints = UNIVERSE_REGISTRY.map((e) => e.mint);
    expect(new Set(mints).size).toBe(mints.length);
  });

  it("excludes OUT_OF_SCOPE candidates from setups and selection but keeps metrics", () => {
    const evaluated = evaluateCandidate(token(USDC), { universe: classifyUniverse(USDC) });
    expect(evaluated.rejection?.reason).toBe("OUT_OF_SCOPE_ASSET");
    expect(evaluated.lanes).toEqual([]);
    expect(evaluated.passedHardFilters).toBe(false);
    expect(evaluated.metrics.volumeToLiquidity24h).not.toBeNull();
  });

  it("leaves UNKNOWN candidates completely unchanged", () => {
    const withUniverse = evaluateCandidate(token(MEME), { universe: classifyUniverse(MEME) });
    const without = evaluateCandidate(token(MEME));
    expect(withUniverse.quantitativePriority).toBe(without.quantitativePriority);
    expect(withUniverse.lanes).toEqual(without.lanes);
  });

  it("summarizes diagnostics by category", () => {
    const d = universeDiagnostics([
      { eligibility: "OUT_OF_SCOPE", category: "STABLE_ASSET" },
      { eligibility: "OUT_OF_SCOPE", category: "LIQUID_STAKING" },
      { eligibility: "UNKNOWN", category: null },
    ]);
    expect(d.outOfScope).toBe(2);
    expect(d.unknown).toBe(1);
    expect(d.byCategory["STABLE_ASSET"]).toBe(1);
  });
});
