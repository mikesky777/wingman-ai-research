/**
 * Scheduled production cycle tick (`production_cycle/v1`).
 *
 * RECOVERY WATCHDOG ONLY. Exits immediately when no cycle is active, does
 * nothing while a live backend pass is progressing the cycle, and resumes the
 * next unfinished stage only when that pass died. It never starts a cycle.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/production-cycle-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { watchdogProductionCycle } = await import(
          "@/lib/wingman/services/production-cycle/cycle.server"
        );
        const result = await watchdogProductionCycle();
        return new Response(JSON.stringify({ code: result.code, steps: result.steps, stage: result.cycle?.stage ?? null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
