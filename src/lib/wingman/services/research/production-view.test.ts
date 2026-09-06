import { describe, expect, it } from "vitest";
import {
  buildProductionShortlist,
  countShortlistStatuses,
  filterShortlist,
  mapDeepResearchStatus,
  type DeepResearchRunInput,
  type ShortlistDecisionInput,
} from "./production-view";

function decision(
  mint: string,
  rank: number,
  decisionValue = "DEEP_RESEARCH",
): ShortlistDecisionInput {
  return {
    mint,
    symbol: `S${rank}`,
    name: null,
    pairAddress: null,
    triageRank: rank,
    quantRank: rank + 5,
    setup: "MOMENTUM",
    decision: decisionValue,
  };
}

function completedRun(mint: string, at = "2026-09-05T00:42:00Z"): DeepResearchRunInput {
  return {
    mint,
    runStatus: "completed",
    reportId: `rep-${mint}`,
    reportStatus: "completed",
    narrativeResolved: true,
    sourceCount: 8,
    independentSourceCount: 3,
    coveragePct: 67,
    researchedAt: at,
  };
}

describe("mapDeepResearchStatus", () => {
  it("treats a missing run as not started", () => {
    expect(mapDeepResearchStatus(null, null)).toBe("NOT_STARTED");
  });
  it("maps run and report statuses", () => {
    expect(mapDeepResearchStatus("running", null)).toBe("RUNNING");
    expect(mapDeepResearchStatus("failed", null)).toBe("FAILED");
    expect(mapDeepResearchStatus("blocked_before_deep_research", null)).toBe("BLOCKED");
    expect(mapDeepResearchStatus("completed", "completed")).toBe("COMPLETED");
    expect(mapDeepResearchStatus("completed", "insufficient_evidence")).toBe(
      "INSUFFICIENT_EXTERNAL_EVIDENCE",
    );
    expect(mapDeepResearchStatus("completed", "search_unavailable")).toBe(
      "INSUFFICIENT_EXTERNAL_EVIDENCE",
    );
  });
});

describe("buildProductionShortlist", () => {
  const decisions = [
    decision("m1", 1),
    decision("m2", 2),
    decision("m3", 3),
    ...Array.from({ length: 9 }, (_, i) => decision(`m${i + 4}`, i + 4)),
    decision("w1", 13, "WATCH"),
    decision("s1", 14, "SKIP"),
  ];

  it("shows every shortlist member, researched or not", () => {
    const list = buildProductionShortlist(decisions, [
      completedRun("m1"),
      completedRun("m2"),
      completedRun("m3"),
    ]);
    expect(list).toHaveLength(12);
    expect(list.slice(0, 3).map((e) => e.status)).toEqual([
      "COMPLETED",
      "COMPLETED",
      "COMPLETED",
    ]);
    expect(list.slice(3).every((e) => e.status === "NOT_STARTED")).toBe(true);
    expect(list.map((e) => e.triageRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("never lists WATCH or SKIP candidates", () => {
    const list = buildProductionShortlist(decisions, []);
    expect(list.some((e) => e.mint === "w1" || e.mint === "s1")).toBe(false);
  });

  it("keeps exact mints and resolved pair addresses", () => {
    const list = buildProductionShortlist(
      [{ ...decision("mintA", 1), pairAddress: "pairA" }],
      [completedRun("mintA")],
    );
    expect(list[0]!.mint).toBe("mintA");
    expect(list[0]!.pairAddress).toBe("pairA");
  });

  it("does not let a later empty retry hide a completed report", () => {
    const list = buildProductionShortlist(
      [decision("m1", 1)],
      [
        completedRun("m1"),
        { mint: "m1", runStatus: "failed", reportId: null, reportStatus: null, narrativeResolved: null, sourceCount: null, independentSourceCount: null, coveragePct: null, researchedAt: "2026-09-05T01:00:00Z" },
      ],
    );
    expect(list[0]!.status).toBe("COMPLETED");
  });

  it("counts and filters by persisted status", () => {
    const list = buildProductionShortlist(decisions, [
      completedRun("m1"),
      completedRun("m2"),
      completedRun("m3"),
      { mint: "m4", runStatus: "failed", reportId: null, reportStatus: null, narrativeResolved: null, sourceCount: null, independentSourceCount: null, coveragePct: null, researchedAt: null },
    ]);
    const counts = countShortlistStatuses(list);
    expect(counts).toEqual({ total: 12, completed: 3, pending: 8, deferred: 0, blockedOrFailed: 1 });
    expect(filterShortlist(list, "COMPLETED")).toHaveLength(3);
    expect(filterShortlist(list, "PENDING")).toHaveLength(8);
    expect(filterShortlist(list, "BLOCKED_FAILED")).toHaveLength(1);
    expect(filterShortlist(list, "ALL")).toHaveLength(12);
  });
});
