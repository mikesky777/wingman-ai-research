/**
 * Participation Quality v1 — shadow calibration behaviour.
 *
 * These tests pin the guarantees that matter: descriptive-only status, no
 * single-metric verdicts, and UNKNOWN (never zero) on missing evidence.
 */
import { describe, expect, it } from "vitest";

import {
  PARTICIPATION_IS_VETO,
  PARTICIPATION_SELECTION_EFFECT,
  PARTICIPATION_SHADOW_MODE,
  deriveWindowMetrics,
  evaluateParticipation,
  unknownParticipation,
} from "../participation";
import type { ParticipationWindowFacts } from "../participation";
import type { NormalizedParticipation } from "../../external/birdeye/trade-data-normalizer";

function facts(over: Partial<ParticipationWindowFacts> = {}): ParticipationWindowFacts {
  return {
    window: "24h",
    trades: null,
    tradesPrev: null,
    tradesChangePct: null,
    buys: null,
    sells: null,
    uniqueWallets: null,
    uniqueWalletsPrev: null,
    uniqueWalletsChangePct: null,
    volumeUsd: null,
    volumeUsdPrev: null,
    volumeChangePct: null,
    ...over,
  } as ParticipationWindowFacts;
}

function normalized(
  windows: Partial<Record<string, ParticipationWindowFacts>>,
): NormalizedParticipation {
  return {
    contractAddress: "So11111111111111111111111111111111111111112",
    chain: "solana",
    source: "birdeye",
    sourceReference: "/defi/v3/token/trade-data/single",
    observedAt: "2026-01-01T00:00:00.000Z",
    capturedAt: "2026-01-01T00:00:00.000Z",
    holders: 1000,
    windows: {
      "30m": facts({ window: "30m", ...(windows["30m"] ?? {}) }),
      "1h": facts({ window: "1h", ...(windows["1h"] ?? {}) }),
      "4h": facts({ window: "4h", ...(windows["4h"] ?? {}) }),
      "24h": facts({ window: "24h", ...(windows["24h"] ?? {}) }),
    },
  } as NormalizedParticipation;
}

describe("participation quality v1", () => {
  it("is shadow-only and never a veto", () => {
    expect(PARTICIPATION_SHADOW_MODE).toBe(true);
    expect(PARTICIPATION_IS_VETO).toBe(false);
    expect(PARTICIPATION_SELECTION_EFFECT).toBe("NONE");
  });

  it("returns UNKNOWN, not zero, when wallet evidence is missing", () => {
    const result = evaluateParticipation(
      normalized({ "24h": facts({ window: "24h", trades: 5000, volumeUsd: 1_000_000 }) }),
    );
    expect(result.status).toBe("UNKNOWN");
    expect(result.evidenceMissing).toBe(true);
  });

  it("provider failure is UNKNOWN with a reason", () => {
    const result = unknownParticipation("provider_error");
    expect(result.status).toBe("UNKNOWN");
    expect(result.reasons.join(" ")).toContain("provider_error");
    expect(result.windows).toBeNull();
  });

  it("does not label a token on a single metric", () => {
    // Very high trade count, but broad wallet base and modest per-wallet size.
    const result = evaluateParticipation(
      normalized({
        "24h": facts({
          window: "24h",
          trades: 20_000,
          uniqueWallets: 9_000,
          volumeUsd: 900_000,
        }),
      }),
    );
    expect(result.status).toBe("BROAD");
  });

  it("flags repetitive trading from a narrow base as concentrated or extreme", () => {
    const result = evaluateParticipation(
      normalized({
        "24h": facts({
          window: "24h",
          trades: 6_000,
          uniqueWallets: 40,
          volumeUsd: 900_000,
        }),
        "1h": facts({
          window: "1h",
          trades: 900,
          tradesPrev: 100,
          uniqueWallets: 20,
          uniqueWalletsPrev: 19,
          volumeUsd: 200_000,
        }),
      }),
    );
    expect(["CONCENTRATED", "EXTREME"]).toContain(result.status);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
  });

  it("derives divergence only when activity grows and breadth does not", () => {
    const diverging = deriveWindowMetrics(
      facts({
        window: "1h",
        trades: 1_000,
        tradesPrev: 100,
        uniqueWallets: 51,
        uniqueWalletsPrev: 50,
      }),
    );
    expect(diverging.activityBreadthDivergence).toBe(true);

    const healthy = deriveWindowMetrics(
      facts({
        window: "1h",
        trades: 1_000,
        tradesPrev: 100,
        uniqueWallets: 800,
        uniqueWalletsPrev: 80,
      }),
    );
    expect(healthy.activityBreadthDivergence).toBe(false);
  });
});
