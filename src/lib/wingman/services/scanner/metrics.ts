/**
 * Deterministic, pure scanner metrics.
 *
 * Two invariants everything else depends on:
 *   - `null` means unavailable. `0` means an observed zero. They never merge.
 *   - Windows of different length are ALWAYS normalized to an hourly pace
 *     before being compared. A 5m total is never compared to a 1h total.
 *
 * Normalized pace is a description of current activity rate, not a forecast of
 * future volume.
 */
import { ACTIVITY_FLOOR } from "./config";
import type { DiscoveredToken, ScannerMetrics, TokenAge } from "./types";

export function isNum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Safe ratio. Unavailable inputs and a zero denominator yield `null`. */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (!isNum(numerator) || !isNum(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/** Convert a window total into an hourly pace. `windowMinutes` must be > 0. */
export function hourlyPace(total: number | null, windowMinutes: number): number | null {
  if (!isNum(total) || windowMinutes <= 0) return null;
  return total * (60 / windowMinutes);
}

export function minutesBetween(fromIso: string | null, nowIso: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return null;
  return (now - from) / 60_000;
}

export interface AgeFallbacks {
  pairCreatedAt?: string | null;
  tokenCreatedAt?: string | null;
}

/**
 * Token age is a first-class signal. When no source supplies a creation or
 * listing time the age is UNKNOWN — it is never silently treated as new.
 */
export function computeAge(
  token: DiscoveredToken,
  nowIso: string,
  fallbacks: AgeFallbacks = {},
): TokenAge {
  const listing = minutesBetween(token.listedAt, nowIso);
  if (isNum(listing) && listing >= 0) return { minutes: listing, basis: "provider_listing" };

  const pair = minutesBetween(fallbacks.pairCreatedAt ?? null, nowIso);
  if (isNum(pair) && pair >= 0) return { minutes: pair, basis: "pair_created" };

  const created = minutesBetween(fallbacks.tokenCreatedAt ?? null, nowIso);
  if (isNum(created) && created >= 0) return { minutes: created, basis: "token_created" };

  return { minutes: null, basis: "unknown" };
}

/**
 * The activity floor is age-aware: a 45-minute-old token is never rejected for
 * failing to produce a full 24h volume total.
 */
export function activityFloorFor(ageMinutes: number | null): {
  floorUsd: number;
  windowMinutes: number;
  windowLabel: ScannerMetrics["activityWindowLabel"];
} {
  // Unknown age is treated conservatively as mature.
  const age = isNum(ageMinutes) ? ageMinutes : 1440;
  const windowMinutes = age >= 1440 ? 1440 : age >= 360 ? 360 : 60;
  const windowLabel = windowMinutes === 1440 ? "24h" : windowMinutes === 360 ? "6h" : "1h";
  const effectiveMinutes = Math.min(age, windowMinutes);
  const scaled = ACTIVITY_FLOOR.baseVolumeUsd24h * (effectiveMinutes / 1440);
  const floorUsd = Math.min(
    ACTIVITY_FLOOR.baseVolumeUsd24h,
    Math.max(ACTIVITY_FLOOR.minVolumeUsd, scaled),
  );
  return { floorUsd, windowMinutes, windowLabel };
}

function windowVolume(
  token: DiscoveredToken,
  label: ScannerMetrics["activityWindowLabel"],
): number | null {
  if (label === "24h") return token.volume24h;
  if (label === "6h") return token.volume6h ?? token.volume24h;
  if (label === "1h") return token.volume1h ?? token.volume6h ?? token.volume24h;
  if (label === "5m") return token.volume5m;
  return null;
}

export function computeMetrics(
  token: DiscoveredToken,
  nowIso: string,
  fallbacks: AgeFallbacks = {},
): ScannerMetrics {
  const age = computeAge(token, nowIso, fallbacks);
  const floor = activityFloorFor(age.minutes);

  const hourlyPaceFrom5m = hourlyPace(token.volume5m, 5);
  const hourlyPaceFrom1h = hourlyPace(token.volume1h, 60);
  const hourlyPaceFrom6h = hourlyPace(token.volume6h, 360);
  const hourlyPaceFrom24h = hourlyPace(token.volume24h, 1440);

  const hourlyTradePaceFrom5m = hourlyPace(token.trades5m, 5);
  const hourlyTradePaceFrom1h = hourlyPace(token.trades1h, 60);
  const hourlyTradePaceFrom24h = hourlyPace(token.trades24h, 1440);

  const buys = token.buys24h;
  const sells = token.sells24h;
  const buyRatio24h =
    isNum(buys) && isNum(sells) && buys + sells > 0 ? buys / (buys + sells) : null;

  return {
    age,
    minutesSinceLastTrade: minutesBetween(token.lastTradeAt, nowIso),

    volumeToMarketCap24h: ratio(token.volume24h, token.marketCap),
    volumeToLiquidity24h: ratio(token.volume24h, token.liquidityUsd),
    volumeToMarketCap1h: ratio(token.volume1h, token.marketCap),
    liquidityToMarketCap: ratio(token.liquidityUsd, token.marketCap),

    hourlyPaceFrom5m,
    hourlyPaceFrom1h,
    hourlyPaceFrom6h,
    hourlyPaceFrom24h,

    hourlyTradePaceFrom5m,
    hourlyTradePaceFrom1h,
    hourlyTradePaceFrom24h,

    shortAcceleration: ratio(hourlyPaceFrom5m, hourlyPaceFrom1h),
    midAcceleration: ratio(hourlyPaceFrom1h, hourlyPaceFrom6h),
    baselineAcceleration: ratio(hourlyPaceFrom1h, hourlyPaceFrom24h),
    tradeAcceleration: ratio(hourlyTradePaceFrom1h, hourlyTradePaceFrom24h),

    buyRatio24h,
    activityFloorUsd: floor.floorUsd,
    activityWindowVolume: windowVolume(token, floor.windowLabel),
    activityWindowLabel: floor.windowLabel,
  };
}
