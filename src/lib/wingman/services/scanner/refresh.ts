/**
 * Evidence refresh urgency (pure, deterministic).
 *
 * Recurrence answers "have we seen this token before?". Refresh answers a
 * different question: "does this candidate need fresh evidence THIS scan?".
 *
 * Hard rules:
 *   - A REPEAT candidate is never penalized: it keeps its priority, its setup
 *     classification, its survivor eligibility and its persisted history.
 *     Only the decision to spend provider calls changes.
 *   - Carried-forward evidence is reused as-is. Nothing is rewritten, nothing
 *     is duplicated to look fresher than it is.
 */
import type { RecurrenceState } from "./recurrence";

export type RefreshState = "REFRESH_REQUIRED" | "REFRESH_OPTIONAL" | "CARRY_FORWARD";

export interface RefreshConfig {
  /** Evidence older than this always forces a fresh enrichment. */
  maxEvidenceAgeMinutes: number;
  /** Evidence older than this is "approaching stale" → REFRESH_OPTIONAL. */
  optionalEvidenceAgeMinutes: number;
}

export const REFRESH_CONFIG: RefreshConfig = {
  maxEvidenceAgeMinutes: 90,
  optionalEvidenceAgeMinutes: 45,
};

export interface RefreshInput {
  recurrenceState: RecurrenceState;
  /** Capture time of the most recent enrichment/evidence, if any. */
  lastEnrichedAt: string | null;
  /** Evaluation time of the current scan. */
  nowIso: string;
  config?: RefreshConfig;
}

export interface RefreshDecision {
  state: RefreshState;
  /** Age of the reusable evidence in minutes. `null` = no prior evidence. */
  evidenceAgeMinutes: number | null;
  lastEnrichedAt: string | null;
  /** True only when the scan reuses existing evidence instead of refetching. */
  carriedForward: boolean;
  reason: string;
}

/** Deterministic: same inputs always yield the same decision. */
export function deriveRefreshState(input: RefreshInput): RefreshDecision {
  const config = input.config ?? REFRESH_CONFIG;
  const ageMinutes = evidenceAgeMinutes(input.lastEnrichedAt, input.nowIso);

  const base = {
    evidenceAgeMinutes: ageMinutes,
    lastEnrichedAt: input.lastEnrichedAt,
  };

  if (input.recurrenceState !== "REPEAT") {
    return {
      ...base,
      state: "REFRESH_REQUIRED",
      carriedForward: false,
      reason: `${input.recurrenceState} candidate`,
    };
  }
  if (ageMinutes === null) {
    return {
      ...base,
      state: "REFRESH_REQUIRED",
      carriedForward: false,
      reason: "No prior enrichment on record",
    };
  }
  if (ageMinutes >= config.maxEvidenceAgeMinutes) {
    return {
      ...base,
      state: "REFRESH_REQUIRED",
      carriedForward: false,
      reason: `Evidence ${Math.round(ageMinutes)}m old exceeds ${config.maxEvidenceAgeMinutes}m limit`,
    };
  }
  if (ageMinutes >= config.optionalEvidenceAgeMinutes) {
    return {
      ...base,
      state: "REFRESH_OPTIONAL",
      carriedForward: false,
      reason: `Evidence ${Math.round(ageMinutes)}m old is approaching the freshness limit`,
    };
  }
  return {
    ...base,
    state: "CARRY_FORWARD",
    carriedForward: true,
    reason: `Unchanged repeat with ${Math.round(ageMinutes)}m old evidence`,
  };
}

/** Minutes between the last evidence capture and now. Never negative-clamped. */
export function evidenceAgeMinutes(lastEnrichedAt: string | null, nowIso: string): number | null {
  if (!lastEnrichedAt) return null;
  const then = Date.parse(lastEnrichedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return (now - then) / 60000;
}

/* ------------------------------------------------------------------ */
/* Per-domain refresh                                                    */
/* ------------------------------------------------------------------ */

/**
 * Evidence domains are refreshed INDEPENDENTLY. A stale market observation
 * never invalidates still-valid holder, creator or provenance evidence.
 */
export type EvidenceRefreshDomain =
  | "market"
  | "participation"
  | "holders"
  | "creator"
  | "provenance";

export const EVIDENCE_REFRESH_DOMAINS: EvidenceRefreshDomain[] = [
  "market",
  "participation",
  "holders",
  "creator",
  "provenance",
];

/** A domain with no stored evidence is NO_EVIDENCE — never CARRY_FORWARD. */
export type DomainRefreshState = RefreshState | "NO_EVIDENCE";

export type RefreshReasonCode =
  | "STALE_EVIDENCE"
  | "NO_PRIOR_EVIDENCE"
  | "RECURRENCE_REQUIRES_REFRESH"
  | "WITHIN_FRESHNESS_WINDOW"
  | "APPROACHING_EXPIRY"
  | "NOT_COLLECTED_YET";

export interface DomainRefreshConfig {
  /** Evidence older than this is stale. */
  maxAgeMinutes: number;
  /** Evidence older than this is approaching staleness. */
  optionalAgeMinutes: number;
  /**
   * Whether a NEW / CHANGED / RETURNING recurrence state is relevant to this
   * domain. Recurrence is market-behaviour derived, so it forces only the
   * market domain — it must never invalidate fresh holder/creator evidence.
   */
  recurrenceDriven: boolean;
  /** Whether the scan pipeline can actually refresh this domain today. */
  enrichmentSupported: boolean;
  /**
   * Whether this domain contributes to the candidate-level rollup that governs
   * market enrichment spend. Domains refreshed through their own dedicated
   * path (participation) are excluded so they never force a market refetch.
   */
  affectsCandidateState?: boolean;
}

/**
 * Centralized freshness windows. Market preserves the existing 45/90 minute
 * scanner semantics; the other domains follow the evidence-resolution
 * freshness config (holders 6h, creator 7d, provenance 30d).
 */
export const DOMAIN_REFRESH_CONFIG: Record<EvidenceRefreshDomain, DomainRefreshConfig> = {
  market: {
    maxAgeMinutes: REFRESH_CONFIG.maxEvidenceAgeMinutes,
    optionalAgeMinutes: REFRESH_CONFIG.optionalEvidenceAgeMinutes,
    recurrenceDriven: true,
    enrichmentSupported: true,
    affectsCandidateState: true,
  },
  // Participation is current-activity evidence, so it ages like market data,
  // but it is decided INDEPENDENTLY: stale market evidence never invalidates
  // still-fresh participation evidence and vice versa.
  participation: {
    maxAgeMinutes: 45,
    optionalAgeMinutes: 25,
    recurrenceDriven: true,
    enrichmentSupported: true,
    affectsCandidateState: false,
  },
  holders: {
    maxAgeMinutes: 6 * 60,
    optionalAgeMinutes: 3 * 60,
    recurrenceDriven: false,
    enrichmentSupported: false,
  },
  creator: {
    maxAgeMinutes: 7 * 24 * 60,
    optionalAgeMinutes: 3.5 * 24 * 60,
    recurrenceDriven: false,
    enrichmentSupported: false,
  },
  provenance: {
    maxAgeMinutes: 30 * 24 * 60,
    optionalAgeMinutes: 15 * 24 * 60,
    recurrenceDriven: false,
    enrichmentSupported: false,
  },
};

export interface DomainRefreshDecision {
  domain: EvidenceRefreshDomain;
  state: DomainRefreshState;
  /** Age of the stored evidence in minutes. `null` = nothing stored. */
  evidenceAgeMinutes: number | null;
  lastObservedAt: string | null;
  ttlMinutes: number;
  reasonCode: RefreshReasonCode;
  reason: string;
  /** True only when still-valid stored evidence is reused as-is. */
  carriedForward: boolean;
  /** Whether the scan pipeline can refresh this domain at all today. */
  enrichmentSupported: boolean;
}

export interface RefreshPlan {
  /** Most urgent applicable domain state; kept for the compact UI. */
  state: RefreshState;
  domains: Record<EvidenceRefreshDomain, DomainRefreshDecision>;
  /** Market-domain age, preserved for existing columns and displays. */
  evidenceAgeMinutes: number | null;
  lastEnrichedAt: string | null;
  /** True when the pipeline reuses market evidence instead of refetching. */
  carriedForward: boolean;
  reason: string;
  reasonCode: RefreshReasonCode;
}

export interface RefreshPlanInput {
  recurrenceState: RecurrenceState;
  nowIso: string;
  /** Newest stored observation per domain. Missing / null = no evidence. */
  lastObservedAt: Partial<Record<EvidenceRefreshDomain, string | null>>;
  config?: Record<EvidenceRefreshDomain, DomainRefreshConfig>;
}

function domainDecision(
  domain: EvidenceRefreshDomain,
  config: DomainRefreshConfig,
  lastObservedAt: string | null,
  nowIso: string,
  recurrenceState: RecurrenceState,
): DomainRefreshDecision {
  const ageMinutes = evidenceAgeMinutes(lastObservedAt, nowIso);
  const base = {
    domain,
    evidenceAgeMinutes: ageMinutes,
    lastObservedAt,
    ttlMinutes: config.maxAgeMinutes,
    enrichmentSupported: config.enrichmentSupported,
    carriedForward: false,
  };

  if (ageMinutes === null) {
    return config.enrichmentSupported
      ? {
          ...base,
          state: "REFRESH_REQUIRED",
          reasonCode: "NO_PRIOR_EVIDENCE",
          reason: "No prior evidence on record",
        }
      : {
          ...base,
          state: "NO_EVIDENCE",
          reasonCode: "NOT_COLLECTED_YET",
          reason: "No evidence collected for this domain yet",
        };
  }

  if (config.recurrenceDriven && recurrenceState !== "REPEAT") {
    return {
      ...base,
      state: "REFRESH_REQUIRED",
      reasonCode: "RECURRENCE_REQUIRES_REFRESH",
      reason: `${recurrenceState} candidate`,
    };
  }

  if (ageMinutes >= config.maxAgeMinutes) {
    return {
      ...base,
      state: "REFRESH_REQUIRED",
      reasonCode: "STALE_EVIDENCE",
      reason: `Evidence ${Math.round(ageMinutes)}m old exceeds the ${config.maxAgeMinutes}m limit`,
    };
  }

  if (ageMinutes >= config.optionalAgeMinutes) {
    return {
      ...base,
      state: "REFRESH_OPTIONAL",
      reasonCode: "APPROACHING_EXPIRY",
      reason: `Evidence ${Math.round(ageMinutes)}m old is approaching the freshness limit`,
    };
  }

  return {
    ...base,
    state: "CARRY_FORWARD",
    carriedForward: true,
    reasonCode: "WITHIN_FRESHNESS_WINDOW",
    reason: `Evidence ${Math.round(ageMinutes)}m old is still within the freshness window`,
  };
}

const URGENCY: Record<DomainRefreshState, number> = {
  REFRESH_REQUIRED: 3,
  REFRESH_OPTIONAL: 2,
  CARRY_FORWARD: 1,
  NO_EVIDENCE: 0,
};

/**
 * Deterministic per-domain plan. Same inputs always produce the same result;
 * no clock reads, no provider calls, no writes.
 */
export function deriveRefreshPlan(input: RefreshPlanInput): RefreshPlan {
  const config = input.config ?? DOMAIN_REFRESH_CONFIG;
  const domains = {} as Record<EvidenceRefreshDomain, DomainRefreshDecision>;

  for (const domain of EVIDENCE_REFRESH_DOMAINS) {
    domains[domain] = domainDecision(
      domain,
      config[domain],
      input.lastObservedAt[domain] ?? null,
      input.nowIso,
      input.recurrenceState,
    );
  }

  // Candidate-level state: the most urgent APPLICABLE domain. NO_EVIDENCE on a
  // domain the pipeline cannot collect is not an urgency signal.
  const applicable = EVIDENCE_REFRESH_DOMAINS.filter(
    (d) => config[d].affectsCandidateState !== false,
  )
    .map((d) => domains[d])
    .filter(
    (d) => d.state !== "NO_EVIDENCE",
  );
  const most = applicable.reduce<DomainRefreshDecision | null>(
    (best, current) =>
      best === null || URGENCY[current.state] > URGENCY[best.state] ? current : best,
    null,
  );

  const market = domains.market;
  const state = (most?.state ?? "CARRY_FORWARD") as RefreshState;

  return {
    state,
    domains,
    evidenceAgeMinutes: market.evidenceAgeMinutes,
    lastEnrichedAt: market.lastObservedAt,
    carriedForward: market.carriedForward,
    reason: most?.reason ?? market.reason,
    reasonCode: most?.reasonCode ?? market.reasonCode,
  };
}

export interface RefreshDiagnostics {
  newCount: number;
  changedCount: number;
  returningCount: number;
  repeatCount: number;
  refreshRequired: number;
  refreshOptional: number;
  carryForward: number;
  freshEnrichments: number;
  carriedForwardSurvivors: number;
  /** Provider enrichment rounds skipped because evidence was still valid. */
  enrichmentRequestsAvoided: number;
  /** Candidates whose plan requires or suggests a refresh in any domain. */
  candidatesRequiringRefresh: number;
  /** Candidates reusing still-valid evidence in at least one domain. */
  candidatesUsingCarriedEvidence: number;
  /** Refresh-due counts per evidence domain. */
  domainRefreshes: Record<EvidenceRefreshDomain, number>;
  /** Domains carried forward — NOT the same thing as an avoided call. */
  domainsCarriedForward: Record<EvidenceRefreshDomain, number>;
  /** External provider requests the run actually executed. */
  providerRequestsExecuted: number;
  /**
   * Requests actually avoided: only domains the pipeline WOULD have called.
   * A carried holder domain is not counted, because no holder call exists.
   */
  providerRequestsAvoided: number;
}
