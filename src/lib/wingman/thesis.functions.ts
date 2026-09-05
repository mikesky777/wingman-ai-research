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

/**
 * Thesis model benchmark (CALIBRATION ONLY).
 * Runs a stronger OpenAI reasoning model over the frozen production evidence.
 * The frozen production reports are never modified and no opportunity,
 * THESIS_CALL milestone or history row is created.
 */
export const runThesisModelBenchmarkFn = createServerFn({ method: "POST" })
  .inputValidator((input?: { runCount?: number; mints?: string[] }) => ({
    runCount: Math.min(Math.max(input?.runCount ?? 3, 1), 5),
    mints: Array.isArray(input?.mints) ? input.mints.map(String) : [],
  }))
  .handler(async ({ data }) => {
    const { runThesisModelBenchmark } = await import(
      "./services/research/thesis/benchmark.server"
    );
    return runThesisModelBenchmark({
      runCount: data.runCount,
      ...(data.mints.length ? { mints: data.mints } : {}),
    });
  });

export const preflightThesisBenchmarkModels = createServerFn({ method: "GET" }).handler(
  async () => {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) return { code: "MISSING_OPENAI_API_KEY" as const, attempts: [], selectedModel: null };
    const { preflightOpenAiThesisModels } = await import(
      "./services/research/thesis/provider.server"
    );
    const access = await preflightOpenAiThesisModels({ apiKey });
    return {
      code: access.selectedModel ? ("OK" as const) : ("OPENAI_THESIS_MODEL_UNAVAILABLE" as const),
      attempts: access.attempts,
      selectedModel: access.selectedModel,
    };
  },
);
