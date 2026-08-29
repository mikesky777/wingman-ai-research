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
  LANE_ACTIVITY_REQUIREMENTS,
  LANE_CONFIG,
  LANE_PERSISTENCE_REQUIREMENTS,
  PRIORITY_WEIGHTS,
  runConfig,
  type LaneConfig,
  type ScannerRunConfig,
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
  extensionRisk,
  persistenceSignal,
  reaccelerationSignal,
} from "./signals";
export { applyHardFilters } from "./hard-filters";
export { evaluateLanes, type LaneEvaluation } from "./lanes";
export { quantitativePriority } from "./priority";
export {
  dedupeDiscovered,
  evaluateCandidate,
  rankCandidates,
  selectSurvivors,
  type EvaluateOptions,
} from "./evaluate";
export { TelemetryRecorder } from "./telemetry";
