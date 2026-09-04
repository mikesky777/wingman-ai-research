/**
 * Entry timing features (pure, versioned, inspectable).
 *
 * Every feature is derived from ACTUAL stored candles, never from a visual
 * reading of a chart and never from an oscillator (no RSI/MACD as a primary
 * signal). The series is ALWAYS cut strictly at evaluation time, so a
 * historical calibration evaluation is mathematically incapable of seeing a
 * candle that had not printed yet.
 */
import { ENTRY_FEATURE_VERSION } from "./contracts";

export interface EntryCandle {
  unixTime: number;
  interval: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volumeUsd: number | null;
}

export interface TimingFeatures {
  featureVersion: string;
  interval: string;
  bars: number;
  spanMinutes: number;
  firstBarAt: string;
  lastBarAt: string;
  lastClose: number;
  recentHigh: number;
  recentLow: number;
  barsSinceHigh: number;
  barsSinceLow: number;
  /** Percent below the highest close of the window (0 = at the high). */
  drawdownFromHighPct: number;
  /** Percent above the lowest close of the window. */
  riseFromLowPct: number;
  /** Largest low→high advance inside the window, percent. */
  impulseGainPct: number;
  /** How much of the last impulse has been retraced, percent (null when no impulse). */
  retracementDepthPct: number | null;
  /** Percent distance from the derived base level (lowest-quartile close median). */
  distanceFromBasePct: number;
  /** Trailing bars whose closes stay inside a tight band — the consolidation. */
  consolidationBars: number;
  /** Recent range / earlier range. <1 = compression, >1 = expansion. */
  compressionRatio: number | null;
  higherLow: boolean;
  lowerHighs: boolean;
  reclaimHolding: boolean;
  /** Recent-half volume / earlier-half volume. */
  volumeTrendRatio: number | null;
  /** Consolidation volume / impulse volume. */
  consolidationVolumeRatio: number | null;
  /** Standard deviation of bar-to-bar returns, percent. */
  realizedVolatilityPct: number;
  /** True when the last bars are a single vertical expansion with no reset. */
  verticalExpansion: boolean;
  gaps: string[];
}

export const ENTRY_LOOKBACK_MINUTES = 720;
const MIN_BARS = 12;

function iso(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

function pct(a: number, b: number): number {
  if (!Number.isFinite(b) || b === 0) return 0;
  return Math.round(((a - b) / b) * 10000) / 100;
}

/** Strictly at-or-before evaluation time. This is the hindsight firewall. */
export function cutSeries(candles: EntryCandle[], evaluationUnix: number): EntryCandle[] {
  return candles
    .filter((c) => Number.isFinite(c.unixTime) && c.unixTime <= evaluationUnix)
    .sort((a, b) => a.unixTime - b.unixTime);
}

/** Pick the finest interval that still has enough bars inside the lookback. */
export function selectSeries(
  candles: EntryCandle[],
  evaluationUnix: number,
  lookbackMinutes = ENTRY_LOOKBACK_MINUTES,
): EntryCandle[] {
  const cut = cutSeries(candles, evaluationUnix);
  const from = evaluationUnix - lookbackMinutes * 60;
  const byInterval = new Map<string, EntryCandle[]>();
  for (const c of cut) {
    if (c.unixTime < from) continue;
    if (c.close === null) continue;
    const list = byInterval.get(c.interval) ?? [];
    list.push(c);
    byInterval.set(c.interval, list);
  }
  let best: EntryCandle[] = [];
  for (const list of byInterval.values()) {
    if (list.length > best.length) best = list;
  }
  if (best.length >= MIN_BARS) return best;

  // Fall back to the tail of the densest full-history interval.
  const all = new Map<string, EntryCandle[]>();
  for (const c of cut) {
    if (c.close === null) continue;
    const list = all.get(c.interval) ?? [];
    list.push(c);
    all.set(c.interval, list);
  }
  let fallback: EntryCandle[] = [];
  for (const list of all.values()) if (list.length > fallback.length) fallback = list;
  return fallback.slice(-60);
}

function swingLows(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < closes.length - 2; i += 1) {
    const v = closes[i]!;
    if (v <= closes[i - 1]! && v <= closes[i - 2]! && v <= closes[i + 1]! && v <= closes[i + 2]!) {
      out.push(v);
    }
  }
  return out;
}

function swingHighs(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < closes.length - 2; i += 1) {
    const v = closes[i]!;
    if (v >= closes[i - 1]! && v >= closes[i - 2]! && v >= closes[i + 1]! && v >= closes[i + 2]!) {
      out.push(v);
    }
  }
  return out;
}

function rangePct(values: number[]): number | null {
  if (values.length < 2) return null;
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  if (lo <= 0) return null;
  return ((hi - lo) / lo) * 100;
}

function sum(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

/**
 * Returns null when there is not enough history to make ANY structural
 * judgement. Missing history is a gap, never a negative signal.
 */
export function computeTimingFeatures(
  candles: EntryCandle[],
  evaluationUnix: number,
  lookbackMinutes = ENTRY_LOOKBACK_MINUTES,
): TimingFeatures | null {
  const series = selectSeries(candles, evaluationUnix, lookbackMinutes);
  if (series.length < MIN_BARS) return null;

  const gaps: string[] = [];
  const closes = series.map((c) => c.close as number);
  const volumes = series.map((c) => c.volumeUsd);
  if (volumes.every((v) => v === null)) gaps.push("VOLUME_SERIES_UNAVAILABLE");

  const last = closes[closes.length - 1]!;
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const highIdx = closes.lastIndexOf(high);
  const lowIdx = closes.lastIndexOf(low);
  const barsSinceHigh = closes.length - 1 - highIdx;
  const barsSinceLow = closes.length - 1 - lowIdx;

  // Impulse = largest advance from a low to a subsequent high.
  let impulseGainPct = 0;
  let impulseLow = closes[0]!;
  let impulseStart = 0;
  let impulseEnd = 0;
  let runningMin = closes[0]!;
  let runningMinIdx = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const v = closes[i]!;
    if (v < runningMin) {
      runningMin = v;
      runningMinIdx = i;
    }
    const gain = pct(v, runningMin);
    if (gain > impulseGainPct) {
      impulseGainPct = gain;
      impulseLow = runningMin;
      impulseStart = runningMinIdx;
      impulseEnd = i;
    }
  }

  const impulseHigh = closes[impulseEnd] ?? high;
  const retracementDepthPct =
    impulseGainPct > 5 && impulseHigh > impulseLow
      ? Math.round(((impulseHigh - last) / (impulseHigh - impulseLow)) * 1000) / 10
      : null;

  const sorted = [...closes].sort((a, b) => a - b);
  const quartile = sorted.slice(0, Math.max(3, Math.floor(sorted.length / 4)));
  const baseLevel = quartile[Math.floor(quartile.length / 2)] ?? low;
  const distanceFromBasePct = pct(last, baseLevel);

  // Consolidation = trailing bars staying inside a ±6% band around the last close.
  let consolidationBars = 0;
  for (let i = closes.length - 1; i >= 0; i -= 1) {
    if (Math.abs(pct(closes[i]!, last)) <= 6) consolidationBars += 1;
    else break;
  }

  const half = Math.floor(closes.length / 2);
  const recentRange = rangePct(closes.slice(half));
  const earlierRange = rangePct(closes.slice(0, half));
  const compressionRatio =
    recentRange !== null && earlierRange !== null && earlierRange > 0
      ? Math.round((recentRange / earlierRange) * 100) / 100
      : null;

  const lows = swingLows(closes);
  const highs = swingHighs(closes);
  const higherLow = lows.length >= 2 && lows[lows.length - 1]! > lows[lows.length - 2]!;
  const lowerHighs =
    highs.length >= 2 &&
    highs[highs.length - 1]! < highs[highs.length - 2]! &&
    lows.length >= 2 &&
    lows[lows.length - 1]! < lows[lows.length - 2]!;

  const reclaimHolding =
    higherLow && barsSinceHigh <= Math.max(3, Math.floor(closes.length * 0.25)) && last >= baseLevel;

  const recentVolume = sum(volumes.slice(half));
  const earlierVolume = sum(volumes.slice(0, half));
  const volumeTrendRatio =
    recentVolume !== null && earlierVolume !== null && earlierVolume > 0
      ? Math.round((recentVolume / earlierVolume) * 100) / 100
      : null;

  const impulseVolume = sum(volumes.slice(impulseStart, impulseEnd + 1));
  const consolidationVolume = sum(volumes.slice(Math.max(impulseEnd + 1, half)));
  const consolidationVolumeRatio =
    impulseVolume !== null && consolidationVolume !== null && impulseVolume > 0
      ? Math.round((consolidationVolume / impulseVolume) * 100) / 100
      : null;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) returns.push(pct(closes[i]!, closes[i - 1]!));
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const realizedVolatilityPct =
    Math.round(
      Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length || 1)) * 100,
    ) / 100;

  const tail = closes.slice(-5);
  const verticalExpansion =
    tail.length === 5 &&
    tail.every((v, i) => i === 0 || v >= tail[i - 1]!) &&
    pct(tail[4]!, tail[0]!) >= 30 &&
    barsSinceHigh <= 1;

  const spanMinutes = Math.round(
    (series[series.length - 1]!.unixTime - series[0]!.unixTime) / 60,
  );

  return {
    featureVersion: ENTRY_FEATURE_VERSION,
    interval: series[0]!.interval,
    bars: series.length,
    spanMinutes,
    firstBarAt: iso(series[0]!.unixTime),
    lastBarAt: iso(series[series.length - 1]!.unixTime),
    lastClose: last,
    recentHigh: high,
    recentLow: low,
    barsSinceHigh,
    barsSinceLow,
    drawdownFromHighPct: pct(last, high),
    riseFromLowPct: pct(last, low),
    impulseGainPct: Math.round(impulseGainPct * 10) / 10,
    retracementDepthPct,
    distanceFromBasePct,
    consolidationBars,
    compressionRatio,
    higherLow,
    lowerHighs,
    reclaimHolding,
    volumeTrendRatio,
    consolidationVolumeRatio,
    realizedVolatilityPct,
    verticalExpansion,
    gaps,
  };
}
