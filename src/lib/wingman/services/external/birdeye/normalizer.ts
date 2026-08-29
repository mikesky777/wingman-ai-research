/**
 * Birdeye → Wingman normalization.
 *
 * Rules:
 *   - Missing/unparseable values become null ("unavailable"), never 0.
 *   - A genuine provider 0 stays 0.
 *   - Cohorts (bundler / sniper / insider / dev / smart_trader) are kept
 *     independent. They are NEVER summed: wallets may hold several labels and
 *     no wallet-level de-duplication exists yet.
 *   - Top-holder concentration is RAW wallet concentration. No LP, burn,
 *     treasury, program or exchange wallet has been excluded.
 */
import type {
  BeHolderDistributionData,
  BeHolderProfileData,
  BeHolderTag,
  BeMarketData,
} from "./types";

export const BIRDEYE_SOURCE = "birdeye";
export const BIRDEYE_INGESTION_VERSION = "birdeye-ingest/v1";
/** Birdeye's wallet-label methodology version we are recording against. */
export const BIRDEYE_LABEL_SEMANTICS_VERSION = "birdeye-holder-profile/2026-04";
/** Bundler tagging is considered accurate for tokens created on/after this date. */
export const BUNDLER_COVERAGE_FROM = Date.UTC(2026, 2, 1);

export type Maybe<T> = T | null;

export function num(value: unknown): Maybe<number> {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function int(value: unknown): Maybe<number> {
  const n = num(value);
  return n === null ? null : Math.trunc(n);
}

function isoFromUnixSeconds(value: unknown): Maybe<string> {
  const n = num(value);
  if (n === null || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const BIRDEYE_COHORTS = ["bundler", "sniper", "insider", "dev", "smart_trader"] as const;
export type BirdeyeCohort = (typeof BIRDEYE_COHORTS)[number];

export interface NormalizedCohort {
  /** Provider label — a Birdeye claim, not a universal truth. */
  cohort: BirdeyeCohort;
  walletCount: Maybe<number>;
  pctOfSupply: Maybe<number>;
  buyVolumeUsd: Maybe<number>;
  sellVolumeUsd: Maybe<number>;
  avgBuyPriceUsd: Maybe<number>;
  unrealizedPnlUsd: Maybe<number>;
}

export interface NormalizedHolderDistribution {
  capturedAt: string;
  chain: string;
  tokenAddress: string;
  /** Grouped by owner wallet, NOT by token account. */
  addressType: "wallet";
  mode: "top";
  walletHolderCount: Maybe<number>;
  top10WalletPctOfTotalSupply: Maybe<number>;
  /** Derived from wallet balances + total supply when both are available. */
  top20WalletPctOfTotalSupply: Maybe<number>;
  totalSupply: Maybe<number>;
  sourceReference: string;
}

export interface NormalizedHolderProfile {
  capturedAt: string;
  chain: string;
  tokenAddress: string;
  includeZeroBalance: false;
  tokenCreatedAt: Maybe<string>;
  marketCapUsd: Maybe<number>;
  liquidityUsd: Maybe<number>;
  volume1hUsd: Maybe<number>;
  buyVolume1hUsd: Maybe<number>;
  sellVolume1hUsd: Maybe<number>;
  top10WalletPctOfTotalSupply: Maybe<number>;
  labeledHolderCount: Maybe<number>;
  labeledPctOfSupply: Maybe<number>;
  /** Only cohorts the provider actually returned. Absent stays unavailable. */
  cohorts: NormalizedCohort[];
  sourceReference: string;
}

function normalizeCohort(tag: BeHolderTag): NormalizedCohort | null {
  const name = (tag.tag ?? "").trim() as BirdeyeCohort;
  if (!BIRDEYE_COHORTS.includes(name)) return null;
  return {
    cohort: name,
    walletCount: int(tag.holder_count),
    pctOfSupply: num(tag.percent_of_supply),
    buyVolumeUsd: num(tag.buy_volume_usd),
    sellVolumeUsd: num(tag.sell_volume_usd),
    avgBuyPriceUsd: num(tag.avg_buy_price),
    unrealizedPnlUsd: num(tag.pnl),
  };
}

export function normalizeHolderDistribution(
  data: BeHolderDistributionData,
  context: { tokenAddress: string; chain: string; capturedAt: string; marketData?: BeMarketData | null },
): NormalizedHolderDistribution {
  const totalSupply = num(context.marketData?.total_supply);
  const items = Array.isArray(data.items) ? data.items : [];
  let top20: Maybe<number> = null;
  if (totalSupply !== null && totalSupply > 0 && items.length >= 20) {
    const summed = items.slice(0, 20).reduce((acc, item) => acc + (num(item.amount) ?? 0), 0);
    top20 = (summed / totalSupply) * 100;
  }

  return {
    capturedAt: context.capturedAt,
    chain: context.chain,
    tokenAddress: context.tokenAddress,
    addressType: "wallet",
    mode: "top",
    walletHolderCount: int(data.holder),
    top10WalletPctOfTotalSupply: num(data.top10_hold_percent),
    top20WalletPctOfTotalSupply: top20,
    totalSupply,
    sourceReference: "birdeye:/defi/v3/token/holder?mode=wallet",
  };
}

export function normalizeHolderProfile(
  data: BeHolderProfileData,
  context: { tokenAddress: string; chain: string; capturedAt: string },
): NormalizedHolderProfile {
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return {
    capturedAt: context.capturedAt,
    chain: context.chain,
    tokenAddress: context.tokenAddress,
    includeZeroBalance: false,
    tokenCreatedAt: isoFromUnixSeconds(data.token?.creation_time),
    marketCapUsd: num(data.token?.market_cap),
    liquidityUsd: num(data.token?.liquidity),
    volume1hUsd: num(data.token?.volume_1h_usd),
    buyVolume1hUsd: num(data.token?.buy_volume_1h_usd),
    sellVolume1hUsd: num(data.token?.sell_volume_1h_usd),
    top10WalletPctOfTotalSupply: num(data.token?.top10_holder?.percent_of_supply),
    labeledHolderCount: int(data.holder_summary?.total_holder),
    labeledPctOfSupply: num(data.holder_summary?.percent_of_supply),
    cohorts: tags
      .map(normalizeCohort)
      .filter((c): c is NormalizedCohort => c !== null),
    sourceReference: "birdeye:/token/v1/holder-profile",
  };
}

/** True when bundler tagging predates Birdeye's accurate-coverage window. */
export function bundlerCoverageLimited(tokenCreatedAt: string | null): boolean | null {
  if (!tokenCreatedAt) return null;
  const t = new Date(tokenCreatedAt).getTime();
  if (Number.isNaN(t)) return null;
  return t < BUNDLER_COVERAGE_FROM;
}
