import { describe, expect, it } from "vitest";
import {
  CURRENT_POLICY_EPOCH,
  SELECTION_POLICY_VERSION,
  epochForMilestone,
  epochForRun,
  filterByPolicy,
} from "./policy-epochs";
import { summarizeStageRows, type StageRow } from "./milestones";

const runs = new Map([
  ["legacy-run", { selectionPolicyVersion: null, policyEpoch: null }],
  [
    "current-run",
    { selectionPolicyVersion: SELECTION_POLICY_VERSION, policyEpoch: "CURRENT_V1" },
  ],
]);

function row(over: Partial<StageRow> = {}): StageRow {
  return {
    tokenId: "t1",
    contractAddress: "MintAAA",
    name: "Token",
    symbol: "TKN",
    stage: "SURVIVOR",
    setupKey: "ALL",
    setups: ["BASE"],
    enteredAt: "2026-09-01T00:00:00.000Z",
    entryMarketCap: 100_000,
    entryPriceUsd: 0.01,
    entryLiquidityUsd: 10_000,
    sincePct: 10,
    peakPct: 20,
    maxAdversePct: -5,
    drawdownPct: -5,
    currentMarketCap: 110_000,
    currentPriceUsd: 0.011,
    currentObservedAt: null,
    scanMarketCap: null,
    scanLiquidityUsd: null,
    scanVolume24h: null,
    priceIntegrityStatus: null,
    structuralStatus: null,
    participationStatus: null,
    dexPairAddress: null,
    observationCount: 1,
    latestObservationAt: null,
    latestRecurrenceState: null,
    provenance: null,
    baselineComplete: true,
    policyEpoch: "LEGACY_V0",
    selectionPolicyVersion: null,
    ...over,
  };
}

describe("policy epochs", () => {
  it("a pre-policy scan stays LEGACY_V0 and is never re-evaluated by today's gates", () => {
    expect(epochForRun(runs.get("legacy-run"))).toBe("LEGACY_V0");
    expect(epochForMilestone("legacy-run", runs)).toBe("LEGACY_V0");
  });

  it("the first fully-current scan writes CURRENT_V1", () => {
    expect(epochForRun(runs.get("current-run"))).toBe(CURRENT_POLICY_EPOCH);
    expect(epochForMilestone("current-run", runs)).toBe("CURRENT_V1");
  });

  it("missing policy evidence stays UNKNOWN_POLICY rather than guessed", () => {
    expect(epochForMilestone(null, runs)).toBe("UNKNOWN_POLICY");
    expect(epochForMilestone("never-seen-run", runs)).toBe("UNKNOWN_POLICY");
  });

  it("a future policy change creates a new epoch without rewriting V1", () => {
    const v1 = { policyEpoch: "CURRENT_V1", selectionPolicyVersion: SELECTION_POLICY_VERSION };
    const v2 = { policyEpoch: "CURRENT_V2", selectionPolicyVersion: "scanner_selection/v2" };
    expect(epochForRun(v1)).toBe("CURRENT_V1");
    // A newer epoch never re-labels the older one.
    expect(epochForRun(v2)).not.toBe("CURRENT_V1");
  });

  it("Current excludes legacy while All history keeps both", () => {
    const rows = [
      row({ tokenId: "legacy" }),
      row({ tokenId: "current", policyEpoch: "CURRENT_V1" }),
      row({ tokenId: "unknown", policyEpoch: "UNKNOWN_POLICY" }),
    ];
    expect(filterByPolicy(rows, "CURRENT").map((r) => r.tokenId)).toEqual(["current"]);
    expect(filterByPolicy(rows, "ALL")).toHaveLength(3);
  });

  it("Current metrics contain only CURRENT_V1 rows", () => {
    const rows = [
      row({ tokenId: "legacy", sincePct: 1_000_000, peakPct: 1_000_000 }),
      row({ tokenId: "current", policyEpoch: "CURRENT_V1", sincePct: 25, peakPct: 40 }),
    ];
    const current = summarizeStageRows("SURVIVOR", filterByPolicy(rows, "CURRENT"));
    expect(current.sampleSize).toBe(1);
    expect(current.avgSince.value).toBe(25);
    const all = summarizeStageRows("SURVIVOR", filterByPolicy(rows, "ALL"));
    expect(all.sampleSize).toBe(2);
    // Mean is dominated by the outlier; median is not.
    expect(all.avgSince.value).toBeGreaterThan(400_000);
    expect(all.medianSince.value).toBe(500_012.5);
  });

  it("filtering by policy never changes a frozen baseline", () => {
    const legacy = row({ tokenId: "legacy" });
    const [kept] = filterByPolicy([legacy, row({ policyEpoch: "CURRENT_V1" })], "ALL");
    expect(kept?.entryMarketCap).toBe(100_000);
    expect(kept?.enteredAt).toBe("2026-09-01T00:00:00.000Z");
  });
});
