import { describe, expect, it, vi } from "vitest";
import { BirdeyeError } from "./errors";
import {
  isHardBlock,
  readinessBlockReason,
  readinessFromErrorCode,
  shouldFailFast,
  type ProviderReadiness,
} from "./readiness";
import { checkBirdeyeReadiness } from "./readiness.server";
import { assessAiScanSource } from "../../research/ai-scan-source";

const readiness = (over: Partial<ProviderReadiness>): ProviderReadiness => ({
  provider: "birdeye",
  state: "AVAILABLE",
  reason: null,
  checkedAt: "2026-01-01T00:00:00.000Z",
  quotaRemaining: null,
  quotaResetAt: null,
  ...over,
});

describe("provider readiness classification", () => {
  it("maps authoritative provider errors to readiness states", () => {
    expect(readinessFromErrorCode("QUOTA_EXHAUSTED")).toBe("QUOTA_EXHAUSTED");
    expect(readinessFromErrorCode("RATE_LIMITED")).toBe("RATE_LIMITED");
    expect(readinessFromErrorCode("UNAUTHORIZED")).toBe("AUTH_FAILED");
    expect(readinessFromErrorCode("NOT_CONFIGURED")).toBe("NOT_CONFIGURED");
    expect(readinessFromErrorCode("PROVIDER_TIMEOUT")).toBe("UNKNOWN_FAILURE");
  });

  it("fails fast only on definitive hard blocks", () => {
    expect(shouldFailFast(readiness({ state: "QUOTA_EXHAUSTED" }))).toBe(true);
    expect(shouldFailFast(readiness({ state: "AUTH_FAILED" }))).toBe(true);
    // Transient conditions still attempt a normal scan and may retry.
    expect(shouldFailFast(readiness({ state: "RATE_LIMITED" }))).toBe(false);
    expect(shouldFailFast(readiness({ state: "UNKNOWN_FAILURE" }))).toBe(false);
    expect(isHardBlock("RATE_LIMITED")).toBe(false);
  });

  it("never fabricates quota or reset information", () => {
    const r = readiness({ state: "QUOTA_EXHAUSTED", reason: "Compute units usage limit exceeded" });
    expect(r.quotaRemaining).toBeNull();
    expect(r.quotaResetAt).toBeNull();
    expect(readinessBlockReason(r)).toContain("Compute units usage limit exceeded");
  });
});

describe("preflight probe", () => {
  it("uses exactly one probe call and reports AVAILABLE", async () => {
    const probe = vi.fn().mockResolvedValue({ items: [] });
    const result = await checkBirdeyeReadiness({ probe });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.state).toBe("AVAILABLE");
  });

  it("classifies hard quota exhaustion from the provider response", async () => {
    const probe = vi
      .fn()
      .mockRejectedValue(new BirdeyeError("QUOTA_EXHAUSTED", "Compute units usage limit exceeded"));
    const result = await checkBirdeyeReadiness({ probe });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.state).toBe("QUOTA_EXHAUSTED");
    expect(result.reason).toBe("Compute units usage limit exceeded");
    // Hard exhaustion must not be retried by the preflight itself.
    expect(shouldFailFast(result)).toBe(true);
  });

  it("keeps a rate limit uncertain rather than blocking", async () => {
    const probe = vi.fn().mockRejectedValue(new BirdeyeError("RATE_LIMITED"));
    const result = await checkBirdeyeReadiness({ probe });
    expect(result.state).toBe("RATE_LIMITED");
    expect(shouldFailFast(result)).toBe(false);
  });
});

/**
 * Guard shape used by the pipeline: a blocked preflight aborts before any
 * discovery query runs, so no candidates and no milestones can be produced.
 */
async function simulateScan(pre: ProviderReadiness) {
  const discovery = vi.fn().mockResolvedValue({ tokens: [{}], outcomes: [] });
  const persistCandidates = vi.fn();
  const recordMilestones = vi.fn();
  let failedReason: string | null = null;
  if (shouldFailFast(pre)) {
    failedReason = readinessBlockReason(pre);
  } else {
    await discovery();
    persistCandidates();
    recordMilestones();
  }
  return { discovery, persistCandidates, recordMilestones, failedReason };
}

describe("fail-fast scan behavior", () => {
  it("does not issue discovery queries, candidates or milestones when blocked", async () => {
    const run = await simulateScan(readiness({ state: "QUOTA_EXHAUSTED" }));
    expect(run.discovery).not.toHaveBeenCalled();
    expect(run.persistCandidates).not.toHaveBeenCalled();
    expect(run.recordMilestones).not.toHaveBeenCalled();
    expect(run.failedReason).toContain("quota exhausted");
  });

  it("runs normally once the provider recovers", async () => {
    const run = await simulateScan(readiness({ state: "AVAILABLE" }));
    expect(run.discovery).toHaveBeenCalledTimes(1);
    expect(run.persistCandidates).toHaveBeenCalledTimes(1);
    expect(run.failedReason).toBeNull();
  });
});

describe("AI source rejects provider-blocked scans", () => {
  it("rejects a run whose discovery provider was unavailable", () => {
    const reasons = assessAiScanSource({
      id: "blocked",
      status: "failed",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      tokensDiscovered: 0,
      discoveryHealth: "PROVIDER_UNAVAILABLE",
      selectionPolicyVersion: "scanner_selection/v1",
      researchPacketCount: 0,
    });
    expect(reasons).toContain("RUN_NOT_COMPLETED");
    expect(reasons).toContain("DISCOVERY_UNHEALTHY");
    expect(reasons).toContain("NO_RESEARCH_PACKETS");
  });
});
