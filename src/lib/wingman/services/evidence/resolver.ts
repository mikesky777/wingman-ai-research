/**
 * Deterministic evidence resolver.
 *
 * Provider Response → Normalized Provider Data → EvidenceObservation[] →
 * resolveEvidence() → ResolvedEvidence[] → (future) scoring / AI research.
 *
 * Rules that must not be relaxed:
 *   - Observations are never mutated or dropped; resolution is pure.
 *   - Unavailable never overrides an observed value; null stays distinct from 0.
 *   - Materially different values are never averaged — disagreement is evidence.
 *   - Distinct keys are never resolved against each other (market_cap vs fdv,
 *     raw vs clustered holder concentration, …). Semantic identity first.
 *   - Same input → same output, regardless of input ordering.
 */
import type { EvidenceDomain, EvidenceObservation, EvidenceSource } from "./types";
import {
  DEFAULT_FRESHNESS,
  DEFAULT_PROVIDER_PREFERENCE,
  DEFAULT_TOLERANCES,
  preferenceFor,
  toleranceFor,
  type FreshnessConfig,
  type NumericTolerance,
  type ProviderPreferenceConfig,
  type ToleranceConfig,
} from "./resolution-config";
import {
  RESOLVED_EVIDENCE_SCHEMA_VERSION,
  type ConflictingValue,
  type EvidenceAvailability,
  type EvidenceBundle,
  type EvidenceCounts,
  type ResolvedEvidence,
} from "./resolved-types";

export interface ResolveOptions {
  /** Reference time for freshness. Defaults to now. Pass for determinism. */
  now?: string;
  tolerances?: ToleranceConfig;
  freshness?: Partial<FreshnessConfig>;
  providerPreference?: ProviderPreferenceConfig;
}

const ALL_DOMAINS: EvidenceDomain[] = ["market", "provenance", "holders", "creator", "social"];

function valuesAgree(a: unknown, b: unknown, tolerance: NumericTolerance): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return true;
    const diff = Math.abs(a - b);
    if (tolerance.absolute !== undefined && diff <= tolerance.absolute) return true;
    if (tolerance.relative !== undefined) {
      const scale = Math.max(Math.abs(a), Math.abs(b));
      if (scale === 0) return diff === 0;
      return diff / scale <= tolerance.relative;
    }
    return false;
  }
  return a === b;
}

function timeOf(observation: EvidenceObservation): string | null {
  return observation.observedAt ?? observation.capturedAt ?? null;
}

/** Total, deterministic ordering of candidate observations for a single key. */
function rank(
  observation: EvidenceObservation,
  preference: EvidenceSource[],
): [number, number, string, string] {
  const prefIndex = preference.indexOf(observation.source);
  const time = timeOf(observation);
  return [
    prefIndex === -1 ? preference.length : prefIndex,
    time ? -new Date(time).getTime() : Number.POSITIVE_INFINITY,
    String(observation.source),
    observation.sourceReference ?? "",
  ];
}

function compareRank(a: [number, number, string, string], b: [number, number, string, string]) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
  if (a[3] !== b[3]) return a[3] < b[3] ? -1 : 1;
  return 0;
}

function isStale(
  observedAt: string | null,
  domain: EvidenceDomain,
  now: number,
  freshness: FreshnessConfig,
): boolean {
  if (!observedAt) return false;
  const t = new Date(observedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > freshness[domain];
}

function resolveGroup(
  domain: EvidenceDomain,
  key: string,
  group: EvidenceObservation[],
  options: Required<Pick<ResolveOptions, "tolerances" | "providerPreference">> & {
    nowIso: string;
    nowMs: number;
    freshness: FreshnessConfig;
  },
): ResolvedEvidence {
  const preference = preferenceFor(domain, key, options.providerPreference);
  const tolerance = toleranceFor(domain, key, options.tolerances);

  // Stable input ordering so resolution is order-independent.
  const ordered = [...group].sort((a, b) =>
    compareRank(rank(a, preference), rank(b, preference)),
  );
  const available = ordered.filter((o) => o.status === "observed" && o.value !== null);

  const unit = ordered.find((o) => o.unit)?.unit;
  const base = {
    domain,
    key,
    ...(unit ? { unit } : {}),
    resolvedAt: options.nowIso,
    observations: ordered,
    schemaVersion: RESOLVED_EVIDENCE_SCHEMA_VERSION,
  } as const;

  if (available.length === 0) {
    // No source supplied a value. Unavailable, never zero, never bearish.
    return {
      ...base,
      value: null,
      status: "unavailable",
      primarySource: ordered[0]?.source ?? null,
      primarySourceReference: ordered[0]?.sourceReference ?? null,
      observedAt: ordered[0] ? timeOf(ordered[0]) : null,
      confidence: null,
      resolutionStatus: "unavailable",
    };
  }

  const primary = available[0]!;
  const distinctSources = new Set(available.map((o) => o.source));
  const disagreeing = available.filter((o) => !valuesAgree(o.value, primary.value, tolerance));

  let resolutionStatus: ResolvedEvidence["resolutionStatus"];
  if (disagreeing.length > 0) {
    resolutionStatus = "conflicting";
  } else if (distinctSources.size > 1) {
    resolutionStatus = "confirmed";
  } else {
    resolutionStatus = "single_source";
  }

  const stale = isStale(timeOf(primary), domain, options.nowMs, options.freshness);
  // Conflict is the more informative signal, so it survives staleness; the
  // stale flag is still exposed through metadata. Value is always preserved.
  if (stale && resolutionStatus !== "conflicting") resolutionStatus = "stale";

  const resolved: ResolvedEvidence = {
    ...base,
    value: primary.value,
    status: "observed",
    primarySource: primary.source,
    primarySourceReference: primary.sourceReference,
    observedAt: timeOf(primary),
    // v1: only provider-supplied confidence. No invented precision.
    confidence: primary.confidence ?? null,
    resolutionStatus,
    metadata: {
      sourceCount: distinctSources.size,
      stale,
      agreementBasis: resolutionStatus === "single_source" ? "none" : "tolerance",
    },
  };

  if (disagreeing.length > 0) {
    const conflicting: ConflictingValue[] = available.map((o) => ({
      source: o.source,
      sourceReference: o.sourceReference,
      value: o.value,
      observedAt: timeOf(o),
    }));
    return { ...resolved, conflictingValues: conflicting };
  }
  return resolved;
}

/**
 * Group semantically equivalent observations by `domain + key` and resolve one
 * ResolvedEvidence per fact. Deterministic: identical input (in any order)
 * yields identical output.
 */
export function resolveEvidence(
  observations: EvidenceObservation[],
  options: ResolveOptions = {},
): ResolvedEvidence[] {
  const nowIso = options.now ?? new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const config = {
    tolerances: options.tolerances ?? DEFAULT_TOLERANCES,
    providerPreference: options.providerPreference ?? DEFAULT_PROVIDER_PREFERENCE,
    freshness: { ...DEFAULT_FRESHNESS, ...(options.freshness ?? {}) },
    nowIso,
    nowMs,
  };

  const groups = new Map<string, EvidenceObservation[]>();
  for (const observation of observations) {
    const id = `${observation.domain}\u0000${observation.key}`;
    const bucket = groups.get(id);
    if (bucket) bucket.push(observation);
    else groups.set(id, [observation]);
  }

  return [...groups.keys()]
    .sort()
    .map((id) => {
      const [domain, key] = id.split("\u0000") as [EvidenceDomain, string];
      return resolveGroup(domain, key, groups.get(id)!, config);
    });
}

/**
 * Lookup helper. Returns an explicit `unavailable` ResolvedEvidence when the
 * fact was never observed — the only place a fact is materialized from nothing,
 * and it never invents a value.
 */
export function lookupResolved(
  resolved: ResolvedEvidence[],
  domain: EvidenceDomain,
  key: string,
  options: { now?: string } = {},
): ResolvedEvidence {
  const found = resolved.find((r) => r.domain === domain && r.key === key);
  if (found) return found;
  return {
    domain,
    key,
    value: null,
    status: "unavailable",
    resolvedAt: options.now ?? new Date().toISOString(),
    primarySource: null,
    primarySourceReference: null,
    observedAt: null,
    confidence: null,
    resolutionStatus: "unavailable",
    observations: [],
    schemaVersion: RESOLVED_EVIDENCE_SCHEMA_VERSION,
  };
}

/** Observations + resolved facts + descriptive counts. No scoring. */
export function buildEvidenceBundle(
  observations: EvidenceObservation[],
  options: ResolveOptions = {},
): EvidenceBundle {
  const resolved = resolveEvidence(observations, options);
  const counts: EvidenceCounts = {
    totalObserved: observations.filter((o) => o.status === "observed").length,
    totalUnavailable: observations.filter((o) => o.status === "unavailable").length,
    resolvedConfirmed: resolved.filter((r) => r.resolutionStatus === "confirmed").length,
    resolvedSingleSource: resolved.filter((r) => r.resolutionStatus === "single_source").length,
    resolvedConflicting: resolved.filter((r) => r.resolutionStatus === "conflicting").length,
    resolvedStale: resolved.filter((r) => r.resolutionStatus === "stale").length,
    resolvedUnavailable: resolved.filter((r) => r.resolutionStatus === "unavailable").length,
  };

  const availability = Object.fromEntries(
    ALL_DOMAINS.map((domain) => [
      domain,
      resolved.some((r) => r.domain === domain && r.status === "observed"),
    ]),
  ) as EvidenceAvailability;

  return { observations, resolved, counts, availability };
}

export interface EvidenceCompleteness {
  domain: EvidenceDomain;
  available: boolean;
  observedFactCount: number;
  /** Missing evidence is uncertainty — explicitly NOT negative evidence. */
  note: "available" | "unavailable";
}

/** Plain availability report. Never interprets missing domains as bearish. */
export function evidenceCompleteness(bundle: EvidenceBundle): EvidenceCompleteness[] {
  return ALL_DOMAINS.map((domain) => {
    const observedFactCount = bundle.resolved.filter(
      (r) => r.domain === domain && r.status === "observed",
    ).length;
    return {
      domain,
      available: observedFactCount > 0,
      observedFactCount,
      note: observedFactCount > 0 ? "available" : "unavailable",
    };
  });
}
