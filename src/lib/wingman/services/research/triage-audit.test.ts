import { describe, expect, it } from "vitest";
import { buildTriagePrompt, redactCompactForTriage, orderCandidates, type ComparedDecision } from "./triage";
import {
  auditBias,
  auditClaims,
  auditComparativeValue,
  auditMissingEvidence,
  buildStabilityReport,
  classifyStability,
  spearman,
} from "./triage-audit";

function row(overrides: Partial<ComparedDecision> = {}): ComparedDecision {
  return {
    mint: "mint-1",
    decision: "WATCH",
    triageRank: 1,
    confidence: "MEDIUM",
    rationale: "Liquidity and turnover justify a second look.",
    strongestPositive: "Broad participation across 1h windows.",
    strongestConcern: "Valuation already extended versus liquidity.",
    unresolvedQuestions: [],
    requestedResearchDomains: [],
    candidateSource: "SURVIVOR",
    researchPacketId: "packet-1",
    researchPacketVersion: "research_packet/v1",
    quantPriority: 10,
    quantRank: 1,
    rankDelta: 0,
    setup: "BASE",
    priceStructure: "HEALTHY",
    participation: "BROAD",
    ...overrides,
  };
}

describe("triage input redaction", () => {
  it("strips realized outcome context from the model input", () => {
    const compact = { id: { mint: "m" }, mkt: { mc: 1 }, outcomes: { peak_call: 900 } };
    expect(redactCompactForTriage(compact)).toEqual({ id: { mint: "m" }, mkt: { mc: 1 } });
  });

  it("never sends outcome fields in the built prompt", () => {
    const prompt = buildTriagePrompt({
      header: {
        scanId: "scan",
        scannerPolicyVersion: "sel/v1",
        triagePolicyVersion: "ai_triage/v1",
        promptVersion: "p",
        mode: "CALIBRATION",
        candidateCount: 1,
        generatedAt: "2026-01-01T00:00:00Z",
        maxDeepResearch: 15,
      },
      cohort: {
        candidateCount: 1,
        medianQuantPriority: 1,
        medianMarketCap: 1,
        medianLiquidityUsd: 1,
        setupCounts: {},
        priceStructureCounts: {},
        participationCounts: {},
        recurrenceCounts: {},
        sourceCounts: {},
      },
      candidates: [
        {
          mint: "m",
          candidateSource: "SURVIVOR",
          researchPacketId: "p",
          researchPacketVersion: "v1",
          quantPriority: 1,
          quantRank: 1,
          compact: { outcomes: { peak_call: 900, since_call: 400 }, mkt: { mc: 100 } },
        },
      ],
    });
    expect(prompt.user).not.toContain("peak_call");
    expect(prompt.user).not.toContain("outcomes");
    expect(prompt.user).toContain("mkt");
  });
});

describe("deterministic presentation order", () => {
  it("keeps order when no seed is supplied", () => {
    const rows = [{ mint: "a" }, { mint: "b" }, { mint: "c" }];
    expect(orderCandidates(rows, null)).toEqual(rows);
  });

  it("is deterministic and lossless when seeded", () => {
    const rows = [{ mint: "a" }, { mint: "b" }, { mint: "c" }];
    const first = orderCandidates(rows, 7919).map((r) => r.mint);
    const second = orderCandidates(rows, 7919).map((r) => r.mint);
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("unsupported-claim audit", () => {
  it("flags un-researched external domains asserted as fact", () => {
    const audit = auditClaims([
      row({ mint: "m1", rationale: "Strong community and viral twitter mindshare support this." }),
    ]);
    expect(audit.unsupportedCount).toBeGreaterThan(0);
    expect(audit.affectedMints).toEqual(["m1"]);
  });

  it("does not flag hedged requests for future research", () => {
    const audit = auditClaims([
      row({ mint: "m2", rationale: "Community strength is unknown and would need research." }),
    ]);
    expect(audit.unsupportedCount).toBe(0);
  });

  it("counts packet-grounded claims as audited but supported", () => {
    const audit = auditClaims([row()]);
    expect(audit.totalClaimsAudited).toBeGreaterThan(0);
    expect(audit.unsupportedCount).toBe(0);
  });
});

describe("missing-evidence behaviour", () => {
  it("separates 'we do not know' from 'this is bad'", () => {
    const audit = auditMissingEvidence([
      row({
        mint: "unknown-ok",
        priceStructure: "NOT_EVALUATED",
        rationale: "Price Structure is NOT_EVALUATED, so structure is unknown rather than adverse.",
      }),
      row({
        mint: "bad",
        participation: "NOT_EVALUATED",
        rationale: "Participation is missing, which is a weak, risky profile.",
      }),
    ]);
    expect(audit.candidatesWithGaps).toBe(2);
    expect(audit.counts.NEUTRAL_UNKNOWN).toBe(1);
    expect(audit.counts.TREATED_AS_NEGATIVE).toBe(1);
  });
});

describe("semantic bias", () => {
  it("flags mechanical rejection of every NONE candidate", () => {
    const rows = ["a", "b", "c"].map((m) =>
      row({ mint: m, setup: "NONE", decision: "SKIP", quantRank: 1, rankDelta: 0 }),
    );
    expect(auditBias(rows).flags).toContain("ALL_NONE_DEMOTED");
  });

  it("flags a pure copy of the Quant ordering", () => {
    const rows = [1, 2, 3, 4, 5].map((i) =>
      row({ mint: `m${i}`, quantRank: i, triageRank: i, rankDelta: 0, decision: "WATCH" }),
    );
    expect(auditBias(rows).flags).toContain("QUANT_ORDER_COPIED");
  });

  it("does not flag mixed behaviour", () => {
    const rows = [
      row({ mint: "a", setup: "NONE", decision: "DEEP_RESEARCH", quantRank: 5, triageRank: 1, rankDelta: 4 }),
      row({ mint: "b", setup: "NONE", decision: "SKIP", quantRank: 1, triageRank: 5, rankDelta: -4 }),
      row({ mint: "c", setup: "BASE", decision: "WATCH", quantRank: 2, triageRank: 3, rankDelta: -1 }),
    ];
    expect(auditBias(rows).flags).toEqual([]);
  });
});

describe("comparative value", () => {
  it("reports correlation and the largest moves", () => {
    const rows = [
      row({ mint: "up", quantRank: 42, triageRank: 4, rankDelta: 38, decision: "DEEP_RESEARCH" }),
      row({ mint: "down", quantRank: 2, triageRank: 30, rankDelta: -28, decision: "SKIP" }),
      row({ mint: "flat", quantRank: 10, triageRank: 10, rankDelta: 0 }),
    ];
    const audit = auditComparativeValue(rows);
    expect(audit.topPromotions[0]?.mint).toBe("up");
    expect(audit.topDemotions[0]?.mint).toBe("down");
    expect(audit.highQuantSkipped.map((r) => r.mint)).toContain("down");
    expect(audit.maxAbsRankMove).toBe(38);
    expect(spearman([1, 2, 3], [1, 2, 3])).toBe(1);
  });
});

describe("stability classification", () => {
  it("uses the documented methodology", () => {
    expect(classifyStability(["DEEP_RESEARCH", "DEEP_RESEARCH"])).toBe("STABLE");
    expect(classifyStability(["DEEP_RESEARCH", "WATCH"])).toBe("BORDERLINE");
    expect(classifyStability(["DEEP_RESEARCH", "SKIP"])).toBe("UNSTABLE");
    expect(classifyStability(["DEEP_RESEARCH", "WATCH", "SKIP"])).toBe("UNSTABLE");
  });

  it("aggregates overlap and switchers across runs", () => {
    const runA = [
      row({ mint: "a", decision: "DEEP_RESEARCH", triageRank: 1 }),
      row({ mint: "b", decision: "WATCH", triageRank: 2 }),
    ];
    const runB = [
      row({ mint: "a", decision: "DEEP_RESEARCH", triageRank: 1 }),
      row({ mint: "b", decision: "SKIP", triageRank: 2 }),
    ];
    const report = buildStabilityReport([runA, runB]);
    expect(report.runs).toBe(2);
    expect(report.deepCountsPerRun).toEqual([1, 1]);
    expect(report.shortlistOverlapPct[0]).toBe(100);
    expect(report.classification.STABLE).toBe(1);
    expect(report.classification.BORDERLINE).toBe(1);
  });
});
