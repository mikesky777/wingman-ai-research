/**
 * `outcome_enrollment/v1` regression suite.
 *
 * Enrollment is evaluation-only: it must be deterministic, exhaustive where it
 * claims to be, honest about sampling, and incapable of promoting anything.
 */
import { describe, expect, it } from "vitest";
import {
  CAPACITY_MAX_LOAD_MULTIPLE,
  ENROLLMENT_HORIZONS,
  MAX_REJECTS_PER_SCAN,
  MAX_REJECTS_PER_STRATUM,
  OUTCOME_ENROLLMENT_VERSION,
  REJECT_SAMPLING_ENABLED,
  SCANNER_REJECT_SAMPLING_VERSION,
  SAMPLING_POLICY_VERSION,
  baselineValidity,
  buildEnrollment,
  classifyEntryEvaluation,
  legacyEnrollmentType,
  projectCapacity,
  sampleRejects,
  selectionMaterial,
  stableHash,
  type RejectCandidateEvent,
} from "./enrollment";

function reject(mint: string, stratum: RejectCandidateEvent["stratum"]): RejectCandidateEvent {
  return {
    contractAddress: mint,
    tokenId: null,
    stratum,
    stageReached: stratum === "hard_filters" ? "hard_filters" : "quantitative",
    rejectionReason: "LIQUIDITY_TOO_LOW",
    rejectionDetails: null,
    laneRejections: null,
    baseline: { at: "2026-09-08T00:00:00Z", marketCapUsd: 100_000, priceUsd: 0.001, liquidityUsd: 20_000 },
  };
}

const many = (n: number, prefix: string, stratum: RejectCandidateEvent["stratum"]) =>
  Array.from({ length: n }, (_, i) => reject(`${prefix}${i}`, stratum));

describe("outcome enrollment contract", () => {
  it("1. pins the schema version", () => {
    expect(OUTCOME_ENROLLMENT_VERSION).toBe("outcome_enrollment/v1");
  });

  it("2. requests the full horizon set", () => {
    expect([...ENROLLMENT_HORIZONS]).toEqual(["1h", "4h", "12h", "24h", "3d", "7d"]);
  });

  it("3. ships reject sampling enabled with the conservative 3A.2A budget", () => {
    expect(REJECT_SAMPLING_ENABLED).toBe(true);
    expect(SCANNER_REJECT_SAMPLING_VERSION).toBe("scanner_reject_outcome_sampling/v1");
    expect(MAX_REJECTS_PER_STRATUM).toBe(4);
    expect(MAX_REJECTS_PER_SCAN).toBe(12);
  });

  it("3a. samples every eligible candidate when a stratum is under budget", () => {
    const samples = sampleRejects("scan-1", many(2, "h", "hard_filters"));
    expect(samples[0]?.selectedK).toBe(2);
    expect(samples[0]?.inclusionProbability).toBe(1);
  });

  it("4. treats a missing baseline as NOT_EVALUABLE, never zero", () => {
    expect(baselineValidity(null)).toBe("NOT_EVALUABLE");
  });

  it("5. treats an all-null baseline as NOT_EVALUABLE", () => {
    expect(
      baselineValidity({ at: "x", marketCapUsd: null, priceUsd: null, liquidityUsd: null }),
    ).toBe("NOT_EVALUABLE");
  });

  it("6. treats a partial baseline as UNKNOWN", () => {
    expect(
      baselineValidity({ at: "x", marketCapUsd: 1000, priceUsd: null, liquidityUsd: null }),
    ).toBe("UNKNOWN");
  });

  it("7. treats a complete baseline as VALID", () => {
    expect(
      baselineValidity({ at: "x", marketCapUsd: 1000, priceUsd: 0.5, liquidityUsd: 10 }),
    ).toBe("VALID");
  });

  it("8. hashes deterministically across calls", () => {
    expect(stableHash("scan|mint")).toBe(stableHash("scan|mint"));
  });

  it("9. binds selection material to policy, scan and exact mint", () => {
    expect(selectionMaterial("scan1", "MintA")).toBe(`${SAMPLING_POLICY_VERSION}|scan1|MintA`);
    expect(selectionMaterial("scan1", "MintA")).not.toBe(selectionMaterial("scan2", "MintA"));
  });

  it("10. produces an identical sample when re-run for the same scan", () => {
    const events = many(30, "m", "hard_filters");
    const a = sampleRejects("scan-1", events).map((s) => s.selected.map((e) => e.contractAddress));
    const b = sampleRejects("scan-1", [...events].reverse()).map((s) =>
      s.selected.map((e) => e.contractAddress),
    );
    expect(a).toEqual(b);
  });

  it("11. produces a different sample for a different scan", () => {
    const events = many(40, "m", "hard_filters");
    const a = sampleRejects("scan-1", events)[0]?.selected.map((e) => e.contractAddress);
    const b = sampleRejects("scan-2", events)[0]?.selected.map((e) => e.contractAddress);
    expect(a).not.toEqual(b);
  });

  it("12. caps each stratum at the per-stratum budget", () => {
    const samples = sampleRejects("scan-1", many(50, "h", "hard_filters"));
    expect(samples[0]?.selectedK).toBe(MAX_REJECTS_PER_STRATUM);
  });

  it("13. caps the whole scan at the per-scan budget", () => {
    const events = [
      ...many(50, "h", "hard_filters"),
      ...many(50, "q", "quantitative"),
      ...many(50, "e", "enriched_not_selected"),
    ];
    const total = sampleRejects("scan-1", events).reduce((sum, s) => sum + s.selectedK, 0);
    expect(total).toBeLessThanOrEqual(MAX_REJECTS_PER_SCAN);
  });

  it("14. reports every stratum, including empty ones", () => {
    const samples = sampleRejects("scan-1", many(3, "h", "hard_filters"));
    expect(samples.map((s) => s.stratum)).toEqual([
      "hard_filters",
      "quantitative",
      "enriched_not_selected",
    ]);
    expect(samples[1]?.eligibleN).toBe(0);
  });

  it("15. records the ACTUAL inclusion probability, not the budget", () => {
    const samples = sampleRejects("scan-1", many(16, "h", "hard_filters"));
    expect(samples[0]?.inclusionProbability).toBeCloseTo(8 / 16, 6);
  });

  it("16. records eligible population size for later weighting", () => {
    const samples = sampleRejects("scan-1", many(21, "h", "hard_filters"));
    expect(samples[0]?.eligibleN).toBe(21);
  });

  it("17. deduplicates repeated mints inside one scan", () => {
    const dup = [reject("same", "hard_filters"), reject("same", "hard_filters")];
    const samples = sampleRejects("scan-1", dup);
    expect(samples[0]?.eligibleN).toBe(1);
    expect(samples[0]?.selectedK).toBe(1);
  });

  it("18. accepts capacity within the load ceiling", () => {
    const projection = projectCapacity(800, 100);
    expect(projection.safe).toBe(true);
    expect(projection.reason).toBe("WITHIN_CAPACITY");
  });

  it("19. blocks capacity beyond the load ceiling", () => {
    const projection = projectCapacity(800, 1200);
    expect(projection.safe).toBe(false);
    expect(projection.loadMultiple).toBeGreaterThan(CAPACITY_MAX_LOAD_MULTIPLE);
  });

  it("20. marks exhaustive enrollments with inclusion probability 1", () => {
    const record = buildEnrollment({
      contractAddress: "Mint1",
      stage: "SCANNER_SURVIVOR",
      sourceEventType: "SCAN_CANDIDATE",
      decisionAt: "2026-09-08T00:00:00Z",
      baseline: { at: "2026-09-08T00:00:00Z", marketCapUsd: 1, priceUsd: 1, liquidityUsd: 1 },
      enrollmentType: "EXHAUSTIVE",
    });
    expect(record.inclusionProbability).toBe(1);
    expect(record.sampledForOutcomes).toBe(false);
    expect(record.selectionReason).toBe("EXHAUSTIVE_POPULATION");
  });

  it("21. marks sampled enrollments as sampled with policy provenance", () => {
    const record = buildEnrollment({
      contractAddress: "Mint1",
      stage: "SCANNER_REJECT",
      sourceEventType: "SCAN_CANDIDATE_REJECT",
      decisionAt: "2026-09-08T00:00:00Z",
      baseline: null,
      enrollmentType: "SAMPLED",
      samplingStratum: "hard_filters",
      inclusionProbability: 0.5,
    });
    expect(record.sampledForOutcomes).toBe(true);
    expect(record.samplingPolicyVersion).toBe(SAMPLING_POLICY_VERSION);
    expect(record.baselineValidity).toBe("NOT_EVALUABLE");
  });

  it("22. keeps triage classes separated by decision, not by baseline time", () => {
    const at = "2026-09-08T00:00:00Z";
    const base = {
      sourceEventType: "AI_TRIAGE_DECISION",
      stage: "AI_TRIAGE" as const,
      decisionAt: at,
      baseline: { at, marketCapUsd: 10, priceUsd: 1, liquidityUsd: 5 },
      enrollmentType: "EXHAUSTIVE" as const,
    };
    const skip = buildEnrollment({ ...base, contractAddress: "A", decisionClass: "SKIP" });
    const deep = buildEnrollment({ ...base, contractAddress: "A", decisionClass: "DEEP_RESEARCH" });
    expect(skip.decisionAt).toBe(deep.decisionAt);
    expect(skip.decisionClass).not.toBe(deep.decisionClass);
    expect(skip.stage).toBe(deep.stage);
  });

  it("23. never fabricates sampling provenance for legacy tracking rows", () => {
    expect(legacyEnrollmentType(false)).toBe("LEGACY_TRACKING_PROVENANCE_UNAVAILABLE");
    expect(legacyEnrollmentType(true)).toBe("EXHAUSTIVE");
  });

  it("24. separates canonical Entry evaluations from pre-gate diagnostics", () => {
    expect(classifyEntryEvaluation({ thesisCallEventId: "evt" })).toBe(
      "CANONICAL_ENTRY_WITH_THESIS_CALL",
    );
    expect(classifyEntryEvaluation({ thesisCallEventId: null })).toBe(
      "LEGACY_DIAGNOSTIC_PRE_THESIS_CALL_GATE",
    );
  });

  it("25. never carries an evaluation stage name that collides with a production milestone", () => {
    const record = buildEnrollment({
      contractAddress: "Mint1",
      stage: "SCANNER_SETUP_QUALIFIED",
      sourceEventType: "SCAN_CANDIDATE",
      decisionAt: "2026-09-08T00:00:00Z",
      baseline: null,
      enrollmentType: "EXHAUSTIVE",
    });
    expect(["SETUP_QUALIFIED", "SURVIVOR", "AI_SHORTLIST", "THESIS_CALL"]).not.toContain(
      record.stage,
    );
  });
});
