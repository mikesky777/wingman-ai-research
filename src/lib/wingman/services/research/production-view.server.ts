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
import { classifyResearchFailure } from "./deep/failure";
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
  entryEvaluatedCount: number;
  entryActionableCount: number;
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
      entryEvaluatedCount: 0,
      entryActionableCount: 0,
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
    .select("id, mint, status, started_at, error, diagnostics")
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
    const failure =
      (r["status"] as string) === "failed"
        ? classifyResearchFailure((r["error"] as string) ?? null)
        : null;
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
      failureCode: failure ? failure.code : null,
      retryable: failure ? failure.retryable : false,
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

  const { data: entryRows } = await supabaseAdmin
    .from("entry_state_evaluations")
    .select("mint, state, evaluated_at")
    .eq("is_calibration", false)
    .order("evaluated_at", { ascending: false })
    .limit(500);
  const latestEntryByMint = new Map<string, string>();
  for (const row of ((entryRows as Row[]) ?? [])) {
    const mint = row["mint"] as string;
    if (!latestEntryByMint.has(mint)) latestEntryByMint.set(mint, (row["state"] as string) ?? "UNKNOWN");
  }
  const entryActionableCount = [...latestEntryByMint.values()].filter(
    (state) => state === "BUY_ZONE" || state === "ACCEPTABLE",
  ).length;

  return {
    scan,
    triage: triage.run,
    shortlist,
    deepResearch: countShortlistStatuses(shortlist),
    aiShortlistMilestoneCount: milestoneCount ?? 0,
    thesisCallMilestoneCount: thesisCallCount ?? 0,
    thesisReportCount: thesisReports ?? 0,
    entryEvaluatedCount: latestEntryByMint.size,
    entryActionableCount,
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
  const coverage = dossier?.coverage;
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
    independentSourceCount: coverage?.independentSourceCount ?? 0,
    projectOwnedSourceCount: coverage?.projectOwnedSourceCount ?? 0,
    projectAffiliatedSourceCount: coverage?.projectAffiliatedSourceCount ?? 0,
    corroboratedClaimCount: coverage?.corroboratedClaimCount ?? 0,
    searchVersion: dossier?.searchVersion ?? null,
    conflictingClaimCount: (r["conflicting_claim_count"] as number) ?? 0,
    unresolvedGapCount: (r["unresolved_gap_count"] as number) ?? 0,
    unresolvedDomains: (r["unresolved_domains"] as string[]) ?? [],
    dossier,
  } as DeepResearchReportSummary;
}

/**
 * Production funnel ARTIFACTS for History.
 *
 * THESIS_SYNTHESIZED means a real production thesis was completed.
 * THESIS_CALL means that thesis additionally passed every opportunity gate.
 * They are counted separately and neither is ever invented retroactively.
 */
export type ProductionArtifactStage =
  | "AI_SHORTLIST"
  | "DEEP_RESEARCH_COMPLETED"
  | "THESIS_SYNTHESIZED"
  | "THESIS_CALL";

export interface ProductionArtifactToken {
  mint: string;
  symbol: string | null;
  name: string | null;
  pairAddress: string | null;
  at: string | null;
  detail: string | null;
}

export interface ProductionArtifacts {
  counts: Record<ProductionArtifactStage, number>;
  tokens: Record<ProductionArtifactStage, ProductionArtifactToken[]>;
}

export async function loadProductionArtifacts(): Promise<ProductionArtifacts> {
  const [deepRes, thesisRes, shortlistRes, callRes] = await Promise.all([
    supabaseAdmin
      .from("deep_research_reports")
      .select("mint, created_at, status, one_sentence_narrative")
      .eq("is_calibration", false)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("thesis_reports")
      .select("mint, created_at, thesis_score, evidence_confidence, verdict, qualified_as_opportunity")
      .eq("is_calibration", false)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("token_stage_milestones")
      .select("token_id, first_entered_at")
      .eq("stage", "AI_SHORTLIST"),
    supabaseAdmin
      .from("token_stage_milestones")
      .select("token_id, first_entered_at")
      .eq("stage", "THESIS_CALL"),
  ]);

  const deepRows = (deepRes.data as Row[]) ?? [];
  const thesisRows = (thesisRes.data as Row[]) ?? [];
  const shortlistRows = (shortlistRes.data as Row[]) ?? [];
  const callRows = (callRes.data as Row[]) ?? [];

  const tokenIds = [
    ...new Set([...shortlistRows, ...callRows].map((r) => r["token_id"] as string)),
  ];
  const mints = [
    ...new Set([...deepRows, ...thesisRows].map((r) => r["mint"] as string)),
  ];

  // Scoped lookups: the Data API caps a response at 1000 rows, so never read
  // the whole tokens table here.
  const byId = new Map<string, Row>();
  const byMint = new Map<string, Row>();
  const indexToken = (t: Row) => {
    byId.set(t["id"] as string, t);
    byMint.set(t["contract_address"] as string, t);
  };
  if (tokenIds.length) {
    const { data } = await supabaseAdmin
      .from("tokens")
      .select("id, contract_address, symbol, name, dex_pair_address")
      .in("id", tokenIds);
    for (const t of ((data as Row[]) ?? [])) indexToken(t);
  }
  if (mints.length) {
    const { data } = await supabaseAdmin
      .from("tokens")
      .select("id, contract_address, symbol, name, dex_pair_address")
      .in("contract_address", mints);
    for (const t of ((data as Row[]) ?? [])) indexToken(t);
  }

  const identity = (row: Row | undefined, mint: string): ProductionArtifactToken => ({
    mint,
    symbol: (row?.["symbol"] as string | null) ?? null,
    name: (row?.["name"] as string | null) ?? null,
    pairAddress: (row?.["dex_pair_address"] as string | null) ?? null,
    at: null,
    detail: null,
  });

  const dedupe = (list: ProductionArtifactToken[]): ProductionArtifactToken[] => {
    const seen = new Set<string>();
    return list.filter((t) => (seen.has(t.mint) ? false : (seen.add(t.mint), true)));
  };

  const shortlist = dedupe(
    shortlistRows.map((r) => {
      const token = byId.get(r["token_id"] as string);
      const mint = (token?.["contract_address"] as string) ?? (r["token_id"] as string);
      return { ...identity(token, mint), at: (r["first_entered_at"] as string) ?? null };
    }),
  );
  const calls = dedupe(
    callRows.map((r) => {
      const token = byId.get(r["token_id"] as string);
      const mint = (token?.["contract_address"] as string) ?? (r["token_id"] as string);
      return { ...identity(token, mint), at: (r["first_entered_at"] as string) ?? null };
    }),
  );
  const deep = dedupe(
    deepRows.map((r) => {
      const mint = r["mint"] as string;
      return {
        ...identity(byMint.get(mint), mint),
        at: (r["created_at"] as string) ?? null,
        detail: (r["one_sentence_narrative"] as string) ?? null,
      };
    }),
  );
  const thesis = dedupe(
    thesisRows.map((r) => {
      const mint = r["mint"] as string;
      return {
        ...identity(byMint.get(mint), mint),
        at: (r["created_at"] as string) ?? null,
        detail: `Thesis ${r["thesis_score"] ?? "—"} · Evidence ${r["evidence_confidence"] ?? "—"} · ${
          (r["verdict"] as string) ?? "—"
        }`,
      };
    }),
  );

  return {
    counts: {
      AI_SHORTLIST: shortlist.length,
      DEEP_RESEARCH_COMPLETED: deep.length,
      THESIS_SYNTHESIZED: thesis.length,
      THESIS_CALL: calls.length,
    },
    tokens: {
      AI_SHORTLIST: shortlist,
      DEEP_RESEARCH_COMPLETED: deep,
      THESIS_SYNTHESIZED: thesis,
      THESIS_CALL: calls,
    },
  };
}
