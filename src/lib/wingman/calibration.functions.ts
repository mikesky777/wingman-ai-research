/**
 * Calibration Observatory server functions.
 *
 * Read-only. The Observatory never triggers scans, research, thesis synthesis,
 * entry evaluation or any market-data provider request.
 */
import { createServerFn } from "@tanstack/react-start";

export const loadObservatory = createServerFn({ method: "GET" }).handler(async () => {
  const { loadObservatoryDataset } = await import("./services/calibration/observatory.server");
  return loadObservatoryDataset();
});
