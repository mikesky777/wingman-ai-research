/**
 * Outcome enrollment persistence (server-only, service-role).
 *
 * Evaluation-only. Writing an enrollment NEVER advances, promotes or requalifies
 * a token: no production milestone, packet, triage decision, report or gate is
 * created or modified here. Every entry point is failure-isolated — an
 * enrollment problem is recorded as ENROLLMENT_FAILED and the production
 * pipeline continues untouched.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MAX_REJECTS_PER_SCAN,
  MAX_REJECTS_PER_STRATUM,
  OUTCOME_ENROLLMENT_VERSION,
  REJECT_SAMPLING_ENABLED,
  SAMPLING_POLICY_VERSION,
  SCANNER_REJECT_SAMPLING_VERSION,
  buildEnrollment,
  projectCapacity,
  sampleRejects,
  selectionMaterial,
  stableHash,
  type CapacityProjection,
  type EnrollmentRecord,
  type FrozenBaseline,
  type RejectCandidateEvent,
  type TriageDecisionClass,
} from "./enrollment";

type Row = Record<string, unknown>;

function toRow(record: EnrollmentRecord) {
  return {
    schema_version: record.schemaVersion,
    token_id: record.tokenId,
    contract_address: record.contractAddress,
    chain: record.chain,
    funnel_stage: record.stage,
    decision_class: record.decisionClass,
    source_event_type: record.sourceEventType,
    source_event_id: record.sourceEventId,
    scan_run_id: record.scanRunId,
    triage_run_id: record.triageRunId,
    production_cycle_run_id: record.productionCycleRunId,
    cohort_ref: record.cohortRef,
    decision_at: record.decisionAt,
    baseline_at: record.baseline?.at ?? record.decisionAt,
    baseline_market_cap_usd: record.baseline?.marketCapUsd ?? null,
    baseline_price_usd: record.baseline?.priceUsd ?? null,
    baseline_liquidity_usd: record.baseline?.liquidityUsd ?? null,
    baseline_validity: record.baselineValidity,
    enrollment_type: record.enrollmentType,
    sampling_policy_version: record.samplingPolicyVersion,
    sampling_stratum: record.samplingStratum,
    eligible_population_n: record.eligiblePopulationN,
    selected_k: record.selectedK,
    inclusion_probability: record.inclusionProbability,
    selection_seed: record.selectionSeed,
    selection_reason: record.selectionReason,
    selected_at: record.selectedAt,
    sampled_for_outcomes: record.sampledForOutcomes,
    outcome_horizons: [...record.horizons],
    stage_reached: record.stageReached,
    rejection_reason: record.rejectionReason,
    rejection_details: (record.rejectionDetails ?? null) as never,
    lane_rejections: (record.laneRejections ?? null) as never,
    scanner_policy_version: record.scannerPolicyVersion,
    tracking_status: record.trackingStatus,
  };
}

/** Append-only insert. Re-running the same event is a no-op, never a rewrite. */
export async function persistEnrollments(records: EnrollmentRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  let written = 0;
  for (let i = 0; i < records.length; i += 200) {
    const chunk = records.slice(i, i + 200).map(toRow);
    const { error } = await supabaseAdmin
      .from("outcome_enrollments")
      .upsert(chunk, {
        onConflict:
          "contract_address,funnel_stage,decision_class,source_event_id,scan_run_id,triage_run_id",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Enrollment persistence failed: ${error.message}`);
    written += chunk.length;
  }
  return written;
}

/** Mints currently inside the 7-day tracking window (capacity denominator). */
export async function countTrackedMints(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("outcome_tracking")
    .select("contract_address", { count: "exact", head: true })
    .gte("latest_baseline_at", cutoff);
  if (error) return 0;
  return count ?? 0;
}

/** Exact mints already tracked — used so an enrolled event reuses the stream. */
export async function alreadyTrackedMints(mints: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < mints.length; i += 200) {
    const chunk = mints.slice(i, i + 200);
    const { data } = await supabaseAdmin
      .from("outcome_tracking")
      .select("contract_address")
      .in("contract_address", chunk);
    for (const row of (data ?? []) as Row[]) out.add(row["contract_address"] as string);
  }
  return out;
}

export interface ScanEnrollmentCandidate {
  contractAddress: string;
  tokenId: string | null;
  chain?: string;
  /** Setups this candidate qualified for in THIS scan (BASE / REACCEL). */
  setups: string[];
  survivor: boolean;
  stageReached: string | null;
  rejectionReason: string | null;
  rejectionDetails?: unknown;
  laneRejections?: unknown;
  baseline: FrozenBaseline | null;
}

export interface ScanEnrollmentResult {
  ok: boolean;
  version: string;
  samplingVersion: string;
  exhaustiveEnrolled: number;
  rejectEligible: number;
  rejectSampled: number;
  rejectSamplingEnabled: boolean;
  /** Why this scan is (or is not) an eligible reject-sampling cohort. */
  eligibilityReason: string;
  newlyTrackedMints: number;
  reusedTrackedMints: number;
  capacity: CapacityProjection | null;
  strata: {
    stratum: string;
    eligibleN: number;
    selectedK: number;
    inclusionProbability: number;
  }[];
  status: "ENROLLED" | "ENROLLMENT_FAILED" | "UNKNOWN";
  message: string | null;
}

export interface RejectSamplingEligibility {
  eligible: boolean;
  reason: string;
  productionCycleRunId: string | null;
}

/**
 * Phase 3A.2A scope gate. Only a healthy, completed, non-calibration scan that
 * belongs to a Full Cycle run may contribute sampled rejects. Manual, debug,
 * failed, calibration and replay scans are excluded.
 */
export async function resolveRejectSamplingEligibility(
  scanRunId: string,
): Promise<RejectSamplingEligibility> {
  const { data, error } = await supabaseAdmin
    .from("scan_runs")
    .select("id, status, calibration_mode, discovery_health, production_cycle_run_id")
    .eq("id", scanRunId)
    .maybeSingle();
  if (error || !data) {
    return { eligible: false, reason: "SCAN_RUN_NOT_READABLE", productionCycleRunId: null };
  }
  const row = data as Row;
  const cycleId = (row["production_cycle_run_id"] as string | null) ?? null;
  if (!cycleId) return { eligible: false, reason: "NOT_FULL_CYCLE_SCAN", productionCycleRunId: null };
  if (row["calibration_mode"] === true) {
    return { eligible: false, reason: "CALIBRATION_SCAN", productionCycleRunId: cycleId };
  }
  if (row["status"] !== "completed") {
    return { eligible: false, reason: "SCAN_NOT_COMPLETED", productionCycleRunId: cycleId };
  }
  if (row["discovery_health"] === "PROVIDER_UNAVAILABLE") {
    return { eligible: false, reason: "SCAN_NOT_HEALTHY", productionCycleRunId: cycleId };
  }
  return { eligible: true, reason: "FULL_CYCLE_HEALTHY_PRODUCTION_SCAN", productionCycleRunId: cycleId };
}

const QUALIFYING = new Set(["BASE", "REACCEL"]);

function rejectStratumFor(stageReached: string | null): RejectCandidateEvent["stratum"] | null {
  if (stageReached === "discovered" || stageReached === "hard_filters") return "hard_filters";
  if (stageReached === "quantitative") return "quantitative";
  if (stageReached === "enriched") return "enriched_not_selected";
  return null;
}

/**
 * Enroll one healthy completed production scan.
 *
 * EXHAUSTIVE for the populations already tracked exhaustively (setup-qualified
 * and survivor events). SAMPLED, deterministic and capacity-guarded for
 * pre-milestone rejects. A reject enrollment never makes a token a survivor and
 * never sends it to Triage — it only requests future market observations.
 */
export async function enrollScanEvents(input: {
  scanRunId: string;
  completedAt: string;
  productionCycleRunId?: string | null;
  scannerPolicyVersion?: string | null;
  candidates: ScanEnrollmentCandidate[];
  rejectSamplingEnabled?: boolean;
  nowIso?: string;
}): Promise<ScanEnrollmentResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const eligibility =
    input.rejectSamplingEnabled === undefined
      ? await resolveRejectSamplingEligibility(input.scanRunId)
      : {
          eligible: input.rejectSamplingEnabled,
          reason: input.rejectSamplingEnabled ? "CALLER_FORCED_ENABLED" : "CALLER_FORCED_DISABLED",
          productionCycleRunId: input.productionCycleRunId ?? null,
        };
  const cycleRunId = input.productionCycleRunId ?? eligibility.productionCycleRunId;
  const enabled = REJECT_SAMPLING_ENABLED && eligibility.eligible;
  const result: ScanEnrollmentResult = {
    ok: true,
    version: OUTCOME_ENROLLMENT_VERSION,
    samplingVersion: SCANNER_REJECT_SAMPLING_VERSION,
    exhaustiveEnrolled: 0,
    rejectEligible: 0,
    rejectSampled: 0,
    rejectSamplingEnabled: enabled,
    eligibilityReason: eligibility.reason,
    newlyTrackedMints: 0,
    reusedTrackedMints: 0,
    capacity: null,
    strata: [],
    status: "ENROLLED",
    message: null,
  };

  try {
    const records: EnrollmentRecord[] = [];
    const rejects: RejectCandidateEvent[] = [];

    for (const candidate of input.candidates) {
      if (!candidate.contractAddress) continue;
      const qualified = candidate.setups.some((setup) => QUALIFYING.has(setup));
      const common = {
        contractAddress: candidate.contractAddress,
        tokenId: candidate.tokenId,
        chain: candidate.chain ?? "solana",
        sourceEventType: "SCAN_CANDIDATE",
        sourceEventId: `${input.scanRunId}:${candidate.contractAddress}`,
        scanRunId: input.scanRunId,
        productionCycleRunId: cycleRunId,
        cohortRef: `scan_runs:${input.scanRunId}`,
        decisionAt: input.completedAt,
        baseline: candidate.baseline,
        enrollmentType: "EXHAUSTIVE" as const,
        stageReached: candidate.stageReached,
        scannerPolicyVersion: input.scannerPolicyVersion ?? null,
      };

      if (qualified) {
        records.push(
          buildEnrollment({
            ...common,
            stage: "SCANNER_SETUP_QUALIFIED",
            decisionClass: candidate.setups.filter((s) => QUALIFYING.has(s)).sort().join("+"),
            eligiblePopulationN: null,
            inclusionProbability: 1,
          }),
        );
      }
      if (candidate.survivor) {
        records.push(
          buildEnrollment({
            ...common,
            stage: "SCANNER_SURVIVOR",
            decisionClass: "SURVIVOR",
            inclusionProbability: 1,
          }),
        );
      }

      // Pre-milestone reject: neither setup-qualified nor survivor in this scan.
      if (!qualified && !candidate.survivor) {
        const stratum = rejectStratumFor(candidate.stageReached);
        if (stratum) {
          rejects.push({
            contractAddress: candidate.contractAddress,
            tokenId: candidate.tokenId,
            stratum,
            stageReached: candidate.stageReached,
            rejectionReason: candidate.rejectionReason,
            rejectionDetails: candidate.rejectionDetails ?? null,
            laneRejections: candidate.laneRejections ?? null,
            baseline: candidate.baseline,
          });
        }
      }
    }

    result.exhaustiveEnrolled = records.length;
    result.rejectEligible = rejects.length;

    const samples = sampleRejects(input.scanRunId, rejects, {
      perStratum: MAX_REJECTS_PER_STRATUM,
      perScan: MAX_REJECTS_PER_SCAN,
    });
    result.strata = samples.map((s) => ({
      stratum: s.stratum,
      eligibleN: s.eligibleN,
      selectedK: s.selectedK,
      inclusionProbability: s.inclusionProbability,
    }));

    if (enabled) {
      const selectedMints = samples.flatMap((s) => s.selected.map((e) => e.contractAddress));
      const tracked = await alreadyTrackedMints(selectedMints);
      // Already-tracked mints reuse the existing observation stream and add no
      // provider load; only genuinely new mints count against capacity.
      const additional = selectedMints.filter((mint) => !tracked.has(mint)).length;
      result.newlyTrackedMints = additional;
      result.reusedTrackedMints = selectedMints.length - additional;
      const capacity = projectCapacity(await countTrackedMints(), additional);
      result.capacity = capacity;

      if (!capacity.safe) {
        result.message = `SAMPLING_CAPACITY_DEFERRED: ${capacity.reason}`;
        // Evaluation-only audit trail: the sample was computed but not enrolled.
        for (const sample of samples) {
          if (sample.eligibleN === 0) continue;
          await supabaseAdmin.from("outcome_enrollment_strata").upsert(
            {
              scan_run_id: input.scanRunId,
              sampling_policy_version: SCANNER_REJECT_SAMPLING_VERSION,
              stratum: sample.stratum,
              eligible_population_n: sample.eligibleN,
              selected_k: 0,
              inclusion_probability: 0,
              seed_material: sample.seedMaterial,
              selected_at: nowIso,
              deferral_reason: `SAMPLING_CAPACITY_DEFERRED:${capacity.reason}`,
            },
            { onConflict: "scan_run_id,sampling_policy_version,stratum", ignoreDuplicates: true },
          );
        }
      } else {
        for (const sample of samples) {
          if (sample.selectedK === 0) continue;
          await supabaseAdmin.from("outcome_enrollment_strata").upsert(
            {
              scan_run_id: input.scanRunId,
              sampling_policy_version: SCANNER_REJECT_SAMPLING_VERSION,
              stratum: sample.stratum,
              eligible_population_n: sample.eligibleN,
              selected_k: sample.selectedK,
              inclusion_probability: sample.inclusionProbability,
              seed_material: sample.seedMaterial,
              selected_at: nowIso,
              deferral_reason: null,
            },
            { onConflict: "scan_run_id,sampling_policy_version,stratum", ignoreDuplicates: true },
          );
          for (const event of sample.selected) {
            records.push(
              buildEnrollment({
                contractAddress: event.contractAddress,
                tokenId: event.tokenId,
                stage: "SCANNER_REJECT",
                decisionClass: event.stratum,
                sourceEventType: "SCAN_CANDIDATE_REJECT",
                sourceEventId: `${input.scanRunId}:${event.contractAddress}`,
                scanRunId: input.scanRunId,
                productionCycleRunId: cycleRunId,
                cohortRef: `scan_runs:${input.scanRunId}`,
                decisionAt: input.completedAt,
                baseline: event.baseline,
                enrollmentType: "SAMPLED",
                samplingPolicyVersion: SCANNER_REJECT_SAMPLING_VERSION,
                samplingStratum: event.stratum,
                eligiblePopulationN: sample.eligibleN,
                selectedK: sample.selectedK,
                inclusionProbability: sample.inclusionProbability,
                selectionSeed: String(
                  stableHash(selectionMaterial(input.scanRunId, event.contractAddress)),
                ),
                selectionReason: `DETERMINISTIC_HASH_RANK<=${sample.selectedK}`,
                selectedAt: nowIso,
                stageReached: event.stageReached,
                rejectionReason: event.rejectionReason,
                rejectionDetails: event.rejectionDetails,
                laneRejections: event.laneRejections,
                scannerPolicyVersion: input.scannerPolicyVersion ?? null,
              }),
            );
            result.rejectSampled += 1;
          }
        }
      }
    } else {
      result.message = `Reject sampling not applied: ${eligibility.reason}`;
    }

    await persistEnrollments(records);
    return result;
  } catch (error) {
    // Evaluation collection is never a production dependency.
    return {
      ...result,
      ok: false,
      status: "ENROLLMENT_FAILED",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface TriageEnrollmentDecision {
  contractAddress: string;
  tokenId: string | null;
  decision: TriageDecisionClass;
  baseline: FrozenBaseline | null;
}

export interface TriageEnrollmentResult {
  ok: boolean;
  version: string;
  enrolled: number;
  byClass: Record<string, number>;
  status: "ENROLLED" | "ENROLLMENT_FAILED";
  message: string | null;
}

/**
 * Triage baseline parity: SKIP, WATCH and DEEP_RESEARCH all receive an
 * evaluation baseline at the SAME stage and the SAME decision time, so the
 * three classes are prospectively comparable. No AI_SHORTLIST production
 * milestone is created for SKIP or WATCH — this is evaluation-only.
 */
export async function enrollTriageDecisions(input: {
  triageRunId: string;
  scanRunId: string | null;
  productionCycleRunId?: string | null;
  decidedAt: string;
  triagePolicyVersion?: string | null;
  decisions: TriageEnrollmentDecision[];
}): Promise<TriageEnrollmentResult> {
  const byClass: Record<string, number> = { SKIP: 0, WATCH: 0, DEEP_RESEARCH: 0 };
  try {
    const records = input.decisions
      .filter((d) => Boolean(d.contractAddress))
      .map((d) => {
        byClass[d.decision] = (byClass[d.decision] ?? 0) + 1;
        return buildEnrollment({
          contractAddress: d.contractAddress,
          tokenId: d.tokenId,
          stage: "AI_TRIAGE",
          decisionClass: d.decision,
          sourceEventType: "AI_TRIAGE_DECISION",
          sourceEventId: `${input.triageRunId}:${d.contractAddress}`,
          scanRunId: input.scanRunId,
          triageRunId: input.triageRunId,
          productionCycleRunId: input.productionCycleRunId ?? null,
          cohortRef: `ai_triage_runs:${input.triageRunId}`,
          decisionAt: input.decidedAt,
          baseline: d.baseline,
          enrollmentType: "EXHAUSTIVE",
          inclusionProbability: 1,
          selectionReason: "EXHAUSTIVE_TRIAGE_POPULATION",
          scannerPolicyVersion: input.triagePolicyVersion ?? null,
        });
      });
    await persistEnrollments(records);
    return {
      ok: true,
      version: OUTCOME_ENROLLMENT_VERSION,
      enrolled: records.length,
      byClass,
      status: "ENROLLED",
      message: null,
    };
  } catch (error) {
    return {
      ok: false,
      version: OUTCOME_ENROLLMENT_VERSION,
      enrolled: 0,
      byClass,
      status: "ENROLLMENT_FAILED",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Frozen baselines from enrollments, aggregated per exact mint for tracking. */
export async function loadEnrollmentBaselines(): Promise<
  Map<string, { tokenId: string | null; chain: string; earliest: string; latest: string; count: number }>
> {
  const out = new Map<
    string,
    { tokenId: string | null; chain: string; earliest: string; latest: string; count: number }
  >();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("outcome_enrollments")
      .select("contract_address, chain, token_id, baseline_at")
      .order("contract_address", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    for (const row of rows) {
      const mint = (row["contract_address"] as string | null)?.trim();
      const at = row["baseline_at"] as string | null;
      if (!mint || !at) continue;
      const current = out.get(mint);
      if (!current) {
        out.set(mint, {
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
    if (rows.length < PAGE) break;
  }
  return out;
}
