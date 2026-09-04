/**
 * Birdeye readiness preflight (server-only).
 *
 * Deliberately the smallest authoritative call available: one token-list page
 * of a single row, no retries. It costs a fraction of a discovery sweep and
 * tells us whether the provider will answer at all.
 */
import { birdeyeRequest, isBirdeyeConfigured } from "./client.server";
import { BirdeyeError } from "./errors";
import {
  readinessFromErrorCode,
  type ProviderReadiness,
} from "./readiness";

export interface PreflightOptions {
  /** Injected in tests. */
  probe?: () => Promise<unknown>;
  timeoutMs?: number;
}

export async function checkBirdeyeReadiness(
  options: PreflightOptions = {},
): Promise<ProviderReadiness> {
  const checkedAt = new Date().toISOString();
  const base = {
    provider: "birdeye" as const,
    checkedAt,
    quotaRemaining: null,
    quotaResetAt: null,
  };

  if (!options.probe && !isBirdeyeConfigured()) {
    return { ...base, state: "NOT_CONFIGURED", reason: "No Birdeye API key configured." };
  }

  const probe =
    options.probe ??
    (() =>
      birdeyeRequest<unknown>(
        "/defi/v3/token/list",
        { sort_by: "liquidity", sort_type: "desc", offset: 0, limit: 1 },
        { chain: "solana", maxAttempts: 1, timeoutMs: options.timeoutMs ?? 8_000 },
      ));

  try {
    await probe();
    return { ...base, state: "AVAILABLE", reason: null };
  } catch (error) {
    if (error instanceof BirdeyeError) {
      return {
        ...base,
        state: readinessFromErrorCode(error.code),
        reason: error.message,
      };
    }
    return { ...base, state: "UNKNOWN_FAILURE", reason: "Discovery provider probe failed." };
  }
}
