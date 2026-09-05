/**
 * Live lifecycle (pure, deterministic) — `live_lifecycle/v2`.
 *
 * A THESIS_CALL is an immutable historical qualification event. Its current
 * monitoring status, Entry state and Live status change over time WITHOUT
 * ever rewriting the call.
 *
 * Nothing here writes. It only decides:
 *   - whether a call is currently Live (all conditions true right now),
 *   - whether that is a real OFF→ON / ON→OFF transition worth appending,
 *   - how the append-only event ledger folds into Live episodes.
 */

export const LIVE_LIFECYCLE_VERSION = "live_lifecycle/v2";

/** Whether a Thesis Call still deserves ongoing Entry evaluation. */
export const MONITORING_STATUSES = [
  "ACTIVE",
  "RESEARCH_DUE",
  "INACTIVE",
  "INVALIDATED",
] as const;
export type MonitoringStatus = (typeof MONITORING_STATUSES)[number];

export const MONITORING_STATUS_MEANING: Record<MonitoringStatus, string> = {
  ACTIVE: "Continue Entry monitoring.",
  RESEARCH_DUE:
    "Thesis is potentially stale — Entry monitoring pauses until research is refreshed. Not bearish.",
  INACTIVE: "No longer actively monitored. The historical Thesis Call remains in History.",
  INVALIDATED:
    "Affirmative new evidence broke the thesis. Requires an explicit supported reason.",
};

export type OperationalStatus = "OPERATIONAL" | "BLOCKED" | "UNKNOWN";

export type LiveFailureCode =
  | "NO_PRODUCTION_THESIS_CALL"
  | "NOT_ACTIVELY_MONITORED"
  | "OPERATIONAL_INELIGIBLE"
  | "STALE_ENTRY_AFTER_INTERRUPTION"
  | "ENTRY_MISSING"
  | "ENTRY_NOT_BUY_ZONE"
  | "TIMING_EVIDENCE_NOT_CANDLES"
  | "TIMING_RESOLUTION_NOT_HIGH";

export interface LiveConditionInput {
  /** Only a production THESIS_CALL milestone may ever qualify. */
  hasProductionThesisCall: boolean;
  monitoringStatus: MonitoringStatus;
  operationalStatus: OperationalStatus;
  operationalReason?: string | null;
  entryState: string | null;
  entryEvaluatedAt: string | null;
  timingResolution: string | null;
  priceHistorySource: string | null;
  /**
   * Rule 5: after an operational interruption a stale BUY_ZONE reading may
   * never reactivate a call. A fresh evaluation strictly after this instant
   * is required.
   */
  requiresFreshEntryAfter: string | null;
  /**
   * Pre-gate diagnostic evaluations (produced before Thesis Call gating
   * existed) can never create a Live activation.
   */
  entryIsPreGateDiagnostic?: boolean;
}

export interface LiveAssessment {
  live: boolean;
  reasonCode: LiveFailureCode | "LIVE_CONDITIONS_MET";
  reason: string;
  failed: LiveFailureCode[];
}

/** Current-state evaluation of the Live conditions. Order is deterministic. */
export function assessLiveCall(input: LiveConditionInput): LiveAssessment {
  const failed: LiveFailureCode[] = [];
  const add = (code: LiveFailureCode) => failed.push(code);

  if (!input.hasProductionThesisCall) add("NO_PRODUCTION_THESIS_CALL");
  if (input.monitoringStatus !== "ACTIVE") add("NOT_ACTIVELY_MONITORED");
  if (input.operationalStatus !== "OPERATIONAL") add("OPERATIONAL_INELIGIBLE");
  if (!input.entryState || !input.entryEvaluatedAt || input.entryIsPreGateDiagnostic) {
    add("ENTRY_MISSING");
  } else {
    if (
      input.requiresFreshEntryAfter &&
      Date.parse(input.entryEvaluatedAt) <= Date.parse(input.requiresFreshEntryAfter)
    ) {
      add("STALE_ENTRY_AFTER_INTERRUPTION");
    }
    if (input.entryState !== "BUY_ZONE") add("ENTRY_NOT_BUY_ZONE");
    if (input.priceHistorySource !== "CANDLES") add("TIMING_EVIDENCE_NOT_CANDLES");
    if (input.timingResolution !== "HIGH") add("TIMING_RESOLUTION_NOT_HIGH");
  }

  if (failed.length === 0) {
    return {
      live: true,
      reasonCode: "LIVE_CONDITIONS_MET",
      reason:
        "Production Thesis Call actively monitored, operationally eligible, latest Entry BUY_ZONE on HIGH-resolution candles.",
      failed,
    };
  }
  const primary = failed[0] as LiveFailureCode;
  return { live: false, reasonCode: primary, reason: describeFailure(primary, input), failed };
}

function describeFailure(code: LiveFailureCode, input: LiveConditionInput): string {
  switch (code) {
    case "NO_PRODUCTION_THESIS_CALL":
      return "No production THESIS_CALL exists for this mint.";
    case "NOT_ACTIVELY_MONITORED":
      return `Thesis Call monitoring status is ${input.monitoringStatus}, not ACTIVE.`;
    case "OPERATIONAL_INELIGIBLE":
      return input.operationalReason ?? "Operational eligibility does not currently pass.";
    case "STALE_ENTRY_AFTER_INTERRUPTION":
      return "Entry reading predates the operational interruption — a fresh evaluation is required.";
    case "ENTRY_MISSING":
      return "No qualifying production Entry evaluation available.";
    case "ENTRY_NOT_BUY_ZONE":
      return `Latest Entry state is ${input.entryState ?? "UNKNOWN"}, not BUY_ZONE.`;
    case "TIMING_EVIDENCE_NOT_CANDLES":
      return `Entry evidence is ${input.priceHistorySource ?? "NONE"}, not CANDLES.`;
    case "TIMING_RESOLUTION_NOT_HIGH":
      return `Timing resolution is ${input.timingResolution ?? "INSUFFICIENT"}, not HIGH.`;
  }
}

export type LiveTransition = "ACTIVATE" | "DEACTIVATE" | "NONE";

/**
 * Transitions only. Repeated BUY_ZONE evaluations inside one Live episode
 * never append a second activation.
 */
export function decideTransition(currentlyLive: boolean, assessment: LiveAssessment): LiveTransition {
  if (assessment.live && !currentlyLive) return "ACTIVATE";
  if (!assessment.live && currentlyLive) return "DEACTIVATE";
  return "NONE";
}

export type LiveEventType = "LIVE_ACTIVATED" | "LIVE_DEACTIVATED" | "MONITORING_STATUS_CHANGED";

export interface LiveLifecycleEvent {
  id: string;
  eventType: LiveEventType;
  occurredAt: string;
  thesisCallMilestoneId: string;
  tokenId: string | null;
  mint: string;
  episodeNumber: number | null;
  entryState: string | null;
  entryEvaluatedAt: string | null;
  timingResolution: string | null;
  priceHistorySource: string | null;
  marketCapAtEvent: number | null;
  liquidityAtEvent: number | null;
  priceUsdAtEvent: number | null;
  monitoringStatus: string | null;
  reasonCode: string | null;
  reason: string | null;
}

export interface LiveEpisode {
  episodeNumber: number;
  mint: string;
  thesisCallMilestoneId: string;
  activatedAt: string;
  deactivatedAt: string | null;
  durationMs: number | null;
  open: boolean;
  activationMarketCap: number | null;
  activationPriceUsd: number | null;
  activationReason: string | null;
  deactivationReasonCode: string | null;
  deactivationReason: string | null;
}

/**
 * Folds the append-only ledger into episodes. Every historical activation is
 * preserved; at most one episode per call can be open.
 */
export function deriveEpisodes(events: LiveLifecycleEvent[]): LiveEpisode[] {
  const ordered = [...events]
    .filter((e) => e.eventType === "LIVE_ACTIVATED" || e.eventType === "LIVE_DEACTIVATED")
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

  const episodes: LiveEpisode[] = [];
  let open: LiveEpisode | null = null;
  for (const event of ordered) {
    if (event.eventType === "LIVE_ACTIVATED") {
      if (open) continue; // defensive: never two open episodes
      open = {
        episodeNumber: event.episodeNumber ?? episodes.length + 1,
        mint: event.mint,
        thesisCallMilestoneId: event.thesisCallMilestoneId,
        activatedAt: event.occurredAt,
        deactivatedAt: null,
        durationMs: null,
        open: true,
        activationMarketCap: event.marketCapAtEvent,
        activationPriceUsd: event.priceUsdAtEvent,
        activationReason: event.reason,
        deactivationReasonCode: null,
        deactivationReason: null,
      };
      episodes.push(open);
      continue;
    }
    if (!open) continue;
    open.deactivatedAt = event.occurredAt;
    open.durationMs = Date.parse(event.occurredAt) - Date.parse(open.activatedAt);
    open.open = false;
    open.deactivationReasonCode = event.reasonCode;
    open.deactivationReason = event.reason;
    open = null;
  }
  return episodes;
}

/** Current Live state derived from the ledger: at most one open episode. */
export function currentEpisode(events: LiveLifecycleEvent[]): LiveEpisode | null {
  const episodes = deriveEpisodes(events);
  const last = episodes[episodes.length - 1];
  return last && last.open ? last : null;
}

/** Deactivation reasons that require a fresh Entry evaluation before reactivating. */
export function requiresFreshTimingAfter(reasonCode: string | null): boolean {
  return reasonCode === "OPERATIONAL_INELIGIBLE" || reasonCode === "NOT_ACTIVELY_MONITORED";
}

/** Current Live Calls contain at most one card per exact mint. */
export function dedupeByMint<T extends { mint: string; activatedAt: string }>(rows: T[]): T[] {
  const byMint = new Map<string, T>();
  for (const row of rows) {
    const existing = byMint.get(row.mint);
    if (!existing || Date.parse(row.activatedAt) > Date.parse(existing.activatedAt)) {
      byMint.set(row.mint, row);
    }
  }
  return [...byMint.values()].sort((a, b) => Date.parse(b.activatedAt) - Date.parse(a.activatedAt));
}
