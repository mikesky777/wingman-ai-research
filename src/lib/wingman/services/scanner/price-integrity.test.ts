import { describe, expect, it } from "vitest";
import {
  PRICE_INTEGRITY_SHADOW_MODE,
  assessCoverage,
  deriveFeatures,
  evaluatePriceIntegrity,
  type PricePoint,
} from "./price-integrity";
import { selectSurvivorsWithReservations } from "./evaluate";
import { computePriority } from "./priority";

const LAUNCH = "2026-09-01T00:00:00.000Z";

function point(minutesAfterLaunch: number, marketCap: number, liquidityUsd: number | null = null): PricePoint {
  return {
    capturedAt: new Date(new Date(LAUNCH).getTime() + minutesAfterLaunch * 60000).toISOString(),
    marketCap,
    priceUsd: null,
    liquidityUsd,
  };
}

/** Launch impulse observed, deep but orderly retracement, then repair. */
function constructiveSeries(): PricePoint[] {
  return [
    point(5, 100_000, 40_000),
    point(120, 400_000, 90_000),
    point(360, 260_000, 80_000),
    point(720, 150_000, 70_000),
    point(1440, 120_000, 65_000),
    point(2160, 140_000, 66_000),
    point(2880, 190_000, 70_000),
    point(3600, 210_000, 72_000),
  ];
}

/** Concentrated spike within the first hour, surrendered immediately, flat after. */
function catastrophicSeries(): PricePoint[] {
  return [
    point(5, 90_000, 60_000),
    point(35, 3_000_000, 300_000),
    point(80, 700_000, 90_000),
    point(140, 200_000, 40_000),
    point(400, 130_000, 30_000),
    point(900, 120_000, 28_000),
    point(1600, 118_000, 27_000),
    point(2400, 121_000, 26_000),
  ];
}

describe("price integrity v1", () => {
  it("stays shadow mode", () => {
    expect(PRICE_INTEGRITY_SHADOW_MODE).toBe(true);
  });

  it("never returns DAMAGED from deep drawdown alone", () => {
    // 96% below peak, but the peak was slow to form and structure repaired.
    const points = constructiveSeries().concat(point(4300, 16_000, 60_000));
    const result = evaluatePriceIntegrity({ points, launchAt: LAUNCH });
    expect(result.features.drawdownFromPeak).toBeGreaterThan(0.9);
    expect(result.status).not.toBe("DAMAGED");
  });

  it("returns UNKNOWN when history is insufficient", () => {
    const result = evaluatePriceIntegrity({
      points: [point(5, 100_000), point(60, 90_000)],
      launchAt: LAUNCH,
    });
    expect(result.status).toBe("UNKNOWN");
    expect(result.coverage.sufficientForClassification).toBe(false);
  });

  it("returns UNKNOWN when the launch impulse was never observed", () => {
    const points = constructiveSeries().map((p, i) => point(2000 + i * 200, p.marketCap!, p.liquidityUsd));
    const result = evaluatePriceIntegrity({ points, launchAt: LAUNCH });
    expect(result.coverage.launchImpulseObserved).toBe(false);
    expect(result.status).toBe("UNKNOWN");
  });

  it("never treats missing observations as zero", () => {
    const points: PricePoint[] = [
      { capturedAt: new Date(LAUNCH).toISOString(), marketCap: null, priceUsd: null, liquidityUsd: null },
      point(30, 100_000),
    ];
    const features = deriveFeatures({ points, launchAt: LAUNCH });
    expect(features.earliestValue).toBe(100_000);
    expect(features.liquidityRetention).toBeNull();
    expect(assessCoverage({ points, launchAt: LAUNCH }).usableObservations).toBe(1);
  });

  it("represents rapid peak + severe collapse independently of drawdown", () => {
    const features = deriveFeatures({ points: catastrophicSeries(), launchAt: LAUNCH });
    expect(features.minutesFirstObservationToPeak).toBeLessThanOrEqual(60);
    expect(features.minutesPeakToMajorDrawdown).not.toBeNull();
    expect(features.minutesPeakToMajorDrawdown!).toBeLessThanOrEqual(120);
    expect(features.subsequentHighImprovement).not.toBeNull();
  });

  it("distinguishes constructive cooldown from catastrophic collapse", () => {
    const good = evaluatePriceIntegrity({ points: constructiveSeries(), launchAt: LAUNCH });
    const bad = evaluatePriceIntegrity({ points: catastrophicSeries(), launchAt: LAUNCH });
    expect(good.status).toBe("HEALTHY");
    expect(bad.status).toBe("DAMAGED");
    expect(bad.signals).toContain("CONCENTRATED_EARLY_PEAK");
    expect(bad.signals).toContain("RAPID_SURRENDER");
  });

  it("keeps a historical crash descriptive for REACCEL", () => {
    const bad = evaluatePriceIntegrity({
      points: catastrophicSeries(),
      launchAt: LAUNCH,
      setups: ["REACCEL"],
    });
    expect(bad.reasons.join(" ")).toContain("never invalidates");
  });

  it("cannot be read by priority or survivor selection", async () => {
    const priority = await import("./priority");
    const evaluate = await import("./evaluate");
    const source = [computePriority, selectSurvivorsWithReservations].map((f) => f.toString()).join("\n");
    expect(source).not.toContain("priceIntegrity");
    expect(Object.keys(priority).join(" ")).not.toContain("PriceIntegrity");
    expect(Object.keys(evaluate).join(" ")).not.toContain("PriceIntegrity");
  });
});
