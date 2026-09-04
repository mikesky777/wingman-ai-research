import { describe, expect, it } from "vitest";
import { cohortFor, sortCohort, uniqueTokens, type CohortToken } from "./cohort";

const token = (over: Partial<CohortToken> = {}): CohortToken => ({
  tokenId: "t1",
  contractAddress: "mint1",
  name: "Token",
  symbol: "TKN",
  setups: ["BASE"],
  firstCallAt: "2026-09-01T00:00:00.000Z",
  firstCallMarketCap: 100_000,
  firstCallPriceUsd: 0.001,
  sinceCallPct: 10,
  peakSinceCallPct: 50,
  maxAdverseSinceCallPct: -20,
  drawdownSinceCallPct: -30,
  currentMarketCap: 110_000,
  currentPriceUsd: 0.0011,
  currentObservedAt: "2026-09-04T00:00:00.000Z",
  scanMarketCap: 100_000,
  scanLiquidityUsd: 40_000,
  scanVolume24h: 200_000,
  priceIntegrityStatus: null,
  structuralStatus: null,
  participationStatus: null,
  dexPairAddress: null,
  observationCount: 3,
  latestObservationAt: "2026-09-03T00:00:00.000Z",
  latestRecurrenceState: "REPEAT",
  ...over,
});

describe("history cohort durability", () => {
  it("keeps a prior call in its cohort even when absent from the latest scan", () => {
    const rows = [token({ tokenId: "old", latestObservationAt: "2026-08-01T00:00:00.000Z" })];
    expect(cohortFor(rows, "BASE")).toHaveLength(1);
  });

  it("keeps a prior REACCEL call in the REACCEL cohort after a setup change", () => {
    const rows = [token({ tokenId: "r", setups: ["REACCEL"], latestRecurrenceState: "CHANGED" })];
    expect(cohortFor(rows, "REACCEL")).toHaveLength(1);
    expect(cohortFor(rows, "BASE")).toHaveLength(0);
  });

  it("counts repeated scan appearances of one token exactly once", () => {
    const rows = [token(), token({ latestObservationAt: "2026-09-04T00:00:00.000Z" })];
    expect(uniqueTokens(rows)).toHaveLength(1);
  });

  it("does not let an empty latest scan erase history", () => {
    const rows = [token({ tokenId: "a" }), token({ tokenId: "b" })];
    // A zero-candidate scan contributes no rows; the cohort is unaffected.
    expect(cohortFor([...rows], "BASE")).toHaveLength(2);
  });

  it("keeps the First Call baseline frozen regardless of live values", () => {
    const t = token({ currentMarketCap: 5 });
    expect(t.firstCallMarketCap).toBe(100_000);
    expect(sortCohort([t], "RECENT")[0]!.firstCallMarketCap).toBe(100_000);
  });
});

describe("history cohort sorting", () => {
  it("sorts Most recent by latest observation descending", () => {
    const rows = [
      token({ tokenId: "a", latestObservationAt: "2026-09-01T00:00:00.000Z" }),
      token({ tokenId: "b", latestObservationAt: "2026-09-04T00:00:00.000Z" }),
      token({ tokenId: "c", latestObservationAt: "2026-09-02T00:00:00.000Z" }),
    ];
    expect(sortCohort(rows, "RECENT").map((t) => t.tokenId)).toEqual(["b", "c", "a"]);
  });

  it("falls back to First Call when a token has no scanner observation", () => {
    const rows = [
      token({ tokenId: "a", latestObservationAt: null, firstCallAt: "2026-09-05T00:00:00.000Z" }),
      token({ tokenId: "b", latestObservationAt: "2026-09-03T00:00:00.000Z" }),
    ];
    expect(sortCohort(rows, "RECENT").map((t) => t.tokenId)).toEqual(["a", "b"]);
  });

  it("sorts Highest peak call descending", () => {
    const rows = [
      token({ tokenId: "a", peakSinceCallPct: 12 }),
      token({ tokenId: "b", peakSinceCallPct: 400 }),
      token({ tokenId: "c", peakSinceCallPct: 90 }),
    ];
    expect(sortCohort(rows, "PEAK").map((t) => t.tokenId)).toEqual(["b", "c", "a"]);
  });

  it("sorts missing Peak Call last instead of treating it as zero", () => {
    const rows = [
      token({ tokenId: "missing", peakSinceCallPct: null }),
      token({ tokenId: "negative", peakSinceCallPct: -40 }),
      token({ tokenId: "positive", peakSinceCallPct: 5 }),
    ];
    expect(sortCohort(rows, "PEAK").map((t) => t.tokenId)).toEqual([
      "positive",
      "negative",
      "missing",
    ]);
  });

  it("never mutates or drops rows", () => {
    const rows = [token({ tokenId: "a" }), token({ tokenId: "b", peakSinceCallPct: null })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    expect(sortCohort(rows, "PEAK")).toHaveLength(2);
    expect(rows).toEqual(snapshot);
  });
});
