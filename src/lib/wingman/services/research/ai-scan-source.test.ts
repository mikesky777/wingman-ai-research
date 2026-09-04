import { describe, expect, it } from "vitest";
import { selectAiScanSource, type AiScanSourceCandidate } from "./ai-scan-source";
import {
  SELECTION_POLICY_VERSION,
  canRunCreateMilestones,
  deriveCurrentPolicyBoundary,
} from "../history/policy-epochs";

const run = (over: Partial<AiScanSourceCandidate> = {}): AiScanSourceCandidate => ({
  id: "run-1",
  status: "completed",
  startedAt: "2026-09-04T18:40:00.000Z",
  completedAt: "2026-09-04T18:47:25.000Z",
  tokensDiscovered: 358,
  discoveryHealth: "OK",
  selectionPolicyVersion: SELECTION_POLICY_VERSION,
  policyEpoch: "CURRENT_V1",
  researchPacketCount: 43,
  ...over,
});

const failedQuotaRun = run({
  id: "ebdf5313",
  status: "failed",
  tokensDiscovered: 0,
  discoveryHealth: "PROVIDER_UNAVAILABLE",
  researchPacketCount: 0,
});

describe("current policy boundary", () => {
  it("a failed provider-unavailable run cannot realize the boundary", () => {
    const boundary = deriveCurrentPolicyBoundary([failedQuotaRun]);
    expect(boundary.deployedAt).toBe("2026-09-04T18:40:00.000Z");
    expect(boundary.firstHealthyRunAt).toBeNull();
    expect(boundary.firstHealthyRunId).toBeNull();
    expect(boundary.realized).toBe(false);
  });

  it("the first healthy v1 run realizes the boundary exactly once", () => {
    const healthy = run({ id: "healthy-1", completedAt: "2026-09-05T01:00:00.000Z", startedAt: "2026-09-05T00:59:00.000Z" });
    const later = run({ id: "healthy-2", completedAt: "2026-09-05T02:00:00.000Z", startedAt: "2026-09-05T01:59:00.000Z" });
    const boundary = deriveCurrentPolicyBoundary([later, failedQuotaRun, healthy]);
    expect(boundary.firstHealthyRunId).toBe("healthy-1");
    expect(boundary.firstHealthyRunAt).toBe("2026-09-05T01:00:00.000Z");
    expect(boundary.realized).toBe(true);
  });

  it("a legacy run never realizes the current boundary", () => {
    const legacy = run({ id: "legacy", selectionPolicyVersion: null, policyEpoch: "LEGACY_V0" });
    expect(deriveCurrentPolicyBoundary([legacy]).realized).toBe(false);
  });

  it("a failed run may not create milestones", () => {
    expect(canRunCreateMilestones(failedQuotaRun)).toBe(false);
    expect(canRunCreateMilestones(run({ tokensDiscovered: 0, discoveryHealth: "VALID_EMPTY" }))).toBe(
      false,
    );
    expect(canRunCreateMilestones(run())).toBe(true);
  });
});

describe("AI triage scan source", () => {
  it("accepts a healthy current-policy run with packets", () => {
    const result = selectAiScanSource([run()]);
    expect(result.ok).toBe(true);
    expect(result.runId).toBe("run-1");
    expect(result.researchPacketCount).toBe(43);
  });

  it("rejects a failed scan and never falls back to it", () => {
    const result = selectAiScanSource([failedQuotaRun]);
    expect(result.code).toBe("NO_ELIGIBLE_CURRENT_SCAN");
    expect(result.runId).toBeNull();
    expect(result.rejections[0]?.reasons).toContain("RUN_NOT_COMPLETED");
    expect(result.rejections[0]?.reasons).toContain("DISCOVERY_UNHEALTHY");
  });

  it("rejects a stale legacy scan as a current source", () => {
    const legacy = run({ id: "legacy", selectionPolicyVersion: "scanner_selection/v0" });
    const result = selectAiScanSource([legacy]);
    expect(result.code).toBe("NO_ELIGIBLE_CURRENT_SCAN");
    expect(result.rejections[0]?.reasons).toContain("POLICY_VERSION_MISMATCH");
  });

  it("rejects a healthy run whose packets came from another scan", () => {
    const result = selectAiScanSource([run({ researchPacketCount: 0 })]);
    expect(result.code).toBe("NO_ELIGIBLE_CURRENT_SCAN");
    expect(result.rejections[0]?.reasons).toEqual(["NO_RESEARCH_PACKETS"]);
  });

  it("returns NO_ELIGIBLE_CURRENT_SCAN when nothing qualifies", () => {
    const result = selectAiScanSource([]);
    expect(result.code).toBe("NO_ELIGIBLE_CURRENT_SCAN");
    expect(result.rejections).toEqual([]);
  });

  it("picks the newest qualifying run", () => {
    const older = run({ id: "older", completedAt: "2026-09-04T10:00:00.000Z" });
    const newer = run({ id: "newer", completedAt: "2026-09-04T18:00:00.000Z" });
    expect(selectAiScanSource([older, newer]).runId).toBe("newer");
  });
});
