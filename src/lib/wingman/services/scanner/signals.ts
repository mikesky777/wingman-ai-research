/**
 * Deterministic lifecycle signals.
 *
 * All five are pure functions of metrics + optional history. None of them is a
 * thesis score, a probability, or a recommendation. Same inputs always produce
 * the same output, which is what makes calibration possible later.
 */
import { ACTIVITY_FLOOR } from "./config";
import { isNum, ratio } from "./metrics";
import type {
  ActivityState,
  AttentionPriceDivergence,
  DiscoveredToken,
  ExtensionAssessment,
  ExtensionRisk,
  HistoricalPoint,
  PersistenceSignal,
  ReaccelerationSignal,
  ScannerMetrics,
} from "./types";

/**
 * ACTIVITY STATE — describes how much is happening, never whether it is good.
 * Order of evaluation is fixed: UNKNOWN → DORMANT → EXTREME → ACCELERATING →
 * ACTIVE → LOW.
 */
export function activityState(token: DiscoveredToken, m: ScannerMetrics): ActivityState {
  const hasVolume = isNum(token.volume24h) || isNum(token.volume1h);
  const hasTrades = isNum(token.trades24h);
  if (!hasVolume && !hasTrades) return "UNKNOWN";

  const sinceTrade = m.minutesSinceLastTrade;
  if (isNum(sinceTrade) && sinceTrade > ACTIVITY_FLOOR.deadMinutesSinceLastTrade) return "DORMANT";
  if (isNum(token.trades24h) && token.trades24h === 0) return "DORMANT";
  if (isNum(m.volumeToMarketCap24h) && m.volumeToMarketCap24h < 0.005 && (token.trades24h ?? 0) < 50) {
    return "DORMANT";
  }

  const accel = m.baselineAcceleration;
  const shortAccel = m.shortAcceleration;
  const pace = m.hourlyPaceFrom1h;
  const meaningfulPace = isNum(pace) && pace >= 250;

  if (
    meaningfulPace &&
    isNum(accel) &&
    accel >= 5 &&
    isNum(m.volumeToMarketCap24h) &&
    m.volumeToMarketCap24h >= 1
  ) {
    return "EXTREME";
  }
  if (meaningfulPace && ((isNum(accel) && accel >= 1.5) || (isNum(shortAccel) && shortAccel >= 2))) {
    return "ACCELERATING";
  }

  const trades24h = token.trades24h;
  const activeByTrades = isNum(trades24h) && trades24h >= 50;
  const activeByTurnover = isNum(m.volumeToMarketCap24h) && m.volumeToMarketCap24h >= 0.05;
  const activeByFloor =
    isNum(m.activityWindowVolume) && m.activityWindowVolume >= m.activityFloorUsd;
  if (activeByTrades || activeByTurnover || activeByFloor) return "ACTIVE";

  return "LOW";
}

/** Highest 24h volume seen in prior scanner history, if any. */
function peakHistoricalVolume24h(history: HistoricalPoint[]): number | null {
  const values = history.map((h) => h.volume24h).filter(isNum);
  return values.length ? Math.max(...values) : null;
}

/**
 * PERSISTENCE — "this token should have died by now, but it hasn't."
 * Volume falling away from the launch peak is expected and is NOT penalised;
 * what matters is retained turnover, retained liquidity and continued trading.
 */
export function persistenceSignal(
  token: DiscoveredToken,
  m: ScannerMetrics,
  history: HistoricalPoint[] = [],
): PersistenceSignal {
  const age = m.age.minutes;
  // Too young for survival to mean anything yet, or nothing to judge with.
  if (!isNum(age) || age < 6 * 60) return "UNKNOWN";
  if (!isNum(m.volumeToMarketCap24h) && !isNum(token.trades24h)) return "UNKNOWN";

  let points = 0;
  const turnover = m.volumeToMarketCap24h;
  if (isNum(turnover)) {
    if (turnover >= 0.3) points += 2;
    else if (turnover >= 0.12) points += 1;
  }
  const trades = token.trades24h;
  if (isNum(trades)) {
    if (trades >= 1000) points += 2;
    else if (trades >= 300) points += 1;
  }
  if (isNum(m.liquidityToMarketCap) && m.liquidityToMarketCap >= 0.1) points += 1;
  if (age >= 48 * 60) points += 1;

  const peak = peakHistoricalVolume24h(history);
  const retention = ratio(token.volume24h, peak);
  if (isNum(retention) && retention >= 0.15) points += 1;

  if (isNum(m.minutesSinceLastTrade) && m.minutesSinceLastTrade > 120) points -= 2;

  if (points >= 4) return "HIGH";
  if (points >= 2) return "MODERATE";
  return "LOW";
}

/**
 * REACCELERATION — new interest measured against the token's OWN baseline.
 * Price is never an input.
 */
export function reaccelerationSignal(
  m: ScannerMetrics,
  history: HistoricalPoint[] = [],
): ReaccelerationSignal {
  const baseline = m.baselineAcceleration;
  if (!isNum(baseline)) return "UNKNOWN";

  const mid = m.midAcceleration;
  const trade = m.tradeAcceleration;

  // Historical confirmation: current 1h pace vs the best prior 1h volume.
  const priorPeak1h = (() => {
    const values = history.map((h) => h.volume1h).filter(isNum);
    return values.length ? Math.max(...values) : null;
  })();
  const versusHistory = ratio(m.hourlyPaceFrom1h, priorPeak1h);

  if (baseline >= 6 && (!isNum(trade) || trade >= 2)) return "EXTREME";
  if (baseline >= 2.5 && ((isNum(mid) && mid >= 1.5) || (isNum(trade) && trade >= 1.5))) {
    return "CONFIRMED";
  }
  if (isNum(versusHistory) && versusHistory >= 2 && baseline >= 1.5) return "CONFIRMED";
  if (baseline >= 1.4) return "EARLY";
  if (isNum(mid) && mid >= 1.3 && isNum(trade) && trade >= 1.2) return "EARLY";
  return "NONE";
}

/**
 * EXTENSION RISK — how badly price has already run. This is a research caveat,
 * never a rejection: high priority + HIGH extension means "worth researching,
 * poor entry right now".
 */
export function extensionAssessment(
  token: DiscoveredToken,
  m: ScannerMetrics,
  history: HistoricalPoint[] = [],
): ExtensionAssessment {
  const pc1h = token.priceChange1h;
  const pc5m = token.priceChange5m;
  const pc24h = token.priceChange24h;
  if (!isNum(pc1h) && !isNum(pc24h)) {
    return { risk: "UNKNOWN", reasons: ["No price-change evidence available."] };
  }

  // Expansion versus the lowest price we have on record for this token.
  const lows = history.map((h) => h.priceUsd).filter(isNum);
  const baseLow = lows.length ? Math.min(...lows) : null;
  const expansion = ratio(token.priceUsd, baseLow);

  const accel = m.baselineAcceleration;
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;

  const extreme: string[] = [];
  if (isNum(pc1h) && pc1h >= 200) extreme.push(`${pct(pc1h)} price change over 1h.`);
  if (isNum(pc24h) && pc24h >= 1000) extreme.push(`${pct(pc24h)} price change over 24h.`);
  if (isNum(expansion) && expansion >= 8) {
    extreme.push(`Price is ${expansion.toFixed(1)}× the lowest price in Wingman history.`);
  }
  if (extreme.length) return { risk: "EXTREME", reasons: extreme };

  const high: string[] = [];
  if (isNum(pc1h) && pc1h >= 75) high.push(`${pct(pc1h)} price change over 1h.`);
  if (isNum(pc24h) && pc24h >= 300) high.push(`${pct(pc24h)} price change over 24h.`);
  if (isNum(pc5m) && pc5m >= 25 && isNum(accel) && accel >= 5) {
    high.push(
      `Short-window activity concentrated during vertical price expansion (${pct(pc5m)} in 5m at ${accel.toFixed(1)}× baseline volume pace).`,
    );
  }
  if (isNum(expansion) && expansion >= 3) {
    high.push(`Price is ${expansion.toFixed(1)}× the lowest price in Wingman history.`);
  }
  if (high.length) return { risk: "HIGH", reasons: high };

  const moderate: string[] = [];
  if (isNum(pc1h) && pc1h >= 25) moderate.push(`${pct(pc1h)} price change over 1h.`);
  if (isNum(pc24h) && pc24h >= 100) moderate.push(`${pct(pc24h)} price change over 24h.`);
  if (moderate.length) return { risk: "MODERATE", reasons: moderate };

  return {
    risk: "LOW",
    reasons: [
      `Price expansion within normal bounds${isNum(pc24h) ? ` (${pct(pc24h)} over 24h)` : ""}.`,
    ],
  };
}

export function extensionRisk(
  token: DiscoveredToken,
  m: ScannerMetrics,
  history: HistoricalPoint[] = [],
): ExtensionRisk {
  return extensionAssessment(token, m, history).risk;
}


/**
 * ATTENTION vs PRICE — experimental. POSITIVE means participation is growing
 * faster than price; NEGATIVE means price has outrun participation. No claim of
 * predictive power is made.
 */
export function attentionPriceDivergence(
  token: DiscoveredToken,
  m: ScannerMetrics,
): AttentionPriceDivergence {
  const volumeGrowthPct = isNum(m.baselineAcceleration) ? (m.baselineAcceleration - 1) * 100 : null;
  const tradeGrowthPct = isNum(m.tradeAcceleration) ? (m.tradeAcceleration - 1) * 100 : null;
  const attention =
    volumeGrowthPct === null && tradeGrowthPct === null
      ? null
      : Math.max(volumeGrowthPct ?? -Infinity, tradeGrowthPct ?? -Infinity);
  const price = token.priceChange1h;
  if (!isNum(attention) || !isNum(price)) return "UNKNOWN";

  // Nothing much moving either way.
  if (Math.abs(price) < 5 && attention < 5) return "NEUTRAL";
  if (price <= 0) return attention >= 20 ? "POSITIVE" : "NEUTRAL";

  const r = attention / Math.max(price, 1);
  if (r >= 1.5) return "POSITIVE";
  if (r <= 0.5) return "NEGATIVE";
  return "NEUTRAL";
}
