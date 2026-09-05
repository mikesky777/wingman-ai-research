import { describe, expect, it } from "vitest";
import {
  sortThesisArtifacts,
  summarizeThesisArtifacts,
  type ThesisArtifact,
} from "./artifacts";

function artifact(over: Partial<ThesisArtifact> & { reportId: string }): ThesisArtifact {
  return {
    mint: over.mint ?? `mint-${over.reportId}`,
    symbol: null,
    name: null,
    pairAddress: null,
    reportId: over.reportId,
    synthesizedAt: "2026-09-05T18:00:00.000Z",
    thesisScore: null,
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
    triageRunId: null,
    deepResearchRunId: null,
    baseline: null,
    performance: null,
    ...over,
  };
}

const measured = (
  reportId: string,
  perf: { since: number | null; peak: number | null; dd: number | null },
  extra: Partial<ThesisArtifact> = {},
): ThesisArtifact =>
  artifact({
    reportId,
    baseline: {
      origin: "RESOLVED_DECISION_TIME",
      observedAt: "2026-09-05T17:06:00.000Z",
      marketCap: 100,
      priceUsd: 1,
      liquidityUsd: 1000,
      volume24h: null,
      pairAddress: null,
      source: "dexscreener",
    },
    performance: {
      sincePct: perf.since,
      peakPct: perf.peak,
      drawdownPct: perf.dd,
      currentMarketCap: 120,
      currentPriceUsd: 1.2,
      currentLiquidityUsd: 900,
      currentVolume24h: 50,
      priceChange1h: null,
      priceChange24h: null,
      currentObservedAt: "2026-09-05T19:00:00.000Z",
      observationCount: 4,
    },
    ...extra,
  });

describe("thesis artifact performance summary", () => {
  it("only counts artifacts that have a thesis-time baseline", () => {
    const rows = [
      measured("a", { since: 20, peak: 40, dd: -10 }),
      measured("b", { since: -10, peak: 5, dd: -30 }),
      artifact({ reportId: "c" }),
    ];
    const s = summarizeThesisArtifacts(rows);
    expect(s.artifactsWithBaseline).toBe(2);
    expect(s.uniqueTokens).toBe(2);
    expect(s.avgSince.value).toBe(5);
    expect(s.avgSince.n).toBe(2);
    expect(s.winRate.value).toBe(50);
    expect(s.medianMaxDd.value).toBe(-20);
  });

  it("never treats a missing measurement as zero", () => {
    const s = summarizeThesisArtifacts([
      measured("a", { since: 10, peak: null, dd: null }),
      artifact({ reportId: "b" }),
    ]);
    expect(s.avgPeak.value).toBeNull();
    expect(s.avgPeak.n).toBe(0);
    expect(s.avgSince.value).toBe(10);
  });

  it("returns null statistics when nothing is measurable", () => {
    const s = summarizeThesisArtifacts([artifact({ reportId: "a" })]);
    expect(s.artifactsWithBaseline).toBe(0);
    expect(s.avgSince.value).toBeNull();
    expect(s.winRate.value).toBeNull();
  });

  it("keeps every synthesis event of the same mint", () => {
    const rows = [
      measured("a", { since: 10, peak: 20, dd: -5 }, { mint: "same" }),
      measured("b", { since: 30, peak: 60, dd: -15 }, { mint: "same" }),
    ];
    const s = summarizeThesisArtifacts(rows);
    expect(s.artifactsWithBaseline).toBe(2);
    expect(s.uniqueTokens).toBe(1);
    expect(sortThesisArtifacts(rows, "PEAK")).toHaveLength(2);
  });
});

describe("thesis artifact sorting", () => {
  const rows = [
    measured("a", { since: 10, peak: 20, dd: -5 }),
    measured("b", { since: 40, peak: 90, dd: -60 }),
    artifact({ reportId: "c", thesisScore: 99 }),
  ];

  it("sorts unmeasured artifacts last", () => {
    expect(sortThesisArtifacts(rows, "PEAK").map((r) => r.reportId)).toEqual(["b", "a", "c"]);
    expect(sortThesisArtifacts(rows, "SINCE").map((r) => r.reportId)).toEqual(["b", "a", "c"]);
    expect(sortThesisArtifacts(rows, "WORST_DD").map((r) => r.reportId)).toEqual(["b", "a", "c"]);
  });

  it("sorts by thesis score independently of performance", () => {
    expect(sortThesisArtifacts(rows, "SCORE")[0]?.reportId).toBe("c");
  });
});
