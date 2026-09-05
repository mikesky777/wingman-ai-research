/**
 * Thesis Synthesis server functions (Stage 4).
 *
 * Prompts, provider keys and raw model output stay on the server. The client
 * asks for a run and reads persisted, validated thesis reports.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  ThesisBatchResult,
  ThesisReportSummary,
} from "./services/research/thesis/thesis.server";

export const runThesisSynthesisBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (input?: {
      mode?: "PRODUCTION" | "CALIBRATION";
      limit?: number;
      reportIds?: string[];
      triageRunId?: string;
    }) => ({
      mode: input?.mode === "PRODUCTION" ? ("production" as const) : ("calibration" as const),
      limit: Math.min(Math.max(input?.limit ?? 3, 1), 15),
      reportIds: Array.isArray(input?.reportIds) ? input.reportIds.map(String) : [],
      triageRunId: typeof input?.triageRunId === "string" ? input.triageRunId : "",
    }),
  )
  .handler(async ({ data }): Promise<ThesisBatchResult> => {
    const { runThesisSynthesis } = await import("./services/research/thesis/thesis.server");
    return runThesisSynthesis({
      mode: data.mode,
      limit: data.limit,
      ...(data.reportIds.length ? { reportIds: data.reportIds } : {}),
      ...(data.triageRunId ? { triageRunId: data.triageRunId } : {}),
    });
  });

export const getThesisReports = createServerFn({ method: "GET" })
  .inputValidator((input?: { mode?: "PRODUCTION" | "CALIBRATION" }) => ({
    mode: input?.mode === "CALIBRATION" ? ("calibration" as const) : ("production" as const),
  }))
  .handler(async ({ data }): Promise<ThesisReportSummary[]> => {
    const { loadThesisReports } = await import("./services/research/thesis/thesis.server");
    return loadThesisReports(12, data.mode);
  });
