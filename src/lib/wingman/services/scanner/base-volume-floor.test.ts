/**
 * BASE 24h-volume floor + candle-derived Price / Launch Integrity.
 *
 * Pure tests: no network, no database. The floor is a BASE qualification rule;
 * Price Integrity stays shadow-only and must never change any of it.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateCandidate,
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

function base(volume24h: number | null) {
  const c = evaluateCandidate(buddy(volume24h), { nowIso: NOW_ISO });
  return { lanes: c.lanes, rejections: c.laneRejections };
}

describe("BASE 24h volume floor", () => {
  it("uses a $10,000 default floor for BASE only", () => {
    expect(WINGMAN_DEFAULT_SETTINGS.setups.BASE.minVolume24hUsd).toBe(10_000);
    expect(WINGMAN_DEFAULT_SETTINGS.setups.REACCEL.minVolume24hUsd).toBeNull();
    expect(WINGMAN_DEFAULT_SETTINGS.setups.MOMENTUM.minVolume24hUsd).toBeNull();
  });

  it("rejects $9,999 and accepts exactly $10,000", () => {
    const below = base(9_999);
    expect(below.lanes).not.toContain("BASE");
    expect(below.rejections["BASE"]).toContain("BASE_VOLUME_24H_TOO_LOW");

    expect(base(10_000).lanes).toContain("BASE");
  });

  it("never treats unavailable volume as zero", () => {
    const missing = base(null);
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
    expect(result.policyVersion).toBe("price_integrity/v1");
  });
});
