/**
 * `outcome_enrollment/v1` — evaluation-only enrollment contract (pure).
 *
 * An enrollment answers exactly one question:
 *
 *   "Why is this exact production decision EVENT being followed for future
 *    market observations?"
 *
 * It NEVER means selected, qualified, promoted, researched or thesis-worthy.
 * Nothing in this module — and nothing derived from it — may be read by
 * Scanner, Triage, Deep Research, Thesis, Entry or Sizing. It is downstream of
 * frozen decisions and write/evaluation-only.
 */

export const OUTCOME_ENROLLMENT_VERSION = "outcome_enrollment/v1";

/** Deterministic sampling policy identity. Part of the hash material. */
export const SAMPLING_POLICY_VERSION = "reject_sampling/v1";

/** Horizons an enrollment requests. Same set production evaluation uses. */
export const ENROLLMENT_HORIZONS = ["1h", "4h", "12h", "24h", "3d", "7d"] as const;

/**
 * Evaluation funnel stages. These are EVALUATION stages, deliberately named so
 * they can never be confused with production milestones (`SETUP_QUALIFIED`,
 * `SURVIVOR`, `AI_SHORTLIST`, `THESIS_CALL`).
 */
export const ENROLLMENT_STAGES = [
  "SCANNER_SETUP_QUALIFIED",
  "SCANNER_SURVIVOR",
  "SCANNER_REJECT",
  "AI_TRIAGE",
] as const;
export type EnrollmentStage = (typeof ENROLLMENT_STAGES)[number];

/** Triage decision classes kept comparable at the same stage and time. */
export const TRIAGE_DECISION_CLASSES = ["SKIP", "WATCH", "DEEP_RESEARCH"] as const;
export type TriageDecisionClass = (typeof TRIAGE_DECISION_CLASSES)[number];

export type EnrollmentType =
  | "EXHAUSTIVE"
  | "SAMPLED"
  /** Historical tracking rows. Never fabricated sampling metadata. */
  | "LEGACY_TRACKING_PROVENANCE_UNAVAILABLE";

export type BaselineValidity = "VALID" | "UNKNOWN" | "NOT_EVALUABLE";

/** Collection state of the enrollment itself. Never a market statement. */
export type EnrollmentTrackingStatus =
  | "ENROLLED"
  | "ENROLLMENT_FAILED"
  | "TRACKING_DELAYED"
  | "UNKNOWN";

/**
 * Scanner rejection strata. These reuse the EXISTING persisted scanner stage
 * vocabulary; no new trading labels are invented.
 */
export const REJECT_STRATA = ["hard_filters", "quantitative", "enriched_not_selected"] as const;
export type RejectStratum = (typeof REJECT_STRATA)[number];

/** Conservative evaluation-data budget. NOT a scanner threshold. */
export const MAX_REJECTS_PER_STRATUM = 4;
export const MAX_REJECTS_PER_SCAN = 12;

/**
 * Phase 3A.2A activation identity. Persisted on every new reject enrollment so
 * this cohort is distinguishable from the inert `outcome_enrollment/v1` era.
 * The SELECTION hash material still uses SAMPLING_POLICY_VERSION, so
 * deterministic selection is unchanged.
 */
export const SCANNER_REJECT_SAMPLING_VERSION = "scanner_reject_outcome_sampling/v1";

/**
 * Scanner reject sampling is ENABLED (Phase 3A.2A) but only for healthy
 * production Full Cycle scans, at 4 per stratum / 12 per scan. At that budget
 * the projected additional tracked mints stay inside the ~2x provider-load
 * ceiling; the capacity guard below still enforces it at runtime.
 */
export const REJECT_SAMPLING_ENABLED = true;

/** Provider-load ceiling: enrollment may not more than ~2x tracked mints. */
export const CAPACITY_MAX_LOAD_MULTIPLE = 2;

export interface FrozenBaseline {
  at: string;
  marketCapUsd: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

/**
 * Baseline validity from the DECISION-TIME state only. A missing baseline stays
 * NOT_EVALUABLE / UNKNOWN and is never reconstructed from later market data.
 */
export function baselineValidity(baseline: FrozenBaseline | null): BaselineValidity {
  if (!baseline) return "NOT_EVALUABLE";
  const usable = (v: number | null) => typeof v === "number" && Number.isFinite(v) && v > 0;
  if (usable(baseline.marketCapUsd) && usable(baseline.priceUsd)) return "VALID";
  if (usable(baseline.marketCapUsd) || usable(baseline.priceUsd)) return "UNKNOWN";
  return "NOT_EVALUABLE";
}

export interface EnrollmentRecord {
  contractAddress: string;
  tokenId: string | null;
  chain: string;
  stage: EnrollmentStage;
  decisionClass: string | null;
  sourceEventType: string;
  sourceEventId: string | null;
  scanRunId: string | null;
  triageRunId: string | null;
  productionCycleRunId: string | null;
  cohortRef: string | null;
  decisionAt: string;
  baseline: FrozenBaseline | null;
  baselineValidity: BaselineValidity;
  enrollmentType: EnrollmentType;
  samplingPolicyVersion: string | null;
  samplingStratum: string | null;
  eligiblePopulationN: number | null;
  selectedK: number | null;
  inclusionProbability: number | null;
  selectionSeed: string | null;
  selectionReason: string | null;
  selectedAt: string | null;
  sampledForOutcomes: boolean;
  horizons: readonly string[];
  stageReached: string | null;
  rejectionReason: string | null;
  rejectionDetails: unknown;
  laneRejections: unknown;
  scannerPolicyVersion: string | null;
  trackingStatus: EnrollmentTrackingStatus;
  schemaVersion: string;
}

/** FNV-1a 32-bit. Stable across runs and processes — no Math.random anywhere. */
export function stableHash(material: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function selectionMaterial(
  scanRunId: string,
  mint: string,
  policyVersion = SAMPLING_POLICY_VERSION,
): string {
  return `${policyVersion}|${scanRunId}|${mint}`;
}

export interface RejectCandidateEvent {
  contractAddress: string;
  tokenId: string | null;
  stratum: RejectStratum;
  stageReached: string | null;
  rejectionReason: string | null;
  rejectionDetails: unknown;
  laneRejections: unknown;
  baseline: FrozenBaseline | null;
}

export interface StratumSample {
  stratum: RejectStratum;
  eligibleN: number;
  selectedK: number;
  inclusionProbability: number;
  seedMaterial: string;
  selected: RejectCandidateEvent[];
}

/**
 * Deterministic stratified sample of pre-milestone Scanner rejects.
 *
 * Selection reads ONLY immutable identifiers (scan id, exact mint, policy
 * version). No outcome, no later market state and no model can influence it,
 * so the same scan always yields the same sample.
 */
export function sampleRejects(
  scanRunId: string,
  events: RejectCandidateEvent[],
  options: {
    perStratum?: number;
    perScan?: number;
    policyVersion?: string;
  } = {},
): StratumSample[] {
  const perStratum = options.perStratum ?? MAX_REJECTS_PER_STRATUM;
  const perScan = options.perScan ?? MAX_REJECTS_PER_SCAN;
  const policyVersion = options.policyVersion ?? SAMPLING_POLICY_VERSION;

  const byStratum = new Map<RejectStratum, RejectCandidateEvent[]>();
  const seen = new Set<string>();
  for (const event of events) {
    if (!event.contractAddress || seen.has(event.contractAddress)) continue;
    seen.add(event.contractAddress);
    const list = byStratum.get(event.stratum) ?? [];
    list.push(event);
    byStratum.set(event.stratum, list);
  }

  const out: StratumSample[] = [];
  let remaining = perScan;
  for (const stratum of REJECT_STRATA) {
    const eligible = byStratum.get(stratum) ?? [];
    const seedMaterial = `${policyVersion}|${scanRunId}|${stratum}`;
    if (eligible.length === 0 || remaining <= 0) {
      out.push({
        stratum,
        eligibleN: eligible.length,
        selectedK: 0,
        inclusionProbability: 0,
        seedMaterial,
        selected: [],
      });
      continue;
    }
    const ranked = [...eligible].sort((a, b) => {
      const ha = stableHash(selectionMaterial(scanRunId, a.contractAddress, policyVersion));
      const hb = stableHash(selectionMaterial(scanRunId, b.contractAddress, policyVersion));
      if (ha !== hb) return ha - hb;
      return a.contractAddress.localeCompare(b.contractAddress);
    });
    const take = Math.min(perStratum, eligible.length, remaining);
    const selected = ranked.slice(0, take);
    remaining -= selected.length;
    out.push({
      stratum,
      eligibleN: eligible.length,
      selectedK: selected.length,
      // ACTUAL inclusion probability, not the requested budget.
      inclusionProbability: eligible.length > 0 ? selected.length / eligible.length : 0,
      seedMaterial,
      selected,
    });
  }
  return out;
}

/**
 * outcome_capacity_guard/v2 — zero-baseline bootstrap.
 * tracked > 0: unchanged ratio guard (projected/current <= 2x).
 * tracked = 0: no fake denominator; an absolute allowance of genuinely NEW
 * mints (matches the 12/scan reject maximum). Reused mints never count.
 */
export const CAPACITY_GUARD_VERSION = "outcome_capacity_guard/v2";
export const BOOTSTRAP_NEW_MINT_ALLOWANCE = 12;

export interface CapacityProjection {
  currentTrackedMints: number;
  /** New unique mints this enrollment pass would add to the sampler. */
  additionalMints: number;
  projectedTrackedMints: number;
  loadMultiple: number;
  safe: boolean;
  reason: string;
  guardVersion: string;
  mode: "RATIO_GUARD" | "ZERO_BASELINE_BOOTSTRAP";
}

export function projectCapacity(
  currentTrackedMints: number,
  additionalMints: number,
  maxMultiple = CAPACITY_MAX_LOAD_MULTIPLE,
): CapacityProjection {
  const projected = currentTrackedMints + additionalMints;
  if (currentTrackedMints <= 0) {
    const safe = additionalMints <= BOOTSTRAP_NEW_MINT_ALLOWANCE;
    return {
      currentTrackedMints,
      additionalMints,
      projectedTrackedMints: projected,
      loadMultiple: additionalMints > 0 ? Infinity : 1,
      safe,
      reason: safe
        ? `ZERO_BASELINE_BOOTSTRAP_WITHIN_${BOOTSTRAP_NEW_MINT_ALLOWANCE}`
        : `ZERO_BASELINE_BOOTSTRAP_${additionalMints}_EXCEEDS_${BOOTSTRAP_NEW_MINT_ALLOWANCE}`,
      guardVersion: CAPACITY_GUARD_VERSION,
      mode: "ZERO_BASELINE_BOOTSTRAP",
    };
  }
  const multiple = projected / currentTrackedMints;
  const safe = multiple <= maxMultiple;
  return {
    currentTrackedMints,
    additionalMints,
    projectedTrackedMints: projected,
    loadMultiple: Number(multiple.toFixed(3)),
    safe,
    reason: safe ? "WITHIN_CAPACITY" : `PROJECTED_LOAD_${multiple.toFixed(2)}X_EXCEEDS_${maxMultiple}X`,
    guardVersion: CAPACITY_GUARD_VERSION,
    mode: "RATIO_GUARD",
  };
}

/**
 * Entry-evaluation provenance classes. Historical Entry evaluations predate
 * real canonical Thesis Calls and must never be mixed into future canonical
 * Entry learning data.
 */
export type EntryLearningClass =
  | "CANONICAL_ENTRY_WITH_THESIS_CALL"
  | "LEGACY_DIAGNOSTIC_PRE_THESIS_CALL_GATE";

export function classifyEntryEvaluation(input: {
  thesisCallEventId: string | null;
}): EntryLearningClass {
  return input.thesisCallEventId
    ? "CANONICAL_ENTRY_WITH_THESIS_CALL"
    : "LEGACY_DIAGNOSTIC_PRE_THESIS_CALL_GATE";
}

/** Read semantics for tracking rows that predate enrollment provenance. */
export function legacyEnrollmentType(hasEnrollment: boolean): EnrollmentType {
  return hasEnrollment ? "EXHAUSTIVE" : "LEGACY_TRACKING_PROVENANCE_UNAVAILABLE";
}

/** Build one enrollment record with the invariants applied. */
export function buildEnrollment(input: {
  contractAddress: string;
  tokenId?: string | null;
  chain?: string;
  stage: EnrollmentStage;
  decisionClass?: string | null;
  sourceEventType: string;
  sourceEventId?: string | null;
  scanRunId?: string | null;
  triageRunId?: string | null;
  productionCycleRunId?: string | null;
  cohortRef?: string | null;
  decisionAt: string;
  baseline: FrozenBaseline | null;
  enrollmentType: EnrollmentType;
  samplingPolicyVersion?: string | null;
  samplingStratum?: string | null;
  eligiblePopulationN?: number | null;
  selectedK?: number | null;
  inclusionProbability?: number | null;
  selectionSeed?: string | null;
  selectionReason?: string | null;
  selectedAt?: string | null;
  stageReached?: string | null;
  rejectionReason?: string | null;
  rejectionDetails?: unknown;
  laneRejections?: unknown;
  scannerPolicyVersion?: string | null;
  trackingStatus?: EnrollmentTrackingStatus;
}): EnrollmentRecord {
  const sampled = input.enrollmentType === "SAMPLED";
  return {
    contractAddress: input.contractAddress,
    tokenId: input.tokenId ?? null,
    chain: input.chain ?? "solana",
    stage: input.stage,
    decisionClass: input.decisionClass ?? null,
    sourceEventType: input.sourceEventType,
    sourceEventId: input.sourceEventId ?? null,
    scanRunId: input.scanRunId ?? null,
    triageRunId: input.triageRunId ?? null,
    productionCycleRunId: input.productionCycleRunId ?? null,
    cohortRef: input.cohortRef ?? null,
    decisionAt: input.decisionAt,
    baseline: input.baseline,
    baselineValidity: baselineValidity(input.baseline),
    enrollmentType: input.enrollmentType,
    samplingPolicyVersion: input.samplingPolicyVersion ?? (sampled ? SAMPLING_POLICY_VERSION : null),
    samplingStratum: input.samplingStratum ?? null,
    eligiblePopulationN: input.eligiblePopulationN ?? null,
    // An exhaustive population has inclusion probability exactly 1.
    selectedK: input.selectedK ?? null,
    inclusionProbability: input.inclusionProbability ?? (sampled ? null : 1),
    selectionSeed: input.selectionSeed ?? null,
    selectionReason: input.selectionReason ?? (sampled ? null : "EXHAUSTIVE_POPULATION"),
    selectedAt: input.selectedAt ?? input.decisionAt,
    sampledForOutcomes: sampled,
    horizons: ENROLLMENT_HORIZONS,
    stageReached: input.stageReached ?? null,
    rejectionReason: input.rejectionReason ?? null,
    rejectionDetails: input.rejectionDetails ?? null,
    laneRejections: input.laneRejections ?? null,
    scannerPolicyVersion: input.scannerPolicyVersion ?? null,
    trackingStatus: input.trackingStatus ?? "ENROLLED",
    schemaVersion: OUTCOME_ENROLLMENT_VERSION,
  };
}
