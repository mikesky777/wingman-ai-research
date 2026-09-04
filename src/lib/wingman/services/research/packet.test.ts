import { describe, expect, it } from "vitest";
import {
  assessResearchEligibility,
  buildResearchPacket,
  selectResearchUniverse,
  type PacketCandidate,
} from "./packet";
import { compactJson, serializeCompact } from "./serialize";
import { RESEARCH_COMPACT_VERSION, RESEARCH_PACKET_VERSION } from "./types";

function candidate(overrides: Partial<PacketCandidate> = {}): PacketCandidate {
  return {
    tokenId: "token-1",
    name: "Test",
    symbol: "TEST",
    contractAddress: "MintAddress111",
    lanes: [],
    ageMinutes: 600,
    ageBasis: "pair_created_at",
    marketCap: 250_000,
    liquidityUsd: 40_000,
    priceUsd: 0.00025,
    volume1h: 12_000,
    volume24h: 180_000,
    trades1h: 300,
    trades24h: 4_000,
    buys24h: 2_100,
    sells24h: 1_900,
    holderCount: 900,
    priceChange1h: 2.5,
    priceChange24h: 18,
    turnover24h: 0.72,
    volumeToLiquidity24h: 4.5,
    quantitativePriority: 70,
    globalRank: 5,
    selectedByLaneReservation: false,
    selectedByGlobalRanking: false,
    recurrenceState: "REPEAT",
    scansSeenCount: 4,
    consecutiveScansSeen: 3,
    firstSeenScanAt: "2026-01-01T00:00:00.000Z",
    previousSeenScanAt: "2026-01-02T00:00:00.000Z",
    universeEligibility: "IN_SCOPE",
    universeCategory: null,
    universeReason: null,
    structuralStatus: "PASS",
    structuralPolicyVersion: "structural/v1",
    structuralDetail: null,
    priceIntegrityStatus: null,
    priceIntegrityPolicyVersion: null,
    priceIntegrityDetail: null,
    participationStatus: null,
    participationPolicyVersion: null,
    participationDetail: null,
    outcome: null,
    ...overrides,
  };
}

const baseInput = {
  candidateSource: "SURVIVOR" as const,
  scanRunId: "scan-1",
  scanCompletedAt: "2026-01-03T00:00:00.000Z",
  currentMarket: null,
  holderEvidence: [],
  generatedAt: "2026-01-03T00:10:00.000Z",
  nowMs: Date.parse("2026-01-03T00:10:00.000Z"),
};

describe("research eligibility", () => {
  it("excludes OUT_OF_SCOPE assets", () => {
    const verdict = assessResearchEligibility({
      candidate: candidate({ universeEligibility: "OUT_OF_SCOPE" }),
      currentPriceChange1h: 1,
    });
    expect(verdict.researchEligibleNow).toBe(false);
    expect(verdict.exclusionReasons).toContain("UNIVERSE_OUT_OF_SCOPE");
  });

  it("excludes Structural FAIL", () => {
    const verdict = assessResearchEligibility({
      candidate: candidate({ structuralStatus: "FAIL" }),
      currentPriceChange1h: 1,
    });
    expect(verdict.exclusionReasons).toContain("STRUCTURAL_FAIL");
  });

  it("excludes confirmed current Recent Market Damage FAIL", () => {
    const verdict = assessResearchEligibility({
      candidate: candidate(),
      currentPriceChange1h: -95,
    });
    expect(verdict.exclusionReasons).toContain("CURRENT_RECENT_MARKET_DAMAGE_FAIL");
  });

  it("does not exclude on missing current damage data", () => {
    const verdict = assessResearchEligibility({
      candidate: candidate({ priceChange1h: null }),
      currentPriceChange1h: null,
    });
    expect(verdict.researchEligibleNow).toBe(true);
  });

  it("never excludes on Price Integrity or Participation", () => {
    const verdict = assessResearchEligibility({
      candidate: candidate({
        priceIntegrityStatus: "DAMAGED",
        priceIntegrityPolicyVersion: "price_integrity/v1.1",
        participationStatus: "EXTREME",
        participationPolicyVersion: "participation/v1.1",
      }),
      currentPriceChange1h: 1,
    });
    expect(verdict.researchEligibleNow).toBe(true);
  });
});

describe("research universe selection", () => {
  it("includes survivors, eligible BASE/REACCEL and capped exploration", () => {
    const candidates: PacketCandidate[] = [
      candidate({ tokenId: "s1", selectedByGlobalRanking: true, lanes: ["BASE"] }),
      candidate({ tokenId: "b1", lanes: ["BASE"] }),
      candidate({ tokenId: "r1", lanes: ["REACCEL"] }),
      ...Array.from({ length: 20 }, (_, i) =>
        candidate({ tokenId: `n${i}`, lanes: [], quantitativePriority: 50 - i }),
      ),
    ];
    const selection = selectResearchUniverse(candidates);
    expect(selection.counts.SURVIVOR).toBe(1);
    expect(selection.counts.BASE).toBe(1);
    expect(selection.counts.REACCEL).toBe(1);
    expect(selection.counts.EXPLORATION).toBe(10);
    expect(selection.members.map((m) => m.candidate.tokenId)).toContain("n0");
    // Exploration is priority-ordered, so the weakest NONE candidates stay out.
    expect(selection.members.map((m) => m.candidate.tokenId)).not.toContain("n19");
  });

  it("deduplicates a token across slices", () => {
    const selection = selectResearchUniverse([
      candidate({ tokenId: "x", selectedByLaneReservation: true, lanes: ["BASE", "REACCEL"] }),
    ]);
    expect(selection.members).toHaveLength(1);
    expect(selection.members[0]!.candidateSource).toBe("SURVIVOR");
  });

  it("records exclusions instead of silently dropping candidates", () => {
    const selection = selectResearchUniverse([
      candidate({ tokenId: "bad", structuralStatus: "FAIL", selectedByGlobalRanking: true }),
    ]);
    expect(selection.members).toHaveLength(0);
    expect(selection.excluded).toHaveLength(1);
    expect(selection.exclusionCounts.STRUCTURAL_FAIL).toBe(1);
  });
});

describe("packet assembly", () => {
  it("is versioned and carries scanner context", () => {
    const packet = buildResearchPacket({
      ...baseInput,
      candidate: candidate({ selectedByGlobalRanking: true, lanes: ["BASE"] }),
    });
    expect(packet.packetVersion).toBe(RESEARCH_PACKET_VERSION);
    expect(packet.scanner.scanId).toBe("scan-1");
    expect(packet.scanner.survivor).toBe(true);
    expect(packet.scanner.selectionRoute).toBe("GLOBAL");
    expect(packet.scanner.primarySetup).toBe("BASE");
  });

  it("distinguishes NOT_EVALUATED from UNKNOWN", () => {
    const notEvaluated = buildResearchPacket({ ...baseInput, candidate: candidate() });
    expect(notEvaluated.priceIntegrity.status).toBe("NOT_EVALUATED");
    expect(notEvaluated.evidenceGaps).toContain("PRICE_INTEGRITY_NOT_EVALUATED");

    const ranButUnknown = buildResearchPacket({
      ...baseInput,
      candidate: candidate({
        priceIntegrityStatus: "UNKNOWN",
        priceIntegrityPolicyVersion: "price_integrity/v1.1",
      }),
    });
    expect(ranButUnknown.priceIntegrity.status).toBe("UNKNOWN");
    expect(ranButUnknown.evidenceGaps).not.toContain("PRICE_INTEGRITY_NOT_EVALUATED");
  });

  it("always reports social data as an explicit gap in v1", () => {
    const packet = buildResearchPacket({ ...baseInput, candidate: candidate() });
    expect(packet.evidenceGaps).toContain("SOCIAL_DATA_NOT_COLLECTED");
  });

  it("marks missing holder evidence as unavailable rather than zero", () => {
    const packet = buildResearchPacket({
      ...baseInput,
      candidate: candidate({ holderCount: null }),
    });
    expect(packet.holders.top10Pct.value).toBeNull();
    expect(packet.holders.top10Pct.status).toBe("unavailable");
    expect(packet.evidenceGaps).toContain("HOLDER_DATA_UNAVAILABLE");
  });

  it("uses live market evidence when present and flags stale evidence", () => {
    const fresh = buildResearchPacket({
      ...baseInput,
      candidate: candidate(),
      currentMarket: {
        priceUsd: 0.0003,
        marketCap: 300_000,
        liquidityUsd: 50_000,
        volume1h: null,
        volume24h: 200_000,
        trades1h: null,
        trades24h: null,
        buys24h: null,
        sells24h: null,
        priceChange1h: 5,
        priceChange24h: 20,
        source: "dexscreener",
        observedAt: "2026-01-03T00:05:00.000Z",
      },
    });
    expect(fresh.market.marketCap.value).toBe(300_000);
    expect(fresh.market.stale).toBe(false);

    const stale = buildResearchPacket({ ...baseInput, candidate: candidate() });
    expect(stale.market.stale).toBe(false); // scan completed 10 minutes ago
    const older = buildResearchPacket({
      ...baseInput,
      candidate: candidate(),
      scanCompletedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(older.market.stale).toBe(true);
    expect(older.evidenceGaps).toContain("CURRENT_MARKET_EVIDENCE_STALE");
  });

  it("separates frozen call-time damage from current damage", () => {
    const packet = buildResearchPacket({
      ...baseInput,
      candidate: candidate({ selectedByGlobalRanking: true, priceChange1h: -40 }),
      currentMarket: {
        priceUsd: null,
        marketCap: null,
        liquidityUsd: null,
        volume1h: null,
        volume24h: null,
        trades1h: null,
        trades24h: null,
        buys24h: null,
        sells24h: null,
        priceChange1h: -96,
        priceChange24h: null,
        source: "dexscreener",
        observedAt: "2026-01-03T00:09:00.000Z",
      },
    });
    expect(packet.marketDamage.callTime?.status).toBe("PASS");
    expect(packet.marketDamage.current.status).toBe("FAIL");
    expect(packet.marketDamage.derivedState).toBe("POST_CALL_COLLAPSE");
    expect(packet.eligibility.researchEligibleNow).toBe(false);
  });

  it("treats outcomes as historical context only", () => {
    const packet = buildResearchPacket({ ...baseInput, candidate: candidate() });
    expect(packet.outcomes).toBeNull();
    expect(packet.evidenceGaps).toContain("OUTCOMES_UNAVAILABLE");
  });
});

describe("compact serialization", () => {
  it("is deterministic and versioned", () => {
    const packet = buildResearchPacket({ ...baseInput, candidate: candidate() });
    const a = JSON.stringify(serializeCompact(packet));
    const b = JSON.stringify(serializeCompact(packet));
    expect(a).toBe(b);
    expect(serializeCompact(packet)['sv']).toBe(RESEARCH_COMPACT_VERSION);
  });

  it("stays compact and carries no raw candles or database rows", () => {
    const packet = buildResearchPacket({
      ...baseInput,
      candidate: candidate({
        priceIntegrityStatus: "HEALTHY",
        priceIntegrityPolicyVersion: "price_integrity/v1.1",
      }),
    });
    const { json, bytes } = compactJson(packet);
    expect(bytes).toBeLessThan(8_000);
    expect(json).not.toContain("candles");
    expect(json).not.toContain("value_json");
  });
});
