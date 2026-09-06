/**
 * research_spend_policy/v1 — operational spend controls for expensive external
 * Deep Research (pure, deterministic, versioned).
 *
 * This layer sits strictly BETWEEN AI Triage and Deep Research:
 *
 *   Scanner → Research Packet → AI Triage → RESEARCH SPEND CONTROL → Deep Research
 *
 * It NEVER changes Scanner qualification, Quantitative Research Priority, AI
 * Triage decisions, Thesis scoring or gates. A deferral is an OPERATIONAL
 * state, not a Triage decision and NEVER negative evidence about a token:
 * `DEFERRED_RECENT_RESEARCH` and `DEFERRED_BUDGET` mean "we did not pay for
 * research right now", nothing more. Exact Solana mint is the only identity.
 */

export const RESEARCH_SPEND_POLICY_VERSION = "research_spend_policy/v1";

export interface ResearchSpendConfig {
  /**
   * Per-mint cooldown after a canonical PRODUCTION Deep Research artifact.
   * Initial operational guardrail only — NOT a statistically optimised
   * parameter and not a trading parameter.
   */
  fullDeepResearchCooldownMinutes: number;
  /** Shorter, separately configurable cooldown for retryable incomplete research. */
  incompleteResearchRetryCooldownMinutes: number;
  /** Max Deep Research jobs allowed per production scan cohort. */
  maxDeepResearchPerScan: number;
  /** Max Deep Research jobs allowed inside the rolling budget window. */
  maxDeepResearchPerWindow: number;
  /** Length of the rolling budget window, in hours. */
  budgetWindowHours: number;
  /** Absolute top-10 holder concentration change (pp) treated as material. */
  holderTop10MaterialDeltaPct: number;
  /** Relative holder-count change treated as material (0.5 = ±50%). */
  holderCountMaterialChangeRatio: number;
}

export const DEFAULT_RESEARCH_SPEND_CONFIG: ResearchSpendConfig = {
  fullDeepResearchCooldownMinutes: 6 * 60,
  incompleteResearchRetryCooldownMinutes: 60,
  maxDeepResearchPerScan: 12,
  maxDeepResearchPerWindow: 48,
  budgetWindowHours: 24,
  holderTop10MaterialDeltaPct: 10,
  holderCountMaterialChangeRatio: 0.5,
};

export type SpendDecision =
  | "RUN_DEEP_RESEARCH"
  | "DEFERRED_RECENT_RESEARCH"
  | "DEFERRED_BUDGET";

export type SpendDecisionReason =
  | "NO_PRIOR_PRODUCTION_RESEARCH"
  | "PRIOR_RESEARCH_OUTSIDE_COOLDOWN"
  | "MATERIAL_CHANGE_OVERRIDE"
  | "RETRY_PREVIOUS_RESEARCH_INCOMPLETE"
  | "PRIOR_RESEARCH_WITHIN_COOLDOWN"
  | "PRIOR_INCOMPLETE_RESEARCH_WITHIN_RETRY_COOLDOWN"
  | "SCAN_BUDGET_EXHAUSTED"
  | "WINDOW_BUDGET_EXHAUSTED";

/**
 * Deterministic, packet-level changes that can materially alter external
 * research conclusions. Price, volume, quant/AI rank, setup flips, recurrence
 * and "it showed up again" are DELIBERATELY excluded — they matter to Scanner
 * and Entry, but never justify paying for the same external research again.
 */
export type MaterialChangeReasonCode =
  | "HOLDER_CONCENTRATION_NEWLY_AVAILABLE"
  | "HOLDER_DISTRIBUTION_MATERIAL_CHANGE"
  | "STRUCTURAL_STATUS_CHANGED"
  | "PAIR_PROVENANCE_CHANGED";

/** Explicitly retryable incomplete research statuses. Never "bad token". */
export const RETRYABLE_INCOMPLETE_RESEARCH_STATUSES = [
  "search_limited",
  "search_unavailable",
  "insufficient_evidence",
  "partial",
] as const;

export function isRetryableIncompleteResearch(status: string | null): boolean {
  if (!status) return false;
  return (RETRYABLE_INCOMPLETE_RESEARCH_STATUSES as readonly string[]).includes(
    status.toLowerCase(),
  );
}

/** Packet-level facts compared across cohorts. Deterministic values only. */
export interface SpendPacketFacts {
  holderCount: number | null;
  top10Pct: number | null;
  top20Pct: number | null;
  structuralStatus: string | null;
  pairAddress: string | null;
  dex: string | null;
}

export interface PriorProductionResearch {
  reportId: string;
  deepResearchRunId: string | null;
  scanRunId: string | null;
  triageRunId: string | null;
  researchedAt: string;
  status: string | null;
  dossierVersion: string | null;
  searchHealth: string | null;
  coveragePct: number | null;
  /** Packet facts as they were for the cohort that produced this artifact. */
  packetFacts: SpendPacketFacts | null;
}

export interface SpendCandidateInput {
  mint: string;
  triageRank: number | null;
  quantRank: number | null;
  recurrenceState: string | null;
  recurrenceNumber: number | null;
  researchPacketId: string | null;
  triageDecisionId: string | null;
  tokenId: string | null;
  packetFacts: SpendPacketFacts | null;
  prior: PriorProductionResearch | null;
}

export interface SpendBudgetState {
  scanUsed: number;
  scanLimit: number;
  windowUsed: number;
  windowLimit: number;
}

export interface SpendDecisionRecord {
  mint: string;
  triageRank: number | null;
  quantRank: number | null;
  recurrenceState: string | null;
  recurrenceNumber: number | null;
  researchPacketId: string | null;
  triageDecisionId: string | null;
  tokenId: string | null;
  policyVersion: string;
  spendDecision: SpendDecision;
  spendDecisionReason: SpendDecisionReason;
  priorResearchReportId: string | null;
  priorResearchRunId: string | null;
  priorScanRunId: string | null;
  priorTriageRunId: string | null;
  priorResearchAt: string | null;
  priorResearchAgeMinutes: number | null;
  priorResearchStatus: string | null;
  priorResearchVersion: string | null;
  priorSearchHealth: string | null;
  cooldownMinutes: number | null;
  cooldownRemainingMinutes: number | null;
  nextEligibleAt: string | null;
  materialChangeOverride: boolean;
  materialChangeReasonCodes: MaterialChangeReasonCode[];
  budgetState: string | null;
  budgetScanUsed: number | null;
  budgetScanLimit: number | null;
  budgetWindowUsed: number | null;
  budgetWindowLimit: number | null;
}

/**
 * Deterministic material-change detection. Returns the exact reason codes; an
 * empty array means "no research-relevant change" and the cooldown stands.
 * There is no free-form / model-judged override in v1.
 */
export function detectMaterialChange(
  prior: SpendPacketFacts | null,
  current: SpendPacketFacts | null,
  config: ResearchSpendConfig = DEFAULT_RESEARCH_SPEND_CONFIG,
): MaterialChangeReasonCode[] {
  const codes: MaterialChangeReasonCode[] = [];
  if (!prior || !current) return codes;

  // A previously unavailable holder subdomain becoming available is new
  // research-relevant evidence, never an implication about concentration.
  const priorConcentration = prior.top10Pct ?? prior.top20Pct;
  const currentConcentration = current.top10Pct ?? current.top20Pct;
  if (priorConcentration === null && currentConcentration !== null) {
    codes.push("HOLDER_CONCENTRATION_NEWLY_AVAILABLE");
  } else if (priorConcentration !== null && currentConcentration !== null) {
    if (
      Math.abs(currentConcentration - priorConcentration) >=
      config.holderTop10MaterialDeltaPct
    ) {
      codes.push("HOLDER_DISTRIBUTION_MATERIAL_CHANGE");
    }
  }

  if (
    !codes.includes("HOLDER_DISTRIBUTION_MATERIAL_CHANGE") &&
    typeof prior.holderCount === "number" &&
    prior.holderCount > 0 &&
    typeof current.holderCount === "number"
  ) {
    const ratio = Math.abs(current.holderCount - prior.holderCount) / prior.holderCount;
    if (ratio >= config.holderCountMaterialChangeRatio) {
      codes.push("HOLDER_DISTRIBUTION_MATERIAL_CHANGE");
    }
  }

  if (
    prior.structuralStatus &&
    current.structuralStatus &&
    prior.structuralStatus !== current.structuralStatus
  ) {
    codes.push("STRUCTURAL_STATUS_CHANGED");
  }

  const pairChanged =
    Boolean(prior.pairAddress) &&
    Boolean(current.pairAddress) &&
    prior.pairAddress !== current.pairAddress;
  const dexChanged = Boolean(prior.dex) && Boolean(current.dex) && prior.dex !== current.dex;
  if (pairChanged || dexChanged) codes.push("PAIR_PROVENANCE_CHANGED");

  return codes;
}

function minutesBetween(fromIso: string, nowMs: number): number | null {
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((nowMs - t) / 60000));
}

interface CooldownOutcome {
  allow: boolean;
  reason: SpendDecisionReason;
  cooldownMinutes: number | null;
  cooldownRemainingMinutes: number | null;
  nextEligibleAt: string | null;
  materialChangeOverride: boolean;
  materialChangeReasonCodes: MaterialChangeReasonCode[];
  ageMinutes: number | null;
}

/** Per-mint cooldown evaluation, independent of the global budget guard. */
export function evaluateCooldown(
  candidate: SpendCandidateInput,
  nowMs: number,
  config: ResearchSpendConfig = DEFAULT_RESEARCH_SPEND_CONFIG,
): CooldownOutcome {
  const none: CooldownOutcome = {
    allow: true,
    reason: "NO_PRIOR_PRODUCTION_RESEARCH",
    cooldownMinutes: null,
    cooldownRemainingMinutes: null,
    nextEligibleAt: null,
    materialChangeOverride: false,
    materialChangeReasonCodes: [],
    ageMinutes: null,
  };
  const prior = candidate.prior;
  if (!prior) return none;

  const incomplete = isRetryableIncompleteResearch(prior.status);
  const cooldownMinutes = incomplete
    ? config.incompleteResearchRetryCooldownMinutes
    : config.fullDeepResearchCooldownMinutes;
  const ageMinutes = minutesBetween(prior.researchedAt, nowMs);
  if (ageMinutes === null) return none;

  const remaining = Math.max(0, cooldownMinutes - ageMinutes);
  const nextEligibleAt = new Date(
    Date.parse(prior.researchedAt) + cooldownMinutes * 60000,
  ).toISOString();

  if (remaining === 0) {
    return {
      allow: true,
      reason: incomplete
        ? "RETRY_PREVIOUS_RESEARCH_INCOMPLETE"
        : "PRIOR_RESEARCH_OUTSIDE_COOLDOWN",
      cooldownMinutes,
      cooldownRemainingMinutes: 0,
      nextEligibleAt,
      materialChangeOverride: false,
      materialChangeReasonCodes: [],
      ageMinutes,
    };
  }

  const codes = detectMaterialChange(prior.packetFacts, candidate.packetFacts, config);
  if (codes.length > 0) {
    return {
      allow: true,
      reason: "MATERIAL_CHANGE_OVERRIDE",
      cooldownMinutes,
      cooldownRemainingMinutes: remaining,
      nextEligibleAt,
      materialChangeOverride: true,
      materialChangeReasonCodes: codes,
      ageMinutes,
    };
  }

  return {
    allow: false,
    reason: incomplete
      ? "PRIOR_INCOMPLETE_RESEARCH_WITHIN_RETRY_COOLDOWN"
      : "PRIOR_RESEARCH_WITHIN_COOLDOWN",
    cooldownMinutes,
    cooldownRemainingMinutes: remaining,
    nextEligibleAt,
    materialChangeOverride: false,
    materialChangeReasonCodes: [],
    ageMinutes,
  };
}

/**
 * Applies cooldown then the global budget guard to a shortlist.
 *
 * Budget prioritisation uses the ALREADY PERSISTED AI Triage rank ordering —
 * no new score, no hidden ranking. Ties break deterministically on quant rank
 * then exact mint.
 */
export function applySpendControl(input: {
  candidates: readonly SpendCandidateInput[];
  budget: SpendBudgetState;
  nowMs: number;
  config?: ResearchSpendConfig;
}): SpendDecisionRecord[] {
  const config = input.config ?? DEFAULT_RESEARCH_SPEND_CONFIG;
  const ordered = input.candidates.slice().sort((a, b) => {
    const ra = a.triageRank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.triageRank ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    const qa = a.quantRank ?? Number.MAX_SAFE_INTEGER;
    const qb = b.quantRank ?? Number.MAX_SAFE_INTEGER;
    if (qa !== qb) return qa - qb;
    return a.mint.localeCompare(b.mint);
  });

  let scanUsed = input.budget.scanUsed;
  let windowUsed = input.budget.windowUsed;

  return ordered.map((candidate) => {
    const cooldown = evaluateCooldown(candidate, input.nowMs, config);
    const base: SpendDecisionRecord = {
      mint: candidate.mint,
      triageRank: candidate.triageRank,
      quantRank: candidate.quantRank,
      recurrenceState: candidate.recurrenceState,
      recurrenceNumber: candidate.recurrenceNumber,
      researchPacketId: candidate.researchPacketId,
      triageDecisionId: candidate.triageDecisionId,
      tokenId: candidate.tokenId,
      policyVersion: RESEARCH_SPEND_POLICY_VERSION,
      spendDecision: "RUN_DEEP_RESEARCH",
      spendDecisionReason: cooldown.reason,
      priorResearchReportId: candidate.prior?.reportId ?? null,
      priorResearchRunId: candidate.prior?.deepResearchRunId ?? null,
      priorScanRunId: candidate.prior?.scanRunId ?? null,
      priorTriageRunId: candidate.prior?.triageRunId ?? null,
      priorResearchAt: candidate.prior?.researchedAt ?? null,
      priorResearchAgeMinutes: cooldown.ageMinutes,
      priorResearchStatus: candidate.prior?.status ?? null,
      priorResearchVersion: candidate.prior?.dossierVersion ?? null,
      priorSearchHealth: candidate.prior?.searchHealth ?? null,
      cooldownMinutes: cooldown.cooldownMinutes,
      cooldownRemainingMinutes: cooldown.cooldownRemainingMinutes,
      nextEligibleAt: cooldown.nextEligibleAt,
      materialChangeOverride: cooldown.materialChangeOverride,
      materialChangeReasonCodes: cooldown.materialChangeReasonCodes,
      budgetState: null,
      budgetScanUsed: scanUsed,
      budgetScanLimit: input.budget.scanLimit,
      budgetWindowUsed: windowUsed,
      budgetWindowLimit: input.budget.windowLimit,
    };

    if (!cooldown.allow) {
      return { ...base, spendDecision: "DEFERRED_RECENT_RESEARCH", budgetState: "NOT_CHARGED" };
    }

    if (scanUsed >= input.budget.scanLimit) {
      return {
        ...base,
        spendDecision: "DEFERRED_BUDGET",
        spendDecisionReason: "SCAN_BUDGET_EXHAUSTED",
        budgetState: "SCAN_BUDGET_EXHAUSTED",
      };
    }
    if (windowUsed >= input.budget.windowLimit) {
      return {
        ...base,
        spendDecision: "DEFERRED_BUDGET",
        spendDecisionReason: "WINDOW_BUDGET_EXHAUSTED",
        budgetState: "WINDOW_BUDGET_EXHAUSTED",
      };
    }

    scanUsed += 1;
    windowUsed += 1;
    return {
      ...base,
      spendDecision: "RUN_DEEP_RESEARCH",
      budgetState: "WITHIN_BUDGET",
      budgetScanUsed: scanUsed,
      budgetWindowUsed: windowUsed,
    };
  });
}
