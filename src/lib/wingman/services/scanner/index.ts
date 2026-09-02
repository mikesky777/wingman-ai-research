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
