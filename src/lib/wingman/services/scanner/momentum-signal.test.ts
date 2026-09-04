/**
 * MOMENTUM is a SIGNAL, never a recognized setup.
 *
 * Recognized setups are BASE and REACCEL. A MOMENTUM-only candidate is
 * SETUP = NONE and competes only through the capped NONE global exception.
 * Momentum's contribution to Quantitative Research Priority is unchanged.
 */
import { describe, expect, it } from "vitest";
import { assignRanks, rankCandidates, selectSurvivorsWithReservations } from "./evaluate";
import { WINGMAN_DEFAULT_SETTINGS, type StrategySettings } from "./config";
import { hasRecognizedSetup, RECOGNIZED_SETUPS, type EvaluatedCandidate, type SetupType } from "./types";
import { quantitativePriority } from "./priority";
import { setupOf, signalsOf, selectionRouteOf, priceStructureOf } from "@/components/wingman/scanner/shared";

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

function select(candidates: EvaluatedCandidate[], limit: number, cap: number) {
  const strategy: StrategySettings = { ...WINGMAN_DEFAULT_SETTINGS, maxNoneGlobalSurvivors: cap };
  const ranked = assignRanks(rankCandidates(candidates));
  return selectSurvivorsWithReservations(ranked, limit, reservations, strategy, {
    structuralVeto: false,
    marketDamageVeto: false,
  });
}

describe("MOMENTUM as a signal, not a setup", () => {
  it("recognized setups are BASE and REACCEL only", () => {
    expect(RECOGNIZED_SETUPS).toEqual(["BASE", "REACCEL"]);
    expect(hasRecognizedSetup(["MOMENTUM"])).toBe(false);
    expect(hasRecognizedSetup(["BASE", "MOMENTUM"])).toBe(true);
  });

  it("a Momentum-only candidate displays SETUP NONE with a MOMENTUM signal", () => {
    const c = candidate("mo", 90, ["MOMENTUM"]);
    expect(setupOf(c)).toBe("NONE");
    expect(signalsOf(c)).toEqual(["MOMENTUM"]);
  });

  it("BASE + Momentum stays SETUP BASE and REACCEL + Momentum stays SETUP REACCEL", () => {
    expect(setupOf(candidate("b", 80, ["BASE", "MOMENTUM"]))).toBe("BASE");
    expect(signalsOf(candidate("b", 80, ["BASE", "MOMENTUM"]))).toEqual(["MOMENTUM"]);
    expect(setupOf(candidate("r", 80, ["REACCEL", "MOMENTUM"]))).toBe("REACCEL");
  });

  it("Momentum-only candidates consume NONE exception capacity", () => {
    const cands = [
      candidate("m1", 99, ["MOMENTUM"]),
      candidate("m2", 98, ["MOMENTUM"]),
      candidate("n1", 97, []),
      candidate("m3", 96, ["MOMENTUM"]),
      candidate("b1", 95, ["BASE"]),
    ];
    const selection = select(cands, 50, 2);
    expect(selection.noneGlobalCount).toBe(2);
    const chosen = selection.survivors.map((s) => s.token.contractAddress);
    expect(chosen).toContain("m1");
    expect(chosen).toContain("m2");
    expect(chosen).not.toContain("n1");
    expect(chosen).not.toContain("m3");
    // A recognized setup is never blocked by the NONE cap.
    expect(chosen).toContain("b1");
    expect(selection.noneSkippedByCap.map((s) => s.token.contractAddress)).toEqual(["n1", "m3"]);
  });

  it("labels the Momentum-only global route as a NONE exception", () => {
    const selection = select([candidate("m1", 90, ["MOMENTUM"]), candidate("b1", 80, ["BASE"])], 50, 5);
    const [m1] = selection.survivors.filter((s) => s.token.contractAddress === "m1");
    const [b1] = selection.survivors.filter((s) => s.token.contractAddress === "b1");
    expect(selectionRouteOf(m1 as never)).toBe("NONE EXCEPTION");
    expect(selectionRouteOf(b1 as never)).toBe("BASE RESERVATION");
  });

  it("Momentum still contributes exactly as before to Priority", () => {
    const token = {
      contractAddress: "x",
      chain: "solana",
      symbol: "X",
      name: "X",
      marketCap: 100_000,
      liquidityUsd: 25_000,
      volume24h: 150_000,
      priceChange1h: 50,
      holderCount: 1000,
    } as never;
    const metrics = {
      age: { minutes: 10, basis: "provider_listing" },
      baselineAcceleration: 24,
      shortAcceleration: 5,
      liquidityToMarketCap: 0.25,
      volumeToMarketCap24h: 1.5,
      minutesSinceLastTrade: 0.4,
    } as never;
    const signals = {
      activityState: "EXTREME",
      persistenceSignal: "UNKNOWN",
      reaccelerationSignal: "EXTREME",
      extensionRisk: "MODERATE",
      attentionPriceDivergence: "POSITIVE",
    } as never;

    const withMomentumLane = quantitativePriority(token, metrics, signals, ["MOMENTUM"]);
    expect(withMomentumLane.components.momentum.weight).toBe(3);
    expect(withMomentumLane.components.momentum.points).toBe(3);
    // Component points plus adjustments reconstruct the stored total exactly.
    const sum = Object.values(withMomentumLane.components).reduce((a, c) => a + c.points, 0);
    expect(Number(sum.toFixed(3))).toBeCloseTo(withMomentumLane.raw, 2);
    expect(withMomentumLane.total).toBe(
      Math.round(
        withMomentumLane.raw + withMomentumLane.extensionPenalty + withMomentumLane.divergenceAdjustment,
      ),
    );
  });

  it("Price Structure is independent of setup, signals and selection", () => {
    const c = candidate("m1", 90, ["MOMENTUM"]);
    const notEvaluated = { ...c, priceIntegrityStatus: null, priceIntegrityPolicyVersion: null } as never;
    const unknown = {
      ...c,
      priceIntegrityStatus: null,
      priceIntegrityPolicyVersion: "price_integrity/v1.1",
    } as never;
    expect(priceStructureOf(notEvaluated)).toBe("NOT_EVALUATED");
    expect(priceStructureOf(unknown)).toBe("UNKNOWN");
    // Neither state changes setup or selection.
    expect(setupOf(notEvaluated)).toBe("NONE");
    const selection = select([c], 50, 5);
    expect(selection.survivors).toHaveLength(1);
  });
});
