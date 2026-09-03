/**
 * Historical candle acquisition + persistence (server-only).
 *
 * Strategy (calibration defaults, centralized here):
 *   - LAUNCH WINDOW: launch → launch + 12h at 1m resolution. This is where a
 *     concentrated blowoff is visible and where resolution actually matters.
 *   - LIFECYCLE WINDOW: launch + 12h → now at a coarser resolution chosen so a
 *     whole lifecycle fits inside the provider's 1000-candle page limit.
 *
 * Caching: stored candles are read first and only genuinely MISSING ranges are
 * requested. A history served entirely from `token_price_candles` costs zero
 * provider requests and is reported as a cache hit.
 *
 * This module fetches and stores facts. It never classifies anything.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchOhlcvRange,
  OHLCV_INTERVAL_SECONDS,
  type NormalizedCandle,
  type OhlcvInterval,
} from "../external/birdeye/ohlcv.server";

export const PRICE_HISTORY_STRATEGY_VERSION = "price-history/v1";

export const PRICE_HISTORY_STRATEGY = {
  version: PRICE_HISTORY_STRATEGY_VERSION,
  /** High-resolution launch window length, in hours. */
  launchWindowHours: 12,
  launchInterval: "1m" as OhlcvInterval,
  /** Coarser resolutions tried in order for the remaining lifecycle. */
  lifecycleIntervals: ["15m", "1H", "4H"] as OhlcvInterval[],
  /** Never request more than this many pages per window. */
  maxPagesPerWindow: 2,
  /** A stored range is re-fetched only when the tail is older than this. */
  staleTailMinutes: 90,
} as const;

export interface StoredCandle extends NormalizedCandle {
  contractAddress: string;
}

export interface PriceHistoryResult {
  contractAddress: string;
  candles: StoredCandle[];
  launchAt: string | null;
  /** Provider requests actually executed for this token. */
  providerRequests: number;
  /** True when every candle came from storage. */
  servedFromCache: boolean;
  candlesStored: number;
  intervalsUsed: OhlcvInterval[];
  error: string | null;
}

export interface PriceHistoryDiagnostics {
  candidatesRequiringHistory: number;
  providerRequests: number;
  servedFullyFromCache: number;
  candlesStored: number;
  tokensWithHistory: number;
  failures: number;
}

type Row = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Read every stored candle for a token. Storage is the cache. */
export async function loadStoredCandles(
  contractAddress: string,
  chain = "solana",
): Promise<StoredCandle[]> {
  const { data, error } = await supabaseAdmin
    .from("token_price_candles")
    .select(
      "contract_address, interval, candle_time, provider_unix_time, open_price, high_price, low_price, close_price, volume_base, volume_usd",
    )
    .eq("chain", chain)
    .eq("contract_address", contractAddress)
    .order("candle_time", { ascending: true })
    .limit(5000);
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({
    contractAddress: r["contract_address"] as string,
    interval: r["interval"] as OhlcvInterval,
    unixTime: num(r["provider_unix_time"]) ?? Math.floor(new Date(r["candle_time"] as string).getTime() / 1000),
    candleTime: r["candle_time"] as string,
    open: num(r["open_price"]),
    high: num(r["high_price"]),
    low: num(r["low_price"]),
    close: num(r["close_price"]),
    volumeBase: num(r["volume_base"]),
    volumeUsd: num(r["volume_usd"]),
  }));
}

/** Append candles. The unique key makes repeated scans idempotent. */
export async function storeCandles(
  contractAddress: string,
  candles: NormalizedCandle[],
  options: { chain?: string; pairAddress?: string | null; sourceReference?: string | null } = {},
): Promise<number> {
  if (candles.length === 0) return 0;
  const rows = candles.map((c) => ({
    chain: options.chain ?? "solana",
    contract_address: contractAddress,
    pair_address: options.pairAddress ?? null,
    interval: c.interval,
    candle_time: c.candleTime,
    provider_unix_time: c.unixTime,
    open_price: c.open,
    high_price: c.high,
    low_price: c.low,
    close_price: c.close,
    volume_base: c.volumeBase,
    volume_usd: c.volumeUsd,
    source: "birdeye",
    source_reference: options.sourceReference ?? "/defi/ohlcv",
  }));

  let stored = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error, count } = await supabaseAdmin
      .from("token_price_candles")
      .upsert(chunk as never, {
        onConflict: "chain,contract_address,interval,candle_time",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) break;
    stored += count ?? 0;
  }
  return stored;
}

/** Pick the coarsest-needed lifecycle resolution that fits one page. */
export function lifecycleInterval(spanSeconds: number): OhlcvInterval {
  for (const interval of PRICE_HISTORY_STRATEGY.lifecycleIntervals) {
    const candles = spanSeconds / OHLCV_INTERVAL_SECONDS[interval];
    if (candles <= 1000 * PRICE_HISTORY_STRATEGY.maxPagesPerWindow) return interval;
  }
  return "1D";
}

interface WindowSpec {
  interval: OhlcvInterval;
  from: number;
  to: number;
}

/** Windows still missing from storage, given what is already cached. */
export function missingWindows(
  stored: StoredCandle[],
  launchUnix: number,
  nowUnix: number,
): WindowSpec[] {
  const strategy = PRICE_HISTORY_STRATEGY;
  const launchEnd = Math.min(nowUnix, launchUnix + strategy.launchWindowHours * 3600);
  const windows: WindowSpec[] = [];

  const launchStored = stored.filter(
    (c) =>
      c.interval === strategy.launchInterval &&
      c.unixTime >= launchUnix - 3600 &&
      c.unixTime <= launchEnd,
  );
  // The launch window is immutable history: fetch it once, never again.
  if (launchStored.length === 0 && launchEnd > launchUnix) {
    windows.push({ interval: strategy.launchInterval, from: launchUnix, to: launchEnd });
  }

  const lifecycleStart = launchEnd;
  if (nowUnix - lifecycleStart > 3600) {
    const interval = lifecycleInterval(nowUnix - lifecycleStart);
    const lifecycleStored = stored.filter((c) => c.interval === interval);
    const lastStored = lifecycleStored.length
      ? lifecycleStored[lifecycleStored.length - 1]!.unixTime
      : null;
    if (lastStored === null) {
      windows.push({ interval, from: lifecycleStart, to: nowUnix });
    } else if (nowUnix - lastStored > strategy.staleTailMinutes * 60) {
      // Only the missing tail is requested; stored candles are never refetched.
      windows.push({ interval, from: lastStored + 1, to: nowUnix });
    }
  }

  return windows;
}

export interface PriceHistoryTarget {
  contractAddress: string;
  chain: string;
  /** Best known launch time (pair or token creation). Null = unknown. */
  launchAt: string | null;
  pairAddress?: string | null;
}

/**
 * Ensure launch + lifecycle history exists for one token, fetching only what
 * storage is missing. A token with no known launch time is never guessed.
 */
export async function ensurePriceHistory(
  target: PriceHistoryTarget,
  options: { now?: Date; track?: <T>(fn: () => Promise<T>) => Promise<T> } = {},
): Promise<PriceHistoryResult> {
  const now = options.now ?? new Date();
  const nowUnix = Math.floor(now.getTime() / 1000);
  const base: PriceHistoryResult = {
    contractAddress: target.contractAddress,
    candles: [],
    launchAt: target.launchAt,
    providerRequests: 0,
    servedFromCache: true,
    candlesStored: 0,
    intervalsUsed: [],
    error: null,
  };

  if (!target.launchAt) {
    return { ...base, error: "Launch time unknown — launch history cannot be located." };
  }
  const launchUnix = Math.floor(new Date(target.launchAt).getTime() / 1000);
  if (!Number.isFinite(launchUnix)) {
    return { ...base, error: "Launch time unparseable." };
  }

  const stored = await loadStoredCandles(target.contractAddress, target.chain);
  const windows = missingWindows(stored, launchUnix, nowUnix);
  if (windows.length === 0) {
    return {
      ...base,
      candles: stored,
      intervalsUsed: [...new Set(stored.map((c) => c.interval))],
    };
  }

  let requests = 0;
  let storedCount = 0;
  const fetched: NormalizedCandle[] = [];
  let error: string | null = null;

  for (const window of windows) {
    try {
      const run = () =>
        fetchOhlcvRange(target.contractAddress, {
          chain: target.chain,
          interval: window.interval,
          timeFrom: window.from,
          timeTo: window.to,
          maxPages: PRICE_HISTORY_STRATEGY.maxPagesPerWindow,
          onRequest: () => {
            requests += 1;
          },
        });
      const candles = options.track ? await options.track(run) : await run();
      fetched.push(...candles);
    } catch (e) {
      // A provider failure leaves coverage incomplete; it never fabricates data.
      error = e instanceof Error ? e.message : "Historical candles unavailable.";
    }
  }

  if (fetched.length > 0) {
    storedCount = await storeCandles(target.contractAddress, fetched, {
      chain: target.chain,
      pairAddress: target.pairAddress ?? null,
    });
  }

  const merged = new Map<string, StoredCandle>();
  for (const c of stored) merged.set(`${c.interval}:${c.unixTime}`, c);
  for (const c of fetched) {
    merged.set(`${c.interval}:${c.unixTime}`, { ...c, contractAddress: target.contractAddress });
  }
  const candles = [...merged.values()].sort((a, b) => a.unixTime - b.unixTime);

  return {
    contractAddress: target.contractAddress,
    candles,
    launchAt: target.launchAt,
    providerRequests: requests,
    servedFromCache: requests === 0,
    candlesStored: storedCount,
    intervalsUsed: [...new Set(candles.map((c) => c.interval))],
    error,
  };
}
