/**
 * Birdeye `/defi/v3/token/trade-data/single` → provider-independent
 * participation facts.
 *
 * Facts only. Nothing here interprets, scores or judges activity: that belongs
 * to `scanner/participation.ts`. Missing provider fields stay `null` — a real
 * zero stays zero and an absent field is never coerced to one.
 */
import type { BeTradeDataSingle } from "./types";

export const BIRDEYE_TRADE_DATA_REFERENCE = "birdeye:/defi/v3/token/trade-data/single";

export const PARTICIPATION_WINDOWS = ["30m", "1h", "4h", "24h"] as const;
export type ParticipationWindow = (typeof PARTICIPATION_WINDOWS)[number];

/** Raw per-window facts exactly as the provider supplied them. */
export interface ParticipationWindowFacts {
  window: ParticipationWindow;
  trades: number | null;
  buys: number | null;
  sells: number | null;
  uniqueWallets: number | null;
  volumeUsd: number | null;
  buyVolumeUsd: number | null;
  sellVolumeUsd: number | null;
  /** Provider "previous comparable window" counterparts. */
  tradesPrev: number | null;
  uniqueWalletsPrev: number | null;
  volumeUsdPrev: number | null;
  /** Provider-supplied change percentages (not derived by Wingman). */
  tradesChangePct: number | null;
  uniqueWalletsChangePct: number | null;
  volumeChangePct: number | null;
}

export interface NormalizedParticipation {
  contractAddress: string;
  chain: string;
  source: "birdeye";
  sourceReference: string;
  /** Provider observation time (last trade), when supplied. */
  observedAt: string | null;
  capturedAt: string;
  holders: number | null;
  marketCount: number | null;
  priceUsd: number | null;
  windows: Record<ParticipationWindow, ParticipationWindowFacts>;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function windowFacts(
  data: Record<string, unknown>,
  window: ParticipationWindow,
): ParticipationWindowFacts {
  const w = window;
  return {
    window,
    trades: num(data[`trade_${w}`]),
    buys: num(data[`buy_${w}`]),
    sells: num(data[`sell_${w}`]),
    uniqueWallets: num(data[`unique_wallet_${w}`]),
    volumeUsd: num(data[`volume_${w}_usd`]),
    buyVolumeUsd: num(data[`volume_buy_${w}_usd`]),
    sellVolumeUsd: num(data[`volume_sell_${w}_usd`]),
    tradesPrev: num(data[`trade_history_${w}`]),
    uniqueWalletsPrev: num(data[`unique_wallet_history_${w}`]),
    volumeUsdPrev: num(data[`volume_history_${w}_usd`]),
    tradesChangePct: num(data[`trade_${w}_change_percent`]),
    uniqueWalletsChangePct: num(data[`unique_wallet_${w}_change_percent`]),
    volumeChangePct: num(data[`volume_${w}_change_percent`]),
  };
}

export function normalizeTradeData(
  raw: BeTradeDataSingle,
  context: { tokenAddress: string; chain: string; capturedAt: string },
): NormalizedParticipation {
  const data = raw as unknown as Record<string, unknown>;
  const lastTradeUnix = num(data["last_trade_unix_time"]);
  const windows = {} as Record<ParticipationWindow, ParticipationWindowFacts>;
  for (const window of PARTICIPATION_WINDOWS) {
    windows[window] = windowFacts(data, window);
  }
  return {
    contractAddress: context.tokenAddress,
    chain: context.chain,
    source: "birdeye",
    sourceReference: BIRDEYE_TRADE_DATA_REFERENCE,
    observedAt: lastTradeUnix ? new Date(lastTradeUnix * 1000).toISOString() : null,
    capturedAt: context.capturedAt,
    holders: num(data["holder"]),
    marketCount: num(data["market"]),
    priceUsd: num(data["price"]),
    windows,
  };
}
