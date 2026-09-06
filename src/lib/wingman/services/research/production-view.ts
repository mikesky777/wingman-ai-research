/**
 * Production research read-model (pure).
 *
 * Turns persisted production records into the shapes the Research page shows.
 * No decisions, packets, milestones or reports are ever mutated here, and no
 * calibration artefact may enter a production view.
 */

export type DeepResearchUiStatus =
  | "NOT_STARTED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "INSUFFICIENT_EXTERNAL_EVIDENCE"
  /** Settled, but external search failed: partial evidence, not a full dossier. */
  | "SEARCH_LIMITED"
  | "BLOCKED"
  | "FAILED"
  /** Operational spend control deferred this occurrence. Never negative evidence. */
  | "DEFERRED_RECENT_RESEARCH"
  | "DEFERRED_BUDGET";

export interface ShortlistDecisionInput {
  mint: string;
  symbol: string | null;
  name: string | null;
  pairAddress: string | null;
  triageRank: number | null;
  quantRank: number | null;
  setup: string | null;
  decision: string;
}

export interface DeepResearchRunInput {
  mint: string;
  runStatus: string | null;
  reportId: string | null;
  reportStatus: string | null;
  narrativeResolved: boolean | null;
  sourceCount: number | null;
  independentSourceCount: number | null;
  coveragePct: number | null;
  researchedAt: string | null;
  /** Structured execution-failure code, e.g. FAILED_AI_CREDIT_LIMIT. */
  failureCode?: string | null;
  retryable?: boolean | null;
}

/** research_spend_policy/v1 decision persisted for this cohort × exact mint. */
export interface SpendDecisionInput {
  mint: string;
  spendDecision: string;
  spendDecisionReason: string;
  policyVersion: string;
  priorResearchReportId: string | null;
  priorResearchAt: string | null;
  priorResearchAgeMinutes: number | null;
  priorScanRunId: string | null;
  priorTriageRunId: string | null;
  cooldownRemainingMinutes: number | null;
  nextEligibleAt: string | null;
  materialChangeOverride: boolean;
  materialChangeReasonCodes: string[];
  budgetState: string | null;
  executed: boolean;
}

export interface ProductionShortlistEntry extends ShortlistDecisionInput {
  status: DeepResearchUiStatus;
  reportId: string | null;
  narrativeResolved: boolean | null;
  sourceCount: number | null;
  independentSourceCount: number | null;
  coveragePct: number | null;
  researchedAt: string | null;
  failureCode: string | null;
  retryable: boolean;
  spend: SpendDecisionInput | null;
}

/**
 * Maps persisted run/report status onto the funnel's vocabulary. A run row that
 * exists without a report is never "completed".
 */
export function mapDeepResearchStatus(
  runStatus: string | null | undefined,
  reportStatus: string | null | undefined,
): DeepResearchUiStatus {
  if (!runStatus) return "NOT_STARTED";
  switch (runStatus) {
    case "running":
      return "RUNNING";
    case "failed":
      return "FAILED";
    case "blocked":
    case "blocked_before_deep_research":
    case "currently_blocked_after_research":
      return "BLOCKED";
    default:
      break;
  }
  switch (reportStatus) {
    case "completed":
      return "COMPLETED";
    case "partial":
      return "PARTIAL";
    case "search_limited":
      return "SEARCH_LIMITED";
    case "insufficient_evidence":
    case "search_unavailable":
      return "INSUFFICIENT_EXTERNAL_EVIDENCE";
    case null:
    case undefined:
      return runStatus === "completed" ? "PARTIAL" : "NOT_STARTED";
    default:
      return "PARTIAL";
  }
}

/**
 * Builds the full shortlist view: every DEEP_RESEARCH decision of the run,
 * researched or not. WATCH/SKIP candidates can never enter this list.
 */
export function buildProductionShortlist(
  decisions: readonly ShortlistDecisionInput[],
  runs: readonly DeepResearchRunInput[],
  spendDecisions: readonly SpendDecisionInput[] = [],
): ProductionShortlistEntry[] {
  const spendByMint = new Map(spendDecisions.map((s) => [s.mint, s]));
  const byMint = new Map<string, DeepResearchRunInput>();
  for (const r of runs) {
    const existing = byMint.get(r.mint);
    // Newest attempt wins; a completed report is never hidden by a later retry
    // that produced nothing.
    if (!existing) byMint.set(r.mint, r);
    else if (!existing.reportId && r.reportId) byMint.set(r.mint, r);
    else if (
      r.reportId &&
      existing.reportId &&
      (r.researchedAt ?? "") > (existing.researchedAt ?? "")
    ) {
      byMint.set(r.mint, r);
    }
  }

  return decisions
    .filter((d) => d.decision === "DEEP_RESEARCH")
    .slice()
    .sort((a, b) => (a.triageRank ?? 9999) - (b.triageRank ?? 9999))
    .map((d) => {
      const run = byMint.get(d.mint);
      const spend = spendByMint.get(d.mint) ?? null;
      let status = mapDeepResearchStatus(run?.runStatus ?? null, run?.reportStatus ?? null);
      // Deferral only describes an occurrence that produced no run of its own.
      // A prior cohort's dossier is NEVER borrowed into this cohort.
      if (status === "NOT_STARTED" && spend) {
        if (spend.spendDecision === "DEFERRED_RECENT_RESEARCH") status = "DEFERRED_RECENT_RESEARCH";
        else if (spend.spendDecision === "DEFERRED_BUDGET") status = "DEFERRED_BUDGET";
      }
      return {
        ...d,
        status,
        spend,
        reportId: run?.reportId ?? null,
        narrativeResolved: run?.narrativeResolved ?? null,
        sourceCount: run?.sourceCount ?? null,
        independentSourceCount: run?.independentSourceCount ?? null,
        coveragePct: run?.coveragePct ?? null,
        researchedAt: run?.researchedAt ?? null,
        failureCode: run?.failureCode ?? null,
        retryable: run?.retryable === true,
      };
    });
}

export interface ShortlistStatusCounts {
  total: number;
  completed: number;
  pending: number;
  deferred: number;
  blockedOrFailed: number;
}

export function countShortlistStatuses(
  entries: readonly ProductionShortlistEntry[],
): ShortlistStatusCounts {
  let completed = 0;
  let pending = 0;
  let deferred = 0;
  let blockedOrFailed = 0;
  for (const e of entries) {
    if (e.status === "COMPLETED" || e.status === "PARTIAL" || e.status === "INSUFFICIENT_EXTERNAL_EVIDENCE") {
      completed += 1;
    } else if (e.status === "BLOCKED" || e.status === "FAILED") {
      blockedOrFailed += 1;
    } else if (
      e.status === "DEFERRED_RECENT_RESEARCH" ||
      e.status === "DEFERRED_BUDGET"
    ) {
      deferred += 1;
    } else {
      pending += 1;
    }
  }
  return { total: entries.length, completed, pending, deferred, blockedOrFailed };
}

export type DeepResearchFilter =
  | "ALL"
  | "COMPLETED"
  | "PENDING"
  | "DEFERRED"
  | "BLOCKED_FAILED";

export function filterShortlist(
  entries: readonly ProductionShortlistEntry[],
  filter: DeepResearchFilter,
): ProductionShortlistEntry[] {
  switch (filter) {
    case "COMPLETED":
      return entries.filter(
        (e) =>
          e.status === "COMPLETED" ||
          e.status === "PARTIAL" ||
          e.status === "INSUFFICIENT_EXTERNAL_EVIDENCE",
      );
    case "PENDING":
      return entries.filter((e) => e.status === "NOT_STARTED" || e.status === "RUNNING");
    case "DEFERRED":
      return entries.filter(
        (e) => e.status === "DEFERRED_RECENT_RESEARCH" || e.status === "DEFERRED_BUDGET",
      );
    case "BLOCKED_FAILED":
      return entries.filter((e) => e.status === "BLOCKED" || e.status === "FAILED");
    default:
      return entries.slice();
  }
}
