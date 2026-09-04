import { describe, expect, it } from "vitest";
import {
  buildObservationSeries,
  deriveMilestones,
  deriveOutcome,
  emptyOutcome,
  type CandidateAppearance,
  type Observation,
} from "./outcomes";

const iso = (minutes: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + minutes * 60000).toISOString();

function obs(minutes: number, marketCap: number | null, priceUsd: number | null = 1): Observation {
  return { at: iso(minutes), marketCap, priceUsd, source: "token_snapshot" };
}

function appearance(
  minutes: number,
  survivor: boolean,
  marketCap: number | null,
): CandidateAppearance {
  return {
    scanRunId: `run-${minutes}`,
    completedAt: iso(minutes),
    priceUsd: 1,
    marketCap,
    survivor,
  };
}

const since = (series: Observation[], baselineMinutes: number, baselineCap: number | null) =>
  deriveOutcome({
    baselineAt: iso(baselineMinutes),
    baselinePriceUsd: 1,
    baselineMarketCap: baselineCap,
    series,
    nowIso: iso(1000),
  });

describe("max adverse since call", () => {
  it("measures the worst post-call low against the frozen call baseline", () => {
    const out = since([obs(0, 100_000), obs(30, 72_000), obs(60, 90_000)], 0, 100_000);
    expect(out.maxAdverseChangePct).toBeCloseTo(-28, 6);
    expect(out.minMarketCapAt).toBe(iso(30));
  });

  it("ignores observations before First Call", () => {
    const out = since([obs(-60, 10_000), obs(0, 100_000), obs(30, 90_000)], 0, 100_000);
    expect(out.maxAdverseChangePct).toBeCloseTo(-10, 6);
    expect(out.minMarketCapAt).toBe(iso(30));
  });

  it("worsens with a lower later observation and is unchanged by a higher one", () => {
    const base = [obs(0, 100_000), obs(30, 90_000)];
    expect(since(base, 0, 100_000).maxAdverseChangePct).toBeCloseTo(-10, 6);
    expect(since([...base, obs(60, 80_000)], 0, 100_000).maxAdverseChangePct).toBeCloseTo(-20, 6);
    expect(since([...base, obs(60, 300_000)], 0, 100_000).maxAdverseChangePct).toBeCloseTo(-10, 6);
  });

  it("never treats a missing market cap as zero", () => {
    const out = since([obs(0, 100_000), obs(30, null), obs(60, 95_000)], 0, 100_000);
    expect(out.maxAdverseChangePct).toBeCloseTo(-5, 6);
    expect(out.minMarketCap).toBe(95_000);
  });

  it("is null without a usable baseline", () => {
    expect(since([obs(0, 100_000)], 0, null).maxAdverseChangePct).toBeNull();
    expect(emptyOutcome().maxAdverseChangePct).toBeNull();
    expect(emptyOutcome().maxPeakToTroughDrawdownPct).toBeNull();
  });
});

describe("max peak-to-trough drawdown since call", () => {
  it("computes -40% for call 100 → peak 300 → trough 180", () => {
    const out = since([obs(0, 100_000), obs(30, 300_000), obs(60, 180_000)], 0, 100_000);
    expect(out.maxPeakToTroughDrawdownPct).toBeCloseTo(-40, 6);
    expect(out.drawdownPeakMarketCap).toBe(300_000);
    expect(out.drawdownPeakAt).toBe(iso(30));
    expect(out.drawdownTroughMarketCap).toBe(180_000);
    expect(out.drawdownTroughAt).toBe(iso(60));
  });

  it("requires the peak to precede the trough", () => {
    const out = since([obs(0, 100_000), obs(30, 180_000), obs(60, 300_000)], 0, 100_000);
    // The 180K low happened before the 300K peak, so it cannot pair with it:
    // the only decline available is the flat baseline observation.
    expect(out.maxPeakToTroughDrawdownPct).toBeCloseTo(0, 6);
    expect(out.drawdownTroughMarketCap).toBe(100_000);
  });

  it("differs from max adverse: gains given back, still above the call", () => {
    const out = since([obs(0, 100_000), obs(30, 300_000), obs(60, 180_000)], 0, 100_000);
    // Never below the call itself, yet 40% of the post-call run was given back.
    expect(out.maxAdverseChangePct).toBeCloseTo(0, 6);
    expect(out.maxPeakToTroughDrawdownPct).toBeCloseTo(-40, 6);
  });
});

describe("observation sourcing", () => {
  it("lets a manual refresh snapshot update both metrics without touching First Call", () => {
    const appearances = [appearance(0, true, 100_000), appearance(30, true, 120_000)];
    const { firstCall } = deriveMilestones(appearances);
    expect(firstCall?.at).toBe(iso(0));

    const before = buildObservationSeries(appearances, []);
    const after = buildObservationSeries(appearances, [
      { capturedAt: iso(90), marketCap: 60_000, priceUsd: 0.6 },
    ]);

    expect(since(before, 0, 100_000).maxAdverseChangePct).toBeCloseTo(0, 6);
    const refreshed = since(after, 0, 100_000);
    expect(refreshed.maxAdverseChangePct).toBeCloseTo(-40, 6);
    expect(refreshed.maxPeakToTroughDrawdownPct).toBeCloseTo(-50, 6);
    // First Call baseline is derived only from scan appearances and is frozen.
    expect(deriveMilestones(appearances).firstCall?.marketCap).toBe(100_000);
  });

  it("cannot use pre-call history even when it is the series low", () => {
    const series = buildObservationSeries(
      [appearance(-120, false, 20_000), appearance(0, true, 100_000)],
      [{ capturedAt: iso(60), marketCap: 95_000, priceUsd: 0.95 }],
    );
    const out = since(series, 0, 100_000);
    expect(out.minMarketCap).toBe(95_000);
    expect(out.maxAdverseChangePct).toBeCloseTo(-5, 6);
  });
});
