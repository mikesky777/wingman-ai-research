/**
 * Independent outcome sampler (server-only, service-role).
 *
 * `outcome_sampler/v1`. Scheduled collection of exact-mint market
 * observations, fully decoupled from History / Calibration page activity.
 *
 * Invariants:
 *   - One canonical MARKET OBSERVATION per exact mint per collection window,
 *     reused by every decision event for that mint. Event-level outcomes are
 *     derived later, each against its own frozen baseline.
 *   - A provider failure is recorded as a COLLECTION state. It never writes a
 *     market value, never zeroes anything, never marks a horizon measured and
 *     never rewrites a baseline.
 *   - Evaluation-only. No scanner / triage / research / thesis / entry /
 *     sizing module may import this file.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DexScreenerAdapter, isValidSolanaAddress } from "../external/dexscreener";
import { ExternalDataError } from "../external/dexscreener/errors";
import { selectPrimaryPair } from "../external/dexscreener/pair-selection";
import { normalizeIdentity, normalizeSnapshot } from "../external/dexscreener/normalizer";
import type { DsPair } from "../external/dexscreener/types";
import { insertSnapshot, upsertTokenIdentity } from "../ingestion.server";
import { isPersistableObservation } from "../market-refresh";
import { refreshOutcomes } from "./outcome-persistence.server";
import {
  OUTCOME_SAMPLER_VERSION,
  SAMPLER_BATCH_SIZE,
  SAMPLER_MAX_BATCHES_PER_RUN,
  batchMints,
  coverageStatusFor,
  emptyHealth,
  isTracked,
  nextEligibleAfterFailure,
  nextEligibleAfterSuccess,
  observationWindowKey,
  samplerWindowKey,
  selectDueMints,
  type SamplerHealth,
  type TrackingState,
} from "./sampler";

type Row = Record<string, unknown>;

const PAGE = 1000;

async function fetchAllPages(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

export interface SamplerRunResult {
  ok: boolean;
  skipped: "ALREADY_RUNNING" | null;
  samplerVersion: string;
  runId: string | null;
  windowKey: string;
  mintsTracked: number;
  mintsDue: number;
  mintsRefreshed: number;
  mintsDelayed: number;
  batchesSent: number;
  rateLimitedCount: number;
  providerErrorCount: number;
  observationsPersisted: number;
  message: string | null;
}

/**
 * Mirror every frozen decision baseline into the tracking table. Repeated
 * decision events for the same exact mint collapse into ONE tracked mint, so
 * they can never cause duplicate provider requests.
 */
export async function syncTrackingFromBaselines(nowIso = new Date().toISOString()): Promise<number> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("token_stage_milestones")
      .select("token_id, contract_address, chain, first_entered_at")
      .order("contract_address", { ascending: true })
      .range(from, to),
  );

  interface Agg {
    tokenId: string | null;
    chain: string;
    earliest: string;
    latest: string;
    count: number;
  }
  const byMint = new Map<string, Agg>();
  for (const row of rows) {
    const mint = (row["contract_address"] as string | null)?.trim();
    const at = row["first_entered_at"] as string | null;
    if (!mint || !at) continue;
    const current = byMint.get(mint);
    if (!current) {
      byMint.set(mint, {
        tokenId: (row["token_id"] as string | null) ?? null,
        chain: (row["chain"] as string | null) ?? "solana",
        earliest: at,
        latest: at,
        count: 1,
      });
      continue;
    }
    current.count += 1;
    if (at < current.earliest) current.earliest = at;
    if (at > current.latest) current.latest = at;
  }

  const payload = [...byMint.entries()].map(([mint, agg]) => ({
    contract_address: mint,
    chain: agg.chain,
    token_id: agg.tokenId,
    tracking_version: OUTCOME_SAMPLER_VERSION,
    earliest_baseline_at: agg.earliest,
    latest_baseline_at: agg.latest,
    baseline_event_count: agg.count,
  }));

  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("outcome_tracking")
      .upsert(chunk, { onConflict: "contract_address", ignoreDuplicates: false });
    if (error) throw new Error(`Tracking sync failed: ${error.message}`);
  }
  void nowIso;
  return payload.length;
}

async function loadTrackingStates(): Promise<(TrackingState & { lastErrorCode: string | null })[]> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("outcome_tracking")
      .select(
        "contract_address, latest_baseline_at, last_attempt_at, last_success_at, last_observed_at, next_eligible_at, consecutive_failures, priority_requested_at, last_error_code",
      )
      .order("contract_address", { ascending: true })
      .range(from, to),
  );
  return rows.map((row) => ({
    contractAddress: row["contract_address"] as string,
    latestBaselineAt: (row["latest_baseline_at"] as string | null) ?? null,
    lastAttemptAt: (row["last_attempt_at"] as string | null) ?? null,
    lastSuccessAt: (row["last_success_at"] as string | null) ?? null,
    nextEligibleAt: (row["next_eligible_at"] as string | null) ?? null,
    consecutiveFailures: (row["consecutive_failures"] as number | null) ?? 0,
    priorityRequestedAt: (row["priority_requested_at"] as string | null) ?? null,
    lastErrorCode: (row["last_error_code"] as string | null) ?? null,
  }));
}

/**
 * Window lease. The window key is derived from the clock, so two concurrent
 * workers in the same window collide on the unique key and only one proceeds.
 */
async function acquireRun(
  windowKey: string,
  trigger: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("outcome_sampler_runs")
    .insert({
      sampler_version: OUTCOME_SAMPLER_VERSION,
      window_key: windowKey,
      trigger_source: trigger,
      status: "RUNNING",
    })
    .select("id")
    .maybeSingle();
  if (error) return null;
  return (data as { id: string } | null) ?? null;
}

export interface SamplerRunOptions {
  trigger?: "SCHEDULED" | "MANUAL" | "PRIORITY";
  /** Restrict this pass to specific exact mints (still staleness-gated). */
  mints?: string[];
  maxBatches?: number;
  nowIso?: string;
}

export async function runOutcomeSampler(
  options: SamplerRunOptions = {},
): Promise<SamplerRunResult> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const trigger = options.trigger ?? "SCHEDULED";
  const windowKey =
    trigger === "SCHEDULED"
      ? samplerWindowKey(nowIso)
      : `${samplerWindowKey(nowIso)}:${trigger.toLowerCase()}`;

  const base: SamplerRunResult = {
    ok: true,
    skipped: null,
    samplerVersion: OUTCOME_SAMPLER_VERSION,
    runId: null,
    windowKey,
    mintsTracked: 0,
    mintsDue: 0,
    mintsRefreshed: 0,
    mintsDelayed: 0,
    batchesSent: 0,
    rateLimitedCount: 0,
    providerErrorCount: 0,
    observationsPersisted: 0,
    message: null,
  };

  const run = await acquireRun(windowKey, trigger);
  if (!run) {
    return { ...base, ok: true, skipped: "ALREADY_RUNNING", message: "Sampling window already claimed." };
  }
  base.runId = run.id;

  try {
    await syncTrackingFromBaselines(nowIso);
    const states = await loadTrackingStates();
    const tracked = states.filter((state) => isTracked(state, nowIso));
    const restrict = options.mints ? new Set(options.mints.map((m) => m.trim())) : null;
    const eligible = restrict
      ? tracked.filter((state) => restrict.has(state.contractAddress))
      : tracked;

    const maxBatches = Math.max(1, Math.min(options.maxBatches ?? SAMPLER_MAX_BATCHES_PER_RUN, SAMPLER_MAX_BATCHES_PER_RUN));
    const due = selectDueMints(eligible, nowIso, maxBatches * SAMPLER_BATCH_SIZE).filter(
      isValidSolanaAddress,
    );

    base.mintsTracked = tracked.length;
    base.mintsDue = due.length;

    const stateByMint = new Map(eligible.map((state) => [state.contractAddress, state]));
    const batches = batchMints(due);

    for (const [index, batch] of batches.entries()) {
      const requestedAt = new Date().toISOString();
      const batchId = `${windowKey}#${index}`;
      let pairs: DsPair[] = [];
      let errorCode: string | null = null;
      let retryAfter: number | null = null;

      try {
        pairs = await DexScreenerAdapter.getPairsForTokens(batch);
      } catch (error) {
        errorCode = error instanceof ExternalDataError ? error.code : "PROVIDER_FAILED";
        retryAfter = error instanceof ExternalDataError ? error.retryAfterSeconds : null;
        if (errorCode === "RATE_LIMITED") base.rateLimitedCount += 1;
        else base.providerErrorCount += 1;
      }

      base.batchesSent += 1;

      const observed: { refreshed: string[]; persisted: number } = errorCode
        ? { refreshed: [], persisted: 0 }
        : await persistBatchObservations(batch, pairs, stateByMint, nowIso, run.id);

      base.observationsPersisted += observed.persisted;
      base.mintsRefreshed += observed.refreshed.length;

      const failedMints = errorCode ? batch : batch.filter((m) => !observed.refreshed.includes(m));
      base.mintsDelayed += failedMints.length;
      await markFailures(failedMints, stateByMint, errorCode ?? "NO_ELIGIBLE_PAIR", retryAfter, nowIso, run.id);

      await supabaseAdmin.from("market_observation_attempts").insert({
        run_id: run.id,
        provider: "dexscreener",
        batch_id: batchId,
        batch_index: index,
        contract_addresses: batch,
        requested_at: requestedAt,
        completed_at: new Date().toISOString(),
        success: errorCode === null,
        error_code: errorCode,
        retry_after_seconds: retryAfter,
        observation_count: observed.refreshed.length,
      });
    }

    const oldestStale = tracked
      .map((state) => state.lastSuccessAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;

    await supabaseAdmin
      .from("outcome_sampler_runs")
      .update({
        status: "COMPLETED",
        finished_at: new Date().toISOString(),
        mints_tracked: base.mintsTracked,
        mints_due: base.mintsDue,
        mints_refreshed: base.mintsRefreshed,
        mints_delayed: base.mintsDelayed,
        batches_sent: base.batchesSent,
        rate_limited_count: base.rateLimitedCount,
        provider_error_count: base.providerErrorCount,
        observations_persisted: base.observationsPersisted,
        oldest_stale_observation_at: oldestStale,
      })
      .eq("id", run.id);

    return base;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sampler run failed.";
    await supabaseAdmin
      .from("outcome_sampler_runs")
      .update({ status: "FAILED", finished_at: new Date().toISOString(), error: message })
      .eq("id", run.id);
    return { ...base, ok: false, message };
  }
}

/**
 * Persist at most one canonical observation per exact mint per window, then
 * refresh DERIVED event metrics only. Baselines stay frozen.
 */
async function persistBatchObservations(
  batch: string[],
  pairs: DsPair[],
  stateByMint: Map<string, TrackingState>,
  nowIso: string,
  runId: string,
): Promise<{ refreshed: string[]; persisted: number }> {
  const refreshed: string[] = [];
  const tokenIds: string[] = [];
  const addressByTokenId = new Map<string, string>();
  let persisted = 0;
  const windowStart = observationWindowKey(nowIso);

  for (const mint of batch) {
    const selection = selectPrimaryPair(pairs, mint);
    if (!selection) continue;
    const snapshot = normalizeSnapshot(selection.primary);
    if (!isPersistableObservation(snapshot)) continue;

    refreshed.push(mint);

    const state = stateByMint.get(mint);
    // Canonical bucket guard: one observation per mint per collection window.
    if (state?.lastSuccessAt && state.lastSuccessAt >= windowStart) {
      await touchSuccess(mint, state, nowIso, runId, state.lastSuccessAt);
      continue;
    }

    try {
      const identity = normalizeIdentity(selection.primary, mint);
      const token = await upsertTokenIdentity(identity);
      const inserted = await insertSnapshot(token.id, snapshot);
      persisted += 1;
      tokenIds.push(token.id);
      addressByTokenId.set(token.id, mint);
      await touchSuccess(mint, state, nowIso, runId, inserted.capturedAt);
    } catch (error) {
      console.error("outcome sampler persistence failed", mint, error);
    }
  }

  if (tokenIds.length > 0) {
    // Derived event metrics only — insert-once baselines are untouched.
    await refreshOutcomes(tokenIds, addressByTokenId);
  }

  return { refreshed, persisted };
}

async function touchSuccess(
  mint: string,
  state: TrackingState | undefined,
  nowIso: string,
  runId: string,
  observedAt: string,
): Promise<void> {
  const nextState: TrackingState = state ?? {
    contractAddress: mint,
    latestBaselineAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextEligibleAt: null,
    consecutiveFailures: 0,
  };
  const updated = { ...nextState, lastSuccessAt: observedAt, consecutiveFailures: 0 };
  await supabaseAdmin
    .from("outcome_tracking")
    .update({
      last_attempt_at: nowIso,
      last_success_at: observedAt,
      last_observed_at: observedAt,
      next_eligible_at: nextEligibleAfterSuccess(updated, nowIso),
      consecutive_failures: 0,
      coverage_status: coverageStatusFor({ ...updated, lastErrorCode: null }, nowIso),
      provider_health: "HEALTHY",
      last_error_code: null,
      last_retry_after_seconds: null,
      last_run_id: runId,
      priority_requested_at: null,
    })
    .eq("contract_address", mint);
  if (state) {
    state.lastSuccessAt = observedAt;
    state.consecutiveFailures = 0;
  }
}

/**
 * Failure bookkeeping. Prior observations are kept as-is; nothing is zeroed
 * and no horizon is marked measured.
 */
async function markFailures(
  mints: string[],
  stateByMint: Map<string, TrackingState>,
  errorCode: string,
  retryAfterSeconds: number | null,
  nowIso: string,
  runId: string,
): Promise<void> {
  for (const mint of mints) {
    const state = stateByMint.get(mint);
    const failures = (state?.consecutiveFailures ?? 0) + 1;
    const merged = {
      contractAddress: mint,
      latestBaselineAt: state?.latestBaselineAt ?? null,
      lastAttemptAt: nowIso,
      lastSuccessAt: state?.lastSuccessAt ?? null,
      nextEligibleAt: state?.nextEligibleAt ?? null,
      consecutiveFailures: failures,
      lastErrorCode: errorCode,
    };
    await supabaseAdmin
      .from("outcome_tracking")
      .update({
        last_attempt_at: nowIso,
        next_eligible_at: nextEligibleAfterFailure(failures, retryAfterSeconds, nowIso),
        consecutive_failures: failures,
        coverage_status: coverageStatusFor(merged, nowIso),
        provider_health: errorCode === "RATE_LIMITED" ? "RATE_LIMITED" : "UNAVAILABLE",
        last_error_code: errorCode,
        last_retry_after_seconds: retryAfterSeconds,
        last_run_id: runId,
      })
      .eq("contract_address", mint);
    if (state) state.consecutiveFailures = failures;
  }
}

/** Mark exact mints for prioritized collection on the next sampler pass. */
export async function requestPrioritySampling(mints: string[]): Promise<number> {
  const unique = [...new Set(mints.map((m) => m.trim()))].filter(isValidSolanaAddress);
  if (unique.length === 0) return 0;
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("outcome_tracking")
    .update({ priority_requested_at: nowIso, next_eligible_at: nowIso })
    .in("contract_address", unique);
  if (error) throw new Error(`Priority request failed: ${error.message}`);
  return unique.length;
}

export async function getSamplerHealth(): Promise<SamplerHealth> {
  const health = emptyHealth();
  const nowIso = new Date().toISOString();

  const { data: runs } = await supabaseAdmin
    .from("outcome_sampler_runs")
    .select(
      "started_at, finished_at, status, mints_tracked, mints_due, mints_refreshed, mints_delayed, batches_sent, rate_limited_count, provider_error_count, oldest_stale_observation_at",
    )
    .order("started_at", { ascending: false })
    .limit(20);

  const rows = (runs ?? []) as Row[];
  const last = rows[0];
  if (last) {
    health.lastRunAt = (last["started_at"] as string | null) ?? null;
    health.mintsDue = (last["mints_due"] as number | null) ?? 0;
    health.mintsRefreshed = (last["mints_refreshed"] as number | null) ?? 0;
    health.mintsDelayed = (last["mints_delayed"] as number | null) ?? 0;
    health.batchesSent = (last["batches_sent"] as number | null) ?? 0;
    health.rateLimitedCount = (last["rate_limited_count"] as number | null) ?? 0;
    health.providerErrorCount = (last["provider_error_count"] as number | null) ?? 0;
    health.oldestStaleObservationAt = (last["oldest_stale_observation_at"] as string | null) ?? null;
  }
  health.lastSuccessfulRunAt =
    (rows.find((row) => row["status"] === "COMPLETED")?.["finished_at"] as string | null) ?? null;

  const states = await loadTrackingStates();
  health.mintsTracked = states.filter((state) => isTracked(state, nowIso)).length;
  return health;
}
