import { describe, expect, it } from "vitest";
import { buildTriagePrompt, inputPolicyVersionFor, redactCompactForTriage, type ComparedDecision } from "./triage";
import {
  chooseCounterfactualPairs,
  compareVariants,
  decisionFrequencies,
  groupRates,
  swapEffects,
  swapMapFor,
  toRunDecisions,
} from "./triage-ablation";

const compact = {
  id: { mint: "m1" },
  src: "EXPLORATION",
  mkt: { mc: 50000, liq: 12000 },
  scan: { setups: ["NONE"], survivor: false, route: "GLOBAL", prio: 40, seen: 1 },
  outcomes: { peak_call: 900 },
};

function dec(mint: string, decision: ComparedDecision["decision"], rank: number): ComparedDecision {
  return {
    mint,
    decision,
    triageRank: rank,
    confidence: "MEDIUM",
    rationale: "r",
    strongestPositive: null,
    strongestConcern: null,
    unresolvedQuestions: [],
    requestedResearchDomains: [],
    candidateSource: "EXPLORATION",
    researchPacketId: null,
    researchPacketVersion: "v1",
    quantPriority: 1,
    quantRank: rank,
    rankDelta: 0,
    setup: "NONE",
    priceStructure: "NOT_EVALUATED",
    participation: "NOT_EVALUATED",
  };
}

describe("source-blinded serialization", () => {
  it("hides provenance but keeps every market and evidence fact", () => {
    const out = redactCompactForTriage(compact, { blindSource: true }) as Record<string, any>;
    expect(out["src"]).toBeUndefined();
    expect(out["scan"].survivor).toBeUndefined();
    expect(out["scan"].route).toBeUndefined();
    expect(out["scan"].setups).toEqual(["NONE"]);
    expect(out["scan"].prio).toBe(40);
    expect(out["mkt"]).toEqual({ mc: 50000, liq: 12000 });
    expect(out["outcomes"]).toBeUndefined();
  });

  it("drops the candidate_source field and cohort source mix from the prompt", () => {
    const prompt = buildTriagePrompt({
      header: {
        scanId: "s",
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
        setupCounts: { NONE: 1 },
        priceStructureCounts: {},
        participationCounts: {},
        recurrenceCounts: {},
        sourceCounts: { EXPLORATION: 1 },
      },
      candidates: [
        {
          mint: "m1",
          candidateSource: "EXPLORATION",
          researchPacketId: null,
          researchPacketVersion: "v1",
          quantPriority: 1,
          quantRank: 1,
          compact,
        },
      ],
      ablation: { blindSource: true },
    });
    expect(prompt.user).not.toContain("candidate_source");
    expect(prompt.user).not.toContain("EXPLORATION");
    expect(prompt.user).not.toContain("sourceCounts");
    expect(prompt.user).toContain("50000");
  });
});

describe("neutral setup serialization", () => {
  it("replaces the literal label with recognized_setup and keeps the facts", () => {
    const none = redactCompactForTriage(compact, { neutralSetup: true }) as Record<string, any>;
    expect(none["scan"].setups).toBeUndefined();
    expect(none["scan"].recognized_setup).toBe(false);
    expect(none["scan"].prio).toBe(40);
    const base = redactCompactForTriage(
      { ...compact, scan: { ...compact.scan, setups: ["BASE"] } },
      { neutralSetup: true },
    ) as Record<string, any>;
    expect(base["scan"].recognized_setup).toBe(true);
  });
});

describe("counterfactual source labels", () => {
  it("swaps only the label, never the evidence", () => {
    const out = redactCompactForTriage(compact, { sourceLabelOverrides: { m1: "SURVIVOR" } }, "SURVIVOR") as Record<
      string,
      any
    >;
    expect(out["src"]).toBe("SURVIVOR");
    expect(out["scan"].survivor).toBe(true);
    expect(out["scan"].route).toBeUndefined();
    expect(out["mkt"]).toEqual({ mc: 50000, liq: 12000 });
  });

  it("pairs each exploration candidate with the closest survivor by scale", () => {
    const pairs = chooseCounterfactualPairs(
      [
        { mint: "e1", candidateSource: "EXPLORATION", marketCap: 50000, liquidityUsd: 10000 },
        { mint: "e2", candidateSource: "EXPLORATION", marketCap: 5_000_000, liquidityUsd: 900_000 },
        { mint: "s1", candidateSource: "SURVIVOR", marketCap: 52000, liquidityUsd: 10500 },
        { mint: "s2", candidateSource: "SURVIVOR", marketCap: 4_800_000, liquidityUsd: 880_000 },
      ],
      2,
    );
    expect(pairs.map((p) => [p.explorationMint, p.survivorMint]).sort()).toEqual([
      ["e1", "s1"],
      ["e2", "s2"],
    ]);
    expect(swapMapFor(pairs)).toEqual({ e1: "SURVIVOR", s1: "EXPLORATION", e2: "SURVIVOR", s2: "EXPLORATION" });
  });
});

describe("input policy version", () => {
  it("names exactly what the model was allowed to see", () => {
    expect(inputPolicyVersionFor(null)).toBe("ai_triage_input/v2_allowlist_no_outcomes");
    expect(inputPolicyVersionFor({ blindSource: true })).toContain("+blind_source");
    expect(inputPolicyVersionFor({ neutralSetup: true })).toContain("+neutral_setup");
    expect(inputPolicyVersionFor({ sourceLabelOverrides: { a: "SURVIVOR" } })).toContain("+source_label_swap");
  });
});

describe("variant comparison", () => {
  const baseline = [
    toRunDecisions([dec("a", "SKIP", 3), dec("b", "DEEP_RESEARCH", 1)]),
    toRunDecisions([dec("a", "SKIP", 4), dec("b", "DEEP_RESEARCH", 1)]),
  ];
  const variant = [
    toRunDecisions([dec("a", "DEEP_RESEARCH", 1), dec("b", "DEEP_RESEARCH", 2)]),
    toRunDecisions([dec("a", "DEEP_RESEARCH", 2), dec("b", "DEEP_RESEARCH", 1)]),
  ];

  it("reports per-candidate frequencies", () => {
    const freq = decisionFrequencies(baseline);
    expect(freq.find((f) => f.mint === "a")?.deepRatePct).toBe(0);
    expect(freq.find((f) => f.mint === "b")?.modalDecision).toBe("DEEP_RESEARCH");
  });

  it("reports group rates for a subset", () => {
    expect(groupRates(baseline, ["a"]).deepRatePct).toBe(0);
    expect(groupRates(variant, ["a"]).deepRatePct).toBe(100);
  });

  it("detects a modal decision change and rank shift", () => {
    const cmp = compareVariants(baseline, variant);
    expect(cmp.modalDecisionAgreementPct).toBe(50);
    expect(cmp.changedMints).toEqual([
      { mint: "a", from: "SKIP", to: "DEEP_RESEARCH", baselineRank: 3.5, variantRank: 1.5 },
    ]);
    // mean over both mints: a improves 2 ranks, b drifts -0.5
    expect(cmp.meanRankShift).toBe(0.75);
  });

  it("measures the label-swap effect per mint", () => {
    const effects = swapEffects(baseline, variant, { a: "SURVIVOR" }, { a: "EXPLORATION" });
    expect(effects[0]).toMatchObject({
      mint: "a",
      presentedAs: "SURVIVOR",
      trueSource: "EXPLORATION",
      baselineDeepRatePct: 0,
      swappedDeepRatePct: 100,
      deepRateDeltaPct: 100,
      rankShift: 2,
    });
  });
});
