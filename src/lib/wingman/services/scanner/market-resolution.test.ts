import { describe, expect, it, vi, beforeEach } from "vitest";

const getPairsForTokens = vi.fn();

vi.mock("../external/dexscreener", () => ({
  DexScreenerAdapter: {
    getPairsForTokens: (addresses: string[]) => getPairsForTokens(addresses),
  },
}));

import { resolveMarketsDetailed } from "./market-eligibility.server";
import {
  MARKET_LOOKUP_UNAVAILABLE,
  NO_VALID_DEX_MARKET,
  marketRejection,
} from "./market-eligibility";

const ADDRESS = "So11111111111111111111111111111111111111112";

function pair(address: string) {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: "PairAddress1111111111111111111111111111111",
    baseToken: { address, name: "T", symbol: "T" },
    quoteToken: { address: "Quote1111111111111111111111111111111111111", symbol: "SOL" },
    priceUsd: "1.23",
    liquidity: { usd: 250_000 },
    volume: { h24: 100_000 },
    txns: { h24: { buys: 100, sells: 90 } },
  };
}

describe("market resolution resilience", () => {
  beforeEach(() => getPairsForTokens.mockReset());

  it("retries a failing batch and succeeds without rejecting the universe", async () => {
    getPairsForTokens
      .mockRejectedValueOnce(new Error("RATE_LIMITED"))
      .mockResolvedValueOnce([pair(ADDRESS)]);

    const result = await resolveMarketsDetailed([ADDRESS]);
    expect(result.failedBatches).toBe(0);
    expect(result.resolutions.get(ADDRESS)?.ok).toBe(true);
  });

  it("marks an exhausted batch as a provider failure, not an absent market", async () => {
    getPairsForTokens.mockImplementation(() => Promise.reject(new Error("PROVIDER_UNAVAILABLE")));

    const result = await resolveMarketsDetailed([ADDRESS]);
    expect(result.batches).toBe(1);
    expect(result.failedBatches).toBe(1);
    const resolution = result.resolutions.get(ADDRESS)!;
    expect(resolution.ok).toBe(false);
    expect(resolution.providerFailure).toBe(true);
    expect(resolution.liquidityUsd).toBeNull();
    expect(marketRejection(ADDRESS, resolution).reason).toBe(MARKET_LOOKUP_UNAVAILABLE);
  }, 15_000);

  it("still reports a confirmed absent market distinctly", async () => {
    getPairsForTokens.mockResolvedValue([]);
    const result = await resolveMarketsDetailed([ADDRESS]);
    const resolution = result.resolutions.get(ADDRESS)!;
    expect(resolution.providerFailure).toBeUndefined();
    expect(marketRejection(ADDRESS, resolution).reason).toBe(NO_VALID_DEX_MARKET);
  });
});
