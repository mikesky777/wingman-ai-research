/**
 * Live lifecycle server functions.
 *
 * Read: current Live state + the append-only History ledger.
 * Write: transition reconciliation and explicit monitoring-status changes.
 * Nothing here rewrites a THESIS_CALL or a past lifecycle event.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  MONITORING_STATUSES,
  type MonitoringStatus,
} from "./services/live/lifecycle";
import type {
  LiveLifecycleView,
  LiveReconcileResult,
} from "./services/live/lifecycle.server";

export const getLiveLifecycle = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveLifecycleView> => {
    const { loadLiveLifecycle } = await import("./services/live/lifecycle.server");
    return loadLiveLifecycle();
  },
);

export const reconcileLiveCalls = createServerFn({ method: "POST" }).handler(
  async (): Promise<LiveReconcileResult> => {
    const { reconcileLiveLifecycle } = await import("./services/live/lifecycle.server");
    return reconcileLiveLifecycle();
  },
);

export const updateMonitoringStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { thesisCallMilestoneId: string; status: string; reason?: string }) => {
    const status = MONITORING_STATUSES.includes(input.status as MonitoringStatus)
      ? (input.status as MonitoringStatus)
      : null;
    if (!status) throw new Error(`Unsupported monitoring status: ${input.status}`);
    return {
      thesisCallMilestoneId: String(input.thesisCallMilestoneId),
      status,
      reason: typeof input.reason === "string" ? input.reason.slice(0, 500) : null,
    };
  })
  .handler(async ({ data }) => {
    const { setMonitoringStatus } = await import("./services/live/lifecycle.server");
    return setMonitoringStatus({
      thesisCallMilestoneId: data.thesisCallMilestoneId,
      status: data.status,
      reason: data.reason,
    });
  });
