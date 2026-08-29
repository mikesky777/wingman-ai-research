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
