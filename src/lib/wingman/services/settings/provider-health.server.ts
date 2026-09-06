/**
 * provider_health/v1 — honest, evidence-backed provider status (server-only).
 *
 * Status is derived ONLY from (a) whether the provider is configured on the
 * server and (b) persisted operational evidence of real production use. No
 * provider request is made here, and no key material is ever returned.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const PROVIDER_HEALTH_VERSION = "provider_health/v1";

export type ProviderStatus = "ACTIVE" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED" | "UNKNOWN";

export interface ProviderHealth {
  provider: string;
  purpose: string;
  status: ProviderStatus;
  detail: string;
  lastActivityAt: string | null;
}

export interface ProviderHealthReport {
  version: typeof PROVIDER_HEALTH_VERSION;
  generatedAt: string;
  providers: ProviderHealth[];
}

const configured = (name: string): boolean => Boolean(process.env[name]);

async function latest(table: string, column: string): Promise<string | null> {
  const client = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        order: (
          c: string,
          o: { ascending: boolean; nullsFirst?: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null }>;
        };
      };
    };
  };
  const { data } = await client
    .from(table)
    .select(column)
    .order(column, { ascending: false, nullsFirst: false })
    .limit(1);
  const row = data?.[0] ?? null;
  return (row?.[column] as string | null) ?? null;
}

const ageMs = (iso: string | null, now: number): number | null =>
  iso ? now - new Date(iso).getTime() : null;

export async function loadProviderHealth(): Promise<ProviderHealthReport> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // DexScreener — no key; health comes from the independent outcome sampler.
  const { data: samplerRows } = await supabaseAdmin
    .from("outcome_sampler_runs")
    .select(
      "started_at, finished_at, status, mints_refreshed, rate_limited_count, provider_error_count",
    )
    .order("started_at", { ascending: false })
    .limit(5);
  const runs = (samplerRows ?? []) as Record<string, unknown>[];
  const lastRun = runs[0] ?? null;
  const lastRunAt = (lastRun?.["started_at"] as string | null) ?? null;
  const lastRunAge = ageMs(lastRunAt, now);
  const rateLimited = runs.reduce((s, r) => s + Number(r["rate_limited_count"] ?? 0), 0);
  const providerErrors = runs.reduce((s, r) => s + Number(r["provider_error_count"] ?? 0), 0);

  let dexStatus: ProviderStatus = "UNKNOWN";
  let dexDetail = "No sampler run recorded yet.";
  if (lastRun) {
    if (lastRunAge !== null && lastRunAge > 60 * 60_000) {
      dexStatus = "UNAVAILABLE";
      dexDetail = "No sampler run in the last hour.";
    } else if (rateLimited > 0 || providerErrors > 0) {
      dexStatus = "DEGRADED";
      dexDetail = `${rateLimited} rate-limited · ${providerErrors} provider errors in last ${runs.length} runs.`;
    } else {
      dexStatus = "ACTIVE";
      dexDetail = `Last ${runs.length} sampler runs clean · ${Number(lastRun["mints_refreshed"] ?? 0)} mints refreshed.`;
    }
  }

  // Birdeye — keyed; used by discovery and holder intelligence.
  const lastScanAt = await latest("scan_runs", "started_at");
  const birdeyeConfigured = configured("BIRDEYE_API_KEY");
  const birdeyeAge = ageMs(lastScanAt, now);
  const birdeye: ProviderHealth = {
    provider: "Birdeye",
    purpose: "Discovery + holder / distribution intelligence",
    status: !birdeyeConfigured
      ? "NOT_CONFIGURED"
      : lastScanAt === null
        ? "UNKNOWN"
        : birdeyeAge !== null && birdeyeAge > 7 * 24 * 60 * 60_000
          ? "UNKNOWN"
          : "ACTIVE",
    detail: birdeyeConfigured
      ? lastScanAt
        ? "Key configured · used by the most recent scan."
        : "Key configured · no scan recorded yet."
      : "No API key configured on the server.",
    lastActivityAt: lastScanAt,
  };

  // Lovable AI Gateway — triage / deep research / thesis synthesis.
  const gatewayConfigured = configured("LOVABLE_API_KEY");
  const lastTriageAt = await latest("ai_triage_runs", "created_at");
  const lastThesisAt = await latest("thesis_synthesis_runs", "created_at");
  const lastAi = [lastTriageAt, lastThesisAt].filter(Boolean).sort().pop() ?? null;

  // External search (Firecrawl) — Deep Research evidence collection.
  const searchConfigured = configured("FIRECRAWL_API_KEY");
  const lastDeepAt = await latest("deep_research_runs", "created_at");

  return {
    version: PROVIDER_HEALTH_VERSION,
    generatedAt: nowIso,
    providers: [
      {
        provider: "DexScreener",
        purpose: "Market data + independent outcome sampling",
        status: dexStatus,
        detail: dexDetail,
        lastActivityAt: lastRunAt,
      },
      birdeye,
      {
        provider: "Lovable AI Gateway",
        purpose: "AI Triage · Deep Research · Thesis Synthesis",
        status: gatewayConfigured ? (lastAi ? "ACTIVE" : "UNKNOWN") : "NOT_CONFIGURED",
        detail: gatewayConfigured
          ? lastAi
            ? "Configured · used by recent AI stage runs."
            : "Configured · no AI stage run recorded yet."
          : "No gateway key configured on the server.",
        lastActivityAt: lastAi,
      },
      {
        provider: "External web search",
        purpose: "Deep Research source discovery",
        status: searchConfigured ? (lastDeepAt ? "ACTIVE" : "UNKNOWN") : "NOT_CONFIGURED",
        detail: searchConfigured
          ? lastDeepAt
            ? "Configured · used by recent Deep Research runs."
            : "Configured · no Deep Research run recorded yet."
          : "Not configured — Deep Research runs report search unavailable.",
        lastActivityAt: lastDeepAt,
      },
      {
        provider: "Solana RPC",
        purpose: "On-chain reads",
        status: configured("SOLANA_RPC_URL") ? "ACTIVE" : "NOT_CONFIGURED",
        detail: configured("SOLANA_RPC_URL")
          ? "Endpoint configured."
          : "No RPC endpoint configured.",
        lastActivityAt: null,
      },
    ],
  };
}
