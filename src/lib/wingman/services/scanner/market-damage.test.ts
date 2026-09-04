/**
 * Recent Catastrophic Collapse gate.
 *
 * The gate may change ONE thing: current Survivor eligibility. Priority,
 * setups, structural status and persisted history stay untouched.
 *
 * WOTF (AWGwZoZSnrPs89eomSzkumnpSxP3aTPV9b579dkpump) is used only as a
 * recorded regression reference — never as production logic.
 */
import { describe, expect, it } from "vitest";
import { assignRanks, rankCandidates, selectSurvivorsWithReservations } from "./evaluate";
import { WINGMAN_DEFAULT_SETTINGS, RECENT_MARKET_DAMAGE, type StrategySettings } from "./config";
import {
  assessRecentMarketDamage,
  isRecentMarketDamageEligible,
  RECENT_CATASTROPHIC_COLLAPSE,
} from "./market-damage";
import type { EvaluatedCandidate, SetupType } from "./types";

function candidate(
  address: string,
  priority: number,
  lanes: SetupType[],
  priceChange1h: number | null,
): EvaluatedCandidate {
  return {
    token: {
      contractAddress: address,
      chain: "solana",
      symbol: address,
      name: address,
      priceChange1h,
    },
    metrics: {},
    signals: {},
    extensionReasons: [],
    globalRank: null,
    laneRanks: {},
    selectedByLaneReservation: false,
    selectedByGlobalRanking: false,
    structuralSafety: "UNKNOWN",
    tokenSecurity: "NOT_CHECKED",
    historySnapshotCount: 0,
    lanes,
    laneRejections: { REACCEL: "age below minimum" },
    passedHardFilters: true,
    rejection: null,
    quantitativePriority: priority,
    priority: { total: priority },
    stageReached: "quantitative",
    enriched: false,
    structural: {
      policyVersion: "structural/v1",
      shadowMode: false,
      status: "PASS",
      evaluatedAt: "2026-09-04T00:00:00.000Z",
      rules: [],
      context: [],
    },
  } as unknown as EvaluatedCandidate;
}

const strategy: StrategySettings = WINGMAN_DEFAULT_SETTINGS;
const reservations = { BASE: 1, REACCEL: 1, MOMENTUM: 0 } as Record<SetupType, number>;

describe("recent catastrophic collapse threshold", () => {
  it("uses the centralized -90% configuration", () => {
    expect(RECENT_MARKET_DAMAGE.maxPriceChange1hPct).toBe(-90);
  });

  it("fails the recorded WOTF scan-time value of -96.4%", () => {
    const a = assessRecentMarketDamage(-96.4);
    expect(a.status).toBe("FAIL");
    expect(a.reason).toBe(RECENT_CATASTROPHIC_COLLAPSE);
    expect(a.thresholdPct).toBe(-90);
  });

  it("fails at exactly the threshold", () => {
    expect(assessRecentMarketDamage(-90).status).toBe("FAIL");
  });

  it("does not trigger just above the threshold", () => {
    const a = assessRecentMarketDamage(-89.99);
    expect(a.status).toBe("PASS");
    expect(a.reason).toBeNull();
  });

  it("treats a missing value as UNKNOWN and non-blocking", () => {
    for (const value of [null, undefined]) {
      const a = assessRecentMarketDamage(value);
      expect(a.status).toBe("UNKNOWN");
      expect(a.priceChange1hPct).toBeNull();
      expect(isRecentMarketDamageEligible(value)).toBe(true);
    }
  });

  it("treats a provider failure (non-finite) as UNKNOWN and non-blocking", () => {
    expect(assessRecentMarketDamage(Number.NaN).status).toBe("UNKNOWN");
    expect(isRecentMarketDamageEligible(Number.NaN)).toBe(true);
  });

  it("never treats null as zero", () => {
    expect(assessRecentMarketDamage(null).status).not.toBe("PASS");
    expect(assessRecentMarketDamage(0).status).toBe("PASS");
  });
});

describe("recent catastrophic collapse selection gate", () => {
  it("removes a collapsed candidate from Survivor selection and backfills the slot", () => {
    const ranked = assignRanks(
      rankCandidates([
        candidate("Crash", 90, ["BASE"], -96.4),
        candidate("Base2", 80, ["BASE"], -10),
        candidate("Reac1", 70, ["REACCEL"], 5),
      ]),
    );
    const selection = selectSurvivorsWithReservations(ranked, 2, reservations, strategy);
    const chosen = selection.survivors.map((s) => s.token.contractAddress);
    expect(chosen).not.toContain("Crash");
    expect(chosen).toEqual(["Base2", "Reac1"]);
    expect(selection.marketDamageVetoed.map((s) => s.token.contractAddress)).toEqual(["Crash"]);
  });

  it("applies regardless of setup, including global-pool candidates", () => {
    const ranked = assignRanks(
      rankCandidates([
        candidate("CrashNone", 95, [], -99),
        candidate("CrashReac", 94, ["REACCEL"], -90),
        candidate("Ok", 10, [], -1),
      ]),
    );
    const selection = selectSurvivorsWithReservations(ranked, 3, reservations, strategy);
    expect(selection.survivors.map((s) => s.token.contractAddress)).toEqual(["Ok"]);
  });

  it("keeps priority, ranks, setups and structural results unchanged", () => {
    const ranked = assignRanks(
      rankCandidates([
        candidate("Crash", 90, ["BASE"], -96.4),
        candidate("Base2", 80, ["BASE"], -10),
      ]),
    );
    const before = ranked.map((c) => ({
      priority: c.quantitativePriority,
      rank: c.globalRank,
      lanes: [...c.lanes],
      laneRejections: { ...c.laneRejections },
      structural: c.structural?.status,
    }));
    selectSurvivorsWithReservations(ranked, 2, reservations, strategy);
    expect(
      ranked.map((c) => ({
        priority: c.quantitativePriority,
        rank: c.globalRank,
        lanes: [...c.lanes],
        laneRejections: { ...c.laneRejections },
        structural: c.structural?.status,
      })),
    ).toEqual(before);
    // The collapsed candidate is still ranked first — it is only ineligible.
    expect(ranked[0]!.token.contractAddress).toBe("Crash");
    expect(ranked[0]!.globalRank).toBe(1);
  });

  it("is temporary: the same token qualifies once the crash condition clears", () => {
    const later = assignRanks(rankCandidates([candidate("Crash", 90, ["BASE"], -12)]));
    const selection = selectSurvivorsWithReservations(later, 2, reservations, strategy);
    expect(selection.survivors.map((s) => s.token.contractAddress)).toEqual(["Crash"]);
    expect(selection.marketDamageVetoed).toHaveLength(0);
  });

  it("can be disabled for counterfactual diagnostics without touching ranking", () => {
    const ranked = assignRanks(rankCandidates([candidate("Crash", 90, ["BASE"], -96.4)]));
    const selection = selectSurvivorsWithReservations(ranked, 2, reservations, strategy, {
      marketDamageVeto: false,
    });
    expect(selection.survivors.map((s) => s.token.contractAddress)).toEqual(["Crash"]);
  });
});
