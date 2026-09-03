import { describe, expect, it } from "vitest";
import { REFRESH_CONFIG, deriveRefreshState } from "./refresh";
import { deriveRecurrence, type RecurrenceAppearance } from "./recurrence";

const NOW = "2026-09-03T12:00:00.000Z";
const minutesAgo = (m: number) => new Date(Date.parse(NOW) - m * 60000).toISOString();

describe("refresh state", () => {
  it("marks an unchanged REPEAT with fresh evidence as CARRY_FORWARD", () => {
    const decision = deriveRefreshState({
      recurrenceState: "REPEAT",
      lastEnrichedAt: minutesAgo(10),
      nowIso: NOW,
    });
    expect(decision.state).toBe("CARRY_FORWARD");
    expect(decision.carriedForward).toBe(true);
    expect(decision.evidenceAgeMinutes).toBeCloseTo(10);
  });

  it.each(["NEW", "CHANGED", "RETURNING"] as const)("forces refresh for %s", (state) => {
    const decision = deriveRefreshState({
      recurrenceState: state,
      lastEnrichedAt: minutesAgo(1),
      nowIso: NOW,
    });
    expect(decision.state).toBe("REFRESH_REQUIRED");
    expect(decision.carriedForward).toBe(false);
  });

  it("forces refresh when prior evidence is stale", () => {
    const decision = deriveRefreshState({
      recurrenceState: "REPEAT",
      lastEnrichedAt: minutesAgo(REFRESH_CONFIG.maxEvidenceAgeMinutes + 5),
      nowIso: NOW,
    });
    expect(decision.state).toBe("REFRESH_REQUIRED");
  });

  it("forces refresh when no prior enrichment exists", () => {
    expect(
      deriveRefreshState({ recurrenceState: "REPEAT", lastEnrichedAt: null, nowIso: NOW }).state,
    ).toBe("REFRESH_REQUIRED");
  });

  it("marks approaching staleness as REFRESH_OPTIONAL", () => {
    const decision = deriveRefreshState({
      recurrenceState: "REPEAT",
      lastEnrichedAt: minutesAgo(REFRESH_CONFIG.optionalEvidenceAgeMinutes + 5),
      nowIso: NOW,
    });
    expect(decision.state).toBe("REFRESH_OPTIONAL");
    expect(decision.carriedForward).toBe(false);
  });

  it("preserves the original evidence timestamp when carrying forward", () => {
    const captured = minutesAgo(20);
    const decision = deriveRefreshState({
      recurrenceState: "REPEAT",
      lastEnrichedAt: captured,
      nowIso: NOW,
    });
    // The reused observation is referenced, never rewritten or duplicated.
    expect(decision.lastEnrichedAt).toBe(captured);
    expect(decision.evidenceAgeMinutes).toBeCloseTo(20);
  });

  it("is deterministic", () => {
    const input = {
      recurrenceState: "REPEAT" as const,
      lastEnrichedAt: minutesAgo(30),
      nowIso: NOW,
    };
    expect(deriveRefreshState(input)).toEqual(deriveRefreshState(input));
  });
});

describe("carry-forward invariants", () => {
  const appearance = (over: Partial<RecurrenceAppearance> = {}): RecurrenceAppearance => ({
    runId: "run-1",
    runAt: minutesAgo(20),
    setups: ["BASE"],
    quantitativePriority: 60,
    activityState: "ACTIVE",
    persistenceSignal: "HIGH",
    reaccelerationSignal: "NONE",
    selectedAsSurvivor: true,
    ...over,
  });

  const current = {
    setups: ["BASE"],
    quantitativePriority: 60,
    activityState: "ACTIVE",
    persistenceSignal: "HIGH",
    reaccelerationSignal: "NONE",
  };

  it("does not modify priority or setup classification", () => {
    const recurrence = deriveRecurrence({
      current,
      appearances: [appearance()],
      recentRunIds: ["run-1"],
    });
    expect(recurrence.state).toBe("REPEAT");
    const decision = deriveRefreshState({
      recurrenceState: recurrence.state,
      lastEnrichedAt: minutesAgo(20),
      nowIso: NOW,
    });
    expect(decision.state).toBe("CARRY_FORWARD");
    // Nothing in the decision can express a priority or setup change.
    expect(current.quantitativePriority).toBe(60);
    expect(current.setups).toEqual(["BASE"]);
    expect(recurrence.currentSetups).toEqual(["BASE"]);
    expect(recurrence.setupChanged).toBe(false);
  });

  it("keeps a repeated BASE candidate eligible as a survivor", () => {
    const recurrence = deriveRecurrence({
      current,
      appearances: [appearance(), appearance({ runId: "run-2", runAt: minutesAgo(40) })],
      recentRunIds: ["run-1", "run-2"],
    });
    expect(recurrence.previousSelectedAsSurvivor).toBe(true);
    expect(recurrence.currentSetups).toContain("BASE");
    // Refresh urgency governs provider spend only.
    expect(
      deriveRefreshState({
        recurrenceState: recurrence.state,
        lastEnrichedAt: minutesAgo(5),
        nowIso: NOW,
      }).state,
    ).toBe("CARRY_FORWARD");
  });

  it("reads history without mutating it", () => {
    const history = [appearance()];
    const snapshot = JSON.parse(JSON.stringify(history));
    deriveRecurrence({ current, appearances: history, recentRunIds: ["run-1"] });
    expect(history).toEqual(snapshot);
  });
});
