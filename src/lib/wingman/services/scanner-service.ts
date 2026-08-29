import { supabase } from "../data/supabase";
import { MarketDataService } from "./market-data-service";
import type { MarketRegime, ScanSummary, ScannedCandidate } from "../types";

interface ScanRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  tokens_scanned: number;
  passed_hard_filters: number;
  passed_quantitative_ranking: number;
  passed_ai_triage: number;
  deep_researched: number;
  actionable_count: number;
  market_regime: MarketRegime;
}

interface CandidateRow {
  id: string;
  quantitative_score: number | null;
  stage_reached: string;
  rejection_reason: string | null;
  promoted_reason: string | null;
  token: { id: string; name: string; symbol: string };
}

const STAGE_MAP: Record<string, ScannedCandidate["stageReached"]> = {
  hard_filters: "HARD_FILTERS",
  quantitative: "QUANT_RANKING",
  ai_triage: "AI_TRIAGE",
  deep_research: "DEEP_RESEARCH",
  shortlist: "SHORTLIST",
  universe: "HARD_FILTERS",
  rejected: "HARD_FILTERS",
};

export interface LatestScan {
  runId: string;
  summary: ScanSummary;
}

/** ScannerService — scan cycles and how each candidate moved through them. */
export const ScannerService = {
  /** Most recent completed scan, or null when Wingman has never run. */
  async latestCompletedScan(): Promise<LatestScan | null> {
    const { data, error } = await supabase
      .from("scan_runs")
      .select(
        "id, started_at, completed_at, status, tokens_scanned, passed_hard_filters, passed_quantitative_ranking, passed_ai_triage, deep_researched, actionable_count, market_regime",
      )
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const run = data as ScanRunRow;
    return {
      runId: run.id,
      summary: {
        regime: run.market_regime,
        lastScanAt: run.completed_at ?? run.started_at,
        tokensScanned: run.tokens_scanned,
        passedFilters: run.passed_hard_filters,
        quantRanked: run.passed_quantitative_ranking,
        deepResearched: run.deep_researched,
        actionable: run.actionable_count,
      },
    };
  },

  async candidates(scanRunId: string): Promise<ScannedCandidate[]> {
    const { data, error } = await supabase
      .from("scan_candidates")
      .select(
        "id, quantitative_score, stage_reached, rejection_reason, promoted_reason, token:tokens!inner(id, name, symbol)",
      )
      .eq("scan_run_id", scanRunId)
      .order("quantitative_score", { ascending: false });
    if (error) throw error;

    const rows = data as unknown as CandidateRow[];
    const snapshots = await MarketDataService.latestByToken(rows.map((r) => r.token.id));

    return rows.map((r) => ({
      id: r.id,
      name: r.token.name,
      ticker: r.token.symbol,
      marketCapUsd: snapshots[r.token.id]?.marketCapUsd ?? 0,
      liquidityUsd: snapshots[r.token.id]?.liquidityUsd ?? 0,
      quantScore: Number(r.quantitative_score ?? 0),
      stageReached: STAGE_MAP[r.stage_reached] ?? "HARD_FILTERS",
      outcome: r.promoted_reason ?? r.rejection_reason ?? "—",
    }));
  },
};
