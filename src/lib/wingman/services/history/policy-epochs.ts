/**
 * Policy epochs for funnel milestones (pure).
 *
 * A policy epoch records WHICH operational policy was actually live when a
 * funnel event happened. It is frozen at the event and never recomputed:
 * an old call is never re-evaluated against today's rules (that would be
 * hindsight bias), and a future policy change creates a NEW epoch rather than
 * redefining an existing one.
 *
 * Scanner policy and AI policy are versioned INDEPENDENTLY — they never share
 * one global version string.
 */

export const POLICY_EPOCHS = ["LEGACY_V0", "CURRENT_V1", "UNKNOWN_POLICY"] as const;
export type PolicyEpoch = (typeof POLICY_EPOCHS)[number];

/**
 * Scanner selection policy that is live in the code today. CURRENT_V1 means
 * ALL of these were operational together at selection time:
 *   - Universe Eligibility operational exclusion
 *   - Structural FAIL operational veto
 *   - Recent Catastrophic Collapse operational veto
 *   - quality-capped Survivor allocation (survivor limit is a maximum)
 *   - maxNoneGlobalSurvivors = 5
 *   - recognized setups = BASE / REACCEL only
 *   - standalone MOMENTUM is a signal, not a recognized setup
 *   - MOMENTUM-only candidates consume NONE exception capacity
 *
 * When any of that changes, bump to a NEW version + epoch (CURRENT_V2). Never
 * reuse CURRENT_V1 with different semantics.
 */
export const SELECTION_POLICY_VERSION = "scanner_selection/v1";
export const CURRENT_POLICY_EPOCH: PolicyEpoch = "CURRENT_V1";

/** AI epochs are versioned separately and are not created by the scanner. */
export const AI_POLICY_VERSION: string | null = null;
export const RESEARCH_MODEL_VERSION: string | null = null;

/** Scan runs recorded before policy stamping existed are LEGACY_V0. */
export function epochForRun(run: {
  selectionPolicyVersion?: string | null;
  policyEpoch?: string | null;
} | null | undefined): PolicyEpoch {
  if (!run) return "UNKNOWN_POLICY";
  const stamped = run.policyEpoch;
  if (stamped === "CURRENT_V1" || stamped === "LEGACY_V0") return stamped;
  if (run.selectionPolicyVersion === SELECTION_POLICY_VERSION) return "CURRENT_V1";
  return "LEGACY_V0";
}

/**
 * Epoch of a milestone at backfill time. The originating scan is the only
 * authoritative evidence — a milestone with no originating scan stays
 * UNKNOWN_POLICY rather than being guessed.
 */
export function epochForMilestone(
  sourceScanId: string | null | undefined,
  runs: Map<string, { selectionPolicyVersion?: string | null; policyEpoch?: string | null }>,
): PolicyEpoch {
  if (!sourceScanId) return "UNKNOWN_POLICY";
  const run = runs.get(sourceScanId);
  if (!run) return "UNKNOWN_POLICY";
  return epochForRun(run);
}

export type PolicyFilter = "CURRENT" | "ALL";

export const POLICY_LABELS: Record<PolicyEpoch, string> = {
  CURRENT_V1: "Current policy",
  LEGACY_V0: "Legacy policy",
  UNKNOWN_POLICY: "Policy unknown",
};

/** CURRENT shows only CURRENT_V1. ALL keeps every historical record. */
export function filterByPolicy<T extends { policyEpoch?: PolicyEpoch | string | null }>(
  rows: T[],
  filter: PolicyFilter,
): T[] {
  if (filter === "ALL") return rows;
  return rows.filter((row) => row.policyEpoch === CURRENT_POLICY_EPOCH);
}

/**
 * When `scanner_selection/v1` became active in the code. This is DEPLOYMENT,
 * not realization: a policy can be deployed and still have produced no healthy
 * scan (for example while a discovery provider quota is exhausted).
 */
export interface PolicyRunRecord {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  tokensDiscovered: number | null;
  /** `discovery_health/v1` state, when the run recorded one. */
  discoveryHealth?: string | null;
  selectionPolicyVersion?: string | null;
  policyEpoch?: string | null;
}

/**
 * A run only counts as a real observation of the market when it completed AND
 * discovery actually produced a universe. A failed run, and a run whose
 * discovery provider was unavailable, observed nothing.
 */
export function isHealthyCompletedRun(run: PolicyRunRecord): boolean {
  if (run.status !== "completed") return false;
  if (run.discoveryHealth === "PROVIDER_UNAVAILABLE") return false;
  return (run.tokensDiscovered ?? 0) > 0;
}

/** Only a healthy completed run may create funnel milestones. */
export function canRunCreateMilestones(run: PolicyRunRecord): boolean {
  return isHealthyCompletedRun(run);
}

export interface PolicyBoundary {
  policyVersion: string;
  policyEpoch: PolicyEpoch;
  /** Earliest run stamped with this policy, whatever its outcome. */
  deployedAt: string | null;
  /** Earliest HEALTHY COMPLETED run under this policy. Null until observed. */
  firstHealthyRunId: string | null;
  firstHealthyRunAt: string | null;
  /** False while the epoch is deployed but has produced no healthy scan. */
  realized: boolean;
}

/**
 * Realized boundary of the current scanner policy.
 *
 * A FAILED or provider-unavailable scan can never establish the boundary, so
 * the boundary stays explicitly unrealized (`firstHealthyRunAt = null`) rather
 * than being invented. The first healthy completed v1 run establishes it
 * automatically, once, because this is derived from persisted runs.
 */
export function deriveCurrentPolicyBoundary(runs: PolicyRunRecord[]): PolicyBoundary {
  const stamped = runs.filter(
    (r) => epochForRun(r) === CURRENT_POLICY_EPOCH && r.selectionPolicyVersion === SELECTION_POLICY_VERSION,
  );
  const time = (r: PolicyRunRecord) => Date.parse(r.startedAt ?? r.completedAt ?? "") || 0;
  const ordered = [...stamped].sort((a, b) => time(a) - time(b));
  const healthy = ordered.filter(isHealthyCompletedRun);
  const first = healthy[0] ?? null;
  return {
    policyVersion: SELECTION_POLICY_VERSION,
    policyEpoch: CURRENT_POLICY_EPOCH,
    deployedAt: ordered[0]?.startedAt ?? null,
    firstHealthyRunId: first?.id ?? null,
    firstHealthyRunAt: first?.completedAt ?? null,
    realized: Boolean(first),
  };
}
