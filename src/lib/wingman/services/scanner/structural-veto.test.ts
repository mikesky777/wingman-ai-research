/**
 * Structural FAIL veto — selection behavior only.
 *
 * These tests pin the ONE thing Structural Eligibility is allowed to change:
 * survivor membership. Ranking, priority, setup classification and history must
 * stay byte-identical.
 */
import { describe, expect, it } from "vitest";
import {
  assignRanks,
  rankCandidates,
  selectSurvivorsWithReservations,
} from "./evaluate";
import { WINGMAN_DEFAULT_SETTINGS, type StrategySettings } from "./config";
import { isStructurallyEligible, type StructuralStatus } from "./structural";
import { classifyUniverse, OUT_OF_SCOPE_REASON } from "./universe";
import type { EvaluatedCandidate, SetupType } from "./types";

const AT = "2026-09-04T00:00:00.000Z";

function candidate(
  address: string,
  priority: number,
  lanes: SetupType[],
  status: StructuralStatus | null,
): EvaluatedCandidate {
  return {
    token: { contractAddress: address, chain: "solana", symbol: address, name: address },
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
    laneRejections: {},
    passedHardFilters: true,
    rejection: null,
    quantitativePriority: priority,
    priority: { total: priority },
    stageReached: "quantitative",
    enriched: false,
    structural: status
      ? { policyVersion: "structural/v1", shadowMode: false, status, evaluatedAt: AT, rules: [], context: [] }
      : null,
  } as unknown as EvaluatedCandidate;
}

const strategy: StrategySettings = WINGMAN_DEFAULT_SETTINGS;
const reservations = { BASE: 1, REACCEL: 1, MOMENTUM: 0 } as Record<SetupType, number>;

describe("structural FAIL veto", () => {
  it("never lets a structural FAIL candidate become a Survivor", () => {
    const ranked = assignRanks(
      rankCandidates([
        candidate("Fail1", 90, ["BASE"], "FAIL"),
        candidate("Pass1", 10, ["BASE"], "PASS"),
      ]),
    );
    const selection = selectSurvivorsWithReservations(ranked, 5, reservations, strategy);
    expect(selection.survivors.map((s) => s.token.contractAddress)).toEqual(["Pass1"]);
    expect(selection.structurallyVetoed.map((s) => s.token.contractAddress)).toEqual(["Fail1"]);
    expect(ranked.find((c) => c.token.contractAddress === "Fail1")!.selectedByLaneReservation).toBe(
      false,
    );
  });

  it("backfills a reserved lane slot with the next eligible candidate", () => {
    const ranked = assignRanks(
      rankCandidates([
        candidate("Fail1", 90, ["BASE"], "FAIL"),
        candidate("Base2", 80, ["BASE"], "UNKNOWN"),
        candidate("Reac1", 70, ["REACCEL"], "CONCERN"),
      ]),
    );
    const selection = selectSurvivorsWithReservations(ranked, 2, reservations, strategy);
    expect(selection.laneUsage["BASE"]).toBe(1);
    expect(selection.survivors.map((s) => s.token.contractAddress)).toEqual(["Base2", "Reac1"]);
    expect(selection.reservedCount).toBe(2);
  });

  it("skips a failing global-pool candidate and fills the slot from below", () => {
    const ranked = assignRanks(
      rankCandidates([
        candidate("FailG", 95, [], "FAIL"),
        candidate("NoneA", 60, [], "UNKNOWN"),
        candidate("NoneB", 50, [], "PASS"),
      ]),
    );
    const selection = selectSurvivorsWithReservations(ranked, 2, reservations, strategy);
    expect(selection.survivors.map((s) => s.token.contractAddress)).toEqual(["NoneA", "NoneB"]);
    expect(selection.survivors.every((s) => s.selectedByGlobalRanking)).toBe(true);
  });

  it("keeps PASS, CONCERN and UNKNOWN eligible, including a missing evaluation", () => {
    for (const status of ["PASS", "CONCERN", "UNKNOWN", null] as (StructuralStatus | null)[]) {
      const ranked = assignRanks(rankCandidates([candidate("Tok1", 50, ["BASE"], status)]));
      const selection = selectSurvivorsWithReservations(ranked, 5, reservations, strategy);
      expect(selection.survivors).toHaveLength(1);
    }
    expect(isStructurallyEligible("UNKNOWN")).toBe(true);
    expect(isStructurallyEligible(null)).toBe(true);
    expect(isStructurallyEligible("FAIL")).toBe(false);
  });

  it("leaves priority, rank and setup classification untouched", () => {
    const ranked = assignRanks(
      rankCandidates([
        candidate("Fail1", 90, ["BASE", "MOMENTUM"], "FAIL"),
        candidate("Pass1", 10, ["BASE"], "PASS"),
      ]),
    );
    const before = ranked.map((c) => ({
      p: c.quantitativePriority,
      r: c.globalRank,
      lanes: [...c.lanes],
      laneRanks: { ...c.laneRanks },
    }));
    selectSurvivorsWithReservations(ranked, 5, reservations, strategy);
    const after = ranked.map((c) => ({
      p: c.quantitativePriority,
      r: c.globalRank,
      lanes: [...c.lanes],
      laneRanks: { ...c.laneRanks },
    }));
    expect(after).toEqual(before);
    // The vetoed candidate keeps its rank 1 and both setups for calibration.
    expect(ranked[0]!.globalRank).toBe(1);
    expect(ranked[0]!.lanes).toEqual(["BASE", "MOMENTUM"]);
  });

  it("is a pure re-runnable function: historical inputs are never mutated away", () => {
    const ranked = assignRanks(
      rankCandidates([
        candidate("Fail1", 90, ["BASE"], "FAIL"),
        candidate("Pass1", 10, ["BASE"], "PASS"),
      ]),
    );
    const baseline = selectSurvivorsWithReservations(ranked, 5, reservations, strategy, {
      structuralVeto: false,
    });
    expect(baseline.survivors.map((s) => s.token.contractAddress)).toEqual(["Fail1", "Pass1"]);
    // Re-running with the veto resets stale membership flags from the baseline.
    const real = selectSurvivorsWithReservations(ranked, 5, reservations, strategy);
    expect(real.survivors.map((s) => s.token.contractAddress)).toEqual(["Pass1"]);
    expect(ranked.find((c) => c.token.contractAddress === "Fail1")!.selectedByGlobalRanking).toBe(
      false,
    );
  });

  it("keeps universe exclusions diagnostically distinct from structural ones", () => {
    // USDC: excluded by mandate, long before structural evaluation runs.
    const usdc = classifyUniverse("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(usdc.eligibility).toBe("OUT_OF_SCOPE");
    expect(OUT_OF_SCOPE_REASON).toBe("OUT_OF_SCOPE_ASSET");
    // A structurally vetoed candidate carries no universe rejection at all.
    const ranked = assignRanks(rankCandidates([candidate("Fail1", 90, ["BASE"], "FAIL")]));
    const selection = selectSurvivorsWithReservations(ranked, 5, reservations, strategy);
    expect(selection.structurallyVetoed[0]!.rejection).toBeNull();
  });
});

describe("universe registry maintenance", () => {
  it("classifies newly registered financial primitives as out of mandate", () => {
    const cases: [string, string][] = [
      ["USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", "STABLE_ASSET"],
      ["27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", "RECEIPT_OR_LP"],
      ["mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", "LIQUID_STAKING"],
      ["XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", "TOKENIZED_EQUITY"],
      ["zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg", "WRAPPED_ASSET"],
    ];
    for (const [mint, category] of cases) {
      const result = classifyUniverse(mint);
      expect(result.eligibility).toBe("OUT_OF_SCOPE");
      expect(result.category).toBe(category);
      expect(result.evidence).toBe("exact_mint_registry");
    }
  });

  it("leaves ambiguous assets UNKNOWN rather than guessing", () => {
    // Observed but not unquestionably classifiable: CASH, GOLD, ONe, PRIME, MNT.
    for (const mint of [
      "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH",
      "GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A",
      "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5",
      "3b8X44fLF9ooXaUm3hhSgjpmVs6rZZ3pPoGnGahc3Uu7",
      "4SoQ8UkWfeDH47T56PA53CZCeW4KytYCiU65CwBWoJUt",
    ]) {
      expect(classifyUniverse(mint).eligibility).toBe("UNKNOWN");
    }
  });
});
