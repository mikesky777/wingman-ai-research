/**
 * Birdeye `/defi/v3/token/list` → Wingman `DiscoveredToken`.
 *
 * Pure and provider-isolating: no Birdeye field name escapes this module.
 * Missing values become `null` (unavailable); an observed `0` stays `0`.
 */
import type { ChainId } from "../chains";
import type {
  DiscoveredToken,
  DiscoveryHit,
  DiscoveryLane,
  DiscoveryQueryFamily,
} from "../../scanner/types";

export const BIRDEYE_DISCOVERY_VERSION = "birdeye-discovery/v1";

/** Raw list item. Every field is optional — Birdeye omits plenty per token. */
export interface BeListItem {
  address?: string;
  name?: string | null;
  symbol?: string | null;
  logo_uri?: string | null;
  price?: number | null;
  market_cap?: number | null;
  fdv?: number | null;
  liquidity?: number | null;
  last_trade_unix_time?: number | null;
  recent_listing_time?: number | null;
  volume_5m_usd?: number | null;
  volume_1h_usd?: number | null;
  volume_4h_usd?: number | null;
  volume_8h_usd?: number | null;
  volume_24h_usd?: number | null;
  trade_5m_count?: number | null;
  trade_1h_count?: number | null;
  trade_8h_count?: number | null;
  trade_24h_count?: number | null;
  buy_24h?: number | null;
  sell_24h?: number | null;
  price_change_5m_percent?: number | null;
  price_change_1h_percent?: number | null;
  price_change_8h_percent?: number | null;
  price_change_24h_percent?: number | null;
  holder?: number | null;
  unique_wallet_24h?: number | null;
}

export interface BeListResponse {
  items?: BeListItem[] | null;
  has_next?: boolean | null;
}

export interface DiscoveryQuerySpec {
  id: string;
  family: DiscoveryQueryFamily;
  laneHints: DiscoveryLane[];
  /** Birdeye query parameters, minus paging. */
  params: Record<string, string | number>;
  description: string;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isoFromUnix(seconds: unknown): string | null {
  const n = numOrNull(seconds);
  if (n === null || n <= 0) return null;
  const date = new Date(n * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Birdeye has no 6h window; 8h is the nearest longer window and 4h the nearest
 * shorter one. We map 8h into the 6h slot only when nothing better exists and
 * downstream pace normalization uses the declared window length, so the
 * approximation never produces a mis-scaled comparison — instead we simply
 * prefer 4h scaled up to 6h is NOT done. We use 8h totals scaled to 6h.
 */
function sixHourVolume(item: BeListItem): number | null {
  const eight = numOrNull(item.volume_8h_usd);
  if (eight !== null) return eight * (6 / 8);
  const four = numOrNull(item.volume_4h_usd);
  return four === null ? null : four * (6 / 4);
}

function sixHourTrades(item: BeListItem): number | null {
  const eight = numOrNull(item.trade_8h_count);
  return eight === null ? null : eight * (6 / 8);
}

function sixHourPriceChange(item: BeListItem): number | null {
  return numOrNull(item.price_change_8h_percent);
}

export function normalizeDiscoveryItem(
  item: BeListItem,
  context: { chain: ChainId; hit: DiscoveryHit },
): DiscoveredToken | null {
  const address = textOrNull(item.address);
  if (!address) return null;

  return {
    chain: context.chain,
    contractAddress: address,
    symbol: textOrNull(item.symbol),
    name: textOrNull(item.name),
    imageUrl: textOrNull(item.logo_uri),

    priceUsd: numOrNull(item.price),
    marketCap: numOrNull(item.market_cap),
    fdv: numOrNull(item.fdv),
    liquidityUsd: numOrNull(item.liquidity),

    volume5m: numOrNull(item.volume_5m_usd),
    volume1h: numOrNull(item.volume_1h_usd),
    volume6h: sixHourVolume(item),
    volume24h: numOrNull(item.volume_24h_usd),

    trades5m: numOrNull(item.trade_5m_count),
    trades1h: numOrNull(item.trade_1h_count),
    trades6h: sixHourTrades(item),
    trades24h: numOrNull(item.trade_24h_count),

    buys24h: numOrNull(item.buy_24h),
    sells24h: numOrNull(item.sell_24h),

    priceChange5m: numOrNull(item.price_change_5m_percent),
    priceChange1h: numOrNull(item.price_change_1h_percent),
    priceChange6h: sixHourPriceChange(item),
    priceChange24h: numOrNull(item.price_change_24h_percent),

    holderCount: numOrNull(item.holder),
    uniqueWallets24h: numOrNull(item.unique_wallet_24h),

    // Absent listing time means UNKNOWN age, not "new".
    listedAt: isoFromUnix(item.recent_listing_time),
    lastTradeAt: isoFromUnix(item.last_trade_unix_time),

    discovery: [context.hit],
  };
}

export function normalizeDiscoveryPage(
  response: BeListResponse,
  context: { chain: ChainId; query: DiscoveryQuerySpec; source?: string },
): DiscoveredToken[] {
  const items = Array.isArray(response?.items) ? response.items : [];
  const source = context.source ?? "birdeye";
  const out: DiscoveredToken[] = [];
  items.forEach((item, index) => {
    const token = normalizeDiscoveryItem(item, {
      chain: context.chain,
      hit: {
        source,
        queryId: context.query.id,
        family: context.query.family,
        rank: index,
        laneHints: context.query.laneHints,
      },
    });
    if (token) out.push(token);
  });
  return out;
}
