import { describe, expect, it } from "vitest";
import { selectActiveResearchScan, type AiScanSourceCandidate } from "./ai-scan-source";
import { deriveCohortStages } from "./cohort";
import { SELECTION_POLICY_VERSION } from "../history/policy-epochs";

const run = (over: Partial<AiScanSourceCandidate> = {}): AiScanSourceCandidate => ({
  id: "scan-a",
  status: "completed",
  startedAt: "2026-09-05T00:00:00.000Z",
  completedAt: "2026-09-05T00:10:00.000Z",
  tokensDiscovered: 300,
  discoveryHealth: "OK",
  selectionPolicyVersion: SELECTION_POLICY_VERSION,
  policyEpoch: "CURRENT_V1",
  researchPacketCount: 12,
  ...over,
});

const scanA = run();
const scanB = run({
  id: "scan-b",
  startedAt: "2026-09-06T00:00:00.000Z",
  completedAt: "2026-09-06T00:10:00.000Z",
  tokensDiscovered: 362,
  researchPacketCount: 0,
});

const stages = (packetCount: number, packetStatus?: "READY" | "NOT_STARTED" | "FAILED") =>
  deriveCohortStages({
    packetCount,
    ...(packetStatus ? { packetStatus } : {}),
    triageRunId: null,
    triageStatus: null,
    shortlistCount: 0,
    deepResearchAttempted: 0,
    deepResearchCompleted: 0,
    thesisSynthesisRunId: null,
    thesisReportCount: 0,
    entryEvaluatedCount: 0,
    thesisCallCount: 0,
    sizingCount: 0,
  });

describe("active research scan does not depend on packets", () => {
  it("A. healthy scan B with zero packets is active; no scan A downstream", () => {
    const result = selectActiveResearchScan([scanA, scanB]);
    expect(result.ok).toBe(true);
    expect(result.runId).toBe("scan-b");
    expect(result.researchPacketCount).toBe(0);
    const s = stages(0);
    expect(s.packets).toBe("NOT_STARTED");
    expect(s.triage).toBe("NOT_STARTED");
    expect(s.deepResearch).toBe("NOT_STARTED");
    expect(s.thesis).toBe("NOT_STARTED");
    expect(s.entry).toBe("NOT_EVALUATED");
    expect(s.sizing).toBe("NOT_STARTED");
  });

  it("B. packet generation failure keeps scan B active and reports FAILED", () => {
    expect(selectActiveResearchScan([scanA, scanB]).runId).toBe("scan-b");
    expect(stages(0, "FAILED").packets).toBe("FAILED");
  });

  it("C. successful generation is READY while triage stays NOT_STARTED", () => {
    const s = stages(133, "READY");
    expect(s.packets).toBe("READY");
    expect(s.triage).toBe("NOT_STARTED");
  });

  it("D. a failed provider-unavailable scan C does not displace scan B", () => {
    const scanC = run({
      id: "scan-c",
      status: "failed",
      startedAt: "2026-09-07T00:00:00.000Z",
      completedAt: "2026-09-07T00:01:00.000Z",
      tokensDiscovered: 0,
      discoveryHealth: "PROVIDER_UNAVAILABLE",
      researchPacketCount: 0,
    });
    expect(selectActiveResearchScan([scanA, scanB, scanC]).runId).toBe("scan-b");
  });

  it("E. a scan from an older policy epoch does not displace the current one", () => {
    const legacy = run({
      id: "scan-legacy",
      startedAt: "2026-09-08T00:00:00.000Z",
      completedAt: "2026-09-08T00:10:00.000Z",
      policyEpoch: "LEGACY_V0",
      selectionPolicyVersion: "legacy",
      researchPacketCount: 50,
    });
    expect(selectActiveResearchScan([scanA, scanB, legacy]).runId).toBe("scan-b");
  });

  it("real packets always beat a stale FAILED marker", () => {
    expect(stages(5, "FAILED").packets).toBe("READY");
  });
});
