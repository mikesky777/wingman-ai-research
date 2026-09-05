/**
 * Production research funnel read-model (server-only).
 *
 * Follows the exact production provenance chain:
 *   production scan → Research Packets → production triage → AI_SHORTLIST →
 *   production Deep Research reports → Thesis.
 * Calibration artefacts are excluded at every query.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadLatestTriage, type TriageRunSummary } from "./triage.server";
import {
  buildProductionShortlist,
  countShortlistStatuses,
  type DeepResearchRunInput,
  type ProductionShortlistEntry,
  type ShortlistStatusCounts,
} from "./production-view";

type Row = Record<string, unknown>;

export interface ProductionFunnel {
  scan: {
    id: string | null;
    completedAt: string | null;
    discoveredTokenCount: number | null;
    policyVersion: string | null;
  } | null;
  triage: TriageRunSummary | null;
  shortlist: ProductionShortlistEntry[];
  deepResearch: ShortlistStatusCounts;
  aiShortlistMilestoneCount: number;
  thesisReportCount: number;
  thesisCallMilestoneCount: number;
}

/** Loads the current production funnel. Read-only. */
export async function loadProductionFunnel(): Promise<ProductionFunnel> {
  const triage = await loadLatestTriage("PRODUCTION");
  if (!triage) {
    return {
      scan: null,
      triage: null,
      shortlist: [],
      deepResearch: { total: 0, completed: 0, pending: 0, blockedOrFailed: 0 },
      aiShortlistMilestoneCount: 0,
      thesisReportCount: 0,
      thesisCallMilestoneCount: 0,
    };
  }

  const scanId = triage.run.sourceScanId;
  let scan: ProductionFunnel["scan"] = null;
  if (scanId) {
    const { data } = await supabaseAdmin
      .from("scan_runs")
      .select("id, completed_at, tokens_discovered, selection_policy_version")
      .eq("id", scanId)
      .maybeSingle();
    const r = (data as Row | null) ?? null;
    if (r) {
      scan = {
        id: r["id"] as string,
        completedAt: (r["completed_at"] as string) ?? null,
        discoveredTokenCount: (r["tokens_discovered"] as number) ?? null,
        policyVersion: (r["selection_policy_version"] as string) ?? null,
      };
    }
  }

  // Deep Research attempts belonging to THIS production triage run only.
  const { data: runRows, error: runError } = await supabaseAdmin
    .from("deep_research_runs")
    .select("id, mint, status, started_at")
    .eq("triage_run_id", triage.run.id)
    .eq("is_calibration", false)
    .order("started_at", { ascending: true });
  if (runError) throw new Error(runError.message);

  const runIds = ((runRows as Row[]) ?? []).map((r) => r["id"] as string);
  const reportByRunId = new Map<string, Row>();
  if (runIds.length) {
    const { data: reportRows, error: reportError } = await supabaseAdmin
      .from("deep_research_reports")
      .select(
        "id, deep_research_run_id, mint, status, narrative_resolved, source_count, evidence_coverage_pct, dossier, created_at",
      )
      .in("deep_research_run_id", runIds);
    if (reportError) throw new Error(reportError.message);
    for (const r of (reportRows as Row[]) ?? []) {
      reportByRunId.set(r["deep_research_run_id"] as string, r);
    }
  }

  const attempts: DeepResearchRunInput[] = ((runRows as Row[]) ?? []).map((r) => {
    const rep = reportByRunId.get(r["id"] as string) ?? null;
    const dossier = (rep?.["dossier"] as { coverage?: { independentSourceCount?: number } }) ?? null;
    return {
      mint: r["mint"] as string,
      runStatus: (r["status"] as string) ?? null,
      reportId: (rep?.["id"] as string) ?? null,
      reportStatus: (rep?.["status"] as string) ?? null,
      narrativeResolved: rep ? Boolean(rep["narrative_resolved"]) : null,
      sourceCount: (rep?.["source_count"] as number) ?? null,
      independentSourceCount: dossier?.coverage?.independentSourceCount ?? null,
      coveragePct: (rep?.["evidence_coverage_pct"] as number) ?? null,
      researchedAt: (rep?.["created_at"] as string) ?? (r["started_at"] as string) ?? null,
    };
  });

  const shortlist = buildProductionShortlist(triage.decisions, attempts);

  const { count: milestoneCount } = await supabaseAdmin
    .from("token_stage_milestones")
    .select("id", { count: "exact", head: true })
    .eq("stage", "AI_SHORTLIST");
  const { count: thesisCallCount } = await supabaseAdmin
    .from("token_stage_milestones")
    .select("id", { count: "exact", head: true })
    .eq("stage", "THESIS_CALL");
  const { count: thesisReports } = await supabaseAdmin
    .from("thesis_reports")
    .select("id", { count: "exact", head: true })
    .eq("is_calibration", false);

  return {
    scan,
    triage: triage.run,
    shortlist,
    deepResearch: countShortlistStatuses(shortlist),
    aiShortlistMilestoneCount: milestoneCount ?? 0,
    thesisCallMilestoneCount: thesisCallCount ?? 0,
    thesisReportCount: thesisReports ?? 0,
  };
}

/** Loads one persisted Deep Research report by id (production or calibration). */
export async function loadDeepResearchReportById(id: string): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from("deep_research_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Row | null) ?? null;
}
