/**
 * Birdeye historical OHLCV (server-only).
 *
 * Confirmed against the live API available to this project:
 *   GET /defi/ohlcv?address=<mint>&type=<interval>&time_from=<unix>&time_to=<unix>
 *   headers: X-API-KEY, x-chain
 *   response: { data: { items: [{ unixTime, o, h, l, c, v, vUsd, type, address }] } }
 *
 * Observed provider behaviour:
 *   - hard cap of 1000 items per response, returned OLDEST first from
 *     `time_from`, so ranges are paginated forward.
 *   - timestamps are provider unix seconds and are preserved verbatim.
 *   - `v` is base-token volume, `vUsd` is USD volume. Liquidity is NOT
 *     supplied by this endpoint and is therefore never fabricated.
 */
import { supportsChain } from "../capabilities";
import { DEFAULT_CHAIN } from "../chains";
import { birdeyeRequest, isBirdeyeConfigured, type BirdeyeRequestOptions } from "./client.server";
import { BirdeyeError } from "./errors";

/** Provider-supported resolutions Wingman uses. */
export type OhlcvInterval = "1m" | "5m" | "15m" | "1H" | "4H" | "1D";

/** Maximum items the provider returns in a single response. */
export const BIRDEYE_OHLCV_PAGE_LIMIT = 1000;

export const OHLCV_INTERVAL_SECONDS: Record<OhlcvInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
};

interface BeOhlcvItem {
  unixTime?: number | null;
  o?: number | null;
  h?: number | null;
  l?: number | null;
  c?: number | null;
  v?: number | null;
  vUsd?: number | null;
  type?: string | null;
  address?: string | null;
}

interface BeOhlcvData {
  items?: BeOhlcvItem[] | null;
}

/** Provider-independent candle. Any absent field stays null, never zero. */
export interface NormalizedCandle {
  interval: OhlcvInterval;
  unixTime: number;
  candleTime: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volumeBase: number | null;
  volumeUsd: number | null;
}

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(item: BeOhlcvItem, interval: OhlcvInterval): NormalizedCandle | null {
  const unixTime = num(item.unixTime);
  if (unixTime === null) return null;
  return {
    interval,
    unixTime,
    candleTime: new Date(unixTime * 1000).toISOString(),
    open: num(item.o),
    high: num(item.h),
    low: num(item.l),
    close: num(item.c),
    volumeBase: num(item.v),
    volumeUsd: num(item.vUsd),
  };
}

export interface OhlcvFetchOptions {
  chain?: string;
  /** Unix seconds, inclusive. */
  timeFrom: number;
  timeTo: number;
  interval: OhlcvInterval;
  /** Safety bound on pagination so one token can never drain the budget. */
  maxPages?: number;
  request?: BirdeyeRequestOptions;
  /** Called once per executed provider request. */
  onRequest?: () => void;
}

/**
 * Fetch a candle range, paginating forward while the provider keeps returning
 * a full page. Deterministic: candles come back ascending and deduplicated.
 */
export async function fetchOhlcvRange(
  address: string,
  options: OhlcvFetchOptions,
): Promise<NormalizedCandle[]> {
  const chain = options.chain ?? DEFAULT_CHAIN;
  if (!isBirdeyeConfigured()) throw new BirdeyeError("NOT_CONFIGURED");
  if (!SOLANA_ADDRESS_RE.test(address.trim())) throw new BirdeyeError("INVALID_ADDRESS");
  if (!supportsChain("birdeye", "price_history", chain)) {
    throw new BirdeyeError("UNSUPPORTED_CHAIN");
  }

  const maxPages = options.maxPages ?? 4;
  const step = OHLCV_INTERVAL_SECONDS[options.interval];
  const byTime = new Map<number, NormalizedCandle>();
  let cursor = Math.floor(options.timeFrom);
  const end = Math.floor(options.timeTo);

  for (let page = 0; page < maxPages && cursor < end; page += 1) {
    options.onRequest?.();
    const data = await birdeyeRequest<BeOhlcvData>(
      "/defi/ohlcv",
      {
        address: address.trim(),
        type: options.interval,
        time_from: cursor,
        time_to: end,
      },
      { ...options.request, chain },
    );
    const items = (data.items ?? []).map((i) => normalize(i, options.interval));
    const candles = items.filter((c): c is NormalizedCandle => c !== null);
    for (const candle of candles) byTime.set(candle.unixTime, candle);
    if (candles.length < BIRDEYE_OHLCV_PAGE_LIMIT) break;
    const last = candles[candles.length - 1]!;
    cursor = last.unixTime + step;
  }

  return [...byTime.values()].sort((a, b) => a.unixTime - b.unixTime);
}
