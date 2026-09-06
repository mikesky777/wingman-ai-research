/**
 * Calibration Experiment Tracks server functions.
 *
 * CALIBRATION ONLY. None of these can create a production Thesis Call, Entry,
 * Live state or policy change, and none of them call a market-data provider.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listCalibrationExperiments = createServerFn({ method: "GET" }).handler(async () => {
  const { listExperiments } = await import("./services/calibration/experiments.server");
  return listExperiments();
});

export const loadCalibrationExperiment = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ experimentId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getExperiment, loadExperimentResults } = await import(
      "./services/calibration/experiments.server"
    );
    const [spec, results] = await Promise.all([
      getExperiment(data.experimentId),
      loadExperimentResults(data.experimentId),
    ]);
    return { spec, results };
  });

/** Explicit human action. Experiments never run themselves. */
export const runCalibrationExperiment = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ experimentId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { runExperiment } = await import("./services/calibration/experiments.server");
    return runExperiment(data.experimentId);
  });

/**
 * Calibration bookkeeping only. This marks intent for a human review step; it
 * cannot promote a challenger into production.
 */
export const setCalibrationPromotionState = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        experimentId: z.string().uuid(),
        promotionState: z.enum([
          "NONE",
          "CANDIDATE_FOR_PROSPECTIVE_SHADOW",
          "PROPOSED_FOR_REVIEW",
        ]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { setPromotionState } = await import("./services/calibration/experiments.server");
    await setPromotionState(data.experimentId, data.promotionState);
    return { ok: true as const };
  });
