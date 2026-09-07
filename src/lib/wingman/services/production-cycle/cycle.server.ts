/**
 * production_cycle/v1 — durable, human-initiated production orchestrator.
 *
 * The orchestrator owns PROGRESSION only. Every stage is executed by the same
 * authoritative production service the manual flow uses; no stage logic, gate
 * or threshold is duplicated or relaxed here. State lives in
 * `production_cycle_runs`, so a cycle continues with the browser closed and
 * resumes after a worker restart without rerunning a completed paid stage.
 *
 * The cycle is pinned to ONE exact scan cohort for its whole life. A missing
 * downstream artifact is reported as missing — it never falls back to an older
 * cohort.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CYCLE_LEASE_MS,
  PRODUCTION_CYCLE_VERSION,
  completionCode,
  entryEligibleMints,
  CYCLE_WATCHDOG_STALL_MS,
  isCycleStalled,
  isTerminalStage,
  nextStage,
  type CycleStage,
} from "./cycle";

type Row = Record<string, unknown>;

/** Diagnostics stay flat and JSON-serializable across the RPC boundary. */
type DiagnosticScalar = string | number | boolean | null;
export type CycleDiagnostics = Record<string, DiagnosticScalar | Record<string, DiagnosticScalar>>;

export interface ProductionCycleState {
  id: string;
  orchestratorVersion: string;
  status: CycleStage;
  stage: CycleStage;
  startedAt: string;
  completedAt: string | null;
  lastTickAt: string | null;
  scanRunId: string | null;
  scannerPolicyVersion: string | null;
  packetCount: number;
  triageRunId: string | null;
  triageDeepCount: number;
  triageWatchCount: number;
  triageSkipCount: number;
  deepResearchExecuted: number;
  deepResearchDeferred: number;
  deepResearchBlocked: number;
  deepResearchFailed: number;
  thesisSynthesizedCount: number;
  thesisFailedCount: number;
  thesisCallCount: number;
  entryEligibleCount: number;
  entryEvaluatedCount: number;
  completionCode: string | null;
  failureStage: string | null;
  failureReason: string | null;
  diagnostics: CycleDiagnostics;
}

const SELECT_COLUMNS =
  "id, orchestrator_version, status, stage, started_at, completed_at, last_tick_at, scan_run_id, scanner_policy_version, packet_count, triage_run_id, triage_deep_count, triage_watch_count, triage_skip_count, deep_research_executed, deep_research_deferred, deep_research_blocked, deep_research_failed, thesis_synthesized_count, thesis_failed_count, thesis_call_count, entry_eligible_count, entry_evaluated_count, completion_code, failure_stage, failure_reason, diagnostics, lease_owner, lease_expires_at";

function mapRow(r: Row): ProductionCycleState {
  return {
    id: r["id"] as string,
    orchestratorVersion: (r["orchestrator_version"] as string) ?? PRODUCTION_CYCLE_VERSION,
    status: (r["status"] as CycleStage) ?? "STARTING",
    stage: (r["stage"] as CycleStage) ?? "STARTING",
    startedAt: (r["started_at"] as string) ?? "",
    completedAt: (r["completed_at"] as string) ?? null,
    lastTickAt: (r["last_tick_at"] as string) ?? null,
    scanRunId: (r["scan_run_id"] as string) ?? null,
    scannerPolicyVersion: (r["scanner_policy_version"] as string) ?? null,
    packetCount: Number(r["packet_count"] ?? 0),
    triageRunId: (r["triage_run_id"] as string) ?? null,
    triageDeepCount: Number(r["triage_deep_count"] ?? 0),
    triageWatchCount: Number(r["triage_watch_count"] ?? 0),
    triageSkipCount: Number(r["triage_skip_count"] ?? 0),
    deepResearchExecuted: Number(r["deep_research_executed"] ?? 0),
    deepResearchDeferred: Number(r["deep_research_deferred"] ?? 0),
    deepResearchBlocked: Number(r["deep_research_blocked"] ?? 0),
    deepResearchFailed: Number(r["deep_research_failed"] ?? 0),
    thesisSynthesizedCount: Number(r["thesis_synthesized_count"] ?? 0),
    thesisFailedCount: Number(r["thesis_failed_count"] ?? 0),
    thesisCallCount: Number(r["thesis_call_count"] ?? 0),
    entryEligibleCount: Number(r["entry_eligible_count"] ?? 0),
    entryEvaluatedCount: Number(r["entry_evaluated_count"] ?? 0),
    completionCode: (r["completion_code"] as string) ?? null,
    failureStage: (r["failure_stage"] as string) ?? null,
    failureReason: (r["failure_reason"] as string) ?? null,
    diagnostics: (r["diagnostics"] as CycleDiagnostics) ?? {},
  };
}

export async function loadActiveProductionCycle(): Promise<ProductionCycleState | null> {
  const { data, error } = await supabaseAdmin
    .from("production_cycle_runs")
    .select(SELECT_COLUMNS)
    .not("status", "in", "(COMPLETE,FAILED)")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Row) : null;
}

export async function loadLatestProductionCycle(): Promise<ProductionCycleState | null> {
  const { data, error } = await supabaseAdmin
    .from("production_cycle_runs")
    .select(SELECT_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Row) : null;
}

export interface StartProductionCycleResult {
  code: "STARTED" | "PRODUCTION_CYCLE_ALREADY_RUNNING";
  cycle: ProductionCycleState | null;
}

export type CycleEventType =
  | "ACCEPTED"
  | "CLAIMED"
  | "STAGE_ENTERED"
  | "SCAN_ASSIGNED"
  | "STAGE_COMPLETED"
  | "STAGE_FAILED"
  | "STAGE_WAITING"
  | "RECOVERY_STARTED"
  | "OWNERSHIP_RELEASED"
  | "CYCLE_COMPLETED"
  | "CYCLE_FAILED";

/**
 * Meaningful transitions only. Heartbeats are mutable liveness FIELDS and are
 * deliberately never written here, so the ledger stays small and readable.
 */
async function recordEvent(
  cycleId: string,
  eventType: CycleEventType,
  fields: { stage?: string | null; workerId?: string | null; scanRunId?: string | null; reason?: string | null } = {},
): Promise<void> {
  await supabaseAdmin.from("production_cycle_events").insert({
    production_cycle_run_id: cycleId,
    event_type: eventType,
    stage: fields.stage ?? null,
    worker_id: fields.workerId ?? null,
    scan_run_id: fields.scanRunId ?? null,
    reason: fields.reason ? fields.reason.slice(0, 1000) : null,
  } as never);
}

/**
 * NORMAL BACKEND PROGRESSION HAND-OFF.
 *
 * Asks the database to invoke the next bounded stage immediately, out of band
 * from this request. A healthy cycle therefore chains stage → stage on the
 * backend within seconds, with no browser involvement and without waiting for
 * the once-a-minute recovery watchdog.
 */
async function dispatchNextStage(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("dispatch_production_cycle_stage" as never);
  // Dispatch is best-effort: if it fails, the watchdog still recovers the
  // cycle. It must never turn a healthy stage into a failure.
  if (error) console.error("production cycle dispatch failed", error.message);
}

/**
 * Starts one cycle. A unique partial index guarantees at most one active
 * cycle, so a double-click resolves to the existing run instead of a second
 * scan. The request returns as soon as the cycle is durably accepted.
 */
export async function startProductionCycle(): Promise<StartProductionCycleResult> {
  const existing = await loadActiveProductionCycle();
  if (existing) return { code: "PRODUCTION_CYCLE_ALREADY_RUNNING", cycle: existing };

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("production_cycle_runs")
    .insert({
      orchestrator_version: PRODUCTION_CYCLE_VERSION,
      status: "STARTING",
      stage: "STARTING",
      trigger: "MANUAL",
      requested_at: nowIso,
      accepted_at: nowIso,
      worker_status: "UNCLAIMED",
      last_progress_at: nowIso,
    } as never)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) {
    const active = await loadActiveProductionCycle();
    if (active) return { code: "PRODUCTION_CYCLE_ALREADY_RUNNING", cycle: active };
    throw new Error(error.message);
  }
  const cycle = data ? mapRow(data as Row) : null;
  if (cycle) {
    await recordEvent(cycle.id, "ACCEPTED", { stage: "STARTING" });
    // Backend-owned progression starts immediately; the browser is not the
    // driver and closing the tab changes nothing.
    await dispatchNextStage();
  }
  return { code: "STARTED", cycle };
}

async function patch(id: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from("production_cycle_runs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(values as any)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function fail(id: string, stage: CycleStage, reason: string): Promise<void> {
  await patch(id, {
    status: "FAILED",
    stage: "FAILED",
    failure_stage: stage,
    failure_reason: reason.slice(0, 2000),
    completed_at: new Date().toISOString(),
    lease_owner: null,
    lease_expires_at: null,
    worker_status: "TERMINAL",
    recovery_state: null,
  });
  await recordEvent(id, "CYCLE_FAILED", { stage, reason });
}

async function complete(id: string, code: string): Promise<void> {
  await patch(id, {
    status: "COMPLETE",
    stage: "COMPLETE",
    completion_code: code,
    completed_at: new Date().toISOString(),
    lease_owner: null,
    lease_expires_at: null,
    worker_status: "TERMINAL",
    recovery_state: null,
  });
  await recordEvent(id, "CYCLE_COMPLETED", { stage: "COMPLETE", reason: code });
}

/** Claims the stage lease. Returns false when another worker holds it. */
async function claimLease(id: string, owner: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("production_cycle_runs")
    .update({
      lease_owner: owner,
      lease_expires_at: new Date(Date.now() + CYCLE_LEASE_MS).toISOString(),
      last_tick_at: nowIso,
      claim_acquired_at: nowIso,
      worker_heartbeat_at: nowIso,
      worker_status: "RUNNING",
    } as never)
    .eq("id", id)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
    .select("id");
  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? []).length > 0;
}

async function releaseLease(id: string, owner: string): Promise<void> {
  await supabaseAdmin
    .from("production_cycle_runs")
    .update({
      lease_owner: null,
      lease_expires_at: null,
      worker_status: "IDLE",
    } as never)
    .eq("id", id)
    .eq("lease_owner", owner);
}

export interface DriveResult {
  code: "DRIVEN" | "NO_ACTIVE_CYCLE" | "BUSY" | "TERMINAL";
  cycle: ProductionCycleState | null;
  steps: number;
}

export interface WatchdogResult {
  code: "NO_ACTIVE_CYCLE" | "HEALTHY_NO_ACTION" | "RESUMED";
  cycle: ProductionCycleState | null;
  steps: number;
}

async function loadCycleById(id: string): Promise<ProductionCycleState | null> {
  const { data, error } = await supabaseAdmin
    .from("production_cycle_runs")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Row) : null;
}

async function heartbeat(id: string, owner: string): Promise<void> {
  await supabaseAdmin
    .from("production_cycle_runs")
    .update({
      lease_expires_at: new Date(Date.now() + CYCLE_LEASE_MS).toISOString(),
      worker_heartbeat_at: new Date().toISOString(),
      last_tick_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("lease_owner", owner);
}

/**
 * BACKEND-OWNED PROGRESSION — exactly ONE bounded stage per invocation.
 *
 * The stage executes under a short renewable lease with a live heartbeat, so
 * only one worker ever progresses a cycle. When the stage persists progress
 * and the cycle is still active, the backend immediately dispatches the next
 * stage itself. Nothing waits for the browser or for the watchdog clock.
 */
export async function runProductionCycleStage(options: { recovery?: boolean } = {}): Promise<DriveResult> {
  const cycle = await loadActiveProductionCycle();
  if (!cycle) return { code: "NO_ACTIVE_CYCLE", cycle: null, steps: 0 };
  if (isTerminalStage(cycle.stage)) return { code: "TERMINAL", cycle, steps: 0 };

  const owner = `worker-${Math.random().toString(36).slice(2, 10)}`;
  if (!(await claimLease(cycle.id, owner))) return { code: "BUSY", cycle, steps: 0 };
  await recordEvent(cycle.id, options.recovery ? "RECOVERY_STARTED" : "CLAIMED", {
    stage: cycle.stage,
    workerId: owner,
  });
  if (options.recovery) {
    await patch(cycle.id, { recovery_state: "RECOVERING", recovery_reason: "Previous worker was not alive." });
  }
  await recordEvent(cycle.id, "STAGE_ENTERED", { stage: cycle.stage, workerId: owner });

  const beat = setInterval(() => {
    void heartbeat(cycle.id, owner).catch(() => undefined);
  }, 20_000);
  if (typeof beat === "object" && beat && "unref" in beat) {
    (beat as unknown as { unref: () => void }).unref();
  }

  let outcome: StageOutcome = "WAITING";
  try {
    outcome = await runStage(cycle);
    if (outcome !== "WAITING") {
      await patch(cycle.id, {
        last_progress_at: new Date().toISOString(),
        worker_error: null,
        recovery_state: null,
        recovery_reason: null,
      });
      await recordEvent(cycle.id, "STAGE_COMPLETED", { stage: cycle.stage, workerId: owner });
    } else {
      await recordEvent(cycle.id, "STAGE_WAITING", { stage: cycle.stage, workerId: owner });
    }
  } catch (error) {
    // A thrown worker error is NOT a confirmed terminal stage failure: the
    // stage may have completed, died, or simply lost its process. Persist it
    // as recoverable state and let recovery re-evaluate the exact artifacts.
    const message = error instanceof Error ? error.message : String(error);
    await patch(cycle.id, {
      worker_error: message.slice(0, 2000),
      recovery_state: "RECOVERABLE",
      recovery_reason: "Worker error; stage outcome unknown.",
    });
    await recordEvent(cycle.id, "STAGE_FAILED", { stage: cycle.stage, workerId: owner, reason: message });
    outcome = "WAITING";
  } finally {
    clearInterval(beat);
    await releaseLease(cycle.id, owner);
    await recordEvent(cycle.id, "OWNERSHIP_RELEASED", { stage: cycle.stage, workerId: owner });
  }

  const after = await loadCycleById(cycle.id);
  // Immediate backend hand-off to the next stage; only genuinely blocked
  // stages ("still running elsewhere") wait for the recovery watchdog.
  if (after && !isTerminalStage(after.stage) && outcome === "ADVANCED") {
    await dispatchNextStage();
  }
  return { code: "DRIVEN", cycle: after, steps: outcome === "ADVANCED" ? 1 : 0 };
}

/** Backwards-compatible alias: one bounded stage, backend-owned. */
export async function driveProductionCycle(): Promise<DriveResult> {
  return runProductionCycleStage();
}

/**
 * RECOVERY WATCHDOG ONLY.
 *
 * Never the ordinary clock for stage progression. It exits immediately when
 * no cycle is active, does nothing while a live backend worker owns the
 * cycle, and resumes the next unfinished stage only when that ownership is
 * dead — after which normal backend progression takes over again.
 */
export async function watchdogProductionCycle(): Promise<WatchdogResult> {
  const cycle = await loadActiveProductionCycle();
  if (!cycle) return { code: "NO_ACTIVE_CYCLE", cycle: null, steps: 0 };

  const { data } = await supabaseAdmin
    .from("production_cycle_runs")
    .select("lease_owner, lease_expires_at, last_tick_at, worker_heartbeat_at")
    .eq("id", cycle.id)
    .maybeSingle();
  const lease = (data as Row | null) ?? {};
  const unclaimedStart = cycle.stage === "STARTING" && !lease["lease_owner"];
  const stalled =
    unclaimedStart ||
    isCycleStalled(
      {
        leaseOwner: (lease["lease_owner"] as string) ?? null,
        leaseExpiresAt: (lease["lease_expires_at"] as string) ?? null,
        lastTickAt:
          (lease["worker_heartbeat_at"] as string) ?? (lease["last_tick_at"] as string) ?? null,
        startedAt: cycle.startedAt,
      },
      Date.now(),
      CYCLE_WATCHDOG_STALL_MS,
    );
  if (!stalled) return { code: "HEALTHY_NO_ACTION", cycle, steps: 0 };

  const driven = await runProductionCycleStage({ recovery: true });
  return { code: "RESUMED", cycle: driven.cycle, steps: driven.steps };
}

/**
 * Stage outcome. "WAITING" means the stage legitimately made no progress this
 * pass (work still running elsewhere, or an unknown-but-recoverable state) —
 * it is never a production failure.
 */
type StageOutcome = "ADVANCED" | "WAITING" | "TERMINAL";

async function runStage(cycle: ProductionCycleState): Promise<StageOutcome> {
  switch (cycle.stage) {
    case "STARTING":
      await patch(cycle.id, { stage: "SCANNING", status: "SCANNING" });
      return "ADVANCED";
    case "SCANNING":
      return stageScan(cycle);
    case "GENERATING_PACKETS":
      return stagePackets(cycle);
    case "TRIAGING":
      return stageTriage(cycle);
    case "APPLYING_SPEND_CONTROL":
      // Spend control is applied by the authoritative Deep Research path
      // itself; this state exists so the UI can name the step.
      await patch(cycle.id, { stage: "DEEP_RESEARCH", status: "DEEP_RESEARCH" });
      return "ADVANCED";
    case "DEEP_RESEARCH":
      return stageDeepResearch(cycle);
    case "THESIS_SYNTHESIS":
      return stageThesis(cycle);
    case "THESIS_QUALIFICATION":
      return stageQualification(cycle);
    case "ENTRY_TIMING":
      return stageEntry(cycle);
    default:
      return "TERMINAL";
  }
}

async function advance(cycle: ProductionCycleState, values: Record<string, unknown> = {}) {
  const next = nextStage(cycle.stage);
  await patch(cycle.id, { ...values, stage: next, status: next });
}

/**
 * STAGE 1 — the existing authoritative production scan.
 *
 * Order is durability-critical: the scan row is created and pinned to the
 * cycle BEFORE any external provider work, and scanner execution carries its
 * own liveness so recovery can never duplicate provider calls.
 */
async function stageScan(cycle: ProductionCycleState): Promise<StageOutcome> {
  const {
    claimScanExecution,
    getCycleScanExecution,
    isScanExecutionAlive,
  } = await import("../scanner/persistence.server");
  const { createCycleScanRun, runScannerPipeline } = await import("../scanner/pipeline.server");
  const { ConcurrentScanError } = await import("../scanner/persistence.server");

  const owner = `scan-${Math.random().toString(36).slice(2, 10)}`;
  let scanRunId = cycle.scanRunId;

  if (!scanRunId) {
    const linked = await getCycleScanExecution(cycle.id);
    if (linked) {
      // A crash between the two writes: rediscover the exact same scan.
      scanRunId = linked.id;
    } else {
      try {
        scanRunId = await createCycleScanRun({ productionCycleRunId: cycle.id, executionOwner: owner });
      } catch (error) {
        if (error instanceof ConcurrentScanError) {
          // A manual scan holds the lock. Transient, never a cycle failure.
          return "WAITING";
        }
        throw error;
      }
    }
    await patch(cycle.id, { scan_run_id: scanRunId });
    await recordEvent(cycle.id, "SCAN_ASSIGNED", { stage: "SCANNING", scanRunId });
  }

  const state = await getCycleScanExecution(cycle.id);
  if (state?.status === "completed") {
    await advance({ ...cycle, scanRunId }, { scan_run_id: scanRunId });
    return "ADVANCED";
  }
  if (state?.status === "failed") {
    await fail(cycle.id, "SCANNING", state.errorMessage ?? "Scan did not complete.");
    return "TERMINAL";
  }
  if (state && isScanExecutionAlive(state) && state.executionOwner !== owner) {
    // The original execution is genuinely alive: never duplicate provider work.
    return "WAITING";
  }
  if (state && state.executionOwner !== owner && !(await claimScanExecution(state.id, owner))) {
    return "WAITING";
  }

  const result = await runScannerPipeline({}, { existingRunId: scanRunId, executionOwner: owner });
  if (result.code === "ALREADY_RUNNING") return "WAITING";
  if (!result.ok || !result.runId) {
    await fail(cycle.id, "SCANNING", result.message ?? `Scan did not complete (${result.code}).`);
    return "TERMINAL";
  }
  await advance(
    { ...cycle, scanRunId },
    {
      scan_run_id: result.runId,
      scanner_policy_version: result.summary?.scannerVersion ?? null,
      packet_count: result.researchPackets?.persisted ?? 0,
    },
  );
  return "ADVANCED";
}

/** STAGE 2 — canonical Research Packets for the pinned scan only. */
async function stagePackets(cycle: ProductionCycleState): Promise<StageOutcome> {
  const scanRunId = cycle.scanRunId;
  if (!scanRunId) {
    await fail(cycle.id, "GENERATING_PACKETS", "Cycle has no pinned scan.");
    return "TERMINAL";
  }
  const { canonicalPacketCount, generateResearchPackets } = await import(
    "../research/packet.server"
  );
  let count = await canonicalPacketCount(scanRunId);
  if (count === 0) {
    try {
      const result = await generateResearchPackets({ scanRunId, persist: true });
      count = result.persistedCount ?? 0;
    } catch (error) {
      await fail(
        cycle.id,
        "GENERATING_PACKETS",
        error instanceof Error ? error.message : String(error),
      );
      return "TERMINAL";
    }
  }
  if (count === 0) {
    await fail(
      cycle.id,
      "GENERATING_PACKETS",
      "No research packets were persisted for the pinned scan.",
    );
    return "TERMINAL";
  }
  await advance(cycle, { packet_count: count });
  return "ADVANCED";
}

/** STAGE 3 — one canonical production triage for the pinned cohort. */
async function stageTriage(cycle: ProductionCycleState): Promise<StageOutcome> {
  const scanRunId = cycle.scanRunId;
  if (!scanRunId) {
    await fail(cycle.id, "TRIAGING", "Cycle has no pinned scan.");
    return "TERMINAL";
  }
  const { loadCohortTriageRunId } = await import("../research/cohort.server");
  const { triageRunAvailability } = await import("../research/triage-rerun");
  const existing = await loadCohortTriageRunId(scanRunId);
  const availability = triageRunAvailability(existing);

  if (availability.kind === "RERUN_ONLY" && existing) {
    // Resume path: a canonical triage already exists for THIS cohort.
    const { loadLatestTriage } = await import("../research/triage.server");
    const loaded = await loadLatestTriage("PRODUCTION", { sourceScanId: scanRunId });
    const decisions = loaded?.decisions ?? [];
    await advance(cycle, {
      triage_run_id: existing.id,
      triage_deep_count: decisions.filter((d) => d.decision === "DEEP_RESEARCH").length,
      triage_watch_count: decisions.filter((d) => d.decision === "WATCH").length,
      triage_skip_count: decisions.filter((d) => d.decision === "SKIP").length,
    });
    return "ADVANCED";
  }

  const { runAiTriage } = await import("../research/triage.server");
  const result = await runAiTriage({ mode: "PRODUCTION", scanRunId, allowRerun: false });
  if (result.code !== "OK" || !result.triageRunId) {
    await fail(cycle.id, "TRIAGING", `Triage produced no canonical result (${result.code}).`);
    return "TERMINAL";
  }
  await advance(cycle, {
    triage_run_id: result.triageRunId,
    triage_deep_count: result.deepResearchCount,
    triage_watch_count: result.watchCount,
    triage_skip_count: Math.max(result.packetCount - result.deepResearchCount - result.watchCount, 0),
  });
  return "ADVANCED";
}

/**
 * STAGES 4+5 — research spend control, the pre-Deep-Research tradability guard
 * and paid Deep Research, all inside the existing production path. Candidate
 * problems are terminal for that candidate only.
 */
async function stageDeepResearch(cycle: ProductionCycleState): Promise<StageOutcome> {
  const triageRunId = cycle.triageRunId;
  if (!triageRunId) {
    await fail(cycle.id, "DEEP_RESEARCH", "Cycle has no pinned triage run.");
    return "TERMINAL";
  }
  const { runDeepResearch } = await import("../research/deep/deep-research.server");
  const result = await runDeepResearch({
    mode: "production",
    triageRunId,
    limit: 40,
    offset: 0,
    startNotStartedOnly: true,
  });
  await advance(cycle, {
    deep_research_executed: result.completed + result.insufficient + result.searchUnavailable,
    deep_research_deferred: result.deferredRecentResearch + result.deferredBudget,
    deep_research_blocked: result.blocked,
    deep_research_failed: result.failed,
    diagnostics: {
      ...cycle.diagnostics,
      deepResearch: {
        code: result.code,
        requested: result.requested,
        completed: result.completed,
        insufficient: result.insufficient,
        searchUnavailable: result.searchUnavailable,
        blocked: result.blocked,
        failed: result.failed,
        deferredRecentResearch: result.deferredRecentResearch,
        deferredBudget: result.deferredBudget,
      },
    },
  });
  return "ADVANCED";
}

/** STAGE 6 — Thesis Synthesis for genuinely eligible current-cohort dossiers. */
async function stageThesis(cycle: ProductionCycleState): Promise<StageOutcome> {
  const triageRunId = cycle.triageRunId;
  if (!triageRunId) {
    await fail(cycle.id, "THESIS_SYNTHESIS", "Cycle has no pinned triage run.");
    return "TERMINAL";
  }
  const { runThesisSynthesis } = await import("../research/thesis/thesis.server");
  const result = await runThesisSynthesis({ mode: "production", triageRunId });
  await advance(cycle, {
    thesis_failed_count: result.failed,
    diagnostics: {
      ...cycle.diagnostics,
      thesis: {
        code: result.code,
        requested: result.requested,
        completed: result.completed,
        insufficient: result.insufficient,
        blocked: result.blocked,
        failed: result.failed,
      },
    },
  });
  return "ADVANCED";
}

/**
 * STAGE 7 — qualification is READ-ONLY. Thesis Calls exist only because the
 * existing production Opportunity gates minted them during synthesis.
 */
async function stageQualification(cycle: ProductionCycleState): Promise<StageOutcome> {
  const triageRunId = cycle.triageRunId;
  if (!triageRunId) {
    await fail(cycle.id, "THESIS_QUALIFICATION", "Cycle has no pinned triage run.");
    return "TERMINAL";
  }
  const { loadCohortThesisReports } = await import("../research/cohort.server");
  const refs = await loadCohortThesisReports(triageRunId);
  const synthesized = refs.filter((r) => r.status !== "failed").length;
  const calls = refs.filter((r) => Boolean(r.thesisCallMilestoneId));
  await advance(cycle, {
    thesis_synthesized_count: synthesized,
    thesis_call_count: calls.length,
  });
  return "ADVANCED";
}

/** STAGE 8 — Entry runs ONLY for canonical production Thesis Calls. */
async function stageEntry(cycle: ProductionCycleState): Promise<StageOutcome> {
  const triageRunId = cycle.triageRunId;
  if (!triageRunId) {
    await fail(cycle.id, "ENTRY_TIMING", "Cycle has no pinned triage run.");
    return "TERMINAL";
  }
  const { loadCohortThesisReports } = await import("../research/cohort.server");
  const { loadActivelyMonitoredCallMints, runEntryStateBatch } = await import(
    "../entry/entry.server"
  );
  const refs = await loadCohortThesisReports(triageRunId);
  const cohortCallMints = refs
    .filter((r) => Boolean(r.thesisCallMilestoneId))
    .map((r) => r.mint);
  const eligible = entryEligibleMints({
    cohortCallMints,
    activelyMonitoredMints: await loadActivelyMonitoredCallMints(),
  });

  let evaluated = 0;
  if (eligible.length > 0) {
    const result = await runEntryStateBatch({
      mode: "production",
      limit: Math.min(eligible.length, 25),
      mints: eligible,
    });
    evaluated = result.evaluated;
  }

  await patch(cycle.id, {
    entry_eligible_count: eligible.length,
    entry_evaluated_count: evaluated,
  });
  const code = completionCode({
    thesisCallCount: cycle.thesisCallCount,
    thesisSynthesizedCount: cycle.thesisSynthesizedCount,
    entryEligibleCount: eligible.length,
  });
  await complete(cycle.id, code);
  return "TERMINAL";
}
