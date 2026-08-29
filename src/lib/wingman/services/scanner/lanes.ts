/**
 * Lane eligibility.
 *
 * A token may qualify for several lanes at once. Age is a first-class gate:
 * an old token can NOT enter an early lane just because its market cap and
 * liquidity happen to fit — it must go through REACCELERATION and prove fresh
 * activity. Unknown age never counts as young.
 */
import {
  LANE_ACTIVITY_REQUIREMENTS,
  LANE_CONFIG,
  LANE_PERSISTENCE_REQUIREMENTS,
} from "./config";
import { isNum } from "./metrics";
import { DISCOVERY_LANES, type DiscoveryLane, type ScannerMetrics, type ScannerSignals } from "./types";

export interface LaneEvaluation {
  lanes: DiscoveryLane[];
  rejections: Record<string, string>;
}

function laneRejection(
  lane: DiscoveryLane,
  marketCap: number | null,
  m: ScannerMetrics,
  signals: ScannerSignals,
): string | null {
  const cfg = LANE_CONFIG[lane];

  if (cfg.marketCapMin !== null || cfg.marketCapMax !== null) {
    if (!isNum(marketCap)) return "Market cap unavailable.";
    if (cfg.marketCapMin !== null && marketCap < cfg.marketCapMin) {
      return `Market cap $${Math.round(marketCap).toLocaleString()} below lane floor.`;
    }
    if (cfg.marketCapMax !== null && marketCap > cfg.marketCapMax) {
      return `Market cap $${Math.round(marketCap).toLocaleString()} above lane ceiling.`;
    }
  }

  // Age gate. Lanes with an age window require a KNOWN age.
  const hasAgeWindow = cfg.ageMinMinutes !== null || cfg.ageMaxMinutes !== null;
  if (hasAgeWindow) {
    if (!isNum(m.age.minutes)) return "Token age unknown; early lanes require a known age.";
    if (cfg.ageMinMinutes !== null && m.age.minutes < cfg.ageMinMinutes) {
      return "Token younger than the lane's minimum age.";
    }
    if (cfg.ageMaxMinutes !== null && m.age.minutes > cfg.ageMaxMinutes) {
      return "Token older than the lane's lifecycle window.";
    }
  }

  if (
    isNum(m.minutesSinceLastTrade) &&
    m.minutesSinceLastTrade > cfg.maxMinutesSinceLastTrade
  ) {
    return `Last trade ${Math.round(m.minutesSinceLastTrade)}m ago exceeds the lane's ${cfg.maxMinutesSinceLastTrade}m recency window.`;
  }

  if (cfg.minTurnover24h !== null) {
    if (!isNum(m.volumeToMarketCap24h)) return "Turnover unavailable.";
    if (m.volumeToMarketCap24h < cfg.minTurnover24h) {
      return `24h turnover ${(m.volumeToMarketCap24h * 100).toFixed(1)}% below the lane's ${(cfg.minTurnover24h * 100).toFixed(0)}% floor.`;
    }
  }

  const activity = LANE_ACTIVITY_REQUIREMENTS[lane];
  if (!activity.states.includes(signals.activityState)) {
    return `Activity state ${signals.activityState} not accepted by this lane.`;
  }
  if (activity.minBaselineAcceleration !== null) {
    const accel = m.baselineAcceleration;
    // Acceleration may also be evidenced by the short window when the 24h
    // baseline is unavailable (very young tokens).
    const shortAccel = m.shortAcceleration;
    const accelerating =
      (isNum(accel) && accel >= activity.minBaselineAcceleration) ||
      (!isNum(accel) && isNum(shortAccel) && shortAccel >= activity.minBaselineAcceleration);
    if (!accelerating) return "Activity is not accelerating versus its own baseline.";
  }
  if (
    activity.requiresReacceleration.length > 0 &&
    !activity.requiresReacceleration.includes(signals.reaccelerationSignal)
  ) {
    return `Reacceleration ${signals.reaccelerationSignal} does not show genuinely fresh interest.`;
  }

  const persistence = LANE_PERSISTENCE_REQUIREMENTS[lane];
  if (persistence && !persistence.includes(signals.persistenceSignal)) {
    return `Persistence ${signals.persistenceSignal} — the token did not retain enough activity after launch.`;
  }

  return null;
}

export function evaluateLanes(
  marketCap: number | null,
  m: ScannerMetrics,
  signals: ScannerSignals,
): LaneEvaluation {
  const lanes: DiscoveryLane[] = [];
  const rejections: Record<string, string> = {};

  for (const lane of DISCOVERY_LANES) {
    const reason = laneRejection(lane, marketCap, m, signals);
    if (reason === null) lanes.push(lane);
    else rejections[lane] = reason;
  }

  return { lanes, rejections };
}
