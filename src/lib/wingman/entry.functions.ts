/**
 * Entry State v1 server functions.
 *
 * The timing layer runs entirely on the server (provider keys, admin writes).
 * Clients request an evaluation/refresh and read persisted, append-only rows.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  EntryBatchResult,
  EntryEvaluationSummary,
} from "./services/entry/entry.server";

export const runEntryStateEvaluation = createServerFn({ method: "POST" })
  .inputValidator(
    (input?: {
      mode?: "PRODUCTION" | "CALIBRATION";
      limit?: number;
      mints?: string[];
      asOf?: string;
    }) => ({
      mode: input?.mode === "PRODUCTION" ? ("production" as const) : ("calibration" as const),
      limit: Math.min(Math.max(input?.limit ?? 5, 1), 25),
      mints: Array.isArray(input?.mints) ? input.mints.map(String) : [],
      asOf: typeof input?.asOf === "string" ? input.asOf : null,
    }),
  )
  .handler(async ({ data }): Promise<EntryBatchResult> => {
    const { runEntryStateBatch } = await import("./services/entry/entry.server");
    return runEntryStateBatch({
      mode: data.mode,
      limit: data.limit,
      ...(data.mints.length ? { mints: data.mints } : {}),
      ...(data.asOf ? { asOf: data.asOf } : {}),
    });
  });

/** Manual "Refresh Entry": one mint, refreshed current market evidence. */
export const refreshEntryState = createServerFn({ method: "POST" })
  .inputValidator((input: { mint: string; mode?: "PRODUCTION" | "CALIBRATION" }) => ({
    mint: String(input.mint),
    mode: input.mode === "PRODUCTION" ? ("production" as const) : ("calibration" as const),
  }))
  .handler(async ({ data }): Promise<EntryBatchResult> => {
    const { runEntryStateBatch } = await import("./services/entry/entry.server");
    return runEntryStateBatch({ mode: data.mode, limit: 1, mints: [data.mint] });
  });

/** How many active-cohort production THESIS_CALLs Entry timing may evaluate now. */
export const getEntryEligibility = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ eligible: number }> => {
    const { loadEntryEligibility } = await import("./services/entry/entry.server");
    return loadEntryEligibility();
  },
);

export const getEntryEvaluations = createServerFn({ method: "GET" })
  .inputValidator((input?: { mode?: "PRODUCTION" | "CALIBRATION" }) => ({
    mode: input?.mode === "CALIBRATION" ? ("calibration" as const) : ("production" as const),
  }))
  .handler(async ({ data }): Promise<EntryEvaluationSummary[]> => {
    const { loadEntryEvaluations } = await import("./services/entry/entry.server");
    return loadEntryEvaluations(20, data.mode);
  });
