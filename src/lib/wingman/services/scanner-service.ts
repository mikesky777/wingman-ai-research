import { supabase } from "../data/supabase";
import { MarketDataService } from "./market-data-service";
import type { MarketRegime, ScanSummary, ScannedCandidate } from "../types";

interface ScanRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  tokens_scanned: number;
  tokens_discovered: number;
  passed_hard_filters: number;
  passed_quantitative_ranking: number;
  quantitatively_ranked: number;
  passed_ai_triage: number;
  deep_researched: number;
  enriched_count: number;
  actionable_count: number;
  market_regime: MarketRegime;
  scanner_version: string | null;
  discovery_config_version: string | null;
  calibration_mode: boolean;
  provider_telemetry: unknown;
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
  enriched: "DEEP_RESEARCH",
  ai_triage: "AI_TRIAGE",
  deep_research: "DEEP_RESEARCH",
  shortlist: "SHORTLIST",
  universe: "HARD_FILTERS",
  discovered: "HARD_FILTERS",
  rejected: "HARD_FILTERS",
};

export interface LatestScan {
  runId: string;
  summary: ScanSummary;
}

/** Scanner v1 funnel counts, read straight from the run ledger. */
export interface ScanFunnel {
  runId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  scannerVersion: string | null;
  discoveryConfigVersion: string | null;
  calibrationMode: boolean;
  discovered: number;
  passedHardFilters: number;
  quantitativelyRanked: number;
  enriched: number;
  providerTelemetry: unknown;
}

/** One scanner v1 candidate, as rendered in the scanner table. */
export interface ScanCandidateV1 {
  id: string;
  tokenId: string;
  name: string;
  symbol: string;
  contractAddress: string | null;
  lanes: string[];
  ageMinutes: number | null;
  ageBasis: string | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  turnover24h: number | null;
  activityState: string | null;
  persistenceSignal: string | null;
  reaccelerationSignal: string | null;
  extensionRisk: string | null;
  attentionPriceDivergence: string | null;
  quantitativePriority: number | null;
  stageReached: string;
  rejectionReason: string | null;
  enriched: boolean;
}

type Row = Record<string, unknown>;

const RUN_COLUMNS =
  "id, started_at, completed_at, status, tokens_scanned, tokens_discovered, passed_hard_filters, passed_quantitative_ranking, quantitatively_ranked, passed_ai_triage, deep_researched, enriched_count, actionable_count, market_regime, scanner_version, discovery_config_version, calibration_mode, provider_telemetry";

/** ScannerService — scan cycles and how each candidate moved through them. */
export const ScannerService = {
  /** Most recent completed scan, or null when Wingman has never run. */
  async latestCompletedScan(): Promise<LatestScan | null> {
    const { data, error } = await supabase
      .from("scan_runs")
      .select(RUN_COLUMNS)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const run = data as unknown as ScanRunRow;
    return {
      runId: run.id,
      summary: {
        regime: run.market_regime,
        lastScanAt: run.completed_at ?? run.started_at,
        tokensScanned: run.tokens_discovered || run.tokens_scanned,
        passedFilters: run.passed_hard_filters,
        quantRanked: run.quantitatively_ranked || run.passed_quantitative_ranking,
        deepResearched: run.deep_researched,
        actionable: run.actionable_count,
      },
    };
  },

  /** Scanner v1 funnel for the latest completed run. */
  async latestFunnel(): Promise<ScanFunnel | null> {
    const { data, error } = await supabase
      .from("scan_runs")
      .select(RUN_COLUMNS)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const run = data as unknown as ScanRunRow;
    return {
      runId: run.id,
      status: run.status,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      scannerVersion: run.scanner_version,
      discoveryConfigVersion: run.discovery_config_version,
      calibrationMode: run.calibration_mode,
      discovered: run.tokens_discovered || run.tokens_scanned,
      passedHardFilters: run.passed_hard_filters,
      quantitativelyRanked: run.quantitatively_ranked || run.passed_quantitative_ranking,
      enriched: run.enriched_count,
      providerTelemetry: run.provider_telemetry,
    };
  },

  /** Ranked scanner v1 candidates for a run, highest research priority first. */
  async rankedCandidates(scanRunId: string, limit = 100): Promise<ScanCandidateV1[]> {
    const { data, error } = await supabase
      .from("scan_candidates")
      .select(
        "id, token_id, contract_address, discovery_lanes, token_age_minutes, age_basis, market_cap, liquidity_usd, volume_24h, volume_to_market_cap_24h, activity_state, persistence_signal, reacceleration_signal, extension_risk, attention_price_divergence, quantitative_priority, stage_reached, rejection_reason, enriched, token:tokens!inner(id, name, symbol)",
      )
      .eq("scan_run_id", scanRunId)
      .not("quantitative_priority", "is", null)
      .order("quantitative_priority", { ascending: false })
      .limit(limit);
    if (error) throw error;

    return ((data ?? []) as unknown as Row[]).map((r) => {
      const token = r["token"] as { id: string; name: string; symbol: string };
      return {
        id: r["id"] as string,
        tokenId: token.id,
        name: token.name,
        symbol: token.symbol,
        contractAddress: (r["contract_address"] as string | null) ?? null,
        lanes: (r["discovery_lanes"] as string[] | null) ?? [],
        ageMinutes: (r["token_age_minutes"] as number | null) ?? null,
        ageBasis: (r["age_basis"] as string | null) ?? null,
        marketCap: (r["market_cap"] as number | null) ?? null,
        liquidityUsd: (r["liquidity_usd"] as number | null) ?? null,
        volume24h: (r["volume_24h"] as number | null) ?? null,
        turnover24h: (r["volume_to_market_cap_24h"] as number | null) ?? null,
        activityState: (r["activity_state"] as string | null) ?? null,
        persistenceSignal: (r["persistence_signal"] as string | null) ?? null,
        reaccelerationSignal: (r["reacceleration_signal"] as string | null) ?? null,
        extensionRisk: (r["extension_risk"] as string | null) ?? null,
        attentionPriceDivergence: (r["attention_price_divergence"] as string | null) ?? null,
        quantitativePriority: (r["quantitative_priority"] as number | null) ?? null,
        stageReached: r["stage_reached"] as string,
        rejectionReason: (r["rejection_reason"] as string | null) ?? null,
        enriched: Boolean(r["enriched"]),
      };
    });
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
