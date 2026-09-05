import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_POLICY,
  THESIS_COMPONENTS,
  THESIS_COMPONENT_ANCHORS,
  THESIS_MAX_SCORE,
  THESIS_PROMPT_VERSION,
  THESIS_RUBRIC_VERSION,
  THESIS_RUBRIC_VERSION_V2,
  bandForScore,
  buildThesisSystemPrompt,
  validateThesisOutput,
} from "./contracts";

const known = { sourceRefs: ["S1"], claimRefs: ["C1"] };

function output(over: Record<string, unknown> = {}) {
  return {
    components: {
      memeQuality: 18,
      catalystNarrative: 17,
      distribution: 9,
      liquidity: 12,
      devIntegrity: 6,
      mindshare: 6,
      valuation: 8,
    },
    componentReasons: {
      memeQuality: { reason: "Durable, widely recognized lore.", reasonCode: "STRONG_POSITIVE_EVIDENCE" },
      catalystNarrative: { reason: "Strong narrative, no scheduled catalyst.", reasonCode: "MODERATE_POSITIVE_EVIDENCE" },
      distribution: { reason: "Top-10 elevated, no insider control established.", reasonCode: "CONSERVATIVE_UNKNOWN_EVIDENCE" },
      liquidity: { reason: "Good depth versus market cap.", reasonCode: "MODERATE_POSITIVE_EVIDENCE" },
      devIntegrity: { reason: "Anonymous dev, no adverse evidence.", reasonCode: "CONSERVATIVE_UNKNOWN_EVIDENCE" },
      mindshare: { reason: "Organicity unproven.", reasonCode: "CONSERVATIVE_UNKNOWN_EVIDENCE" },
      valuation: { reason: "Upside room relative to narrative.", reasonCode: "MODERATE_POSITIVE_EVIDENCE" },
    },
    bearCaseSeverity: "MODERATE",
    ...over,
  };
}

describe("thesis_rubric/v2.2 semantics", () => {
  it("keeps weights, total and gates unchanged", () => {
    expect(THESIS_MAX_SCORE).toBe(100);
    expect(THESIS_COMPONENTS.map((c) => [c.key, c.weight])).toEqual([
      ["memeQuality", 20],
      ["catalystNarrative", 20],
      ["distribution", 15],
      ["liquidity", 15],
      ["devIntegrity", 10],
      ["mindshare", 10],
      ["valuation", 10],
    ]);
    expect(OPPORTUNITY_POLICY.minThesisScore).toBe(70);
    expect(OPPORTUNITY_POLICY.minEvidenceConfidence).toBe(60);
    expect(OPPORTUNITY_POLICY.minIndependentSources).toBe(2);
    expect(OPPORTUNITY_POLICY.maxBearSeverity).toBe("MODERATE");
  });

  it("versions prospectively and keeps v2 frozen", () => {
    expect(THESIS_RUBRIC_VERSION).toBe("thesis_rubric/v2.2");
    expect(THESIS_PROMPT_VERSION).toBe("thesis_synthesis_prompt/v2.2");
    expect(THESIS_RUBRIC_VERSION_V2).toBe("thesis_rubric/v2");
  });

  it("gives every component five reachable anchor bands up to its full weight", () => {
    for (const c of THESIS_COMPONENTS) {
      const a = THESIS_COMPONENT_ANCHORS[c.key];
      expect(a.anchors).toHaveLength(5);
      expect(a.anchors[0]!.min).toBe(0);
      expect(a.anchors[4]!.max).toBe(c.weight);
      expect(bandForScore(c.key, c.weight)).toBe("EXCEPTIONAL");
      // Unknown evidence never lands in a punitive band.
      const unknownBand = bandForScore(c.key, a.unknownEvidenceDefault[0]);
      expect(["AVERAGE", "STRONG"]).toContain(unknownBand);
    }
  });

  it("persists a structured reason for every component", () => {
    const v = validateThesisOutput(output(), known);
    expect(v.thesisScore).toBe(76);
    expect(Object.keys(v.componentReasons)).toHaveLength(7);
    expect(v.componentReasons.devIntegrity).toMatchObject({
      score: 6,
      band: "AVERAGE",
      reasonCode: "CONSERVATIVE_UNKNOWN_EVIDENCE",
    });
    expect(v.issues.some((i) => i.code === "COMPONENT_REASON_MISSING")).toBe(false);
  });

  it("flags a missing component reason without breaking scoring", () => {
    const v = validateThesisOutput(output({ componentReasons: {} }), known);
    expect(v.thesisScore).toBe(76);
    expect(v.issues.filter((i) => i.code === "COMPONENT_REASON_MISSING")).toHaveLength(7);
  });

  it("instructs the model that missing evidence, unknown dev and no catalyst are not negative", () => {
    const p = buildThesisSystemPrompt();
    expect(p).toContain("thesis_rubric/v2.2");
    expect(p).toContain("EXCEPTIONAL");
    expect(p).toContain("UNKNOWN-EVIDENCE DEFAULT");
    expect(p).toContain("absence of a scheduled catalyst is NOT a weak narrative");
    expect(p).toContain("UNKNOWN or ANONYMOUS is neutral");
    expect(p).toContain("UNKNOWN holder structure is NOT verified insider control");
    expect(p).toContain("MISSING or UNRESOLVED evidence is never negative thesis evidence");
    expect(p).toContain("HIGH or CRITICAL bear severity REQUIRES affirmative NEGATIVE evidence");
    expect(p).toContain("componentReasons");
  });
});
