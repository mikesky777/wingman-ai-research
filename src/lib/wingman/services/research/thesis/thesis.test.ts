import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_POLICY,
  THESIS_COMPONENTS,
  THESIS_MAX_SCORE,
  buildThesisSystemPrompt,
  computeEvidenceConfidence,
  deriveVerdict,
  qualifiesAsOpportunity,
  redactCompactForThesis,
  selectOpportunities,
  validateThesisOutput,
  type EvidenceConfidenceInput,
} from "./contracts";

const richEvidence: EvidenceConfidenceInput = {
  unresolvedDomainCount: 0,
  totalDomainCount: 6,
  independentSourceCount: 5,
  distinctIndependentEvidenceOrigins: 5,
  distinctEvidenceOrigins: 6,
  sourceCount: 8,
  rawSourceCount: 8,
  sourceDomainDiversity: 5,
  conflictingClaimCount: 0,
  corroboratedClaimCount: 6,
  tokenIdentityConfidence: "CONFIRMED",
  projectAttributionConfidence: "CONFIRMED",
  narrativeResolved: true,
  packetEvidenceGapCount: 0,
  marketStale: false,
  searchUnavailable: false,
};

function fullOutput(overrides: Record<string, unknown> = {}) {
  return {
    components: Object.fromEntries(THESIS_COMPONENTS.map((c) => [c.key, c.weight])),
    oneSentenceThesis: "A recognizable origin meme with independently reported spread.",
    narrativeThesis: "Narrative body.",
    sections: {
      thesis: "t",
      catalyst: "c",
      mindshare: "m",
      holdersDev: "h",
      valuation: "v",
    },
    strongestBullCase: "Independent coverage keeps expanding the audience.",
    strongestBearCase: "Attention is concentrated in a handful of accounts.",
    bearCaseSeverity: "MODERATE",
    strongestCatalyst: "Listing coverage",
    strongestConcern: "Concentrated attention",
    catalysts: ["Listing coverage"],
    invalidation: ["Independent mention velocity stalls for 24h"],
    evidenceGaps: [],
    supportingClaimRefs: ["C1"],
    supportingSourceRefs: ["S1"],
    criticalUnresolvedIssues: 0,
    ...overrides,
  };
}

const known = { sourceRefs: ["S1", "S2"], claimRefs: ["C1", "C2"] };

describe("thesis_synthesis/v2 rubric", () => {
  it("has exactly 7 fundamentals-only components summing to 100", () => {
    expect(THESIS_COMPONENTS).toHaveLength(7);
    expect(THESIS_COMPONENTS.map((c) => c.key)).not.toContain("chartContext");
    expect(THESIS_MAX_SCORE).toBe(100);
  });

  it("recomputes the total as the exact sum of components and caps at 100", () => {
    const v = validateThesisOutput(fullOutput(), known);
    expect(v.thesisScore).toBe(100);
    const sum = THESIS_COMPONENTS.reduce((s, c) => s + (v.components[c.key] ?? 0), 0);
    expect(v.thesisScore).toBe(sum);
  });

  it("clamps out-of-range component scores instead of trusting the model", () => {
    const v = validateThesisOutput(
      fullOutput({ components: { memeQuality: 999, valuation: -4 } }),
      known,
    );
    expect(v.components.memeQuality).toBe(20);
    expect(v.components.valuation).toBe(0);
    expect(v.thesisScore).toBeLessThanOrEqual(100);
    expect(v.issues.some((i) => i.code === "COMPONENT_OUT_OF_RANGE")).toBe(true);
  });

  it("drops citations that do not exist in the dossier", () => {
    const v = validateThesisOutput(
      fullOutput({ supportingSourceRefs: ["S1", "S9"], supportingClaimRefs: ["C7"] }),
      known,
    );
    expect(v.supportingSourceRefs).toEqual(["S1"]);
    expect(v.supportingClaimRefs).toEqual([]);
    expect(v.issues.some((i) => i.code === "UNKNOWN_SOURCE_REF")).toBe(true);
  });

  it("strips trade language and generic invalidation", () => {
    const v = validateThesisOutput(
      fullOutput({
        oneSentenceThesis: "Strong buy zone with a tight stop loss.",
        invalidation: ["price goes down", "Liquidity halves versus the synthesis baseline"],
      }),
      known,
    );
    expect(v.oneSentenceThesis).toBeNull();
    expect(v.invalidation).toEqual(["Liquidity halves versus the synthesis baseline"]);
    expect(v.issues.some((i) => i.code === "TRADE_LANGUAGE_STRIPPED")).toBe(true);
  });

  it("produces no entry state, sizing or trade fields", () => {
    const v = validateThesisOutput(fullOutput(), known) as unknown as Record<string, unknown>;
    for (const banned of ["entryState", "positionSize", "stopLoss", "priceTarget", "action"]) {
      expect(v[banned]).toBeUndefined();
    }
    const system = buildThesisSystemPrompt();
    expect(system).toMatch(/Never output a buy\/sell recommendation/);
  });
});

describe("evidence confidence", () => {
  it("is high when evidence is complete, independent and fresh", () => {
    expect(computeEvidenceConfidence(richEvidence).score).toBe(100);
  });

  it("falls when evidence is missing, without touching the thesis score", () => {
    const thin = computeEvidenceConfidence({
      ...richEvidence,
      unresolvedDomainCount: 3,
      independentSourceCount: 0,
      distinctIndependentEvidenceOrigins: 0,
      packetEvidenceGapCount: 4,
    });
    expect(thin.score).toBeLessThan(60);
    // the same model output scores identically regardless of evidence coverage
    const v = validateThesisOutput(fullOutput(), known);
    expect(v.thesisScore).toBe(100);
  });

  it("penalises project-owned-only evidence: it can never masquerade as corroboration", () => {
    const projectOnly = computeEvidenceConfidence({
      ...richEvidence,
      independentSourceCount: 0,
      distinctIndependentEvidenceOrigins: 0,
      sourceCount: 4,
      sourceDomainDiversity: 2,
    });
    expect(projectOnly.score).toBeLessThan(computeEvidenceConfidence(richEvidence).score);
    expect(projectOnly.deductions.some((d) => d.code === "INDEPENDENT_SOURCES")).toBe(true);
  });

  it("treats unavailable search as unproven absence, not a finding", () => {
    const unavailable = computeEvidenceConfidence({
      ...richEvidence,
      searchUnavailable: true,
      searchHealth: "SEARCH_UNAVAILABLE",
      sourceCount: 0,
      independentSourceCount: 0,
      distinctIndependentEvidenceOrigins: 0,
      unresolvedDomainCount: 6,
    });
    expect(unavailable.deductions.some((d) => d.code === "SEARCH_UNAVAILABLE")).toBe(true);
    expect(unavailable.score).toBeLessThan(35);
  });
});

describe("verdict", () => {
  const base = {
    thesisScore: 82,
    evidenceConfidence: 80,
    bearSeverity: "LOW" as const,
    evidenceUnusable: false,
    criticalUnresolvedIssues: 0,
  };

  it("awards STRONG_THESIS only with score AND evidence", () => {
    expect(deriveVerdict(base)).toBe("STRONG_THESIS");
    expect(deriveVerdict({ ...base, evidenceConfidence: 40 })).not.toBe("STRONG_THESIS");
  });

  it("returns INSUFFICIENT_EVIDENCE even when the thesis looks interesting", () => {
    expect(deriveVerdict({ ...base, thesisScore: 88, evidenceUnusable: true })).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    expect(deriveVerdict({ ...base, evidenceConfidence: 20 })).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("never upgrades past a critical bear case", () => {
    expect(deriveVerdict({ ...base, bearSeverity: "CRITICAL" })).toBe("WEAK_THESIS");
  });
});

describe("opportunity policy", () => {
  const good = {
    mint: "A",
    thesisScore: 80,
    evidenceConfidence: 75,
    verdict: "STRONG_THESIS" as const,
    bearSeverity: "LOW" as const,
    independentSourceCount: 4,
    eligibleNow: true,
  };

  it("qualifies only genuinely strong, currently eligible syntheses", () => {
    expect(qualifiesAsOpportunity(good)).toBe(true);
    expect(qualifiesAsOpportunity({ ...good, eligibleNow: false })).toBe(false);
    expect(qualifiesAsOpportunity({ ...good, thesisScore: 62 })).toBe(false);
    expect(qualifiesAsOpportunity({ ...good, evidenceConfidence: 40 })).toBe(false);
    expect(qualifiesAsOpportunity({ ...good, bearSeverity: "HIGH" })).toBe(false);
    expect(qualifiesAsOpportunity({ ...good, independentSourceCount: 0 })).toBe(false);
  });

  it("never force-fills the shortlist and never exceeds 5", () => {
    const weak = Array.from({ length: 8 }, (_, i) => ({
      ...good,
      mint: `W${i}`,
      thesisScore: 50,
      verdict: "WATCH" as const,
    }));
    expect(selectOpportunities(weak)).toHaveLength(0);

    const strong = Array.from({ length: 8 }, (_, i) => ({ ...good, mint: `S${i}` }));
    expect(selectOpportunities(strong)).toHaveLength(OPPORTUNITY_POLICY.maxOpportunities);
  });

  it("keeps NONE-setup and DAMAGED-structure candidates eligible", () => {
    // Setup and price structure are context, not gates: nothing in the policy
    // reads them, so a NONE / DAMAGED candidate qualifies on evidence alone.
    expect(qualifiesAsOpportunity(good)).toBe(true);
  });
});

describe("hindsight safety", () => {
  it("strips realized outcomes from the synthesis input", () => {
    const compact = { mint: "A", scan: { setups: ["NONE"] }, outcomes: { since_call: 412 } };
    const redacted = redactCompactForThesis(compact);
    expect(redacted["outcomes"]).toBeUndefined();
    expect(JSON.stringify(redacted)).not.toMatch(/since_call|peak_call|mae_call|drawdown/);
    expect(redacted["scan"]).toEqual({ setups: ["NONE"] });
  });

  it("forbids post-cutoff reasoning in the prompt contract", () => {
    expect(buildThesisSystemPrompt()).toMatch(/Never reason about what happened to the price after/);
  });
});

describe("thesis v2 excludes timing from thesis quality", () => {
  it("awards zero thesis points for timing/chart keys even if the model returns them", () => {
    const withTiming = validateThesisOutput(
      fullOutput({
        components: {
          ...Object.fromEntries(THESIS_COMPONENTS.map((c) => [c.key, 0])),
          memeQuality: 10,
          chartContext: 10,
          entryQuality: 10,
        },
      }),
      known,
    );
    expect(withTiming.thesisScore).toBe(10);
    expect(THESIS_COMPONENTS.map((c) => c.key)).not.toContain("chartContext");
  });
});
