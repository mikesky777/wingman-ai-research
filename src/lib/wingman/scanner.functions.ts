/**
 * Scanner server functions.
 *
 * Thin wrapper module: imports, types and server-function declarations only.
 * All runtime work lives in `services/scanner/pipeline.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { runScannerPipeline } from "./services/scanner/pipeline.server";
import type { RunScanResult } from "./services/scanner/pipeline.server";

export const runScan = createServerFn({ method: "POST" })
  .inputValidator((input?: { calibrationMode?: boolean; survivorEnrichmentLimit?: number }) => ({
    calibrationMode: input?.calibrationMode,
    survivorEnrichmentLimit: input?.survivorEnrichmentLimit,
  }))
  .handler(async ({ data }): Promise<RunScanResult> => {
    const overrides: Record<string, unknown> = {};
    if (typeof data.calibrationMode === "boolean") overrides["calibrationMode"] = data.calibrationMode;
    if (typeof data.survivorEnrichmentLimit === "number") {
      overrides["survivorEnrichmentLimit"] = data.survivorEnrichmentLimit;
    }
    return runScannerPipeline(overrides);
  });

/**
 * Real persisted state of a scan run, plus whatever run currently holds the
 * lock. Read-only: used by the UI to reflect actual lifecycle state instead of
 * inferring completion from a resolved POST.
 */
export const getScanRunStatus = createServerFn({ method: "GET" })
  .inputValidator((input?: { runId?: string | null }) => ({ runId: input?.runId ?? null }))
  .handler(
    async ({
      data,
    }): Promise<{
      status: string | null;
      errorMessage: string | null;
      activeRunId: string | null;
      activeStartedAt: string | null;
    }> => {
      const { getActiveRun, getScanRunState, reclaimStaleRuns } = await import(
        "./services/scanner/persistence.server"
      );
      // Reading is also the natural moment to release a dead worker's lock.
      await reclaimStaleRuns();
      const run = data.runId ? await getScanRunState(data.runId) : null;
      const active = await getActiveRun();
      return {
        status: run?.status ?? null,
        errorMessage: run?.errorMessage ?? null,
        activeRunId: active?.id ?? null,
        activeStartedAt: active?.startedAt ?? null,
      };
    },
  );
