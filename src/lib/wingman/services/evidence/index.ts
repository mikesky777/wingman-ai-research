/**
 * Provider-independent evidence layer.
 *
 * Facts only. Derived features, scores and AI interpretation live elsewhere.
 */
export {
  EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_SCHEMA_VERSION_V1_1,
  EVIDENCE_AFFILIATIONS,
  EVIDENCE_ATTRIBUTION_STATUSES,
  EVIDENCE_COLLECTION_HEALTHS,
  EVIDENCE_DOMAINS,
  NON_MEASURING_COLLECTION_HEALTHS,
  OBSERVED_AT_BASES,
  FEATURE_KEY_VERSION_PATTERN,
  isEvidenceDomain,
  isVersionedFeatureKey,
  type EvidenceAffiliation,
  type EvidenceAttributionStatus,
  type EvidenceCollectionHealth,
  type EvidenceSchemaVersion,
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
  birdeyeToEvidence,
  holderDistributionToEvidence,
  holderProfileToEvidence,
  type BirdeyeEnrichment,
} from "./holder-evidence";
export {
  EVIDENCE_RESOLVER_VERSION,
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
