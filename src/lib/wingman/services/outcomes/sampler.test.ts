import { describe, expect, it } from "vitest";
import {
  OUTCOME_SAMPLER_VERSION,
  SAMPLER_BATCH_SIZE,
  backoffDelayMs,
  batchMints,
  coverageStatusFor,
  isTracked,
  measurementStatusFor,
  nextEligibleAfterFailure,
  observationWindowKey,
  refreshIntervalMs,
  samplerWindowKey,
  selectDueMints,
  type TrackingState,
} from "./sampler";
import { createRateLimitController } from "../external/dexscreener/rate-limit";

const NOW = "2026-09-06T12:00:00.000Z";
const minutesAgo = (n: number) => new Date(Date.parse(NOW) - n * 60_000).toISOString();

function state(partial: Partial<TrackingState> & { contractAddress: string }): TrackingState {
  return {
    latestBaselineAt: minutesAgo(30),
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextEligibleAt: null,
    consecutiveFailures: 0,
    ...partial,
  };
}

describe("outcome sampler selection", () => {
  it("keeps collecting independently of any UI: due mints are clock-driven", () => {
    const due = selectDueMints([state({ contractAddress: "A" })], NOW);
    expect(due).toEqual(["A"]);
    expect(OUTCOME_SAMPLER_VERSION).toBe("outcome_sampler/v1");
  });

  it("collapses one mint shared by many decision baselines into one fetch", () => {
    const mints = batchMints(["A", "A", "B", "A"]);
    expect(mints).toEqual([["A", "B"]]);
  });

  it("does not refresh every tracked mint each cycle", () => {
    const notDue = state({ contractAddress: "A", nextEligibleAt: minutesAgo(-10) });
    expect(selectDueMints([notDue], NOW)).toEqual([]);
  });

  it("caps a 693-row cohort to bounded batches instead of a full fan-out", () => {
    const many = Array.from({ length: 693 }, (_, i) =>
      state({ contractAddress: `mint-${i}`, lastSuccessAt: minutesAgo(i) }),
    );
    const due = selectDueMints(many, NOW);
    expect(due.length).toBeLessThanOrEqual(SAMPLER_BATCH_SIZE * 12);
    expect(batchMints(due).length).toBeLessThanOrEqual(12);
  });

  it("prefers stale and priority-requested mints first", () => {
    const due = selectDueMints(
      [
        state({ contractAddress: "fresh", lastSuccessAt: minutesAgo(6) }),
        state({ contractAddress: "stale", lastSuccessAt: minutesAgo(600) }),
        state({ contractAddress: "priority", lastSuccessAt: minutesAgo(1), priorityRequestedAt: NOW }),
      ],
      NOW,
    );
    expect(due[0]).toBe("priority");
    expect(due[1]).toBe("stale");
  });

  it("retires mints once every baseline ages beyond the tracking window", () => {
    const old = state({ contractAddress: "old", latestBaselineAt: minutesAgo(60 * 24 * 30) });
    expect(isTracked(old, NOW)).toBe(false);
    expect(selectDueMints([old], NOW)).toEqual([]);
  });

  it("slows cadence as a baseline ages", () => {
    expect(refreshIntervalMs(10 * 60_000)).toBe(5 * 60_000);
    expect(refreshIntervalMs(10 * 60 * 60_000)).toBe(30 * 60_000);
  });
});

describe("rate limiting and backoff", () => {
  it("honours Retry-After ahead of exponential backoff", () => {
    expect(backoffDelayMs(1, 90)).toBe(90_000);
    const next = nextEligibleAfterFailure(1, 90, NOW);
    expect(Date.parse(next) - Date.parse(NOW)).toBe(90_000);
  });

  it("uses jittered exponential backoff without Retry-After", () => {
    const low = backoffDelayMs(3, null, () => 0);
    const high = backoffDelayMs(3, null, () => 1);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(backoffDelayMs(1, null, () => 0));
  });

  it("paces provider requests through one controller", async () => {
    let clock = 0;
    const waits: number[] = [];
    const controller = createRateLimitController({
      minIntervalMs: 1_000,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    await controller.schedule(async () => "a");
    await controller.schedule(async () => "b");
    expect(waits).toEqual([1_000]);
  });

  it("extends the cooldown when the provider sends Retry-After", () => {
    let clock = 0;
    const controller = createRateLimitController({ minIntervalMs: 100, now: () => clock });
    controller.penalize(30);
    expect(controller.waitMs()).toBe(30_000);
  });
});

describe("coverage and measurement states", () => {
  it("reports rate limiting as a collection state, not a market outcome", () => {
    const status = coverageStatusFor(
      { ...state({ contractAddress: "A", lastSuccessAt: minutesAgo(2) }), consecutiveFailures: 1, lastErrorCode: "RATE_LIMITED" },
      NOW,
    );
    expect(status).toBe("PROVIDER_RATE_LIMITED");
  });

  it("never reports zero or a negative value for a failed observation", () => {
    const status = coverageStatusFor(
      { ...state({ contractAddress: "A" }), consecutiveFailures: 2, lastErrorCode: "PROVIDER_UNAVAILABLE" },
      NOW,
    );
    expect(status).toBe("PROVIDER_UNAVAILABLE");
    expect(measurementStatusFor(minutesAgo(120), 60 * 60_000, null, NOW)).toBe("DELAYED");
  });

  it("distinguishes measured from not-yet-measured horizons", () => {
    expect(measurementStatusFor(minutesAgo(10), 60 * 60_000, minutesAgo(1), NOW)).toBe(
      "NOT_YET_MEASURED",
    );
    expect(measurementStatusFor(minutesAgo(120), 60 * 60_000, minutesAgo(5), NOW)).toBe("MEASURED");
  });

  it("marks fresh coverage after a recent successful observation", () => {
    expect(
      coverageStatusFor({ ...state({ contractAddress: "A", lastSuccessAt: minutesAgo(2) }), lastErrorCode: null }, NOW),
    ).toBe("FRESH");
  });
});

describe("idempotency windows", () => {
  it("buckets concurrent workers into the same sampling window", () => {
    expect(samplerWindowKey("2026-09-06T12:03:59.000Z")).toBe(
      samplerWindowKey("2026-09-06T12:01:00.000Z"),
    );
    expect(observationWindowKey("2026-09-06T12:07:00.000Z")).toBe("2026-09-06T12:05:00.000Z");
  });
});
