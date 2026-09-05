/**
 * thesis_idempotency/v1 — pure helpers.
 *
 * A production Deep Research artifact may produce AT MOST ONE canonical
 * production Thesis Synthesized artifact. Identity is exact provenance:
 * triage cohort + exact mint + Deep Research report id.
 *
 * Model / prompt / rubric comparison reruns over the same frozen evidence
 * belong in Calibration and never mint a second production artifact.
 */

export interface ProductionThesisIdentity {
  triageRunId: string | null;
  mint: string;
  deepResearchReportId: string | null;
}

/**
 * Deterministic idempotency key persisted on new production thesis reports.
 * Returns null when provenance is incomplete — such a candidate must not be
 * treated as canonically identifiable.
 */
export function productionIdempotencyKey(id: ProductionThesisIdentity): string | null {
  if (!id.triageRunId || !id.mint || !id.deepResearchReportId) return null;
  return `${id.triageRunId}:${id.mint}:${id.deepResearchReportId}`;
}

/** Postgres unique-violation (23505), however the client surfaces it. */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === "23505") return true;
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return message.includes("duplicate key value") || message.includes("unique constraint");
}
