import { describe, expect, it } from "vitest";
import {
  HORIZONS,
  buildObservationSeries,
  changePct,
  deriveMilestones,
  deriveOutcome,
  type CandidateAppearance,
} from "./outcomes";

const iso = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + minutes * 60000).toISOString();

function appearance(
  minutes: number,
  survivor: boolean,
  marketCap: number | null,
  priceUsd: number | null = 1,
): CandidateAppearance {
  return {
    scanRunId: `run-${minutes}`,
    completedAt: iso(minutes),
    priceUsd,
    marketCap,
    survivor,
  };
}

describe("milestones", () => {
  it("establishes First Seen from the earliest completed scan, whatever the selection", () => {
    const { firstSeen, firstCall } = deriveMilestones([
      appearance(60, false, 200_000),
      appearance(0, false, 100_000),
    ]);
    expect(firstSeen?.at).toBe(iso(0));
    expect(firstSeen?.marketCap).toBe(100_000);
    expect(firstCall).toBeNull();
  });

  it("never establishes First Call from discovery, ranking or near-miss appearances", () => {
    const { firstCall } = deriveMilestones([
      appearance(0, false, 100_000),
      appearance(30, false, 120_000),
      appearance(60, false, 90_000),
    ]);
    expect(firstCall).toBeNull();
  });

  it("establishes First Call at the first survivor selection and never resets it", () => {
    const history = [
      appearance(0, false, 100_000),
      appearance(60, true, 150_000),
      appearance(120, true, 400_000),
      appearance(180, true, 900_000),
    ];
    const first = deriveMilestones(history);
    expect(first.firstSeen?.at).toBe(iso(0));
    expect(first.firstCall?.at).toBe(iso(60));
    expect(first.firstCall?.marketCap).toBe(150_000);

    // Repeated survivor appearances (and a later scan) leave both identical.
    const later = deriveMilestones([...history, appearance(240, true, 2_000_000)]);
    expect(later.firstSeen).toEqual(first.firstSeen);
    expect(later.firstCall).toEqual(first.firstCall);
  });
});

describe("observation series", () => {
  it("merges both sources, dedupes the same bucket and prefers snapshots", () => {
    const series = buildObservationSeries(
      [appearance(0, false, 100_000), appearance(60, true, 150_000)],
      [
        { capturedAt: iso(60), priceUsd: 2, marketCap: 155_000 },
        { capturedAt: iso(90), priceUsd: 3, marketCap: 300_000 },
      ],
    );
    expect(series.map((o) => o.at)).toEqual([iso(0), iso(60), iso(90)]);
    expect(series[1]!.source).toBe("token_snapshot");
    expect(series[1]!.marketCap).toBe(155_000);
  });

  it("keeps candidate-only history for tokens that were never enriched", () => {
    const series = buildObservationSeries([appearance(0, false, 50_000), appearance(30, false, 40_000)], []);
    expect(series).toHaveLength(2);
    expect(series.every((o) => o.source === "scan_candidate")).toBe(true);
  });
});

describe("outcome metrics", () => {
  const series = buildObservationSeries(
    [
      appearance(0, false, 100_000, 0.001),
      appearance(60, true, 150_000, 0.0015),
      appearance(120, false, 400_000, 0.004),
      appearance(180, false, 120_000, 0.0012),
    ],
    [],
  );

  it("computes price and market-cap change from the baseline", () => {
    const seen = deriveOutcome({
      baselineAt: iso(0),
      baselinePriceUsd: 0.001,
      baselineMarketCap: 100_000,
      series,
      nowIso: iso(200),
    });
    expect(seen.marketCapChangePct).toBeCloseTo(20);
    expect(seen.priceChangePct).toBeCloseTo(20);
    expect(seen.maxGainPct).toBeCloseTo(300);
    expect(seen.maxAdverseChangePct).toBeCloseTo(0);
    expect(seen.maxPeakToTroughDrawdownPct).toBeCloseTo(-70);
    expect(seen.elapsedMinutes).toBe(200);
  });

  it("uses only observations at or after the relevant baseline", () => {
    const call = deriveOutcome({
      baselineAt: iso(120),
      baselinePriceUsd: 0.004,
      baselineMarketCap: 400_000,
      series,
      nowIso: iso(200),
    });
    expect(call.observationCount).toBe(2);
    expect(call.maxMarketCap).toBe(400_000);
    expect(call.minMarketCap).toBe(120_000);
    expect(call.maxGainPct).toBeCloseTo(0);
    expect(call.maxAdverseChangePct).toBeCloseTo(-70);
  });

  it("keeps missing values null and never coerces them to zero", () => {
    const nullish = deriveOutcome({
      baselineAt: iso(0),
      baselinePriceUsd: null,
      baselineMarketCap: null,
      series: buildObservationSeries([appearance(0, false, null, null)], []),
      nowIso: iso(10),
    });
    expect(nullish.currentMarketCap).toBeNull();
    expect(nullish.marketCapChangePct).toBeNull();
    expect(nullish.maxGainPct).toBeNull();
    expect(nullish.maxPeakToTroughDrawdownPct).toBeNull();
    expect(changePct(0, 5)).toBeNull();
    expect(changePct(null, 5)).toBeNull();
  });
});

describe("horizons", () => {
  it("uses the nearest stored observation inside tolerance and never interpolates", () => {
    const series = buildObservationSeries(
      [appearance(0, false, 100_000), appearance(55, false, 180_000), appearance(400, false, 500_000)],
      [],
    );
    const outcome = deriveOutcome({
      baselineAt: iso(0),
      baselinePriceUsd: 1,
      baselineMarketCap: 100_000,
      series,
      nowIso: iso(500),
    });
    expect(outcome.horizons["1h"]?.marketCap).toBe(180_000);
    expect(outcome.horizons["1h"]?.changePct).toBeCloseTo(80);
    expect(outcome.horizons["1h"]?.sourceCapturedAt).toBe(iso(55));
    // 6h target is 360m; the 400m observation is inside the 60m tolerance.
    expect(outcome.horizons["6h"]?.marketCap).toBe(500_000);
    // Nothing near 24h / 3d / 7d / 30d → stays null, never fabricated.
    expect(outcome.horizons["24h"]).toBeNull();
    expect(outcome.horizons["30d"]).toBeNull();
    expect(HORIZONS.map((h) => h.key)).toEqual(["1h", "6h", "24h", "3d", "7d", "30d"]);
  });
});

describe("scanner isolation", () => {
  it("derivation is pure: inputs are never mutated by outcome computation", () => {
    const history = [appearance(0, false, 100_000), appearance(60, true, 150_000)];
    const before = JSON.stringify(history);
    const series = buildObservationSeries(history, []);
    deriveOutcome({
      baselineAt: iso(0),
      baselinePriceUsd: 1,
      baselineMarketCap: 100_000,
      series,
      nowIso: iso(100),
    });
    deriveMilestones(history);
    expect(JSON.stringify(history)).toBe(before);
  });

  it("exposes no scoring, setup or selection surface", () => {
    const outcome = deriveOutcome({
      baselineAt: iso(0),
      baselinePriceUsd: 1,
      baselineMarketCap: 100_000,
      series: buildObservationSeries([appearance(0, true, 100_000)], []),
      nowIso: iso(10),
    });
    const keys = Object.keys(outcome);
    expect(keys.some((k) => /priority|setup|survivor|lane|score/i.test(k))).toBe(false);
  });
});
