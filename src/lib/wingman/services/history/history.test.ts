import { describe, expect, it, vi } from "vitest";
import {
  cohortFor,
  liveSinceCallPct,
  mean,
  median,
  summarizeCohort,
  uniqueTokens,
  type CohortToken,
} from "./cohort";
import {
  LIVE_BATCH_SIZE,
  LIVE_HISTORY_PERSISTENCE_INTERVAL_MS,
  LIVE_REFRESH_INTERVAL_MS,
  batchAddresses,
  createLiveRunner,
  dexScreenerEmbedUrl,
  dexScreenerPairUrl,
  mergeLiveValues,
  shouldPersistObservation,
  type LiveMarketValues,
} from "./live-market";

function token(overrides: Partial<CohortToken> & { tokenId: string }): CohortToken {
  return {
    contractAddress: `${overrides.tokenId}-addr`,
    name: "Token",
    symbol: "TKN",
    setups: ["BASE"],
    firstCallAt: "2026-09-01T00:00:00.000Z",
    latestObservationAt: null,
    latestRecurrenceState: null,
    firstCallMarketCap: 100_000,
    firstCallPriceUsd: 0.001,
    sinceCallPct: 10,
    peakSinceCallPct: 50,
    maxAdverseSinceCallPct: -20,
    drawdownSinceCallPct: -30,
    currentMarketCap: 110_000,
    currentPriceUsd: 0.0011,
    currentObservedAt: "2026-09-02T00:00:00.000Z",
    scanMarketCap: 100_000,
    scanLiquidityUsd: 20_000,
    scanVolume24h: 50_000,
    priceIntegrityStatus: "HEALTHY",
    structuralStatus: "PASS",
    participationStatus: "BROAD",
    dexPairAddress: "pair-1",
    observationCount: 5,
    ...overrides,
  };
}

describe("history cohort statistics", () => {
  it("counts repeated scan appearances once", () => {
    const rows = [
      token({ tokenId: "a", sinceCallPct: 10 }),
      token({ tokenId: "a", sinceCallPct: 10 }),
      token({ tokenId: "a", sinceCallPct: 10 }),
      token({ tokenId: "b", sinceCallPct: 30 }),
    ];
    expect(uniqueTokens(rows)).toHaveLength(2);
    const summary = summarizeCohort(rows, "BASE");
    expect(summary.sampleSize).toBe(2);
    expect(summary.avgSinceCall).toEqual({ value: 20, n: 2 });
  });

  it("excludes missing values instead of treating them as zero", () => {
    const rows = [
      token({ tokenId: "a", sinceCallPct: 20, peakSinceCallPct: null }),
      token({ tokenId: "b", sinceCallPct: null, peakSinceCallPct: 40 }),
    ];
    const summary = summarizeCohort(rows, "BASE");
    expect(summary.avgSinceCall).toEqual({ value: 20, n: 1 });
    expect(summary.avgPeakCall).toEqual({ value: 40, n: 1 });
    expect(summary.winRate).toEqual({ value: 100, n: 1 });
  });

  it("computes mean and median correctly, including even-length sets", () => {
    expect(mean([1, 2, 3, 10])).toEqual({ value: 4, n: 4 });
    expect(median([1, 2, 3, 10])).toEqual({ value: 2.5, n: 4 });
    expect(median([5, 1, 3])).toEqual({ value: 3, n: 3 });
    expect(mean([null, undefined])).toEqual({ value: null, n: 0 });
  });

  it("keeps BASE and REACCEL cohorts separate", () => {
    const rows = [
      token({ tokenId: "a", setups: ["BASE"], sinceCallPct: 10 }),
      token({ tokenId: "b", setups: ["REACCEL"], sinceCallPct: 90 }),
      token({ tokenId: "c", setups: ["BASE", "MOMENTUM"], sinceCallPct: 30 }),
    ];
    expect(summarizeCohort(rows, "BASE").sampleSize).toBe(2);
    expect(summarizeCohort(rows, "BASE").avgSinceCall.value).toBe(20);
    expect(summarizeCohort(rows, "REACCEL").sampleSize).toBe(1);
    expect(summarizeCohort(rows, "REACCEL").avgSinceCall.value).toBe(90);
  });

  it("excludes tokens without a frozen First Call", () => {
    const rows = [token({ tokenId: "a", firstCallAt: null })];
    expect(cohortFor(rows, "BASE")).toHaveLength(0);
  });

  it("recomputes live Since Call against the frozen First Call baseline", () => {
    const t = token({ tokenId: "a", firstCallMarketCap: 100_000, sinceCallPct: 10 });
    expect(liveSinceCallPct(t, { marketCap: 150_000 })).toBe(50);
    // First Call itself is never rewritten by the live overlay.
    expect(t.firstCallMarketCap).toBe(100_000);
    expect(t.sinceCallPct).toBe(10);
    // No live reading → the persisted value is used unchanged.
    expect(liveSinceCallPct(t, null)).toBe(10);
    expect(liveSinceCallPct(t, { marketCap: null })).toBe(10);
  });
});

function liveValue(address: string, marketCap: number | null): LiveMarketValues {
  return {
    contractAddress: address,
    priceUsd: 1,
    marketCap,
    fdv: null,
    liquidityUsd: 1000,
    volume24h: 2000,
    priceChange5m: null,
    priceChange1h: 1,
    priceChange6h: 2,
    priceChange24h: 3,
    buys24h: 10,
    sells24h: 5,
    pairAddress: "pair-1",
    dexId: "raydium",
    observedAt: "2026-09-04T00:00:00.000Z",
  };
}

describe("live market overlay", () => {
  it("batches addresses to the provider limit instead of one request per row", () => {
    const addresses = Array.from({ length: 50 }, (_, i) => `addr-${i}`);
    const batches = batchAddresses(addresses);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(LIVE_BATCH_SIZE);
    expect(batches[1]).toHaveLength(20);
    expect(batchAddresses(["a", "a", " a ", "b"])).toEqual([["a", "b"]]);
  });

  it("keeps previous values when a provider refresh returns nothing", () => {
    const previous = { a: liveValue("a", 100) };
    expect(mergeLiveValues(previous, [])).toEqual(previous);
    expect(mergeLiveValues(previous, [liveValue("a", 200)])["a"]?.marketCap).toBe(200);
  });

  it("polls every 30s but persists at the slower 5 minute cadence", () => {
    expect(LIVE_REFRESH_INTERVAL_MS).toBe(30_000);
    expect(LIVE_HISTORY_PERSISTENCE_INTERVAL_MS).toBe(300_000);

    const now = "2026-09-04T00:10:00.000Z";
    // A 30s-old observation must NOT create another database row.
    expect(shouldPersistObservation("2026-09-04T00:09:30.000Z", now)).toBe(false);
    expect(shouldPersistObservation("2026-09-04T00:04:00.000Z", now)).toBe(true);
    expect(shouldPersistObservation(null, now)).toBe(true);
  });

  it("limits historical writes across a simulated 10 minute polling window", () => {
    let lastPersisted: string | null = null;
    let writes = 0;
    const start = Date.parse("2026-09-04T00:00:00.000Z");
    for (let tick = 0; tick < 20; tick += 1) {
      const nowIso = new Date(start + tick * LIVE_REFRESH_INTERVAL_MS).toISOString();
      if (shouldPersistObservation(lastPersisted, nowIso)) {
        writes += 1;
        lastPersisted = nowIso;
      }
    }
    // 20 polls over 10 minutes → 2 persisted observations, not 20.
    expect(writes).toBe(2);
  });

  it("skips refreshes while the document is hidden", async () => {
    const run = vi.fn(async () => {});
    let visible = false;
    let skipped = 0;
    const runner = createLiveRunner({
      isVisible: () => visible,
      run,
      onSkippedHidden: () => (skipped += 1),
    });

    expect(await runner.tick()).toBe("hidden");
    expect(run).not.toHaveBeenCalled();
    expect(skipped).toBe(1);

    visible = true;
    expect(await runner.tick()).toBe("ran");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never allows overlapping refreshes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(() => gate);
    const runner = createLiveRunner({ isVisible: () => true, run });

    const first = runner.tick();
    expect(runner.isBusy()).toBe(true);
    expect(await runner.tick()).toBe("busy");
    expect(await runner.manual()).toBe("busy");
    expect(run).toHaveBeenCalledTimes(1);

    release();
    expect(await first).toBe("ran");
    expect(runner.isBusy()).toBe(false);
    expect(await runner.manual()).toBe("ran");
  });

  it("builds embed and fallback URLs from the exact resolved pair", () => {
    const pair = "9xyzPairAddress";
    const embed = dexScreenerEmbedUrl(pair);
    expect(embed.startsWith(`https://dexscreener.com/solana/${pair}?`)).toBe(true);
    expect(embed).toContain("embed=1");
    expect(embed).toContain("theme=dark");
    expect(dexScreenerPairUrl(pair)).toBe(`https://dexscreener.com/solana/${pair}`);
  });
});
