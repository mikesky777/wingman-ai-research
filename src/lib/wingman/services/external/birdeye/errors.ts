/**
 * Birdeye adapter errors. Callers see a stable code and a safe message; API
 * keys, URLs and provider internals are never surfaced.
 */
export type BirdeyeErrorCode =
  | "NOT_CONFIGURED"
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_CAPABILITY"
  | "INVALID_ADDRESS"
  | "TOKEN_NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "MALFORMED_RESPONSE";

const SAFE_MESSAGES: Record<BirdeyeErrorCode, string> = {
  NOT_CONFIGURED: "Holder intelligence is not configured.",
  UNSUPPORTED_CHAIN: "Holder intelligence is only available for Solana tokens.",
  UNSUPPORTED_CAPABILITY: "This holder capability is not available for this token.",
  INVALID_ADDRESS: "That does not look like a valid Solana contract address.",
  TOKEN_NOT_FOUND: "No holder data is indexed for this token.",
  PROVIDER_UNAVAILABLE: "Holder data provider is currently unavailable.",
  PROVIDER_TIMEOUT: "Holder data provider did not respond in time.",
  RATE_LIMITED: "Holder data rate limit reached. Try again shortly.",
  UNAUTHORIZED: "Holder data credentials were rejected.",
  MALFORMED_RESPONSE: "Holder data provider returned an unexpected response.",
};

export class BirdeyeError extends Error {
  readonly code: BirdeyeErrorCode;

  constructor(code: BirdeyeErrorCode, message?: string) {
    super(message ?? SAFE_MESSAGES[code]);
    this.name = "BirdeyeError";
    this.code = code;
  }
}

export function birdeyeSafeMessage(code: BirdeyeErrorCode): string {
  return SAFE_MESSAGES[code];
}

export function toBirdeyeFailure(error: unknown): { code: BirdeyeErrorCode; message: string } {
  if (error instanceof BirdeyeError) return { code: error.code, message: error.message };
  return { code: "PROVIDER_UNAVAILABLE", message: SAFE_MESSAGES["PROVIDER_UNAVAILABLE"] };
}
