/**
 * Resolved evidence model.
 *
 * A ResolvedEvidence is still a FACT, not an interpretation: it is the answer
 * to "what do our sources currently say about this key, and how much do they
 * agree?". It never scores, ranks or judges. Contributing observations are
 * always preserved — resolution never mutates or deletes them.
 */
import type {
  EvidenceDomain,
  EvidenceObservation,
  EvidenceSource,
  EvidenceStatus,
  EvidenceUnit,
  EvidenceValue,
} from "./types";

export const RESOLVED_EVIDENCE_SCHEMA_VERSION = "resolved-evidence/v1";

/**
 * Behaviour version of the resolver itself. Research reports will record this
 * so a past conclusion can be replayed against the rules that produced it.
 */
export const EVIDENCE_RESOLVER_VERSION = "evidence-resolver/v1";

/**
 *  confirmed     — 2+ independent sources agree within tolerance.
 *  single_source — exactly one source supplied the fact.
 *  conflicting   — sources materially disagree; the disagreement is evidence.
 *  stale         — best observation is older than the domain freshness window.
 *  unavailable   — no source supplied a value (value is null, never zero).
 */
export type ResolutionStatus =
  | "confirmed"
  | "single_source"
  | "conflicting"
  | "stale"
  | "unavailable";

export interface ConflictingValue {
  source: EvidenceSource;
  sourceReference: string | null;
  value: EvidenceValue;
  observedAt: string | null;
}

export interface ResolvedEvidence {
  domain: EvidenceDomain;
  key: string;
  value: EvidenceValue;
  unit?: EvidenceUnit;
  status: EvidenceStatus;
  resolvedAt: string;
  primarySource: EvidenceSource | null;
  primarySourceReference: string | null;
  observedAt: string | null;
  /** Provider-supplied confidence only. Null when nobody expressed one. */
  confidence: number | null;
  resolutionStatus: ResolutionStatus;
  /** Every contributing observation, including unavailable ones. */
  observations: EvidenceObservation[];
  /** Present only when resolutionStatus is "conflicting". */
  conflictingValues?: ConflictingValue[];
  metadata?: Record<string, EvidenceValue>;
  schemaVersion: typeof RESOLVED_EVIDENCE_SCHEMA_VERSION;
}

export interface EvidenceCounts {
  totalObserved: number;
  totalUnavailable: number;
  resolvedConfirmed: number;
  resolvedSingleSource: number;
  resolvedConflicting: number;
  resolvedStale: number;
  resolvedUnavailable: number;
}

/**
 * Availability per domain. `false` means "we have no evidence yet" — it is
 * uncertainty, NEVER negative/bearish evidence.
 */
export type EvidenceAvailability = Record<EvidenceDomain, boolean>;

export interface EvidenceBundle {
  observations: EvidenceObservation[];
  resolved: ResolvedEvidence[];
  counts: EvidenceCounts;
  availability: EvidenceAvailability;
}
