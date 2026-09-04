/**
 * Scanner v1 — Discovery → lifecycle understanding → dead-candidate removal →
 * early momentum / post-bond persistence detection → ranking for research.
 *
 * No thesis scoring, no AI, no opportunities, no execution.
 */
export * from "./types";
export {
  ACTIVITY_FLOOR,
  DEFAULT_RUN_CONFIG,
  DISCOVERY_CONFIG_VERSION,
  DIVERGENCE_ADJUSTMENT,
  EXTENSION_PENALTY,
  PRIORITY_WEIGHTS,
  SETUP_RESERVATION_ORDER,
  STRATEGY_CONFIG_VERSION,
  WINGMAN_DEFAULT_SETTINGS,
  normalizeStrategySettings,
  runConfig,
  type ScannerRunConfig,
  type SetupFilterConfig,
  type StrategySettings,
} from "./config";
export {
  activityFloorFor,
  computeAge,
  computeMetrics,
  hourlyPace,
  isNum,
  minutesBetween,
  ratio,
  type AgeFallbacks,
} from "./metrics";
export {
  activityState,
  attentionPriceDivergence,
  extensionAssessment,
  extensionRisk,
  persistenceSignal,
  reaccelerationSignal,
} from "./signals";
export { applyHardFilters } from "./hard-filters";
export {
  NO_VALID_DEX_MARKET,
  assessMarket,
  marketRejection,
  type MarketResolution,
} from "./market-eligibility";
export { evaluateLanes, evaluateSetups, type LaneEvaluation, type SetupEvaluation } from "./lanes";
export { quantitativePriority } from "./priority";
export {
  assignRanks,
  dedupeDiscovered,
  evaluateCandidate,
  rankCandidates,
  selectSurvivors,
  selectSurvivorsWithReservations,
  type EvaluateOptions,
  type SurvivorSelection,
} from "./evaluate";
export { bucketDiagnostics, laneDiagnostics, marketCapBucket } from "./diagnostics";
export { TelemetryRecorder } from "./telemetry";
export {
  RECURRENCE_CONFIG,
  deriveRecurrence,
  type RecurrenceAppearance,
  type RecurrenceInfo,
  type RecurrenceState,
} from "./recurrence";
export {
  REFRESH_CONFIG,
  deriveRefreshState,
  evidenceAgeMinutes,
  type RefreshConfig,
  type RefreshDecision,
  type RefreshDiagnostics,
  type RefreshState,
} from "./refresh";

export {
  assessRecentMarketDamage,
  isRecentMarketDamageEligible,
  RECENT_CATASTROPHIC_COLLAPSE,
  type MarketDamageAssessment,
  type MarketDamageStatus,
} from "./market-damage";

export {
  EXTREME_REPETITIVE_PARTICIPATION,
  PARTICIPATION_CALIBRATION,
  PARTICIPATION_IS_VETO,
  PARTICIPATION_POLICY_VERSION,
  PARTICIPATION_SELECTION_EFFECT,
  PARTICIPATION_SHADOW_MODE,
  PARTICIPATION_WINDOWS,
  deriveWindowMetrics,
  evaluateParticipation,
  isParticipationEligible,
  unknownParticipation,
  type ParticipationEvaluation,
  type ParticipationStatus,
  type ParticipationWindow,
  type ParticipationWindowMetrics,
} from "./participation";
