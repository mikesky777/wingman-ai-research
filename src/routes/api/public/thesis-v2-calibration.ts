/**
 * Operator endpoint for CALIBRATION-ONLY thesis_synthesis/v2 validation.
 *
 * Runs the production Thesis model (Lovable AI Gateway, Gemini) over frozen
 * deep research reports in calibration mode. It never writes production thesis
 * reports, opportunities, THESIS_CALL milestones or history rows.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/thesis-v2-calibration")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        let body: { reportIds?: string[]; limit?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const { runThesisSynthesis } = await import(
          "@/lib/wingman/services/research/thesis/thesis.server"
        );
        const result = await runThesisSynthesis({
          mode: "calibration",
          limit: Math.min(Math.max(body.limit ?? 3, 1), 15),
          ...(Array.isArray(body.reportIds) && body.reportIds.length
            ? { reportIds: body.reportIds.map(String) }
            : {}),
        });
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
