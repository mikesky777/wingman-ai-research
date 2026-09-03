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
import { marketRejection, type MarketResolution } from "./market-eligibility";
import { computeMetrics, type AgeFallbacks } from "./metrics";
import { quantitativePriority } from "./priority";
import {
  activityState,
  attentionPriceDivergence,
  extensionAssessment,
  persistenceSignal,
  reaccelerationSignal,
} from "./signals";
import { isStructurallyEligible } from "./structural";

import {
  SETUP_TYPES,
  type DiscoveredToken,
  type EvaluatedCandidate,
  type HistoricalPoint,
  type ScannerSignals,
  type SetupType,
} from "./types";
import {
  OUT_OF_SCOPE_REASON,
  UNKNOWN_ASSESSMENT,
  type UniverseAssessment,
} from "./universe";


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
  /** Editable setup filters this run evaluates with. */
  strategy?: StrategySettings;
  /**
   * Universal live-market gate. When `requireMarket` is true the candidate
   * must have a resolved, usable Solana DEX market before any setup
   * classification happens. Missing data is a rejection, never a zero.
   */
  requireMarket?: boolean;
  market?: MarketResolution | null;
  /**
   * Mandate eligibility, resolved AFTER identity and market resolution.
   * OUT_OF_SCOPE excludes the candidate from setup qualification and survivor
   * selection. UNKNOWN stays fully eligible.
   */
  universe?: UniverseAssessment | null;
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
    universe: options.universe ?? UNKNOWN_ASSESSMENT,
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

  if (options.requireMarket && !options.market?.ok) {
    return {
      ...base,
      lanes: [],
      laneRejections: {},
      passedHardFilters: false,
      rejection: marketRejection(token.contractAddress, options.market ?? null),
      quantitativePriority: null,
      priority: null,
      stageReached: "hard_filters",
      enriched: false,
    };
  }

  // Mandate gate: runs AFTER identity + market resolution and BEFORE setup
  // qualification. Quantitative metrics stay computed and persisted so the
  // exclusion is fully inspectable; the candidate simply never qualifies for a
  // setup or a survivor slot. Never affects priority weights.
  const universe = options.universe ?? UNKNOWN_ASSESSMENT;
  if (universe.eligibility === "OUT_OF_SCOPE") {
    return {
      ...base,
      lanes: [],
      laneRejections: {},
      passedHardFilters: false,
      rejection: {
        reason: OUT_OF_SCOPE_REASON,
        detail: universe.reason,
        values: {
          contractAddress: token.contractAddress,
          category: universe.category,
          evidence: universe.evidence,
        },
      },
      quantitativePriority: null,
      priority: null,
      stageReached: "hard_filters",
      enriched: false,
    };
  }

  const strategy = options.strategy ?? WINGMAN_DEFAULT_SETTINGS;
  const { lanes, rejections } = evaluateSetups(token.marketCap, metrics, signals, strategy);
  const priority = quantitativePriority(token, metrics, signals, lanes);

  // Matching no setup is NOT a rejection. The candidate is NONE: still ranked,
  // still eligible for the global survivor pool.
  return {
    ...base,
    lanes,
    laneRejections: rejections,
    passedHardFilters: true,
    rejection: null,
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
  for (const setup of SETUP_TYPES) {
    let rank = 0;
    for (const c of eligible) {
      if (!c.lanes.includes(setup)) continue;
      rank += 1;
      c.laneRanks[setup] = rank;
    }
  }
  return ranked;
}

export interface SurvivorSelection {
  survivors: EvaluatedCandidate[];
  /** Slots actually consumed per setup reservation. */
  laneUsage: Record<string, number>;
  reservedCount: number;
  globalCount: number;
  /** Ranked candidates removed by the structural FAIL veto before allocation. */
  structurallyVetoed: EvaluatedCandidate[];
}


/**
 * Setup-aware survivor selection.
 *
 * Deterministic: setups are filled in a fixed order from the globally ranked
 * list, a multi-setup token is only ever charged once, and every unused setup
 * slot returns to the global pool which is then filled strictly by priority.
 * NONE candidates are excluded from reservations but compete in that pool.
 *
 * Structural Eligibility acts as a pure VETO applied before any allocation: a
 * FAIL candidate consumes no reserved and no global capacity, and the freed
 * slot goes to the next otherwise-eligible ranked candidate. PASS, CONCERN and
 * UNKNOWN are untouched. Ranking, priority and setups are computed upstream and
 * are never modified here.
 */
export function selectSurvivorsWithReservations(
  ranked: EvaluatedCandidate[],
  limit: number,
  reservations: Record<SetupType, number> = WINGMAN_DEFAULT_SETTINGS.reservations,
  strategy: StrategySettings = WINGMAN_DEFAULT_SETTINGS,
  options: { structuralVeto?: boolean } = {},
): SurvivorSelection {
  const vetoOn = options.structuralVeto ?? true;
  // Selection is re-runnable (diagnostics compare vetoed vs unvetoed), so
  // membership flags always start from a clean slate.
  for (const candidate of ranked) {
    candidate.selectedByLaneReservation = false;
    candidate.selectedByGlobalRanking = false;
  }
  const qualified = ranked.filter((c) => c.passedHardFilters && c.quantitativePriority !== null);
  const vetoed = vetoOn
    ? qualified.filter((c) => !isStructurallyEligible(c.structural?.status ?? null))
    : [];
  const eligible = vetoOn
    ? qualified.filter((c) => isStructurallyEligible(c.structural?.status ?? null))
    : qualified;
  const chosen: EvaluatedCandidate[] = [];
  const seen = new Set<string>();
  const laneUsage: Record<string, number> = {};


  for (const setup of SETUP_RESERVATION_ORDER) {
    // A disabled setup never holds reserved capacity.
    const enabled = strategy.setups[setup]?.enabled !== false;
    const quota = enabled ? (reservations[setup] ?? 0) : 0;
    let used = 0;
    for (const candidate of eligible) {
      if (chosen.length >= limit || used >= quota) break;
      if (!candidate.lanes.includes(setup)) continue;
      if (seen.has(candidate.token.contractAddress)) continue;
      seen.add(candidate.token.contractAddress);
      candidate.selectedByLaneReservation = true;
      candidate.selectedByGlobalRanking = false;
      chosen.push(candidate);
      used += 1;
    }
    laneUsage[setup] = used;
  }

  const reservedCount = chosen.length;

  // Unused reservation capacity flows straight back to the global pool, which
  // includes hard-filter-passing candidates with no recognized setup (NONE).
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
    structurallyVetoed: vetoed,
  };

}

/** Survivors chosen for expensive enrichment. Everything else stops here. */
export function selectSurvivors(
  ranked: EvaluatedCandidate[],
  limit: number,
): EvaluatedCandidate[] {
  return ranked
    .filter((c) => c.passedHardFilters && c.quantitativePriority !== null)
    .slice(0, limit);
}

