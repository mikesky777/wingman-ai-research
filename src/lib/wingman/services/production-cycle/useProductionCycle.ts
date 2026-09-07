/**
 * Client observation of `production_cycle/v1`.
 *
 * READ-ONLY. The browser never owns progression and never issues a stage
 * action: the backend drives the cycle to completion on its own. This hook
 * only polls persisted state for display.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProductionCycleFn } from "@/lib/wingman/production-cycle.functions";

export const productionCycleKey = ["wingman", "production-cycle"] as const;

export function useProductionCycle() {
  const queryClient = useQueryClient();
  const lastStage = useRef<string | null>(null);

  const query = useQuery({
    queryKey: productionCycleKey,
    queryFn: () => getProductionCycleFn(),
    refetchInterval: (q) => (q.state.data?.active ? 4000 : 30_000),
  });

  const active = query.data?.active ?? null;
  const stage = active?.stage ?? null;

  // Refresh every downstream read model when the cycle moves on.
  useEffect(() => {
    if (stage === lastStage.current) return;
    lastStage.current = stage;
    if (stage) void queryClient.invalidateQueries({ queryKey: ["wingman"] });
  }, [stage, queryClient]);

  return query;
}
