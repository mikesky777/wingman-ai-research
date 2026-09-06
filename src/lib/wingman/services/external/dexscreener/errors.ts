/**
 * Application-level errors for external market-data ingestion.
 *
 * Callers (and ultimately the UI) see a stable `code` + safe message.
 * Raw exception text, URLs and provider internals are never surfaced.
 */

export type ExternalDataErrorCode =
  | "INVALID_ADDRESS"
  | "TOKEN_NOT_FOUND"
  | "NO_ELIGIBLE_PAIR"
  | "PAIR_WITHOUT_LIQUIDITY"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "RATE_LIMITED"
  | "PERSISTENCE_FAILED";

const SAFE_MESSAGES: Record<ExternalDataErrorCode, string> = {
  INVALID_ADDRESS: "That does not look like a valid Solana contract address.",
  TOKEN_NOT_FOUND: "DexScreener has no indexed market data for this token.",
  NO_ELIGIBLE_PAIR: "No eligible Solana trading pair was found for this token.",
  PAIR_WITHOUT_LIQUIDITY: "The token's pools report no usable liquidity.",
  PROVIDER_UNAVAILABLE: "DexScreener is currently unavailable. Try again shortly.",
  PROVIDER_TIMEOUT: "DexScreener did not respond in time. Try again shortly.",
  MALFORMED_RESPONSE: "DexScreener returned an unexpected response.",
  RATE_LIMITED: "DexScreener rate limit reached. Wait a moment before retrying.",
  PERSISTENCE_FAILED: "Live data was fetched but could not be stored.",
};

export class ExternalDataError extends Error {
  readonly code: ExternalDataErrorCode;
  /** Provider-supplied cooldown (seconds) when the response carried one. */
  readonly retryAfterSeconds: number | null;

  constructor(
    code: ExternalDataErrorCode,
    message?: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(message ?? SAFE_MESSAGES[code]);
    this.name = "ExternalDataError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function safeMessageFor(code: ExternalDataErrorCode): string {
  return SAFE_MESSAGES[code];
}

export interface IngestFailure {
  ok: false;
  code: ExternalDataErrorCode;
  message: string;
}

export function toFailure(error: unknown): IngestFailure {
  if (error instanceof ExternalDataError) {
    return { ok: false, code: error.code, message: error.message };
  }
  // Never leak raw exception details to the client.
  return { ok: false, code: "PROVIDER_UNAVAILABLE", message: safeMessageFor("PROVIDER_UNAVAILABLE") };
}
