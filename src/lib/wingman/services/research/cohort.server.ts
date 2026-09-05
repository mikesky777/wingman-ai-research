/**
 * Active Research cohort resolution (server-only).
 *
 * The ROOT of the Research page is the newest eligible healthy production scan
 * (ai_scan_source/v1). Every downstream id below is resolved by EXACT
 * provenance from that scan; a stage without an artefact stays null and the
 * caller must show NOT_STARTED. There is no cross-cohort fallback anywhere in
 * this module.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { selectActiveProductionScan } from "./packet.server";

import type { AiScanSourceResult } from "./ai-scan-source";
import { RESEARCH_COHORT_VERSION } from "./cohort";

type Row = Record<string, unknown>;

export interface ActiveResearchCohort {
  cohortVersion: string;
  eligibility: AiScanSourceResult;
  scan: {
    id: string;
    completedAt: string | null;
    discoveredTokenCount: number | null;
    policyVersion: string | null;
    packetCount: number;
  } | null;
  triageRunId: string | null;
  triageStatus: string | null;
  thesisSynthesisRunId: string | null;
}

/** Production triage for one exact scan. Never another scan's triage. */
export async function loadCohortTriageRunId(
  scanId: string,
): Promise<{ id: string; status: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("ai_triage_runs")
    .select("id, status, started_at")
    .eq("is_calibration", false)
    .eq("source_scan_id", scanId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Row;
  return { id: r["id"] as string, status: (r["status"] as string) ?? null };
}

/** Production thesis synthesis for one exact triage run. */
export async function loadCohortThesisRunId(
  triageRunId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("thesis_synthesis_runs")
    .select("id, created_at")
    .eq("is_calibration", false)
    .eq("triage_run_id", triageRunId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ((data as Row)["id"] as string) : null;
}

export async function loadActiveResearchCohort(): Promise<ActiveResearchCohort> {
  const eligibility = await selectEligibleProductionScan();
  if (!eligibility.ok || !eligibility.runId) {
    return {
      cohortVersion: RESEARCH_COHORT_VERSION,
      eligibility,
      scan: null,
      triageRunId: null,
      triageStatus: null,
      thesisSynthesisRunId: null,
    };
  }

  const { data } = await supabaseAdmin
    .from("scan_runs")
    .select("id, completed_at, tokens_discovered, selection_policy_version")
    .eq("id", eligibility.runId)
    .maybeSingle();
  const r = (data as Row | null) ?? null;

  const triage = await loadCohortTriageRunId(eligibility.runId);
  const thesisSynthesisRunId = triage ? await loadCohortThesisRunId(triage.id) : null;

  return {
    cohortVersion: RESEARCH_COHORT_VERSION,
    eligibility,
    scan: {
      id: eligibility.runId,
      completedAt: (r?.["completed_at"] as string) ?? eligibility.completedAt,
      discoveredTokenCount: (r?.["tokens_discovered"] as number) ?? null,
      policyVersion: (r?.["selection_policy_version"] as string) ?? null,
      packetCount: eligibility.researchPacketCount,
    },
    triageRunId: triage?.id ?? null,
    triageStatus: triage?.status ?? null,
    thesisSynthesisRunId,
  };
}

/** Thesis report ids belonging to one exact synthesis run. */
export async function loadCohortThesisReportIds(
  thesisSynthesisRunId: string,
): Promise<{ reportIds: string[]; callMilestoneIds: string[] }> {
  const { data, error } = await supabaseAdmin
    .from("thesis_reports")
    .select("id, thesis_call_milestone_id")
    .eq("thesis_synthesis_run_id", thesisSynthesisRunId)
    .eq("is_calibration", false);
  if (error) throw new Error(error.message);
  const rows = (data as Row[]) ?? [];
  return {
    reportIds: rows.map((r) => r["id"] as string),
    callMilestoneIds: rows
      .map((r) => (r["thesis_call_milestone_id"] as string) ?? null)
      .filter((v): v is string => Boolean(v)),
  };
}
