/**
 * Centralized DexScreener request controller.
 *
 * Every DexScreener request in Wingman queues through one controller, so a
 * background sampler, a manual refresh and an ingestion path can never
 * independently consume the provider budget.
 *
 * Pure and injectable (`now` / `sleep`) so behavior is testable without
 * real time or a network.
 */

/** Minimum spacing between two provider requests (conservative ceiling). */
export const DEX_MIN_REQUEST_INTERVAL_MS =
  process.env["NODE_ENV"] === "test" ? 0 : 1_200;

/** Never more than one in-flight DexScreener request. */
export const DEX_MAX_CONCURRENCY = 1;

export interface RateLimitControllerOptions {
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RateLimitController {
  /** Queue a request; resolves once the pacing/backoff window allows it. */
  schedule: <T>(task: () => Promise<T>) => Promise<T>;
  /** Record a provider-imposed cooldown (429 `Retry-After`, seconds). */
  penalize: (retryAfterSeconds: number | null, fallbackMs?: number) => void;
  /** Milliseconds until the controller would let the next request through. */
  waitMs: () => number;
}

export function createRateLimitController(
  options: RateLimitControllerOptions = {},
): RateLimitController {
  const minInterval = options.minIntervalMs ?? DEX_MIN_REQUEST_INTERVAL_MS;
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ?? ((wait: number) => new Promise<void>((resolve) => setTimeout(resolve, wait)));

  let nextAllowedAt = 0;
  let chain: Promise<unknown> = Promise.resolve();

  const waitMs = () => Math.max(0, nextAllowedAt - now());

  const run = async <T>(task: () => Promise<T>): Promise<T> => {
    const wait = waitMs();
    if (wait > 0) await sleep(wait);
    nextAllowedAt = now() + minInterval;
    return task();
  };

  return {
    waitMs,
    penalize(retryAfterSeconds, fallbackMs = 30_000) {
      const cooldown =
        retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : fallbackMs;
      nextAllowedAt = Math.max(nextAllowedAt, now() + cooldown);
    },
    schedule<T>(task: () => Promise<T>): Promise<T> {
      // Serialized queue: concurrency is structurally capped at one.
      const result = chain.then(() => run(task));
      chain = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

/** Process-wide controller shared by every DexScreener caller. */
export const dexRateLimiter = createRateLimitController();
