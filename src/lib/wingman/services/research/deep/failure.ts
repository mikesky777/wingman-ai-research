/**
 * Deep Research failure classification (pure).
 *
 * A run that could not execute is NOT a research finding. Credit exhaustion,
 * rate limits and transient provider errors say nothing about the token: they
 * must never be read as "insufficient external evidence", as a SKIP, or as a
 * blocked market state. Only execution failures classified retryable here may
 * be re-attempted by the retry batch.
 */

export type ResearchFailureType =
  | "AI_CREDIT_LIMIT"
  | "AI_RATE_LIMIT"
  | "AI_PROVIDER_TRANSIENT"
  | "AI_CONFIG"
  | "AI_REQUEST_REJECTED"
  | "SEARCH_PROVIDER_TRANSIENT"
  | "UNKNOWN";

export interface ResearchFailureClassification {
  type: ResearchFailureType;
  /** Structured, persisted code surfaced in diagnostics and the UI. */
  code: string;
  retryable: boolean;
}

const CODES: Record<ResearchFailureType, string> = {
  AI_CREDIT_LIMIT: "FAILED_AI_CREDIT_LIMIT",
  AI_RATE_LIMIT: "FAILED_AI_RATE_LIMIT",
  AI_PROVIDER_TRANSIENT: "FAILED_AI_PROVIDER_TRANSIENT",
  AI_CONFIG: "FAILED_AI_CONFIGURATION",
  AI_REQUEST_REJECTED: "FAILED_AI_REQUEST_REJECTED",
  SEARCH_PROVIDER_TRANSIENT: "FAILED_SEARCH_PROVIDER_TRANSIENT",
  UNKNOWN: "FAILED_UNKNOWN",
};

/** Execution failures worth retrying once budget/credits are available again. */
const RETRYABLE: ResearchFailureType[] = [
  "AI_CREDIT_LIMIT",
  "AI_RATE_LIMIT",
  "AI_PROVIDER_TRANSIENT",
  "SEARCH_PROVIDER_TRANSIENT",
];

export function classifyResearchFailure(
  message: string | null | undefined,
): ResearchFailureClassification {
  const text = (message ?? "").toLowerCase();
  const status = text.match(/\((\d{3})\)/)?.[1] ?? null;

  let type: ResearchFailureType = "UNKNOWN";
  if (
    text.includes("credit_limit_reached") ||
    text.includes("credit limit") ||
    text.includes("insufficient credits") ||
    text.includes("payment required") ||
    status === "402"
  ) {
    type = "AI_CREDIT_LIMIT";
  } else if (status === "403" && text.includes("credit")) {
    type = "AI_CREDIT_LIMIT";
  } else if (status === "429" || text.includes("rate limit")) {
    type = "AI_RATE_LIMIT";
  } else if (status && Number(status) >= 500) {
    type = "AI_PROVIDER_TRANSIENT";
  } else if (text.includes("external search") ||
    text.includes("search_provider_unavailable") ||
    text.includes("firecrawl")) {
    type = "SEARCH_PROVIDER_TRANSIENT";
  } else if (status === "401" || text.includes("api key")) {
    type = "AI_CONFIG";
  } else if (status === "400" || status === "403") {
    type = "AI_REQUEST_REJECTED";
  } else if (text.includes("empty response") || text.includes("timeout") || text.includes("fetch failed")) {
    type = "AI_PROVIDER_TRANSIENT";
  }

  return { type, code: CODES[type], retryable: RETRYABLE.includes(type) };
}

export function isRetryableResearchFailure(message: string | null | undefined): boolean {
  return classifyResearchFailure(message).retryable;
}
