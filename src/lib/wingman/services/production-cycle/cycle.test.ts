import { describe, expect, it } from "vitest";
import type { CycleStage } from "./cycle";
import {
  CYCLE_STAGES,
  completionCode,
  entryEligibleMints,
  isLeaseHeld,
  isTerminalStage,
  nextStage,
} from "./cycle";

describe("production_cycle/v1 stage progression", () => {
  it("advances through the canonical sequence and stops after Entry", () => {
    const seen: string[] = [];
    let stage: CycleStage = CYCLE_STAGES[0];
    for (let i = 0; i < 20 && !isTerminalStage(stage); i += 1) {
      seen.push(stage);
      stage = nextStage(stage);
    }
    expect(seen).toEqual([
      "STARTING",
      "SCANNING",
      "GENERATING_PACKETS",
      "TRIAGING",
      "APPLYING_SPEND_CONTROL",
      "DEEP_RESEARCH",
      "THESIS_SYNTHESIS",
      "THESIS_QUALIFICATION",
      "ENTRY_TIMING",
    ]);
    expect(stage).toBe("COMPLETE");
    // No sizing / execution stage exists at all.
    expect(CYCLE_STAGES as readonly string[]).not.toContain("SIZING");
  });

  it("never advances past a terminal stage", () => {
    expect(nextStage("COMPLETE")).toBe("COMPLETE");
    expect(nextStage("FAILED")).toBe("FAILED");
  });
});

describe("entry eligibility", () => {
  it("only evaluates actual cohort thesis calls under active monitoring", () => {
    expect(
      entryEligibleMints({
        cohortCallMints: ["A", "B", "C"],
        activelyMonitoredMints: ["B", "C", "Z"],
      }),
    ).toEqual(["B", "C"]);
  });

  it("returns nothing when the cohort synthesized theses but minted no calls", () => {
    expect(
      entryEligibleMints({ cohortCallMints: [], activelyMonitoredMints: ["A", "B"] }),
    ).toEqual([]);
  });

  it("deduplicates exact mints", () => {
    expect(
      entryEligibleMints({ cohortCallMints: ["A", "A"], activelyMonitoredMints: ["A"] }),
    ).toEqual(["A"]);
  });
});

describe("completion semantics", () => {
  it("zero thesis calls completes successfully", () => {
    expect(
      completionCode({ thesisCallCount: 0, thesisSynthesizedCount: 12, entryEligibleCount: 0 }),
    ).toBe("NO_ENTRY_ELIGIBLE_THESIS_CALLS");
  });

  it("zero synthesized theses is reported honestly", () => {
    expect(
      completionCode({ thesisCallCount: 0, thesisSynthesizedCount: 0, entryEligibleCount: 0 }),
    ).toBe("NO_THESIS_CANDIDATES");
  });

  it("evaluated calls complete normally", () => {
    expect(
      completionCode({ thesisCallCount: 2, thesisSynthesizedCount: 9, entryEligibleCount: 2 }),
    ).toBe("COMPLETE");
  });
});

describe("lease", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  it("blocks a second worker while held", () => {
    expect(isLeaseHeld({ owner: "w1", expiresAt: "2026-01-01T00:10:00.000Z" }, now)).toBe(true);
  });
  it("expires so a dead worker never blocks recovery", () => {
    expect(isLeaseHeld({ owner: "w1", expiresAt: "2025-12-31T23:50:00.000Z" }, now)).toBe(false);
    expect(isLeaseHeld({ owner: null, expiresAt: null }, now)).toBe(false);
  });
});
