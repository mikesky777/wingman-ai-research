/**
 * Scan recurrence awareness (pure, deterministic).
 *
 * Answers one question for every candidate in a new scan: has Wingman seen
 * this token before, and did anything scanner-level actually change?
 *
 * Hard rules for this iteration:
 *   - recurrence is DESCRIPTIVE ONLY. It never touches quantitative priority,
 *     hard filters, setup qualification or survivor selection.
 *   - "first seen" means first observed by the Wingman Scanner, never token
 *     creation time.
 *   - historical scans are read, never rewritten.
 *
 * Structure is deliberately forward-compatible: a later iteration can build
 * "new/changed only" selection, enrichment cooldowns, priority trends and
 * persistent-BASE detection on top of these fields without changing them.
 */

export type RecurrenceState = "NEW" | "REPEAT" | "CHANGED" | "RETURNING";

/** Centralized, configurable definition of "meaningful" and "absent". */
export interface RecurrenceConfig {
  /** Absolute quantitative-priority movement treated as meaningful. */
  priorityDeltaThreshold: number;
  /** Completed scans a token must be absent from before it is RETURNING. */
  returningGapScans: number;
  /** Completed runs looked back over when deriving recurrence. */
  historyRunLookback: number;
  /** Signal states compared for "meaningful state change". No new signals. */
  trackedSignals: readonly ("activityState" | "persistenceSignal" | "reaccelerationSignal")[];
}

export const RECURRENCE_CONFIG: RecurrenceConfig = {
  priorityDeltaThreshold: 8,
  returningGapScans: 2,
  historyRunLookback: 25,
  trackedSignals: ["activityState", "persistenceSignal", "reaccelerationSignal"],
};

/** One prior appearance of a token in a completed Wingman scan. */
export interface RecurrenceAppearance {
  runId: string;
  /** Completion time of that run (start time when it never completed). */
  runAt: string;
  setups: string[];
  quantitativePriority: number | null;
  activityState: string | null;
  persistenceSignal: string | null;
  reaccelerationSignal: string | null;
  selectedAsSurvivor: boolean;
}

/** The token's state in the run being evaluated right now. */
export interface RecurrenceCurrent {
  setups: string[];
  quantitativePriority: number | null;
  activityState: string | null;
  persistenceSignal: string | null;
  reaccelerationSignal: string | null;
}

export interface RecurrenceInfo {
  state: RecurrenceState;
  firstSeenScanAt: string | null;
  previousSeenScanAt: string | null;
  /** Total scans this token has appeared in, including the current one. */
  scansSeenCount: number;
  /** Trailing run streak including the current run. */
  consecutiveScansSeen: number;
  previousQuantitativePriority: number | null;
  priorityDelta: number | null;
  previousSetups: string[];
  currentSetups: string[];
  setupChanged: boolean;
  previousSelectedAsSurvivor: boolean;
  lastSelectedAsSurvivorAt: string | null;
  /** Completed scans missed between the previous appearance and this run. */
  missedScans: number;
  /** Why the state is CHANGED. Empty otherwise. Never fabricated. */
  changeReasons: string[];
}

export const EMPTY_RECURRENCE: RecurrenceInfo = {
  state: "NEW",
  firstSeenScanAt: null,
  previousSeenScanAt: null,
  scansSeenCount: 1,
  consecutiveScansSeen: 1,
  previousQuantitativePriority: null,
  priorityDelta: null,
  previousSetups: [],
  currentSetups: [],
  setupChanged: false,
  previousSelectedAsSurvivor: false,
  lastSelectedAsSurvivorAt: null,
  missedScans: 0,
  changeReasons: [],
};

const sortedSetups = (setups: string[]) => [...new Set(setups)].sort();

function setupsDiffer(previous: string[], current: string[]): boolean {
  const a = sortedSetups(previous);
  const b = sortedSetups(current);
  return a.length !== b.length || a.some((v, i) => v !== b[i]);
}

export interface DeriveRecurrenceInput {
  current: RecurrenceCurrent;
  /** Prior appearances of this token, any order. Current run excluded. */
  appearances: RecurrenceAppearance[];
  /** Completed run ids BEFORE the current run, newest → oldest. */
  recentRunIds: string[];
  config?: RecurrenceConfig;
}

/**
 * Deterministic: identical inputs always produce an identical record. No
 * clock reads, no randomness, no provider calls.
 */
export function deriveRecurrence(input: DeriveRecurrenceInput): RecurrenceInfo {
  const config = input.config ?? RECURRENCE_CONFIG;
  const currentSetups = sortedSetups(input.current.setups);

  const appearances = [...input.appearances].sort((a, b) => {
    const diff = Date.parse(a.runAt) - Date.parse(b.runAt);
    return diff !== 0 ? diff : a.runId.localeCompare(b.runId);
  });

  if (appearances.length === 0) {
    return { ...EMPTY_RECURRENCE, currentSetups };
  }

  const first = appearances[0]!;
  const previous = appearances[appearances.length - 1]!;

  // Trailing streak: walk backwards through completed runs from the newest.
  const seenRuns = new Set(appearances.map((a) => a.runId));
  let consecutive = 1; // the current run
  for (const runId of input.recentRunIds) {
    if (!seenRuns.has(runId)) break;
    consecutive += 1;
  }

  // Absence gap: how many completed runs happened after the last appearance.
  const gapIndex = input.recentRunIds.indexOf(previous.runId);
  const missedScans = gapIndex === -1 ? input.recentRunIds.length : gapIndex;

  const priorityDelta =
    input.current.quantitativePriority !== null && previous.quantitativePriority !== null
      ? input.current.quantitativePriority - previous.quantitativePriority
      : null;

  const setupChanged = setupsDiffer(previous.setups, currentSetups);

  const changeReasons: string[] = [];
  if (setupChanged) {
    changeReasons.push(
      `Setups ${previous.setups.length ? sortedSetups(previous.setups).join("+") : "NONE"} → ${
        currentSetups.length ? currentSetups.join("+") : "NONE"
      }`,
    );
  }
  if (priorityDelta !== null && Math.abs(priorityDelta) >= config.priorityDeltaThreshold) {
    changeReasons.push(
      `Priority ${previous.quantitativePriority} → ${input.current.quantitativePriority}`,
    );
  }
  for (const key of config.trackedSignals) {
    const before = previous[key];
    const now = input.current[key];
    if (before !== null && now !== null && before !== now) {
      changeReasons.push(`${key} ${before} → ${now}`);
    }
  }

  const survivorAppearances = appearances.filter((a) => a.selectedAsSurvivor);
  const lastSurvivor = survivorAppearances[survivorAppearances.length - 1] ?? null;

  const state: RecurrenceState =
    missedScans >= config.returningGapScans
      ? "RETURNING"
      : changeReasons.length > 0
        ? "CHANGED"
        : "REPEAT";

  return {
    state,
    firstSeenScanAt: first.runAt,
    previousSeenScanAt: previous.runAt,
    scansSeenCount: appearances.length + 1,
    consecutiveScansSeen: consecutive,
    previousQuantitativePriority: previous.quantitativePriority,
    priorityDelta,
    previousSetups: sortedSetups(previous.setups),
    currentSetups,
    setupChanged,
    previousSelectedAsSurvivor: previous.selectedAsSurvivor,
    lastSelectedAsSurvivorAt: lastSurvivor?.runAt ?? null,
    missedScans,
    changeReasons,
  };
}
