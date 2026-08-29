/**
 * Quantitative Priority (0–100).
 *
 * This is NOT a thesis score, a confidence, or a probability. It answers one
 * question only: how strongly does current quantitative evidence justify
 * spending research effort on this token?
 *
 * Raw price momentum is deliberately capped at a small weight so the biggest
 * gainer never wins by default, and extension is penalised rather than
 * rewarded.
 */
import { DIVERGENCE_ADJUSTMENT, EXTENSION_PENALTY, PRIORITY_WEIGHTS } from "./config";
import { isNum } from "./metrics";
import type {
  DiscoveredToken,
  DiscoveryLane,
  PriorityBreakdown,
  PriorityComponentKey,
  ScannerMetrics,
  ScannerSignals,
} from "./types";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const ACTIVITY_SCORE: Record<string, number> = {
  DORMANT: 0,
  LOW: 0.25,
  ACTIVE: 0.65,
  ACCELERATING: 0.9,
  // Extreme activity is real but often late; it does not beat clean acceleration.
  EXTREME: 0.8,
  UNKNOWN: 0.2,
};

const PERSISTENCE_SCORE: Record<string, number> = {
  HIGH: 1,
  MODERATE: 0.6,
  LOW: 0.2,
  // Unknown is uncertainty, not a negative.
  UNKNOWN: 0.4,
};

const REACCELERATION_SCORE: Record<string, number> = {
  EXTREME: 0.85,
  CONFIRMED: 1,
  EARLY: 0.7,
  NONE: 0.2,
  UNKNOWN: 0.4,
};

function liquidityQuality(token: DiscoveredToken, m: ScannerMetrics): number {
  if (!isNum(token.liquidityUsd)) return 0.2;
  // $2k → 0, $200k → 1 on a log scale, so a $18k pool on a $105k cap is not
  // treated as worthless just because it misses a $40k absolute threshold.
  const abs = clamp01((Math.log10(Math.max(token.liquidityUsd, 1)) - 3.3) / 2);
  const rel = isNum(m.liquidityToMarketCap) ? clamp01(m.liquidityToMarketCap / 0.25) : 0.4;
  return 0.6 * abs + 0.4 * rel;
}

function accelerationScore(m: ScannerMetrics): number {
  const primary = m.baselineAcceleration;
  const fallback = m.shortAcceleration;
  const value = isNum(primary) ? primary : isNum(fallback) ? fallback : null;
  if (!isNum(value)) return 0.2;
  return clamp01((value - 0.8) / 2.2);
}

function participationScore(token: DiscoveredToken): number {
  const wallets = token.uniqueWallets24h ?? token.holderCount;
  if (!isNum(wallets)) return 0.3;
  return clamp01(Math.log10(Math.max(wallets, 1)) / 3);
}

function freshnessScore(m: ScannerMetrics): number {
  const mins = m.minutesSinceLastTrade;
  if (!isNum(mins)) return 0.4;
  if (mins <= 5) return 1;
  return clamp01(1 - (mins - 5) / 115);
}

function lifecycleFit(lanes: DiscoveryLane[], marketCap: number | null): number {
  if (lanes.length === 0) return 0;
  const early = lanes.includes("EARLY_MOMENTUM") || lanes.includes("POST_BOND_BASE");
  const inSweetSpot = isNum(marketCap) && marketCap >= 40_000 && marketCap <= 500_000;
  if (early && inSweetSpot) return 1;
  return 0.7;
}

function momentumScore(token: DiscoveredToken): number {
  const pc = token.priceChange1h;
  if (!isNum(pc) || pc <= 0) return 0;
  // Saturates quickly — a +500% mover scores the same as +50%.
  return clamp01(pc / 50);
}

export function quantitativePriority(
  token: DiscoveredToken,
  m: ScannerMetrics,
  signals: ScannerSignals,
  lanes: DiscoveryLane[],
): PriorityBreakdown {
  const scores: Record<PriorityComponentKey, number> = {
    activityQuality: ACTIVITY_SCORE[signals.activityState] ?? 0.2,
    acceleration: accelerationScore(m),
    persistence: PERSISTENCE_SCORE[signals.persistenceSignal] ?? 0.4,
    reacceleration: REACCELERATION_SCORE[signals.reaccelerationSignal] ?? 0.4,
    liquidityQuality: liquidityQuality(token, m),
    turnover: isNum(m.volumeToMarketCap24h) ? clamp01(m.volumeToMarketCap24h / 0.6) : 0.2,
    participation: participationScore(token),
    freshness: freshnessScore(m),
    lifecycleFit: lifecycleFit(lanes, token.marketCap),
    momentum: momentumScore(token),
  };

  const components = {} as PriorityBreakdown["components"];
  let raw = 0;
  for (const key of Object.keys(scores) as PriorityComponentKey[]) {
    const weight = PRIORITY_WEIGHTS[key];
    const score = clamp01(scores[key]);
    const points = score * weight;
    components[key] = { score: Number(score.toFixed(4)), weight, points: Number(points.toFixed(3)) };
    raw += points;
  }

  const extensionPenalty = EXTENSION_PENALTY[signals.extensionRisk] ?? 0;
  const divergenceAdjustment = DIVERGENCE_ADJUSTMENT[signals.attentionPriceDivergence] ?? 0;
  const total = Math.round(Math.min(100, Math.max(0, raw + extensionPenalty + divergenceAdjustment)));

  return {
    components,
    extensionPenalty,
    divergenceAdjustment,
    raw: Number(raw.toFixed(3)),
    total,
  };
}
