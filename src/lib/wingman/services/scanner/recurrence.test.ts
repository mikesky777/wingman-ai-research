import { describe, expect, it } from "vitest";
import {
  RECURRENCE_CONFIG,
  deriveRecurrence,
  type RecurrenceAppearance,
} from "./recurrence";
import { evaluateCandidate, rankCandidates, assignRanks, selectSurvivorsWithReservations } from "./evaluate";
import type { DiscoveredToken } from "./types";

const appearance = (over: Partial<RecurrenceAppearance> = {}): RecurrenceAppearance => ({
  runId: "run-1",
  runAt: "2026-09-01T00:00:00.000Z",
  setups: ["BASE"],
  quantitativePriority: 50,
  activityState: "ACTIVE",
  persistenceSignal: "MODERATE",
  reaccelerationSignal: "NONE",
  selectedAsSurvivor: true,
  ...over,
});

const current = {
  setups: ["BASE"],
  quantitativePriority: 50,
  activityState: "ACTIVE",
  persistenceSignal: "MODERATE",
  reaccelerationSignal: "NONE",
};

describe("scan recurrence", () => {
  it("marks a first observation NEW", () => {
    const r = deriveRecurrence({ current, appearances: [], recentRunIds: ["run-1"] });
    expect(r.state).toBe("NEW");
    expect(r.scansSeenCount).toBe(1);
    expect(r.firstSeenScanAt).toBeNull();
    expect(r.previousQuantitativePriority).toBeNull();
    expect(r.priorityDelta).toBeNull();
  });

  it("marks an unchanged consecutive observation REPEAT", () => {
    const r = deriveRecurrence({
      current,
      appearances: [appearance()],
      recentRunIds: ["run-1"],
    });
    expect(r.state).toBe("REPEAT");
    expect(r.scansSeenCount).toBe(2);
    expect(r.consecutiveScansSeen).toBe(2);
    expect(r.missedScans).toBe(0);
    expect(r.setupChanged).toBe(false);
    expect(r.changeReasons).toEqual([]);
  });

  it("marks meaningful priority movement CHANGED", () => {
    const r = deriveRecurrence({
      current: {
        ...current,
        quantitativePriority: 50 + RECURRENCE_CONFIG.priorityDeltaThreshold,
      },
      appearances: [appearance()],
      recentRunIds: ["run-1"],
    });
    expect(r.state).toBe("CHANGED");
    expect(r.priorityDelta).toBe(RECURRENCE_CONFIG.priorityDeltaThreshold);
  });

  it("does not treat sub-threshold priority movement as CHANGED", () => {
    const r = deriveRecurrence({
      current: { ...current, quantitativePriority: 51 },
      appearances: [appearance()],
      recentRunIds: ["run-1"],
    });
    expect(r.state).toBe("REPEAT");
    expect(r.priorityDelta).toBe(1);
  });

  it("marks a setup change CHANGED", () => {
    const r = deriveRecurrence({
      current: { ...current, setups: ["BASE", "MOMENTUM"] },
      appearances: [appearance()],
      recentRunIds: ["run-1"],
    });
    expect(r.state).toBe("CHANGED");
    expect(r.setupChanged).toBe(true);
    expect(r.previousSetups).toEqual(["BASE"]);
    expect(r.currentSetups).toEqual(["BASE", "MOMENTUM"]);
  });

  it("marks a tracked signal state change CHANGED", () => {
    const r = deriveRecurrence({
      current: { ...current, reaccelerationSignal: "CONFIRMED" },
      appearances: [appearance()],
      recentRunIds: ["run-1"],
    });
    expect(r.state).toBe("CHANGED");
  });

  it("marks disappearance then resurfacing RETURNING", () => {
    const r = deriveRecurrence({
      current,
      appearances: [appearance({ runId: "run-3", runAt: "2026-08-20T00:00:00.000Z" })],
      // Two completed scans happened after the last appearance.
      recentRunIds: ["run-1", "run-2", "run-3"],
    });
    expect(r.state).toBe("RETURNING");
    expect(r.missedScans).toBe(2);
    expect(r.consecutiveScansSeen).toBe(1);
  });

  it("keeps first-seen, streak and survivor history across many appearances", () => {
    const r = deriveRecurrence({
      current,
      appearances: [
        appearance({ runId: "run-3", runAt: "2026-08-30T00:00:00.000Z", selectedAsSurvivor: true }),
        appearance({ runId: "run-1", runAt: "2026-09-01T00:00:00.000Z", selectedAsSurvivor: false }),
        appearance({ runId: "run-2", runAt: "2026-08-31T00:00:00.000Z", selectedAsSurvivor: false }),
      ],
      recentRunIds: ["run-1", "run-2", "run-3"],
    });
    expect(r.firstSeenScanAt).toBe("2026-08-30T00:00:00.000Z");
    expect(r.previousSeenScanAt).toBe("2026-09-01T00:00:00.000Z");
    expect(r.scansSeenCount).toBe(4);
    expect(r.consecutiveScansSeen).toBe(4);
    expect(r.previousSelectedAsSurvivor).toBe(false);
    expect(r.lastSelectedAsSurvivorAt).toBe("2026-08-30T00:00:00.000Z");
  });

  it("cannot remain NEW once the exact mint appeared in an earlier completed scan", () => {
    const r = deriveRecurrence({
      current,
      appearances: [appearance()],
      recentRunIds: ["run-1"],
    });
    expect(r.state).not.toBe("NEW");
    expect(["REPEAT", "CHANGED", "RETURNING"]).toContain(r.state);
  });

  it("does not turn a failed scan between appearances into RETURNING", () => {
    // recentRunIds only ever contains COMPLETED runs, so an aborted run in
    // between leaves the token immediately adjacent to its prior appearance.
    const r = deriveRecurrence({
      current,
      appearances: [appearance({ runId: "run-2", runAt: "2026-08-31T00:00:00.000Z" })],
      recentRunIds: ["run-2"],
    });
    expect(r.state).toBe("REPEAT");
    expect(r.missedScans).toBe(0);
  });

  it("is deterministic for identical inputs regardless of appearance order", () => {
    const appearances = [
      appearance({ runId: "run-2", runAt: "2026-08-31T00:00:00.000Z" }),
      appearance({ runId: "run-1", runAt: "2026-09-01T00:00:00.000Z" }),
    ];
    const a = deriveRecurrence({ current, appearances, recentRunIds: ["run-1", "run-2"] });
    const b = deriveRecurrence({
      current,
      appearances: [...appearances].reverse(),
      recentRunIds: ["run-1", "run-2"],
    });
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Recurrence must not influence any scanner decision in this iteration.
// ---------------------------------------------------------------------------

function baseToken(over: Partial<DiscoveredToken> = {}): DiscoveredToken {
  return {
    chain: "solana",
    contractAddress: "So11111111111111111111111111111111111111112",
    symbol: "TEST",
    name: "Test token",
    imageUrl: null,
    priceUsd: 0.001,
    marketCap: 120_000,
    fdv: 120_000,
    liquidityUsd: 45_000,
    volume5m: 3_000,
    volume1h: 30_000,
    volume6h: 150_000,
    volume24h: 420_000,
    trades5m: 40,
    trades1h: 420,
    trades6h: 1_800,
    trades24h: 5_400,
    buys24h: 2_800,
    sells24h: 2_600,
    priceChange5m: 0.5,
    priceChange1h: 3,
    priceChange6h: 7,
    priceChange24h: 22,
    holderCount: 1_800,
    uniqueWallets24h: 900,
    listedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    lastTradeAt: new Date(Date.now() - 60_000).toISOString(),
    discovery: [
      { source: "birdeye", queryId: "volume_1h", family: "volume", rank: 1, laneHints: [] },
    ],
    ...over,
  };
}

describe("recurrence is descriptive only", () => {
  it("does not alter priority, hard-filter decisions or survivor selection", () => {
    const token = baseToken();
    const plain = evaluateCandidate(token);

    const tagged = evaluateCandidate(token);
    tagged.recurrence = deriveRecurrence({
      current: {
        setups: tagged.lanes,
        quantitativePriority: tagged.quantitativePriority,
        activityState: tagged.signals.activityState,
        persistenceSignal: tagged.signals.persistenceSignal,
        reaccelerationSignal: tagged.signals.reaccelerationSignal,
      },
      appearances: [appearance({ quantitativePriority: 1 })],
      recentRunIds: ["run-1"],
    });

    expect(tagged.recurrence.state).toBe("CHANGED");
    expect(tagged.quantitativePriority).toBe(plain.quantitativePriority);
    expect(tagged.passedHardFilters).toBe(plain.passedHardFilters);
    expect(tagged.lanes).toEqual(plain.lanes);

    const selectionPlain = selectSurvivorsWithReservations(
      assignRanks(rankCandidates([plain])),
      50,
    );
    const selectionTagged = selectSurvivorsWithReservations(
      assignRanks(rankCandidates([tagged])),
      50,
    );
    expect(selectionTagged.survivors.length).toBe(selectionPlain.survivors.length);
    expect(selectionTagged.survivors[0]?.quantitativePriority).toBe(
      selectionPlain.survivors[0]?.quantitativePriority,
    );
  });

  it("never mutates the historical appearances it reads", () => {
    const appearances = [appearance()];
    const snapshot = JSON.parse(JSON.stringify(appearances));
    deriveRecurrence({ current, appearances, recentRunIds: ["run-1"] });
    expect(appearances).toEqual(snapshot);
  });
});
