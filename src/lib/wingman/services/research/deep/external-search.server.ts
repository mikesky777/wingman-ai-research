/**
 * ExternalSearchProvider — API-backed external search for Deep Research
 * (server-only). Secrets never leave the server.
 *
 * The orchestrator depends on this interface, not on a vendor. Swapping the
 * search vendor changes only this file and the search policy version.
 */
import {
  EXTERNAL_SEARCH_POLICY_VERSION,
  classifyHttpFailure,
  dedupeResults,
  isSearchSuccess,
  looksLikeChallenge,
  type ExternalSearchResponse,
  type ExternalSearchResult,
  type SearchOutcome,
} from "./external-search";

export interface ExternalSearchProvider {
  readonly name: string;
  readonly policyVersion: string;
  search(query: string, limit: number): Promise<ExternalSearchResponse>;
}

export interface ExternalSearchHealth {
  provider: string;
  policyVersion: string;
  readiness: "READY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureType: SearchOutcome | null;
  lastFailureDetail: string | null;
  successCount: number;
  failureCount: number;
}

/** Process-local health record, updated by every search attempt. */
const health: ExternalSearchHealth = {
  provider: "none",
  policyVersion: EXTERNAL_SEARCH_POLICY_VERSION,
  readiness: "UNKNOWN",
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureType: null,
  lastFailureDetail: null,
  successCount: 0,
  failureCount: 0,
};

export function getExternalSearchHealth(): ExternalSearchHealth {
  return { ...health };
}

export function recordSearchAttempt(response: ExternalSearchResponse): void {
  health.provider = response.provider;
  health.policyVersion = response.policyVersion;
  if (isSearchSuccess(response.outcome)) {
    health.successCount += 1;
    health.lastSuccessAt = response.attemptedAt;
    health.readiness = "READY";
    return;
  }
  health.failureCount += 1;
  health.lastFailureAt = response.attemptedAt;
  health.lastFailureType = response.outcome;
  health.lastFailureDetail = response.error;
  health.readiness = health.lastSuccessAt ? "DEGRADED" : "UNAVAILABLE";
}

export function resetExternalSearchHealth(): void {
  health.readiness = "UNKNOWN";
  health.lastSuccessAt = null;
  health.lastFailureAt = null;
  health.lastFailureType = null;
  health.lastFailureDetail = null;
  health.successCount = 0;
  health.failureCount = 0;
}

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

interface FirecrawlWebResult {
  url?: string;
  title?: string;
  description?: string;
  position?: number;
  publishedDate?: string;
  date?: string;
}

/**
 * Firecrawl search through the Lovable connector gateway. Structured results,
 * no HTML scraping of a consumer search page, so bot walls cannot masquerade
 * as empty result sets.
 */
export function createFirecrawlSearchProvider(options: {
  lovableApiKey: string;
  connectionKey: string;
  timeoutMs?: number;
}): ExternalSearchProvider {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const provider = "firecrawl/v2-search";

  return {
    name: provider,
    policyVersion: EXTERNAL_SEARCH_POLICY_VERSION,
    async search(query, limit) {
      const attemptedAt = new Date().toISOString();
      const startedAt = Date.now();
      const base = {
        query,
        provider,
        policyVersion: EXTERNAL_SEARCH_POLICY_VERSION,
        attemptedAt,
        rawResultCount: 0,
      };
      const finish = (
        outcome: SearchOutcome,
        results: ExternalSearchResult[],
        error: string | null,
        rawResultCount = results.length,
      ): ExternalSearchResponse => {
        const response: ExternalSearchResponse = {
          ...base,
          outcome,
          results,
          rawResultCount,
          error,
          latencyMs: Date.now() - startedAt,
        };
        recordSearchAttempt(response);
        return response;
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${GATEWAY}/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.lovableApiKey}`,
            "X-Connection-Api-Key": options.connectionKey,
          },
          body: JSON.stringify({ query, limit }),
          signal: controller.signal,
        });

        const bodyText = await res.text();
        if (!res.ok) {
          const outcome = looksLikeChallenge(bodyText)
            ? "BOT_OR_CHALLENGE_RESPONSE"
            : classifyHttpFailure(res.status);
          return finish(outcome, [], `http ${res.status}: ${bodyText.slice(0, 300)}`);
        }
        if (looksLikeChallenge(bodyText)) {
          return finish("BOT_OR_CHALLENGE_RESPONSE", [], "challenge content in provider response");
        }

        let parsed: { success?: boolean; error?: string; data?: { web?: FirecrawlWebResult[] } };
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          return finish("FAILED", [], "provider returned non-JSON body");
        }
        if (parsed.success === false) {
          return finish("PROVIDER_UNAVAILABLE", [], parsed.error ?? "provider reported failure");
        }

        const web = parsed.data?.web ?? [];
        const fetchedAt = new Date().toISOString();
        const results = dedupeResults(
          web
            .filter((r): r is FirecrawlWebResult & { url: string } => Boolean(r?.url))
            .map((r, i) => ({
              query,
              provider,
              title: r.title ?? null,
              url: r.url,
              snippet: r.description ?? null,
              publishedAt: r.publishedDate ?? r.date ?? null,
              rank: r.position ?? i + 1,
              fetchedAt,
            })),
        );

        return finish(
          results.length > 0 ? "SUCCESS_WITH_RESULTS" : "SUCCESS_NO_RESULTS",
          results,
          null,
          web.length,
        );
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        return finish(
          aborted ? "TIMEOUT" : "PROVIDER_UNAVAILABLE",
          [],
          error instanceof Error ? error.message.slice(0, 300) : String(error),
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Provider used when no search credentials are configured: always unavailable, never "empty". */
export function createUnavailableSearchProvider(reason: string): ExternalSearchProvider {
  return {
    name: "unconfigured",
    policyVersion: EXTERNAL_SEARCH_POLICY_VERSION,
    async search(query) {
      const response: ExternalSearchResponse = {
        query,
        provider: "unconfigured",
        policyVersion: EXTERNAL_SEARCH_POLICY_VERSION,
        outcome: "PROVIDER_UNAVAILABLE",
        results: [],
        rawResultCount: 0,
        error: reason,
        latencyMs: 0,
        attemptedAt: new Date().toISOString(),
      };
      recordSearchAttempt(response);
      return response;
    },
  };
}

/** Builds the configured provider from server env, or an explicitly unavailable one. */
export function resolveExternalSearchProvider(): ExternalSearchProvider {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableApiKey || !connectionKey) {
    return createUnavailableSearchProvider("Search provider credentials are not configured.");
  }
  return createFirecrawlSearchProvider({ lovableApiKey, connectionKey });
}
