/**
 * Scheduled production cycle tick (`production_cycle/v1`).
 *
 * Advances at most one stage of the active human-initiated cycle. This is what
 * makes the cycle durable: it keeps progressing with zero browser tabs open,
 * and resumes after a worker restart. It never starts a cycle by itself.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/production-cycle-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { advanceProductionCycle } = await import(
          "@/lib/wingman/services/production-cycle/cycle.server"
        );
        const result = await advanceProductionCycle();
        return new Response(JSON.stringify({ code: result.code, stage: result.cycle?.stage ?? null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
