import { afterEach, describe, expect, it, vi } from "vitest";
import { DexScreenerAdapter, isValidSolanaAddress } from "./index";
import { resetDexCache } from "./client";
import { selectPrimaryPair } from "./pair-selection";
import { normalizeIdentity, normalizeSnapshot } from "./normalizer";
import { ExternalDataError } from "./errors";
import type { DsPair } from "./types";

const ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OTHER = "So11111111111111111111111111111111111111112";

function pair(overrides: Partial<DsPair> = {}): DsPair {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: "PAIR1",
    baseToken: { address: ADDRESS, name: "Demo Token", symbol: "DEMO" },
    quoteToken: { address: OTHER, name: "Wrapped SOL", symbol: "SOL" },
    priceUsd: "0.0421",
    txns: { m5: { buys: 12, sells: 4 }, h1: { buys: 90, sells: 61 } },
    volume: { m5: 1200, h1: 30000, h6: 90000, h24: 250000 },
    priceChange: { m5: 1.2, h1: -3.4, h6: 12, h24: 44 },
    liquidity: { usd: 120000 },
    fdv: 9000000,
    marketCap: 8000000,
    pairCreatedAt: Date.UTC(2026, 0, 1),
    info: {
      imageUrl: "https://img.example/demo.png",
      websites: [{ url: "https://demo.example" }],
      socials: [{ type: "twitter", url: "https://x.com/demo" }],
    },
    boosts: { active: 3 },
    ...overrides,
  };
}

function mockFetch(payload: unknown, init: { status?: number; reject?: unknown } = {}) {
  const impl = vi.fn(async () => {
    if (init.reject) throw init.reject;
    return new Response(JSON.stringify(payload), { status: init.status ?? 200 });
  });
  vi.stubGlobal("fetch", impl);
  return impl;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetDexCache();
});

describe("address validation", () => {
  it("accepts a base58 Solana address", () => {
    expect(isValidSolanaAddress(ADDRESS)).toBe(true);
  });

  it("rejects invalid addresses", () => {
    expect(isValidSolanaAddress("0xabc")).toBe(false);
    expect(isValidSolanaAddress("not an address")).toBe(false);
    expect(isValidSolanaAddress("")).toBe(false);
  });
});

describe("pair selection", () => {
  it("prefers the highest-liquidity eligible pool, not the first returned", () => {
    const pools = [
      pair({ pairAddress: "LOW", liquidity: { usd: 5_000 } }),
      pair({ pairAddress: "HIGH", liquidity: { usd: 900_000 } }),
      pair({ pairAddress: "MID", liquidity: { usd: 100_000 } }),
    ];
    const selection = selectPrimaryPair(pools, ADDRESS)!;
    expect(selection.primary.pairAddress).toBe("HIGH");
    expect(selection.eligible).toHaveLength(3);
    expect(selection.ambiguous).toBe(true);
  });

  it("excludes non-Solana pairs and pairs without the requested token", () => {
    const pools = [
      pair({ pairAddress: "ETH", chainId: "ethereum", liquidity: { usd: 9_000_000 } }),
      pair({
        pairAddress: "UNRELATED",
        baseToken: { address: OTHER, symbol: "SOL" },
        quoteToken: { address: "OtherMint1111111111111111111111111111111111", symbol: "USDC" },
        liquidity: { usd: 9_000_000 },
      }),
      pair({ pairAddress: "OK", liquidity: { usd: 1_000 } }),
    ];
    const selection = selectPrimaryPair(pools, ADDRESS)!;
    expect(selection.primary.pairAddress).toBe("OK");
    expect(selection.rejectedCount).toBe(2);
  });

  it("returns null when no Solana pool is eligible", () => {
    expect(selectPrimaryPair([pair({ chainId: "base" })], ADDRESS)).toBeNull();
  });

  it("is deterministic when liquidity ties", () => {
    const pools = [
      pair({ pairAddress: "BBB", liquidity: { usd: 1000 }, volume: { h24: 10 } }),
      pair({ pairAddress: "AAA", liquidity: { usd: 1000 }, volume: { h24: 10 } }),
    ];
    const first = selectPrimaryPair(pools, ADDRESS)!.primary.pairAddress;
    const second = selectPrimaryPair([...pools].reverse(), ADDRESS)!.primary.pairAddress;
    expect(first).toBe(second);
  });
});

describe("normalization", () => {
  it("maps a normal response into the Wingman model", () => {
    const snapshot = normalizeSnapshot(pair());
    expect(snapshot.dataSource).toBe("dexscreener");
    expect(snapshot.priceUsd).toBeCloseTo(0.0421);
    expect(snapshot.marketCap).toBe(8_000_000);
    expect(snapshot.fdv).toBe(9_000_000);
    expect(snapshot.liquidityUsd).toBe(120_000);
    expect(snapshot.volume24h).toBe(250_000);
    expect(snapshot.buys1h).toBe(90);
    expect(snapshot.sourcePairAddress).toBe("PAIR1");
    expect(snapshot.sourceDexId).toBe("raydium");
  });

  it("keeps market cap and FDV distinct and never substitutes one for the other", () => {
    expect(normalizeSnapshot(pair({ marketCap: undefined })).marketCap).toBeNull();
    expect(normalizeSnapshot(pair({ marketCap: undefined })).fdv).toBe(9_000_000);
    expect(normalizeSnapshot(pair({ fdv: undefined })).fdv).toBeNull();
    expect(normalizeSnapshot(pair({ fdv: undefined })).marketCap).toBe(8_000_000);
  });

  it("stores missing liquidity and missing volume windows as null, never zero", () => {
    const snapshot = normalizeSnapshot(pair({ liquidity: undefined, volume: { h24: 100 } }));
    expect(snapshot.liquidityUsd).toBeNull();
    expect(snapshot.volume5m).toBeNull();
    expect(snapshot.volume1h).toBeNull();
    expect(snapshot.volume6h).toBeNull();
    expect(snapshot.volume24h).toBe(100);
  });

  it("keeps a genuine zero as zero", () => {
    const snapshot = normalizeSnapshot(pair({ volume: { m5: 0, h24: 0 } }));
    expect(snapshot.volume5m).toBe(0);
    expect(snapshot.volume24h).toBe(0);
  });

  it("never fabricates holder or unique-wallet data", () => {
    const snapshot = normalizeSnapshot(pair());
    expect(snapshot.holderCount).toBeNull();
    expect(snapshot.uniqueBuyers1h).toBeNull();
    expect(snapshot.uniqueSellers1h).toBeNull();
    expect(snapshot.top10HolderPct).toBeNull();
    expect(snapshot.top20HolderPct).toBeNull();
  });

  it("records paid boosts as descriptive metadata", () => {
    expect(normalizeSnapshot(pair()).promotion).toMatchObject({
      activeBoostCount: 3,
      hasActiveBoost: true,
    });
    expect(normalizeSnapshot(pair({ boosts: undefined })).promotion.activeBoostCount).toBeNull();
    expect(normalizeSnapshot(pair({ boosts: undefined })).promotion.hasActiveBoost).toBeNull();
  });

  it("handles missing metadata and socials", () => {
    const identity = normalizeIdentity(pair({ info: undefined }), ADDRESS);
    expect(identity.imageUrl).toBeNull();
    expect(identity.websiteUrl).toBeNull();
    expect(identity.twitterUrl).toBeNull();
    expect(identity.symbol).toBe("DEMO");
    expect(identity.primaryQuoteTokenSymbol).toBe("SOL");
    expect(identity.primaryDexId).toBe("raydium");
  });

  it("resolves identity when the requested token is the quote side", () => {
    const identity = normalizeIdentity(
      pair({
        baseToken: { address: OTHER, symbol: "SOL" },
        quoteToken: { address: ADDRESS, symbol: "DEMO", name: "Demo Token" },
      }),
      ADDRESS,
    );
    expect(identity.symbol).toBe("DEMO");
    expect(identity.primaryQuoteTokenSymbol).toBe("SOL");
  });
});

describe("adapter error handling", () => {
  it("rejects an invalid address before any network call", async () => {
    const fetchMock = mockFetch([]);
    await expect(DexScreenerAdapter.getPairsForToken("nope")).rejects.toBeInstanceOf(
      ExternalDataError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a token with no pools to TOKEN_NOT_FOUND", async () => {
    mockFetch([]);
    await expect(DexScreenerAdapter.resolvePrimaryPair(ADDRESS)).rejects.toMatchObject({
      code: "TOKEN_NOT_FOUND",
    });
  });

  it("maps a token with only non-Solana pools to NO_ELIGIBLE_PAIR", async () => {
    mockFetch([pair({ chainId: "base" })]);
    await expect(DexScreenerAdapter.resolvePrimaryPair(ADDRESS)).rejects.toMatchObject({
      code: "NO_ELIGIBLE_PAIR",
    });
  });

  it("maps provider failure and rate limiting", async () => {
    mockFetch(null, { status: 500 });
    await expect(DexScreenerAdapter.getPairsForToken(ADDRESS)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    resetDexCache();
    mockFetch(null, { status: 429 });
    await expect(DexScreenerAdapter.getPairsForToken(ADDRESS)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("maps a network error to PROVIDER_UNAVAILABLE", async () => {
    mockFetch(null, { reject: new TypeError("network down") });
    await expect(DexScreenerAdapter.getPairsForToken(ADDRESS)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("rejects a malformed response shape", async () => {
    mockFetch({ unexpected: true });
    await expect(DexScreenerAdapter.getPairsForToken(ADDRESS)).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
    });
  });

  it("does not refetch identical token data within one operation", async () => {
    const fetchMock = mockFetch([pair()]);
    await DexScreenerAdapter.getPairsForToken(ADDRESS);
    await DexScreenerAdapter.getPairsForToken(ADDRESS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
