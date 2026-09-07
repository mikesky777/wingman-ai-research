/**
 * Scheduled production cycle tick (`production_cycle/v1`).
 *
 * RECOVERY WATCHDOG ONLY. Exits immediately when no cycle is active, does
 * nothing while a live backend pass is progressing the cycle, and resumes the
 * next unfinished stage only when that pass died. It never starts a cycle.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticateProductionCycleScheduler(request: Request): Promise<Response | null> {
  const schedulerToken = request.headers.get("x-production-cycle-scheduler");
  if (!schedulerToken) return authenticateCronRequest(request);

  const [{ createHash, timingSafeEqual }, { supabaseAdmin }] = await Promise.all([
    import("node:crypto"),
    import("@/integrations/supabase/client.server"),
  ]);
  const { data, error } = await supabaseAdmin
    .from("production_cycle_scheduler_credentials")
    .select("token_hash")
    .eq("id", true)
    .maybeSingle();
  if (error || !data?.token_hash) return new Response("Unauthorized", { status: 401 });

  const provided = Buffer.from(createHash("sha256").update(schedulerToken, "utf8").digest("hex"));
  const expected = Buffer.from(data.token_hash);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

export const Route = createFileRoute("/api/public/production-cycle-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateProductionCycleScheduler(request);
        if (denied) return denied;

        let mode = "WATCHDOG";
        try {
          const body = (await request.json()) as { mode?: string } | null;
          if (body?.mode === "STAGE") mode = "STAGE";
        } catch {
          // no body: scheduler watchdog tick
        }

        const { runProductionCycleStage, watchdogProductionCycle } = await import(
          "@/lib/wingman/services/production-cycle/cycle.server"
        );
        // STAGE = normal immediate backend progression hand-off.
        // WATCHDOG = once-a-minute recovery only.
        const result =
          mode === "STAGE" ? await runProductionCycleStage() : await watchdogProductionCycle();
        return new Response(
          JSON.stringify({
            mode,
            code: result.code,
            steps: result.steps,
            stage: result.cycle?.stage ?? null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
