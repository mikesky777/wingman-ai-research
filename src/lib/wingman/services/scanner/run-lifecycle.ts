/**
 * Scan run lifecycle — pure, shared by server and UI.
 *
 * One source of truth for:
 *   - what "stale" means for a `running` scan row
 *   - the machine-readable outcome codes a Run Scan attempt can produce
 *   - how a Run Scan attempt plus the persisted run state maps to UI state
 *
 * Nothing here touches scoring, selection, providers, recurrence, outcomes or
 * candidate logic. It only governs run bookkeeping and how it is displayed.
 */

/**
 * A run older than this with no completion is treated as abandoned (the worker
 * died mid-scan). Normal completed scans average ~36s and the slowest observed
 * run took ~80s, so 10 minutes is far beyond any healthy scan while still
 * guaranteeing a dead run can never hold the lock for long.
 */
export const SCAN_STALE_AFTER_MS = 10 * 60_000;

/** Machine-readable reason stored on a reclaimed run. */
export const ABANDONED_RUN_REASON = "ABANDONED_STALE_RUN";

/** Outcome of a single Run Scan attempt. */
export type RunScanCode = "COMPLETED" | "ALREADY_RUNNING" | "FAILED";

/** True when a `running` row started long enough ago to be considered dead. */
export function isRunStale(startedAt: string | null, nowMs: number = Date.now()): boolean {
  if (!startedAt) return false;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return false;
  return nowMs - started >= SCAN_STALE_AFTER_MS;
}

export interface ScanAttempt {
  code: RunScanCode;
  /** Run this attempt started, when it started one. */
  runId: string | null;
  /** Run already holding the lock, when the attempt was rejected. */
  activeRunId: string | null;
  message: string | null;
}

/** What the header shows. Never derived from an unrelated historical run. */
export type ScanUiState = "IDLE" | "RUNNING" | "ALREADY_RUNNING" | "COMPLETED" | "FAILED";

export interface ScanUiInput {
  /** The request is still in flight. */
  pending: boolean;
  /** Result of the most recent attempt in this session, if any. */
  attempt: ScanAttempt | null;
  /**
   * Persisted status of the run this session is watching — the run the attempt
   * started, or the active run it collided with. Never the latest historical
   * run.
   */
  watchedRunStatus: string | null;
}

/**
 * Map attempt + persisted state to UI state.
 *
 * The critical invariant: COMPLETED is only ever returned when the watched run
 * is persisted as `completed`. A resolved POST, an ALREADY_RUNNING rejection,
 * or an unrelated historical completed run can never produce COMPLETED.
 */
export function scanUiState(input: ScanUiInput): ScanUiState {
  if (input.pending) return "RUNNING";
  const status = (input.watchedRunStatus ?? "").toLowerCase();
  const attempt = input.attempt;
  if (!attempt) return "IDLE";

  if (attempt.code === "ALREADY_RUNNING") {
    // The colliding run may have finished or failed while we watched it.
    if (status === "completed") return "COMPLETED";
    if (status === "failed") return "FAILED";
    return "ALREADY_RUNNING";
  }
  if (attempt.code === "FAILED") return "FAILED";
  // COMPLETED code still requires persisted confirmation.
  if (status === "completed") return "COMPLETED";
  if (status === "failed") return "FAILED";
  return "RUNNING";
}

/** Human message for the attempt; failures always keep their reason. */
export function scanStatusMessage(state: ScanUiState, attempt: ScanAttempt | null): string | null {
  if (!attempt) return null;
  switch (state) {
    case "ALREADY_RUNNING":
      return attempt.activeRunId
        ? `A scan is already running (run ${attempt.activeRunId.slice(0, 8)}). Watching it now.`
        : "A scan is already running.";
    case "FAILED":
      return attempt.message ?? "Scan failed.";
    case "COMPLETED":
      return attempt.message ?? "Scan complete.";
    case "RUNNING":
      return "Scan running…";
    default:
      return null;
  }
}

/** Only a run this session watched and confirmed complete may refresh data. */
export function shouldRefreshCandidates(state: ScanUiState): boolean {
  return state === "COMPLETED";
}
