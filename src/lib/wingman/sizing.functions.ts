/**
 * Sizing v1 server functions.
 *
 * Read/derive only for the dashboard: no execution, no trade actions, no
 * THESIS_CALL creation. Percentages are of the Wingman strategy bankroll.
 */
import { createServerFn } from "@tanstack/react-start";
import type { LiveCallSizingResult } from "./services/sizing/sizing.server";

export const getLiveCallSizing = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveCallSizingResult> => {
    const { runLiveCallSizing } = await import("./services/sizing/sizing.server");
    return runLiveCallSizing({ persist: true });
  },
);
