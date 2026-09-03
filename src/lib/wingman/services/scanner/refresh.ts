/**
 * Evidence refresh urgency (pure, deterministic).
 *
 * Recurrence answers "have we seen this token before?". Refresh answers a
 * different question: "does this candidate need fresh evidence THIS scan?".
 *
 * Hard rules:
 *   - A REPEAT candidate is never penalized: it keeps its priority, its setup
 *     classification, its survivor eligibility and its persisted history.
 *     Only the decision to spend provider calls changes.
 *   - Carried-forward evidence is reused as-is. Nothing is rewritten, nothing
 *     is duplicated to look fresher than it is.
 */
import type { RecurrenceState } from "./recurrence";

export type RefreshState = "REFRESH_REQUIRED" | "REFRESH_OPTIONAL" | "CARRY_FORWARD";

export interface RefreshConfig {
  /** Evidence older than this always forces a fresh enrichment. */
  maxEvidenceAgeMinutes: number;
  /** Evidence older than this is "approaching stale" → REFRESH_OPTIONAL. */
  optionalEvidenceAgeMinutes: number;
}

export const REFRESH_CONFIG: RefreshConfig = {
  maxEvidenceAgeMinutes: 90,
  optionalEvidenceAgeMinutes: 45,
};

export interface RefreshInput {
  recurrenceState: RecurrenceState;
  /** Capture time of the most recent enrichment/evidence, if any. */
  lastEnrichedAt: string | null;
  /** Evaluation time of the current scan. */
  nowIso: string;
  config?: RefreshConfig;
}

export interface RefreshDecision {
  state: RefreshState;
  /** Age of the reusable evidence in minutes. `null` = no prior evidence. */
  evidenceAgeMinutes: number | null;
  lastEnrichedAt: string | null;
  /** True only when the scan reuses existing evidence instead of refetching. */
  carriedForward: boolean;
  reason: string;
}

/** Deterministic: same inputs always yield the same decision. */
export function deriveRefreshState(input: RefreshInput): RefreshDecision {
  const config = input.config ?? REFRESH_CONFIG;
  const ageMinutes = evidenceAgeMinutes(input.lastEnrichedAt, input.nowIso);

  const base = {
    evidenceAgeMinutes: ageMinutes,
    lastEnrichedAt: input.lastEnrichedAt,
  };

  if (input.recurrenceState !== "REPEAT") {
    return {
      ...base,
      state: "REFRESH_REQUIRED",
      carriedForward: false,
      reason: `${input.recurrenceState} candidate`,
    };
  }
  if (ageMinutes === null) {
    return {
      ...base,
      state: "REFRESH_REQUIRED",
      carriedForward: false,
      reason: "No prior enrichment on record",
    };
  }
  if (ageMinutes >= config.maxEvidenceAgeMinutes) {
    return {
      ...base,
      state: "REFRESH_REQUIRED",
      carriedForward: false,
      reason: `Evidence ${Math.round(ageMinutes)}m old exceeds ${config.maxEvidenceAgeMinutes}m limit`,
    };
  }
  if (ageMinutes >= config.optionalEvidenceAgeMinutes) {
    return {
      ...base,
      state: "REFRESH_OPTIONAL",
      carriedForward: false,
      reason: `Evidence ${Math.round(ageMinutes)}m old is approaching the freshness limit`,
    };
  }
  return {
    ...base,
    state: "CARRY_FORWARD",
    carriedForward: true,
    reason: `Unchanged repeat with ${Math.round(ageMinutes)}m old evidence`,
  };
}

/** Minutes between the last evidence capture and now. Never negative-clamped. */
export function evidenceAgeMinutes(lastEnrichedAt: string | null, nowIso: string): number | null {
  if (!lastEnrichedAt) return null;
  const then = Date.parse(lastEnrichedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return (now - then) / 60000;
}

export interface RefreshDiagnostics {
  newCount: number;
  changedCount: number;
  returningCount: number;
  repeatCount: number;
  refreshRequired: number;
  refreshOptional: number;
  carryForward: number;
  freshEnrichments: number;
  carriedForwardSurvivors: number;
  /** Provider enrichment rounds skipped because evidence was still valid. */
  enrichmentRequestsAvoided: number;
}
