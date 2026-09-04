/**
 * Centralized Birdeye request layer (server-only).
 *
 * Every Birdeye call goes through `birdeyeRequest`, so credentials, timeouts,
 * retry/backoff and 429 handling live in exactly one place. The API key is
 * read from the server environment at call time and never leaves this module.
 */
import { BirdeyeError } from "./errors";
import type { BeEnvelope } from "./types";

const BASE_URL = "https://public-api.birdeye.so";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 600;

export interface BirdeyeRequestOptions {
  chain?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests to avoid real waiting. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Observability hook: called before each retry with the failing code. */
  onRetry?: (info: { code: string; attempt: number }) => void;
}

export function isBirdeyeConfigured(): boolean {
  return Boolean(process.env["BIRDEYE_API_KEY"]);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retryable transport/provider conditions. Client errors are never retried. */
function isRetryable(code: string): boolean {
  return code === "RATE_LIMITED" || code === "PROVIDER_UNAVAILABLE" || code === "PROVIDER_TIMEOUT";
}

export async function birdeyeRequest<T>(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  options: BirdeyeRequestOptions = {},
): Promise<T> {
  const apiKey = process.env["BIRDEYE_API_KEY"];
  if (!apiKey) throw new BirdeyeError("NOT_CONFIGURED");

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, String(v));
  }
  const url = `${BASE_URL}${path}?${params.toString()}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const attempts = options.maxAttempts ?? MAX_ATTEMPTS;

  let lastError: BirdeyeError = new BirdeyeError("PROVIDER_UNAVAILABLE");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await execute<T>(url, apiKey, options, fetchImpl);
    } catch (error) {
      const err = error instanceof BirdeyeError ? error : new BirdeyeError("PROVIDER_UNAVAILABLE");
      lastError = err;
      if (attempt === attempts || !isRetryable(err.code)) throw err;
      options.onRetry?.({ code: err.code, attempt });
      // Exponential backoff; 429 waits an extra step.
      const factor = err.code === "RATE_LIMITED" ? 2 : 1;
      await sleep(BASE_BACKOFF_MS * factor * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function execute<T>(
  url: string,
  apiKey: string,
  options: BirdeyeRequestOptions,
  fetchImpl: typeof fetch,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "x-chain": options.chain ?? "solana",
        "X-API-KEY": apiKey,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BirdeyeError("PROVIDER_TIMEOUT");
    }
    throw new BirdeyeError("PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) throw new BirdeyeError("RATE_LIMITED");
  if (response.status === 401 || response.status === 403) throw new BirdeyeError("UNAUTHORIZED");
  if (response.status === 404) throw new BirdeyeError("TOKEN_NOT_FOUND");
  if (!response.ok) throw new BirdeyeError("PROVIDER_UNAVAILABLE");

  let payload: BeEnvelope<T>;
  try {
    payload = (await response.json()) as BeEnvelope<T>;
  } catch {
    throw new BirdeyeError("MALFORMED_RESPONSE");
  }

  if (payload?.success === false) {
    // Hard quota exhaustion is definitive and must never be retried; ordinary
    // rate limits are transient and stay retryable.
    if (/compute unit|usage limit|quota/i.test(payload.message ?? "")) {
      throw new BirdeyeError("QUOTA_EXHAUSTED", payload.message ?? undefined);
    }
    if (/too many requests/i.test(payload.message ?? "")) throw new BirdeyeError("RATE_LIMITED");
    if (/not found/i.test(payload.message ?? "")) throw new BirdeyeError("TOKEN_NOT_FOUND");
    throw new BirdeyeError("MALFORMED_RESPONSE");
  }
  if (payload?.data === undefined || payload.data === null) {
    throw new BirdeyeError("MALFORMED_RESPONSE");
  }
  return payload.data;
}
