/**
 * Active Research cohort (pure).
 *
 * ONE canonical rule for what "current Research" means:
 *   the newest eligible healthy production SCAN (ai_scan_source/v1 semantics)
 *   is the ROOT, and every downstream stage is scoped by exact provenance to
 *   that scan.
 *
 * There is never a cross-cohort fallback. When the active cohort lacks a
 * downstream artefact the honest answer is NOT_STARTED / PENDING /
 * NOT_EVALUATED — an artefact from an older scan belongs in History, never in
 * the current Research view.
 */

export const RESEARCH_COHORT_VERSION = "research_cohort/v1";

export type CohortStageStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "PARTIAL"
  | "READY"
  | "COMPLETED"
  | "NOT_EVALUATED"
  | "FAILED";

export interface CohortStageInput {
  /** Packets belonging to the exact active scan. */
  packetCount: number;
  /** Production triage run for the exact active scan, if any. */
  triageRunId: string | null;
  triageStatus: string | null;
  /** Shortlisted (DEEP_RESEARCH) decisions of that exact triage run. */
  shortlistCount: number;
  /** Deep Research attempts/reports for that exact triage run. */
  deepResearchAttempted: number;
  deepResearchCompleted: number;
  /** Thesis synthesis run belonging to the exact active triage run, if any. */
  thesisSynthesisRunId: string | null;
  thesisReportCount: number;
  /** Entry evaluations for thesis reports of the exact active synthesis run. */
  entryEvaluatedCount: number;
  /** Thesis calls created by the active cohort's synthesis. */
  thesisCallCount: number;
  sizingCount: number;
}

export interface CohortStages {
  packets: CohortStageStatus;
  triage: CohortStageStatus;
  deepResearch: CohortStageStatus;
  thesis: CohortStageStatus;
  entry: CohortStageStatus;
  sizing: CohortStageStatus;
}

/** Deterministic stage vocabulary for the active cohort. Never guesses. */
export function deriveCohortStages(input: CohortStageInput): CohortStages {
  const packets: CohortStageStatus = input.packetCount > 0 ? "READY" : "NOT_STARTED";

  let triage: CohortStageStatus = "NOT_STARTED";
  if (input.triageRunId) {
    triage =
      input.triageStatus === "completed"
        ? "COMPLETED"
        : input.triageStatus === "failed" || input.triageStatus === "no_eligible_current_scan"
          ? "FAILED"
          : "PENDING";
  }

  let deepResearch: CohortStageStatus = "NOT_STARTED";
  if (input.triageRunId && input.deepResearchAttempted > 0) {
    deepResearch =
      input.deepResearchCompleted === 0
        ? "PENDING"
        : input.deepResearchCompleted < input.shortlistCount
          ? "PARTIAL"
          : "COMPLETED";
  }

  const thesis: CohortStageStatus = !input.thesisSynthesisRunId
    ? "NOT_STARTED"
    : input.thesisReportCount > 0
      ? "COMPLETED"
      : "PENDING";

  const entry: CohortStageStatus =
    input.entryEvaluatedCount > 0 ? "COMPLETED" : "NOT_EVALUATED";

  const sizing: CohortStageStatus =
    input.thesisCallCount === 0
      ? "NOT_STARTED"
      : input.sizingCount > 0
        ? "COMPLETED"
        : "PENDING";

  return { packets, triage, deepResearch, thesis, entry, sizing };
}

export interface ThesisProvenanceCandidate {
  reportId: string;
  mint: string;
  triageRunId: string | null;
  sourceScanId: string | null;
}

export interface ThesisProvenanceAssertion {
  ok: boolean;
  code: "OK" | "THESIS_INPUT_PROVENANCE_MISMATCH";
  mismatches: {
    reportId: string;
    mint: string;
    triageRunId: string | null;
    sourceScanId: string | null;
  }[];
}

/**
 * Hard gate executed BEFORE any model spend: every thesis input must resolve
 * to the exact active scan AND the exact active triage run. One foreign report
 * fails the whole synthesis.
 */
export function assertThesisInputProvenance(
  candidates: readonly ThesisProvenanceCandidate[],
  active: { scanId: string | null; triageRunId: string | null },
): ThesisProvenanceAssertion {
  const mismatches = candidates
    .filter(
      (c) =>
        !active.triageRunId ||
        c.triageRunId !== active.triageRunId ||
        (active.scanId !== null && c.sourceScanId !== active.scanId),
    )
    .map((c) => ({
      reportId: c.reportId,
      mint: c.mint,
      triageRunId: c.triageRunId,
      sourceScanId: c.sourceScanId,
    }));
  return {
    ok: mismatches.length === 0,
    code: mismatches.length === 0 ? "OK" : "THESIS_INPUT_PROVENANCE_MISMATCH",
    mismatches,
  };
}
