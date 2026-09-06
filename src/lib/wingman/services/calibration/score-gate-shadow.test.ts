/**
 * Phase 2C.1 — Thesis Score Gate Test v1 (65 vs 70) firewall + semantics.
 *
 * CALIBRATION ONLY. These tests assert the challenger can change exactly one
 * number, can never produce a production artifact, and can never see outcomes.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OPPORTUNITY_POLICY } from "../research/thesis/contracts";
import {
  CHALLENGER_THESIS_SCORE_MIN,
  buildFrozenDecisionInput,
  buildGateFunnel,
  changedGateForRule,
  classifyExperimentCompatibility,
  classifyScoreTreatment,
  evaluateChallenger,
  evaluateControl,
  isWithinShadowWindow,
  type ExperimentFrozenInput,
  type ExperimentResultRow,
  type ExperimentSpec,
} from "./experiments";

const base = (over: Partial<ExperimentFrozenInput> = {}): ExperimentFrozenInput =>
  buildFrozenDecisionInput({
    mint: "So11111111111111111111111111111111111111112",
    thesisReportId: "r1",
    cohortId: "c1",
    sourceScanId: "s1",
    decisionAt: "2026-09-07T00:00:00.000Z",
    thesisScore: 67,
    evidenceConfidence: 72,
    verdict: "PROMISING",
    bearSeverity: "LOW",
    distinctIndependentEvidenceOrigins: 3,
    independentSourceCount: 5,
    primarySourceCount: 2,
    verifiedPrimarySourceEvidence: true,
    operationallyEligible: true,
    setups: ["BASE"],
    thesisPolicyVersion: "thesis_rubric/v2.2",
    rubricVersion: "v2.2",
    ...over,
  });

describe("thesis score gate shadow (65 vs 70)", () => {
  it("changes only the score gate", () => {
    expect(changedGateForRule("THESIS_SCORE_MIN_65")).toBe("THESIS_SCORE");
    expect(CHALLENGER_THESIS_SCORE_MIN).toBe(65);
  });

  it("produces SHADOW_CALL where production says NO_CALL for a 65-69 score", () => {
    const input = base({ thesisScore: 67 });
    expect(evaluateControl(input).decision).toBe("NO_CALL");
    const challenger = evaluateChallenger("CHALLENGER_A", "THESIS_SCORE_MIN_65", input);
    expect(challenger.decision).toBe("SHADOW_CALL");
    expect(challenger.decision).not.toBe("THESIS_CALL");
  });

  it("does not shadow-call a 65-69 score masked by another gate", () => {
    for (const over of [
      { evidenceConfidence: 40 },
      { verdict: "WEAK" },
      { bearSeverity: "HIGH" },
      { distinctIndependentEvidenceOrigins: 1 },
      { operationallyEligible: false },
    ]) {
      const result = evaluateChallenger("CHALLENGER_A", "THESIS_SCORE_MIN_65", base(over));
      expect(result.decision).not.toBe("SHADOW_CALL");
      expect(result.failedGates).not.toContain("THESIS_SCORE");
    }
  });

  it("classifies treatment exposure only inside the 65-69 band", () => {
    expect(classifyScoreTreatment(base({ thesisScore: 64 }))).toBe("NO_SCORE_RULE_DIFFERENCE");
    expect(classifyScoreTreatment(base({ thesisScore: 65 }))).toBe("SCORE_TREATMENT_CANDIDATE");
    expect(classifyScoreTreatment(base({ thesisScore: 69 }))).toBe("SCORE_TREATMENT_CANDIDATE");
    expect(classifyScoreTreatment(base({ thesisScore: 70 }))).toBe("NO_SCORE_RULE_DIFFERENCE");
    expect(classifyScoreTreatment(base({ thesisScore: null }))).toBe("NO_SCORE_RULE_DIFFERENCE");
  });

  it("excludes artifacts missing any frozen gate input", () => {
    expect(
      classifyExperimentCompatibility(base({ thesisScore: null }), ["THESIS_SCORE_MIN_65"]).reason,
    ).toBe("MISSING_FROZEN_THESIS_SCORE");
    expect(
      classifyExperimentCompatibility(base({ distinctIndependentEvidenceOrigins: null }), [
        "THESIS_SCORE_MIN_65",
      ]).status,
    ).toBe("NOT_EVALUABLE_FOR_EXPERIMENT_VERSION");
    expect(
      classifyExperimentCompatibility(base(), ["THESIS_SCORE_MIN_65"]).status,
    ).toBe("COMPATIBLE");
  });

  it("never modifies the production score threshold", () => {
    evaluateChallenger("CHALLENGER_A", "THESIS_SCORE_MIN_65", base());
    expect(OPPORTUNITY_POLICY.minThesisScore).toBe(70);
    expect(OPPORTUNITY_POLICY.minEvidenceConfidence).toBe(60);
    expect(OPPORTUNITY_POLICY.minIndependentSources).toBe(2);
  });

  it("drops outcome fields from the challenger decision input", () => {
    const input = buildFrozenDecisionInput({
      ...base(),
      return24h: 412,
      peakReturn: 900,
      maxDrawdown: -50,
      liquiditySurvival: true,
    } as unknown as Record<string, unknown>);
    expect(Object.keys(input)).not.toContain("return24h");
    expect(Object.keys(input)).not.toContain("peakReturn");
    expect(Object.keys(input)).not.toContain("maxDrawdown");
    expect(Object.keys(input)).not.toContain("liquiditySurvival");
  });

  it("never backfills pre-activation events", () => {
    const spec = {
      experimentType: "PROSPECTIVE_SHADOW",
      shadowStartAt: "2026-09-07T00:00:00.000Z",
    } as ExperimentSpec;
    expect(isWithinShadowWindow(spec, "2026-09-06T23:59:59.000Z")).toBe(false);
    expect(isWithinShadowWindow(spec, "2026-09-07T00:00:01.000Z")).toBe(true);
    expect(isWithinShadowWindow(spec, null)).toBe(false);
  });

  it("attributes masking to the score gate funnel correctly", () => {
    const row = (
      variantKey: "CONTROL" | "CHALLENGER_A",
      eventKey: string,
      failedGates: string[],
      decision: string,
    ): ExperimentResultRow =>
      ({
        id: `${variantKey}:${eventKey}`,
        experimentId: "e",
        variantKey,
        sourceStage: "THESIS_SYNTHESIZED",
        eventKey,
        mint: eventKey,
        cohortId: null,
        decisionAt: "2026-09-07T01:00:00.000Z",
        productionDecision: "NO_CALL",
        challengerDecision: decision,
        differs: decision === "SHADOW_CALL",
        differingRule: variantKey === "CONTROL" ? null : "THESIS_SCORE_MIN_65",
        failedGates,
        frozenInput: base(),
        inputContractVersion: "experiment_input/v1_allowlist_no_outcomes",
        decidedAt: null,
      }) as unknown as ExperimentResultRow;

    const funnel = buildGateFunnel(
      [row("CONTROL", "a", ["THESIS_SCORE"], "NO_CALL"), row("CONTROL", "b", ["THESIS_SCORE", "BEAR_SEVERITY"], "NO_CALL")],
      [row("CHALLENGER_A", "a", [], "SHADOW_CALL"), row("CHALLENGER_A", "b", ["BEAR_SEVERITY"], "NO_SHADOW_CALL")],
      "THESIS_SCORE_MIN_65",
      "CHALLENGER_A",
    );
    expect(funnel.changedRuleCandidates).toBe(2);
    expect(funnel.treatmentExposure).toBe(1);
    expect(funnel.maskedByOtherGates).toBe(1);
    expect(funnel.primaryMask).toBe("BEAR_SEVERITY");
  });
});

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

describe("shadow call production firewall", () => {
  it("keeps SHADOW_CALL out of production decision and lifecycle modules", () => {
    const offenders: string[] = [];
    for (const dir of ["entry", "live", "sizing", "research", "scanner"]) {
      let files: string[] = [];
      try {
        files = walk(join("src/lib/wingman/services", dir));
      } catch {
        continue;
      }
      for (const file of files) {
        if (readFileSync(file, "utf8").includes("SHADOW_CALL")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps calibration experiment modules free of production call emission", () => {
    for (const file of ["experiments.ts", "experiments.server.ts"]) {
      const source = readFileSync(join("src/lib/wingman/services/calibration", file), "utf8");
      expect(source).not.toContain("thesis_call_monitoring");
      expect(source).not.toContain("live_call_events");
      expect(source).not.toContain("entry_state_evaluations");
      expect(source).not.toContain("sizing_recommendations");
    }
  });
});
