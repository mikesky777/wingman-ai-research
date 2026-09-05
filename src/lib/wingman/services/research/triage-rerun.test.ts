/**
 * Repeat-triage protection: the ordinary production action must never spend
 * AI credits twice on the same packet cohort without explicit confirmation.
 */
import { describe, expect, it } from "vitest";
import {
  shouldBlockProductionRerun,
  triageRunAvailability,
} from "./triage-rerun";

const RUN = { id: "3714f533-e83c-4327-b4bd-3222f7e13cae", status: "completed" };

describe("triage run availability", () => {
  it("allows a normal run when the cohort has never been triaged", () => {
    expect(triageRunAvailability(null).kind).toBe("RUN");
    expect(shouldBlockProductionRerun(null, false)).toBe(false);
  });

  it("downgrades to rerun-only once a completed triage exists for the cohort", () => {
    const decision = triageRunAvailability(RUN);
    expect(decision.kind).toBe("RERUN_ONLY");
    expect(shouldBlockProductionRerun(RUN, false)).toBe(true);
  });

  it("lets an explicitly confirmed rerun proceed", () => {
    expect(shouldBlockProductionRerun(RUN, true)).toBe(false);
  });

  it("reports an in-progress run instead of offering a second spend", () => {
    expect(triageRunAvailability({ id: RUN.id, status: "running" }).kind).toBe("IN_PROGRESS");
  });

  it("a failed or ineligible attempt never consumed the cohort", () => {
    for (const status of ["failed", "no_eligible_current_scan", null]) {
      expect(triageRunAvailability({ id: RUN.id, status }).kind).toBe("RUN");
      expect(shouldBlockProductionRerun({ id: RUN.id, status }, false)).toBe(false);
    }
  });
});
