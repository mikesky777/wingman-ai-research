/**
 * Client observation of `production_cycle/v1`.
 *
 * The browser never owns progression — it polls persisted state and nudges a
 * tick while a tab happens to be open. The scheduled server tick keeps the
 * cycle advancing with every tab closed.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProductionCycleFn,
  tickProductionCycleFn,
} from "@/lib/wingman/production-cycle.functions";

export const productionCycleKey = ["wingman", "production-cycle"] as const;

export function useProductionCycle() {
  const queryClient = useQueryClient();
  const ticking = useRef(false);
  const lastStage = useRef<string | null>(null);

  const query = useQuery({
    queryKey: productionCycleKey,
    queryFn: () => getProductionCycleFn(),
    refetchInterval: (q) => (q.state.data?.active ? 4000 : 30_000),
  });

  const active = query.data?.active ?? null;
  const stage = active?.stage ?? null;

  // Nudge one stage step at a time. Overlapping ticks are rejected by the
  // server lease, so this can never double-run a paid stage.
  useEffect(() => {
    if (!active || ticking.current) return;
    ticking.current = true;
    void Promise.resolve(tickProductionCycleFn())
      .catch(() => undefined)
      .finally(() => {
        ticking.current = false;
        void queryClient.invalidateQueries({ queryKey: productionCycleKey });
      });
  }, [active, stage, queryClient]);

  // Refresh every downstream read model when the cycle moves on.
  useEffect(() => {
    if (stage === lastStage.current) return;
    lastStage.current = stage;
    if (stage) void queryClient.invalidateQueries({ queryKey: ["wingman"] });
  }, [stage, queryClient]);

  return query;
}
