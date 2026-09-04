/**
 * Birdeye token trade-data acquisition (server-only).
 *
 * Endpoint: GET /defi/v3/token/trade-data/single?address=<mint>  (x-chain: solana)
 *
 * One request returns trade counts, buy/sell counts, unique wallet counts and
 * volume for every provider window (1m … 24h) plus the previous comparable
 * window and provider change percentages. Wingman uses 30m / 1h / 4h / 24h, so
 * participation costs exactly ONE request per token.
 *
 * Credentials, timeouts, retry/backoff and 429 handling stay in
 * `client.server.ts`. Provider failures raise `BirdeyeError` — callers treat
 * them as UNKNOWN, never as zero.
 */
import { supportsChain } from "../capabilities";
import { DEFAULT_CHAIN } from "../chains";
import { birdeyeRequest, isBirdeyeConfigured, type BirdeyeRequestOptions } from "./client.server";
import { BirdeyeError } from "./errors";
import { normalizeTradeData, type NormalizedParticipation } from "./trade-data-normalizer";
import type { BeTradeDataSingle } from "./types";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function fetchTokenParticipation(
  address: string,
  options: { chain?: string; capturedAt?: string; request?: BirdeyeRequestOptions } = {},
): Promise<NormalizedParticipation> {
  const chain = options.chain ?? DEFAULT_CHAIN;
  if (!isBirdeyeConfigured()) throw new BirdeyeError("NOT_CONFIGURED");
  if (!SOLANA_ADDRESS_RE.test(address.trim())) throw new BirdeyeError("INVALID_ADDRESS");
  if (!supportsChain("birdeye", "token_trade_data", chain)) {
    throw new BirdeyeError("UNSUPPORTED_CHAIN");
  }

  const data = await birdeyeRequest<BeTradeDataSingle>(
    "/defi/v3/token/trade-data/single",
    { address },
    { chain, ...options.request },
  );

  return normalizeTradeData(data, {
    tokenAddress: address,
    chain,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
  });
}
