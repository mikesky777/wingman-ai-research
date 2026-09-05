/**
 * Live Calls server functions (read-only).
 *
 * Exposes the production THESIS_CALL read model to the dashboard. No writes,
 * no calibration data — only immutable production funnel records.
 */
import { createServerFn } from "@tanstack/react-start";
import type { LiveCallsResult } from "./services/live-calls.server";

export const getLiveCalls = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveCallsResult> => {
    const { loadLiveCalls } = await import("./services/live-calls.server");
    return loadLiveCalls();
  },
);
