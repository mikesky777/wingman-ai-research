/**
 * Setup eligibility (MOMENTUM / BASE / REACCEL).
 *
 * A token may match several setups at once. Matching none is NOT a rejection:
 * the candidate is simply `NONE` and still competes in the global ranking.
 * Age is a first-class gate and unknown age never counts as young.
 */
import { WINGMAN_DEFAULT_SETTINGS, type SetupFilterConfig, type StrategySettings } from "./config";
import { isNum } from "./metrics";
import { SETUP_TYPES, type ScannerMetrics, type ScannerSignals, type SetupType } from "./types";

export interface LaneEvaluation {
  lanes: SetupType[];
  rejections: Record<string, string>;
}

export type SetupEvaluation = LaneEvaluation;

function setupRejection(
  cfg: SetupFilterConfig,
  marketCap: number | null,
  m: ScannerMetrics,
  signals: ScannerSignals,
): string | null {
  if (!cfg.enabled) return "Setup disabled in strategy settings.";

  if (cfg.marketCapMin !== null || cfg.marketCapMax !== null) {
    if (!isNum(marketCap)) return "Market cap unavailable.";
    if (cfg.marketCapMin !== null && marketCap < cfg.marketCapMin) {
      return `Market cap $${Math.round(marketCap).toLocaleString()} below setup floor.`;
    }
    if (cfg.marketCapMax !== null && marketCap > cfg.marketCapMax) {
      return `Market cap $${Math.round(marketCap).toLocaleString()} above setup ceiling.`;
    }
  }

  const hasAgeWindow = cfg.ageMinMinutes !== null || cfg.ageMaxMinutes !== null;
  if (hasAgeWindow || cfg.requiresKnownAge) {
    if (!isNum(m.age.minutes)) return "Token age unknown; this setup requires a known age.";
    if (cfg.ageMinMinutes !== null && m.age.minutes < cfg.ageMinMinutes) {
      return "Token younger than the setup's minimum age.";
    }
    if (cfg.ageMaxMinutes !== null && m.age.minutes > cfg.ageMaxMinutes) {
      return "Token older than the setup's age window.";
    }
  }

  if (isNum(m.minutesSinceLastTrade) && m.minutesSinceLastTrade > cfg.maxMinutesSinceLastTrade) {
    return `Last trade ${Math.round(m.minutesSinceLastTrade)}m ago exceeds the setup's ${cfg.maxMinutesSinceLastTrade}m recency window.`;
  }

  if (cfg.minTurnover24h !== null) {
    if (!isNum(m.volumeToMarketCap24h)) return "Turnover unavailable.";
    if (m.volumeToMarketCap24h < cfg.minTurnover24h) {
      return `24h turnover ${(m.volumeToMarketCap24h * 100).toFixed(1)}% below the setup's ${(cfg.minTurnover24h * 100).toFixed(0)}% floor.`;
    }
  }

  if (!cfg.activityStates.includes(signals.activityState)) {
    return `Activity state ${signals.activityState} not accepted by this setup.`;
  }

  if (cfg.minBaselineAcceleration !== null) {
    const accel = m.baselineAcceleration;
    // Very young tokens may only have a short window; use it when the 24h
    // baseline is unavailable.
    const shortAccel = m.shortAcceleration;
    const accelerating =
      (isNum(accel) && accel >= cfg.minBaselineAcceleration) ||
      (!isNum(accel) && isNum(shortAccel) && shortAccel >= cfg.minBaselineAcceleration);
    if (!accelerating) return "Activity is not accelerating versus its own baseline.";
  }

  if (
    cfg.requiresReacceleration.length > 0 &&
    !cfg.requiresReacceleration.includes(signals.reaccelerationSignal)
  ) {
    return `Reacceleration ${signals.reaccelerationSignal} does not show genuinely renewed interest.`;
  }

  if (cfg.persistenceStates && !cfg.persistenceStates.includes(signals.persistenceSignal)) {
    return `Persistence ${signals.persistenceSignal} — the token did not retain enough activity after launch.`;
  }

  return null;
}

export function evaluateSetups(
  marketCap: number | null,
  m: ScannerMetrics,
  signals: ScannerSignals,
  strategy: StrategySettings = WINGMAN_DEFAULT_SETTINGS,
): SetupEvaluation {
  const lanes: SetupType[] = [];
  const rejections: Record<string, string> = {};

  for (const setup of SETUP_TYPES) {
    const reason = setupRejection(strategy.setups[setup], marketCap, m, signals);
    if (reason === null) lanes.push(setup);
    else rejections[setup] = reason;
  }

  return { lanes, rejections };
}

/** @deprecated use {@link evaluateSetups} */
export const evaluateLanes = evaluateSetups;
