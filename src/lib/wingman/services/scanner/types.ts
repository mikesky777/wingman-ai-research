/**
 * Scanner v1 domain model.
 *
 * Everything here is provider-independent and chain-aware. Providers map their
 * own shapes into `DiscoveredToken`; nothing downstream ever sees a Birdeye or
 * DexScreener payload.
 *
 * Hard rule throughout: unavailable data is `null`, never `0`. A genuine zero
 * (no trades, no volume) is a fact and stays `0`.
 */
import type { ChainId } from "../external/chains";

export const SCANNER_VERSION = "scanner/v1";

/** Lifecycle archetypes, not market-cap buckets. */
export type DiscoveryLane =
  | "EARLY_MOMENTUM"
  | "POST_BOND_BASE"
  | "DEVELOPING_THESIS"
  | "REACCELERATION";

export const DISCOVERY_LANES: DiscoveryLane[] = [
  "EARLY_MOMENTUM",
  "POST_BOND_BASE",
  "DEVELOPING_THESIS",
  "REACCELERATION",
];

export type ActivityState =
  | "DORMANT"
  | "LOW"
  | "ACTIVE"
  | "ACCELERATING"
  | "EXTREME"
  | "UNKNOWN";

export type PersistenceSignal = "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";

export type ReaccelerationSignal = "NONE" | "EARLY" | "CONFIRMED" | "EXTREME" | "UNKNOWN";

export type ExtensionRisk = "LOW" | "MODERATE" | "HIGH" | "EXTREME" | "UNKNOWN";

export type AttentionPriceDivergence = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "UNKNOWN";

/** Which discovery ranking surfaced a candidate. Provenance is never lost. */
export type DiscoveryQueryFamily =
  | "volume"
  | "volume_change"
  | "trade_count"
  | "recent_listing"
  | "liquidity"
  | "holder";

export interface DiscoveryHit {
  source: string;
  /** Stable id of the exact query, e.g. `volume_1h_lowcap`. */
  queryId: string;
  family: DiscoveryQueryFamily;
  /** 0-based position inside that query's result page. */
  rank: number;
  /** Lanes the query was designed to surface (a hint, never a verdict). */
  laneHints: DiscoveryLane[];
}

/**
 * Normalized discovery record. Every numeric field may be `null` = unavailable.
 * `ageMinutes === null` means UNKNOWN age and must never be treated as new.
 */
export interface DiscoveredToken {
  chain: ChainId;
  contractAddress: string;
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;

  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;

  volume5m: number | null;
  volume1h: number | null;
  volume6h: number | null;
  volume24h: number | null;

  trades5m: number | null;
  trades1h: number | null;
  trades6h: number | null;
  trades24h: number | null;

  buys24h: number | null;
  sells24h: number | null;

  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;

  holderCount: number | null;
  uniqueWallets24h: number | null;

  /** Provider listing time, when the provider supplies one. */
  listedAt: string | null;
  lastTradeAt: string | null;

  discovery: DiscoveryHit[];
}

export type AgeBasis = "provider_listing" | "pair_created" | "token_created" | "unknown";

export interface TokenAge {
  minutes: number | null;
  basis: AgeBasis;
}

/** Duration-normalized activity, expressed as USD-per-hour / trades-per-hour. */
export interface ScannerMetrics {
  age: TokenAge;
  minutesSinceLastTrade: number | null;

  volumeToMarketCap24h: number | null;
  volumeToLiquidity24h: number | null;
  volumeToMarketCap1h: number | null;
  liquidityToMarketCap: number | null;

  /** Hourly volume pace derived from each window. Never a forecast. */
  hourlyPaceFrom5m: number | null;
  hourlyPaceFrom1h: number | null;
  hourlyPaceFrom6h: number | null;
  hourlyPaceFrom24h: number | null;

  hourlyTradePaceFrom5m: number | null;
  hourlyTradePaceFrom1h: number | null;
  hourlyTradePaceFrom24h: number | null;

  /** 5m pace vs 1h pace. */
  shortAcceleration: number | null;
  /** 1h pace vs 6h pace. */
  midAcceleration: number | null;
  /** 1h pace vs 24h baseline pace. */
  baselineAcceleration: number | null;
  tradeAcceleration: number | null;

  buyRatio24h: number | null;
  /** Age-aware minimum meaningful recent volume applied by the activity floor. */
  activityFloorUsd: number;
  /** Volume compared against the floor, chosen for the token's age. */
  activityWindowVolume: number | null;
  activityWindowLabel: "5m" | "1h" | "6h" | "24h" | "unknown";
}

export interface ScannerSignals {
  activityState: ActivityState;
  persistenceSignal: PersistenceSignal;
  reaccelerationSignal: ReaccelerationSignal;
  extensionRisk: ExtensionRisk;
  attentionPriceDivergence: AttentionPriceDivergence;
}

export interface HardFilterRejection {
  reason: string;
  detail: string;
  values: Record<string, number | string | boolean | null>;
}

export type PriorityComponentKey =
  | "activityQuality"
  | "acceleration"
  | "persistence"
  | "reacceleration"
  | "liquidityQuality"
  | "turnover"
  | "participation"
  | "freshness"
  | "lifecycleFit"
  | "momentum";

export interface PriorityBreakdown {
  components: Record<PriorityComponentKey, { score: number; weight: number; points: number }>;
  extensionPenalty: number;
  divergenceAdjustment: number;
  raw: number;
  total: number;
}

export type CandidateStage =
  | "discovered"
  | "hard_filters"
  | "quantitative"
  | "enriched";

/** One deduplicated candidate, fully evaluated. Never a thesis score. */
export interface EvaluatedCandidate {
  token: DiscoveredToken;
  metrics: ScannerMetrics;
  signals: ScannerSignals;
  lanes: DiscoveryLane[];
  /** Why each lane was refused — kept for calibration, never hidden. */
  laneRejections: Record<string, string>;
  passedHardFilters: boolean;
  rejection: HardFilterRejection | null;
  quantitativePriority: number | null;
  priority: PriorityBreakdown | null;
  stageReached: CandidateStage;
  enriched: boolean;
}

/** Prior snapshots for the same token, oldest → newest. History is optional. */
export interface HistoricalPoint {
  capturedAt: string;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume1h: number | null;
  volume24h: number | null;
  priceUsd: number | null;
}

export interface ProviderCallTelemetry {
  provider: string;
  capability: string;
  requests: number;
  successes: number;
  failures: number;
  durationMs: number;
}
