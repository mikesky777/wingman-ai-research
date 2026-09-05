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
import type { DeepResearchReportSummary } from "./deep/deep-research.server";
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
    const dossier =
      (rep?.["dossier"] as { coverage?: { independentSourceCount?: number } } | undefined) ?? null;
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

/** Loads one persisted Deep Research report by id, in the panel's shape. */
export async function loadDeepResearchReportById(
  id: string,
): Promise<DeepResearchReportSummary | null> {
  const { data, error } = await supabaseAdmin
    .from("deep_research_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const r = (data as Row | null) ?? null;
  if (!r) return null;
  const dossier = r["dossier"] as DeepResearchReportSummary["dossier"];
  const coverage = (dossier?.coverage ?? {}) as Partial<Record<string, number>>;
  return {
    id: r["id"] as string,
    runId: r["deep_research_run_id"] as string,
    mint: r["mint"] as string,
    symbol: dossier?.symbol ?? null,
    isCalibration: Boolean(r["is_calibration"]),
    status: (r["status"] as string) ?? "unknown",
    createdAt: (r["created_at"] as string) ?? "",
    oneSentenceNarrative: (r["one_sentence_narrative"] as string) ?? null,
    narrativeResolved: Boolean(r["narrative_resolved"]),
    identityAttributionConfidence:
      (r["identity_attribution_confidence"] as string) ?? "UNRESOLVED",
    coveragePct: (r["evidence_coverage_pct"] as number) ?? null,
    sourceCount: (r["source_count"] as number) ?? 0,
    primarySourceCount: (r["primary_source_count"] as number) ?? 0,
    independentSourceCount: coverage["independentSourceCount"] ?? 0,
    projectOwnedSourceCount: coverage["projectOwnedSourceCount"] ?? 0,
    projectAffiliatedSourceCount: coverage["projectAffiliatedSourceCount"] ?? 0,
    corroboratedClaimCount: coverage["corroboratedClaimCount"] ?? 0,
    searchVersion: dossier?.searchVersion ?? null,
    conflictingClaimCount: (r["conflicting_claim_count"] as number) ?? 0,
    unresolvedGapCount: (r["unresolved_gap_count"] as number) ?? 0,
    unresolvedDomains: (r["unresolved_domains"] as string[]) ?? [],
    dossier,
  } as DeepResearchReportSummary;
}
