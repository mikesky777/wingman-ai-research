import { describe, expect, it } from "vitest";
import { deriveRefreshPlan, DOMAIN_REFRESH_CONFIG } from "./refresh";

const NOW = "2026-01-01T12:00:00.000Z";
const minutesAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();

describe("per-domain evidence refresh", () => {
  it("reports NO_EVIDENCE, not CARRY_FORWARD, for domains with nothing stored", () => {
    const plan = deriveRefreshPlan({
      recurrenceState: "REPEAT",
      nowIso: NOW,
      lastObservedAt: { market: minutesAgo(5) },
    });
    expect(plan.domains.holders.state).toBe("NO_EVIDENCE");
    expect(plan.domains.creator.state).toBe("NO_EVIDENCE");
    expect(plan.domains.market.state).toBe("CARRY_FORWARD");
  });

  it("does not let a market-driven CHANGED state invalidate fresh holder evidence", () => {
    const plan = deriveRefreshPlan({
      recurrenceState: "CHANGED",
      nowIso: NOW,
      lastObservedAt: { market: minutesAgo(10), holders: minutesAgo(20) },
    });
    expect(plan.domains.market.state).toBe("REFRESH_REQUIRED");
    expect(plan.domains.market.reasonCode).toBe("RECURRENCE_REQUIRES_REFRESH");
    expect(plan.domains.holders.state).toBe("CARRY_FORWARD");
    expect(plan.domains.holders.carriedForward).toBe(true);
  });

  it("marks stale domain evidence REFRESH_REQUIRED independently", () => {
    const plan = deriveRefreshPlan({
      recurrenceState: "REPEAT",
      nowIso: NOW,
      lastObservedAt: {
        market: minutesAgo(5),
        holders: minutesAgo(DOMAIN_REFRESH_CONFIG.holders.maxAgeMinutes + 30),
      },
    });
    expect(plan.domains.market.state).toBe("CARRY_FORWARD");
    expect(plan.domains.holders.state).toBe("REFRESH_REQUIRED");
    expect(plan.domains.holders.reasonCode).toBe("STALE_EVIDENCE");
  });

  it("flags approaching expiry as REFRESH_OPTIONAL", () => {
    const plan = deriveRefreshPlan({
      recurrenceState: "REPEAT",
      nowIso: NOW,
      lastObservedAt: { market: minutesAgo(DOMAIN_REFRESH_CONFIG.market.optionalAgeMinutes + 1) },
    });
    expect(plan.domains.market.state).toBe("REFRESH_OPTIONAL");
    expect(plan.state).toBe("REFRESH_OPTIONAL");
  });

  it("preserves stored timestamps exactly and never fabricates them", () => {
    const observed = minutesAgo(7);
    const plan = deriveRefreshPlan({
      recurrenceState: "REPEAT",
      nowIso: NOW,
      lastObservedAt: { market: observed },
    });
    expect(plan.domains.market.lastObservedAt).toBe(observed);
    expect(plan.lastEnrichedAt).toBe(observed);
    expect(plan.domains.holders.lastObservedAt).toBeNull();
  });

  it("derives the candidate state from the most urgent applicable domain", () => {
    const plan = deriveRefreshPlan({
      recurrenceState: "REPEAT",
      nowIso: NOW,
      lastObservedAt: {
        market: minutesAgo(5),
        holders: minutesAgo(DOMAIN_REFRESH_CONFIG.holders.maxAgeMinutes + 1),
      },
    });
    expect(plan.state).toBe("REFRESH_REQUIRED");
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      recurrenceState: "NEW" as const,
      nowIso: NOW,
      lastObservedAt: { market: minutesAgo(200), holders: minutesAgo(30) },
    };
    expect(deriveRefreshPlan(input)).toEqual(deriveRefreshPlan(input));
  });
});
