/**
 * Batched live-market resolution (server-only).
 *
 * Uses the existing DexScreener batch endpoint (30 addresses per request) so
 * the universal market gate costs a handful of provider calls per scan.
 * A failed batch is retried; only an exhausted batch marks its chunk as a
 * PROVIDER FAILURE — which is never the same thing as a confirmed absent
 * market.
 */
import { DexScreenerAdapter } from "../external/dexscreener";
import type { DsPair } from "../external/dexscreener/types";
import { assessMarket, type MarketResolution } from "./market-eligibility";

const BATCH_SIZE = 30;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [400, 1200];

export type TrackFn = <T>(provider: string, capability: string, fn: () => Promise<T>) => Promise<T>;

export interface MarketResolutionResult {
  resolutions: Map<string, MarketResolution>;
  /** Batches attempted in this resolution pass. */
  batches: number;
  /** Batches that failed after every retry attempt. */
  failedBatches: number;
  /** Distinct provider error codes seen (diagnostics only). */
  errorCodes: string[];
}

function groupPairsByToken(pairs: DsPair[]): Map<string, DsPair[]> {
  const byToken = new Map<string, DsPair[]>();
  for (const pair of pairs) {
    for (const ref of [pair.baseToken?.address, pair.quoteToken?.address]) {
      if (!ref) continue;
      const list = byToken.get(ref) ?? [];
      list.push(pair);
      byToken.set(ref, list);
    }
  }
  return byToken;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function resolveMarketsDetailed(
  addresses: string[],
  options: { track?: TrackFn } = {},
): Promise<MarketResolutionResult> {
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  const out = new Map<string, MarketResolution>();
  const track: TrackFn = options.track ?? ((_p, _c, fn) => fn());
  const errorCodes = new Set<string>();
  let batches = 0;
  let failedBatches = 0;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    batches += 1;
    let pairs: DsPair[] | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        pairs = await track("dexscreener", "market_eligibility", () =>
          DexScreenerAdapter.getPairsForTokens(chunk),
        );
        break;
      } catch (error) {
        errorCodes.add(
          error instanceof Error && error.message ? error.message : "PROVIDER_UNAVAILABLE",
        );
        const backoff = RETRY_BACKOFF_MS[attempt];
        if (attempt < MAX_ATTEMPTS - 1 && typeof backoff === "number") await wait(backoff);
      }
    }

    if (pairs === null) {
      failedBatches += 1;
      for (const address of chunk) {
        out.set(address, {
          ok: false,
          pairAddress: null,
          liquidityUsd: null,
          reasonDetail: "DexScreener market lookup was unavailable for this candidate.",
          // Distinguishes provider failure from a confirmed absent market.
          providerFailure: true,
        });
      }
      continue;
    }

    const byToken = groupPairsByToken(pairs);
    for (const address of chunk) {
      out.set(address, assessMarket(address, byToken.get(address) ?? []));
    }
  }

  return { resolutions: out, batches, failedBatches, errorCodes: [...errorCodes] };
}

/** Backwards-compatible resolution map. */
export async function resolveMarkets(
  addresses: string[],
  options: { track?: TrackFn } = {},
): Promise<Map<string, MarketResolution>> {
  return (await resolveMarketsDetailed(addresses, options)).resolutions;
}
