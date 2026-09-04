import { describe, expect, it } from "vitest";
import {
  MANUAL_REFRESH_COOLDOWN_SECONDS,
  cooldownElapsed,
  deriveTurnover,
  isPersistableObservation,
} from "./market-refresh";
import { deriveOutcome } from "./outcomes/outcomes";

describe("manual market refresh guards", () => {
  it("rejects empty or zero-filled provider payloads as observations", () => {
    expect(isPersistableObservation({ priceUsd: null, marketCap: null, liquidityUsd: null })).toBe(
      false,
    );
    expect(isPersistableObservation({ priceUsd: 0, marketCap: 0, liquidityUsd: 0 })).toBe(false);
  });

  it("accepts a payload with a real reading", () => {
    expect(
      isPersistableObservation({ priceUsd: 0.0001, marketCap: null, liquidityUsd: null }),
    ).toBe(true);
  });

  it("never treats missing values as zero when deriving turnover", () => {
    expect(deriveTurnover(null, 1000)).toBeNull();
    expect(deriveTurnover(500, null)).toBeNull();
    expect(deriveTurnover(500, 0)).toBeNull();
    expect(deriveTurnover(500, 1000)).toBe(0.5);
  });

  it("enforces a per-token cooldown", () => {
    const now = "2026-01-01T00:00:00.000Z";
    expect(cooldownElapsed(null, now)).toBe(true);
    expect(cooldownElapsed("2025-12-31T23:59:59.000Z", now)).toBe(false);
    const old = new Date(
      Date.parse(now) - (MANUAL_REFRESH_COOLDOWN_SECONDS + 1) * 1000,
    ).toISOString();
    expect(cooldownElapsed(old, now)).toBe(true);
  });
});

describe("peak since call", () => {
  const base = {
    baselineAt: "2026-01-01T00:00:00.000Z",
    baselinePriceUsd: 1,
    baselineMarketCap: 1_000_000,
    nowIso: "2026-01-02T00:00:00.000Z",
  };

  it("uses the highest post-call observation", () => {
    const out = deriveOutcome({
      ...base,
      series: [
        { at: "2026-01-01T01:00:00.000Z", priceUsd: 2, marketCap: 2_000_000 },
        { at: "2026-01-01T02:00:00.000Z", priceUsd: 3.47, marketCap: 3_470_000 },
        { at: "2026-01-01T03:00:00.000Z", priceUsd: 1.18, marketCap: 1_180_000 },
      ],
    });
    expect(out.maxGainPct).toBeCloseTo(247);
    expect(out.maxPriceGainPct).toBeCloseTo(247);
    expect(out.maxMarketCapAt).toBe("2026-01-01T02:00:00.000Z");
    expect(out.marketCapChangePct).toBeCloseTo(18);
  });

  it("raises the peak when a refreshed observation sets a new high", () => {
    const series = [{ at: "2026-01-01T01:00:00.000Z", priceUsd: 2, marketCap: 2_000_000 }];
    const before = deriveOutcome({ ...base, series });
    const after = deriveOutcome({
      ...base,
      series: [...series, { at: "2026-01-01T05:00:00.000Z", priceUsd: 5, marketCap: 5_000_000 }],
    });
    expect(before.maxGainPct).toBeCloseTo(100);
    expect(after.maxGainPct).toBeCloseTo(400);
    expect(after.maxMarketCapAt).toBe("2026-01-01T05:00:00.000Z");
  });

  it("leaves the peak unchanged for a lower refreshed observation", () => {
    const series = [{ at: "2026-01-01T01:00:00.000Z", priceUsd: 4, marketCap: 4_000_000 }];
    const after = deriveOutcome({
      ...base,
      series: [...series, { at: "2026-01-01T06:00:00.000Z", priceUsd: 1, marketCap: 1_000_000 }],
    });
    expect(after.maxGainPct).toBeCloseTo(300);
    expect(after.maxMarketCapAt).toBe("2026-01-01T01:00:00.000Z");
  });

  it("ignores observations before the call baseline", () => {
    const out = deriveOutcome({
      ...base,
      series: [
        { at: "2025-12-31T23:00:00.000Z", priceUsd: 99, marketCap: 99_000_000 },
        { at: "2026-01-01T01:00:00.000Z", priceUsd: 2, marketCap: 2_000_000 },
      ],
    });
    expect(out.maxGainPct).toBeCloseTo(100);
    expect(out.observationCount).toBe(1);
  });

  it("returns null peaks when no usable values exist", () => {
    const out = deriveOutcome({
      ...base,
      baselineMarketCap: null,
      series: [{ at: "2026-01-01T01:00:00.000Z", priceUsd: null, marketCap: null }],
    });
    expect(out.maxGainPct).toBeNull();
    expect(out.maxMarketCap).toBeNull();
    expect(out.maxMarketCapAt).toBeNull();
  });
});
