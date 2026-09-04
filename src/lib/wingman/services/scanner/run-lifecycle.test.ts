/**
 * Scan run lifecycle tests — the UI may only claim COMPLETED when a watched
 * run is persisted as completed.
 */
import { describe, expect, it } from "vitest";
import {
  ABANDONED_RUN_REASON,
  SCAN_STALE_AFTER_MS,
  isRunStale,
  scanStatusMessage,
  scanUiState,
  shouldRefreshCandidates,
  type ScanAttempt,
} from "./run-lifecycle";

const NOW = Date.parse("2026-09-04T01:00:00.000Z");
const RUN = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const started: ScanAttempt = { code: "COMPLETED", runId: RUN, activeRunId: null, message: "done" };
const rejected: ScanAttempt = {
  code: "ALREADY_RUNNING",
  runId: null,
  activeRunId: OTHER,
  message: "A scan is already running.",
};
const failed: ScanAttempt = {
  code: "FAILED",
  runId: RUN,
  activeRunId: null,
  message: "Birdeye discovery failed",
};

describe("scan ui state", () => {
  it("idles before any attempt, even with completed history", () => {
    expect(scanUiState({ pending: false, attempt: null, watchedRunStatus: "completed" })).toBe(
      "IDLE",
    );
  });

  it("fresh scan: RUNNING then COMPLETED once persisted", () => {
    expect(scanUiState({ pending: true, attempt: null, watchedRunStatus: null })).toBe("RUNNING");
    // POST resolved but the row has not been read back yet.
    expect(scanUiState({ pending: false, attempt: started, watchedRunStatus: null })).toBe(
      "RUNNING",
    );
    expect(scanUiState({ pending: false, attempt: started, watchedRunStatus: "completed" })).toBe(
      "COMPLETED",
    );
  });

  it("ALREADY_RUNNING never shows completed while the active run is open", () => {
    for (const status of [null, "running"]) {
      const state = scanUiState({ pending: false, attempt: rejected, watchedRunStatus: status });
      expect(state).toBe("ALREADY_RUNNING");
      expect(state).not.toBe("COMPLETED");
      expect(shouldRefreshCandidates(state)).toBe(false);
    }
    expect(scanStatusMessage("ALREADY_RUNNING", rejected)).toContain("already running");
  });

  it("a completed historical run cannot stand in for the current attempt", () => {
    // The rejected attempt watches the ACTIVE run only; historical completion
    // is not part of this input at all.
    const state = scanUiState({ pending: false, attempt: rejected, watchedRunStatus: "running" });
    expect(state).toBe("ALREADY_RUNNING");
  });

  it("a failed scan shows FAILED with its reason and never COMPLETED", () => {
    const state = scanUiState({ pending: false, attempt: failed, watchedRunStatus: "failed" });
    expect(state).toBe("FAILED");
    expect(scanStatusMessage(state, failed)).toBe("Birdeye discovery failed");
    expect(shouldRefreshCandidates(state)).toBe(false);
  });

  it("a persisted failure overrides an optimistic completed code", () => {
    expect(scanUiState({ pending: false, attempt: started, watchedRunStatus: "failed" })).toBe(
      "FAILED",
    );
  });

  it("only a confirmed completed run refreshes candidate data", () => {
    expect(shouldRefreshCandidates("COMPLETED")).toBe(true);
    for (const s of ["IDLE", "RUNNING", "ALREADY_RUNNING", "FAILED"] as const) {
      expect(shouldRefreshCandidates(s)).toBe(false);
    }
  });
});

describe("stale run reclamation", () => {
  it("leaves a healthy in-flight run alone", () => {
    const startedAt = new Date(NOW - 60_000).toISOString();
    expect(isRunStale(startedAt, NOW)).toBe(false);
  });

  it("treats an abandoned run past the threshold as stale", () => {
    const startedAt = new Date(NOW - SCAN_STALE_AFTER_MS - 1).toISOString();
    expect(isRunStale(startedAt, NOW)).toBe(true);
  });

  it("uses a threshold far above any observed healthy scan duration", () => {
    // Slowest observed completed run: ~80s.
    expect(SCAN_STALE_AFTER_MS).toBeGreaterThan(80_000 * 4);
    expect(ABANDONED_RUN_REASON).toBe("ABANDONED_STALE_RUN");
  });

  it("never treats a missing or unparseable start time as stale", () => {
    expect(isRunStale(null, NOW)).toBe(false);
    expect(isRunStale("not-a-date", NOW)).toBe(false);
  });

  it("after reclamation a new scan can start (state returns to a startable IDLE)", () => {
    // Reclaimed run is failed; a fresh attempt is then a normal fresh scan.
    expect(scanUiState({ pending: false, attempt: null, watchedRunStatus: "failed" })).toBe("IDLE");
    expect(scanUiState({ pending: true, attempt: null, watchedRunStatus: null })).toBe("RUNNING");
  });
});
