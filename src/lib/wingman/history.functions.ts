/**
 * History live-mode server functions.
 *
 * Read + lightweight-observation surface only. No scan run is ever created,
 * no historical scan row is mutated, no baseline is rewritten.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  refreshLiveMarkets,
  type LiveMarketRefreshResult,
} from "./services/history/live-market.server";

export const refreshHistoryLiveMarkets = createServerFn({ method: "POST" })
  .inputValidator((input: { addresses: string[]; persist?: boolean }) => ({
    addresses: Array.isArray(input?.addresses) ? input.addresses.map(String) : [],
    persist: input?.persist !== false,
  }))
  .handler(
    async ({ data }): Promise<LiveMarketRefreshResult> =>
      refreshLiveMarkets(data.addresses, { persist: data.persist }),
  );
