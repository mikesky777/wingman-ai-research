/**
 * Batched live-market resolution (server-only).
 *
 * Uses the existing DexScreener batch endpoint (30 addresses per request) so
 * the universal market gate costs a handful of provider calls per scan.
 * A failed batch marks its chunk unresolved — it never silently passes.
 */
import { DexScreenerAdapter } from "../external/dexscreener";
import type { DsPair } from "../external/dexscreener/types";
import { assessMarket, type MarketResolution } from "./market-eligibility";

const BATCH_SIZE = 30;

export type TrackFn = <T>(provider: string, capability: string, fn: () => Promise<T>) => Promise<T>;

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

export async function resolveMarkets(
  addresses: string[],
  options: { track?: TrackFn } = {},
): Promise<Map<string, MarketResolution>> {
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  const out = new Map<string, MarketResolution>();
  const track: TrackFn = options.track ?? ((_p, _c, fn) => fn());

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    let pairs: DsPair[] = [];
    let failed = false;
    try {
      pairs = await track("dexscreener", "market_eligibility", () =>
        DexScreenerAdapter.getPairsForTokens(chunk),
      );
    } catch {
      failed = true;
    }

    if (failed) {
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

  return out;
}
