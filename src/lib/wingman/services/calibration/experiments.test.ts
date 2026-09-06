/**
 * Calibration Experiment Tracks v1 — regression coverage.
 *
 * These tests exist to keep calibration structurally unable to affect
 * production: frozen inputs only, no outcomes at decision time, no THESIS_CALL
 * vocabulary and no automatic promotion path.
 */
import { describe, expect, it } from "vitest";
import {
  EXPERIMENT_INPUT_ALLOWLIST,
  EXPERIMENT_TYPE_LABEL,
  buildDecisionDiffs,
  buildFrozenDecisionInput,
  buildGateFunnel,
  classifyExperimentCompatibility,
  computeSelectionOverlap,
  evaluateChallenger,
  evaluateControl,
  evaluateVariantOutcomes,
  groupResultsByMint,
  interpretExperiment,
  isWithinShadowWindow,
  type ExperimentFrozenInput,
  type ExperimentResultRow,
  type ExperimentSpec,
} from "./experiments";
import { OPPORTUNITY_POLICY, qualifiesAsOpportunity } from "../research/thesis/contracts";
import type { ObservatoryEvent } from "./observatory";

const baseInput = (over: Partial<ExperimentFrozenInput> = {}): ExperimentFrozenInput =>
  buildFrozenDecisionInput({
    mint: "MintAAA",
    thesisReportId: "report-1",
    cohortId: "triage-1",
    sourceScanId: "scan-1",
    decisionAt: "2026-01-01T00:00:00.000Z",
    thesisScore: 75,
    evidenceConfidence: 71,
    verdict: "STRONG_THESIS",
    bearSeverity: "LOW",
    distinctIndependentEvidenceOrigins: 2,
    independentSourceCount: 4,
    primarySourceCount: 3,
    verifiedPrimarySourceEvidence: true,
    operationallyEligible: true,
    setups: ["BASE"],
    thesisPolicyVersion: "thesis_policy/v2",
    rubricVersion: "thesis_rubric/v2.2",
    ...over,
  });

const resultRow = (over: Partial<ExperimentResultRow>): ExperimentResultRow => ({
  id: "row",
  experimentId: "exp",
  variantKey: "CONTROL",
  sourceStage: "THESIS_SYNTHESIZED",
  eventKey: "THESIS_SYNTHESIZED:report-1",
  mint: "MintAAA",
  cohortId: "triage-1",
  decisionAt: "2026-01-01T00:00:00.000Z",
  productionDecision: "NO_CALL",
  challengerDecision: "NO_SHADOW_CALL",
  differs: false,
  differingRule: null,
  failedGates: [],
  frozenInput: baseInput(),
  inputContractVersion: "experiment_input/v1_allowlist_no_outcomes",
  decidedAt: null,
  ...over,
});

describe("frozen-input firewall", () => {
  it("1. challenger receives frozen decision inputs only", () => {
    const input = baseInput();
    expect(Object.keys(input).sort()).toEqual([...EXPERIMENT_INPUT_ALLOWLIST].sort());
  });

  it("2. outcomes cannot enter challenger input", () => {
    const polluted = buildFrozenDecisionInput({
      ...baseInput(),
      returnPct: 412,
      peakPct: 900,
      maxDrawdownPct: -50,
      liquiditySurvived: true,
      horizons: { "24h": { returnPct: 412 } },
      outcome: "WIN",
    } as unknown as Record<string, unknown>);
    for (const key of ["returnPct", "peakPct", "maxDrawdownPct", "liquiditySurvived", "horizons", "outcome"]) {
      expect(key in polluted).toBe(false);
    }
  });
});

describe("variant decisions", () => {
  it("3. a shadow call never emits production THESIS_CALL vocabulary", () => {
    const result = evaluateChallenger(
      "CHALLENGER_A",
      "INDEPENDENT_ORIGIN_GATE_REMOVED",
      baseInput({ distinctIndependentEvidenceOrigins: 0 }),
    );
    expect(result.decision).toBe("SHADOW_CALL");
    expect(JSON.stringify(result)).not.toContain("THESIS_CALL");
  });

  it("8. control reproduces the exact production policy decision", () => {
    const cases: Partial<ExperimentFrozenInput>[] = [
      {},
      { thesisScore: 55 },
      { evidenceConfidence: 40 },
      { bearSeverity: "CRITICAL" },
      { verdict: "WATCH" },
      { distinctIndependentEvidenceOrigins: 1 },
    ];
    for (const over of cases) {
      const input = baseInput(over);
      const control = evaluateControl(input);
      const production = qualifiesAsOpportunity(
        {
          mint: input.mint,
          thesisScore: input.thesisScore ?? 0,
          evidenceConfidence: input.evidenceConfidence ?? 0,
          verdict: input.verdict as never,
          bearSeverity: input.bearSeverity as never,
          independentSourceCount: input.independentSourceCount ?? 0,
          distinctIndependentEvidenceOrigins: input.distinctIndependentEvidenceOrigins,
          eligibleNow: input.operationallyEligible,
        },
        OPPORTUNITY_POLICY,
      );
      expect(control.decision === "CALL").toBe(production);
    }
  });

  it("9. a challenger changes only its declared rule", () => {
    const input = baseInput({ thesisScore: 50, distinctIndependentEvidenceOrigins: 0 });
    const control = evaluateControl(input);
    const challenger = evaluateChallenger(
      "CHALLENGER_A",
      "INDEPENDENT_ORIGIN_GATE_REMOVED",
      input,
    );
    expect(control.failedGates).toContain("THESIS_SCORE");
    expect(challenger.failedGates).toContain("THESIS_SCORE");
    expect(challenger.failedGates).not.toContain("INDEPENDENT_ORIGINS");
    expect(challenger.decision).toBe("NO_SHADOW_CALL");
  });

  it("hybrid independence passes only with verified primary evidence and EC >= 60", () => {
    const one = { distinctIndependentEvidenceOrigins: 1 } as const;
    const pass = evaluateChallenger(
      "CHALLENGER_B",
      "INDEPENDENT_ORIGIN_GATE_HYBRID",
      baseInput({ ...one, verifiedPrimarySourceEvidence: true, evidenceConfidence: 61 }),
    );
    const failEc = evaluateChallenger(
      "CHALLENGER_B",
      "INDEPENDENT_ORIGIN_GATE_HYBRID",
      baseInput({ ...one, verifiedPrimarySourceEvidence: true, evidenceConfidence: 59 }),
    );
    const failPrimary = evaluateChallenger(
      "CHALLENGER_B",
      "INDEPENDENT_ORIGIN_GATE_HYBRID",
      baseInput({ ...one, verifiedPrimarySourceEvidence: false, evidenceConfidence: 80 }),
    );
    const missing = evaluateChallenger(
      "CHALLENGER_B",
      "INDEPENDENT_ORIGIN_GATE_HYBRID",
      baseInput({ distinctIndependentEvidenceOrigins: null }),
    );
    expect(pass.decision).toBe("SHADOW_CALL");
    expect(failEc.decision).toBe("NO_SHADOW_CALL");
    expect(failPrimary.decision).toBe("NO_SHADOW_CALL");
    expect(missing.decision).toBe("NOT_EVALUABLE");
  });
});

describe("population semantics", () => {
  it("4. repeated events of one exact mint stay grouped", () => {
    const groups = groupResultsByMint([
      resultRow({ eventKey: "e1", mint: "Shrek" }),
      resultRow({ eventKey: "e3", mint: "Shrek" }),
      resultRow({ eventKey: "e2", mint: "Other" }),
    ]);
    const shrek = groups.find((g) => g.mint === "Shrek");
    expect(shrek?.eventKeys).toEqual(["e1", "e3"]);
    expect(groups).toHaveLength(2);
  });

  it("6. a retrospective experiment is labelled retrospective", () => {
    expect(EXPERIMENT_TYPE_LABEL.RETROSPECTIVE_BACKTEST).toContain("RETROSPECTIVE");
    expect(EXPERIMENT_TYPE_LABEL.RETROSPECTIVE_BACKTEST).toContain("HYPOTHESIS GENERATING");
  });

  it("7. a prospective shadow track cannot backfill pre-activation events", () => {
    const spec = {
      experimentType: "PROSPECTIVE_SHADOW",
      shadowStartAt: "2026-02-01T00:00:00.000Z",
    } as ExperimentSpec;
    expect(isWithinShadowWindow(spec, "2026-01-31T23:59:00.000Z")).toBe(false);
    expect(isWithinShadowWindow(spec, "2026-02-01T00:00:01.000Z")).toBe(true);
    expect(
      isWithinShadowWindow({ experimentType: "RETROSPECTIVE_BACKTEST" } as ExperimentSpec, "2020-01-01T00:00:00.000Z"),
    ).toBe(true);
  });
});

describe("evaluation view", () => {
  const event = (key: string, returnPct: number): ObservatoryEvent =>
    ({
      stage: "THESIS_SYNTHESIZED",
      eventId: key,
      mint: "MintAAA",
      symbol: "AAA",
      name: null,
      eventAt: "2026-01-01T00:00:00.000Z",
      cohortId: "triage-1",
      policyVersion: null,
      setups: ["BASE"],
      canonical: true,
      recurrenceNumber: 1,
      msSincePriorCanonicalEvent: null,
      baseline: null,
      horizons: {
        "24h": {
          status: "MEASURED",
          returnPct,
          peakPct: returnPct,
          maxDrawdownPct: -10,
          timeToPeakMinutes: 30,
          liquiditySurvived: true,
          observationCount: 4,
        },
      },
      thesis: null,
      triage: null,
      spend: null,
    }) as ObservatoryEvent;

  it("computes selection overlap between control and challenger", () => {
    const control = [
      resultRow({ eventKey: "a", challengerDecision: "CALL" }),
      resultRow({ eventKey: "b", challengerDecision: "NO_CALL" }),
      resultRow({ eventKey: "c", challengerDecision: "NO_CALL" }),
    ];
    const challenger = [
      resultRow({ eventKey: "a", variantKey: "CHALLENGER_A", challengerDecision: "SHADOW_CALL" }),
      resultRow({ eventKey: "b", variantKey: "CHALLENGER_A", challengerDecision: "SHADOW_CALL" }),
      resultRow({ eventKey: "c", variantKey: "CHALLENGER_A", challengerDecision: "NO_SHADOW_CALL" }),
    ];
    const overlap = computeSelectionOverlap(control, challenger);
    expect(overlap).toMatchObject({ both: 1, controlOnly: 0, challengerOnly: 1, neither: 1 });
    expect(overlap.differingEventKeys).toEqual(["b"]);
  });

  it("10. joining outcomes happens after decisions and needs no provider", () => {
    const rows = [resultRow({ eventKey: "a", challengerDecision: "SHADOW_CALL", variantKey: "CHALLENGER_A" })];
    const byKey = new Map([["a", event("a", 40)]]);
    const evaluation = evaluateVariantOutcomes(
      "CHALLENGER_A",
      "No hard origins gate",
      "INDEPENDENT_ORIGIN_GATE_REMOVED",
      rows,
      byKey,
      "24h",
    );
    expect(evaluation.callN).toBe(1);
    expect(evaluation.kpis.measuredN).toBe(1);
    expect(evaluation.kpis.medianReturnPct).toBe(40);
  });

  it("keeps verified input separate from evaluation outcome in the diff view", () => {
    const diffs = buildDecisionDiffs(
      [
        resultRow({
          eventKey: "a",
          variantKey: "CHALLENGER_A",
          challengerDecision: "SHADOW_CALL",
          productionDecision: "NO_CALL",
          differs: true,
          differingRule: "INDEPENDENT_ORIGIN_GATE_REMOVED",
        }),
      ],
      new Map([["a", event("a", 12)]]),
      "24h",
    );
    expect(diffs).toHaveLength(1);
    const diff = diffs[0]!;
    expect(Object.keys(diff.frozenInput)).not.toContain("returnPct");
    expect(diff.outcome?.returnPct).toBe(12);
  });
});

describe("promotion discipline", () => {
  it("12. no rule in this module can promote a challenger to production", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/wingman/services/calibration/experiments.ts", "utf8"),
    );
    expect(source).not.toContain("THESIS_CALL\"");
    expect(source.toLowerCase()).not.toContain("promotetoproduction");
  });

  it("11. calibration decisions never carry production milestone vocabulary", () => {
    const row = resultRow({ challengerDecision: "SHADOW_CALL", variantKey: "CHALLENGER_A" });
    expect(row.challengerDecision).toBe("SHADOW_CALL");
    expect(row.sourceStage).toBe("THESIS_SYNTHESIZED");
  });
});

describe("phase 2b.1 — informativeness, masking and compatibility", () => {
  const rowsFor = (over: Partial<ExperimentResultRow>[]): ExperimentResultRow[] =>
    over.map((o) => resultRow(o));

  it("classifies frozen artifacts without distinct-origin semantics as not evaluable", () => {
    const legacy = classifyExperimentCompatibility(
      baseInput({ distinctIndependentEvidenceOrigins: null }),
      ["INDEPENDENT_ORIGIN_GATE_REMOVED"],
    );
    const modern = classifyExperimentCompatibility(baseInput(), [
      "INDEPENDENT_ORIGIN_GATE_HYBRID",
    ]);
    expect(legacy.status).toBe("NOT_EVALUABLE_FOR_EXPERIMENT_VERSION");
    expect(legacy.reason).toBe("MISSING_FROZEN_DISTINCT_INDEPENDENT_EVIDENCE_ORIGINS");
    expect(modern.status).toBe("COMPATIBLE");
  });

  it("reports treatment exposure of zero when another gate masks the changed rule", () => {
    const control = rowsFor([
      { eventKey: "a", failedGates: ["THESIS_SCORE", "INDEPENDENT_ORIGINS"] },
      { eventKey: "b", failedGates: ["THESIS_SCORE", "INDEPENDENT_ORIGINS"] },
    ]);
    const challenger = rowsFor([
      { eventKey: "a", variantKey: "CHALLENGER_A", failedGates: ["THESIS_SCORE"] },
      { eventKey: "b", variantKey: "CHALLENGER_A", failedGates: ["THESIS_SCORE"] },
    ]);
    const funnel = buildGateFunnel(
      control,
      challenger,
      "INDEPENDENT_ORIGIN_GATE_REMOVED",
      "CHALLENGER_A",
    );
    expect(funnel.changedRuleCandidates).toBe(2);
    expect(funnel.treatmentExposure).toBe(0);
    expect(funnel.maskedByOtherGates).toBe(2);
    expect(funnel.primaryMask).toBe("THESIS_SCORE");
    expect(funnel.decisionDifferences).toBe(0);

    const interpretation = interpretExperiment({
      funnel,
      compatibleEvents: 12,
      measuredOutcomes: 0,
    });
    expect(interpretation.state).toBe("MASKED_BY_OTHER_GATES");
    expect(interpretation.primaryMask).toBe("THESIS_SCORE");
  });

  it("reports no treatment exposure when the rule never changes its own verdict", () => {
    const control = rowsFor([{ eventKey: "a", failedGates: ["THESIS_SCORE"] }]);
    const challenger = rowsFor([
      { eventKey: "a", variantKey: "CHALLENGER_A", failedGates: ["THESIS_SCORE"] },
    ]);
    const funnel = buildGateFunnel(
      control,
      challenger,
      "INDEPENDENT_ORIGIN_GATE_REMOVED",
      "CHALLENGER_A",
    );
    expect(
      interpretExperiment({ funnel, compatibleEvents: 20, measuredOutcomes: 0 }).state,
    ).toBe("NO_TREATMENT_EXPOSURE");
  });

  it("flags an insufficient compatible population before any other reading", () => {
    const funnel = buildGateFunnel([], [], "INDEPENDENT_ORIGIN_GATE_REMOVED", "CHALLENGER_A");
    expect(
      interpretExperiment({ funnel, compatibleEvents: 2, measuredOutcomes: 0 }).state,
    ).toBe("INSUFFICIENT_COMPATIBLE_DATA");
  });

  it("flags exposed decision differences with no persisted outcome coverage", () => {
    const control = rowsFor([{ eventKey: "a", failedGates: ["INDEPENDENT_ORIGINS"] }]);
    const challenger = rowsFor([
      {
        eventKey: "a",
        variantKey: "CHALLENGER_A",
        failedGates: [],
        challengerDecision: "SHADOW_CALL",
        differs: true,
      },
    ]);
    const funnel = buildGateFunnel(
      control,
      challenger,
      "INDEPENDENT_ORIGIN_GATE_REMOVED",
      "CHALLENGER_A",
    );
    expect(funnel.treatmentExposure).toBe(1);
    expect(
      interpretExperiment({ funnel, compatibleEvents: 20, measuredOutcomes: 0 }).state,
    ).toBe("INSUFFICIENT_OUTCOME_COVERAGE");
    expect(
      interpretExperiment({ funnel, compatibleEvents: 20, measuredOutcomes: 1 }).state,
    ).toBe("INFORMATIVE");
  });

  it("a prospective shadow still cannot evaluate pre-activation events", () => {
    const spec = {
      experimentType: "PROSPECTIVE_SHADOW",
      shadowStartAt: "2026-03-01T00:00:00.000Z",
    } as ExperimentSpec;
    expect(isWithinShadowWindow(spec, "2026-02-28T23:59:59.000Z")).toBe(false);
    expect(isWithinShadowWindow(spec, "2026-03-01T00:00:01.000Z")).toBe(true);
  });
});
