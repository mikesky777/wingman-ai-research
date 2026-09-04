/**
 * Discovery provider readiness (pure, deterministic).
 *
 * One question: can the discovery provider execute a scan right now?
 *
 * Readiness is derived ONLY from authoritative provider responses. Nothing
 * here guesses remaining compute units, quota windows or reset times — when
 * the provider does not tell us, the answer is explicitly unavailable.
 *
 * This module changes no scoring, no selection and no discovery_health/v1
 * semantics. A provider failure is never an empty scan.
 *
 * FUTURE (documented, deliberately NOT implemented): a fallback discovery
 * provider interface. Any alternate discovery source must
 *   - identify its provider/source explicitly on every discovered token,
 *   - preserve provenance end-to-end into candidates and evidence,
 *   - be measured independently (its own health, its own diagnostics),
 *   - trigger an explicit scanner discovery-policy/version review before use.
 * A different universe must never be silently substituted for Birdeye's.
 */
import type { BirdeyeErrorCode } from "./errors";

export const PROVIDER_READINESS_VERSION = "provider_readiness/v1";

export type ProviderReadinessState =
  | "AVAILABLE"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "AUTH_FAILED"
  | "NOT_CONFIGURED"
  | "UNKNOWN_FAILURE";

export interface ProviderReadiness {
  provider: "birdeye";
  state: ProviderReadinessState;
  /** Authoritative provider message, when one was returned. */
  reason: string | null;
  checkedAt: string;
  /** Provider does not expose these; kept explicit so the UI never fabricates. */
  quotaRemaining: null;
  quotaResetAt: null;
}

/** Maps an authoritative adapter error code to a readiness state. */
export function readinessFromErrorCode(code: BirdeyeErrorCode): ProviderReadinessState {
  switch (code) {
    case "QUOTA_EXHAUSTED":
      return "QUOTA_EXHAUSTED";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "UNAUTHORIZED":
      return "AUTH_FAILED";
    case "NOT_CONFIGURED":
      return "NOT_CONFIGURED";
    default:
      return "UNKNOWN_FAILURE";
  }
}

/**
 * Hard exhaustion is definitive: retrying burns nothing useful and only
 * deepens the deficit. Transport errors, ordinary rate limits and temporary
 * provider errors stay retryable elsewhere.
 */
export function isHardBlock(state: ProviderReadinessState): boolean {
  return state === "QUOTA_EXHAUSTED" || state === "AUTH_FAILED" || state === "NOT_CONFIGURED";
}

/**
 * Fail-fast decision taken immediately before a scan issues its discovery
 * queries. Uncertain states still attempt a normal scan.
 */
export function shouldFailFast(readiness: ProviderReadiness): boolean {
  return isHardBlock(readiness.state);
}

export function readinessBlockReason(readiness: ProviderReadiness): string {
  const label =
    readiness.state === "QUOTA_EXHAUSTED"
      ? "Discovery provider quota exhausted"
      : readiness.state === "AUTH_FAILED"
        ? "Discovery provider credentials rejected"
        : "Discovery provider not configured";
  return readiness.reason ? `${label}: ${readiness.reason}` : `${label}.`;
}

export const READINESS_LABELS: Record<ProviderReadinessState, string> = {
  AVAILABLE: "AVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  QUOTA_EXHAUSTED: "QUOTA_EXHAUSTED",
  AUTH_FAILED: "AUTH_FAILED",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  UNKNOWN_FAILURE: "UNKNOWN_FAILURE",
};
