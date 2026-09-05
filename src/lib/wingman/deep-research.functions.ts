/**
 * Deep Research server functions (Stage 3).
 *
 * Prompts, provider keys, search traffic and raw model output stay on the
 * server. The client asks for a run and reads persisted, validated dossiers.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  DeepResearchBatchResult,
  DeepResearchReportSummary,
  ExternalSearchStatus,
} from "./services/research/deep/deep-research.server";

export const runDeepResearchBatch = createServerFn({ method: "POST" })
  .inputValidator((input?: { mode?: "PRODUCTION" | "CALIBRATION"; limit?: number; offset?: number; triageRunId?: string | null; retryFailed?: boolean; startNotStarted?: boolean; requireActiveCohort?: boolean }) => ({
    mode: input?.mode === "PRODUCTION" ? ("production" as const) : ("calibration" as const),
    // Deliberate rank-ordered batches by persisted AI triage rank (1–12).
    limit: Math.min(Math.max(input?.limit ?? 3, 1), 12),
    offset: Math.min(Math.max(input?.offset ?? 0, 0), 24),
    triageRunId: input?.triageRunId ?? null,
    // Retry only re-attempts retryable execution failures (AI credits, rate
    // limits, transient providers). Finished reports are never rerun.
    retryFailed: input?.retryFailed === true,
  }))

  .handler(async ({ data }): Promise<DeepResearchBatchResult> => {
    const { runDeepResearch } = await import("./services/research/deep/deep-research.server");
    return runDeepResearch({
      mode: data.mode,
      limit: data.limit,
      offset: data.offset,
      retryFailedOnly: data.retryFailed,
      ...(data.triageRunId ? { triageRunId: data.triageRunId } : {}),
    });
  });


export const getDeepResearchReports = createServerFn({ method: "GET" }).handler(
  async (): Promise<DeepResearchReportSummary[]> => {
    const { loadDeepResearchReports } = await import(
      "./services/research/deep/deep-research.server"
    );
    return loadDeepResearchReports(12);
  },
);

/**
 * External search readiness. Reports whether the outside world can actually be
 * queried, so an empty dossier is never mistaken for a finding.
 */
export const getExternalSearchStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExternalSearchStatus> => {
    const { loadExternalSearchStatus } = await import(
      "./services/research/deep/deep-research.server"
    );
    return loadExternalSearchStatus();
  },
);

/** One persisted dossier by id (production or calibration), read-only. */
export const getDeepResearchReport = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data }): Promise<DeepResearchReportSummary | null> => {
    const { loadDeepResearchReportById } = await import(
      "./services/research/production-view.server"
    );
    return loadDeepResearchReportById(data.id);
  });
