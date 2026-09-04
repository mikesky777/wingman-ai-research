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
  .inputValidator((input?: { mode?: "PRODUCTION" | "CALIBRATION"; limit?: number; triageRunId?: string | null }) => ({
    mode: input?.mode === "PRODUCTION" ? ("production" as const) : ("calibration" as const),
    limit: Math.min(Math.max(input?.limit ?? 3, 3), 5),
    triageRunId: input?.triageRunId ?? null,
  }))
  .handler(async ({ data }): Promise<DeepResearchBatchResult> => {
    const { runDeepResearch } = await import("./services/research/deep/deep-research.server");
    return runDeepResearch({
      mode: data.mode,
      limit: data.limit,
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
