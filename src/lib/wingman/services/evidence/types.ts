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

export const EVIDENCE_SCHEMA_VERSION = "evidence/v1";

/** Broad subject area a fact belongs to. Future sources extend this union. */
export type EvidenceDomain =
  | "market"
  | "provenance"
  | "holders"
  | "creator"
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

/** Identifier of the system that produced the fact. */
export type EvidenceSource = "dexscreener";

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
