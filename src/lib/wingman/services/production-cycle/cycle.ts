/**
 * production_cycle/v1 — pure orchestration semantics.
 *
 * The orchestrator only advances ELIGIBLE work. It never manufactures a
 * downstream milestone: Thesis Synthesis does not imply a Thesis Call, a
 * Thesis Call is minted solely by the existing production Opportunity gates,
 * Entry runs only for canonical production Thesis Calls, and Entry never
 * forces a Live Call. The cycle stops after Entry Timing — no Sizing, no
 * execution.
 */

export const PRODUCTION_CYCLE_VERSION = "production_cycle/v1";

/** Cycle-level states, in progression order. */
export const CYCLE_STAGES = [
  "STARTING",
  "SCANNING",
  "GENERATING_PACKETS",
  "TRIAGING",
  "APPLYING_SPEND_CONTROL",
  "DEEP_RESEARCH",
  "THESIS_SYNTHESIS",
  "THESIS_QUALIFICATION",
  "ENTRY_TIMING",
  "COMPLETE",
  "FAILED",
] as const;

export type CycleStage = (typeof CYCLE_STAGES)[number];

export type CycleCompletionCode =
  | "COMPLETE"
  | "NO_ENTRY_ELIGIBLE_THESIS_CALLS"
  | "NO_THESIS_CANDIDATES";

export function isTerminalStage(stage: CycleStage): boolean {
  return stage === "COMPLETE" || stage === "FAILED";
}

export function isActiveStage(stage: CycleStage): boolean {
  return !isTerminalStage(stage);
}

/** Next stage in the canonical sequence. Terminal stages never advance. */
export function nextStage(stage: CycleStage): CycleStage {
  if (isTerminalStage(stage)) return stage;
  const index = CYCLE_STAGES.indexOf(stage);
  return CYCLE_STAGES[index + 1] as CycleStage;
}

export interface CycleCounts {
  packetCount: number;
  triageDeepCount: number;
  thesisSynthesizedCount: number;
  thesisCallCount: number;
  entryEligibleCount: number;
  entryEvaluatedCount: number;
}

/**
 * Entry eligibility is derived from ACTUAL canonical Thesis Calls, never from
 * synthesized thesis artifacts.
 */
export function entryEligibleMints(options: {
  cohortCallMints: string[];
  activelyMonitoredMints: string[];
}): string[] {
  const monitored = new Set(options.activelyMonitoredMints);
  return [...new Set(options.cohortCallMints)].filter((mint) => monitored.has(mint));
}

/** Zero Thesis Calls is a successful completion, never a failure. */
export function completionCode(counts: Pick<CycleCounts, "thesisCallCount" | "entryEligibleCount" | "thesisSynthesizedCount">): CycleCompletionCode {
  if (counts.thesisCallCount === 0 || counts.entryEligibleCount === 0) {
    return counts.thesisSynthesizedCount === 0
      ? "NO_THESIS_CANDIDATES"
      : "NO_ENTRY_ELIGIBLE_THESIS_CALLS";
  }
  return "COMPLETE";
}

export function completionMessage(code: CycleCompletionCode): string {
  switch (code) {
    case "NO_ENTRY_ELIGIBLE_THESIS_CALLS":
      return "No entry-eligible thesis calls";
    case "NO_THESIS_CANDIDATES":
      return "No thesis candidates in this cohort";
    default:
      return "Complete";
  }
}

/** A lease is stale once its expiry has passed; a dead worker never blocks. */
export function isLeaseHeld(
  lease: { owner: string | null; expiresAt: string | null },
  nowMs: number,
): boolean {
  if (!lease.owner || !lease.expiresAt) return false;
  return new Date(lease.expiresAt).getTime() > nowMs;
}

export const CYCLE_LEASE_MS = 15 * 60 * 1000;

/** A backend pass is considered dead after this long without a tick. */
export const CYCLE_STALL_MS = 10 * 60 * 1000;

export interface CycleLeaseSnapshot {
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastTickAt: string | null;
  startedAt: string | null;
}

/**
 * True only when normal backend progression appears dead: no live lease AND no
 * recent tick. A healthy in-flight cycle is never touched by the watchdog.
 */
export function isCycleStalled(snapshot: CycleLeaseSnapshot, nowMs: number): boolean {
  const leaseAlive = isLeaseHeld(
    { owner: snapshot.leaseOwner, expiresAt: snapshot.leaseExpiresAt },
    nowMs,
  );
  if (leaseAlive) return false;
  const lastProgressAt = snapshot.lastTickAt ?? snapshot.startedAt;
  if (!lastProgressAt) return true;
  return nowMs - new Date(lastProgressAt).getTime() > CYCLE_STALL_MS;
}
