import { describe, expect, it } from "vitest";
import { classifyResearchFailure, isRetryableResearchFailure } from "./failure";

describe("research failure classification", () => {
  it("classifies AI credit exhaustion as its own retryable code", () => {
    const c = classifyResearchFailure("Deep research provider failed (403): credit_limit_reached");
    expect(c.type).toBe("AI_CREDIT_LIMIT");
    expect(c.code).toBe("FAILED_AI_CREDIT_LIMIT");
    expect(c.retryable).toBe(true);
  });

  it("never maps a credit limit onto an evidence finding", () => {
    const c = classifyResearchFailure("Deep research provider failed (402): payment required");
    expect(c.code).not.toContain("INSUFFICIENT");
    expect(c.type).toBe("AI_CREDIT_LIMIT");
  });

  it("treats rate limits and upstream 5xx as retryable", () => {
    expect(isRetryableResearchFailure("Deep research provider failed (429): rate limit")).toBe(true);
    expect(isRetryableResearchFailure("Deep research provider failed (503): upstream")).toBe(true);
  });

  it("treats configuration and rejected requests as terminal", () => {
    expect(classifyResearchFailure("Deep research provider failed (401): bad api key").retryable).toBe(false);
    expect(classifyResearchFailure("Deep research provider failed (400): bad request").retryable).toBe(false);
  });

  it("falls back to an unknown, non-retryable classification", () => {
    const c = classifyResearchFailure(null);
    expect(c.type).toBe("UNKNOWN");
    expect(c.retryable).toBe(false);
  });
});
