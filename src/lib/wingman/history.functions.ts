/**
 * History live-mode + funnel-stage server functions.
 *
 * Read + lightweight-observation surface only. No scan run is ever created,
 * no historical scan row is mutated, no baseline is rewritten.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  refreshLiveMarkets,
  type LiveMarketRefreshResult,
} from "./services/history/live-market.server";
import {
  backfillStageMilestones,
  type MilestoneBackfillResult,
} from "./services/history/milestones.server";

export const refreshHistoryLiveMarkets = createServerFn({ method: "POST" })
  .inputValidator((input: { addresses: string[]; persist?: boolean }) => ({
    addresses: Array.isArray(input?.addresses) ? input.addresses.map(String) : [],
    persist: input?.persist !== false,
  }))
  .handler(
    async ({ data }): Promise<LiveMarketRefreshResult> =>
      refreshLiveMarkets(data.addresses, { persist: data.persist }),
  );

/**
 * Append missing SETUP_QUALIFIED / SURVIVOR milestones derived from persisted
 * scanner and outcome records. Existing milestones are never rewritten and no
 * AI stage record is ever created here.
 */
export const syncStageMilestones = createServerFn({ method: "POST" }).handler(
  async (): Promise<MilestoneBackfillResult> => backfillStageMilestones(),
);

/** Production funnel artifacts for History (read-only, calibration excluded). */
export const getProductionArtifacts = createServerFn({ method: "GET" }).handler(async () => {
  const { loadProductionArtifacts } = await import(
    "./services/research/production-view.server"
  );
  return loadProductionArtifacts();
});
