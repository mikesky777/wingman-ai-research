/**
 * evidence/v1.1 construction helpers for FUTURE senses (social, wallet,
 * developer, liquidity flow).
 *
 * Nothing in the current production decision path uses this module. It exists
 * so a new collector cannot accidentally break the three invariants that keep
 * evidence honest:
 *
 *   1. Exact mint or nothing — a ticker, name, fuzzy text match, popularity or
 *      a previously-known token can never produce RESOLVED_MINT.
 *   2. Missing != zero != negative — a failed, rate-limited, unconfigured or
 *      unknown collection attempt records `unavailable`, never 0.
 *   3. Collection health describes the COLLECTION, never the token.
 */
import {
  EVIDENCE_SCHEMA_VERSION_V1_1,
  NON_MEASURING_COLLECTION_HEALTHS,
  type EvidenceAffiliation,
  type EvidenceAttributionStatus,
  type EvidenceCollectionHealth,
  type EvidenceDomain,
  type EvidenceObservation,
  type EvidenceSource,
  type EvidenceUnit,
  type EvidenceValue,
} from "./types";

/** Base58 Solana mint. Identity is address-based, never symbol-based. */
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isExactMint(value: unknown): value is string {
  return typeof value === "string" && MINT_PATTERN.test(value);
}

export interface ObservationInput {
  domain: EvidenceDomain;
  key: string;
  value: EvidenceValue;
  unit?: EvidenceUnit;
  source: EvidenceSource;
  sourceReference: string | null;
  observedAt: string | null;
  capturedAt: string;
  affiliation?: EvidenceAffiliation;
  collectionHealth: EvidenceCollectionHealth;
  /** Exact mint, or null when attribution could not be resolved safely. */
  mint: string | null;
  metadata?: Record<string, EvidenceValue>;
  confidence?: number;
}

/**
 * Build an evidence/v1.1 observation with the invariants enforced.
 *
 * A non-exact `mint` (ticker, name, empty string, fuzzy guess) degrades the
 * observation to UNRESOLVED_TOKEN_ATTRIBUTION rather than inventing a linkage.
 * A value supplied under a non-measuring collection health is discarded and
 * recorded as unavailable, so a collection failure can never become a 0.
 */
export function buildObservation(input: ObservationInput): EvidenceObservation {
  const attributionStatus: EvidenceAttributionStatus = isExactMint(input.mint)
    ? "RESOLVED_MINT"
    : "UNRESOLVED_TOKEN_ATTRIBUTION";

  const measuring = !(
    NON_MEASURING_COLLECTION_HEALTHS as readonly EvidenceCollectionHealth[]
  ).includes(input.collectionHealth);

  // A real measured zero stays zero; anything from a non-measuring attempt is null.
  const value = measuring ? input.value : null;

  const observation: EvidenceObservation = {
    domain: input.domain,
    key: input.key,
    value,
    source: input.source,
    sourceReference: input.sourceReference,
    observedAt: input.observedAt,
    capturedAt: input.capturedAt,
    status: value === null ? "unavailable" : "observed",
    attributionStatus,
    collectionHealth: input.collectionHealth,
    schemaVersion: EVIDENCE_SCHEMA_VERSION_V1_1,
  };
  if (input.unit) observation.unit = input.unit;
  if (input.affiliation) observation.affiliation = input.affiliation;
  if (input.metadata) observation.metadata = input.metadata;
  if (input.confidence !== undefined) observation.confidence = input.confidence;
  return observation;
}

/** Resolved token id for persistence, or null for an unresolved observation. */
export function resolvedTokenIdFor(
  observation: EvidenceObservation,
  tokenId: string | null | undefined,
): string | null {
  const status = observation.attributionStatus ?? "RESOLVED_MINT";
  if (status === "UNRESOLVED_TOKEN_ATTRIBUTION") return null;
  if (!tokenId) {
    throw new Error(
      `RESOLVED_MINT observation "${observation.key}" requires an exact token linkage`,
    );
  }
  return tokenId;
}
