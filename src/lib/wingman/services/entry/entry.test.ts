/**
 * Entry State v1 — semantic guarantees.
 *
 * These tests protect the layer's meaning: timing is separate from thesis,
 * the score alone never decides the state, missing evidence is UNKNOWN rather
 * than negative, and a historical evaluation can never see a future candle.
 */
import { describe, expect, it } from "vitest";
import {
  ENTRY_COMPONENTS,
  ENTRY_MAX_SCORE,
  assessEntryEligibility,
  classifyDivergence,
  clampComponents,
  mapEntryState,
  totalEntryScore,
} from "./contracts";
import { computeTimingFeatures, cutSeries, type EntryCandle } from "./features";
import { scoreEntry, type EntryContext } from "./scoring";

function candles(closes: number[], startUnix = 1_700_000_000, step = 300, volume = 5_000): EntryCandle[] {
  return closes.map((close, i) => ({
    unixTime: startUnix + i * step,
    interval: "5m",
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volumeUsd: volume,
  }));
}

const baseContext: EntryContext = {
  liquidityUsd: 80_000,
  marketCap: 900_000,
  volume1h: 40_000,
  volume24h: 400_000,
  priceChange1h: 4,
  priceChange6h: 12,
  priceChange24h: 30,
  participationStatus: "BROAD",
  breadth: "BROAD",
  damageStatus: "PASS",
  setups: ["BASE"],
  researchAgeHours: 6,
};

const constructive = [
  10, 10.2, 10.1, 12, 14, 16, 15.2, 14.6, 14.9, 14.7, 15, 14.9, 15.1, 15, 15.05, 15.1, 15.05, 15.1,
];
const parabolic = [10, 10.1, 10.2, 10.3, 10.4, 10.6, 11, 12, 14, 17, 21, 26, 32, 40, 50, 62, 75, 90];
const brokenSeries = [50, 46, 42, 44, 38, 36, 39, 33, 30, 32, 27, 24, 26, 21, 19, 20, 16, 14];

describe("component maxima", () => {
  it("respects the 3/3/2/2 policy maxima", () => {
    const clamped = clampComponents({ structure: 9, extension: 9, volumeFlow: 9, riskDefinition: 9 });
    expect(clamped).toEqual({ structure: 3, extension: 3, volumeFlow: 2, riskDefinition: 2 });
    expect(totalEntryScore(clamped)).toBe(ENTRY_MAX_SCORE);
    expect(ENTRY_MAX_SCORE).toBe(10);
    expect(ENTRY_COMPONENTS.map((c) => c.max)).toEqual([3, 3, 2, 2]);
  });

  it("never emits a negative component", () => {
    expect(clampComponents({ structure: -4, extension: -1 }).structure).toBe(0);
  });
});

describe("hindsight safeguards", () => {
  it("cuts every candle after the evaluation timestamp", () => {
    const series = candles([1, 2, 3, 4, 5]);
    const evalUnix = series[2]!.unixTime;
    const cut = cutSeries(series, evalUnix);
    expect(cut).toHaveLength(3);
    expect(cut.every((c) => c.unixTime <= evalUnix)).toBe(true);
  });

  it("produces identical features whether or not future candles exist", () => {
    const past = candles(constructive);
    const evalUnix = past[past.length - 1]!.unixTime;
    const withFuture = [...past, ...candles([99, 120, 150], evalUnix + 300)];
    expect(computeTimingFeatures(withFuture, evalUnix)).toEqual(
      computeTimingFeatures(past, evalUnix),
    );
  });
});

describe("missing evidence", () => {
  it("returns UNKNOWN when current market evidence is unusable", () => {
    const mapped = mapEntryState({
      components: { structure: 3, extension: 3, volumeFlow: 2, riskDefinition: 2 },
      total: 10,
      structureVerdict: "CONSTRUCTIVE",
      extensionVerdict: "RESET",
      confirmations: 4,
      divergence: "POSITIVE",
      evidenceUsable: false,
      damageFail: false,
      hasStructuralHistory: true,
    });
    expect(mapped.state).toBe("UNKNOWN");
  });

  it("returns UNKNOWN, not a negative state, without price history", () => {
    expect(computeTimingFeatures(candles([1, 2, 3]), 1_700_100_000)).toBeNull();
    const mapped = mapEntryState({
      components: { structure: 0, extension: 0, volumeFlow: 0, riskDefinition: 0 },
      total: 0,
      structureVerdict: "UNKNOWN",
      extensionVerdict: "UNKNOWN",
      confirmations: 0,
      divergence: "UNKNOWN",
      evidenceUsable: true,
      damageFail: false,
      hasStructuralHistory: false,
    });
    expect(mapped.state).toBe("UNKNOWN");
  });

  it("treats a stale or invalid observation as unusable evidence", () => {
    expect(
      assessEntryEligibility({
        researchEligibleNow: true,
        universe: "IN_SCOPE",
        structural: "PASS",
        marketDamage: "PASS",
        marketObservationValid: true,
        marketEvidenceAgeMinutes: 400,
      }).evidenceUsable,
    ).toBe(false);
    expect(
      assessEntryEligibility({
        researchEligibleNow: true,
        universe: "IN_SCOPE",
        structural: "PASS",
        marketDamage: "UNKNOWN",
        marketObservationValid: true,
        marketEvidenceAgeMinutes: 5,
      }).actionable,
    ).toBe(true);
  });
});

describe("state mapping", () => {
  it("blocks actionable entry on confirmed catastrophic damage", () => {
    const mapped = mapEntryState({
      components: { structure: 3, extension: 3, volumeFlow: 2, riskDefinition: 2 },
      total: 10,
      structureVerdict: "CONSTRUCTIVE",
      extensionVerdict: "RESET",
      confirmations: 5,
      divergence: "POSITIVE",
      evidenceUsable: true,
      damageFail: true,
      hasStructuralHistory: true,
    });
    expect(mapped.state).toBe("BROKEN");
  });

  it("does not make a DAMAGED/CONCERN read automatically BROKEN", () => {
    const mapped = mapEntryState({
      components: { structure: 1.5, extension: 2, volumeFlow: 1, riskDefinition: 1 },
      total: 5.5,
      structureVerdict: "NEUTRAL",
      extensionVerdict: "MODERATE",
      confirmations: 1,
      divergence: "NEUTRAL",
      evidenceUsable: true,
      damageFail: false,
      hasStructuralHistory: true,
    });
    expect(mapped.state).toBe("ACCEPTABLE");
  });

  it("does not let the score alone force BUY_ZONE", () => {
    const highScoreNoConfirmation = mapEntryState({
      components: { structure: 2, extension: 2.5, volumeFlow: 1.5, riskDefinition: 1.2 },
      total: 7.7,
      structureVerdict: "CONSTRUCTIVE",
      extensionVerdict: "RESET",
      confirmations: 1,
      divergence: "NEUTRAL",
      evidenceUsable: true,
      damageFail: false,
      hasStructuralHistory: true,
    });
    expect(highScoreNoConfirmation.state).not.toBe("BUY_ZONE");
    expect(highScoreNoConfirmation.state).toBe("ACCEPTABLE");
  });
});

describe("scoring", () => {
  it("scores a constructive consolidation above a parabolic extension", () => {
    const evalUnix = 1_700_000_000 + 17 * 300;
    const good = scoreEntry({
      features: computeTimingFeatures(candles(constructive), evalUnix)!,
      context: baseContext,
      divergence: "POSITIVE",
    });
    const chase = scoreEntry({
      features: computeTimingFeatures(candles(parabolic), evalUnix)!,
      context: { ...baseContext, priceChange1h: 80 },
      divergence: "NEGATIVE",
    });
    expect(good.total).toBeGreaterThan(chase.total);
    expect(chase.extensionVerdict).toBe("PARABOLIC");
    expect(good.components.extension).toBeGreaterThan(chase.components.extension);
  });

  it("reads a waterfall series as broken structure", () => {
    const evalUnix = 1_700_000_000 + 17 * 300;
    const result = scoreEntry({
      features: computeTimingFeatures(candles(brokenSeries), evalUnix)!,
      context: baseContext,
      divergence: "NEUTRAL",
    });
    expect(["BROKEN", "DETERIORATING"]).toContain(result.structureVerdict);
  });

  it("keeps every component inside its maximum for any input", () => {
    const evalUnix = 1_700_000_000 + 17 * 300;
    for (const series of [constructive, parabolic, brokenSeries]) {
      const r = scoreEntry({
        features: computeTimingFeatures(candles(series), evalUnix)!,
        context: baseContext,
        divergence: "POSITIVE",
      });
      expect(r.components.structure).toBeLessThanOrEqual(3);
      expect(r.components.extension).toBeLessThanOrEqual(3);
      expect(r.components.volumeFlow).toBeLessThanOrEqual(2);
      expect(r.components.riskDefinition).toBeLessThanOrEqual(2);
      expect(r.total).toBeLessThanOrEqual(10);
    }
  });

  it("is reproducible for identical inputs", () => {
    const evalUnix = 1_700_000_000 + 17 * 300;
    const args = {
      features: computeTimingFeatures(candles(constructive), evalUnix)!,
      context: baseContext,
      divergence: "POSITIVE" as const,
    };
    expect(scoreEntry(args)).toEqual(scoreEntry(args));
  });
});

describe("thesis / entry separation", () => {
  it("evaluates timing without reading a thesis score, so any thesis can be EXTENDED", () => {
    const evalUnix = 1_700_000_000 + 17 * 300;
    const features = computeTimingFeatures(candles(parabolic), evalUnix)!;
    const score = scoreEntry({
      features,
      context: { ...baseContext, priceChange1h: 90 },
      divergence: "NEGATIVE",
    });
    const state = mapEntryState({
      components: score.components,
      total: score.total,
      structureVerdict: score.structureVerdict,
      extensionVerdict: score.extensionVerdict,
      confirmations: score.confirmations,
      divergence: "NEGATIVE",
      evidenceUsable: true,
      damageFail: false,
      hasStructuralHistory: true,
    }).state;
    // A thesis of 95 or 15 produces the identical timing verdict: the scoring
    // surface has no thesis input at all.
    expect(state).toBe("EXTENDED");
    expect(Object.keys(score.components)).toEqual([
      "structure",
      "extension",
      "volumeFlow",
      "riskDefinition",
    ]);
  });

  it("lets a qualifying thesis sit in WATCH when there is no trigger", () => {
    const mapped = mapEntryState({
      components: { structure: 1, extension: 1.75, volumeFlow: 0.5, riskDefinition: 0.5 },
      total: 3.75,
      structureVerdict: "NEUTRAL",
      extensionVerdict: "MODERATE",
      confirmations: 0,
      divergence: "NEUTRAL",
      evidenceUsable: true,
      damageFail: false,
      hasStructuralHistory: true,
    });
    expect(mapped.state).toBe("WATCH");
  });
});

describe("price-attention divergence", () => {
  it("is POSITIVE when activity outgrows price", () => {
    expect(
      classifyDivergence({
        tradeGrowthRatio: 2,
        volumeGrowthRatio: 1.8,
        priceChangePct: 5,
        breadth: "BROAD",
      }).state,
    ).toBe("POSITIVE");
  });

  it("is NEGATIVE when price accelerates without broadening participation", () => {
    expect(
      classifyDivergence({
        tradeGrowthRatio: 0.8,
        volumeGrowthRatio: 0.9,
        priceChangePct: 70,
        breadth: "NARROW",
      }).state,
    ).toBe("NEGATIVE");
  });

  it("is UNKNOWN — never negative — when inputs are missing", () => {
    expect(
      classifyDivergence({
        tradeGrowthRatio: null,
        volumeGrowthRatio: null,
        priceChangePct: 20,
        breadth: null,
      }).state,
    ).toBe("UNKNOWN");
  });
});

describe("no execution surface", () => {
  it("exposes no sizing, stop-loss or order concepts", () => {
    const evalUnix = 1_700_000_000 + 17 * 300;
    const result = scoreEntry({
      features: computeTimingFeatures(candles(constructive), evalUnix)!,
      context: baseContext,
      divergence: "POSITIVE",
    });
    const text = JSON.stringify(result).toLowerCase();
    for (const banned of ["position size", "stop loss", "stop-loss", "buy order", "sell order", "swap"]) {
      expect(text).not.toContain(banned);
    }
  });
});
