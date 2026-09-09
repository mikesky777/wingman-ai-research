/**
 * Provider-independent evidence model.
 *
 * An EvidenceObservation is a FACT observed about a token at a point in time.
 * It is deliberately NOT an interpretation, derived feature, quality judgement
 * or score. "Liquidity = $72,000" belongs here; "liquidity is healthy" does not.
 *
 * Rules:
 *   - `value === null` means the fact is genuinely unavailable from the source.
 *     Unavailable is NEVER coerced to zero. A real zero stays zero.
 *   - Provider response shapes (DexScreener pairs, Birdeye payloads, …) must
 *     never appear here. Adapters map INTO this model, never out of it.
 *   - Only facts a source actually supplied are emitted. Nothing is fabricated.
 */

/**
 * Current emitters stay on evidence/v1 so existing production output is
 * byte-identical. New senses (social, wallet, developer, liquidity flow) emit
 * evidence/v1.1, which adds affiliation, attributionStatus and collectionHealth.
 * Historical v1 rows are never rewritten and remain readable: the v1.1 fields
 * are optional and absence means "not classified", never a negative fact.
 */
export const EVIDENCE_SCHEMA_VERSION = "evidence/v1";
export const EVIDENCE_SCHEMA_VERSION_V1_1 = "evidence/v1.1";

export type EvidenceSchemaVersion =
  | typeof EVIDENCE_SCHEMA_VERSION
  | typeof EVIDENCE_SCHEMA_VERSION_V1_1;

/**
 * Feature-version convention (prospective, evidence/v1.1 onward):
 *
 *   <domain>.<feature_name>/v<major>      e.g. "social.mention_velocity/v1"
 *
 * A derived feature whose DEFINITION changes gets a new version suffix and a
 * new key; it never reuses the old key with new meaning. Directly observed
 * provider facts keep their plain dotted keys (e.g. "market.liquidity_usd").
 * Existing keys are deliberately NOT renamed by this convention.
 */
export const FEATURE_KEY_VERSION_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+\/v\d+$/;

export function isVersionedFeatureKey(key: string): boolean {
  return FEATURE_KEY_VERSION_PATTERN.test(key);
}

/**
 * Source relationship of the observation. Describes WHO produced it, never
 * whether it is positive, negative or corroborating. Consumers must decide
 * explicitly how (or whether) affiliation affects their own policy.
 *
 * This is deliberately NOT wired into Deep Research independence/origin logic:
 * `distinctIndependentEvidenceOrigins` and the Opportunity gate remain
 * authoritative and untouched.
 */
export type EvidenceAffiliation =
  | "PROJECT"
  | "COMMUNITY"
  | "INDEPENDENT"
  | "MIRROR"
  | "UNKNOWN";

export const EVIDENCE_AFFILIATIONS: readonly EvidenceAffiliation[] = [
  "PROJECT",
  "COMMUNITY",
  "INDEPENDENT",
  "MIRROR",
  "UNKNOWN",
] as const;

/**
 * Whether the observation can be tied to an exact Solana mint.
 * Ticker, name, fuzzy text, popularity or a previously-known token are NEVER
 * sufficient to claim RESOLVED_MINT.
 */
export type EvidenceAttributionStatus = "RESOLVED_MINT" | "UNRESOLVED_TOKEN_ATTRIBUTION";

export const EVIDENCE_ATTRIBUTION_STATUSES: readonly EvidenceAttributionStatus[] = [
  "RESOLVED_MINT",
  "UNRESOLVED_TOKEN_ATTRIBUTION",
] as const;

/**
 * Quality of the COLLECTION ATTEMPT that produced (or failed to produce) this
 * observation. It describes data collection, never the token. Provider-level
 * operational health stays with `provider_health/v1`; this is per-attempt.
 */
export type EvidenceCollectionHealth =
  | "HEALTHY"
  | "DEGRADED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "PARTIAL"
  | "UNKNOWN";

export const EVIDENCE_COLLECTION_HEALTHS: readonly EvidenceCollectionHealth[] = [
  "HEALTHY",
  "DEGRADED",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "NOT_CONFIGURED",
  "PARTIAL",
  "UNKNOWN",
] as const;

/** Collection states under which a numeric zero can NEVER be recorded. */
export const NON_MEASURING_COLLECTION_HEALTHS: readonly EvidenceCollectionHealth[] = [
  "RATE_LIMITED",
  "UNAVAILABLE",
  "NOT_CONFIGURED",
  "UNKNOWN",
] as const;

/** Broad subject area a fact belongs to. Future sources extend this union. */
export type EvidenceDomain =
  | "market"
  | "provenance"
  | "holders"
  | "creator"
  | "participation"
  | "social";

/** Primitive fact values supported by the evidence layer. */
export type EvidenceValue = number | string | boolean | null;

/** Unit of a numeric value, where one is meaningful. */
export type EvidenceUnit = "usd" | "percent" | "count" | "timestamp";

/**
 * Availability of the observation.
 *   observed    — the source supplied a concrete value.
 *   unavailable — the source cannot supply this fact (value is null).
 */
export type EvidenceStatus = "observed" | "unavailable";

/**
 * Sources we already know about. Adding a provider here must never require
 * touching resolver or scoring code: resolution works off observation
 * metadata and configuration, not off the source label. A source label alone
 * never makes a claim true.
 */
export type KnownEvidenceSource =
  | "dexscreener"
  | "birdeye"
  | "helius"
  | "bubblemaps"
  | "pumpportal"
  | "jupiter"
  | "x"
  | "wingman";

/** Open union: unknown providers stay valid without code changes. */
export type EvidenceSource = KnownEvidenceSource | (string & {});

/**
 * How `observedAt` was determined.
 *   provider_time — the provider supplied a per-fact timestamp.
 *   capture_time  — no provider timestamp; observedAt is our capture time.
 *   derived       — computed from other observations.
 */
export type ObservedAtBasis = "provider_time" | "capture_time" | "derived";


export interface EvidenceObservation {
  /** Subject area, e.g. "market". */
  domain: EvidenceDomain;
  /** Stable dotted fact key, e.g. "market.liquidity_usd". */
  key: string;
  /** The observed fact. `null` iff status is "unavailable". */
  value: EvidenceValue;
  /** Unit for numeric values; omitted when not meaningful. */
  unit?: EvidenceUnit;
  /** Which provider/system observed the fact. */
  source: EvidenceSource;
  /**
   * Where within the source the fact came from (pair address, endpoint, …).
   * Null when the source offers no more specific reference.
   */
  sourceReference: string | null;
  /** When the fact was true at the source (ISO). Null when the source omits it. */
  observedAt: string | null;
  /** When Wingman captured the fact (ISO). */
  capturedAt: string;
  status: EvidenceStatus;
  /**
   * 0..1 — only set where confidence is genuinely meaningful (i.e. the source
   * expresses uncertainty). Most direct market reads omit it entirely.
   */
  confidence?: number;
  /** Non-interpretive extra context, e.g. the ingestion version. */
  metadata?: Record<string, EvidenceValue>;
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
}
