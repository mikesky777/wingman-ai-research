/**
 * Live lifecycle persistence (server-only) — `live_lifecycle/v2`.
 *
 * History is an append-only ledger; Live status is a CURRENT read model.
 *
 * This module:
 *   - keeps one mutable monitoring record per immutable production
 *     THESIS_CALL (ACTIVE / RESEARCH_DUE / INACTIVE / INVALIDATED),
 *   - appends LIVE_ACTIVATED / LIVE_DEACTIVATED only on real OFF→ON / ON→OFF
 *     transitions,
 *   - never modifies or deletes a THESIS_CALL, an Entry evaluation or a
 *     previously appended lifecycle event.
 *
 * No trade execution, wallets, signing or order routing exist anywhere here.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeSetups } from "../history/setup-filter";
import {
  LIVE_LIFECYCLE_VERSION,
  assessLiveCall,
  currentEpisode,
  decideTransition,
  dedupeByMint,
  deriveEpisodes,
  requiresFreshTimingAfter,
  type LiveAssessment,
  type LiveEpisode,
  type LiveLifecycleEvent,
  type MonitoringStatus,
  type OperationalStatus,
} from "./lifecycle";
import { deriveStageOutcome, type StageOutcomeResult } from "../history/stage-outcomes";

type Row = Record<string, unknown>;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Liquidity below this means the market cannot realistically be traded. */
const INVALID_MARKET_LIQUIDITY_USD = 100;

export interface ThesisCallLifecycle {
  thesisCallMilestoneId: string;
  tokenId: string | null;
  mint: string;
  /** Qualifying setups frozen on the exact THESIS_CALL milestone. */
  setups: string[] | null;
  symbol: string | null;
  name: string | null;
  calledAt: string;
  monitoringStatus: MonitoringStatus;
  monitoringReason: string | null;
  monitoringStatusChangedAt: string | null;
  requiresFreshEntryAfter: string | null;
  assessment: LiveAssessment;
  isLive: boolean;
  currentEpisode: LiveEpisode | null;
  episodes: LiveEpisode[];
  entry: {
    evaluationId: string | null;
    state: string | null;
    evaluatedAt: string | null;
    timingResolution: string | null;
    priceHistorySource: string | null;
    isPreGateDiagnostic: boolean;
  };
  operational: { status: OperationalStatus; reason: string };
  market: {
    marketCap: number | null;
    liquidityUsd: number | null;
    priceUsd: number | null;
    observedAt: string | null;
  };
}

interface LoadedContext {
  calls: ThesisCallLifecycle[];
  eventsByCall: Map<string, LiveLifecycleEvent[]>;
}

function assessOperational(input: {
  liquidityUsd: number | null;
  entryState: string | null;
}): { status: OperationalStatus; reason: string } {
  if (input.liquidityUsd != null && input.liquidityUsd < INVALID_MARKET_LIQUIDITY_USD) {
    return {
      status: "BLOCKED",
      reason: `Current liquidity $${Math.round(input.liquidityUsd)} is below the $${INVALID_MARKET_LIQUIDITY_USD} valid-market floor.`,
    };
  }
  if (input.entryState === "BROKEN") {
    return { status: "BLOCKED", reason: "Latest Entry evaluation is BROKEN." };
  }
  if (input.liquidityUsd == null && input.entryState == null) {
    return { status: "UNKNOWN", reason: "No current market or entry observation available." };
  }
  return { status: "OPERATIONAL", reason: "No current liquidity or entry blockers observed." };
}

function mapEvent(r: Row): LiveLifecycleEvent {
  return {
    id: r["id"] as string,
    eventType: r["event_type"] as LiveLifecycleEvent["eventType"],
    occurredAt: r["occurred_at"] as string,
    thesisCallMilestoneId: r["thesis_call_milestone_id"] as string,
    tokenId: (r["token_id"] as string | null) ?? null,
    mint: r["mint"] as string,
    episodeNumber: num(r["episode_number"]),
    entryState: (r["entry_state"] as string | null) ?? null,
    entryEvaluatedAt: (r["entry_evaluated_at"] as string | null) ?? null,
    timingResolution: (r["timing_resolution"] as string | null) ?? null,
    priceHistorySource: (r["price_history_source"] as string | null) ?? null,
    marketCapAtEvent: num(r["market_cap_at_event"]),
    liquidityAtEvent: num(r["liquidity_at_event"]),
    priceUsdAtEvent: num(r["price_usd_at_event"]),
    monitoringStatus: (r["monitoring_status"] as string | null) ?? null,
    reasonCode: (r["reason_code"] as string | null) ?? null,
    reason: (r["reason"] as string | null) ?? null,
  };
}

/** Reads the full lifecycle state. Pure read — never writes. */
async function loadContext(): Promise<LoadedContext> {
  const { data: milestoneRows, error } = await supabaseAdmin
    .from("token_stage_milestones")
    .select("id, token_id, contract_address, first_entered_at, setup_at_entry")
    .eq("stage", "THESIS_CALL")
    .order("first_entered_at", { ascending: false });
  if (error) throw new Error(error.message);

  const milestones = (milestoneRows as Row[]) ?? [];
  if (milestones.length === 0) return { calls: [], eventsByCall: new Map() };

  const tokenIds = [...new Set(milestones.map((m) => m["token_id"] as string).filter(Boolean))];
  const mints = [
    ...new Set(milestones.map((m) => m["contract_address"] as string).filter(Boolean)),
  ];

  const [tokensRes, entryRes, snapshotRes, monitoringRes, eventsRes] = await Promise.all([
    supabaseAdmin.from("tokens").select("id, contract_address, symbol, name").in("id", tokenIds),
    supabaseAdmin
      .from("entry_state_evaluations")
      .select("id, mint, state, evaluated_at, timing_resolution, price_history_source")
      .in("mint", mints)
      .eq("is_calibration", false)
      .order("evaluated_at", { ascending: false }),
    supabaseAdmin
      .from("token_snapshots")
      .select("token_id, market_cap, liquidity_usd, price_usd, captured_at")
      .in("token_id", tokenIds)
      .order("captured_at", { ascending: false }),
    supabaseAdmin.from("thesis_call_monitoring").select("*").in("mint", mints),
    supabaseAdmin
      .from("live_call_events")
      .select("*")
      .in("mint", mints)
      .order("occurred_at", { ascending: true }),
  ]);
  for (const res of [tokensRes, entryRes, snapshotRes, monitoringRes, eventsRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const tokenById = new Map<string, Row>();
  for (const t of (tokensRes.data as Row[]) ?? []) tokenById.set(t["id"] as string, t);

  const entryByMint = new Map<string, Row>();
  for (const r of (entryRes.data as Row[]) ?? []) {
    const mint = r["mint"] as string;
    if (!entryByMint.has(mint)) entryByMint.set(mint, r);
  }

  const snapshotByTokenId = new Map<string, Row>();
  for (const r of (snapshotRes.data as Row[]) ?? []) {
    const id = r["token_id"] as string;
    if (!snapshotByTokenId.has(id)) snapshotByTokenId.set(id, r);
  }

  const monitoringByCall = new Map<string, Row>();
  for (const r of (monitoringRes.data as Row[]) ?? []) {
    monitoringByCall.set(r["thesis_call_milestone_id"] as string, r);
  }

  const eventsByCall = new Map<string, LiveLifecycleEvent[]>();
  for (const r of (eventsRes.data as Row[]) ?? []) {
    const event = mapEvent(r);
    const list = eventsByCall.get(event.thesisCallMilestoneId) ?? [];
    list.push(event);
    eventsByCall.set(event.thesisCallMilestoneId, list);
  }

  const calls: ThesisCallLifecycle[] = milestones.map((m) => {
    const milestoneId = m["id"] as string;
    const tokenId = (m["token_id"] as string | null) ?? null;
    const token = tokenId ? tokenById.get(tokenId) : undefined;
    const mint =
      (m["contract_address"] as string) ?? (token?.["contract_address"] as string) ?? "";
    const calledAt = m["first_entered_at"] as string;
    const entry = entryByMint.get(mint) ?? null;
    const snapshot = tokenId ? (snapshotByTokenId.get(tokenId) ?? null) : null;
    const monitoring = monitoringByCall.get(milestoneId) ?? null;

    const entryEvaluatedAt = (entry?.["evaluated_at"] as string | null) ?? null;
    // Any evaluation produced before the call existed is a pre-gate
    // diagnostic and can never create a Live activation.
    const isPreGateDiagnostic =
      !!entryEvaluatedAt && Date.parse(entryEvaluatedAt) < Date.parse(calledAt);
    const entryState = (entry?.["state"] as string | null) ?? null;
    const liquidityUsd = snapshot ? num(snapshot["liquidity_usd"]) : null;
    const operational = assessOperational({ liquidityUsd, entryState });
    const monitoringStatus = ((monitoring?.["status"] as string) ?? "ACTIVE") as MonitoringStatus;
    const requiresFreshEntryAfter =
      (monitoring?.["requires_fresh_entry_after"] as string | null) ?? null;

    const assessment = assessLiveCall({
      hasProductionThesisCall: true,
      monitoringStatus,
      operationalStatus: operational.status,
      operationalReason: operational.reason,
      entryState,
      entryEvaluatedAt,
      timingResolution: (entry?.["timing_resolution"] as string | null) ?? null,
      priceHistorySource: (entry?.["price_history_source"] as string | null) ?? null,
      requiresFreshEntryAfter,
      entryIsPreGateDiagnostic: isPreGateDiagnostic,
    });

    const events = eventsByCall.get(milestoneId) ?? [];
    const open = currentEpisode(events);

    return {
      thesisCallMilestoneId: milestoneId,
      tokenId,
      mint,
      setups: normalizeSetups(m["setup_at_entry"] as string | null),
      symbol: (token?.["symbol"] as string | null) ?? null,
      name: (token?.["name"] as string | null) ?? null,
      calledAt,
      monitoringStatus,
      monitoringReason: (monitoring?.["status_reason"] as string | null) ?? null,
      monitoringStatusChangedAt: (monitoring?.["status_changed_at"] as string | null) ?? null,
      requiresFreshEntryAfter,
      assessment,
      isLive: open != null,
      currentEpisode: open,
      episodes: deriveEpisodes(events),
      entry: {
        evaluationId: (entry?.["id"] as string | null) ?? null,
        state: entryState,
        evaluatedAt: entryEvaluatedAt,
        timingResolution: (entry?.["timing_resolution"] as string | null) ?? null,
        priceHistorySource: (entry?.["price_history_source"] as string | null) ?? null,
        isPreGateDiagnostic,
      },
      operational,
      market: {
        marketCap: snapshot ? num(snapshot["market_cap"]) : null,
        liquidityUsd,
        priceUsd: snapshot ? num(snapshot["price_usd"]) : null,
        observedAt: (snapshot?.["captured_at"] as string | null) ?? null,
      },
    };
  });

  return { calls, eventsByCall };
}

export interface LiveReconcileResult {
  policyVersion: string;
  thesisCalls: number;
  activated: number;
  deactivated: number;
  unchanged: number;
  liveNow: number;
  details: {
    mint: string;
    transition: "ACTIVATE" | "DEACTIVATE" | "NONE";
    reasonCode: string;
    reason: string;
  }[];
}

/**
 * Applies transitions to the append-only ledger. Idempotent: repeated
 * BUY_ZONE evaluations inside one Live episode append nothing.
 */
export async function reconcileLiveLifecycle(): Promise<LiveReconcileResult> {
  const { calls, eventsByCall } = await loadContext();
  const result: LiveReconcileResult = {
    policyVersion: LIVE_LIFECYCLE_VERSION,
    thesisCalls: calls.length,
    activated: 0,
    deactivated: 0,
    unchanged: 0,
    liveNow: 0,
    details: [],
  };

  for (const call of calls) {
    await ensureMonitoringRecord(call);
    const events = eventsByCall.get(call.thesisCallMilestoneId) ?? [];
    const open = currentEpisode(events);
    const transition = decideTransition(open != null, call.assessment);
    result.details.push({
      mint: call.mint,
      transition,
      reasonCode: call.assessment.reasonCode,
      reason: call.assessment.reason,
    });

    if (transition === "NONE") {
      result.unchanged += 1;
      if (open) result.liveNow += 1;
      continue;
    }

    const now = new Date().toISOString();
    if (transition === "ACTIVATE") {
      const episodeNumber = deriveEpisodes(events).length + 1;
      await appendEvent({
        call,
        eventType: "LIVE_ACTIVATED",
        occurredAt: now,
        episodeNumber,
        reasonCode: "LIVE_CONDITIONS_MET",
        reason: call.assessment.reason,
      });
      result.activated += 1;
      result.liveNow += 1;
      continue;
    }

    await appendEvent({
      call,
      eventType: "LIVE_DEACTIVATED",
      occurredAt: now,
      episodeNumber: open?.episodeNumber ?? null,
      reasonCode: call.assessment.reasonCode,
      reason: call.assessment.reason,
    });
    result.deactivated += 1;

    // Rule 5: an operational interruption requires fresh timing evidence
    // before the same call may ever go Live again.
    if (requiresFreshTimingAfter(call.assessment.reasonCode)) {
      await supabaseAdmin
        .from("thesis_call_monitoring")
        .update({ requires_fresh_entry_after: now })
        .eq("thesis_call_milestone_id", call.thesisCallMilestoneId);
    }
  }

  return result;
}

async function ensureMonitoringRecord(call: ThesisCallLifecycle): Promise<void> {
  // New valid Thesis Calls begin ACTIVE. No automatic age cutoff exists.
  const { error } = await supabaseAdmin.from("thesis_call_monitoring").upsert(
    {
      thesis_call_milestone_id: call.thesisCallMilestoneId,
      token_id: call.tokenId,
      mint: call.mint,
      last_reconciled_at: new Date().toISOString(),
      policy_version: LIVE_LIFECYCLE_VERSION,
    },
    { onConflict: "thesis_call_milestone_id", ignoreDuplicates: false },
  );
  if (error) throw new Error(error.message);
}

async function appendEvent(args: {
  call: ThesisCallLifecycle;
  eventType: "LIVE_ACTIVATED" | "LIVE_DEACTIVATED" | "MONITORING_STATUS_CHANGED";
  occurredAt: string;
  episodeNumber: number | null;
  reasonCode: string;
  reason: string;
  monitoringStatus?: MonitoringStatus;
}): Promise<void> {
  const { call } = args;
  const { error } = await supabaseAdmin.from("live_call_events").insert({
    event_type: args.eventType,
    occurred_at: args.occurredAt,
    thesis_call_milestone_id: call.thesisCallMilestoneId,
    token_id: call.tokenId,
    mint: call.mint,
    episode_number: args.episodeNumber,
    entry_evaluation_id: call.entry.evaluationId,
    entry_state: call.entry.state,
    entry_evaluated_at: call.entry.evaluatedAt,
    timing_resolution: call.entry.timingResolution,
    price_history_source: call.entry.priceHistorySource,
    market_cap_at_event: call.market.marketCap,
    liquidity_at_event: call.market.liquidityUsd,
    price_usd_at_event: call.market.priceUsd,
    market_observed_at: call.market.observedAt,
    monitoring_status: args.monitoringStatus ?? call.monitoringStatus,
    reason_code: args.reasonCode,
    reason: args.reason,
    policy_version: LIVE_LIFECYCLE_VERSION,
  });
  if (error) throw new Error(error.message);
}

/**
 * Explicit monitoring-status change. The Thesis Call itself is never touched;
 * the change is appended to the ledger and reflected in current state.
 */
export async function setMonitoringStatus(input: {
  thesisCallMilestoneId: string;
  status: MonitoringStatus;
  reasonCode?: string | null;
  reason?: string | null;
}): Promise<{ ok: true; status: MonitoringStatus } | { ok: false; error: string }> {
  if (input.status === "INVALIDATED" && !input.reason?.trim()) {
    return { ok: false, error: "INVALIDATED requires an explicit supported reason." };
  }
  const { calls } = await loadContext();
  const call = calls.find((c) => c.thesisCallMilestoneId === input.thesisCallMilestoneId);
  if (!call) return { ok: false, error: "Thesis Call not found." };
  if (call.monitoringStatus === input.status) return { ok: true, status: input.status };

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("thesis_call_monitoring").upsert(
    {
      thesis_call_milestone_id: call.thesisCallMilestoneId,
      token_id: call.tokenId,
      mint: call.mint,
      status: input.status,
      status_reason_code: input.reasonCode ?? null,
      status_reason: input.reason ?? null,
      status_changed_at: now,
      policy_version: LIVE_LIFECYCLE_VERSION,
    },
    { onConflict: "thesis_call_milestone_id" },
  );
  if (error) return { ok: false, error: error.message };

  await appendEvent({
    call,
    eventType: "MONITORING_STATUS_CHANGED",
    occurredAt: now,
    episodeNumber: call.currentEpisode?.episodeNumber ?? null,
    reasonCode: input.reasonCode ?? `MONITORING_${input.status}`,
    reason: input.reason ?? `Monitoring status set to ${input.status}.`,
    monitoringStatus: input.status,
  });

  // Losing ACTIVE monitoring ends any open Live episode immediately.
  await reconcileLiveLifecycle();
  return { ok: true, status: input.status };
}

export interface LiveActivationOutcome {
  eventId: string;
  mint: string;
  symbol: string | null;
  episodeNumber: number;
  activatedAt: string;
  deactivatedAt: string | null;
  durationMs: number | null;
  open: boolean;
  baselineMarketCap: number | null;
  baselinePriceUsd: number | null;
  /** Measured from the activation baseline — continues after deactivation. */
  outcome: StageOutcomeResult;
}

export interface LiveLifecycleView {
  policyVersion: string;
  /** Current Live Calls: at most one per exact mint. */
  liveMints: string[];
  calls: ThesisCallLifecycle[];
  events: LiveLifecycleEvent[];
  activations: LiveActivationOutcome[];
}

/** Read model for Live Calls + History lifecycle. Never writes. */
export async function loadLiveLifecycle(): Promise<LiveLifecycleView> {
  const { calls, eventsByCall } = await loadContext();
  const events = [...eventsByCall.values()]
    .flat()
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  const openRows = calls
    .filter((c) => c.isLive && c.currentEpisode)
    .map((c) => ({ mint: c.mint, activatedAt: c.currentEpisode!.activatedAt }));
  const liveMints = dedupeByMint(openRows).map((r) => r.mint);

  const activations = await measureActivations(calls);
  return { policyVersion: LIVE_LIFECYCLE_VERSION, liveMints, calls, events, activations };
}

/**
 * Outcome measurement from each LIVE_ACTIVATED baseline. Measurement does NOT
 * stop when the episode deactivates — the question is whether that BUY_ZONE
 * activation was good timing.
 */
async function measureActivations(calls: ThesisCallLifecycle[]): Promise<LiveActivationOutcome[]> {
  const episodes = calls.flatMap((c) =>
    c.episodes.map((e) => ({ call: c, episode: e })),
  );
  if (episodes.length === 0) return [];

  const tokenIds = [...new Set(episodes.map((e) => e.call.tokenId).filter(Boolean))] as string[];
  const { data, error } = await supabaseAdmin
    .from("token_snapshots")
    .select("token_id, market_cap, price_usd, liquidity_usd, captured_at")
    .in("token_id", tokenIds)
    .order("captured_at", { ascending: true });
  if (error) throw new Error(error.message);

  const byToken = new Map<string, Row[]>();
  for (const r of (data as Row[]) ?? []) {
    const id = r["token_id"] as string;
    const list = byToken.get(id) ?? [];
    list.push(r);
    byToken.set(id, list);
  }

  return episodes.map(({ call, episode }) => {
    const snapshots = (call.tokenId ? (byToken.get(call.tokenId) ?? []) : []).map((r) => ({
      capturedAt: r["captured_at"] as string,
      marketCap: num(r["market_cap"]),
      priceUsd: num(r["price_usd"]),
      liquidityUsd: num(r["liquidity_usd"]),
    }));
    const outcome = deriveStageOutcome(
      {
        enteredAt: episode.activatedAt,
        marketCapAtEntry: episode.activationMarketCap,
        priceAtEntry: episode.activationPriceUsd,
      },
      { candidates: [], snapshots },
    );
    return {
      eventId: `${call.thesisCallMilestoneId}:${episode.episodeNumber}`,
      mint: call.mint,
      symbol: call.symbol,
      episodeNumber: episode.episodeNumber,
      activatedAt: episode.activatedAt,
      deactivatedAt: episode.deactivatedAt,
      durationMs: episode.durationMs,
      open: episode.open,
      baselineMarketCap: episode.activationMarketCap,
      baselinePriceUsd: episode.activationPriceUsd,
      outcome,
    };
  });
}
