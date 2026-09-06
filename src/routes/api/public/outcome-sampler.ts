/**
 * Scheduled outcome sampler endpoint (`outcome_sampler/v1`).
 *
 * Called by the platform scheduler roughly every 5 minutes. Collection
 * continues with zero browser tabs open. Requires the cron bearer secret.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/outcome-sampler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { runOutcomeSampler } = await import(
          "@/lib/wingman/services/outcomes/sampler.server"
        );
        const result = await runOutcomeSampler({ trigger: "SCHEDULED" });
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
