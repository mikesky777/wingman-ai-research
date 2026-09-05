/**
 * AI triage scan-source invariant (pure).
 *
 * Stage 2 (AI triage) is NOT implemented here. This module answers one
 * question that must be answered the same way everywhere: which scan, if any,
 * is a legitimate source for CURRENT AI triage?
 *
 * A scan qualifies only when ALL of these hold:
 *   1. it COMPLETED
 *   2. discovery was healthy under `discovery_health/v1`
 *   3. it discovered a real universe (tokens > 0)
 *   4. it ran under the intended scanner policy version
 *   5. Research Packets exist that were generated from THAT scan
 *
 * When nothing qualifies the answer is `NO_ELIGIBLE_CURRENT_SCAN`. There is no
 * fallback: never a failed scan, never an older packet universe, never a
 * pre-current-policy run dressed up as current. Historical packets stay
 * readable for audit and calibration; they are simply not a triage source.
 */
import {
  SELECTION_POLICY_VERSION,
  isHealthyCompletedRun,
  type PolicyRunRecord,
} from "../history/policy-epochs";

export const AI_SCAN_SOURCE_VERSION = "ai_scan_source/v1";

export type AiScanSourceRejection =
  | "RUN_NOT_COMPLETED"
  | "DISCOVERY_UNHEALTHY"
  | "EMPTY_UNIVERSE"
  | "POLICY_VERSION_MISMATCH"
  | "NO_RESEARCH_PACKETS";

export interface AiScanSourceCandidate extends PolicyRunRecord {
  /** Packets generated FROM this run. Packets from other runs never count. */
  researchPacketCount: number;
}

export interface AiScanSourceResult {
  ok: boolean;
  code: "ELIGIBLE" | "NO_ELIGIBLE_CURRENT_SCAN";
  runId: string | null;
  completedAt: string | null;
  researchPacketCount: number;
  /** Why each inspected run was rejected, newest first. Audit only. */
  rejections: { runId: string; reasons: AiScanSourceRejection[] }[];
}

export function assessAiScanSource(
  run: AiScanSourceCandidate,
  expectedPolicyVersion: string = SELECTION_POLICY_VERSION,
): AiScanSourceRejection[] {
  const reasons: AiScanSourceRejection[] = [];
  if (run.status !== "completed") reasons.push("RUN_NOT_COMPLETED");
  if (run.discoveryHealth === "PROVIDER_UNAVAILABLE") reasons.push("DISCOVERY_UNHEALTHY");
  if ((run.tokensDiscovered ?? 0) <= 0) reasons.push("EMPTY_UNIVERSE");
  if (run.selectionPolicyVersion !== expectedPolicyVersion) reasons.push("POLICY_VERSION_MISMATCH");
  if (run.researchPacketCount <= 0) reasons.push("NO_RESEARCH_PACKETS");
  // Defensive: keep the health predicate authoritative even if a new state
  // appears later.
  if (!isHealthyCompletedRun(run) && !reasons.length) reasons.push("DISCOVERY_UNHEALTHY");
  return reasons;
}

/**
 * Pick the newest qualifying run. Runs may be supplied in any order; they are
 * inspected newest-first by completion time.
 */
export function selectAiScanSource(
  runs: AiScanSourceCandidate[],
  expectedPolicyVersion: string = SELECTION_POLICY_VERSION,
): AiScanSourceResult {
  const time = (r: AiScanSourceCandidate) => Date.parse(r.completedAt ?? r.startedAt ?? "") || 0;
  const ordered = [...runs].sort((a, b) => time(b) - time(a));
  const rejections: { runId: string; reasons: AiScanSourceRejection[] }[] = [];

  for (const run of ordered) {
    const reasons = assessAiScanSource(run, expectedPolicyVersion);
    if (reasons.length === 0) {
      return {
        ok: true,
        code: "ELIGIBLE",
        runId: run.id,
        completedAt: run.completedAt,
        researchPacketCount: run.researchPacketCount,
        rejections,
      };
    }
    rejections.push({ runId: run.id, reasons });
  }

  return {
    ok: false,
    code: "NO_ELIGIBLE_CURRENT_SCAN",
    runId: null,
    completedAt: null,
    researchPacketCount: 0,
    rejections,
  };
}

/**
 * THE active Research scan: the newest healthy, completed production scan
 * under the current scanner policy — WITHOUT requiring Research Packets.
 *
 * Packets are a downstream stage, not part of scan identity. A brand new
 * healthy scan with zero packets is still the active cohort; its packet stage
 * simply reads NOT_STARTED. There is never a fallback to an older scan just
 * because that older scan happens to have packets.
 */
export function selectActiveResearchScan(
  runs: AiScanSourceCandidate[],
  expectedPolicyVersion: string = SELECTION_POLICY_VERSION,
): AiScanSourceResult {
  const result = selectAiScanSource(
    runs.map((r) => ({ ...r, researchPacketCount: Math.max(r.researchPacketCount, 1) })),
    expectedPolicyVersion,
  );
  if (!result.ok || !result.runId) return result;
  // Report the REAL packet count for the selected scan, not the synthetic one.
  const real = runs.find((r) => r.id === result.runId)?.researchPacketCount ?? 0;
  return { ...result, researchPacketCount: real };
}

/**
 * Packet generation targets the same scan Research is anchored on. Requiring
 * packets here would be circular, so this is an alias of the active-scan rule.
 */
export const selectScanForPacketGeneration = selectActiveResearchScan;

