/**
 * Learning feature layer — evaluation-only Calibration read path.
 * Never triggers scans, research, providers or outcome analysis.
 */
import { createServerFn } from "@tanstack/react-start";
import type { LearningQuery } from "./services/learning/projection.server";

export const queryLearningFeatures = createServerFn({ method: "GET" })
  .inputValidator((input: LearningQuery) => input ?? {})
  .handler(async ({ data }) => {
    const { queryLearningFeatures: run } = await import("./services/learning/projection.server");
    return run(data);
  });

export const estimateLearningBackfill = createServerFn({ method: "GET" }).handler(async () => {
  const { estimateHistoricalBackfill } = await import("./services/learning/projection.server");
  return estimateHistoricalBackfill();
});
