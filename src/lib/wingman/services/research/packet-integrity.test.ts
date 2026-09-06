/**
 * PHASE 1F.1 — Research Packet integrity hardening.
 *
 * Covers canonical scan × exact-mint packet idempotency (including concurrent
 * attempts), canonical readiness counting, the deny-by-default Thesis input
 * contract, the two explicit market snapshots and partial holder coverage.
 */
import { describe, expect, it } from "vitest";
import {
  buildThesisModelInput,
  THESIS_INPUT_POLICY_VERSION,
  THESIS_INPUT_SCHEMA,
} from "./thesis/contracts";
import { buildResearchPacket, type HolderEvidenceRow, type PacketCandidate } from "./packet";
import { serializeCompact } from "./serialize";
import { MARKET_SNAPSHOT_VERSION } from "./types";

const MINT_A = "So11111111111111111111111111111111111111112";
const MINT_B = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

/** In-memory stand-in for the (scan_run_id, contract_address) unique index. */
class PacketStore {
  rows: { scanRunId: string; mint: string; seq: number }[] = [];
  private seq = 0;
  insertCanonical(scanRunId: string, mint: string): "INSERTED" | "ALREADY_CANONICAL" {
    if (this.rows.some((r) => r.scanRunId === scanRunId && r.mint === mint)) {
      return "ALREADY_CANONICAL";
    }
    this.rows.push({ scanRunId, mint, seq: this.seq++ });
    return "INSERTED";
  }
  canonicalCount(scanRunId: string): number {
    return new Set(
      this.rows.filter((r) => r.scanRunId === scanRunId).map((r) => r.mint),
    ).size;
  }
  rawCount(scanRunId: string): number {
    return this.rows.filter((r) => r.scanRunId === scanRunId).length;
  }
}

describe("research_packet_idempotency/v1", () => {
  it("1. duplicate manual generation for the same scan x mint yields one canonical packet", () => {
    const store = new PacketStore();
    expect(store.insertCanonical("scan-1", MINT_A)).toBe("INSERTED");
    expect(store.insertCanonical("scan-1", MINT_A)).toBe("ALREADY_CANONICAL");
    expect(store.insertCanonical("scan-1", MINT_A)).toBe("ALREADY_CANONICAL");
    expect(store.canonicalCount("scan-1")).toBe(1);
    expect(store.rawCount("scan-1")).toBe(1);
  });

  it("2. concurrent generation attempts resolve to one canonical packet", async () => {
    const store = new PacketStore();
    const results = await Promise.all(
      Array.from({ length: 5 }, async () => store.insertCanonical("scan-1", MINT_A)),
    );
    expect(results.filter((r) => r === "INSERTED")).toHaveLength(1);
    expect(store.canonicalCount("scan-1")).toBe(1);
  });

  it("3. readiness counts distinct canonical scan x mint packets", () => {
    const store = new PacketStore();
    for (let i = 0; i < 45; i++) store.insertCanonical("scan-1", `mint-${i}`);
    // A retry of the whole cohort cannot double the count.
    for (let i = 0; i < 45; i++) store.insertCanonical("scan-1", `mint-${i}`);
    expect(store.canonicalCount("scan-1")).toBe(45);
    expect(store.canonicalCount("scan-1")).toBeLessThanOrEqual(45);
  });

  it("4. the same mint in a later production scan is a new canonical packet", () => {
    const store = new PacketStore();
    store.insertCanonical("scan-1", MINT_A);
    expect(store.insertCanonical("scan-2", MINT_A)).toBe("INSERTED");
    expect(store.canonicalCount("scan-1")).toBe(1);
    expect(store.canonicalCount("scan-2")).toBe(1);
  });
});

describe("thesis_synthesis_input/v2_allowlist_no_outcomes", () => {
  const compact = {
    sv: "research_packet_compact/v1",
    id: { mint: MINT_B, sym: "TKN" },
    mkt: { mc: 50000, liq: 12000 },
    gaps: ["SOCIAL_DATA_NOT_COLLECTED"],
    outcomes: { since_call: 412, peak_call: 900 },
  };

  it("is versioned and deny-by-default", () => {
    expect(THESIS_INPUT_POLICY_VERSION).toBe("thesis_synthesis_input/v2_allowlist_no_outcomes");
    expect(THESIS_INPUT_SCHEMA["outcomes"]).toBeUndefined();
    const out = buildThesisModelInput(compact);
    expect(out["outcomes"]).toBeUndefined();
    expect(out["mkt"]).toEqual({ mc: 50000, liq: 12000 });
  });

  it("5. arbitrary future outcome fields cannot serialize into Thesis input", () => {
    const future = {
      ...compact,
      realized_return_pct: 412,
      since_thesis_pct: 88,
      entry: { state: "BUY_ZONE" },
      live: { active: true },
      later_label: "WINNER",
      mkt: { ...compact.mkt, peak_since_call_pct: 700, drawdown_after_call: -33 },
    };
    const out = buildThesisModelInput(future) as Record<string, any>;
    for (const key of [
      "realized_return_pct",
      "since_thesis_pct",
      "entry",
      "live",
      "later_label",
      "outcomes",
    ]) {
      expect(out[key]).toBeUndefined();
    }
    expect(out["mkt"].peak_since_call_pct).toBeUndefined();
    expect(out["mkt"].drawdown_after_call).toBeUndefined();
    const serialized = JSON.stringify(out);
    for (const forbidden of ["412", "700", "-33", "BUY_ZONE", "WINNER"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("only admits a new field once it is added to the allowlist schema", () => {
    expect(buildThesisModelInput({ ...compact, newly_allowed: 1 })["newly_allowed"]).toBeUndefined();
  });
});

function candidate(overrides: Partial<PacketCandidate> = {}): PacketCandidate {
  return {
    tokenId: "t1",
    name: "Token",
    symbol: "TKN",
    contractAddress: MINT_A,
    lanes: [],
    ageMinutes: 120,
    ageBasis: "pair_created_at",
    marketCap: 100000,
    liquidityUsd: 20000,
    priceUsd: 0.001,
    volume1h: 5000,
    volume24h: 90000,
    trades1h: 100,
    trades24h: 2000,
    buys24h: 1100,
    sells24h: 900,
    holderCount: 500,
    priceChange1h: 2,
    priceChange24h: 10,
    turnover24h: 0.9,
    volumeToLiquidity24h: 4.5,
    quantitativePriority: 40,
    globalRank: 3,
    selectedByLaneReservation: false,
    selectedByGlobalRanking: true,
    recurrenceState: "NEW",
    scansSeenCount: 1,
    consecutiveScansSeen: 1,
    firstSeenScanAt: null,
    previousSeenScanAt: null,
    universeEligibility: "ELIGIBLE",
    universeCategory: null,
    universeReason: null,
    structuralStatus: "PASS",
    structuralPolicyVersion: "structural/v1",
    structuralDetail: null,
    priceIntegrityStatus: "NOT_EVALUATED",
    priceIntegrityPolicyVersion: null,
    priceIntegrityDetail: null,
    participationStatus: "NOT_EVALUATED",
    participationPolicyVersion: null,
    participationDetail: null,
    outcome: null,
    ...overrides,
  } as PacketCandidate;
}

function build(holderEvidence: HolderEvidenceRow[] = []) {
  return buildResearchPacket({
    candidate: candidate(),
    candidateSource: "BASE",
    scanRunId: "scan-1",
    scanCompletedAt: "2026-01-01T00:00:00.000Z",
    currentMarket: {
      priceUsd: 0.0012,
      marketCap: 120000,
      liquidityUsd: 21000,
      volume1h: 6000,
      volume24h: 95000,
      trades1h: null,
      trades24h: null,
      buys24h: null,
      sells24h: null,
      priceChange1h: 3,
      priceChange24h: 12,
      source: "dexscreener",
      observedAt: "2026-01-01T00:05:00.000Z",
    },
    holderEvidence,
    pairAddress: "pair1",
    dex: "raydium",
    chain: "solana",
    generatedAt: "2026-01-01T00:06:00.000Z",
    nowMs: Date.parse("2026-01-01T00:06:00.000Z"),
  });
}

describe("packet_market_snapshot/v1", () => {
  it("6. preserves scan-frozen and packet-refresh snapshots distinctly, with timestamps", () => {
    const packet = build();
    expect(packet.market.snapshotVersion).toBe(MARKET_SNAPSHOT_VERSION);
    expect(packet.market.snapshotUsed).toBe("PACKET_REFRESH_MARKET");

    expect(packet.market.scanFrozen.kind).toBe("SCAN_FROZEN_MARKET");
    expect(packet.market.scanFrozen.marketCap).toBe(100000);
    expect(packet.market.scanFrozen.observedAt).toBe("2026-01-01T00:00:00.000Z");

    expect(packet.market.packetRefresh.kind).toBe("PACKET_REFRESH_MARKET");
    expect(packet.market.packetRefresh.marketCap).toBe(120000);
    expect(packet.market.packetRefresh.observedAt).toBe("2026-01-01T00:05:00.000Z");

    const compact = serializeCompact(packet) as Record<string, any>;
    expect(compact["mkt_policy"]).toBe(MARKET_SNAPSHOT_VERSION);
    expect(compact["mkt_scan"].mc).toBe(100000);
    expect(compact["mkt_refresh"].mc).toBe(120000);
    expect(compact["mkt"].snapshot).toBe("PACKET_REFRESH_MARKET");
  });

  it("falls back explicitly to the scan-frozen snapshot when no refresh exists", () => {
    const packet = buildResearchPacket({
      candidate: candidate(),
      candidateSource: "BASE",
      scanRunId: "scan-1",
      scanCompletedAt: "2026-01-01T00:00:00.000Z",
      currentMarket: null,
      holderEvidence: [],
      pairAddress: "pair1",
      dex: "raydium",
      chain: "solana",
      generatedAt: "2026-01-01T00:06:00.000Z",
      nowMs: Date.parse("2026-01-01T00:06:00.000Z"),
    });
    expect(packet.market.snapshotUsed).toBe("SCAN_FROZEN_MARKET");
    expect(packet.market.packetRefresh.available).toBe(false);
    expect(packet.market.scanFrozen.available).toBe(true);
  });
});

describe("holder coverage semantics", () => {
  const row = (key: string, value: number): HolderEvidenceRow => ({
    domain: "holders",
    key,
    value,
    source: "birdeye",
    observedAt: "2026-01-01T00:00:00.000Z",
    capturedAt: "2026-01-01T00:00:00.000Z",
    status: "observed",
  });

  it("7. partial holder coverage emits HOLDER_CONCENTRATION_UNAVAILABLE, never negative evidence", () => {
    const packet = build([row("holders.wallet_holder_count", 812)]);
    expect(packet.evidenceGaps).toContain("HOLDER_CONCENTRATION_UNAVAILABLE");
    expect(packet.evidenceGaps).not.toContain("HOLDER_DATA_UNAVAILABLE");
    // The holder facts that DO exist stay intact and concentration stays unavailable.
    expect(packet.holders.holderCount.value).toBe(812);
    expect(packet.holders.top10Pct.status).toBe("unavailable");
    expect(packet.holders.top10Pct.value).toBeNull();
    expect(packet.holders.top20Pct.value).toBeNull();
  });

  it("does not emit the coverage code when concentration is present", () => {
    const packet = build([
      row("holders.wallet_holder_count", 812),
      row("holders.top10_wallet_pct_of_total_supply", 22.5),
      row("holders.top20_wallet_pct_of_total_supply", 31.2),
    ]);
    expect(packet.evidenceGaps).not.toContain("HOLDER_CONCENTRATION_UNAVAILABLE");
    expect(packet.evidenceGaps).not.toContain("HOLDER_DATA_UNAVAILABLE");
  });
});
