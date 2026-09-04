/**
 * AI Triage server functions (Stage 2 — comparative triage).
 *
 * The client never sees prompts, provider keys or raw model output: it asks
 * for a run and reads back persisted, validated decisions.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  PersistedTriageDecision,
  TriageRunResult,
  TriageRunSummary,
} from "./services/research/triage.server";

export const runTriage = createServerFn({ method: "POST" })
  .inputValidator((input?: { mode?: "PRODUCTION" | "CALIBRATION"; scanRunId?: string | null }) => ({
    mode: input?.mode === "CALIBRATION" ? ("CALIBRATION" as const) : ("PRODUCTION" as const),
    scanRunId: input?.scanRunId ?? null,
  }))
  .handler(async ({ data }): Promise<TriageRunResult> => {
    const { runAiTriage } = await import("./services/research/triage.server");
    return runAiTriage({ mode: data.mode, scanRunId: data.scanRunId });
  });

export const getLatestTriage = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ run: TriageRunSummary; decisions: PersistedTriageDecision[] } | null> => {
    const { loadLatestTriage } = await import("./services/research/triage.server");
    return loadLatestTriage();
  },
);
