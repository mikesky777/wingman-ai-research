import { describe, expect, it } from "vitest";
import {
  TRIAGE_POLICY_VERSION,
  TRIAGE_PROMPT_VERSION,
  analyzeCalibration,
  buildCohortSummary,
  buildTriagePrompt,
  compareWithQuant,
  validateTriageOutput,
  withQuantRanks,
  type TriageCandidateInput,
  type TriageDecisionRecord,
} from "./triage";

function candidate(
  mint: string,
  priority: number | null,
  compact: Record<string, unknown> = {},
): Omit<TriageCandidateInput, "quantRank"> {
  return {
    mint,
    candidateSource: "SURVIVOR",
    researchPacketId: `packet-${mint}`,
    researchPacketVersion: "research_packet/v1",
    quantPriority: priority,
    compact: { id: { mint }, ...compact },
  };
}

function decision(
  mint: string,
  rank: number,
  overrides: Partial<TriageDecisionRecord> = {},
): Record<string, unknown> {
  return {
    mint,
    decision: "DEEP_RESEARCH",
    research_priority_rank: rank,
    confidence: "MEDIUM",
    rationale: "Broad participation with liquidity that justifies deeper work.",
    strongest_positive: "Repeat appearance across scans.",
    strongest_concern: "No external narrative evidence yet.",
    unresolved_questions: ["Is the community organic?"],
    requested_research_domains: ["mindshare"],
    ...overrides,
  };
}

describe("quant ranking", () => {
  it("ranks by priority, highest first, missing priority last", () => {
    const ranked = withQuantRanks([candidate("a", 10), candidate("b", 50), candidate("c", null)]);
    expect(ranked.find((c) => c.mint === "b")?.quantRank).toBe(1);
    expect(ranked.find((c) => c.mint === "a")?.quantRank).toBe(2);
    expect(ranked.find((c) => c.mint === "c")?.quantRank).toBe(3);
  });
});

describe("prompt", () => {
  const candidates = withQuantRanks([candidate("a", 10), candidate("b", 5)]);

  it("is deterministic for identical input", () => {
    const build = () =>
      buildTriagePrompt({
        header: {
          scanId: "scan-1",
          scannerPolicyVersion: "selection/v1",
          triagePolicyVersion: TRIAGE_POLICY_VERSION,
          promptVersion: TRIAGE_PROMPT_VERSION,
          mode: "PRODUCTION",
          candidateCount: candidates.length,
          generatedAt: "2026-01-01T00:00:00.000Z",
          maxDeepResearch: 15,
        },
        cohort: buildCohortSummary(candidates),
        candidates,
      });
    expect(build().user).toBe(build().user);
  });

  it("forbids buy/sell language and external claims in the system contract", () => {
    const prompt = buildTriagePrompt({
      header: {
        scanId: "scan-1",
        scannerPolicyVersion: "selection/v1",
        triagePolicyVersion: TRIAGE_POLICY_VERSION,
        promptVersion: TRIAGE_PROMPT_VERSION,
        mode: "PRODUCTION",
        candidateCount: candidates.length,
        generatedAt: "2026-01-01T00:00:00.000Z",
        maxDeepResearch: 15,
      },
      cohort: buildCohortSummary(candidates),
      candidates,
    });
    expect(prompt.system).toContain("FORBIDDEN OUTPUT");
    expect(prompt.system).toContain("Missing evidence is NOT negative evidence");
    expect(prompt.bytes).toBeGreaterThan(0);
  });
});

describe("output validation", () => {
  const mints = ["a", "b"];

  it("accepts a well-formed response", () => {
    const result = validateTriageOutput({ decisions: [decision("a", 1), decision("b", 2)] }, mints, 15);
    expect(result.ok).toBe(true);
    expect(result.decisions).toHaveLength(2);
  });

  it("rejects a mint that was never in the cohort", () => {
    const result = validateTriageOutput({ decisions: [decision("zzz", 1)] }, mints, 15);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("UNKNOWN_MINT");
  });

  it("rejects duplicates", () => {
    const result = validateTriageOutput({ decisions: [decision("a", 1), decision("a", 2)] }, mints, 15);
    expect(result.errors.map((e) => e.code)).toContain("DUPLICATE_MINT");
  });

  it("rejects an invalid decision label", () => {
    const result = validateTriageOutput(
      { decisions: [decision("a", 1, { decision: "BUY" } as never)] },
      mints,
      15,
    );
    expect(result.errors.map((e) => e.code)).toContain("INVALID_DECISION");
  });

  it("rejects more shortlisted candidates than the cap allows", () => {
    const result = validateTriageOutput({ decisions: [decision("a", 1), decision("b", 2)] }, mints, 1);
    expect(result.errors.map((e) => e.code)).toContain("DEEP_RESEARCH_LIMIT_EXCEEDED");
  });

  it("rejects a non-object response instead of inventing decisions", () => {
    expect(validateTriageOutput("nope", mints, 15).ok).toBe(false);
    expect(validateTriageOutput({}, mints, 15).errors.map((e) => e.code)).toContain(
      "MISSING_DECISIONS",
    );
  });
});

describe("calibration analysis", () => {
  const candidates = withQuantRanks([
    candidate("a", 90, { price_integrity: { status: "DAMAGED" }, scan: { setups: [] } }),
    candidate("b", 80, { price_integrity: { status: "DAMAGED" }, scan: { setups: [] } }),
    candidate("c", 70, { price_integrity: { status: "DAMAGED" }, scan: { setups: [] } }),
  ]);

  it("flags a model that auto-rejects damaged price structure", () => {
    const validated = validateTriageOutput(
      {
        decisions: candidates.map((c, i) => decision(c.mint, i + 1, { decision: "SKIP" })),
      },
      candidates.map((c) => c.mint),
      15,
    );
    const analysis = analyzeCalibration(compareWithQuant(validated.decisions, candidates));
    expect(analysis.warnings).toContain("AUTO_REJECTS_DAMAGED");
    expect(analysis.warnings).toContain("AUTO_REJECTS_NONE");
  });

  it("flags a model that simply reproduces the quant ranking", () => {
    const validated = validateTriageOutput(
      { decisions: candidates.map((c, i) => decision(c.mint, i + 1, { decision: "WATCH" })) },
      candidates.map((c) => c.mint),
      15,
    );
    const analysis = analyzeCalibration(compareWithQuant(validated.decisions, candidates));
    expect(analysis.warnings).toContain("COPIES_QUANT_RANKING");
  });
});
