/**
 * SETUP = NONE global exception cap.
 *
 * The survivor limit is a MAXIMUM, never a target. Recognized setups keep every
 * opportunity they had; NONE candidates enter only through the global route and
 * only while the configured exception capacity remains.
 */
import { describe, expect, it } from "vitest";
import { assignRanks, rankCandidates, selectSurvivorsWithReservations } from "./evaluate";
import { WINGMAN_DEFAULT_SETTINGS, normalizeStrategySettings, type StrategySettings } from "./config";
import type { EvaluatedCandidate, SetupType } from "./types";

function candidate(address: string, priority: number, lanes: SetupType[]): EvaluatedCandidate {
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
    structural: null,
  } as unknown as EvaluatedCandidate;
}

const reservations = { BASE: 2, REACCEL: 2, MOMENTUM: 0 } as Record<SetupType, number>;

function withCap(cap: number): StrategySettings {
  return { ...WINGMAN_DEFAULT_SETTINGS, maxNoneGlobalSurvivors: cap };
}

function select(candidates: EvaluatedCandidate[], limit: number, strategy: StrategySettings) {
  const ranked = assignRanks(rankCandidates(candidates));
  return {
    ranked,
    selection: selectSurvivorsWithReservations(ranked, limit, reservations, strategy, {
      structuralVeto: false,
      marketDamageVeto: false,
    }),
  };
}

describe("SETUP = NONE global exception cap", () => {
  it("defaults to 5 and survives normalization", () => {
    expect(WINGMAN_DEFAULT_SETTINGS.maxNoneGlobalSurvivors).toBe(5);
    expect(normalizeStrategySettings({}).maxNoneGlobalSurvivors).toBe(5);
    expect(normalizeStrategySettings({ maxNoneGlobalSurvivors: 2 }).maxNoneGlobalSurvivors).toBe(2);
  });

  it("never admits more NONE survivors than the cap", () => {
    const nones = Array.from({ length: 12 }, (_, i) => candidate(`None${i}`, 100 - i, []));
    const { selection } = select(nones, 50, withCap(3));
    expect(selection.noneGlobalCount).toBe(3);
    expect(selection.survivors).toHaveLength(3);
    expect(selection.noneSkippedByCap).toHaveLength(9);
    expect(selection.survivors.map((s) => s.token.contractAddress)).toEqual([
      "None0",
      "None1",
      "None2",
    ]);
  });

  it("allows the final pool to be far below the limit rather than padding it", () => {
    const pool = [
      candidate("Base1", 90, ["BASE"]),
      ...Array.from({ length: 30 }, (_, i) => candidate(`None${i}`, 50 - i, [])),
    ];
    const { selection } = select(pool, 50, withCap(5));
    expect(selection.survivors).toHaveLength(6);
    expect(selection.unusedCapacity).toBe(44);
    expect(selection.maxNoneGlobalSurvivors).toBe(5);
  });

  it("leaves BASE/REACCEL reservation behavior unchanged", () => {
    const pool = [
      candidate("None0", 100, []),
      candidate("Base1", 90, ["BASE"]),
      candidate("Base2", 80, ["BASE"]),
      candidate("Reaccel1", 70, ["REACCEL"]),
      candidate("Reaccel2", 60, ["REACCEL"]),
    ];
    const { selection } = select(pool, 50, withCap(5));
    expect(selection.laneUsage["BASE"]).toBe(2);
    expect(selection.laneUsage["REACCEL"]).toBe(2);
    expect(selection.reservedCount).toBe(4);
  });

  it("does not constrain recognized-setup candidates arriving through the global pool", () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => candidate(`Base${i}`, 100 - i, ["BASE"])),
      ...Array.from({ length: 8 }, (_, i) => candidate(`None${i}`, 50 - i, [])),
    ];
    const { selection } = select(pool, 50, withCap(1));
    // 2 BASE via reservation + 6 BASE via global, uncapped.
    expect(selection.survivors.filter((s) => s.lanes.includes("BASE"))).toHaveLength(8);
    expect(selection.recognizedGlobalCount).toBe(6);
    expect(selection.noneGlobalCount).toBe(1);
  });

  it("keeps skipped NONE candidates unselected, so they never establish First Call", () => {
    const pool = [candidate("None0", 90, []), candidate("None1", 80, [])];
    const { ranked, selection } = select(pool, 50, withCap(1));
    const skipped = ranked.find((c) => c.token.contractAddress === "None1")!;
    expect(skipped.selectedByGlobalRanking).toBe(false);
    expect(skipped.selectedByLaneReservation).toBe(false);
    // Still fully present in the ranked/persisted pool for Calibration review.
    expect(skipped.passedHardFilters).toBe(true);
    expect(skipped.quantitativePriority).toBe(80);
    expect(selection.noneSkippedByCap.map((c) => c.token.contractAddress)).toEqual(["None1"]);
  });

  it("does not alter priority or setup classification", () => {
    const pool = [candidate("None0", 90, []), candidate("Base1", 70, ["BASE"])];
    const { ranked } = select(pool, 50, withCap(0));
    expect(ranked.map((c) => c.quantitativePriority)).toEqual([90, 70]);
    expect(ranked.map((c) => c.lanes)).toEqual([[], ["BASE"]]);
  });

  it("a cap of zero admits no NONE survivors at all", () => {
    const pool = [candidate("None0", 90, []), candidate("Base1", 70, ["BASE"])];
    const { selection } = select(pool, 50, withCap(0));
    expect(selection.survivors.map((s) => s.token.contractAddress)).toEqual(["Base1"]);
    expect(selection.noneGlobalCount).toBe(0);
  });
});
