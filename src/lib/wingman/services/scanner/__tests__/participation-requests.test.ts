/**
 * v1.1 request discipline: retries must not duplicate evidence, exhausted
 * retries stay UNKNOWN, and fresh evidence is never re-requested.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchTokenParticipation, appendEvidenceObservations } = vi.hoisted(() => ({
  fetchTokenParticipation: vi.fn(),
  appendEvidenceObservations: vi.fn(async () => ({ inserted: 13 })),
}));

vi.mock("../../external/birdeye/trade-data.server", () => ({ fetchTokenParticipation }));
vi.mock("../../evidence-persistence.server", () => ({ appendEvidenceObservations }));

import { BirdeyeError } from "../../external/birdeye/errors";
import { evaluateParticipationForTargets, type ParticipationTarget } from "../participation.server";

function target(over: Partial<ParticipationTarget> = {}): ParticipationTarget {
  return {
    contractAddress: "So11111111111111111111111111111111111111112",
    chain: "solana",
    tokenId: "token-1",
    liquidityUsd: 100_000,
    volumeToLiquidity24h: 1,
    turnover24h: 1,
    carryForward: false,
    ...over,
  };
}

function observation() {
  return {
    contractAddress: "So11111111111111111111111111111111111111112",
    chain: "solana",
    source: "birdeye" as const,
    sourceReference: "birdeye:/defi/v3/token/trade-data/single",
    observedAt: "2026-01-01T00:00:00.000Z",
    capturedAt: "2026-01-01T00:00:00.000Z",
    holders: 100,
    marketCount: 2,
    priceUsd: 1,
    windows: {
      "30m": win("30m"),
      "1h": win("1h"),
      "4h": win("4h"),
      "24h": win("24h"),
    },
  } as never;
}

function win(window: string) {
  return {
    window,
    trades: 100,
    buys: 50,
    sells: 50,
    uniqueWallets: 80,
    volumeUsd: 10_000,
    buyVolumeUsd: 5_000,
    sellVolumeUsd: 5_000,
    tradesPrev: 90,
    uniqueWalletsPrev: 78,
    volumeUsdPrev: 9_000,
    tradesChangePct: null,
    uniqueWalletsChangePct: null,
    volumeChangePct: null,
  };
}

describe("participation request discipline", () => {
  beforeEach(() => {
    fetchTokenParticipation.mockReset();
    appendEvidenceObservations.mockClear();
  });

  it("writes evidence once even when the provider retried internally", async () => {
    // Retries happen inside the shared Birdeye client; the acquisition layer
    // sees exactly one resolved observation.
    fetchTokenParticipation.mockImplementation(async (_addr: string, opts: never) => {
      (opts as { request?: { onRetry?: (i: { code: string; attempt: number }) => void } })
        .request?.onRetry?.({ code: "RATE_LIMITED", attempt: 1 });
      return observation();
    });

    const { diagnostics } = await evaluateParticipationForTargets([target()], { spacingMs: 0 });
    expect(appendEvidenceObservations).toHaveBeenCalledTimes(1);
    expect(diagnostics.requestsSucceeded).toBe(1);
    expect(diagnostics.retries).toBe(1);
    expect(diagnostics.rateLimited).toBe(1);
    expect(diagnostics.recoveredAfterRetry).toBe(1);
    expect(diagnostics.evidenceObservationsWritten).toBe(13);
  });

  it("keeps exhausted retries UNKNOWN and writes no evidence", async () => {
    fetchTokenParticipation.mockRejectedValue(new BirdeyeError("RATE_LIMITED"));

    const { evaluations, diagnostics } = await evaluateParticipationForTargets([target()], {
      spacingMs: 0,
    });
    const result = evaluations.get(target().contractAddress)!;
    expect(result.status).toBe("UNKNOWN");
    expect(result.windows).toBeNull();
    expect(appendEvidenceObservations).not.toHaveBeenCalled();
    expect(diagnostics.rateLimited).toBe(1);
    expect(diagnostics.unknownFromProviderFailure).toBe(1);
  });

  it("never requests candidates whose evidence is still fresh", async () => {
    const { diagnostics } = await evaluateParticipationForTargets(
      [target({ carryForward: true })],
      { spacingMs: 0 },
    );
    expect(fetchTokenParticipation).not.toHaveBeenCalled();
    expect(diagnostics.carriedForward).toBe(1);
    expect(diagnostics.requestsAttempted).toBe(0);
  });
});
