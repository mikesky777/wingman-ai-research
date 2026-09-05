import { describe, expect, it } from "vitest";
import {
  classifyThesisArtifacts,
  selectThesisPopulation,
  summarizeThesisArtifacts,
  thesisPopulationCounts,
  type ThesisArtifact,
} from "./artifacts";

function artifact(over: {
  reportId: string;
  mint: string;
  triageRunId: string | null;
  synthesizedAt: string;
  thesisScore?: number | null;
  perf?: { since: number | null; peak: number | null; dd: number | null } | null;
}): ThesisArtifact {
  return {
    reportId: over.reportId,
    mint: over.mint,
    symbol: null,
    name: null,
    pairAddress: null,
    synthesizedAt: over.synthesizedAt,
    thesisScore: over.thesisScore ?? null,
    evidenceConfidence: null,
    verdict: null,
    bearCaseSeverity: null,
    oneSentenceThesis: null,
    strongestBearCase: null,
    qualifiedAsOpportunity: false,
    thesisPolicyVersion: null,
    rubricVersion: null,
    promptVersion: null,
    modelProvider: null,
    modelIdentifier: null,
    sourceScanId: null,
    triageRunId: over.triageRunId,
    deepResearchRunId: null,
    deepResearchReportId: null,
    canonicalWithinCohortMint: true,
    sameCohortRerun: false,
    recurrenceNumberAcrossProductionCohorts: 0,
    timeSincePriorCanonicalSynthesisMs: null,
    baseline: over.perf
      ? { marketCap: 1_000_000, price: 1, liquidity: 100_000, observedAt: over.synthesizedAt, origin: "CAPTURED_AT_SYNTHESIS" }
      : null,
    performance: over.perf
      ? {
          changeSincePct: over.perf.since,
          peakChangePct: over.perf.peak,
          maxDrawdownPct: over.perf.dd,
          currentMarketCap: 1_000_000,
          lastObservedAt: over.synthesizedAt,
          observations: 3,
        }
      : null,
  } as ThesisArtifact;
}

const A = "So11111111111111111111111111111111111111112";
const B = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("thesis_population/v1", () => {
  it("marks later same-cohort artifacts as non-canonical reruns", () => {
    const rows = classifyThesisArtifacts([
      artifact({ reportId: "r2", mint: A, triageRunId: "t1", synthesizedAt: "2026-09-05T12:00:00Z" }),
      artifact({ reportId: "r1", mint: A, triageRunId: "t1", synthesizedAt: "2026-09-05T10:00:00Z" }),
    ]);
    const byId = new Map(rows.map((r) => [r.reportId, r]));
    expect(byId.get("r1")!.canonicalWithinCohortMint).toBe(true);
    expect(byId.get("r2")!.sameCohortRerun).toBe(true);
  });

  it("allows the same mint again in a legitimately new cohort", () => {
    const rows = classifyThesisArtifacts([
      artifact({ reportId: "r1", mint: A, triageRunId: "t1", synthesizedAt: "2026-09-01T10:00:00Z" }),
      artifact({ reportId: "r2", mint: A, triageRunId: "t2", synthesizedAt: "2026-09-05T10:00:00Z" }),
    ]);
    expect(rows.every((r) => r.canonicalWithinCohortMint)).toBe(true);
    const second = rows.find((r) => r.reportId === "r2")!;
    expect(second.recurrenceNumberAcrossProductionCohorts).toBe(2);
    expect(second.timeSincePriorCanonicalSynthesisMs).toBeGreaterThan(0);
  });

  it("keeps reruns visible but excludes them from canonical KPIs", () => {
    const rows = classifyThesisArtifacts([
      artifact({ reportId: "r1", mint: A, triageRunId: "t1", synthesizedAt: "2026-09-01T10:00:00Z", perf: { since: 10, peak: 20, dd: -5 } }),
      artifact({ reportId: "r2", mint: A, triageRunId: "t1", synthesizedAt: "2026-09-01T11:00:00Z", perf: { since: 90, peak: 200, dd: -1 } }),
      artifact({ reportId: "r3", mint: B, triageRunId: "t1", synthesizedAt: "2026-09-01T12:00:00Z", perf: { since: -10, peak: 5, dd: -30 } }),
    ]);
    expect(rows).toHaveLength(3);
    const counts = thesisPopulationCounts(rows);
    expect(counts).toEqual({
      storedArtifacts: 3,
      thesisEvents: 2,
      uniqueTokens: 2,
      sameCohortReruns: 1,
    });
    const events = selectThesisPopulation(rows, "THESIS_EVENTS");
    expect(events.map((r) => r.reportId).sort()).toEqual(["r1", "r3"]);
    expect(summarizeThesisArtifacts(events).artifactsWithBaseline).toBe(2);
  });

  it("UNIQUE TOKENS takes the earliest canonical event, never the best", () => {
    const rows = classifyThesisArtifacts([
      artifact({ reportId: "early", mint: A, triageRunId: "t1", synthesizedAt: "2026-09-01T10:00:00Z", thesisScore: 40, perf: { since: -20, peak: 1, dd: -50 } }),
      artifact({ reportId: "late", mint: A, triageRunId: "t2", synthesizedAt: "2026-09-09T10:00:00Z", thesisScore: 95, perf: { since: 400, peak: 900, dd: -2 } }),
    ]);
    const unique = selectThesisPopulation(rows, "UNIQUE_TOKENS");
    expect(unique.map((r) => r.reportId)).toEqual(["early"]);
  });
});
