/**
 * Pure candidate evaluation + deduplication.
 *
 * Everything in this module is deterministic and provider-independent, which
 * is what makes the archetype fixtures (GTAmemes-like, Buddy-like, dead old
 * token, vertical chase) meaningful as regression tests.
 */
import {
  SETUP_RESERVATION_ORDER,
  WINGMAN_DEFAULT_SETTINGS,
  type StrategySettings,
} from "./config";
import { applyHardFilters } from "./hard-filters";
import { evaluateSetups } from "./lanes";
import { computeMetrics, type AgeFallbacks } from "./metrics";
import { quantitativePriority } from "./priority";
import {
  activityState,
  attentionPriceDivergence,
  extensionAssessment,
  persistenceSignal,
  reaccelerationSignal,
} from "./signals";
import {
  SETUP_TYPES,
  type DiscoveredToken,
  type EvaluatedCandidate,
  type HistoricalPoint,
  type ScannerSignals,
  type SetupType,
} from "./types";


/**
 * Deduplicate by chain + contract address while preserving every discovery
 * hit. Provenance (source, query family, original rank) is never lost.
 */
export function dedupeDiscovered(tokens: DiscoveredToken[]): DiscoveredToken[] {
  const byKey = new Map<string, DiscoveredToken>();

  for (const token of tokens) {
    const key = `${token.chain}:${token.contractAddress}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...token, discovery: [...token.discovery] });
      continue;
    }
    // Merge: keep the first non-null value for every field, append provenance.
    const merged: DiscoveredToken = { ...existing };
    for (const field of Object.keys(token) as (keyof DiscoveredToken)[]) {
      if (field === "discovery") continue;
      if (merged[field] === null || merged[field] === undefined) {
        (merged as unknown as Record<string, unknown>)[field] = token[field];
      }
    }
    merged.discovery = [...existing.discovery, ...token.discovery];
    byKey.set(key, merged);
  }

  return [...byKey.values()];
}

export interface EvaluateOptions {
  nowIso?: string;
  history?: HistoricalPoint[];
  ageFallbacks?: AgeFallbacks;
}

export function evaluateCandidate(
  token: DiscoveredToken,
  options: EvaluateOptions = {},
): EvaluatedCandidate {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const history = options.history ?? [];
  const metrics = computeMetrics(token, nowIso, options.ageFallbacks ?? {});

  const extension = extensionAssessment(token, metrics, history);
  const signals: ScannerSignals = {
    activityState: activityState(token, metrics),
    persistenceSignal: persistenceSignal(token, metrics, history),
    reaccelerationSignal: reaccelerationSignal(metrics, history),
    extensionRisk: extension.risk,
    attentionPriceDivergence: attentionPriceDivergence(token, metrics),
  };

  // Structural safety and token security are NEVER inferred from market
  // behaviour. They stay unknown/unchecked until a dedicated capability runs.
  const base = {
    token,
    metrics,
    signals,
    extensionReasons: extension.reasons,
    globalRank: null,
    laneRanks: {},
    selectedByLaneReservation: false,
    selectedByGlobalRanking: false,
    structuralSafety: "UNKNOWN" as const,
    tokenSecurity: "NOT_CHECKED" as const,
    historySnapshotCount: history.length,
  };

  const rejection = applyHardFilters(token, metrics);
  if (rejection) {
    return {
      ...base,
      lanes: [],
      laneRejections: {},
      passedHardFilters: false,
      rejection,
      quantitativePriority: null,
      priority: null,
      stageReached: "hard_filters",
      enriched: false,
    };
  }

  const { lanes, rejections } = evaluateLanes(token.marketCap, metrics, signals);
  const priority = quantitativePriority(token, metrics, signals, lanes);

  return {
    ...base,
    lanes,
    laneRejections: rejections,
    passedHardFilters: true,
    rejection:
      lanes.length === 0
        ? {
            reason: "NO_LANE_MATCH",
            detail: "Passed hard filters but matched no lifecycle lane.",
            values: {
              marketCap: token.marketCap,
              ageMinutes: metrics.age.minutes,
              activityState: signals.activityState,
            },
          }
        : null,
    quantitativePriority: priority.total,
    priority,
    stageReached: "quantitative",
    enriched: false,
  };
}

/**
 * Deterministic ordering: priority desc, then contract address so identical
 * scores never shuffle between runs.
 */
export function rankCandidates(candidates: EvaluatedCandidate[]): EvaluatedCandidate[] {
  return [...candidates].sort((a, b) => {
    const diff = (b.quantitativePriority ?? -1) - (a.quantitativePriority ?? -1);
    if (diff !== 0) return diff;
    return a.token.contractAddress.localeCompare(b.token.contractAddress);
  });
}

/**
 * Assign a 1-based global rank across ranked candidates and a 1-based rank
 * inside every lane the candidate qualified for. Mutates in place because the
 * ranks belong to the candidate record that is persisted.
 */
export function assignRanks(ranked: EvaluatedCandidate[]): EvaluatedCandidate[] {
  const eligible = ranked.filter((c) => c.passedHardFilters && c.quantitativePriority !== null);
  eligible.forEach((c, i) => {
    c.globalRank = i + 1;
    c.laneRanks = {};
  });
  for (const lane of DISCOVERY_LANES) {
    let rank = 0;
    for (const c of eligible) {
      if (!c.lanes.includes(lane)) continue;
      rank += 1;
      c.laneRanks[lane] = rank;
    }
  }
  return ranked;
}

export interface SurvivorSelection {
  survivors: EvaluatedCandidate[];
  /** Slots actually consumed per lane reservation. */
  laneUsage: Record<string, number>;
  reservedCount: number;
  globalCount: number;
}

/**
 * Lane-aware survivor selection.
 *
 * Deterministic: lanes are filled in a fixed order from the globally ranked
 * list, a multi-lane token is only ever charged once, and every unused lane
 * slot returns to the global pool which is then filled strictly by priority.
 */
export function selectSurvivorsWithReservations(
  ranked: EvaluatedCandidate[],
  limit: number,
  reservations: Record<DiscoveryLane, number> = LANE_SURVIVOR_RESERVATIONS,
): SurvivorSelection {
  const eligible = ranked.filter((c) => c.passedHardFilters && c.lanes.length > 0);
  const chosen: EvaluatedCandidate[] = [];
  const seen = new Set<string>();
  const laneUsage: Record<string, number> = {};

  for (const lane of LANE_RESERVATION_ORDER) {
    const quota = reservations[lane] ?? 0;
    let used = 0;
    for (const candidate of eligible) {
      if (chosen.length >= limit || used >= quota) break;
      if (!candidate.lanes.includes(lane)) continue;
      if (seen.has(candidate.token.contractAddress)) continue;
      seen.add(candidate.token.contractAddress);
      candidate.selectedByLaneReservation = true;
      candidate.selectedByGlobalRanking = false;
      chosen.push(candidate);
      used += 1;
    }
    laneUsage[lane] = used;
  }

  const reservedCount = chosen.length;

  // Unused reservation capacity flows straight back to the global pool.
  for (const candidate of eligible) {
    if (chosen.length >= limit) break;
    if (seen.has(candidate.token.contractAddress)) continue;
    seen.add(candidate.token.contractAddress);
    candidate.selectedByLaneReservation = false;
    candidate.selectedByGlobalRanking = true;
    chosen.push(candidate);
  }

  return {
    survivors: chosen,
    laneUsage,
    reservedCount,
    globalCount: chosen.length - reservedCount,
  };
}

/** Survivors chosen for expensive enrichment. Everything else stops here. */
export function selectSurvivors(
  ranked: EvaluatedCandidate[],
  limit: number,
): EvaluatedCandidate[] {
  return ranked.filter((c) => c.passedHardFilters && c.lanes.length > 0).slice(0, limit);
}

