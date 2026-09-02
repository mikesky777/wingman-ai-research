/**
 * Scanner v1 tests.
 *
 * Everything here is pure: no network, no database. Synthetic fixtures stand in
 * for the two lifecycle archetypes Wingman must never miss — a very young
 * accelerating token (GTAMEMES) and a post-bond survivor still trading days
 * later (Buddy).
 */
import { describe, expect, it } from "vitest";
import {
  applyHardFilters,
  computeMetrics,
  dedupeDiscovered,
  evaluateCandidate,
  quantitativePriority,
  rankCandidates,
  assignRanks,
  normalizeStrategySettings,
  assessMarket,
  NO_VALID_DEX_MARKET,
  selectSurvivors,
  selectSurvivorsWithReservations,
  WINGMAN_DEFAULT_SETTINGS,
  type DiscoveredToken,
  type DiscoveryHit,
} from "./index";
import {
  normalizeDiscoveryItem,
  normalizeDiscoveryPage,
  type BeListItem,
} from "../external/birdeye/discovery-normalizer";

const NOW = "2026-04-01T12:00:00.000Z";

function minutesAgo(minutes: number): string {
  return new Date(Date.parse(NOW) - minutes * 60_000).toISOString();
}

const HIT: DiscoveryHit = {
  source: "birdeye",
  queryId: "volume_1h_lowcap",
  family: "volume",
  rank: 0,
  laneHints: ["MOMENTUM"],
};

function token(overrides: Partial<DiscoveredToken> = {}): DiscoveredToken {
  return {
    chain: "solana",
    contractAddress: "So11111111111111111111111111111111111111112",
    symbol: "TEST",
    name: "Test",
    imageUrl: null,
    priceUsd: 0.001,
    marketCap: 200_000,
    fdv: 220_000,
    liquidityUsd: 40_000,
    volume5m: 4_000,
    volume1h: 40_000,
    volume6h: 120_000,
    volume24h: 300_000,
    trades5m: 60,
    trades1h: 600,
    trades6h: 1_800,
    trades24h: 4_000,
    buys24h: 2_100,
    sells24h: 1_900,
    priceChange5m: 2,
    priceChange1h: 8,
    priceChange6h: 25,
    priceChange24h: 40,
    holderCount: 1_200,
    uniqueWallets24h: 900,
    listedAt: minutesAgo(240),
    lastTradeAt: minutesAgo(2),
    discovery: [HIT],
    ...overrides,
  };
}

/** Young, accelerating, small cap — the MOMENTUM setup. */
const GTAMEMES = token({
  contractAddress: "GTAmemes1111111111111111111111111111111111",
  symbol: "GTAMEMES",
  name: "GTA Memes",
  marketCap: 95_000,
  fdv: 95_000,
  liquidityUsd: 22_000,
  volume5m: 9_000,
  volume1h: 70_000,
  volume6h: 70_000,
  volume24h: 70_000,
  trades5m: 140,
  trades1h: 900,
  trades6h: 900,
  trades24h: 900,
  buys24h: 560,
  sells24h: 340,
  priceChange5m: 6,
  priceChange1h: 35,
  priceChange6h: 35,
  priceChange24h: 35,
  holderCount: 420,
  uniqueWallets24h: 380,
  listedAt: minutesAgo(6 * 60),
  lastTradeAt: minutesAgo(1),
});

/** Bonded days ago, still turning over — post-bond persistence. */
const BUDDY = token({
  contractAddress: "Buddy22222222222222222222222222222222222222",
  symbol: "BUDDY",
  name: "Buddy",
  marketCap: 420_000,
  fdv: 430_000,
  liquidityUsd: 85_000,
  volume5m: 3_000,
  volume1h: 26_000,
  volume6h: 130_000,
  volume24h: 480_000,
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
});

/** MOMENTUM is disabled in Wingman Default v1; fixtures opt back in explicitly. */
const MOMENTUM_ON = normalizeStrategySettings({
  ...WINGMAN_DEFAULT_SETTINGS,
  setups: {
    ...WINGMAN_DEFAULT_SETTINGS.setups,
    MOMENTUM: { ...WINGMAN_DEFAULT_SETTINGS.setups.MOMENTUM, enabled: true },
  },
  reservations: { ...WINGMAN_DEFAULT_SETTINGS.reservations, MOMENTUM: 10 },
});

describe("scanner fixtures", () => {
  it("GTAMEMES passes hard filters and lands in MOMENTUM when the setup is enabled", () => {
    const c = evaluateCandidate(GTAMEMES, { nowIso: NOW, strategy: MOMENTUM_ON });
    expect(c.passedHardFilters).toBe(true);
    expect(c.rejection).toBeNull();
    expect(c.lanes).toContain("MOMENTUM");
    expect(["ACTIVE", "ACCELERATING", "EXTREME"]).toContain(c.signals.activityState);
    expect(c.quantitativePriority).toBeGreaterThan(0);
  });

  it("Buddy passes hard filters and lands in BASE", () => {
    const c = evaluateCandidate(BUDDY, { nowIso: NOW });
    expect(c.passedHardFilters).toBe(true);
    expect(c.lanes).toContain("BASE");
    expect(c.metrics.volumeToMarketCap24h).toBeGreaterThan(0.12);
  });

  it("neither fixture is rejected for being young or small", () => {
    for (const fixture of [GTAMEMES, BUDDY]) {
      const m = computeMetrics(fixture, NOW);
      expect(applyHardFilters(fixture, m)).toBeNull();
    }
  });
});

describe("age handling", () => {
  it("uses the provider listing time when present", () => {
    const m = computeMetrics(GTAMEMES, NOW);
    expect(m.age.basis).toBe("provider_listing");
    expect(Math.round(m.age.minutes!)).toBe(360);
  });

  it("falls back to persisted pair creation when the provider has no listing", () => {
    const m = computeMetrics(token({ listedAt: null }), NOW, {
      pairCreatedAt: minutesAgo(600),
    });
    expect(m.age.basis).toBe("pair_created");
    expect(Math.round(m.age.minutes!)).toBe(600);
  });

  it("unknown age stays unknown and is never treated as new", () => {
    const m = computeMetrics(token({ listedAt: null }), NOW);
    expect(m.age.minutes).toBeNull();
    expect(m.age.basis).toBe("unknown");
    const c = evaluateCandidate(token({ listedAt: null }), { nowIso: NOW });
    expect(c.lanes).not.toContain("EARLY_MOMENTUM");
  });
});

describe("hard filters", () => {
  it("rejects non-Solana chains", () => {
    const r = applyHardFilters(
      { ...token(), chain: "ethereum" },
      computeMetrics(token(), NOW),
    );
    expect(r?.reason).toBe("UNSUPPORTED_CHAIN");
  });

  it("rejects catastrophic liquidity", () => {
    const t = token({ liquidityUsd: 500 });
    expect(applyHardFilters(t, computeMetrics(t, NOW))?.reason).toBe("CATASTROPHIC_LIQUIDITY");
  });

  it("rejects zero trades over 24h but keeps null trades", () => {
    const dead = token({ trades24h: 0 });
    expect(applyHardFilters(dead, computeMetrics(dead, NOW))?.reason).toBe("NO_RECENT_TRADING");
    const unknown = token({ trades24h: null });
    expect(applyHardFilters(unknown, computeMetrics(unknown, NOW))?.reason).not.toBe(
      "NO_RECENT_TRADING",
    );
  });

  it("rejects stale activity", () => {
    const t = token({ lastTradeAt: minutesAgo(24 * 60) });
    expect(applyHardFilters(t, computeMetrics(t, NOW))?.reason).toBe("STALE_ACTIVITY");
  });

  it("never rejects for price being down", () => {
    const t = token({ priceChange1h: -30, priceChange24h: -70 });
    expect(applyHardFilters(t, computeMetrics(t, NOW))).toBeNull();
  });
});

describe("null vs zero", () => {
  it("keeps a genuine zero volume distinct from unavailable volume", () => {
    const zero = computeMetrics(token({ volume24h: 0, marketCap: 100_000 }), NOW);
    expect(zero.volumeToMarketCap24h).toBe(0);
    const missing = computeMetrics(token({ volume24h: null, marketCap: 100_000 }), NOW);
    expect(missing.volumeToMarketCap24h).toBeNull();
  });

  it("never invents a ratio without a denominator", () => {
    const m = computeMetrics(token({ marketCap: null, liquidityUsd: 40_000 }), NOW);
    expect(m.volumeToMarketCap24h).toBeNull();
  });
});

describe("determinism", () => {
  it("produces identical priority for identical input", () => {
    const a = evaluateCandidate(GTAMEMES, { nowIso: NOW });
    const b = evaluateCandidate(GTAMEMES, { nowIso: NOW });
    expect(a.quantitativePriority).toBe(b.quantitativePriority);
    expect(a.priority).toEqual(b.priority);
  });

  it("breaks priority ties by contract address, not insertion order", () => {
    const one = evaluateCandidate(token({ contractAddress: "Bbbb1111111111111111111111111111111111111" }), { nowIso: NOW });
    const two = evaluateCandidate(token({ contractAddress: "Aaaa2222222222222222222222222222222222222" }), { nowIso: NOW });
    expect(rankCandidates([one, two]).map((c) => c.token.contractAddress)).toEqual(
      rankCandidates([two, one]).map((c) => c.token.contractAddress),
    );
  });

  it("priority stays inside 0..100", () => {
    for (const fixture of [GTAMEMES, BUDDY, token()]) {
      const c = evaluateCandidate(fixture, { nowIso: NOW });
      expect(c.quantitativePriority!).toBeGreaterThanOrEqual(0);
      expect(c.quantitativePriority!).toBeLessThanOrEqual(100);
    }
  });
});

describe("extension risk", () => {
  it("flags a heavily extended move without rejecting it", () => {
    const t = token({ priceChange1h: 180, priceChange6h: 700, priceChange24h: 1500 });
    const c = evaluateCandidate(t, { nowIso: NOW });
    expect(["HIGH", "EXTREME"]).toContain(c.signals.extensionRisk);
    expect(c.passedHardFilters).toBe(true);
  });

  it("penalises extension inside the priority breakdown", () => {
    const calm = evaluateCandidate(token(), { nowIso: NOW });
    const extended = evaluateCandidate(
      token({ priceChange1h: 180, priceChange6h: 700, priceChange24h: 1500 }),
      { nowIso: NOW },
    );
    expect(extended.priority!.extensionPenalty).toBeLessThanOrEqual(
      calm.priority!.extensionPenalty,
    );
  });
});

describe("deduplication", () => {
  it("merges the same token across queries and keeps all provenance", () => {
    const a = token({ discovery: [HIT] });
    const b = token({
      marketCap: null,
      holderCount: null,
      discovery: [{ ...HIT, queryId: "trade_1h_lowcap", family: "trade_count", rank: 4 }],
    });
    const merged = dedupeDiscovered([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.discovery.map((d) => d.queryId)).toEqual([
      "volume_1h_lowcap",
      "trade_1h_lowcap",
    ]);
    expect(merged[0]!.marketCap).toBe(200_000);
  });

  it("keeps different chains separate", () => {
    const merged = dedupeDiscovered([token(), { ...token(), chain: "ethereum" }]);
    expect(merged).toHaveLength(2);
  });
});

describe("survivor selection", () => {
  it("only enriches hard-filter survivors, capped by the limit", () => {
    const candidates = [GTAMEMES, BUDDY, token({ trades24h: 0 })].map((t) =>
      evaluateCandidate(t, { nowIso: NOW }),
    );
    const survivors = selectSurvivors(rankCandidates(candidates), 1);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.passedHardFilters).toBe(true);
    expect(survivors[0]!.quantitativePriority).not.toBeNull();
  });
});

describe("setup taxonomy v2", () => {
  /** Old token with genuinely renewed interest versus its own baseline. */
  const RENEWED = token({
    contractAddress: "ReAcce33333333333333333333333333333333333",
    symbol: "OLD",
    marketCap: 1_400_000,
    volume5m: 22_000,
    volume1h: 180_000,
    volume6h: 260_000,
    volume24h: 400_000,
    trades5m: 300,
    trades1h: 2_400,
    trades6h: 3_100,
    trades24h: 5_000,
    listedAt: minutesAgo(60 * 24 * 40),
    lastTradeAt: minutesAgo(1),
  });

  it("classifies a renewed old token as REACCEL, never MOMENTUM", () => {
    const c = evaluateCandidate(RENEWED, { nowIso: NOW, strategy: MOMENTUM_ON });
    expect(c.lanes).not.toContain("MOMENTUM");
    expect(c.lanes).toContain("REACCEL");
  });

  it("never emits the legacy v1 setup names for a new scan", () => {
    for (const fixture of [GTAMEMES, BUDDY, RENEWED]) {
      const c = evaluateCandidate(fixture, { nowIso: NOW, strategy: MOMENTUM_ON });
      for (const setup of c.lanes) {
        expect(["MOMENTUM", "BASE", "REACCEL"]).toContain(setup);
      }
    }
  });

  it("treats a healthy no-setup candidate as NONE, not a rejection", () => {
    // Too young for MOMENTUM (3h) and BASE (12h), too new for REACCEL.
    const fresh = token({
      contractAddress: "None44444444444444444444444444444444444444",
      listedAt: minutesAgo(45),
      lastTradeAt: minutesAgo(1),
    });
    const c = evaluateCandidate(fresh, { nowIso: NOW });
    expect(c.passedHardFilters).toBe(true);
    expect(c.lanes).toHaveLength(0);
    expect(c.rejection).toBeNull();
    expect(c.quantitativePriority).not.toBeNull();
  });

  it("keeps NONE candidates rankable and eligible for the global pool", () => {
    const none = evaluateCandidate(
      token({ contractAddress: "None44444444444444444444444444444444444444", listedAt: minutesAgo(45) }),
      { nowIso: NOW },
    );
    const ranked = assignRanks(rankCandidates([none]));
    expect(ranked[0]!.globalRank).toBe(1);
    const selection = selectSurvivorsWithReservations(ranked, 5);
    expect(selection.survivors).toHaveLength(1);
    expect(selection.survivors[0]!.selectedByGlobalRanking).toBe(true);
  });

  it("charges a multi-setup token exactly one survivor slot", () => {
    const candidates = assignRanks(
      rankCandidates(
        [GTAMEMES, BUDDY, RENEWED].map((t) =>
          evaluateCandidate(t, { nowIso: NOW, strategy: MOMENTUM_ON }),
        ),
      ),
    );
    const selection = selectSurvivorsWithReservations(candidates, 10);
    const addresses = selection.survivors.map((s) => s.token.contractAddress);
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it("respects edited setup thresholds instead of hardcoded ones", () => {
    const strict = normalizeStrategySettings({
      ...WINGMAN_DEFAULT_SETTINGS,
      setups: {
        ...WINGMAN_DEFAULT_SETTINGS.setups,
        MOMENTUM: {
          ...WINGMAN_DEFAULT_SETTINGS.setups.MOMENTUM,
          enabled: true,
          marketCapMax: 50_000,
        },
      },
    });
    const c = evaluateCandidate(GTAMEMES, { nowIso: NOW, strategy: strict });
    expect(c.lanes).not.toContain("MOMENTUM");
    expect(c.laneRejections["MOMENTUM"]).toMatch(/above setup ceiling/);
  });

  it("falls back to Wingman Default v1 for invalid stored settings", () => {
    const settings = normalizeStrategySettings({ setups: { BASE: { marketCapMin: "nonsense" } } });
    expect(settings.setups.BASE.marketCapMin).toBe(
      WINGMAN_DEFAULT_SETTINGS.setups.BASE.marketCapMin,
    );
    expect(settings.configVersion).toBe(WINGMAN_DEFAULT_SETTINGS.configVersion);
    expect(settings.reservations).toEqual({ BASE: 10, MOMENTUM: 0, REACCEL: 8 });
  });

  it("keeps a saved strategy snapshot immutable against later edits", () => {
    const snapshot = normalizeStrategySettings(WINGMAN_DEFAULT_SETTINGS);
    const edited = normalizeStrategySettings({
      ...WINGMAN_DEFAULT_SETTINGS,
      survivorLimit: 5,
    });
    expect(snapshot.survivorLimit).toBe(WINGMAN_DEFAULT_SETTINGS.survivorLimit);
    expect(edited.survivorLimit).toBe(5);
  });
});

describe("birdeye discovery normalization", () => {
  const item: BeListItem = {
    address: "GTAmemes1111111111111111111111111111111111",
    name: "GTA Memes",
    symbol: "GTAMEMES",
    market_cap: 95_000,
    fdv: 95_000,
    liquidity: 22_000,
    volume_1h_usd: 70_000,
    volume_8h_usd: 80_000,
    volume_24h_usd: 90_000,
    trade_8h_count: 1_200,
    trade_24h_count: 1_500,
    price_change_24h_percent: 35,
    holder: 420,
    recent_listing_time: Math.floor(Date.parse(minutesAgo(50)) / 1000),
    last_trade_unix_time: Math.floor(Date.parse(minutesAgo(1)) / 1000),
  };

  it("maps a raw list item without leaking provider field names", () => {
    const t = normalizeDiscoveryItem(item, { chain: "solana", hit: HIT })!;
    expect(t.contractAddress).toBe(item.address);
    expect(t.marketCap).toBe(95_000);
    expect(Object.keys(t)).not.toContain("market_cap");
    expect(Object.keys(t)).not.toContain("volume_24h_usd");
  });

  it("derives 6h windows from Birdeye's 8h fields by duration scaling", () => {
    const t = normalizeDiscoveryItem(item, { chain: "solana", hit: HIT })!;
    expect(t.volume6h).toBeCloseTo(80_000 * (6 / 8), 6);
    expect(t.trades6h).toBeCloseTo(1_200 * (6 / 8), 6);
  });

  it("keeps missing fields null rather than zero", () => {
    const t = normalizeDiscoveryItem({ address: item.address! }, { chain: "solana", hit: HIT })!;
    expect(t.marketCap).toBeNull();
    expect(t.volume24h).toBeNull();
    expect(t.trades24h).toBeNull();
    expect(t.listedAt).toBeNull();
  });

  it("preserves market cap and FDV as distinct facts", () => {
    const t = normalizeDiscoveryItem(
      { ...item, market_cap: 95_000, fdv: 260_000 },
      { chain: "solana", hit: HIT },
    )!;
    expect(t.marketCap).toBe(95_000);
    expect(t.fdv).toBe(260_000);
  });

  it("drops items without an address and records rank provenance", () => {
    const page = normalizeDiscoveryPage(
      { items: [{ name: "no address" }, item] },
      {
        chain: "solana",
        query: {
          id: "volume_1h_lowcap",
          family: "volume",
          laneHints: ["MOMENTUM"],
          params: {},
          description: "test",
        },
      },
    );
    expect(page).toHaveLength(1);
    expect(page[0]!.discovery[0]!.rank).toBe(1);
    expect(page[0]!.chain).toBe("solana");
  });
});

describe("no fabricated claims", () => {
  it("scanner output carries no thesis score, holder or social judgement", () => {
    const c = evaluateCandidate(GTAMEMES, { nowIso: NOW });
    const keys = Object.keys(c);
    expect(keys).not.toContain("thesisScore");
    expect(keys).not.toContain("conviction");
    expect(keys).not.toContain("social");
    expect(c.quantitativePriority).not.toBeNull();
  });

  it("priority is a ranking of research effort, bounded and explainable", () => {
    const c = evaluateCandidate(BUDDY, { nowIso: NOW });
    const breakdown = quantitativePriority(BUDDY, c.metrics, c.signals, c.lanes);
    const sum = Object.values(breakdown.components).reduce((acc, p) => acc + p.points, 0);
    expect(breakdown.raw).toBeCloseTo(sum, 6);
  });
});
