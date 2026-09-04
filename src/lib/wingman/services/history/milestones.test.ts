import { describe, expect, it } from "vitest";
import {
  FUNNEL_STAGES,
  deriveSetupMilestone,
  deriveSetupQualifiedMilestones,
  deriveSurvivorMilestone,
  emptyProvenance,
  filterStageRows,
  keepFirstMilestone,
  sortStageRows,
  survivorRowFromCohortToken,
  uniqueStageRows,
  type QualifyingSetup,
  type StageAppearance,
  type StageRow,
} from "./milestones";
import type { CohortToken } from "./cohort";

const identity = { tokenId: "t1", contractAddress: "MintAAA", chain: "solana" };

function appearance(over: Partial<StageAppearance> = {}): StageAppearance {
  return {
    scanRunId: "scan-1",
    completedAt: "2026-09-01T00:00:00.000Z",
    setups: ["BASE"],
    marketCap: 100_000,
    priceUsd: 0.01,
    liquidityUsd: 20_000,
    quantitativePriority: 12.5,
    survivor: false,
    ...over,
  };
}

const setupMilestone = (list: StageAppearance[], setup: QualifyingSetup = "BASE") =>
  deriveSetupMilestone(identity, list, setup);

describe("SETUP_QUALIFIED milestones", () => {
  it("freezes the first BASE qualification", () => {
    const m = setupMilestone([
      appearance({ scanRunId: "scan-2", completedAt: "2026-09-02T00:00:00.000Z", marketCap: 500_000 }),
      appearance({ scanRunId: "scan-1", completedAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(m?.firstEnteredAt).toBe("2026-09-01T00:00:00.000Z");
    expect(m?.marketCapAtEntry).toBe(100_000);
    expect(m?.firstSetup).toBe("BASE");
    expect(m?.setupKey).toBe("BASE");
    expect(m?.provenance.sourceScanId).toBe("scan-1");
    expect(m?.provenance.sourceType).toBe("SCANNER");
  });

  it("later appearances never rewrite an existing milestone", () => {
    const first = setupMilestone([appearance()])!;
    const later = setupMilestone([
      appearance({ scanRunId: "scan-9", completedAt: "2026-09-09T00:00:00.000Z" }),
    ]);
    expect(keepFirstMilestone(first, later)).toBe(first);
  });

  it("keeps a separate frozen baseline for BASE and REACCEL", () => {
    const list = [
      appearance({ setups: ["BASE"], completedAt: "2026-09-01T00:00:00.000Z", scanRunId: "r1", marketCap: 100_000 }),
      appearance({ setups: ["REACCEL"], completedAt: "2026-09-05T00:00:00.000Z", scanRunId: "r2", marketCap: 900_000 }),
    ];
    const milestones = deriveSetupQualifiedMilestones(identity, list);
    expect(milestones).toHaveLength(2);
    const base = milestones.find((m) => m.setupKey === "BASE")!;
    const reaccel = milestones.find((m) => m.setupKey === "REACCEL")!;
    expect(base.firstEnteredAt).toBe("2026-09-01T00:00:00.000Z");
    expect(base.marketCapAtEntry).toBe(100_000);
    // REACCEL must measure from its OWN entry, never the earlier BASE entry.
    expect(reaccel.firstEnteredAt).toBe("2026-09-05T00:00:00.000Z");
    expect(reaccel.marketCapAtEntry).toBe(900_000);
    expect(reaccel.provenance.sourceScanId).toBe("r2");
  });

  it("records the first REACCEL qualification and setup-specific timestamps", () => {
    const m = setupMilestone(
      [
        appearance({ setups: ["REACCEL"], completedAt: "2026-09-01T00:00:00.000Z", scanRunId: "r1" }),
        appearance({ setups: ["BASE"], completedAt: "2026-09-03T00:00:00.000Z", scanRunId: "r2" }),
      ],
      "REACCEL",
    );
    expect(m?.firstSetup).toBe("REACCEL");
    expect(m?.firstReaccelAt).toBe("2026-09-01T00:00:00.000Z");
    expect(m?.firstBaseAt).toBe("2026-09-03T00:00:00.000Z");
  });

  it("NONE never qualifies", () => {
    expect(setupMilestone([appearance({ setups: [] }), appearance({ setups: ["NONE"] })])).toBeNull();
    expect(
      deriveSetupQualifiedMilestones(identity, [appearance({ setups: ["NONE"] })]),
    ).toHaveLength(0);
  });

  it("missing baselines stay unavailable rather than zeroed", () => {
    const m = setupMilestone([appearance({ marketCap: null, priceUsd: null, liquidityUsd: null })]);
    expect(m?.marketCapAtEntry).toBeNull();
    expect(m?.priceAtEntry).toBeNull();
    expect(m?.baselineComplete).toBe(false);
  });
});

describe("SURVIVOR milestones", () => {

  const record = {
    tokenId: "t1",
    contractAddress: "MintAAA",
    firstCallAt: "2026-09-04T10:00:00.000Z",
    firstCallScanId: "scan-call",
    firstCallMarketCap: 250_000,
    firstCallPriceUsd: 0.02,
  };

  it("copies the frozen First Call baseline verbatim", () => {
    const m = deriveSurvivorMilestone(record, appearance({ scanRunId: "scan-call" }));
    expect(m?.firstEnteredAt).toBe(record.firstCallAt);
    expect(m?.marketCapAtEntry).toBe(record.firstCallMarketCap);
    expect(m?.priceAtEntry).toBe(record.firstCallPriceUsd);
    expect(m?.provenance.sourceScanId).toBe("scan-call");
  });

  it("later survivor selections never rewrite the first entry", () => {
    const first = deriveSurvivorMilestone(record, null)!;
    const later = deriveSurvivorMilestone(
      { ...record, firstCallAt: "2026-09-06T00:00:00.000Z" },
      null,
    );
    expect(keepFirstMilestone(first, later)?.firstEnteredAt).toBe(record.firstCallAt);
  });

  it("returns nothing without a frozen First Call", () => {
    expect(deriveSurvivorMilestone({ ...record, firstCallAt: null })).toBeNull();
  });
});

describe("stage enums and provenance", () => {
  it("supports the future AI stages without creating records", () => {
    expect(FUNNEL_STAGES).toContain("AI_SHORTLIST");
    expect(FUNNEL_STAGES).toContain("THESIS_CALL");
    const scanner = setupMilestone([appearance()])!;
    expect(scanner.stage).toBe("SETUP_QUALIFIED");
    expect(scanner.provenance.researchPacketId).toBeNull();
    expect(scanner.provenance.researchRunId).toBeNull();
  });

  it("keeps missing provenance unavailable instead of fabricated", () => {
    const p = emptyProvenance("AI_TRIAGE");
    expect(p.researchPacketId).toBeNull();
    expect(p.researchPacketVersion).toBeNull();
    expect(p.sourceId).toBeNull();
  });

  it("carries research packet provenance for a future AI_SHORTLIST entry", () => {
    const p = {
      ...emptyProvenance("AI_TRIAGE"),
      sourceId: "triage-run-1",
      researchPacketId: "packet-1",
      researchPacketVersion: "research_packet/v1",
      researchRunId: "triage-run-1",
    };
    expect(p.researchPacketId).toBe("packet-1");
    expect(p.researchPacketVersion).toBe("research_packet/v1");
  });

  it("carries thesis provenance for a future THESIS_CALL entry", () => {
    const p = {
      ...emptyProvenance("THESIS_SYNTHESIS"),
      sourceId: "thesis-run-1",
      researchReportId: "report-1",
      policyVersion: "thesis_policy/v1",
    };
    expect(p.researchReportId).toBe("report-1");
    expect(p.policyVersion).toBe("thesis_policy/v1");
  });
});

function row(over: Partial<StageRow> = {}): StageRow {
  return {
    tokenId: "t1",
    contractAddress: "MintAAA",
    name: "Token",
    symbol: "TKN",
    stage: "SETUP_QUALIFIED",
    setupKey: "ALL",
    setups: ["BASE"],
    enteredAt: "2026-09-01T00:00:00.000Z",
    entryMarketCap: 100_000,
    entryPriceUsd: 0.01,
    entryLiquidityUsd: 10_000,
    sincePct: null,
    peakPct: null,
    maxAdversePct: null,
    drawdownPct: null,
    currentMarketCap: null,
    currentPriceUsd: null,
    currentObservedAt: null,
    scanMarketCap: null,
    scanLiquidityUsd: null,
    scanVolume24h: null,
    priceIntegrityStatus: null,
    structuralStatus: null,
    participationStatus: null,
    dexPairAddress: null,
    observationCount: 0,
    latestObservationAt: null,
    latestRecurrenceState: null,
    provenance: null,
    baselineComplete: true,
    ...over,
  };
}

describe("stage read model", () => {
  it("shows one row per token in a stage cohort", () => {
    const rows = uniqueStageRows([row(), row({ enteredAt: "2026-09-05T00:00:00.000Z" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.enteredAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("keeps setup and survivor cohorts distinct", () => {
    const setupRows = [row({ tokenId: "a" }), row({ tokenId: "b", setups: ["REACCEL"] })];
    const survivorRows = [row({ tokenId: "a", stage: "SURVIVOR" })];
    expect(filterStageRows(setupRows, "BASE").map((r) => r.tokenId)).toEqual(["a"]);
    expect(filterStageRows(setupRows, "REACCEL").map((r) => r.tokenId)).toEqual(["b"]);
    expect(survivorRows[0]?.stage).toBe("SURVIVOR");
    expect(setupRows[0]?.stage).toBe("SETUP_QUALIFIED");
  });

  it("filters survivor NONE rows", () => {
    const rows = [row({ tokenId: "a", setups: [] }), row({ tokenId: "b", setups: ["BASE"] })];
    expect(filterStageRows(rows, "NONE").map((r) => r.tokenId)).toEqual(["a"]);
  });

  it("BASE and REACCEL History each use their own frozen baseline", () => {
    const dual = [
      row({
        tokenId: "dual",
        setupKey: "BASE",
        setups: ["BASE"],
        enteredAt: "2026-09-01T00:00:00.000Z",
        entryMarketCap: 100_000,
      }),
      row({
        tokenId: "dual",
        setupKey: "REACCEL",
        setups: ["REACCEL"],
        enteredAt: "2026-09-05T00:00:00.000Z",
        entryMarketCap: 900_000,
      }),
    ];
    const base = filterStageRows(dual, "BASE");
    const reaccel = filterStageRows(dual, "REACCEL");
    expect(base).toHaveLength(1);
    expect(base[0]?.entryMarketCap).toBe(100_000);
    expect(reaccel).toHaveLength(1);
    expect(reaccel[0]?.entryMarketCap).toBe(900_000);
    // Headline "All" counts the token once, using its earliest entry.
    const all = filterStageRows(dual, "ALL");
    expect(all).toHaveLength(1);
    expect(all[0]?.enteredAt).toBe("2026-09-01T00:00:00.000Z");
  });



  it("sorts by most recent and puts missing peaks last", () => {
    const rows = [
      row({ tokenId: "a", latestObservationAt: "2026-09-01T00:00:00.000Z", peakPct: 10 }),
      row({ tokenId: "b", latestObservationAt: "2026-09-05T00:00:00.000Z", peakPct: null }),
      row({ tokenId: "c", latestObservationAt: "2026-09-03T00:00:00.000Z", peakPct: 90 }),
    ];
    expect(sortStageRows(rows, "RECENT").map((r) => r.tokenId)).toEqual(["b", "c", "a"]);
    expect(sortStageRows(rows, "PEAK").map((r) => r.tokenId)).toEqual(["c", "a", "b"]);
  });

  it("survivor rows reuse the existing frozen First Call metrics unchanged", () => {
    const token: CohortToken = {
      tokenId: "t9",
      contractAddress: "MintBBB",
      name: "Cat",
      symbol: "CAT",
      setups: ["BASE"],
      firstCallAt: "2026-09-04T00:00:00.000Z",
      firstCallMarketCap: 51_207,
      firstCallPriceUsd: 0.005,
      sinceCallPct: -20,
      peakSinceCallPct: 33,
      maxAdverseSinceCallPct: -44,
      drawdownSinceCallPct: -55,
      currentMarketCap: 40_000,
      currentPriceUsd: 0.004,
      currentObservedAt: "2026-09-05T00:00:00.000Z",
      scanMarketCap: 51_000,
      scanLiquidityUsd: 23_524,
      scanVolume24h: 90_000,
      priceIntegrityStatus: "HEALTHY",
      structuralStatus: "PASS",
      participationStatus: "BROAD",
      dexPairAddress: "pair",
      observationCount: 4,
      latestObservationAt: "2026-09-05T00:00:00.000Z",
      latestRecurrenceState: "REPEAT",
    };
    const mapped = survivorRowFromCohortToken(token);
    expect(mapped.stage).toBe("SURVIVOR");
    expect(mapped.enteredAt).toBe(token.firstCallAt);
    expect(mapped.entryMarketCap).toBe(token.firstCallMarketCap);
    expect(mapped.sincePct).toBe(token.sinceCallPct);
    expect(mapped.peakPct).toBe(token.peakSinceCallPct);
    expect(mapped.maxAdversePct).toBe(token.maxAdverseSinceCallPct);
    expect(mapped.drawdownPct).toBe(token.drawdownSinceCallPct);
  });
});
