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

/** Outcome of a single Run Scan attempt, as reported by the backend. */
export type RunScanCode = "COMPLETED" | "ALREADY_RUNNING" | "FAILED";

/**
 * Outcome of a client attempt. `NO_ACK` is client-only: the request never came
 * back, so the backend may never have received it at all. The server can never
 * record a click it did not receive, so this state lives purely in the UI.
 */
export type ClientScanAttemptCode = RunScanCode | "NO_ACK";

/**
 * How long the UI waits for backend acknowledgement before it stops claiming a
 * scan is running. Healthy scans complete in ~36–80s; four minutes is far
 * beyond that, and after it the control must become usable again.
 */
export const SCAN_ACK_TIMEOUT_MS = 4 * 60_000;

/** True when a `running` row started long enough ago to be considered dead. */
export function isRunStale(startedAt: string | null, nowMs: number = Date.now()): boolean {
  if (!startedAt) return false;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return false;
  return nowMs - started >= SCAN_STALE_AFTER_MS;
}

export interface ScanAttempt {
  code: ClientScanAttemptCode;
  /** Run this attempt started, when it started one. */
  runId: string | null;
  /** Run already holding the lock, when the attempt was rejected. */
  activeRunId: string | null;
  message: string | null;
}

/**
 * What the header shows. Never derived from an unrelated historical run.
 *
 * UNCONFIRMED means: we do not know that a scan is running. It is deliberately
 * distinct from RUNNING because an unknown state must never disable the
 * control — that is exactly how a click can silently become a no-op.
 */
export type ScanUiState =
  | "IDLE"
  | "STARTING"
  | "RUNNING"
  | "ALREADY_RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "UNCONFIRMED";

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
  /** In-flight request has exceeded {@link SCAN_ACK_TIMEOUT_MS}. */
  pendingTimedOut?: boolean;
}

/**
 * Map attempt + persisted state to UI state.
 *
 * Invariants:
 *   - COMPLETED only when the watched run is persisted as `completed`.
 *   - Missing information never produces RUNNING. An accepted attempt whose
 *     run status is not yet known reads UNCONFIRMED, which keeps the Run scan
 *     control usable instead of freezing it forever.
 */
export function scanUiState(input: ScanUiInput): ScanUiState {
  if (input.pending) return input.pendingTimedOut ? "UNCONFIRMED" : "STARTING";
  const status = (input.watchedRunStatus ?? "").toLowerCase();
  const attempt = input.attempt;
  if (!attempt) return "IDLE";

  if (attempt.code === "NO_ACK") return "UNCONFIRMED";

  if (attempt.code === "ALREADY_RUNNING") {
    // The colliding run may have finished or failed while we watched it.
    if (status === "completed") return "COMPLETED";
    if (status === "failed") return "FAILED";
    if (status === "running") return "ALREADY_RUNNING";
    // Lock gone and no settled status: nothing is confirmably running.
    return "UNCONFIRMED";
  }
  if (attempt.code === "FAILED") return "FAILED";
  // COMPLETED code still requires persisted confirmation.
  if (status === "completed") return "COMPLETED";
  if (status === "failed") return "FAILED";
  if (status === "running") return "RUNNING";
  return "UNCONFIRMED";
}

/**
 * The Run scan control is blocked only while a scan is confirmably running.
 * Unknown state never blocks it.
 */
export function isScanControlBlocked(state: ScanUiState): boolean {
  return state === "STARTING" || state === "RUNNING" || state === "ALREADY_RUNNING";
}

/** Human message for the attempt; failures always keep their reason. */
export function scanStatusMessage(state: ScanUiState, attempt: ScanAttempt | null): string | null {
  if (state === "STARTING") return "Starting new scan…";
  if (!attempt) return null;
  switch (state) {
    case "ALREADY_RUNNING":
      return attempt.activeRunId
        ? `Scan blocked because another run is active (run ${attempt.activeRunId.slice(0, 8)}). Watching it now.`
        : "Scan blocked because another run is active.";
    case "FAILED":
      return attempt.message ?? "Scan failed.";
    case "COMPLETED":
      return attempt.message ?? "Scan completed.";
    case "RUNNING":
      return attempt.runId
        ? `Backend accepted — scan ${attempt.runId.slice(0, 8)} started.`
        : "Backend accepted — scan started.";
    case "UNCONFIRMED":
      return attempt.code === "NO_ACK"
        ? (attempt.message ??
            "Scan request did not start — no acknowledgement from the backend. Press Run scan again.")
        : attempt.runId
          ? `Scan ${attempt.runId.slice(0, 8)} accepted, but its state is not confirmed yet.`
          : "Scan state unconfirmed — no run is confirmably active.";
    default:
      return null;
  }
}

/** Only a run this session watched and confirmed complete may refresh data. */
export function shouldRefreshCandidates(state: ScanUiState): boolean {
  return state === "COMPLETED";
}

/**
 * True when the results on screen are NOT the product of this session's most
 * recent attempt — the attempt failed, was blocked, or never acknowledged.
 */
export function showsPreviousScanResults(
  state: ScanUiState,
  attempt: ScanAttempt | null,
  displayedRunId: string | null,
  watchedRunId: string | null,
): boolean {
  if (!attempt) return false;
  if (state === "FAILED" || state === "UNCONFIRMED" || state === "ALREADY_RUNNING") return true;
  if (state === "COMPLETED") return Boolean(watchedRunId) && watchedRunId !== displayedRunId;
  return false;
}

