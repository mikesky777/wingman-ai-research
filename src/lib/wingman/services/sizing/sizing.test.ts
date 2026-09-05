/**
 * sizing/v1 unit + calibration fixtures.
 * CALIBRATION — NO PRODUCTION EFFECT: nothing here touches the database.
 */
import { describe, expect, it } from "vitest";
import {
  bandForScore,
  computeSizing,
  interpolateWithinBand,
  type SizingInput,
} from "./contracts";

const base: SizingInput = {
  mint: "So11111111111111111111111111111111111111112",
  thesisCallId: "call-fixture",
  thesisScore: 84,
  evidenceConfidence: 82,
  structuralStatus: "PASS",
  operationalStatus: "OPERATIONAL",
  entryState: "BUY_ZONE",
  priceHistorySource: "CANDLES",
  timingResolution: "HIGH",
  isCalibration: true,
  calculatedAt: "2026-01-01T00:00:00.000Z",
};

const size = (over: Partial<SizingInput> = {}) => computeSizing({ ...base, ...over });

describe("conviction bands + interpolation", () => {
  it("maps band boundaries deterministically", () => {
    expect(bandForScore(69).id).toBe("B60_69");
    expect(bandForScore(70).id).toBe("B70_79");
    expect(bandForScore(79).id).toBe("B70_79");
    expect(bandForScore(80).id).toBe("B80_89");
    expect(bandForScore(89).id).toBe("B80_89");
    expect(bandForScore(90).id).toBe("B90_100");
    expect(bandForScore(49).id).toBe("PASS");
  });

  it("puts 70 at the band floor and 79 at the band ceiling", () => {
    expect(interpolateWithinBand(70, bandForScore(70))).toBe(7);
    expect(interpolateWithinBand(79, bandForScore(79))).toBe(10);
    expect(interpolateWithinBand(84, bandForScore(84))).toBe(12.22);
  });

  it("boundary 69/70, 79/80, 89/90 produce distinct raw maxima", () => {
    expect(size({ thesisScore: 69 }).rawInterpolatedMaxPct).toBe(7);
    expect(size({ thesisScore: 70 }).rawInterpolatedMaxPct).toBe(7);
    expect(size({ thesisScore: 79 }).rawInterpolatedMaxPct).toBe(10);
    expect(size({ thesisScore: 80 }).rawInterpolatedMaxPct).toBe(10);
    expect(size({ thesisScore: 89 }).rawInterpolatedMaxPct).toBe(15);
    expect(size({ thesisScore: 90 }).rawInterpolatedMaxPct).toBe(15);
    expect(size({ thesisScore: 49 }).rawInterpolatedMaxPct).toBe(0);
    expect(size({ thesisScore: 49 }).reasonCodes).toContain("BELOW_THESIS_CONVICTION_FLOOR");
  });
});

describe("calibration fixtures", () => {
  it("1. strong thesis + BUY_ZONE deploys 65% of effective max", () => {
    const r = size();
    expect(r.effectiveMaxAllocationPct).toBe(12.22);
    expect(r.deploymentFraction).toBe(0.65);
    expect(r.deployNowPct).toBe(7.94);
    expect(r.reservePct).toBe(4.28);
  });

  it("2. strong thesis + EXTENDED keeps max, deploys nothing", () => {
    const r = size({ entryState: "EXTENDED" });
    expect(r.effectiveMaxAllocationPct).toBe(12.22);
    expect(r.deployNowPct).toBe(0);
    expect(r.reservePct).toBe(12.22);
    expect(r.reasonCodes).toContain("GOOD_THESIS_BAD_ENTRY");
  });

  it("3. strong thesis + UNKNOWN never guesses neutral timing", () => {
    const r = size({ entryState: "UNKNOWN", priceHistorySource: "NONE", timingResolution: "INSUFFICIENT" });
    expect(r.deployNowPct).toBe(0);
    expect(r.reasonCodes).toContain("INSUFFICIENT_TIMING_EVIDENCE");
  });

  it("4. strong thesis + BROKEN deploys nothing", () => {
    const r = size({ entryState: "BROKEN" });
    expect(r.deployNowPct).toBe(0);
    expect(r.reasonCodes).toContain("ENTRY_BROKEN");
  });

  it("5. structural CONCERN applies 0.75x after interpolation", () => {
    const r = size({ thesisScore: 76, structuralStatus: "CONCERN" });
    expect(r.rawInterpolatedMaxPct).toBe(9);
    expect(r.structuralModifier).toBe(0.75);
    expect(r.effectiveMaxAllocationPct).toBe(6.75);
    expect(r.deployNowPct).toBe(4.39);
  });

  it("6. current operational FAIL yields zero exposure but keeps the call", () => {
    const r = size({ operationalStatus: "BLOCKED" });
    expect(r.effectiveMaxAllocationPct).toBe(0);
    expect(r.deployNowPct).toBe(0);
    expect(r.thesisCallId).toBe("call-fixture");
    expect(r.reasonCodes).toContain("CURRENTLY_BLOCKED");
  });

  it("7. BUY_ZONE without CANDLES/HIGH is safely rejected", () => {
    const r = size({ priceHistorySource: "WINGMAN_OBSERVATIONS", timingResolution: "COARSE" });
    expect(r.deployNowPct).toBe(0);
    expect(r.reasonCodes).toContain("INVALID_BUY_ZONE_PROVENANCE");
    expect(r.effectiveMaxAllocationPct).toBe(12.22);
  });

  it("SETTING_UP is starter-only at 25%", () => {
    const r = size({ entryState: "SETTING_UP", priceHistorySource: "WINGMAN_OBSERVATIONS", timingResolution: "COARSE" });
    expect(r.deploymentLabel).toBe("STARTER_ONLY");
    expect(r.deployNowPct).toBe(3.06);
  });

  it("WATCH deploys nothing", () => {
    expect(size({ entryState: "WATCH" }).deployNowPct).toBe(0);
  });

  it("missing structural evidence is not treated as clean", () => {
    expect(size({ structuralStatus: null }).structuralModifier).toBe(0.5);
    expect(size({ structuralStatus: null }).reasonCodes).toContain("STRUCTURAL_EVIDENCE_MISSING");
  });

  it("evidence confidence only ever caps, never boosts", () => {
    expect(size({ evidenceConfidence: 100 }).effectiveMaxAllocationPct).toBe(12.22);
    expect(size({ evidenceConfidence: 50 }).evidenceCapMultiplier).toBe(0.75);
    expect(size({ evidenceConfidence: 20 }).evidenceCapMultiplier).toBe(0.5);
  });

  it("is deterministically repeatable", () => {
    const a = size();
    const b = size();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
