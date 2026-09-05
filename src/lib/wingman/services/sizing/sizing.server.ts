/**
 * Sizing v1 — server boundary (server-only).
 *
 * Sizing may ONLY run on official production THESIS_CALL milestones. It never
 * creates calls, never mutates Thesis or Entry records, never rewrites an
 * earlier sizing recommendation, and never touches execution. Records are
 * append-only: a new Entry evaluation or eligibility change produces a NEW
 * row so History can replay what was recommended at each moment.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadLiveCalls, type LiveCall } from "@/lib/wingman/services/live-calls.server";
import {
  computeSizing,
  SIZING_POLICY_VERSION,
  type SizingEntryState,
  type SizingRecommendation,
} from "./contracts";

const ENTRY_STATES: SizingEntryState[] = [
  "WATCH",
  "SETTING_UP",
  "BUY_ZONE",
  "ACCEPTABLE",
  "EXTENDED",
  "BROKEN",
  "UNKNOWN",
];

function entryStateOf(state: string | null): SizingEntryState {
  if (state && (ENTRY_STATES as string[]).includes(state)) return state as SizingEntryState;
  return "NOT_EVALUATED";
}

/** Deterministic sizing for one live call. Pure derivation, no writes. */
export function sizingForLiveCall(call: LiveCall): SizingRecommendation {
  return computeSizing({
    mint: call.mint,
    thesisCallId: call.call.milestoneId,
    thesisReportId: call.thesis?.reportId ?? null,
    entryEvaluationId: call.current.entryEvaluationId,
    thesisScore: call.thesis?.thesisScore ?? null,
    evidenceConfidence: call.thesis?.evidenceConfidence ?? null,
    structuralStatus: call.current.structuralStatus,
    operationalStatus: call.current.operational.status,
    operationalReason: call.current.operational.reason,
    entryState: entryStateOf(call.current.entryState),
    priceHistorySource:
      (call.current.priceHistorySource as SizingRecommendation["priceHistorySource"]) ?? null,
    timingResolution:
      (call.current.timingResolution as SizingRecommendation["timingResolution"]) ?? null,
    isCalibration: false,
  });
}

export interface LiveCallSizingResult {
  policyVersion: string;
  callCount: number;
  sizings: SizingRecommendation[];
  persisted: number;
  note: string;
}

/** Signature used to avoid appending duplicate identical recommendations. */
function signature(r: SizingRecommendation): string {
  return [
    r.sizingPolicyVersion,
    r.thesisCallId,
    r.thesisScore,
    r.entryState,
    r.priceHistorySource,
    r.timingResolution,
    r.structuralRisk,
    r.operationalStatus,
    r.effectiveMaxAllocationPct,
    r.deployNowPct,
  ].join("|");
}

async function latestSignatures(callIds: string[]): Promise<Map<string, string>> {
  if (callIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("sizing_recommendations")
    .select(
      "thesis_call_id, sizing_policy_version, thesis_score, entry_state, price_history_source, timing_resolution, structural_risk, operational_status, effective_max_allocation_pct, deploy_now_pct, calculated_at",
    )
    .in("thesis_call_id", callIds)
    .eq("is_calibration", false)
    .order("calculated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const out = new Map<string, string>();
  for (const row of (data as Record<string, unknown>[]) ?? []) {
    const id = row["thesis_call_id"] as string;
    if (out.has(id)) continue;
    out.set(
      id,
      [
        row["sizing_policy_version"],
        id,
        row["thesis_score"] == null ? null : Number(row["thesis_score"]),
        row["entry_state"],
        row["price_history_source"],
        row["timing_resolution"],
        row["structural_risk"],
        row["operational_status"],
        Number(row["effective_max_allocation_pct"]),
        Number(row["deploy_now_pct"]),
      ].join("|"),
    );
  }
  return out;
}

function toRow(r: SizingRecommendation) {
  return {
    sizing_policy_version: r.sizingPolicyVersion,
    mint: r.mint,
    thesis_call_id: r.thesisCallId,
    thesis_report_id: r.thesisReportId,
    entry_evaluation_id: r.entryEvaluationId,
    thesis_score: r.thesisScore,
    evidence_confidence: r.evidenceConfidence,
    conviction_band: r.convictionBand,
    conviction_band_label: r.convictionBandLabel,
    raw_interpolated_max_pct: r.rawInterpolatedMaxPct,
    structural_risk: r.structuralRisk,
    structural_modifier: r.structuralModifier,
    evidence_cap_multiplier: r.evidenceCapMultiplier,
    effective_max_allocation_pct: r.effectiveMaxAllocationPct,
    entry_state: r.entryState,
    price_history_source: r.priceHistorySource,
    timing_resolution: r.timingResolution,
    deployment_fraction: r.deploymentFraction,
    deployment_label: r.deploymentLabel,
    deploy_now_pct: r.deployNowPct,
    reserve_pct: r.reservePct,
    operational_status: r.operationalStatus,
    reason_codes: r.reasonCodes,
    is_calibration: r.isCalibration,
    calculated_at: r.calculatedAt,
  };
}

/**
 * Computes (and optionally appends) sizing for every production THESIS_CALL.
 * With zero calls this returns the honest empty result — no fabricated rows.
 */
export async function runLiveCallSizing(options?: {
  persist?: boolean;
}): Promise<LiveCallSizingResult> {
  const { calls } = await loadLiveCalls();
  if (calls.length === 0) {
    return {
      policyVersion: SIZING_POLICY_VERSION,
      callCount: 0,
      sizings: [],
      persisted: 0,
      note: "No production calls currently require sizing.",
    };
  }

  const sizings = calls.map(sizingForLiveCall);
  let persisted = 0;
  if (options?.persist !== false) {
    const previous = await latestSignatures(
      sizings.map((s) => s.thesisCallId).filter((id): id is string => Boolean(id)),
    );
    const fresh = sizings.filter(
      (s) => !s.thesisCallId || previous.get(s.thesisCallId) !== signature(s),
    );
    if (fresh.length > 0) {
      const { error } = await supabaseAdmin
        .from("sizing_recommendations")
        .insert(fresh.map(toRow));
      if (error) throw new Error(error.message);
      persisted = fresh.length;
    }
  }

  return {
    policyVersion: SIZING_POLICY_VERSION,
    callCount: calls.length,
    sizings,
    persisted,
    note: `Sizing computed for ${calls.length} production call(s). Percentages are of the Wingman strategy bankroll.`,
  };
}

/** Append-only sizing history for one call, newest first. Read-only. */
export async function loadSizingHistory(thesisCallId: string) {
  const { data, error } = await supabaseAdmin
    .from("sizing_recommendations")
    .select("*")
    .eq("thesis_call_id", thesisCallId)
    .order("calculated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]) ?? [];
}
