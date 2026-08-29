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

export interface BucketRow {
  bucket: string;
  discovered: number;
  passedHardFilters: number;
  laneQualified: number;
  quantitativelyRanked: number;
  enriched: number;
}

export interface LaneRow {
  lane: string;
  discovered: number;
  qualified: number;
  enriched: number;
  below100k: number;
  between100kAnd250k: number;
  medianAgeMinutes: number | null;
  medianTurnover24h: number | null;
  withHistory: number;
}

export interface ScanRunDiagnostics {
  runId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  survivorLimit: number | null;
  calibrationMode: boolean;
  scannerVersion: string | null;
  discoveryConfigVersion: string | null;
  buckets: BucketRow[];
  lanes: LaneRow[];
  providerTelemetry: unknown;
  errorMessage: string | null;
}

export interface PriorityBreakdownRow {
  components: Record<string, { score: number; weight: number; points: number }>;
  extensionPenalty: number;
  divergenceAdjustment: number;
  raw: number;
  total: number;
}

/** One candidate as shown in the Scanner Workbench, survivors and near misses. */
export interface WorkbenchCandidate {
  id: string;
  tokenId: string;
  name: string;
  symbol: string;
  contractAddress: string | null;
  lanes: string[];
  laneRejections: Record<string, string>;
  discoveryQueries: string[];
  discoveryRanks: Record<string, number>;
  ageMinutes: number | null;
  ageBasis: string | null;
  marketCap: number | null;
  marketCapBucket: string;
  liquidityUsd: number | null;
  priceUsd: number | null;
  volume1h: number | null;
  volume24h: number | null;
  trades1h: number | null;
  trades24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  holderCount: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  turnover24h: number | null;
  volumeToLiquidity24h: number | null;
  activityState: string | null;
  persistenceSignal: string | null;
  reaccelerationSignal: string | null;
  extensionRisk: string | null;
  extensionReasons: string[];
  attentionPriceDivergence: string | null;
  structuralSafety: string;
  tokenSecurity: string;
  quantitativePriority: number | null;
  priorityBreakdown: PriorityBreakdownRow | null;
  metricsDetail: Record<string, unknown> | null;
  globalRank: number | null;
  laneRanks: Record<string, number>;
  selectedByLaneReservation: boolean;
  selectedByGlobalRanking: boolean;
  historySnapshotCount: number;
  stageReached: string;
  rejectionReason: string | null;
  rejectionDetails: Record<string, unknown> | null;
  enriched: boolean;
  previousPriority: number | null;
  priorityChange: number | null;
  label: string;
  labelNote: string | null;
}

const WORKBENCH_COLUMNS =
  "id, token_id, contract_address, discovery_lanes, lane_rejections, discovery_queries, discovery_ranks, token_age_minutes, age_basis, market_cap, market_cap_bucket, liquidity_usd, price_usd, volume_1h, volume_24h, trades_1h, trades_24h, buys_24h, sells_24h, holder_count, price_change_1h, price_change_24h, volume_to_market_cap_24h, volume_to_liquidity_24h, activity_state, persistence_signal, reacceleration_signal, extension_risk, extension_reasons, attention_price_divergence, structural_safety, token_security, quantitative_priority, priority_breakdown, metrics_detail, global_rank, lane_ranks, selected_by_lane_reservation, selected_by_global_ranking, history_snapshot_count, stage_reached, rejection_reason, rejection_details, enriched, token:tokens!inner(id, name, symbol)";

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

  /** Run-level calibration diagnostics for the Scanner Workbench. */
  async runDiagnostics(scanRunId: string): Promise<ScanRunDiagnostics | null> {
    const { data, error } = await supabase
      .from("scan_runs")
      .select(
        "id, status, started_at, completed_at, duration_ms, survivor_limit, calibration_mode, scanner_version, discovery_config_version, bucket_diagnostics, lane_diagnostics, provider_telemetry, error_message",
      )
      .eq("id", scanRunId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const r = data as unknown as Row;
    return {
      runId: r["id"] as string,
      status: r["status"] as string,
      startedAt: r["started_at"] as string,
      completedAt: (r["completed_at"] as string | null) ?? null,
      durationMs: (r["duration_ms"] as number | null) ?? null,
      survivorLimit: (r["survivor_limit"] as number | null) ?? null,
      calibrationMode: Boolean(r["calibration_mode"]),
      scannerVersion: (r["scanner_version"] as string | null) ?? null,
      discoveryConfigVersion: (r["discovery_config_version"] as string | null) ?? null,
      buckets: (r["bucket_diagnostics"] as BucketRow[] | null) ?? [],
      lanes: (r["lane_diagnostics"] as LaneRow[] | null) ?? [],
      providerTelemetry: r["provider_telemetry"],
      errorMessage: (r["error_message"] as string | null) ?? null,
    };
  },

  /**
   * Every persisted candidate for a run — survivors AND near misses — with the
   * full stored breakdown. Nothing is recomputed in the browser.
   */
  async workbenchCandidates(scanRunId: string, limit = 400): Promise<WorkbenchCandidate[]> {
    const { data, error } = await supabase
      .from("scan_candidates")
      .select(WORKBENCH_COLUMNS)
      .eq("scan_run_id", scanRunId)
      .order("quantitative_priority", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;

    const rows = (data ?? []) as unknown as Row[];
    const [labels, previous] = await Promise.all([
      ScannerService.labels(scanRunId),
      ScannerService.previousPriorities(scanRunId),
    ]);

    return rows.map((r) => {
      const token = r["token"] as { id: string; name: string; symbol: string };
      const priority = (r["quantitative_priority"] as number | null) ?? null;
      const prior = previous[token.id] ?? null;
      return {
        id: r["id"] as string,
        tokenId: token.id,
        name: token.name,
        symbol: token.symbol,
        contractAddress: (r["contract_address"] as string | null) ?? null,
        lanes: (r["discovery_lanes"] as string[] | null) ?? [],
        laneRejections: (r["lane_rejections"] as Record<string, string> | null) ?? {},
        discoveryQueries: (r["discovery_queries"] as string[] | null) ?? [],
        discoveryRanks: (r["discovery_ranks"] as Record<string, number> | null) ?? {},
        ageMinutes: (r["token_age_minutes"] as number | null) ?? null,
        ageBasis: (r["age_basis"] as string | null) ?? null,
        marketCap: (r["market_cap"] as number | null) ?? null,
        marketCapBucket: (r["market_cap_bucket"] as string | null) ?? "unknown",
        liquidityUsd: (r["liquidity_usd"] as number | null) ?? null,
        priceUsd: (r["price_usd"] as number | null) ?? null,
        volume1h: (r["volume_1h"] as number | null) ?? null,
        volume24h: (r["volume_24h"] as number | null) ?? null,
        trades1h: (r["trades_1h"] as number | null) ?? null,
        trades24h: (r["trades_24h"] as number | null) ?? null,
        buys24h: (r["buys_24h"] as number | null) ?? null,
        sells24h: (r["sells_24h"] as number | null) ?? null,
        holderCount: (r["holder_count"] as number | null) ?? null,
        priceChange1h: (r["price_change_1h"] as number | null) ?? null,
        priceChange24h: (r["price_change_24h"] as number | null) ?? null,
        turnover24h: (r["volume_to_market_cap_24h"] as number | null) ?? null,
        volumeToLiquidity24h: (r["volume_to_liquidity_24h"] as number | null) ?? null,
        activityState: (r["activity_state"] as string | null) ?? null,
        persistenceSignal: (r["persistence_signal"] as string | null) ?? null,
        reaccelerationSignal: (r["reacceleration_signal"] as string | null) ?? null,
        extensionRisk: (r["extension_risk"] as string | null) ?? null,
        extensionReasons: (r["extension_reasons"] as string[] | null) ?? [],
        attentionPriceDivergence: (r["attention_price_divergence"] as string | null) ?? null,
        structuralSafety: (r["structural_safety"] as string | null) ?? "UNKNOWN",
        tokenSecurity: (r["token_security"] as string | null) ?? "NOT_CHECKED",
        quantitativePriority: priority,
        priorityBreakdown: (r["priority_breakdown"] as PriorityBreakdownRow | null) ?? null,
        metricsDetail: (r["metrics_detail"] as Record<string, unknown> | null) ?? null,
        globalRank: (r["global_rank"] as number | null) ?? null,
        laneRanks: (r["lane_ranks"] as Record<string, number> | null) ?? {},
        selectedByLaneReservation: Boolean(r["selected_by_lane_reservation"]),
        selectedByGlobalRanking: Boolean(r["selected_by_global_ranking"]),
        historySnapshotCount: (r["history_snapshot_count"] as number | null) ?? 0,
        stageReached: r["stage_reached"] as string,
        rejectionReason: (r["rejection_reason"] as string | null) ?? null,
        rejectionDetails: (r["rejection_details"] as Record<string, unknown> | null) ?? null,
        enriched: Boolean(r["enriched"]),
        previousPriority: prior,
        priorityChange: priority !== null && prior !== null ? priority - prior : null,
        label: labels[token.id]?.label ?? "UNREVIEWED",
        labelNote: labels[token.id]?.note ?? null,
      };
    });
  },

  /** Human calibration labels for a run, keyed by token id. */
  async labels(scanRunId: string): Promise<Record<string, { label: string; note: string | null }>> {
    const { data, error } = await supabase
      .from("scanner_labels")
      .select("token_id, label, note")
      .eq("scan_run_id", scanRunId);
    if (error) return {};
    const out: Record<string, { label: string; note: string | null }> = {};
    for (const row of (data ?? []) as unknown as Row[]) {
      out[row["token_id"] as string] = {
        label: row["label"] as string,
        note: (row["note"] as string | null) ?? null,
      };
    }
    return out;
  },

  /** Priorities from the run immediately before this one, for score movement. */
  async previousPriorities(scanRunId: string): Promise<Record<string, number>> {
    const { data: current } = await supabase
      .from("scan_runs")
      .select("started_at")
      .eq("id", scanRunId)
      .maybeSingle();
    const startedAt = (current as { started_at?: string } | null)?.started_at;
    if (!startedAt) return {};

    const { data: prev } = await supabase
      .from("scan_runs")
      .select("id")
      .eq("status", "completed")
      .lt("started_at", startedAt)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevId = (prev as { id?: string } | null)?.id;
    if (!prevId) return {};

    const { data } = await supabase
      .from("scan_candidates")
      .select("token_id, quantitative_priority")
      .eq("scan_run_id", prevId)
      .not("quantitative_priority", "is", null);
    const out: Record<string, number> = {};
    for (const row of (data ?? []) as unknown as Row[]) {
      out[row["token_id"] as string] = Number(row["quantitative_priority"]);
    }
    return out;
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
