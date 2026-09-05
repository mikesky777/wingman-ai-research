/**
 * Operator endpoint for the CALIBRATION-ONLY thesis model benchmark.
 *
 * Requires the cron bearer secret. It never writes production thesis reports,
 * opportunities, THESIS_CALL milestones or history rows — it delegates to the
 * calibration path of the existing synthesis orchestrator.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/thesis-benchmark")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        let body: { runCount?: number; mints?: string[] } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const { runThesisModelBenchmark } = await import(
          "@/lib/wingman/services/research/thesis/benchmark.server"
        );
        const result = await runThesisModelBenchmark({
          runCount: Math.min(Math.max(body.runCount ?? 3, 1), 5),
          ...(Array.isArray(body.mints) && body.mints.length ? { mints: body.mints.map(String) } : {}),
        });
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
