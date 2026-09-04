/**
 * Manual per-token market refresh — pure, deterministic rules.
 *
 * A refresh is a CURRENT-MARKET observation only. It never reruns scanning,
 * selection, setup classification, structural eligibility, price integrity,
 * recurrence or outcome baselines. The stored `scan_candidates` row is an
 * immutable statement of what Wingman saw at scan time and is never touched.
 */

/** Minimum spacing between manual refreshes of the same mint. */
export const MANUAL_REFRESH_COOLDOWN_SECONDS = 20;

export interface RefreshMarketValues {
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  /** 24h volume / market cap, only when both sides are usable. */
  turnover24h: number | null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Turnover is derived, never guessed. Missing input stays null, never 0. */
export function deriveTurnover(volume24h: number | null, marketCap: number | null): number | null {
  if (!isNumber(volume24h) || !isNumber(marketCap) || marketCap <= 0) return null;
  return volume24h / marketCap;
}

/**
 * A provider response is only a market observation when it carries at least
 * one real price/market-cap reading. Empty or zero-filled payloads are
 * rejected so a failure can never overwrite valid values.
 */
export function isPersistableObservation(values: {
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
}): boolean {
  const price = isNumber(values.priceUsd) && values.priceUsd > 0;
  const cap = isNumber(values.marketCap) && values.marketCap > 0;
  return price || cap;
}

/** True when another manual refresh is allowed for this mint. */
export function cooldownElapsed(lastRefreshAtIso: string | null, nowIso: string): boolean {
  if (!lastRefreshAtIso) return true;
  const last = Date.parse(lastRefreshAtIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || Number.isNaN(now)) return true;
  return (now - last) / 1000 >= MANUAL_REFRESH_COOLDOWN_SECONDS;
}
