/**
 * Discovery provider operational diagnostics (server-only, read-only).
 *
 * Purely observational: nothing here feeds scoring, selection, recurrence or
 * policy epochs. It answers "how has discovery been behaving?" from persisted
 * scan runs, and pairs that history with a live readiness preflight.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkBirdeyeReadiness } from "../external/birdeye/readiness.server";
import type { ProviderReadiness } from "../external/birdeye/readiness";

export interface DiscoveryProviderDiagnostics {
  provider: "birdeye";
  readiness: ProviderReadiness;
  lastSuccessAt: string | null;
  lastSuccessRunId: string | null;
  lastHealthyDiscoveredCount: number | null;
  lastFailureAt: string | null;
  lastFailureType: string | null;
  lastFailureReason: string | null;
  consecutiveFailures: number;
}

interface RunRow {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  tokens_discovered: number | null;
  discovery_health: string | null;
  discovery_health_detail: { reason?: string | null } | null;
  error_message: string | null;
}

export async function loadDiscoveryProviderDiagnostics(options: {
  /** Skip the live probe (e.g. purely historical views). */
  skipPreflight?: boolean;
} = {}): Promise<DiscoveryProviderDiagnostics> {
  const readiness = options.skipPreflight
    ? {
        provider: "birdeye" as const,
        state: "UNKNOWN_FAILURE" as const,
        reason: null,
        checkedAt: new Date().toISOString(),
        quotaRemaining: null,
        quotaResetAt: null,
      }
    : await checkBirdeyeReadiness();

  const { data } = await supabaseAdmin
    .from("scan_runs")
    .select(
      "id, status, started_at, completed_at, tokens_discovered, discovery_health, discovery_health_detail, error_message",
    )
    .order("started_at", { ascending: false })
    .limit(50);

  const runs = ((data ?? []) as unknown as RunRow[]).filter((r) => r.status !== "running");

  const healthy = (r: RunRow) =>
    r.status === "completed" &&
    r.discovery_health !== "PROVIDER_UNAVAILABLE" &&
    (r.tokens_discovered ?? 0) > 0;

  const lastHealthy = runs.find(healthy) ?? null;
  const lastFailed = runs.find((r) => !healthy(r)) ?? null;

  let consecutiveFailures = 0;
  for (const run of runs) {
    if (healthy(run)) break;
    consecutiveFailures += 1;
  }

  return {
    provider: "birdeye",
    readiness,
    lastSuccessAt: lastHealthy?.completed_at ?? null,
    lastSuccessRunId: lastHealthy?.id ?? null,
    lastHealthyDiscoveredCount: lastHealthy?.tokens_discovered ?? null,
    lastFailureAt: lastFailed?.completed_at ?? lastFailed?.started_at ?? null,
    lastFailureType: lastFailed ? (lastFailed.discovery_health ?? lastFailed.status) : null,
    lastFailureReason:
      lastFailed?.discovery_health_detail?.reason ?? lastFailed?.error_message ?? null,
    consecutiveFailures,
  };
}
