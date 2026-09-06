/**
 * Centralized DexScreener request layer.
 *
 * Every DexScreener call in Wingman goes through `dexRequest`. Keeping a
 * single choke point means caching, retry/backoff, batching and rate-limit
 * handling can be added here later without touching any service.
 *
 * Today it provides: timeouts, status mapping, JSON validation, a short TTL
 * response cache and in-flight de-duplication (so one ingestion never asks
 * for the same token twice).
 */
import { ExternalDataError } from "./errors";

const BASE_URL = "https://api.dexscreener.com";
const DEFAULT_TIMEOUT_MS = 8_000;
/** Short cache — long enough to dedupe within one operation, not to stale data. */
const CACHE_TTL_MS = 10_000;

interface CacheEntry {
  at: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

export interface DexRequestOptions {
  timeoutMs?: number;
  /** Skip the short TTL cache (used by explicit "refresh now" paths). */
  noCache?: boolean;
}

export async function dexRequest<T>(path: string, options: DexRequestOptions = {}): Promise<T> {
  const key = path;

  if (!options.noCache) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
    const pending = inFlight.get(key);
    if (pending) return (await pending) as T;
  }

  const promise = execute<T>(path, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise as Promise<unknown>);
  return promise;
}

async function execute<T>(path: string, timeoutMs: number): Promise<T> {
  // Every DexScreener request is paced by ONE process-wide controller.
  return dexRateLimiter.schedule(() => performRequest<T>(path, timeoutMs));
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers?.get?.("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.round((at - Date.now()) / 1000));
}

async function performRequest<T>(path: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    dexRateLimiter.penalize(null, 5_000);
    if (error instanceof Error && error.name === "AbortError") {
      throw new ExternalDataError("PROVIDER_TIMEOUT");
    }
    throw new ExternalDataError("PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response);
    dexRateLimiter.penalize(retryAfter);
    throw new ExternalDataError("RATE_LIMITED", undefined, retryAfter);
  }
  if (response.status === 404) throw new ExternalDataError("TOKEN_NOT_FOUND");
  if (!response.ok) throw new ExternalDataError("PROVIDER_UNAVAILABLE");

  try {
    return (await response.json()) as T;
  } catch {
    throw new ExternalDataError("MALFORMED_RESPONSE");
  }
}

/** Test/maintenance helper — drops the short TTL cache. */
export function resetDexCache(): void {
  cache.clear();
  inFlight.clear();
}
