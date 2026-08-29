/**
 * Scanner v1 configuration — the single source of truth for every threshold.
 *
 * These are EXPERIMENTAL v1 values chosen to avoid false negatives. Nothing
 * here is tuned against live results yet; do not overfit. All values are
 * deliberately configurable so calibration can move them without touching the
 * deterministic logic that reads them.
 */
import type { DiscoveryLane } from "./types";

export const SCANNER_VERSION = "scanner/v1";
export const DISCOVERY_CONFIG_VERSION = "discovery/v1";

export interface LaneConfig {
  lane: DiscoveryLane;
  /** Emphasis, not a universal law. Bounds are generous on purpose. */
  marketCapMin: number | null;
  marketCapMax: number | null;
  /** Emphasis band reported in the UI / tests. */
  marketCapEmphasis: [number, number] | null;
  ageMinMinutes: number | null;
  ageMaxMinutes: number | null;
  /** Meaningful trading must have happened within this many minutes. */
  maxMinutesSinceLastTrade: number;
  /** Minimum 24h volume / market cap turnover, when turnover is computable. */
  minTurnover24h: number | null;
  description: string;
}

const MIN = 1;
const HOUR = 60;
const DAY = 24 * HOUR;

export const LANE_CONFIG: Record<DiscoveryLane, LaneConfig> = {
  EARLY_MOMENTUM: {
    lane: "EARLY_MOMENTUM",
    marketCapMin: 30_000,
    marketCapMax: 750_000,
    marketCapEmphasis: [40_000, 500_000],
    ageMinMinutes: 10 * MIN,
    ageMaxMinutes: 72 * HOUR,
    maxMinutesSinceLastTrade: 15,
    minTurnover24h: null,
    description: "Early ignition: participation accelerating before the move is obvious.",
  },
  POST_BOND_BASE: {
    lane: "POST_BOND_BASE",
    marketCapMin: 30_000,
    marketCapMax: 750_000,
    marketCapEmphasis: [40_000, 500_000],
    ageMinMinutes: 30 * MIN,
    ageMaxMinutes: 7 * DAY,
    maxMinutesSinceLastTrade: 60,
    minTurnover24h: 0.12,
    description: "Post-bond retrace that refused to die: persistent turnover during consolidation.",
  },
  DEVELOPING_THESIS: {
    lane: "DEVELOPING_THESIS",
    marketCapMin: 75_000,
    marketCapMax: 3_000_000,
    marketCapEmphasis: [100_000, 2_000_000],
    ageMinMinutes: 6 * HOUR,
    ageMaxMinutes: 30 * DAY,
    maxMinutesSinceLastTrade: 60,
    minTurnover24h: 0.05,
    description: "Past the launch window but still early enough to offer asymmetry.",
  },
  REACCELERATION: {
    lane: "REACCELERATION",
    marketCapMin: 750_000,
    marketCapMax: null,
    marketCapEmphasis: null,
    ageMinMinutes: null,
    ageMaxMinutes: null,
    maxMinutesSinceLastTrade: 30,
    minTurnover24h: null,
    description: "Older or larger tokens showing genuinely new interest versus their own baseline.",
  },
};

/**
 * EARLY_MOMENTUM needs acceleration, not just presence. POST_BOND_BASE and
 * DEVELOPING_THESIS accept steady ACTIVE trading. REACCELERATION demands a
 * real break from the token's own baseline.
 */
export const LANE_ACTIVITY_REQUIREMENTS: Record<
  DiscoveryLane,
  { states: string[]; minBaselineAcceleration: number | null; requiresReacceleration: string[] }
> = {
  EARLY_MOMENTUM: {
    states: ["ACTIVE", "ACCELERATING", "EXTREME"],
    minBaselineAcceleration: 1.15,
    requiresReacceleration: [],
  },
  POST_BOND_BASE: {
    states: ["ACTIVE", "ACCELERATING", "EXTREME"],
    minBaselineAcceleration: null,
    requiresReacceleration: [],
  },
  DEVELOPING_THESIS: {
    states: ["ACTIVE", "ACCELERATING", "EXTREME"],
    minBaselineAcceleration: null,
    requiresReacceleration: [],
  },
  REACCELERATION: {
    states: ["ACCELERATING", "EXTREME"],
    minBaselineAcceleration: 1.4,
    requiresReacceleration: ["EARLY", "CONFIRMED", "EXTREME"],
  },
};

/** POST_BOND_BASE is the survival lane; weak persistence disqualifies it. */
export const LANE_PERSISTENCE_REQUIREMENTS: Partial<Record<DiscoveryLane, string[]>> = {
  POST_BOND_BASE: ["MODERATE", "HIGH", "UNKNOWN"],
};

export interface ActivityFloorConfig {
  /** Full-strength 24h floor for a mature token. Configurable, not universal. */
  baseVolumeUsd24h: number;
  /** Never demand more than this from a token minutes old. */
  minVolumeUsd: number;
  /** No trade in this long = dead regardless of headline numbers. */
  deadMinutesSinceLastTrade: number;
  /** Below this, the market cannot support meaningful trading at all. */
  catastrophicLiquidityUsd: number;
  /** Soft floor: allowed, but liquidity quality is scored down. */
  softLiquidityUsd: number;
  minTrades24h: number;
}

export const ACTIVITY_FLOOR: ActivityFloorConfig = {
  baseVolumeUsd24h: 10_000,
  minVolumeUsd: 750,
  deadMinutesSinceLastTrade: 360,
  catastrophicLiquidityUsd: 3_000,
  softLiquidityUsd: 15_000,
  minTrades24h: 1,
};

export const PRIORITY_WEIGHTS = {
  activityQuality: 18,
  acceleration: 16,
  persistence: 12,
  reacceleration: 10,
  liquidityQuality: 12,
  turnover: 10,
  participation: 8,
  freshness: 6,
  lifecycleFit: 5,
  momentum: 3,
} as const;

export const EXTENSION_PENALTY: Record<string, number> = {
  LOW: 0,
  MODERATE: -3,
  HIGH: -10,
  EXTREME: -18,
  UNKNOWN: -2,
};

export const DIVERGENCE_ADJUSTMENT: Record<string, number> = {
  POSITIVE: 4,
  NEUTRAL: 0,
  NEGATIVE: -6,
  UNKNOWN: 0,
};

/**
 * Lane-aware survivor reservations.
 *
 * A single global top-N enrichment selection systematically crowds out quieter
 * archetypes (a consolidating post-bond base can never out-score a vertical
 * momentum token). These are CALIBRATION values, not permanent strategy rules.
 * Unused lane capacity always flows back to the global pool, and a token that
 * belongs to several lanes still costs exactly one survivor slot.
 */
export const LANE_SURVIVOR_RESERVATIONS: Record<DiscoveryLane, number> = {
  EARLY_MOMENTUM: 12,
  POST_BOND_BASE: 15,
  DEVELOPING_THESIS: 12,
  REACCELERATION: 6,
};

/** Deterministic order in which lane reservations are filled. */
export const LANE_RESERVATION_ORDER: DiscoveryLane[] = [
  "POST_BOND_BASE",
  "EARLY_MOMENTUM",
  "DEVELOPING_THESIS",
  "REACCELERATION",
];

export interface ScannerRunConfig {
  chain: string;
  calibrationMode: boolean;
  /** How many ranked survivors get DexScreener enrichment + a new snapshot. */
  survivorEnrichmentLimit: number;
  /** Results requested per discovery query. */
  discoveryPageSize: number;
  /** Rejected candidates persisted for calibration. */
  maxPersistedRejections: number;
  /** Per-lane reserved enrichment slots, filled before the global pool. */
  laneReservations: Record<DiscoveryLane, number>;
}


export const DEFAULT_RUN_CONFIG: ScannerRunConfig = {
  chain: "solana",
  calibrationMode: true,
  survivorEnrichmentLimit: 30,
  discoveryPageSize: 50,
  maxPersistedRejections: 400,
  laneReservations: LANE_SURVIVOR_RESERVATIONS,
};


export function runConfig(overrides: Partial<ScannerRunConfig> = {}): ScannerRunConfig {
  const merged = { ...DEFAULT_RUN_CONFIG, ...overrides };
  // Calibration keeps more of everything so false negatives stay visible.
  if (merged.calibrationMode && overrides.survivorEnrichmentLimit === undefined) {
    merged.survivorEnrichmentLimit = 50;
  }
  return merged;
}
