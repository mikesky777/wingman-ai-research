/**
 * Pure candidate evaluation + deduplication.
 *
 * Everything in this module is deterministic and provider-independent, which
 * is what makes the archetype fixtures (GTAmemes-like, Buddy-like, dead old
 * token, vertical chase) meaningful as regression tests.
 */
import { applyHardFilters } from "./hard-filters";
import { evaluateLanes } from "./lanes";
import { computeMetrics, type AgeFallbacks } from "./metrics";
import { quantitativePriority } from "./priority";
import {
  activityState,
  attentionPriceDivergence,
  extensionRisk,
  persistenceSignal,
  reaccelerationSignal,
} from "./signals";
import type {
  DiscoveredToken,
  EvaluatedCandidate,
  HistoricalPoint,
  ScannerSignals,
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
        (merged as Record<string, unknown>)[field] = token[field];
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

  const signals: ScannerSignals = {
    activityState: activityState(token, metrics),
    persistenceSignal: persistenceSignal(token, metrics, history),
    reaccelerationSignal: reaccelerationSignal(metrics, history),
    extensionRisk: extensionRisk(token, metrics, history),
    attentionPriceDivergence: attentionPriceDivergence(token, metrics),
  };

  const rejection = applyHardFilters(token, metrics);
  if (rejection) {
    return {
      token,
      metrics,
      signals,
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
    token,
    metrics,
    signals,
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

/** Survivors chosen for expensive enrichment. Everything else stops here. */
export function selectSurvivors(
  ranked: EvaluatedCandidate[],
  limit: number,
): EvaluatedCandidate[] {
  return ranked.filter((c) => c.passedHardFilters && c.lanes.length > 0).slice(0, limit);
}
