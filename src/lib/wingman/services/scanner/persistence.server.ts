/**
 * Scanner persistence (server-only, service-role).
 *
 * Rules:
 *   - `scan_runs` is the run ledger; a unique partial index guarantees only one
 *     run can be `running` at a time.
 *   - A failed run is marked failed and never touches earlier completed runs.
 *   - Token identity rows are inserted for discovered tokens but existing
 *     richer metadata is never overwritten by thin discovery data.
 *   - Snapshots stay append-only; nothing here updates history.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SCANNER_VERSION, type StrategySettings } from "./config";
import {
  CURRENT_POLICY_EPOCH,
  SELECTION_POLICY_VERSION,
} from "../history/policy-epochs";
import { marketCapBucket } from "./diagnostics";
import { RECURRENCE_CONFIG, type RecurrenceAppearance } from "./recurrence";
import { ABANDONED_RUN_REASON, SCAN_STALE_AFTER_MS } from "./run-lifecycle";
import type {
  DiscoveredToken,
  EvaluatedCandidate,
  HistoricalPoint,
  ProviderCallTelemetry,
} from "./types";

type Row = Record<string, unknown>;

export interface StartRunInput {
  calibrationMode: boolean;
  discoveryConfigVersion: string;
  /** Exact strategy this run evaluates with — snapshotted, never referenced. */
  strategy: StrategySettings;
}

export class ConcurrentScanError extends Error {
  /** The run actually holding the lock, when it could be identified. */
  activeRunId: string | null;
  constructor(activeRunId: string | null = null) {
    super("A scan is already running.");
    this.name = "ConcurrentScanError";
    this.activeRunId = activeRunId;
  }
}

export interface ActiveRun {
  id: string;
  startedAt: string | null;
}

/** The single run currently holding the lock, if any. */
export async function getActiveRun(): Promise<ActiveRun | null> {
  const { data, error } = await supabaseAdmin
    .from("scan_runs")
    .select("id, started_at")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read active scan run: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  return { id: row["id"] as string, startedAt: (row["started_at"] as string | null) ?? null };
}

/** Persisted status of one run. Never mutates anything. */
export async function getScanRunState(
  runId: string,
): Promise<{ status: string; errorMessage: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("scan_runs")
    .select("status, error_message")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(`Could not read scan run: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  return {
    status: row["status"] as string,
    errorMessage: (row["error_message"] as string | null) ?? null,
  };
}

/**
 * Release the lock held by runs whose worker died. Only `running` rows older
 * than the stale threshold are touched; completed and failed history is never
 * modified. Returns the reclaimed run ids.
 */
export async function reclaimStaleRuns(nowMs: number = Date.now()): Promise<string[]> {
  const cutoff = new Date(nowMs - SCAN_STALE_AFTER_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("scan_runs")
    .update({
      status: "failed",
      completed_at: new Date(nowMs).toISOString(),
      error_message: ABANDONED_RUN_REASON,
    } as never)
    .eq("status", "running")
    .lt("started_at", cutoff)
    .select("id");
  if (error) throw new Error(`Could not reclaim stale scan runs: ${error.message}`);
  return ((data as Row[] | null) ?? []).map((r) => r["id"] as string);
}

export async function startScanRun(input: StartRunInput): Promise<string> {
  // An abandoned run must never block scanning forever: reclaim first, then
  // rely on the unique partial index to reject genuine concurrency.
  await reclaimStaleRuns();
  return insertScanRun(input);
}

async function insertScanRun(input: StartRunInput): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("scan_runs")
    .insert({
      status: "running",
      started_at: new Date().toISOString(),
      scanner_version: SCANNER_VERSION,
      discovery_config_version: input.discoveryConfigVersion,
      calibration_mode: input.calibrationMode,
      config_version: input.strategy.configVersion,
      config_snapshot: input.strategy as never,
      // Policy era this run actually executes under, frozen at run start.
      selection_policy_version: SELECTION_POLICY_VERSION,
      policy_epoch: CURRENT_POLICY_EPOCH,
    } as never)
    .select("id")
    .single();

  if (error) {
    // 23505 = unique violation on the single-running-scan index.
    if (error.code === "23505") {
      const active = await getActiveRun().catch(() => null);
      throw new ConcurrentScanError(active?.id ?? null);
    }
    throw new Error(`Could not start scan run: ${error.message}`);
  }
  return (data as Row)["id"] as string;
}


export interface CompleteRunInput {
  runId: string;
  tokensDiscovered: number;
  passedHardFilters: number;
  quantitativelyRanked: number;
  enriched: number;
  telemetry: ProviderCallTelemetry[];
  notes?: string | null;
  bucketDiagnostics?: unknown;
  laneDiagnostics?: unknown;
  durationMs?: number | null;
  survivorLimit?: number | null;
  /** Run-level recurrence/refresh counts for calibration and API-cost review. */
  recurrenceDiagnostics?: unknown;
  /** Per-domain refresh counts and honest request accounting. */
  refreshDiagnostics?: unknown;
  /** Mandate eligibility counts for this run. */
  universeDiagnostics?: unknown;
  /** Structural Eligibility shadow-mode counts for this run. */
  structuralDiagnostics?: unknown;
  /** BASE 24h-volume floor effect for this run. */
  baseVolumeFloorDiagnostics?: unknown;
  /** Price / Launch Integrity shadow-mode counts and history cost. */
  priceIntegrityDiagnostics?: unknown;
  /** Participation Quality shadow-mode counts and provider cost. */
  participationDiagnostics?: unknown;
  /** Survivor composition: setup counts, NONE exceptions and unused capacity. */
  survivorDiagnostics?: unknown;
}

export async function completeScanRun(input: CompleteRunInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from("scan_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      tokens_discovered: input.tokensDiscovered,
      // Legacy column kept in sync so existing reads keep working.
      tokens_scanned: input.tokensDiscovered,
      passed_hard_filters: input.passedHardFilters,
      passed_quantitative_ranking: input.quantitativelyRanked,
      quantitatively_ranked: input.quantitativelyRanked,
      enriched_count: input.enriched,
      deep_researched: 0,
      passed_ai_triage: 0,
      actionable_count: 0,
      provider_telemetry: input.telemetry as never,
      bucket_diagnostics: (input.bucketDiagnostics ?? null) as never,
      lane_diagnostics: (input.laneDiagnostics ?? null) as never,
      duration_ms: input.durationMs ?? null,
      survivor_limit: input.survivorLimit ?? null,
      recurrence_diagnostics: (input.recurrenceDiagnostics ?? null) as never,
      refresh_diagnostics: (input.refreshDiagnostics ?? null) as never,
      universe_diagnostics: (input.universeDiagnostics ?? null) as never,
      structural_diagnostics: (input.structuralDiagnostics ?? null) as never,
      base_volume_floor_diagnostics: (input.baseVolumeFloorDiagnostics ?? null) as never,
      price_integrity_diagnostics: (input.priceIntegrityDiagnostics ?? null) as never,
      participation_diagnostics: (input.participationDiagnostics ?? null) as never,
      survivor_diagnostics: (input.survivorDiagnostics ?? null) as never,
      notes: input.notes ?? null,
    } as never)
    .eq("id", input.runId);
  if (error) throw new Error(`Could not complete scan run: ${error.message}`);
}

export async function failScanRun(runId: string, message: string): Promise<void> {
  await supabaseAdmin
    .from("scan_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message.slice(0, 500),
    } as never)
    .eq("id", runId);
}

/**
 * Insert identity rows for tokens we have never seen, then resolve ids for the
 * whole set. `ignoreDuplicates` protects existing, richer metadata.
 */
export async function resolveTokenIds(
  tokens: DiscoveredToken[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (tokens.length === 0) return map;

  const addresses = [...new Set(tokens.map((t) => t.contractAddress))];

  const payload = tokens.map((t) => ({
    contract_address: t.contractAddress,
    chain: t.chain,
    symbol: t.symbol ?? t.contractAddress.slice(0, 6),
    name: t.name ?? "Unknown token",
    image_url: t.imageUrl,
    metadata_source: "birdeye",
  }));

  const { error: insertError } = await supabaseAdmin
    .from("tokens")
    .upsert(payload as never, { onConflict: "contract_address", ignoreDuplicates: true });
  if (insertError) throw new Error(`Could not persist discovered tokens: ${insertError.message}`);

  // Chunked so a large discovery set never builds an oversized query string.
  for (let i = 0; i < addresses.length; i += 200) {
    const chunk = addresses.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("tokens")
      .select("id, contract_address, pair_created_at, token_created_at")
      .in("contract_address", chunk);
    if (error) throw new Error(`Could not resolve token ids: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      map.set(row["contract_address"] as string, row["id"] as string);
    }
  }
  return map;
}

export interface TokenContext {
  tokenId: string;
  pairCreatedAt: string | null;
  tokenCreatedAt: string | null;
  history: HistoricalPoint[];
}

/** Age fallbacks + prior snapshots, used by persistence and reacceleration. */
export async function loadTokenContext(
  addresses: string[],
): Promise<Map<string, TokenContext>> {
  const out = new Map<string, TokenContext>();
  if (addresses.length === 0) return out;

  const byId = new Map<string, string>();
  for (let i = 0; i < addresses.length; i += 200) {
    const chunk = addresses.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("tokens")
      .select("id, contract_address, pair_created_at, token_created_at")
      .in("contract_address", chunk);
    if (error) throw new Error(`Could not load token context: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      const address = row["contract_address"] as string;
      const id = row["id"] as string;
      byId.set(id, address);
      out.set(address, {
        tokenId: id,
        pairCreatedAt: (row["pair_created_at"] as string | null) ?? null,
        tokenCreatedAt: (row["token_created_at"] as string | null) ?? null,
        history: [],
      });
    }
  }

  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("token_snapshots")
      .select("token_id, captured_at, market_cap, liquidity_usd, volume_1h, volume_24h, price_usd")
      .in("token_id", chunk)
      .order("captured_at", { ascending: true })
      .limit(2000);
    if (error) continue; // History is optional; signals degrade to UNKNOWN.
    for (const row of (data ?? []) as Row[]) {
      const address = byId.get(row["token_id"] as string);
      if (!address) continue;
      out.get(address)?.history.push({
        capturedAt: row["captured_at"] as string,
        marketCap: (row["market_cap"] as number | null) ?? null,
        liquidityUsd: (row["liquidity_usd"] as number | null) ?? null,
        volume1h: (row["volume_1h"] as number | null) ?? null,
        volume24h: (row["volume_24h"] as number | null) ?? null,
        priceUsd: (row["price_usd"] as number | null) ?? null,
      });
    }
  }

  return out;
}

/** Append candidate rows. Rejections are recorded, never silently dropped. */
export async function persistCandidates(
  runId: string,
  candidates: EvaluatedCandidate[],
  tokenIds: Map<string, string>,
): Promise<number> {
  const rows = candidates
    .map((c) => {
      const tokenId = tokenIds.get(c.token.contractAddress);
      if (!tokenId) return null;
      const m = c.metrics;
      return {
        scan_run_id: runId,
        token_id: tokenId,
        contract_address: c.token.contractAddress,
        chain: c.token.chain,
        stage_reached: c.stageReached,
        scanner_version: SCANNER_VERSION,
        discovery_lanes: c.lanes,
        discovery_sources: [...new Set(c.token.discovery.map((d) => d.source))],
        discovery_queries: [...new Set(c.token.discovery.map((d) => d.queryId))],
        discovery_ranks: c.token.discovery.map((d) => ({
          queryId: d.queryId,
          family: d.family,
          rank: d.rank,
        })),
        token_age_minutes: m.age.minutes,
        age_basis: m.age.basis,
        market_cap: c.token.marketCap,
        liquidity_usd: c.token.liquidityUsd,
        volume_24h: c.token.volume24h,
        volume_1h: c.token.volume1h,
        volume_to_market_cap_24h: m.volumeToMarketCap24h,
        volume_to_liquidity_24h: m.volumeToLiquidity24h,
        minutes_since_last_trade: m.minutesSinceLastTrade,
        activity_state: c.signals.activityState,
        persistence_signal: c.signals.persistenceSignal,
        reacceleration_signal: c.signals.reaccelerationSignal,
        extension_risk: c.signals.extensionRisk,
        attention_price_divergence: c.signals.attentionPriceDivergence,
        quantitative_priority: c.quantitativePriority,
        priority_components: c.priority?.components ?? null,
        priority_breakdown: c.priority ?? null,
        lane_rejections: c.laneRejections,
        extension_reasons: c.extensionReasons,
        global_rank: c.globalRank,
        lane_ranks: c.laneRanks,
        selected_by_lane_reservation: c.selectedByLaneReservation,
        selected_by_global_ranking: c.selectedByGlobalRanking,
        structural_safety: c.structuralSafety,
        token_security: c.tokenSecurity,
        history_snapshot_count: c.historySnapshotCount,
        // Recurrence is descriptive metadata only — it changes no decision.
        recurrence_state: c.recurrence?.state ?? "NEW",
        first_seen_scan_at: c.recurrence?.firstSeenScanAt ?? null,
        previous_seen_scan_at: c.recurrence?.previousSeenScanAt ?? null,
        scans_seen_count: c.recurrence?.scansSeenCount ?? 1,
        consecutive_scans_seen: c.recurrence?.consecutiveScansSeen ?? 1,
        previous_quantitative_priority: c.recurrence?.previousQuantitativePriority ?? null,
        priority_delta: c.recurrence?.priorityDelta ?? null,
        previous_setups: c.recurrence?.previousSetups ?? [],
        setup_changed: c.recurrence?.setupChanged ?? false,
        previous_selected_as_survivor: c.recurrence?.previousSelectedAsSurvivor ?? false,
        last_selected_as_survivor_at: c.recurrence?.lastSelectedAsSurvivorAt ?? null,
        refresh_state: c.refreshPlan?.state ?? c.refresh?.state ?? "REFRESH_REQUIRED",
        evidence_carried_forward: Boolean(c.evidenceCarriedForward),
        last_enriched_at: c.refreshPlan?.lastEnrichedAt ?? c.refresh?.lastEnrichedAt ?? null,
        evidence_age_minutes:
          c.refreshPlan?.evidenceAgeMinutes ?? c.refresh?.evidenceAgeMinutes ?? null,
        // Per-domain refresh plan: every evidence domain decided independently.
        refresh_domains: c.refreshPlan ? c.refreshPlan.domains : null,
        // Structural Eligibility (shadow mode): recorded, never enforced.
        structural_status: c.structural?.status ?? null,
        structural_policy_version: c.structural?.policyVersion ?? null,
        structural_detail: c.structural
          ? {
              rules: c.structural.rules,
              context: c.structural.context,
              shadowMode: c.structural.shadowMode,
            }
          : null,
        // Price / Launch Integrity (shadow): recorded for calibration only.
        price_integrity_status: c.priceIntegrity?.status ?? null,
        price_integrity_policy_version: c.priceIntegrity?.policyVersion ?? null,
        price_integrity_detail: c.priceIntegrity
          ? {
              coverage: c.priceIntegrity.coverage,
              features: c.priceIntegrity.features,
              signals: c.priceIntegrity.signals,
              reasons: c.priceIntegrity.reasons,
              shadowMode: c.priceIntegrity.shadowMode,
              evaluatedAt: c.priceIntegrity.evaluatedAt,
            }
          : null,
        // Participation Quality (shadow): descriptive, never a veto.
        participation_status: c.participation?.status ?? null,
        participation_policy_version: c.participation?.policyVersion ?? null,
        participation_detail: c.participation
          ? {
              windows: c.participation.windows,
              dimensions: c.participation.dimensions,
              subSignals: c.participation.subSignals,
              context: c.participation.context,
              signals: c.participation.signals,
              reasons: c.participation.reasons,
              holders: c.participation.holders,
              observedAt: c.participation.observedAt,
              capturedAt: c.participation.capturedAt,
              sourceReference: c.participation.sourceReference,
              evidenceMissing: c.participation.evidenceMissing,
              shadowMode: c.participation.shadowMode,
              evaluatedAt: c.participation.evaluatedAt,
            }
          : null,
        // Mandate eligibility. Never a quality or safety judgement.
        universe_eligibility: c.universe?.eligibility ?? "UNKNOWN",
        universe_category: c.universe?.category ?? null,
        universe_reason:
          c.universe && c.universe.eligibility !== "UNKNOWN" ? c.universe.reason : null,
        recurrence_detail: c.recurrence
          ? {
              missedScans: c.recurrence.missedScans,
              changeReasons: c.recurrence.changeReasons,
              refreshReason: c.refresh?.reason ?? null,
            }
          : null,
        market_cap_bucket: marketCapBucket(c.token.marketCap),
        price_usd: c.token.priceUsd,
        price_change_1h: c.token.priceChange1h,
        price_change_6h: c.token.priceChange6h,
        price_change_24h: c.token.priceChange24h,
        volume_5m: c.token.volume5m,
        volume_6h: c.token.volume6h,
        trades_5m: c.token.trades5m,
        trades_1h: c.token.trades1h,
        trades_24h: c.token.trades24h,
        buys_24h: c.token.buys24h,
        sells_24h: c.token.sells24h,
        holder_count: c.token.holderCount ?? c.token.uniqueWallets24h,
        metrics_detail: c.metrics,
        rejection_reason: c.rejection?.reason ?? null,
        rejection_details: c.rejection
          ? { detail: c.rejection.detail, values: c.rejection.values, lanes: c.laneRejections }
          : { lanes: c.laneRejections },
        enriched: c.enriched,
        // Scanner v1 produces no thesis score.
        quantitative_score: null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error, count } = await supabaseAdmin
      .from("scan_candidates")
      .insert(chunk as never, { count: "exact" });
    if (error) {
      console.error("persistCandidates chunk failed", error.message);
      continue;
    }
    inserted += count ?? chunk.length;
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// Scan recurrence history (read-only over completed runs)
// ---------------------------------------------------------------------------

export interface RecurrenceHistory {
  /** Completed run ids BEFORE the current run, newest → oldest. */
  recentRunIds: string[];
  /** Prior appearances keyed by contract address. */
  byAddress: Map<string, RecurrenceAppearance[]>;
}

/**
 * Derive recurrence inputs from EXISTING persisted scan history. Nothing here
 * writes; historical runs and candidates stay immutable.
 */
export async function loadRecurrenceHistory(
  addresses: string[],
  currentRunId: string | null,
  lookback: number = RECURRENCE_CONFIG.historyRunLookback,
): Promise<RecurrenceHistory> {
  const empty: RecurrenceHistory = { recentRunIds: [], byAddress: new Map() };
  if (addresses.length === 0) return empty;

  const { data: runRows, error: runError } = await supabaseAdmin
    .from("scan_runs")
    .select("id, started_at, completed_at")
    .eq("status", "completed")
    // Absence semantics are defined by `countsAsAbsenceObservation` in
    // ./discovery-health: only a completed run with a real discovered universe
    // is evidence a token was absent. A VALID_EMPTY run (all queries succeeded,
    // whole universe empty) and a provider-unavailable run are both excluded
    // here on purpose — this filter IS that rule, not a side effect.
    .gt("tokens_discovered", 0)
    .order("completed_at", { ascending: false })
    .limit(lookback);
  if (runError) return empty;

  const runs = ((runRows ?? []) as Row[])
    .filter((r) => (r["id"] as string) !== currentRunId)
    .map((r) => ({
      id: r["id"] as string,
      at: ((r["completed_at"] as string | null) ?? (r["started_at"] as string)) as string,
    }));
  if (runs.length === 0) return empty;

  const runAt = new Map(runs.map((r) => [r.id, r.at]));
  const runIds = runs.map((r) => r.id);
  const byAddress = new Map<string, RecurrenceAppearance[]>();

  // The Data API caps a single response at 1000 rows. A wide address chunk
  // across 25 completed runs blows straight past that cap, and the truncated
  // tail silently reads as "never seen before" — every affected token then
  // persists as NEW forever. Chunks stay small AND every chunk is paginated.
  const PAGE = 1000;
  for (let i = 0; i < addresses.length; i += 25) {
    const chunk = addresses.slice(i, i + 25);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabaseAdmin
        .from("scan_candidates")
        .select(
          "scan_run_id, contract_address, discovery_lanes, quantitative_priority, activity_state, persistence_signal, reacceleration_signal, selected_by_lane_reservation, selected_by_global_ranking, enriched",
        )
        .in("scan_run_id", runIds)
        .in("contract_address", chunk)
        .range(offset, offset + PAGE - 1);
      if (error) break; // History is optional; candidates degrade to NEW.

      const rows = (data ?? []) as Row[];
      for (const row of rows) {
        const address = row["contract_address"] as string | null;
        const runId = row["scan_run_id"] as string;
        if (!address || !runAt.has(runId)) continue;
        const entry: RecurrenceAppearance = {
          runId,
          runAt: runAt.get(runId)!,
          setups: (row["discovery_lanes"] as string[] | null) ?? [],
          quantitativePriority: (row["quantitative_priority"] as number | null) ?? null,
          activityState: (row["activity_state"] as string | null) ?? null,
          persistenceSignal: (row["persistence_signal"] as string | null) ?? null,
          reaccelerationSignal: (row["reacceleration_signal"] as string | null) ?? null,
          selectedAsSurvivor:
            Boolean(row["selected_by_lane_reservation"]) ||
            Boolean(row["selected_by_global_ranking"]) ||
            Boolean(row["enriched"]),
        };
        const list = byAddress.get(address);
        if (list) list.push(entry);
        else byAddress.set(address, [entry]);
      }
      if (rows.length < PAGE) break;
    }
  }


  return { recentRunIds: runIds, byAddress };
}

/**
 * Newest stored observation timestamp per evidence domain, per token.
 *
 * Freshness is evaluated INDEPENDENTLY per domain, so a stale market
 * observation can never invalidate still-valid holder/creator/provenance
 * evidence. Timestamps are read as stored and never rewritten.
 */
export async function loadEvidenceDomainAges(
  tokenIds: string[],
): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  if (tokenIds.length === 0) return out;

  for (let i = 0; i < tokenIds.length; i += 100) {
    const chunk = tokenIds.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("evidence_observations")
      .select("token_id, domain, captured_at")
      .in("token_id", chunk)
      .order("captured_at", { ascending: false })
      .limit(5000);
    if (error) continue; // Absent evidence stays NO_EVIDENCE, never fabricated.
    for (const row of (data ?? []) as Row[]) {
      const tokenId = row["token_id"] as string;
      const domain = row["domain"] as string;
      const capturedAt = row["captured_at"] as string;
      const current = out.get(tokenId) ?? {};
      // Rows arrive newest-first; keep the first timestamp seen per domain.
      if (!current[domain]) {
        current[domain] = capturedAt;
        out.set(tokenId, current);
      }
    }
  }

  return out;
}

/**
 * Record how discovery actually behaved on this run. Diagnostic only: nothing
 * reads it back into scoring, setups or selection.
 */
export async function recordDiscoveryHealth(
  runId: string,
  health: {
    state: string;
    queries: number;
    successes: number;
    failures: number;
    tokens: number;
    failureMessages: string[];
    reason: string | null;
  },
): Promise<void> {
  await supabaseAdmin
    .from("scan_runs")
    .update({
      discovery_health: health.state,
      discovery_health_detail: {
        version: "discovery_health/v1",
        queries: health.queries,
        successes: health.successes,
        failures: health.failures,
        tokens: health.tokens,
        failureMessages: health.failureMessages,
        reason: health.reason,
      },
    } as never)
    .eq("id", runId);
}
