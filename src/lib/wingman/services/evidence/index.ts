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
  type EvidenceStatus,
  type EvidenceUnit,
  type EvidenceValue,
} from "./types";
export { snapshotToEvidence } from "./market-evidence";
