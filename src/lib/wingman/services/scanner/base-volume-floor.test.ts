/**
 * BASE 24h-volume floor + candle-derived Price / Launch Integrity.
 *
 * Pure tests: no network, no database. The floor is a BASE qualification rule;
 * Price Integrity stays shadow-only and must never change any of it.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateCandidate,
  normalizeStrategySettings,
  WINGMAN_DEFAULT_SETTINGS,
  type DiscoveredToken,
  type DiscoveryHit,
} from "./index";
import {
  candlesToInput,
  evaluateFromCandles,
  type IntegrityCandle,
} from "./price-integrity";

const NOW_ISO = "2026-04-01T12:00:00.000Z";
const NOW = Date.parse(NOW_ISO);
const LAUNCH = new Date(NOW - 48 * 60 * 60_000).toISOString();

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

const HIT: DiscoveryHit = {
  source: "birdeye",
  queryId: "volume_1h_lowcap",
  family: "volume",
  rank: 0,
  laneHints: ["BASE"],
};

/** A post-bond BASE survivor; only 24h volume varies across these cases. */
function buddy(volume24h: number | null): DiscoveredToken {
  return {
    chain: "solana",
    contractAddress: "Buddy22222222222222222222222222222222222222",
    symbol: "BUDDY",
    name: "Buddy",
    imageUrl: null,
    priceUsd: 0.001,
    marketCap: 420_000,
    fdv: 430_000,
    liquidityUsd: 85_000,
    volume5m: 3_000,
    volume1h: 26_000,
    volume6h: 130_000,
    volume24h,
    trades5m: 45,
    trades1h: 420,
    trades6h: 2_300,
    trades24h: 8_600,
    buys24h: 4_400,
    sells24h: 4_200,
    priceChange5m: 0.4,
    priceChange1h: 1.5,
    priceChange6h: 4,
    priceChange24h: 9,
    holderCount: 3_400,
    uniqueWallets24h: 1_900,
    listedAt: minutesAgo(60 * 24 * 3),
    lastTradeAt: minutesAgo(3),
    discovery: [HIT],
  };
}

/** Buddy's real 24h volume; the floor is varied around it. */
const BUDDY_VOLUME_24H = 480_000;

function base(volume24h: number | null, floor = 10_000) {
  const strategy = normalizeStrategySettings({
    ...WINGMAN_DEFAULT_SETTINGS,
    setups: {
      ...WINGMAN_DEFAULT_SETTINGS.setups,
      BASE: { ...WINGMAN_DEFAULT_SETTINGS.setups.BASE, minVolume24hUsd: floor },
    },
  });
  const c = evaluateCandidate(buddy(volume24h), { nowIso: NOW_ISO, strategy });
  return { lanes: c.lanes, rejections: c.laneRejections };
}

describe("BASE 24h volume floor", () => {
  it("uses a $10,000 default floor for BASE only", () => {
    expect(WINGMAN_DEFAULT_SETTINGS.setups.BASE.minVolume24hUsd).toBe(10_000);
    expect(WINGMAN_DEFAULT_SETTINGS.setups.REACCEL.minVolume24hUsd).toBeNull();
    expect(WINGMAN_DEFAULT_SETTINGS.setups.MOMENTUM.minVolume24hUsd).toBeNull();
  });

  it("rejects $9,999 and accepts exactly $10,000", () => {
    // One dollar below the floor is rejected; exactly at the floor qualifies.
    const below = base(BUDDY_VOLUME_24H, BUDDY_VOLUME_24H + 1);
    expect(below.lanes).not.toContain("BASE");
    expect(below.rejections["BASE"]).toContain("BASE_VOLUME_24H_TOO_LOW");

    expect(base(BUDDY_VOLUME_24H, BUDDY_VOLUME_24H).lanes).toContain("BASE");
  });

  it("never treats unavailable volume as zero", () => {
    const missing = base(null, 1_000);
    expect(missing.rejections["BASE"]).toContain("BASE_VOLUME_24H_UNAVAILABLE");
    expect(missing.rejections["BASE"]).not.toContain("TOO_LOW");
  });

  it("leaves REACCEL untouched by the floor", () => {
    expect(base(1_000).rejections["REACCEL"] ?? "").not.toContain("VOLUME_24H");
    expect(base(null).rejections["REACCEL"] ?? "").not.toContain("VOLUME_24H");
  });
});

/** Build a synthetic candle series. */
function candles(
  spec: Array<{ minute: number; close: number; high?: number; low?: number; volumeUsd?: number }>,
  interval = "1m",
): IntegrityCandle[] {
  return spec.map((s) => ({
    interval,
    candleTime: new Date(Date.parse(LAUNCH) + s.minute * 60_000).toISOString(),
    open: s.close,
    high: s.high ?? s.close,
    low: s.low ?? s.close,
    close: s.close,
    volumeUsd: s.volumeUsd ?? null,
  }));
}

describe("candle-derived price integrity", () => {
  it("maps candles without inventing liquidity or market cap", () => {
    const input = candlesToInput(candles([{ minute: 0, close: 1 }]), LAUNCH, ["BASE"]);
    expect(input.points[0]!.liquidityUsd).toBeNull();
    expect(input.points[0]!.marketCap).toBeNull();
    expect(input.resolutions).toEqual(["1m"]);
  });

  it("stays UNKNOWN when launch history is not observed", () => {
    const late = candles([
      { minute: 5_000, close: 1 },
      { minute: 5_060, close: 1.1 },
    ]);
    expect(evaluateFromCandles(late, LAUNCH, ["BASE"]).status).toBe("UNKNOWN");
  });

  it("never calls a deep drawdown alone DAMAGED", () => {
    const drifted = candles(
      Array.from({ length: 40 }, (_, i) => ({
        minute: i * 15,
        close: Math.max(0.05, 1 - i * 0.025),
        volumeUsd: 1_000,
      })),
    );
    expect(evaluateFromCandles(drifted, LAUNCH, ["BASE"]).status).not.toBe("DAMAGED");
  });

  it("measures launch-window volume concentration", () => {
    const series = candles([
      ...Array.from({ length: 12 }, (_, i) => ({ minute: i * 10, close: 1, volumeUsd: 10_000 })),
      ...Array.from({ length: 12 }, (_, i) => ({
        minute: 8 * 60 + i * 10,
        close: 1,
        volumeUsd: 100,
      })),
    ]);
    const result = evaluateFromCandles(series, LAUNCH, ["BASE"]);
    expect(result.features.earlyVolumeShare).toBeGreaterThan(0.9);
    expect(result.signals).toContain("LAUNCH_CONCENTRATED_VOLUME");
  });

  it("uses candle wicks for the peak rather than closes alone", () => {
    const series = candles([
      { minute: 0, close: 1, high: 5 },
      { minute: 30, close: 1 },
      { minute: 60, close: 1 },
      { minute: 90, close: 1 },
      { minute: 120, close: 1 },
    ]);
    const result = evaluateFromCandles(series, LAUNCH, ["BASE"]);
    expect(result.features.peakValue).toBe(5);
    expect(result.features.peakToStabilizedRatio).toBe(5);
  });

  it("remains shadow-only", () => {
    const result = evaluateFromCandles(candles([{ minute: 0, close: 1 }]), LAUNCH, ["BASE"]);
    expect(result.shadowMode).toBe(true);
    expect(result.policyVersion).toBe("price_integrity/v1.1");
  });
});

describe("price integrity v1.1 normalized repair and lifecycle blowoff", () => {
  it("does not treat a single bounce wick off the crash low as repair", () => {
    const spec: Array<{ minute: number; close: number; high?: number; volumeUsd?: number }> = [
      { minute: 0, close: 10, volumeUsd: 900_000 },
      { minute: 5, close: 100, volumeUsd: 900_000 },
      { minute: 30, close: 5, volumeUsd: 20_000 },
      // one-candle spike back to 60% of the peak, immediately surrendered
      { minute: 60, close: 6, high: 60, volumeUsd: 20_000 },
    ];
    for (let m = 90; m <= 2_800; m += 30) spec.push({ minute: m, close: 5, volumeUsd: 400 });
    const result = evaluateFromCandles(candles(spec), LAUNCH, ["BASE"], NOW_ISO);
    // wick is retained for diagnostics, but the sustained reclaim is what counts
    expect(result.features.postCollapseHighToOriginalPeakRatio!).toBeGreaterThan(0.5);
    expect(result.features.peakRepairFraction!).toBeLessThan(0.15);
    expect(result.signals).toContain("WEAK_NORMALIZED_RECLAIM");
    expect(result.status).not.toBe("HEALTHY");
  });

  it("measures fixed launch windows and the age-normalized volume rate", () => {
    const spec = [
      { minute: 0, close: 1, volumeUsd: 400_000 },
      { minute: 45, close: 1, volumeUsd: 100_000 },
      { minute: 120, close: 1, volumeUsd: 10_000 },
    ];
    for (let m = 300; m <= 2_800; m += 60) spec.push({ minute: m, close: 1, volumeUsd: 1_000 });
    const f = evaluateFromCandles(candles(spec), LAUNCH, ["BASE"], NOW_ISO).features;
    expect(f.first30mVolumeShare!).toBeGreaterThan(0);
    expect(f.first1hVolumeShare!).toBeGreaterThan(f.first30mVolumeShare!);
    expect(f.first3hVolumeShare!).toBeGreaterThan(f.first1hVolumeShare!);
    expect(f.launchToLaterVolumeRateRatio!).toBeGreaterThan(6);
  });

  it("can flag a late lifecycle blowoff, not just a launch blowoff", () => {
    const spec: Array<{ minute: number; close: number; volumeUsd?: number }> = [];
    for (let m = 0; m <= 1_400; m += 20) spec.push({ minute: m, close: 10, volumeUsd: 3_000 });
    spec.push({ minute: 1_440, close: 120, volumeUsd: 500_000 });
    spec.push({ minute: 1_470, close: 20, volumeUsd: 60_000 });
    for (let m = 1_500; m <= 4_000; m += 20) spec.push({ minute: m, close: 12, volumeUsd: 500 });
    const result = evaluateFromCandles(candles(spec), LAUNCH, ["BASE"], NOW_ISO);
    expect(result.features.peakToPrePeakBaselineRatio!).toBeGreaterThanOrEqual(5);
    expect(result.signals).toContain("LIFECYCLE_BLOWOFF_COLLAPSE");
  });

  it("never lets historical damage veto a REACCEL candidate", () => {
    const spec: Array<{ minute: number; close: number; volumeUsd?: number }> = [
      { minute: 0, close: 100, volumeUsd: 900_000 },
      { minute: 20, close: 4, volumeUsd: 50_000 },
    ];
    for (let m = 60; m <= 2_800; m += 30) spec.push({ minute: m, close: 4, volumeUsd: 300 });
    const result = evaluateFromCandles(candles(spec), LAUNCH, ["REACCEL"], NOW_ISO);
    expect(result.shadowMode).toBe(true);
    expect(result.reasons.some((r) => r.includes("REACCEL"))).toBe(true);
  });
});
