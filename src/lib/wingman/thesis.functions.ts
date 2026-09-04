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
  .inputValidator((input?: { mode?: "PRODUCTION" | "CALIBRATION"; limit?: number; reportIds?: string[] }) => ({
    mode: input?.mode === "PRODUCTION" ? ("production" as const) : ("calibration" as const),
    limit: Math.min(Math.max(input?.limit ?? 3, 1), 10),
    reportIds: Array.isArray(input?.reportIds) ? input.reportIds.map(String) : [],
  }))
  .handler(async ({ data }): Promise<ThesisBatchResult> => {
    const { runThesisSynthesis } = await import("./services/research/thesis/thesis.server");
    return runThesisSynthesis({
      mode: data.mode,
      limit: data.limit,
      ...(data.reportIds.length ? { reportIds: data.reportIds } : {}),
    });
  });

export const getThesisReports = createServerFn({ method: "GET" }).handler(
  async (): Promise<ThesisReportSummary[]> => {
    const { loadThesisReports } = await import("./services/research/thesis/thesis.server");
    return loadThesisReports(12);
  },
);
