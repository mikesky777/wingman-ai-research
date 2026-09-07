/**
 * production_cycle/v1 server functions.
 *
 * The client starts and OBSERVES a durable server-side cycle. It never owns
 * progression: the backend drives every stage, and a scheduled watchdog
 * resumes a stalled cycle. Closing the browser changes nothing.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
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
