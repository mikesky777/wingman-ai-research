/**
 * Scanner Workbench tests — pure calibration logic only.
 *
 * No network, no database. These lock in the behaviour that makes a scan
 * inspectable: bucket/lane diagnostics, lane-aware survivor reservations,
 * deterministic ranks and human-readable extension reasons.
 */
import { describe, expect, it } from "vitest";
import {
  assignRanks,
  bucketDiagnostics,
  evaluateCandidate,
  extensionAssessment,
  laneDiagnostics,
  marketCapBucket,
  rankCandidates,
  selectSurvivorsWithReservations,
  type DiscoveredToken,
  type DiscoveryHit,
} from "./index";

const NOW = "2026-04-01T12:00:00.000Z";
const minutesAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();

const HIT: DiscoveryHit = {
  source: "birdeye",
  queryId: "volume_1h_lowcap",
  family: "volume",
  rank: 0,
  laneHints: ["EARLY_MOMENTUM"],
};

function token(overrides: Partial<DiscoveredToken> = {}): DiscoveredToken {
  return {
    chain: "solana",
    contractAddress: "So11111111111111111111111111111111111111112",
    symbol: "TEST",
    name: "Test",
    imageUrl: null,
    priceUsd: 0.001,
    marketCap: 180_000,
    fdv: 180_000,
    liquidityUsd: 40_000,
    volume5m: 6_000,
    volume1h: 60_000,
    volume6h: 200_000,
    volume24h: 500_000,
    trades5m: 60,
    trades1h: 600,
    trades6h: 2_000,
    trades24h: 5_000,
    buys24h: 2_600,
    sells24h: 2_400,
    priceChange5m: 2,
    priceChange1h: 10,
    priceChange6h: 20,
    priceChange24h: 40,
    holderCount: 900,
    uniqueWallets24h: 700,
    listedAt: minutesAgo(300),
    lastTradeAt: minutesAgo(1),
    discovery: [HIT],
    ...overrides,
  };
}

const evaluate = (t: DiscoveredToken) => evaluateCandidate(t, { nowIso: NOW });

describe("market cap buckets", () => {
  it("places tokens in exactly one bucket and keeps unknown separate from zero", () => {
    expect(marketCapBucket(0)).toBe("<$50K");
    expect(marketCapBucket(49_999)).toBe("<$50K");
    expect(marketCapBucket(50_000)).toBe("$50K-$100K");
    expect(marketCapBucket(240_000)).toBe("$100K-$250K");
    expect(marketCapBucket(9_000_000)).toBe("$3M+");
    expect(marketCapBucket(null)).toBe("unknown");
  });
});

describe("bucket diagnostics", () => {
  it("accounts for every discovered candidate exactly once", () => {
    const candidates = [
      evaluate(token({ marketCap: 30_000 })),
      evaluate(token({ marketCap: 180_000 })),
      evaluate(token({ marketCap: null })),
    ];
    const rows = bucketDiagnostics(candidates);
    const discovered = rows.reduce((sum, r) => sum + r.discovered, 0);
    expect(discovered).toBe(3);
    expect(rows.find((r) => r.bucket === "unknown")!.discovered).toBe(1);
  });

  it("never reports more survivors than discovered in a bucket", () => {
    const rows = bucketDiagnostics([evaluate(token())]);
    for (const r of rows) {
      expect(r.passedHardFilters).toBeLessThanOrEqual(r.discovered);
      expect(r.laneQualified).toBeLessThanOrEqual(r.passedHardFilters);
      expect(r.enriched).toBeLessThanOrEqual(r.discovered);
    }
  });
});

describe("lane diagnostics", () => {
  it("reports one row per lane with qualified counts bounded by attempts", () => {
    const rows = laneDiagnostics([evaluate(token()), evaluate(token({ marketCap: 80_000 }))]);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.qualified).toBeLessThanOrEqual(r.discovered);
      expect(r.enriched).toBeLessThanOrEqual(r.qualified);
    }
  });
});

describe("ranking and lane reservations", () => {
  const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const many = Array.from({ length: 12 }, (_, i) =>
    evaluate(
      token({
        contractAddress: `So1111111111111111111111111111111111111111${base58[i]}`,
        volume1h: 60_000 - i * 2_000,
        volume24h: 500_000 - i * 10_000,
      }),
    ),
  );

  it("assigns deterministic global and lane ranks", () => {
    const ranked = assignRanks(rankCandidates(many));
    expect(ranked[0]!.globalRank).toBe(1);
    expect(ranked[1]!.globalRank).toBe(2);
    for (const c of ranked) {
      for (const lane of c.lanes) {
        expect(c.laneRanks[lane]).toBeGreaterThan(0);
      }
    }
  });

  it("never selects more survivors than the limit and marks how each was chosen", () => {
    const ranked = assignRanks(rankCandidates(many));
    const selection = selectSurvivorsWithReservations(ranked, 5, {
      EARLY_MOMENTUM: 2,
      POST_BOND_BASE: 2,
      DEVELOPING_THESIS: 1,
      REACCELERATION: 1,
    });
    expect(selection.survivors.length).toBeLessThanOrEqual(5);
    expect(new Set(selection.survivors.map((s) => s.token.contractAddress)).size).toBe(
      selection.survivors.length,
    );
    for (const s of selection.survivors) {
      expect(s.selectedByLaneReservation || s.selectedByGlobalRanking).toBe(true);
    }
    expect(selection.reservedCount + selection.globalCount).toBe(selection.survivors.length);
  });
});

describe("extension assessment", () => {
  it("explains an extreme move in human-readable terms", () => {
    const c = evaluate(token({ priceChange1h: 320, priceChange24h: 1500 }));
    const a = extensionAssessment(c.token, c.metrics);
    expect(a.risk).toBe("EXTREME");
    expect(a.reasons.length).toBeGreaterThan(0);
    expect(a.reasons.join(" ")).toMatch(/1h|24h/);
  });

  it("stays UNKNOWN rather than inventing a verdict when price data is missing", () => {
    const c = evaluate(token({ priceChange1h: null, priceChange24h: null, priceChange5m: null }));
    const a = extensionAssessment(c.token, c.metrics);
    expect(a.risk).toBe("UNKNOWN");
    expect(a.reasons[0]).toMatch(/No price-change evidence/i);
  });
});

describe("candidate defaults", () => {
  it("never claims structural safety or token security it has not checked", () => {
    const c = evaluate(token());
    expect(c.structuralSafety).toBe("UNKNOWN");
    expect(c.tokenSecurity).toBe("NOT_CHECKED");
  });
});
