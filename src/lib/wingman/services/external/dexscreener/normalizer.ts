/**
 * DexScreener → Wingman normalization.
 *
 * Rules that must not be relaxed:
 *   - Missing / unparseable values become `null` ("unavailable"), never 0.
 *   - `marketCap` and `fdv` stay distinct; one never substitutes the other.
 *   - Fields DexScreener cannot supply (holders, unique buyers, top-holder
 *     concentration) are simply absent — they are not derived or guessed.
 *   - Paid boosts are recorded as descriptive metadata, never as evidence.
 */
import type { DsPair, DsTokenBoost, DsTokenProfile } from "./types";

export const INGESTION_VERSION = "dexscreener-ingest/v1";
export const DATA_SOURCE = "dexscreener";

/** Numeric value that may legitimately be unavailable. */
export type Maybe<T> = T | null;

export interface NormalizedTokenIdentity {
  contractAddress: string;
  chain: "solana";
  symbol: Maybe<string>;
  name: Maybe<string>;
  imageUrl: Maybe<string>;
  websiteUrl: Maybe<string>;
  twitterUrl: Maybe<string>;
  telegramUrl: Maybe<string>;
  dexPairAddress: Maybe<string>;
  primaryDexId: Maybe<string>;
  primaryQuoteTokenAddress: Maybe<string>;
  primaryQuoteTokenSymbol: Maybe<string>;
  pairCreatedAt: Maybe<string>;
}

export interface NormalizedPromotion {
  activeBoostCount: Maybe<number>;
  totalBoostAmount: Maybe<number>;
  hasActiveBoost: Maybe<boolean>;
  hasPaidProfile: Maybe<boolean>;
}

export interface NormalizedSnapshot {
  capturedAt: string;
  dataSource: typeof DATA_SOURCE;
  ingestionVersion: string;
  sourcePairAddress: Maybe<string>;
  sourceDexId: Maybe<string>;
  sourcePairCreatedAt: Maybe<string>;
  priceUsd: Maybe<number>;
  marketCap: Maybe<number>;
  fdv: Maybe<number>;
  liquidityUsd: Maybe<number>;
  volume5m: Maybe<number>;
  volume1h: Maybe<number>;
  volume6h: Maybe<number>;
  volume24h: Maybe<number>;
  priceChange5m: Maybe<number>;
  priceChange1h: Maybe<number>;
  priceChange6h: Maybe<number>;
  priceChange24h: Maybe<number>;
  buys5m: Maybe<number>;
  sells5m: Maybe<number>;
  buys1h: Maybe<number>;
  sells1h: Maybe<number>;
  promotion: NormalizedPromotion;
  /**
   * DexScreener cannot supply these; they stay unavailable until another
   * provider is integrated. Never fabricated.
   */
  holderCount: null;
  uniqueBuyers1h: null;
  uniqueSellers1h: null;
  top10HolderPct: null;
  top20HolderPct: null;
}

export function numberOrNull(value: unknown): Maybe<number> {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function intOrNull(value: unknown): Maybe<number> {
  const n = numberOrNull(value);
  return n === null ? null : Math.trunc(n);
}

function textOrNull(value: unknown): Maybe<string> {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isoOrNull(epochMs: unknown): Maybe<string> {
  const n = numberOrNull(epochMs);
  if (n === null || n <= 0) return null;
  const date = new Date(n);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function findSocial(pair: DsPair, type: string): Maybe<string> {
  const match = pair.info?.socials?.find((s) => s.type?.toLowerCase() === type);
  return textOrNull(match?.url);
}

/** Identity metadata carried by the selected pair. */
export function normalizeIdentity(pair: DsPair, requestedAddress: string): NormalizedTokenIdentity {
  const isBase = pair.baseToken?.address?.toLowerCase() === requestedAddress.toLowerCase();
  const self = isBase ? pair.baseToken : pair.quoteToken;
  const counterparty = isBase ? pair.quoteToken : pair.baseToken;

  return {
    contractAddress: textOrNull(self?.address) ?? requestedAddress,
    chain: "solana",
    symbol: textOrNull(self?.symbol),
    name: textOrNull(self?.name),
    imageUrl: textOrNull(pair.info?.imageUrl),
    websiteUrl: textOrNull(pair.info?.websites?.[0]?.url),
    twitterUrl: findSocial(pair, "twitter"),
    telegramUrl: findSocial(pair, "telegram"),
    dexPairAddress: textOrNull(pair.pairAddress),
    primaryDexId: textOrNull(pair.dexId),
    primaryQuoteTokenAddress: textOrNull(counterparty?.address),
    primaryQuoteTokenSymbol: textOrNull(counterparty?.symbol),
    pairCreatedAt: isoOrNull(pair.pairCreatedAt),
  };
}

export function normalizePromotion(
  pair: DsPair,
  boost?: DsTokenBoost | null,
  profile?: DsTokenProfile | null,
): NormalizedPromotion {
  const active = intOrNull(pair.boosts?.active ?? boost?.amount);
  const total = numberOrNull(boost?.totalAmount);
  return {
    activeBoostCount: active,
    totalBoostAmount: total,
    hasActiveBoost: active === null ? null : active > 0,
    hasPaidProfile: profile === undefined ? null : profile !== null,
  };
}

export function normalizeSnapshot(
  pair: DsPair,
  options: { capturedAt?: string; boost?: DsTokenBoost | null; profile?: DsTokenProfile | null } = {},
): NormalizedSnapshot {
  return {
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    dataSource: DATA_SOURCE,
    ingestionVersion: INGESTION_VERSION,
    sourcePairAddress: textOrNull(pair.pairAddress),
    sourceDexId: textOrNull(pair.dexId),
    sourcePairCreatedAt: isoOrNull(pair.pairCreatedAt),
    priceUsd: numberOrNull(pair.priceUsd),
    marketCap: numberOrNull(pair.marketCap),
    fdv: numberOrNull(pair.fdv),
    liquidityUsd: numberOrNull(pair.liquidity?.usd),
    volume5m: numberOrNull(pair.volume?.m5),
    volume1h: numberOrNull(pair.volume?.h1),
    volume6h: numberOrNull(pair.volume?.h6),
    volume24h: numberOrNull(pair.volume?.h24),
    priceChange5m: numberOrNull(pair.priceChange?.m5),
    priceChange1h: numberOrNull(pair.priceChange?.h1),
    priceChange6h: numberOrNull(pair.priceChange?.h6),
    priceChange24h: numberOrNull(pair.priceChange?.h24),
    buys5m: intOrNull(pair.txns?.m5?.buys),
    sells5m: intOrNull(pair.txns?.m5?.sells),
    buys1h: intOrNull(pair.txns?.h1?.buys),
    sells1h: intOrNull(pair.txns?.h1?.sells),
    promotion: normalizePromotion(pair, options.boost ?? null, options.profile),
    holderCount: null,
    uniqueBuyers1h: null,
    uniqueSellers1h: null,
    top10HolderPct: null,
    top20HolderPct: null,
  };
}

/** Discovery candidates only — NOT the complete Solana token universe. */
export interface DiscoveryCandidate {
  contractAddress: string;
  chain: string;
  icon: Maybe<string>;
  description: Maybe<string>;
  boostAmount: Maybe<number>;
  totalBoostAmount: Maybe<number>;
  source: "token-profiles" | "token-boosts";
}

export function normalizeDiscovery(
  entry: DsTokenBoost,
  source: DiscoveryCandidate["source"],
): DiscoveryCandidate | null {
  const address = textOrNull(entry.tokenAddress);
  if (!address) return null;
  return {
    contractAddress: address,
    chain: entry.chainId ?? "unknown",
    icon: textOrNull(entry.icon),
    description: textOrNull(entry.description),
    boostAmount: numberOrNull(entry.amount),
    totalBoostAmount: numberOrNull(entry.totalAmount),
    source,
  };
}
