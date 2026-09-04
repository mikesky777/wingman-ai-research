import { describe, expect, it } from "vitest";
import {
  SUSPECT_SELECTION_EFFECT,
  isSuspectCandidate,
  selectSuspects,
  suspectCount,
  suspectDivergence,
  suspectTradesPerWallet,
  suspectUniqueWallets,
} from "../suspect-review";
import { isParticipationEligible } from "../participation";

type Row = Parameters<typeof selectSuspects>[0][number] & {
  id: string;
  selectedByLaneReservation: boolean;
};

function row(overrides: Partial<Row> & { id: string; participationStatus: string | null }): Row {
  return {
    lanes: ["BASE"],
    priceIntegrityStatus: "HEALTHY",
    structuralStatus: "PASS",
    quantitativePriority: 50,
    selectedByLaneReservation: true,
    participationDetail: {
      dimensions: {
        breadth: "NARROW",
        repetition: "EXTREME",
        divergence: "STRONG",
        uniqueWallets24h: 40,
        peakTradesPerWallet: 12,
      },
      evaluatedAt: "2026-09-04T04:00:00.000Z",
    },
    ...overrides,
  } as Row;
}

describe("SUSPECT review queue — inclusion", () => {
  const candidates = [
    row({ id: "extreme", participationStatus: "EXTREME" }),
    row({ id: "concentrated", participationStatus: "CONCENTRATED" }),
    row({ id: "broad", participationStatus: "BROAD" }),
    row({ id: "unknown", participationStatus: "UNKNOWN" }),
    row({ id: "never-evaluated", participationStatus: null }),
  ];

  it("includes EXTREME", () => {
    expect(selectSuspects(candidates).map((c) => (c as Row).id)).toContain("extreme");
  });

  it("includes CONCENTRATED", () => {
    expect(selectSuspects(candidates).map((c) => (c as Row).id)).toContain("concentrated");
  });

  it("excludes BROAD", () => {
    expect(selectSuspects(candidates).map((c) => (c as Row).id)).not.toContain("broad");
  });

  it("excludes UNKNOWN and never-evaluated (missing evidence is not suspicion)", () => {
    const ids = selectSuspects(candidates).map((c) => (c as Row).id);
    expect(ids).not.toContain("unknown");
    expect(ids).not.toContain("never-evaluated");
    expect(suspectCount(candidates)).toBe(2);
  });
});

describe("SUSPECT review queue — sorting and filters", () => {
  const candidates = [
    row({ id: "conc-high", participationStatus: "CONCENTRATED", quantitativePriority: 90 }),
    row({ id: "ext-low", participationStatus: "EXTREME", quantitativePriority: 10 }),
    row({ id: "conc-low", participationStatus: "CONCENTRATED", quantitativePriority: 20 }),
  ];

  it("sorts EXTREME first, then by priority", () => {
    expect(selectSuspects(candidates).map((c) => (c as Row).id)).toEqual([
      "ext-low",
      "conc-high",
      "conc-low",
    ]);
  });

  it("breaks priority ties with the newest evaluation", () => {
    const older = row({
      id: "older",
      participationStatus: "EXTREME",
      participationDetail: { evaluatedAt: "2026-09-01T00:00:00.000Z" },
    });
    const newer = row({
      id: "newer",
      participationStatus: "EXTREME",
      participationDetail: { evaluatedAt: "2026-09-04T00:00:00.000Z" },
    });
    expect(selectSuspects([older, newer]).map((c) => (c as Row).id)).toEqual(["newer", "older"]);
  });

  it("filters by status, setup, Price Integrity and Structural status", () => {
    const pool = [
      row({ id: "a", participationStatus: "EXTREME", lanes: ["REACCEL"], priceIntegrityStatus: "DAMAGED", structuralStatus: "FAIL" }),
      row({ id: "b", participationStatus: "CONCENTRATED", lanes: ["BASE"], priceIntegrityStatus: "HEALTHY", structuralStatus: "PASS" }),
    ];
    expect(selectSuspects(pool, { status: "EXTREME" }).map((c) => (c as Row).id)).toEqual(["a"]);
    expect(selectSuspects(pool, { lane: "BASE" }).map((c) => (c as Row).id)).toEqual(["b"]);
    expect(selectSuspects(pool, { priceIntegrity: "DAMAGED" }).map((c) => (c as Row).id)).toEqual(["a"]);
    expect(selectSuspects(pool, { structural: "PASS" }).map((c) => (c as Row).id)).toEqual(["b"]);
  });
});

describe("SUSPECT review queue — non-destructive behaviour", () => {
  it("has no selection effect", () => {
    expect(SUSPECT_SELECTION_EFFECT).toBe("NONE");
    expect(isParticipationEligible("EXTREME")).toBe(true);
    expect(isParticipationEligible("CONCENTRATED")).toBe(true);
  });

  it("leaves the candidate visible in its normal BASE/REACCEL view", () => {
    const base = row({ id: "base", participationStatus: "EXTREME", lanes: ["BASE"] });
    const reaccel = row({ id: "reaccel", participationStatus: "CONCENTRATED", lanes: ["REACCEL"] });
    const all = [base, reaccel];
    expect(all.filter((c) => c.lanes.includes("BASE")).map((c) => c.id)).toEqual(["base"]);
    expect(all.filter((c) => c.lanes.includes("REACCEL")).map((c) => c.id)).toEqual(["reaccel"]);
    // Selection flags are untouched by review membership.
    expect(selectSuspects(all).every((c) => (c as Row).selectedByLaneReservation)).toBe(true);
  });

  it("creates no duplicate rows and returns the same object identities", () => {
    const a = row({ id: "a", participationStatus: "EXTREME" });
    const b = row({ id: "b", participationStatus: "EXTREME" });
    const result = selectSuspects([a, b]);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((c) => (c as Row).id)).size).toBe(2);
    expect(result).toContain(a);
    expect(result).toContain(b);
  });

  it("does not mutate the persisted participation evaluation", () => {
    const candidate = row({ id: "a", participationStatus: "CONCENTRATED" });
    const snapshot = JSON.stringify(candidate);
    selectSuspects([candidate], { status: "CONCENTRATED" });
    expect(JSON.stringify(candidate)).toBe(snapshot);
    expect(isSuspectCandidate(candidate)).toBe(true);
  });
});

describe("SUSPECT review queue — displayed facts", () => {
  it("reads v1.1 dimensions when present", () => {
    const c = row({ id: "a", participationStatus: "EXTREME" });
    expect(suspectUniqueWallets(c)).toBe(40);
    expect(suspectTradesPerWallet(c)).toBe(12);
    expect(suspectDivergence(c)).toBe("STRONG");
  });

  it("falls back to legacy v1 window facts without inventing values", () => {
    const legacy = row({
      id: "legacy",
      participationStatus: "CONCENTRATED",
      participationDetail: {
        windows: { "24h": { uniqueWallets: 121, tradesPerWallet: 5.1, activityBreadthDivergence: true } },
        evaluatedAt: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(suspectUniqueWallets(legacy)).toBe(121);
    expect(suspectTradesPerWallet(legacy)).toBe(5.1);
    expect(suspectDivergence(legacy)).toBe("PRESENT");

    const empty = row({ id: "empty", participationStatus: "EXTREME", participationDetail: null });
    expect(suspectUniqueWallets(empty)).toBeNull();
    expect(suspectTradesPerWallet(empty)).toBeNull();
    expect(suspectDivergence(empty)).toBe("UNKNOWN");
  });
});
