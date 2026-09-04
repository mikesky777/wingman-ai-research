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
  isParticipationEligible,
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

/**
 * v1.1 — breadth-aware aggregation. The aggregate must never be driven by a
 * single dimension, and genuinely broad participation must never be described
 * as concentrated.
 */
describe("participation quality v1.1 dimensions", () => {
  const broadRepetitive = normalized({
    "24h": facts({
      window: "24h",
      trades: 250_000,
      uniqueWallets: 10_700,
      uniqueWalletsPrev: 10_000,
      volumeUsd: 5_000_000,
    }),
    "4h": facts({
      window: "4h",
      trades: 40_000,
      tradesPrev: 10_000,
      uniqueWallets: 4_000,
      uniqueWalletsPrev: 3_900,
      volumeUsd: 900_000,
    }),
  });

  it("broad wallet participation cannot become EXTREME from repetition alone", () => {
    const r = evaluateParticipation(broadRepetitive);
    expect(r.dimensions.breadth).toBe("BROAD");
    expect(r.dimensions.repetition).toBe("EXTREME");
    expect(r.status).toBe("BROAD");
  });

  it("keeps broad + high repetition diagnostically visible", () => {
    const r = evaluateParticipation(broadRepetitive);
    expect(r.subSignals.some((s) => s.startsWith("BROAD + HIGH REPETITION"))).toBe(true);
  });

  it("narrow breadth alone cannot become EXTREME or CONCENTRATED", () => {
    const r = evaluateParticipation(
      normalized({
        "24h": facts({ window: "24h", trades: 90, uniqueWallets: 50, volumeUsd: 20_000 }),
      }),
    );
    expect(r.dimensions.breadth).toBe("NARROW");
    expect(r.dimensions.repetition).toBe("NORMAL");
    expect(r.status).toBe("BROAD");
  });

  it("repetition alone cannot become EXTREME", () => {
    const r = evaluateParticipation(
      normalized({
        "24h": facts({ window: "24h", trades: 3_000, uniqueWallets: 300, volumeUsd: 100_000 }),
        "4h": facts({ window: "4h", trades: 900, uniqueWallets: 90, volumeUsd: 30_000 }),
      }),
    );
    expect(r.dimensions.repetition).toBe("EXTREME");
    expect(r.status).not.toBe("EXTREME");
  });

  it("strong divergence alone cannot become EXTREME", () => {
    const r = evaluateParticipation(
      normalized({
        "24h": facts({
          window: "24h",
          trades: 1_000,
          uniqueWallets: 900,
          uniqueWalletsPrev: 890,
          volumeUsd: 100_000,
        }),
        "1h": facts({
          window: "1h",
          trades: 900,
          tradesPrev: 90,
          uniqueWallets: 500,
          uniqueWalletsPrev: 495,
          volumeUsd: 40_000,
        }),
        "4h": facts({
          window: "4h",
          trades: 900,
          tradesPrev: 90,
          uniqueWallets: 600,
          uniqueWalletsPrev: 595,
          volumeUsd: 50_000,
        }),
      }),
    );
    expect(r.dimensions.divergence).toBe("STRONG");
    expect(r.status).not.toBe("EXTREME");
  });

  it("narrow + repetitive + strongly divergent can classify EXTREME", () => {
    const r = evaluateParticipation(
      normalized({
        "24h": facts({
          window: "24h",
          trades: 6_000,
          uniqueWallets: 40,
          uniqueWalletsPrev: 38,
          volumeUsd: 900_000,
        }),
        "4h": facts({
          window: "4h",
          trades: 2_000,
          tradesPrev: 200,
          uniqueWallets: 30,
          uniqueWalletsPrev: 29,
          volumeUsd: 300_000,
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
    expect(r.dimensions.breadth).toBe("NARROW");
    expect(r.dimensions.repetition).toBe("EXTREME");
    expect(r.dimensions.divergence).toBe("STRONG");
    expect(r.status).toBe("EXTREME");
    expect(r.subSignals).toContain("NARROW + REPETITIVE + DIVERGENT");
  });

  it("remains selection-neutral for every status", () => {
    for (const status of ["BROAD", "CONCENTRATED", "EXTREME", "UNKNOWN"] as const) {
      expect(isParticipationEligible(status)).toBe(true);
    }
  });
});
