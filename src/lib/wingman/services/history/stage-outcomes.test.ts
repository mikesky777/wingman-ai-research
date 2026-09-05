import { describe, expect, it } from "vitest";
import { deriveStageOutcome } from "./stage-outcomes";
import { stageSupportsPeakMetrics } from "./milestones";

const snap = (capturedAt: string, marketCap: number, liquidityUsd = 50_000) => ({
  capturedAt,
  priceUsd: marketCap / 1_000_000,
  marketCap,
  liquidityUsd,
});

describe("stage outcomes", () => {
  it("measures since / peak / max drawdown from the frozen baseline", () => {
    const out = deriveStageOutcome(
      { enteredAt: "2026-01-01T00:00:00Z", marketCapAtEntry: 100_000, priceAtEntry: 0.1 },
      {
        candidates: [],
        snapshots: [
          snap("2025-12-31T23:00:00Z", 500_000), // before entry — ignored
          snap("2026-01-01T01:00:00Z", 200_000),
          snap("2026-01-01T02:00:00Z", 80_000),
        ],
      },
      "2026-01-01T03:00:00Z",
    );
    expect(out.sincePct).toBeCloseTo(-20, 5);
    expect(out.peakPct).toBeCloseTo(100, 5);
    expect(out.maxAdversePct).toBeCloseTo(-20, 5);
    expect(out.drawdownPct).toBeCloseTo(-60, 5);
  });

  it("never lets a drained-pool observation move metrics", () => {
    const out = deriveStageOutcome(
      { enteredAt: "2026-01-01T00:00:00Z", marketCapAtEntry: 100_000, priceAtEntry: 0.1 },
      { candidates: [], snapshots: [snap("2026-01-01T01:00:00Z", 900_000, 10)] },
      "2026-01-01T02:00:00Z",
    );
    expect(out.sincePct).toBeNull();
    expect(out.peakPct).toBeNull();
  });

  it("returns nulls, never zeros, without a baseline or observations", () => {
    const out = deriveStageOutcome(
      { enteredAt: null, marketCapAtEntry: null, priceAtEntry: null },
      { candidates: [], snapshots: [] },
    );
    expect(out.sincePct).toBeNull();
    expect(out.peakPct).toBeNull();
    expect(out.maxAdversePct).toBeNull();
  });

  it("keeps true max drawdown non-positive while worst-vs-entry may be positive", () => {
    const out = deriveStageOutcome(
      { enteredAt: "2026-01-01T00:00:00Z", marketCapAtEntry: 100_000, priceAtEntry: 0.1 },
      {
        candidates: [],
        snapshots: [snap("2026-01-01T01:00:00Z", 300_000), snap("2026-01-01T02:00:00Z", 180_000)],
      },
      "2026-01-01T03:00:00Z",
    );
    // Lowest post-entry level is still above entry: worst-vs-entry is positive.
    expect(out.maxAdversePct).toBeCloseTo(80, 5);
    // True peak-to-trough drawdown must never be positive.
    expect(out.drawdownPct).toBeLessThanOrEqual(0);
    expect(out.drawdownPct).toBeCloseTo(-40, 5);
  });

  it("supports peak metrics only for stages with a frozen baseline", () => {
    expect(stageSupportsPeakMetrics("SURVIVOR")).toBe(true);
    expect(stageSupportsPeakMetrics("AI_SHORTLIST")).toBe(true);
    expect(stageSupportsPeakMetrics("THESIS_CALL")).toBe(true);
    expect(stageSupportsPeakMetrics("SETUP_QUALIFIED")).toBe(true);
  });
});
