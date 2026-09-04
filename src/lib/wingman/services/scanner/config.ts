/**
 * Scanner configuration — the single source of truth for every threshold.
 *
 * Setup filters describe observable market BEHAVIOUR only. They are not thesis
 * scores, safety ratings or buy signals. Every threshold here is editable
 * calibration state: the deterministic logic reads configuration, it never
 * hardcodes a number.
 */
import type {
  ActivityState,
  PersistenceSignal,
  ReaccelerationSignal,
  SetupType,
} from "./types";
import { SETUP_TYPES } from "./types";

export const SCANNER_VERSION = "scanner/v2";
export const DISCOVERY_CONFIG_VERSION = "discovery/v1";
export const STRATEGY_CONFIG_VERSION = "setup-taxonomy/v2";

/** Editable eligibility filter for one observable setup. */
export interface SetupFilterConfig {
  setup: SetupType;
  enabled: boolean;
  /** `null` = no limit. */
  marketCapMin: number | null;
  marketCapMax: number | null;
  /** Descriptive core range shown in the UI. Never affects scoring. */
  marketCapEmphasis: [number, number] | null;
  ageMinMinutes: number | null;
  ageMaxMinutes: number | null;
  /** Setups with an age window require a KNOWN age. */
  requiresKnownAge: boolean;
  maxMinutesSinceLastTrade: number;
  minTurnover24h: number | null;
  /**
   * Hard minimum trailing 24h volume (USD) for the setup. `null` = no floor.
   * Unavailable volume is NEVER treated as zero.
   */
  minVolume24hUsd: number | null;
  activityStates: ActivityState[];
  minBaselineAcceleration: number | null;
  requiresReacceleration: ReaccelerationSignal[];
  persistenceStates: PersistenceSignal[] | null;
  description: string;
}

/** Complete editable scanner strategy. Snapshotted on every run. */
export interface StrategySettings {
  name: string;
  configVersion: string;
  setups: Record<SetupType, SetupFilterConfig>;
  /** Reserved enrichment slots per setup, filled before the global pool. */
  reservations: Record<SetupType, number>;
  survivorLimit: number;
  /**
   * Maximum SETUP = NONE candidates allowed in through the global route on one
   * run. The global escape hatch stays open (the taxonomy may be incomplete)
   * but never fills the Survivor pool. Not a target: unused capacity is fine.
   */
  maxNoneGlobalSurvivors: number;
}

const MIN = 1;
const HOUR = 60;
const DAY = 24 * HOUR;

/** Wingman Default v1 — the built-in starting point for calibration. */
export const WINGMAN_DEFAULT_SETTINGS: StrategySettings = {
  name: "Wingman Default v1",
  configVersion: STRATEGY_CONFIG_VERSION,
  setups: {
    MOMENTUM: {
      setup: "MOMENTUM",
      // Disabled in Wingman Default v1: the setup, classifier and settings stay
      // intact and can be re-enabled at any time.
      enabled: false,
      marketCapMin: 30_000,
      marketCapMax: 500_000,
      marketCapEmphasis: null,
      ageMinMinutes: 3 * HOUR,
      ageMaxMinutes: 72 * HOUR,
      requiresKnownAge: true,
      maxMinutesSinceLastTrade: 15,
      minTurnover24h: null,
      minVolume24hUsd: null,
      activityStates: ["ACTIVE", "ACCELERATING", "EXTREME"],
      minBaselineAcceleration: 1.15,
      requiresReacceleration: [],
      persistenceStates: null,
      description: "Young token trading with genuine acceleration against its own baseline.",
    },
    BASE: {
      setup: "BASE",
      enabled: true,
      marketCapMin: 30_000,
      marketCapMax: 500_000,
      marketCapEmphasis: [30_000, 200_000],
      ageMinMinutes: 12 * HOUR,
      ageMaxMinutes: 10 * DAY,
      requiresKnownAge: true,
      maxMinutesSinceLastTrade: 60,
      minTurnover24h: 0.12,
      // BASE must show meaningful participation, not just survival.
      minVolume24hUsd: 10_000,
      activityStates: ["ACTIVE", "ACCELERATING", "EXTREME"],
      minBaselineAcceleration: null,
      requiresReacceleration: [],
      persistenceStates: ["MODERATE", "HIGH", "UNKNOWN"],
      description: "Survived the launch window and kept trading; acceleration is not required.",
    },
    REACCEL: {
      setup: "REACCEL",
      enabled: true,
      marketCapMin: 30_000,
      marketCapMax: null,
      marketCapEmphasis: null,
      ageMinMinutes: 14 * DAY,
      ageMaxMinutes: null,
      requiresKnownAge: true,
      maxMinutesSinceLastTrade: 30,
      minTurnover24h: null,
      // REACCEL is deliberately unaffected by the BASE volume floor.
      minVolume24hUsd: null,
      activityStates: ["ACCELERATING", "EXTREME"],
      minBaselineAcceleration: 1.4,
      requiresReacceleration: ["EARLY", "CONFIRMED", "EXTREME"],
      persistenceStates: null,
      description: "Older token showing genuinely renewed interest versus its own baseline.",
    },
  },
  reservations: { BASE: 15, MOMENTUM: 0, REACCEL: 8 },
  survivorLimit: 50,
  maxNoneGlobalSurvivors: 5,
};

/** Deterministic order in which setup reservations are filled. */
export const SETUP_RESERVATION_ORDER: SetupType[] = ["BASE", "MOMENTUM", "REACCEL"];

/**
 * Recent Catastrophic Collapse gate — the single configurable threshold for
 * the current-market Survivor veto. Descriptive elsewhere: it never touches
 * priority, setup definitions, structural or Price Integrity logic.
 */
export const RECENT_MARKET_DAMAGE = {
  /** 1h price change (percent) at or below which a candidate is vetoed. */
  maxPriceChange1hPct: -90,
};


const ACTIVITY_STATE_VALUES: ActivityState[] = [
  "DORMANT",
  "LOW",
  "ACTIVE",
  "ACCELERATING",
  "EXTREME",
  "UNKNOWN",
];
const PERSISTENCE_VALUES: PersistenceSignal[] = ["LOW", "MODERATE", "HIGH", "UNKNOWN"];
const REACCEL_VALUES: ReaccelerationSignal[] = ["NONE", "EARLY", "CONFIRMED", "EXTREME", "UNKNOWN"];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNum(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function enumList<T extends string>(value: unknown, allowed: T[], fallback: T[]): T[] {
  if (!Array.isArray(value)) return fallback;
  const picked = value.filter((v): v is T => typeof v === "string" && allowed.includes(v as T));
  return picked.length > 0 ? picked : fallback;
}

function normalizeSetup(setup: SetupType, raw: unknown): SetupFilterConfig {
  const base = WINGMAN_DEFAULT_SETTINGS.setups[setup];
  const r = (raw ?? {}) as Record<string, unknown>;
  const marketCapMin = nullableNum(r["marketCapMin"], base.marketCapMin);
  let marketCapMax = nullableNum(r["marketCapMax"], base.marketCapMax);
  if (marketCapMin !== null && marketCapMax !== null && marketCapMax < marketCapMin) {
    marketCapMax = marketCapMin;
  }
  const ageMinMinutes = nullableNum(r["ageMinMinutes"], base.ageMinMinutes);
  let ageMaxMinutes = nullableNum(r["ageMaxMinutes"], base.ageMaxMinutes);
  if (ageMinMinutes !== null && ageMaxMinutes !== null && ageMaxMinutes < ageMinMinutes) {
    ageMaxMinutes = ageMinMinutes;
  }
  const persistenceRaw = r["persistenceStates"];
  return {
    setup,
    enabled: typeof r["enabled"] === "boolean" ? (r["enabled"] as boolean) : base.enabled,
    marketCapMin: marketCapMin === null ? null : Math.max(0, marketCapMin),
    marketCapMax,
    marketCapEmphasis: base.marketCapEmphasis,
    ageMinMinutes: ageMinMinutes === null ? null : Math.max(0, ageMinMinutes),
    ageMaxMinutes,
    requiresKnownAge:
      typeof r["requiresKnownAge"] === "boolean"
        ? (r["requiresKnownAge"] as boolean)
        : base.requiresKnownAge,
    maxMinutesSinceLastTrade: Math.max(
      MIN,
      num(r["maxMinutesSinceLastTrade"], base.maxMinutesSinceLastTrade),
    ),
    minTurnover24h: nullableNum(r["minTurnover24h"], base.minTurnover24h),
    minVolume24hUsd: nullableNum(r["minVolume24hUsd"], base.minVolume24hUsd),
    activityStates: enumList(r["activityStates"], ACTIVITY_STATE_VALUES, base.activityStates),
    minBaselineAcceleration: nullableNum(
      r["minBaselineAcceleration"],
      base.minBaselineAcceleration,
    ),
    requiresReacceleration: Array.isArray(r["requiresReacceleration"])
      ? (r["requiresReacceleration"] as unknown[]).filter(
          (v): v is ReaccelerationSignal =>
            typeof v === "string" && REACCEL_VALUES.includes(v as ReaccelerationSignal),
        )
      : base.requiresReacceleration,
    persistenceStates:
      persistenceRaw === null
        ? null
        : enumList(persistenceRaw, PERSISTENCE_VALUES, base.persistenceStates ?? PERSISTENCE_VALUES),
    description: typeof r["description"] === "string" ? (r["description"] as string) : base.description,
  };
}

/**
 * Validate and complete a stored/edited strategy. Unknown or invalid fields
 * always fall back to the Wingman Default value; the result is always usable.
 */
export function normalizeStrategySettings(raw: unknown): StrategySettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const setupsRaw = (r["setups"] ?? {}) as Record<string, unknown>;
  const reservationsRaw = (r["reservations"] ?? {}) as Record<string, unknown>;

  const setups = {} as Record<SetupType, SetupFilterConfig>;
  const reservations = {} as Record<SetupType, number>;
  for (const setup of SETUP_TYPES) {
    setups[setup] = normalizeSetup(setup, setupsRaw[setup]);
    const requested = Math.max(
      0,
      Math.round(num(reservationsRaw[setup], WINGMAN_DEFAULT_SETTINGS.reservations[setup])),
    );
    // Disabled setups never hold survivor reservations.
    reservations[setup] = setups[setup].enabled ? requested : 0;
  }

  return {
    name: typeof r["name"] === "string" ? (r["name"] as string) : WINGMAN_DEFAULT_SETTINGS.name,
    configVersion: STRATEGY_CONFIG_VERSION,
    setups,
    reservations,
    survivorLimit: Math.min(
      200,
      Math.max(1, Math.round(num(r["survivorLimit"], WINGMAN_DEFAULT_SETTINGS.survivorLimit))),
    ),
    maxNoneGlobalSurvivors: Math.min(
      200,
      Math.max(
        0,
        Math.round(
          num(r["maxNoneGlobalSurvivors"], WINGMAN_DEFAULT_SETTINGS.maxNoneGlobalSurvivors),
        ),
      ),
    ),
  };
}

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

export interface ScannerRunConfig {
  chain: string;
  calibrationMode: boolean;
  /** How many ranked survivors get DexScreener enrichment + a new snapshot. */
  survivorEnrichmentLimit: number;
  /** Results requested per discovery query. */
  discoveryPageSize: number;
  /** Rejected candidates persisted for calibration. */
  maxPersistedRejections: number;
  /** The editable strategy this run evaluates with. */
  strategy: StrategySettings;
}

export const DEFAULT_RUN_CONFIG: ScannerRunConfig = {
  chain: "solana",
  calibrationMode: true,
  survivorEnrichmentLimit: WINGMAN_DEFAULT_SETTINGS.survivorLimit,
  discoveryPageSize: 50,
  maxPersistedRejections: 400,
  strategy: WINGMAN_DEFAULT_SETTINGS,
};

export function runConfig(overrides: Partial<ScannerRunConfig> = {}): ScannerRunConfig {
  const merged = { ...DEFAULT_RUN_CONFIG, ...overrides };
  if (overrides.survivorEnrichmentLimit === undefined) {
    merged.survivorEnrichmentLimit = merged.strategy.survivorLimit;
  }
  return merged;
}
