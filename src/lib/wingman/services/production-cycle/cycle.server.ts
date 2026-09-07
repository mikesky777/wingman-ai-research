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

/**
 * Starts one cycle. A unique partial index guarantees at most one active
 * cycle, so a double-click resolves to the existing run instead of a second
 * scan.
 */
export async function startProductionCycle(): Promise<StartProductionCycleResult> {
  const existing = await loadActiveProductionCycle();
  if (existing) return { code: "PRODUCTION_CYCLE_ALREADY_RUNNING", cycle: existing };

  const { data, error } = await supabaseAdmin
    .from("production_cycle_runs")
    .insert({
      orchestrator_version: PRODUCTION_CYCLE_VERSION,
      status: "STARTING",
      stage: "STARTING",
      trigger: "MANUAL",
    })
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) {
    const active = await loadActiveProductionCycle();
    if (active) return { code: "PRODUCTION_CYCLE_ALREADY_RUNNING", cycle: active };
    throw new Error(error.message);
  }
  const cycle = data ? mapRow(data as Row) : null;
  // Progression is owned by the backend from this moment on: the drive pass is
  // kicked here and continues server-side. If this worker dies mid-pass, the
  // scheduled watchdog resumes the next unfinished stage.
  if (cycle) void driveProductionCycle().catch(() => undefined);
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
  });
}

async function complete(id: string, code: string): Promise<void> {
  await patch(id, {
    status: "COMPLETE",
    stage: "COMPLETE",
    completion_code: code,
    completed_at: new Date().toISOString(),
    lease_owner: null,
    lease_expires_at: null,
  });
}

/** Claims the tick lease. Returns false when another worker holds it. */
async function claimLease(id: string, owner: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("production_cycle_runs")
    .update({
      lease_owner: owner,
      lease_expires_at: new Date(Date.now() + CYCLE_LEASE_MS).toISOString(),
      last_tick_at: nowIso,
    })
    .eq("id", id)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
    .select("id");
  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? []).length > 0;
}

async function releaseLease(id: string): Promise<void> {
  await supabaseAdmin
    .from("production_cycle_runs")
    .update({ lease_owner: null, lease_expires_at: null })
    .eq("id", id);
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

/** Max stage steps in one drive pass; the sequence is far shorter than this. */
const MAX_DRIVE_STEPS = 24;

async function loadCycleById(id: string): Promise<ProductionCycleState | null> {
  const { data, error } = await supabaseAdmin
    .from("production_cycle_runs")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Row) : null;
}

async function renewLease(id: string, owner: string): Promise<void> {
  await supabaseAdmin
    .from("production_cycle_runs")
    .update({
      lease_owner: owner,
      lease_expires_at: new Date(Date.now() + CYCLE_LEASE_MS).toISOString(),
      last_tick_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/**
 * BACKEND-OWNED PROGRESSION.
 *
 * Runs the pinned cohort forward stage by stage inside one leased server pass,
 * until the cycle reaches a terminal state. Nothing in the browser is involved
 * — the client only reads persisted state. Every step is idempotent and
 * cohort-pinned, so a resumed pass never repeats a completed paid stage, and
 * the lease guarantees only one worker ever progresses a cycle at a time.
 */
export async function driveProductionCycle(): Promise<DriveResult> {
  const cycle = await loadActiveProductionCycle();
  if (!cycle) return { code: "NO_ACTIVE_CYCLE", cycle: null, steps: 0 };
  if (isTerminalStage(cycle.stage)) return { code: "TERMINAL", cycle, steps: 0 };

  const owner = `worker-${Math.random().toString(36).slice(2, 10)}`;
  if (!(await claimLease(cycle.id, owner))) return { code: "BUSY", cycle, steps: 0 };

  let steps = 0;
  let current: ProductionCycleState | null = cycle;
  try {
    while (current && !isTerminalStage(current.stage) && steps < MAX_DRIVE_STEPS) {
      await runStage(current);
      steps += 1;
      current = await loadCycleById(cycle.id);
      if (current && !isTerminalStage(current.stage)) await renewLease(cycle.id, owner);
    }
  } catch (error) {
    await fail(
      cycle.id,
      current?.stage ?? cycle.stage,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    const after = await loadCycleById(cycle.id);
    if (after && !isTerminalStage(after.stage)) await releaseLease(cycle.id);
  }

  return { code: "DRIVEN", cycle: await loadCycleById(cycle.id), steps };
}

/**
 * RECOVERY WATCHDOG ONLY.
 *
 * Exits immediately when no cycle is active. When one is active and still
 * being progressed by a live worker (unexpired lease, recent tick), it does
 * nothing. It resumes the next unfinished stage only when normal backend
 * progression stalled — e.g. the worker died mid-run.
 */
export async function watchdogProductionCycle(): Promise<WatchdogResult> {
  const cycle = await loadActiveProductionCycle();
  if (!cycle) return { code: "NO_ACTIVE_CYCLE", cycle: null, steps: 0 };

  const { data } = await supabaseAdmin
    .from("production_cycle_runs")
    .select("lease_owner, lease_expires_at, last_tick_at")
    .eq("id", cycle.id)
    .maybeSingle();
  const lease = (data as Row | null) ?? {};
  const stalled = isCycleStalled(
    {
      leaseOwner: (lease["lease_owner"] as string) ?? null,
      leaseExpiresAt: (lease["lease_expires_at"] as string) ?? null,
      lastTickAt: (lease["last_tick_at"] as string) ?? null,
      startedAt: cycle.startedAt,
    },
    Date.now(),
    CYCLE_WATCHDOG_STALL_MS,
  );
  if (!stalled) return { code: "HEALTHY_NO_ACTION", cycle, steps: 0 };

  const driven = await driveProductionCycle();
  return { code: "RESUMED", cycle: driven.cycle, steps: driven.steps };
}


async function runStage(cycle: ProductionCycleState): Promise<void> {
  switch (cycle.stage) {
    case "STARTING":
      await patch(cycle.id, { stage: "SCANNING", status: "SCANNING" });
      return;
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
      return;
    case "DEEP_RESEARCH":
      return stageDeepResearch(cycle);
    case "THESIS_SYNTHESIS":
      return stageThesis(cycle);
    case "THESIS_QUALIFICATION":
      return stageQualification(cycle);
    case "ENTRY_TIMING":
      return stageEntry(cycle);
    default:
      return;
  }
}

async function advance(cycle: ProductionCycleState, values: Record<string, unknown> = {}) {
  const next = nextStage(cycle.stage);
  await patch(cycle.id, { ...values, stage: next, status: next });
}

/** STAGE 1 — the existing authoritative production scan. */
async function stageScan(cycle: ProductionCycleState): Promise<void> {
  if (cycle.scanRunId) {
    // Resume: never rerun a scan that already exists for this cycle.
    await advance(cycle);
    return;
  }
  const { runScannerPipeline } = await import("../scanner/pipeline.server");
  const result = await runScannerPipeline({});
  if (!result.ok || !result.runId) {
    await fail(
      cycle.id,
      "SCANNING",
      result.message ?? `Scan did not complete (${result.code}).`,
    );
    return;
  }
  await advance(cycle, {
    scan_run_id: result.runId,
    scanner_policy_version: result.summary?.scannerVersion ?? null,
    packet_count: result.researchPackets?.persisted ?? 0,
  });
}

/** STAGE 2 — canonical Research Packets for the pinned scan only. */
async function stagePackets(cycle: ProductionCycleState): Promise<void> {
  const scanRunId = cycle.scanRunId;
  if (!scanRunId) {
    await fail(cycle.id, "GENERATING_PACKETS", "Cycle has no pinned scan.");
    return;
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
      return;
    }
  }
  if (count === 0) {
    await fail(
      cycle.id,
      "GENERATING_PACKETS",
      "No research packets were persisted for the pinned scan.",
    );
    return;
  }
  await advance(cycle, { packet_count: count });
}

/** STAGE 3 — one canonical production triage for the pinned cohort. */
async function stageTriage(cycle: ProductionCycleState): Promise<void> {
  const scanRunId = cycle.scanRunId;
  if (!scanRunId) {
    await fail(cycle.id, "TRIAGING", "Cycle has no pinned scan.");
    return;
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
    return;
  }

  const { runAiTriage } = await import("../research/triage.server");
  const result = await runAiTriage({ mode: "PRODUCTION", scanRunId, allowRerun: false });
  if (result.code !== "OK" || !result.triageRunId) {
    await fail(cycle.id, "TRIAGING", `Triage produced no canonical result (${result.code}).`);
    return;
  }
  await advance(cycle, {
    triage_run_id: result.triageRunId,
    triage_deep_count: result.deepResearchCount,
    triage_watch_count: result.watchCount,
    triage_skip_count: Math.max(result.packetCount - result.deepResearchCount - result.watchCount, 0),
  });
}

/**
 * STAGES 4+5 — research spend control, the pre-Deep-Research tradability guard
 * and paid Deep Research, all inside the existing production path. Candidate
 * problems are terminal for that candidate only.
 */
async function stageDeepResearch(cycle: ProductionCycleState): Promise<void> {
  const triageRunId = cycle.triageRunId;
  if (!triageRunId) {
    await fail(cycle.id, "DEEP_RESEARCH", "Cycle has no pinned triage run.");
    return;
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
}

/** STAGE 6 — Thesis Synthesis for genuinely eligible current-cohort dossiers. */
async function stageThesis(cycle: ProductionCycleState): Promise<void> {
  const triageRunId = cycle.triageRunId;
  if (!triageRunId) {
    await fail(cycle.id, "THESIS_SYNTHESIS", "Cycle has no pinned triage run.");
    return;
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
}

/**
 * STAGE 7 — qualification is READ-ONLY. Thesis Calls exist only because the
 * existing production Opportunity gates minted them during synthesis.
 */
async function stageQualification(cycle: ProductionCycleState): Promise<void> {
  const triageRunId = cycle.triageRunId;
  if (!triageRunId) {
    await fail(cycle.id, "THESIS_QUALIFICATION", "Cycle has no pinned triage run.");
    return;
  }
  const { loadCohortThesisReports } = await import("../research/cohort.server");
  const refs = await loadCohortThesisReports(triageRunId);
  const synthesized = refs.filter((r) => r.status !== "failed").length;
  const calls = refs.filter((r) => Boolean(r.thesisCallMilestoneId));
  await advance(cycle, {
    thesis_synthesized_count: synthesized,
    thesis_call_count: calls.length,
  });
}

/** STAGE 8 — Entry runs ONLY for canonical production Thesis Calls. */
async function stageEntry(cycle: ProductionCycleState): Promise<void> {
  const triageRunId = cycle.triageRunId;
  if (!triageRunId) {
    await fail(cycle.id, "ENTRY_TIMING", "Cycle has no pinned triage run.");
    return;
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
}
