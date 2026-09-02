/**
 * Calibration tests: MOMENTUM disabled by default + the universal
 * live-market eligibility gate. Pure — no network, no database.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_FLOOR,
  NO_VALID_DEX_MARKET,
  WINGMAN_DEFAULT_SETTINGS,
  assessMarket,
  assignRanks,
  evaluateCandidate,
  normalizeStrategySettings,
  rankCandidates,
  selectSurvivorsWithReservations,
  type DiscoveredToken,
  type DiscoveryHit,
} from "./index";
import { disabledSetups, enabledSetups } from "@/components/wingman/scanner/shared";
import type { DsPair } from "../external/dexscreener/types";

const NOW = "2026-04-01T12:00:00.000Z";
const minutesAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();

const HIT: DiscoveryHit = {
  source: "birdeye",
  queryId: "volume_1h_lowcap",
  family: "volume",
  rank: 0,
  laneHints: ["BASE"],
};

const ADDRESS = "Bud7Yh5vB4nR9c1kQwPzXm2Ttk6aVJ3sNdE8fGhLmQ2p";

function token(overrides: Partial<DiscoveredToken> = {}): DiscoveredToken {
  return {
    chain: "solana",
    contractAddress: ADDRESS,
    symbol: "BUDDY",
    name: "Buddy",
    imageUrl: null,
    priceUsd: 0.00012,
    marketCap: 120_000,
    fdv: 120_000,
    liquidityUsd: 60_000,
    volume5m: 3_000,
    volume1h: 20_000,
    volume6h: 60_000,
    volume24h: 180_000,
    trades5m: 40,
    trades1h: 300,
    trades6h: 900,
    trades24h: 3_000,
    buys24h: 1_600,
    sells24h: 1_400,
    priceChange5m: 1,
    priceChange1h: 4,
    priceChange6h: 9,
    priceChange24h: 20,
    holderCount: 2_000,
    uniqueWallets24h: 1_100,
    listedAt: minutesAgo(60 * 24 * 3),
    lastTradeAt: minutesAgo(2),
    discovery: [HIT],
    ...overrides,
  };
}

const OK_MARKET = { ok: true, pairAddress: "pair1", liquidityUsd: 60_000, reasonDetail: null };

function pair(overrides: Partial<DsPair> = {}): DsPair {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: "pair1",
    baseToken: { address: ADDRESS, symbol: "BUDDY" },
    quoteToken: { address: "So11111111111111111111111111111111111111112", symbol: "SOL" },
    priceUsd: "0.00012",
    volume: { h24: 180_000 },
    liquidity: { usd: 60_000 },
    ...overrides,
  };
}

describe("MOMENTUM disabled in Wingman Default v1", () => {
  it("ships disabled with a zero reservation", () => {
    expect(WINGMAN_DEFAULT_SETTINGS.setups.MOMENTUM.enabled).toBe(false);
    expect(WINGMAN_DEFAULT_SETTINGS.reservations.MOMENTUM).toBe(0);
    expect(WINGMAN_DEFAULT_SETTINGS.reservations.BASE).toBe(10);
    expect(WINGMAN_DEFAULT_SETTINGS.reservations.REACCEL).toBe(8);
  });

  it("zeroes a stored reservation for a disabled setup", () => {
    const settings = normalizeStrategySettings({
      ...WINGMAN_DEFAULT_SETTINGS,
      reservations: { BASE: 10, MOMENTUM: 25, REACCEL: 8 },
    });
    expect(settings.reservations.MOMENTUM).toBe(0);
  });

  it("never classifies a new scan into a disabled MOMENTUM", () => {
    const young = token({ listedAt: minutesAgo(60 * 6), lastTradeAt: minutesAgo(1) });
    const c = evaluateCandidate(young, { nowIso: NOW, requireMarket: true, market: OK_MARKET });
    expect(c.lanes).not.toContain("MOMENTUM");
    expect(c.laneRejections["MOMENTUM"]).toMatch(/disabled/i);
    // Still a fully ranked candidate, never a rejection.
    expect(c.passedHardFilters).toBe(true);
    expect(c.quantitativePriority).not.toBeNull();
  });

  it("grants a disabled setup no reserved survivor slots", () => {
    const c = evaluateCandidate(token(), { nowIso: NOW, requireMarket: true, market: OK_MARKET });
    const ranked = assignRanks(rankCandidates([c]));
    const selection = selectSurvivorsWithReservations(
      ranked,
      10,
      { BASE: 10, MOMENTUM: 10, REACCEL: 8 },
      WINGMAN_DEFAULT_SETTINGS,
    );
    expect(selection.laneUsage["MOMENTUM"]).toBe(0);
  });

  it("hides MOMENTUM from the normal tabs while keeping it in Calibration", () => {
    expect(enabledSetups(WINGMAN_DEFAULT_SETTINGS)).toEqual(["BASE", "REACCEL"]);
    expect(disabledSetups(WINGMAN_DEFAULT_SETTINGS)).toEqual(["MOMENTUM"]);
  });

  it("stays configurable: re-enabling restores classification and its tab", () => {
    const on = normalizeStrategySettings({
      ...WINGMAN_DEFAULT_SETTINGS,
      setups: {
        ...WINGMAN_DEFAULT_SETTINGS.setups,
        MOMENTUM: { ...WINGMAN_DEFAULT_SETTINGS.setups.MOMENTUM, enabled: true },
      },
      reservations: { BASE: 10, MOMENTUM: 10, REACCEL: 8 },
    });
    expect(on.reservations.MOMENTUM).toBe(10);
    expect(enabledSetups(on)).toContain("MOMENTUM");
    expect(disabledSetups(on)).toHaveLength(0);
  });

  it("leaves BASE, REACCEL and NONE operating normally", () => {
    const base = evaluateCandidate(token(), {
      nowIso: NOW,
      requireMarket: true,
      market: OK_MARKET,
    });
    expect(base.lanes).toContain("BASE");

    const fresh = evaluateCandidate(
      token({ contractAddress: "None44444444444444444444444444444444444444", listedAt: minutesAgo(45) }),
      { nowIso: NOW, requireMarket: true, market: OK_MARKET },
    );
    expect(fresh.lanes).toHaveLength(0);
    expect(fresh.rejection).toBeNull();
    expect(fresh.quantitativePriority).not.toBeNull();
  });
});

describe("universal live-market eligibility", () => {
  it("accepts a resolvable Solana pair with usable liquidity and trading evidence", () => {
    const result = assessMarket(ADDRESS, [pair()]);
    expect(result.ok).toBe(true);
    expect(result.liquidityUsd).toBe(60_000);
  });

  it("rejects when no DexScreener pool resolves", () => {
    const result = assessMarket(ADDRESS, []);
    expect(result.ok).toBe(false);
    const c = evaluateCandidate(token(), { nowIso: NOW, requireMarket: true, market: result });
    expect(c.passedHardFilters).toBe(false);
    expect(c.rejection?.reason).toBe(NO_VALID_DEX_MARKET);
    expect(c.lanes).toHaveLength(0);
  });

  it("rejects a missing market resolution outright", () => {
    const c = evaluateCandidate(token(), { nowIso: NOW, requireMarket: true, market: null });
    expect(c.rejection?.reason).toBe(NO_VALID_DEX_MARKET);
  });

  it("does not convert missing liquidity into zero", () => {
    const result = assessMarket(ADDRESS, [pair({ liquidity: {} })]);
    expect(result.ok).toBe(false);
    expect(result.liquidityUsd).toBeNull();
    expect(result.reasonDetail).toMatch(/no usable USD liquidity/i);
  });

  it("rejects liquidity at or below the catastrophic floor", () => {
    const result = assessMarket(ADDRESS, [
      pair({ liquidity: { usd: ACTIVITY_FLOOR.catastrophicLiquidityUsd } }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects a resolved pair with no market or trading evidence", () => {
    const result = assessMarket(ADDRESS, [
      pair({ priceUsd: undefined, volume: {}, txns: {} }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.reasonDetail).toMatch(/trading evidence/i);
  });

  it("rejects an invalid Solana identity before any pair work", () => {
    expect(assessMarket("not-an-address", [pair()]).ok).toBe(false);
  });

  it("applies the gate to BASE, REACCEL and NONE alike", () => {
    const noMarket = assessMarket(ADDRESS, []);
    for (const fixture of [
      token(),
      token({ listedAt: minutesAgo(60 * 24 * 40) }),
      token({ listedAt: minutesAgo(45) }),
    ]) {
      const c = evaluateCandidate(fixture, { nowIso: NOW, requireMarket: true, market: noMarket });
      expect(c.rejection?.reason).toBe(NO_VALID_DEX_MARKET);
    }
  });

  it("leaves historical evaluation untouched when the gate is not requested", () => {
    const c = evaluateCandidate(token(), { nowIso: NOW });
    expect(c.passedHardFilters).toBe(true);
    expect(c.rejection).toBeNull();
  });
});
