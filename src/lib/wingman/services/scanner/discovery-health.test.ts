import { describe, expect, it } from "vitest";
import {
  assessDiscoveryHealth,
  countsAsAbsenceObservation,
  isDiscoveryUsable,
} from "./discovery-health";

const ok = (id: string, count: number) => ({ queryId: id, ok: true, count, message: null });
const fail = (id: string, message: string) => ({ queryId: id, ok: false, count: 0, message });

describe("discovery health", () => {
  it("treats an all-failed discovery as a provider outage", () => {
    const health = assessDiscoveryHealth(
      Array.from({ length: 10 }, (_, i) => fail(`q${i}`, "Compute units usage limit exceeded")),
      0,
    );
    expect(health.state).toBe("PROVIDER_UNAVAILABLE");
    expect(health.successes).toBe(0);
    expect(health.failures).toBe(10);
    expect(isDiscoveryUsable(health)).toBe(false);
  });

  it("treats zero tokens with successful queries as a valid empty scan", () => {
    const health = assessDiscoveryHealth([ok("a", 0), ok("b", 0)], 0);
    expect(health.state).toBe("VALID_EMPTY");
    expect(isDiscoveryUsable(health)).toBe(true);
  });

  it("fails a zero-token run when a hard provider error occurred", () => {
    const health = assessDiscoveryHealth([ok("a", 0), fail("b", "Rate limit reached")], 0);
    expect(health.state).toBe("PROVIDER_UNAVAILABLE");
  });

  it("passes a normal run with partial soft failures", () => {
    const health = assessDiscoveryHealth([ok("a", 40), fail("b", "no data")], 40);
    expect(health.state).toBe("OK");
    expect(isDiscoveryUsable(health)).toBe(true);
  });

  it("returns OK for an empty outcome list", () => {
    expect(assessDiscoveryHealth([], 0).state).toBe("VALID_EMPTY");
  });
});

describe("absence observation semantics", () => {
  it("counts a healthy completed run with a discovered universe", () => {
    expect(
      countsAsAbsenceObservation({ status: "completed", tokensDiscovered: 358, discoveryHealth: "OK" }),
    ).toBe(true);
  });

  it("does NOT count a VALID_EMPTY run as evidence a token was absent", () => {
    expect(
      countsAsAbsenceObservation({
        status: "completed",
        tokensDiscovered: 0,
        discoveryHealth: "VALID_EMPTY",
      }),
    ).toBe(false);
  });

  it("does not count a provider-unavailable or failed run", () => {
    expect(
      countsAsAbsenceObservation({
        status: "completed",
        tokensDiscovered: 0,
        discoveryHealth: "PROVIDER_UNAVAILABLE",
      }),
    ).toBe(false);
    expect(
      countsAsAbsenceObservation({ status: "failed", tokensDiscovered: 358, discoveryHealth: "OK" }),
    ).toBe(false);
  });
});
