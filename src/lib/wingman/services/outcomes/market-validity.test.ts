import { describe, expect, it } from "vitest";
import { assessMarketValidity } from "./market-validity";
import { buildObservationSeries, deriveOutcome, type Observation } from "./outcomes";

const obs = (
  at: string,
  marketCap: number | null,
  liquidityUsd: number | null,
): Observation => ({ at, priceUsd: null, marketCap, liquidityUsd, source: "token_snapshot" });

describe("outcome market validity", () => {
  it("marks drained pools invalid", () => {
    expect(assessMarketValidity({ liquidityUsd: 2.5, marketCap: 766_991_432_341 })).toMatchObject({
      validity: "INVALID_MARKET",
      reason: "DRAINED_LIQUIDITY",
    });
  });

  it("marks implausible market-cap-to-liquidity ratios invalid", () => {
    expect(assessMarketValidity({ liquidityUsd: 500, marketCap: 50_000_000 }).validity).toBe(
      "INVALID_MARKET",
    );
  });

  it("keeps a real market valid", () => {
    expect(assessMarketValidity({ liquidityUsd: 23_524, marketCap: 51_207 }).validity).toBe("VALID");
  });

  it("reports missing liquidity evidence as UNKNOWN, never as zero", () => {
    const a = assessMarketValidity({ liquidityUsd: null, marketCap: 10_000 });
    expect(a.validity).toBe("UNKNOWN");
    expect(a.mcToLiquidity).toBeNull();
  });
});

describe("outcome derivation with invalid observations", () => {
  const base = {
    baselineAt: "2026-01-01T00:00:00.000Z",
    baselinePriceUsd: null,
    baselineMarketCap: 10_000,
    nowIso: "2026-01-02T00:00:00.000Z",
  };

  it("excludes invalid observations from current, peak and drawdown", () => {
    const out = deriveOutcome({
      ...base,
      series: [
        obs("2026-01-01T01:00:00.000Z", 20_000, 15_000),
        obs("2026-01-01T02:00:00.000Z", 900_000_000_000, 2.5),
      ],
    });
    expect(out.currentMarketCap).toBe(20_000);
    expect(out.maxMarketCap).toBe(20_000);
    expect(out.maxGainPct).toBe(100);
    expect(out.currentMarketValidity).toBe("INVALID_MARKET");
    expect(out.observationCount).toBe(2);
    expect(out.excludedObservationCount).toBe(1);
    expect(out.lastValidObservationAt).toBe("2026-01-01T01:00:00.000Z");
  });

  it("resumes tracking after a valid observation returns", () => {
    const out = deriveOutcome({
      ...base,
      series: [
        obs("2026-01-01T01:00:00.000Z", 20_000, 15_000),
        obs("2026-01-01T02:00:00.000Z", 900_000_000_000, 2.5),
        obs("2026-01-01T03:00:00.000Z", 5_000, 9_000),
      ],
    });
    expect(out.currentMarketCap).toBe(5_000);
    expect(out.currentMarketValidity).toBe("VALID");
    expect(out.maxPeakToTroughDrawdownPct).toBeCloseTo(-75, 6);
  });

  it("keeps observations with unknown liquidity usable but flagged", () => {
    const out = deriveOutcome({ ...base, series: [obs("2026-01-01T01:00:00.000Z", 12_000, null)] });
    expect(out.currentMarketCap).toBe(12_000);
    expect(out.currentMarketValidity).toBe("UNKNOWN");
    expect(out.excludedObservationCount).toBe(0);
  });

  it("never turns a missing observation into zero", () => {
    const out = deriveOutcome({ ...base, series: [] });
    expect(out.currentMarketCap).toBeNull();
    expect(out.maxGainPct).toBeNull();
  });

  it("carries liquidity through the merged observation series", () => {
    const series = buildObservationSeries(
      [
        {
          scanRunId: "r1",
          completedAt: "2026-01-01T01:00:00.000Z",
          priceUsd: null,
          marketCap: 1_000,
          liquidityUsd: 12,
          survivor: true,
        },
      ],
      [
        {
          capturedAt: "2026-01-01T02:00:00.000Z",
          priceUsd: null,
          marketCap: 2_000,
          liquidityUsd: 4_000,
        },
      ],
    );
    expect(series.map((o) => o.liquidityUsd)).toEqual([12, 4_000]);
  });
});
