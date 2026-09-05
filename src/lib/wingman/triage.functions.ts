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

/**
 * Calibration-only audit: repeated identical calibration runs plus one
 * presentation-order-shuffled run, with grounding, bias and stability
 * analysis. Never runs production triage and never writes milestones.
 */
export const runTriageAudit = createServerFn({ method: "POST" })
  .inputValidator((input?: { runs?: number; includeShuffled?: boolean; scanRunId?: string | null }) => ({
    runs: typeof input?.runs === "number" ? input.runs : 5,
    includeShuffled: input?.includeShuffled !== false,
    scanRunId: input?.scanRunId ?? null,
  }))
  .handler(async ({ data }) => {
    const { runTriageCalibrationAudit } = await import("./services/research/triage-audit.server");
    return runTriageCalibrationAudit(data);
  });

/**
 * Latest triage run for one mode. Production and calibration are separate
 * views: a later calibration run can never replace the production display.
 */
export const getLatestTriage = createServerFn({ method: "GET" })
  .inputValidator((input?: { mode?: "PRODUCTION" | "CALIBRATION" }) => ({
    mode: input?.mode === "CALIBRATION" ? ("CALIBRATION" as const) : ("PRODUCTION" as const),
  }))
  .handler(
    async ({
      data,
    }): Promise<{ run: TriageRunSummary; decisions: PersistedTriageDecision[] } | null> => {
      const { loadLatestTriage } = await import("./services/research/triage.server");
      return loadLatestTriage(data.mode);
    },
  );

/** Current production funnel: scan → packets → triage → shortlist → thesis. */
export const getProductionFunnel = createServerFn({ method: "GET" }).handler(async () => {
  const { loadProductionFunnel } = await import("./services/research/production-view.server");
  return loadProductionFunnel();
});

export const runTriageAblation = createServerFn({ method: "POST" })
  .inputValidator(
    (input?: {
      variant?: "BASELINE" | "SOURCE_BLIND" | "NEUTRAL_SETUP" | "COUNTERFACTUAL_SOURCE";
      runs?: number;
      scanRunId?: string | null;
      pairCount?: number;
    }) => ({
      variant: input?.variant ?? ("SOURCE_BLIND" as const),
      runs: Math.min(Math.max(input?.runs ?? 3, 1), 5),
      scanRunId: input?.scanRunId ?? null,
      pairCount: Math.min(Math.max(input?.pairCount ?? 3, 1), 6),
    }),
  )
  .handler(async ({ data }) => {
    const { runTriageAblationBatch } = await import("./services/research/triage-ablation.server");
    return runTriageAblationBatch(data);
  });
