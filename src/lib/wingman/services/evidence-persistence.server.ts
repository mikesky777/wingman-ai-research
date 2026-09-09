/**
 * Server-only persistence boundary for evidence observations.
 *
 * `evidence_observations` is append-only history: re-inspecting a token adds
 * rows, it never updates or deletes earlier ones. Anonymous/browser clients
 * have read-only access; writes require the service-role client used here.
 *
 * The database row shape stays inside this module — the canonical application
 * representation everywhere else remains `EvidenceObservation`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { EvidenceObservation, EvidenceValue } from "./evidence/types";
import { EVIDENCE_SCHEMA_VERSION } from "./evidence/types";
import { resolvedTokenIdFor } from "./evidence/observation-builder";

export interface EvidencePersistenceContext {
  /**
   * Exact token linkage. Required for RESOLVED_MINT observations; may be null
   * only for evidence/v1.1 UNRESOLVED_TOKEN_ATTRIBUTION observations.
   */
  tokenId: string | null;
  scanRunId?: string | null;
  researchReportId?: string | null;
}

type EvidenceRow = {
  token_id: string | null;
  scan_run_id: string | null;
  research_report_id: string | null;
  domain: string;
  key: string;
  value_json: EvidenceValue;
  unit: string | null;
  source: string;
  source_reference: string | null;
  observed_at: string | null;
  captured_at: string;
  status: string;
  confidence: number | null;
  metadata: Record<string, EvidenceValue> | null;
  affiliation: string | null;
  attribution_status: string;
  collection_health: string | null;
  schema_version: string;
};

/** Map the canonical in-memory model to a database row. */
export function toEvidenceRow(
  observation: EvidenceObservation,
  context: EvidencePersistenceContext,
): EvidenceRow {
  return {
    // Unresolved observations persist without a token; a RESOLVED_MINT
    // observation with no linkage is rejected rather than silently attached.
    token_id: resolvedTokenIdFor(observation, context.tokenId),
    scan_run_id: context.scanRunId ?? null,
    research_report_id: context.researchReportId ?? null,
    domain: observation.domain,
    key: observation.key,
    // Stored as JSON so a genuine 0/false stays distinguishable from null.
    value_json: observation.value,
    unit: observation.unit ?? null,
    source: observation.source,
    source_reference: observation.sourceReference,
    observed_at: observation.observedAt,
    captured_at: observation.capturedAt,
    status: observation.status,
    confidence: observation.confidence ?? null,
    metadata: observation.metadata ?? null,
    affiliation: observation.affiliation ?? null,
    // Historical v1 rows were only ever written with an exact token linkage.
    attribution_status: observation.attributionStatus ?? "RESOLVED_MINT",
    collection_health: observation.collectionHealth ?? null,
    schema_version: observation.schemaVersion ?? EVIDENCE_SCHEMA_VERSION,
  };
}

/**
 * Append observations. Never upserts — historical evidence is immutable.
 * Persistence failure must not discard the evidence the caller already has,
 * so the count written is returned instead of throwing on partial trouble.
 */
export async function appendEvidenceObservations(
  observations: EvidenceObservation[],
  context: EvidencePersistenceContext,
): Promise<{ inserted: number; persisted: boolean }> {
  if (observations.length === 0) return { inserted: 0, persisted: true };

  const rows = observations.map((observation) => toEvidenceRow(observation, context));
  const { error, count } = await supabaseAdmin
    .from("evidence_observations")
    .insert(rows as never, { count: "exact" });

  if (error) {
    console.error("appendEvidenceObservations failed", error.message);
    return { inserted: 0, persisted: false };
  }
  return { inserted: count ?? rows.length, persisted: true };
}
