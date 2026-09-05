import { describe, expect, it } from "vitest";
import {
  CALIBRATION_HYPOTHESIS_INDEPENDENT_SOURCE_GATE,
  THESIS_EVIDENCE_SEMANTICS_VERSION,
  buildEvidenceSemantics,
  buildGateDiagnostics,
  classifyAffiliation,
  classifyCatalyst,
  computeSourceMix,
  legacyCatalystKind,
  resolveNarrativeMaturity,
  type SemanticSource,
} from "./evidence-semantics";

const sources: SemanticSource[] = [
  { ref: "S1", independence: "PROJECT_OWNED", sourceType: "OFFICIAL_TOKEN_LINK", reliabilityClass: "PRIMARY" },
  { ref: "S2", independence: "INDEPENDENT", sourceType: "NEWS_MEDIA", reliabilityClass: "SECONDARY" },
  { ref: "S3", independence: "UNKNOWN", sourceType: "FORUM", reliabilityClass: "UNVERIFIED" },
];

function build(raw: unknown, overrides: Partial<Parameters<typeof buildEvidenceSemantics>[0]> = {}) {
  return buildEvidenceSemantics({
    raw,
    knownClaimRefs: ["C1"],
    sources,
    catalystText: null,
    legacyCatalystKind: null,
    independentSourceCount: 1,
    searchUnavailable: false,
    knownGaps: [],
    ...overrides,
  });
}

describe("thesis_evidence/v2.1 semantics", () => {
  it("classifies forum/social origin as COMMUNITY, never independent", () => {
    expect(classifyAffiliation(sources[2]!)).toBe("COMMUNITY");
    const mix = computeSourceMix(sources);
    expect(mix.independent).toBe(1);
    expect(mix.community).toBe(1);
    expect(mix.projectOwned).toBe(1);
  });

  it("reclassifies an uncited NEGATIVE item as MISSING", () => {
    const sem = build({
      evidenceItems: [
        { polarity: "NEGATIVE", statement: "No one talks about this token", basis: "MODEL_JUDGMENT" },
      ],
    });
    expect(sem.counts.negative).toBe(0);
    expect(sem.counts.missing).toBe(1);
    expect(sem.issues.some((i) => i.code === "NEGATIVE_WITHOUT_EVIDENCE_RECLASSIFIED")).toBe(true);
    expect(sem.semanticsVersion).toBe(THESIS_EVIDENCE_SEMANTICS_VERSION);
  });

  it("keeps a cited NEGATIVE item as affirmative adverse evidence", () => {
    const sem = build({
      evidenceItems: [
        {
          polarity: "NEGATIVE",
          statement: "The named creator publicly disavowed the token",
          sourceRefs: ["S2"],
          severity: "HIGH",
          contradictionTarget: "creator endorsement",
          basis: "VERIFIED_FACT",
        },
      ],
    });
    expect(sem.counts.negative).toBe(1);
    expect(sem.negative[0]?.affiliation).toBe("INDEPENDENT");
    expect(sem.negative[0]?.severity).toBe("HIGH");
  });

  it("treats a primary-source catalyst as real but not independent", () => {
    const res = classifyCatalyst({
      catalystText: "Official launch event announced by the project",
      proposed: "VERIFIED_INDEPENDENT",
      supportingAffiliations: ["PROJECT_OWNED"],
      supportingQualities: ["PRIMARY"],
    });
    expect(res.classification).toBe("VERIFIED_PRIMARY_SOURCE");
    expect(legacyCatalystKind(res.classification)).toBe("VERIFIED");
  });

  it("never invents a catalyst when none was found", () => {
    const res = classifyCatalyst({
      catalystText: null,
      proposed: "PLAUSIBLE",
      supportingAffiliations: [],
      supportingQualities: [],
    });
    expect(res.classification).toBe("NONE_FOUND");
    expect(legacyCatalystKind("NONE_FOUND")).toBe("NONE");
  });

  it("refuses UNDER_THE_RADAR without affirmative support", () => {
    const res = resolveNarrativeMaturity({
      proposed: "UNDER_THE_RADAR",
      supportCodes: [],
      positiveEvidenceCount: 0,
      negativeEvidenceCount: 0,
      independentSourceCount: 0,
      searchUnavailable: false,
    });
    expect(res.maturity).toBe("UNKNOWN");
  });

  it("allows UNDER_THE_RADAR with affirmative support", () => {
    const res = resolveNarrativeMaturity({
      proposed: "UNDER_THE_RADAR",
      supportCodes: ["IDENTIFIABLE_LORE", "ORGANIC_COMMUNITY_PARTICIPATION"],
      positiveEvidenceCount: 3,
      negativeEvidenceCount: 0,
      independentSourceCount: 0,
      searchUnavailable: false,
    });
    expect(res.maturity).toBe("UNDER_THE_RADAR");
  });

  it("cannot call a narrative unproven when search was unavailable", () => {
    const res = resolveNarrativeMaturity({
      proposed: "WEAK_OR_UNPROVEN",
      supportCodes: [],
      positiveEvidenceCount: 0,
      negativeEvidenceCount: 0,
      independentSourceCount: 0,
      searchUnavailable: true,
    });
    expect(res.maturity).toBe("UNKNOWN");
  });

  it("flags the independence gate only when it is the single binding constraint", () => {
    const binding = buildGateDiagnostics({
      independentSourceCount: 0,
      primarySourceCount: 1,
      communitySourceCount: 2,
      evidenceConfidence: 72,
      searchUnavailable: false,
      searchHealth: "SEARCH_AVAILABLE",
      minIndependentSources: 2,
      otherGatesPassed: true,
      qualified: false,
    });
    expect(binding.independentSourceGateBinding).toBe(true);
    expect(binding.hypothesisMarkers).toContain(CALIBRATION_HYPOTHESIS_INDEPENDENT_SOURCE_GATE);

    const notBinding = buildGateDiagnostics({
      independentSourceCount: 0,
      primarySourceCount: 0,
      communitySourceCount: 0,
      evidenceConfidence: 30,
      searchUnavailable: false,
      searchHealth: "SEARCH_AVAILABLE",
      minIndependentSources: 2,
      otherGatesPassed: false,
      qualified: false,
    });
    expect(notBinding.independentSourceGateBinding).toBe(false);
    expect(notBinding.hypothesisMarkers).toHaveLength(0);
  });
});
