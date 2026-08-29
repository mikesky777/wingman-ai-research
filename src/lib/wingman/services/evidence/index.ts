/**
 * Provider-independent evidence layer.
 *
 * Facts only. Derived features, scores and AI interpretation live elsewhere.
 */
export {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceDomain,
  type EvidenceObservation,
  type EvidenceSource,
  type KnownEvidenceSource,
  type ObservedAtBasis,
  type EvidenceStatus,
  type EvidenceUnit,
  type EvidenceValue,
} from "./types";
export { snapshotToEvidence } from "./market-evidence";
export {
  RESOLVED_EVIDENCE_SCHEMA_VERSION,
  type ConflictingValue,
  type EvidenceAvailability,
  type EvidenceBundle,
  type EvidenceCounts,
  type ResolutionStatus,
  type ResolvedEvidence,
} from "./resolved-types";
export {
  buildEvidenceBundle,
  evidenceCompleteness,
  lookupResolved,
  resolveEvidence,
  type EvidenceCompleteness,
  type ResolveOptions,
} from "./resolver";
export {
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
