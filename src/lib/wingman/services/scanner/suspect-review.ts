/**
 * SUSPECT review queue (pure, UI-derived).
 *
 * A review-only projection over the ALREADY PERSISTED Participation Quality
 * evaluation of a scan. It creates no rows, writes nothing, and has no effect
 * on Survivor selection, Quantitative Research Priority, setup qualification,
 * Structural Eligibility, Price Integrity, Recent Market Damage or outcomes.
 *
 * Membership is derived, never stored: a candidate appears in SUSPECT AND in
 * its normal BASE / REACCEL / history location at the same time.
 *
 * EXTREME and CONCENTRATED are review prompts, not assertions of botting or
 * wash trading. UNKNOWN means missing evidence and is deliberately excluded.
 */

export const SUSPECT_STATUSES = ["EXTREME", "CONCENTRATED"] as const;
export type SuspectStatus = (typeof SUSPECT_STATUSES)[number];

/** SUSPECT is a review queue only — it never changes selection. */
export const SUSPECT_SELECTION_EFFECT = "NONE" as const;

export const SUSPECT_LABEL: Record<SuspectStatus, string> = {
  EXTREME: "High suspicion",
  CONCENTRATED: "Needs review",
};

export const SUSPECT_HINT: Record<SuspectStatus, string> = {
  EXTREME:
    "Repetitive trading from a narrow participant base with strong activity/breadth divergence. Review prompt only — not proof of botting or wash trading.",
  CONCENTRATED:
    "Participation looks concentrated relative to observed breadth. Review prompt only — not proof of botting or wash trading.",
};

export const SUSPECT_TONE: Record<SuspectStatus, string> = {
  EXTREME: "border-destructive/50 bg-destructive/10 text-destructive",
  CONCENTRATED: "border-warning/40 bg-warning/10 text-warning",
};

const SEVERITY_RANK: Record<SuspectStatus, number> = { EXTREME: 0, CONCENTRATED: 1 };

/** Minimal shape needed for review. Matches WorkbenchCandidate structurally. */
export interface SuspectReviewInput {
  participationStatus: string | null;
  participationDetail?: {
    dimensions?: {
      breadth?: string;
      repetition?: string;
      divergence?: string;
      uniqueWallets24h?: number | null;
      peakTradesPerWallet?: number | null;
    } | null;
    windows?: Record<string, { uniqueWallets?: number | null; tradesPerWallet?: number | null; activityBreadthDivergence?: boolean }> | null;
    evaluatedAt?: string;
  } | null;
  lanes: string[];
  priceIntegrityStatus: string | null;
  structuralStatus: string | null;
  quantitativePriority: number | null;
}

export function isSuspectCandidate(candidate: SuspectReviewInput): boolean {
  return (SUSPECT_STATUSES as readonly string[]).includes(candidate.participationStatus ?? "");
}

export function suspectStatusOf(candidate: SuspectReviewInput): SuspectStatus | null {
  return isSuspectCandidate(candidate) ? (candidate.participationStatus as SuspectStatus) : null;
}

/** Unique wallets over 24h — v1.1 dimensions first, then v1 window facts. */
export function suspectUniqueWallets(candidate: SuspectReviewInput): number | null {
  const d = candidate.participationDetail?.dimensions;
  if (d && d.uniqueWallets24h !== undefined && d.uniqueWallets24h !== null) return d.uniqueWallets24h;
  return candidate.participationDetail?.windows?.["24h"]?.uniqueWallets ?? null;
}

/** Trades per unique wallet (peak observed window, else 24h). */
export function suspectTradesPerWallet(candidate: SuspectReviewInput): number | null {
  const d = candidate.participationDetail?.dimensions;
  if (d && d.peakTradesPerWallet !== undefined && d.peakTradesPerWallet !== null) {
    return d.peakTradesPerWallet;
  }
  return candidate.participationDetail?.windows?.["24h"]?.tradesPerWallet ?? null;
}

/** Activity/breadth divergence label. Never inferred when unavailable. */
export function suspectDivergence(candidate: SuspectReviewInput): string {
  const d = candidate.participationDetail?.dimensions;
  if (d?.divergence) return d.divergence;
  const windows = candidate.participationDetail?.windows ?? null;
  if (!windows) return "UNKNOWN";
  return Object.values(windows).some((w) => w.activityBreadthDivergence) ? "PRESENT" : "NONE";
}

export interface SuspectFilters {
  status?: "ALL" | SuspectStatus;
  lane?: "ALL" | "BASE" | "REACCEL";
  priceIntegrity?: "ALL" | string;
  structural?: "ALL" | string;
}

function evaluatedAtMs(candidate: SuspectReviewInput): number {
  const raw = candidate.participationDetail?.evaluatedAt;
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Review queue for one scan/history context: EXTREME then CONCENTRATED, then
 * highest Quantitative Research Priority, then newest evaluation.
 */
export function selectSuspects<T extends SuspectReviewInput>(
  candidates: T[],
  filters: SuspectFilters = {},
): T[] {
  const status = filters.status ?? "ALL";
  const lane = filters.lane ?? "ALL";
  const priceIntegrity = filters.priceIntegrity ?? "ALL";
  const structural = filters.structural ?? "ALL";

  return candidates
    .filter((c) => {
      if (!isSuspectCandidate(c)) return false;
      if (status !== "ALL" && c.participationStatus !== status) return false;
      if (lane !== "ALL" && !c.lanes.includes(lane)) return false;
      if (priceIntegrity !== "ALL" && (c.priceIntegrityStatus ?? "UNKNOWN") !== priceIntegrity) {
        return false;
      }
      if (structural !== "ALL" && (c.structuralStatus ?? "UNKNOWN") !== structural) return false;
      return true;
    })
    .sort((a, b) => {
      const severity =
        SEVERITY_RANK[a.participationStatus as SuspectStatus] -
        SEVERITY_RANK[b.participationStatus as SuspectStatus];
      if (severity !== 0) return severity;
      const priority = (b.quantitativePriority ?? -1) - (a.quantitativePriority ?? -1);
      if (priority !== 0) return priority;
      return evaluatedAtMs(b) - evaluatedAtMs(a);
    });
}

export function suspectCount(candidates: SuspectReviewInput[]): number {
  return candidates.reduce((total, c) => total + (isSuspectCandidate(c) ? 1 : 0), 0);
}
