import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_GATE_VERSION,
  OPPORTUNITY_POLICY,
  evaluateIndependentOriginGate,
  qualifiesAsOpportunity,
  selectOpportunities,
} from "./contracts";

const strong = {
  mint: "A",
  thesisScore: 82,
  evidenceConfidence: 74,
  verdict: "STRONG_THESIS" as const,
  bearSeverity: "LOW" as const,
  independentSourceCount: 5,
  distinctIndependentEvidenceOrigins: 2,
  eligibleNow: true,
};

describe("opportunity_gate/v1.1 — distinct independent evidence origins", () => {
  it("keeps the threshold at 2 and versions the gate", () => {
    expect(OPPORTUNITY_POLICY.minIndependentSources).toBe(2);
    expect(OPPORTUNITY_GATE_VERSION).toBe("opportunity_gate/v1.1");
  });

  it("1. five independent-labelled mirrors with one genuine origin → FAIL", () => {
    const c = { ...strong, independentSourceCount: 5, distinctIndependentEvidenceOrigins: 1 };
    expect(evaluateIndependentOriginGate(c).status).toBe("FAIL");
    expect(qualifiesAsOpportunity(c)).toBe(false);
  });

  it("2. two genuinely distinct independent origins → PASS", () => {
    const c = { ...strong, independentSourceCount: 2, distinctIndependentEvidenceOrigins: 2 };
    expect(evaluateIndependentOriginGate(c).status).toBe("PASS");
    expect(qualifiesAsOpportunity(c)).toBe(true);
  });

  it("3. project + community + one independent origin → FAIL", () => {
    const c = { ...strong, independentSourceCount: 3, distinctIndependentEvidenceOrigins: 1 };
    expect(evaluateIndependentOriginGate(c).reason).toBe(
      "INSUFFICIENT_DISTINCT_INDEPENDENT_ORIGINS",
    );
    expect(qualifiesAsOpportunity(c)).toBe(false);
  });

  it("4. two independent origins plus several mirrors → PASS", () => {
    const c = { ...strong, independentSourceCount: 9, distinctIndependentEvidenceOrigins: 2 };
    expect(qualifiesAsOpportunity(c)).toBe(true);
    expect(selectOpportunities([c]).map((o) => o.mint)).toEqual(["A"]);
  });

  it("5. missing v1.1 field → NOT_EVALUABLE, never a Thesis Call", () => {
    const c = { ...strong, distinctIndependentEvidenceOrigins: null };
    const gate = evaluateIndependentOriginGate(c);
    expect(gate.status).toBe("NOT_EVALUABLE");
    expect(gate.reason).toBe("MISSING_REQUIRED_EVIDENCE_SEMANTICS");
    expect(gate.distinctIndependentEvidenceOrigins).toBeNull();
    expect(qualifiesAsOpportunity(c)).toBe(false);
    expect(selectOpportunities([c])).toEqual([]);
  });

  it("never falls back to the raw independent source count", () => {
    expect(
      qualifiesAsOpportunity({
        ...strong,
        independentSourceCount: 12,
        distinctIndependentEvidenceOrigins: 0,
      }),
    ).toBe(false);
  });
});
