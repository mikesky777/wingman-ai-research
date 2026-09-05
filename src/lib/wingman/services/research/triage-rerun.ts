/**
 * Repeat-triage protection (pure).
 *
 * A production triage pass spends AI credits over an exact packet cohort. Once
 * a cohort has been triaged, the ordinary Run triage action must not silently
 * spend again on the same packets; an intentional repeat requires an explicit
 * confirmed rerun. This rule is about spend, never about provenance: a rerun
 * still has to satisfy the exact scan/packet provenance checks.
 */

export interface ExistingCohortTriage {
  id: string;
  status: string | null;
  completedAt?: string | null;
}

export type TriageRunAvailability =
  | { kind: "RUN"; existing: null }
  | { kind: "RERUN_ONLY"; existing: ExistingCohortTriage }
  | { kind: "IN_PROGRESS"; existing: ExistingCohortTriage };

/** True when the run settled successfully over the cohort. */
export function isCompletedTriageStatus(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "completed";
}

/** What the ordinary Run triage control may do for this cohort. */
export function triageRunAvailability(
  existing: ExistingCohortTriage | null,
): TriageRunAvailability {
  if (!existing) return { kind: "RUN", existing: null };
  const status = (existing.status ?? "").toLowerCase();
  if (status === "running" || status === "pending") return { kind: "IN_PROGRESS", existing };
  if (isCompletedTriageStatus(status)) return { kind: "RERUN_ONLY", existing };
  // Failed / no-eligible-scan attempts never consumed the cohort.
  return { kind: "RUN", existing: null };
}

/** Server guard: block an unconfirmed production repeat before any spend. */
export function shouldBlockProductionRerun(
  existing: ExistingCohortTriage | null,
  allowRerun: boolean,
): boolean {
  if (allowRerun) return false;
  return triageRunAvailability(existing).kind === "RERUN_ONLY";
}
