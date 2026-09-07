/**
 * production_cycle/v1 server functions.
 *
 * The client starts, observes and nudges a durable server-side cycle. It never
 * owns progression: closing the browser does not stop the run, and a scheduled
 * tick keeps advancing it.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  AdvanceResult,
  ProductionCycleState,
  StartProductionCycleResult,
} from "./services/production-cycle/cycle.server";

export const startProductionCycleFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<StartProductionCycleResult> => {
    const { startProductionCycle } = await import("./services/production-cycle/cycle.server");
    return startProductionCycle();
  },
);

export const getProductionCycleFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    active: ProductionCycleState | null;
    latest: ProductionCycleState | null;
  }> => {
    const { loadActiveProductionCycle, loadLatestProductionCycle } = await import(
      "./services/production-cycle/cycle.server"
    );
    const [active, latest] = await Promise.all([
      loadActiveProductionCycle(),
      loadLatestProductionCycle(),
    ]);
    return { active, latest };
  },
);

/** Executes at most one stage step. Safe to call concurrently — leased. */
export const tickProductionCycleFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<AdvanceResult> => {
    const { advanceProductionCycle } = await import("./services/production-cycle/cycle.server");
    return advanceProductionCycle();
  },
);
