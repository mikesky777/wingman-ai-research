/**
 * Thesis Evidence Semantics — `thesis_evidence/v2.1`.
 *
 * A purely semantic upgrade over Thesis v2. It changes NOTHING about the
 * rubric weights, Thesis Score, Evidence Confidence formula, verdict
 * derivation or the Opportunity gates. What it adds is an honest, machine
 * readable description of the evidence a thesis was built on:
 *
 *   - NEGATIVE (affirmative adverse/contradictory evidence) is separated from
 *     MISSING (we could not establish it). Missing can never become negative.
 *   - Source AFFILIATION (project / community / independent) is separate from
 *     source QUALITY (primary / secondary / unverified).
 *   - Catalysts can be verified by a credible PRIMARY source without being
 *     mislabelled as independently corroborated.
 *   - `narrativeMaturity` may only read UNDER_THE_RADAR on affirmative
 *     evidence; absence of coverage alone is UNKNOWN / WEAK_OR_UNPROVEN.
 *   - Calibration diagnostics record whether the independent-source gate was
 *     the binding constraint. Diagnostics only: the gate itself is untouched.
 */

export const THESIS_EVIDENCE_SEMANTICS_VERSION = "thesis_evidence/v2.1";

/* ------------------------------------------------------------------ */
/* Taxonomies                                                          */
/* ------------------------------------------------------------------ */

export const EVIDENCE_POLARITIES = ["POSITIVE", "NEGATIVE", "MISSING", "AMBIGUOUS"] as const;
export type EvidencePolarity = (typeof EVIDENCE_POLARITIES)[number];

/** Ownership relative to the project. Never a statement about quality. */
export const SOURCE_AFFILIATIONS = [
  "PROJECT_OWNED",
  "PROJECT_AFFILIATED",
  "COMMUNITY",
  "INDEPENDENT",
  "UNKNOWN",
] as const;
export type SourceAffiliation = (typeof SOURCE_AFFILIATIONS)[number];

/** Quality of the source itself. Never a statement about independence. */
export const SOURCE_QUALITIES = ["PRIMARY", "SECONDARY", "UNVERIFIED"] as const;
export type SourceQuality = (typeof SOURCE_QUALITIES)[number];

/** How a statement was arrived at. */
export const EPISTEMIC_BASES = ["VERIFIED_FACT", "INFERENCE", "MODEL_JUDGMENT"] as const;
export type EpistemicBasis = (typeof EPISTEMIC_BASES)[number];

export const EVIDENCE_SEVERITIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export type EvidenceSeverity = (typeof EVIDENCE_SEVERITIES)[number];

/**
 * Catalyst taxonomy. A primary-source catalyst is REAL even with no media
 * coverage; independent corroboration raises confidence but is not required
 * for the event to exist. The two are never collapsed together.
 */
export const CATALYST_CLASSIFICATIONS = [
  "VERIFIED_INDEPENDENT",
  "VERIFIED_PRIMARY_SOURCE",
  "PLAUSIBLE",
  "SPECULATIVE",
  "NONE_FOUND",
] as const;
export type CatalystClassification = (typeof CATALYST_CLASSIFICATIONS)[number];

export const NARRATIVE_MATURITIES = [
  "ESTABLISHED",
  "EMERGING",
  "UNDER_THE_RADAR",
  "WEAK_OR_UNPROVEN",
  "UNKNOWN",
] as const;
export type NarrativeMaturity = (typeof NARRATIVE_MATURITIES)[number];

/**
 * Affirmative evidence classes that may support an UNDER_THE_RADAR or
 * EMERGING inference. Absence of coverage is deliberately NOT in this list.
 */
export const NARRATIVE_SUPPORT_CODES = [
  "IDENTIFIABLE_LORE",
  "PRIMARY_SOURCE_CATALYST",
  "ORGANIC_COMMUNITY_PARTICIPATION",
  "MINDSHARE_GROWTH",
  "RECURRING_PARTICIPATION",
  "DEFENSIBLE_CREATOR_CONNECTION",
] as const;
export type NarrativeSupportCode = (typeof NARRATIVE_SUPPORT_CODES)[number];

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

export interface EvidenceItem {
  polarity: EvidencePolarity;
  /** Research domain the item belongs to, e.g. "narrative", "creator". */
  domain: string | null;
  statement: string;
  /** Dossier claim references (C1, C2 …) that actually exist. */
  claimRefs: string[];
  /** Dossier source references (S1, S2 …) that actually exist. */
  sourceRefs: string[];
  affiliation: SourceAffiliation;
  sourceQuality: SourceQuality;
  basis: EpistemicBasis;
  /** Only meaningful for NEGATIVE items. */
  severity: EvidenceSeverity | null;
  /** What the negative item contradicts. Null outside NEGATIVE items. */
  contradictionTarget: string | null;
  /** Reason code for MISSING items, e.g. SEARCH_UNAVAILABLE. */
  gapCode: string | null;
}

export interface EvidencePolarityCounts {
  positive: number;
  negative: number;
  missing: number;
  ambiguous: number;
}

export interface SourceMix {
  independent: number;
  community: number;
  projectOwned: number;
  projectAffiliated: number;
  unknown: number;
  primaryQuality: number;
}

export interface EvidenceSemantics {
  semanticsVersion: typeof THESIS_EVIDENCE_SEMANTICS_VERSION;
  items: EvidenceItem[];
  positive: EvidenceItem[];
  negative: EvidenceItem[];
  missing: EvidenceItem[];
  ambiguous: EvidenceItem[];
  counts: EvidencePolarityCounts;
  catalystClassification: CatalystClassification;
  /** Plain-English basis, e.g. "primary/project source". Never overstated. */
  catalystVerificationBasis: string | null;
  narrativeMaturity: NarrativeMaturity;
  narrativeMaturityReasons: string[];
  narrativeSupportCodes: NarrativeSupportCode[];
  sourceMix: SourceMix;
  issues: { code: string; detail: string }[];
}

/* ------------------------------------------------------------------ */
/* Source affiliation                                                  */
/* ------------------------------------------------------------------ */

export interface SemanticSource {
  ref: string;
  /** Deep Research independence: PROJECT_OWNED | PROJECT_AFFILIATED | INDEPENDENT | UNKNOWN. */
  independence: string;
  /** Deep Research sourceType, used only to recognise community-origin sources. */
  sourceType?: string | null;
  /** Deep Research reliabilityClass. */
  reliabilityClass?: string | null;
}

const COMMUNITY_SOURCE_TYPES = new Set(["SOCIAL", "FORUM"]);

/**
 * Affiliation for a dossier source.
 *
 * Community chatter is organic but is NOT editorial/research corroboration,
 * so a social/forum source is COMMUNITY rather than INDEPENDENT here. This
 * classification is descriptive only — it never feeds the production
 * independent-source gate, which continues to use the dossier's own count.
 */
export function classifyAffiliation(source: SemanticSource): SourceAffiliation {
  const independence = (source.independence ?? "UNKNOWN").toUpperCase();
  if (independence === "PROJECT_OWNED") return "PROJECT_OWNED";
  if (independence === "PROJECT_AFFILIATED") return "PROJECT_AFFILIATED";
  const type = (source.sourceType ?? "").toUpperCase();
  if (COMMUNITY_SOURCE_TYPES.has(type)) return "COMMUNITY";
  if (independence === "INDEPENDENT") return "INDEPENDENT";
  return "UNKNOWN";
}

export function classifyQuality(source: SemanticSource): SourceQuality {
  const q = (source.reliabilityClass ?? "").toUpperCase();
  return (SOURCE_QUALITIES as readonly string[]).includes(q) ? (q as SourceQuality) : "UNVERIFIED";
}

export function computeSourceMix(sources: SemanticSource[]): SourceMix {
  const mix: SourceMix = {
    independent: 0,
    community: 0,
    projectOwned: 0,
    projectAffiliated: 0,
    unknown: 0,
    primaryQuality: 0,
  };
  for (const s of sources) {
    switch (classifyAffiliation(s)) {
      case "INDEPENDENT":
        mix.independent += 1;
        break;
      case "COMMUNITY":
        mix.community += 1;
        break;
      case "PROJECT_OWNED":
        mix.projectOwned += 1;
        break;
      case "PROJECT_AFFILIATED":
        mix.projectAffiliated += 1;
        break;
      default:
        mix.unknown += 1;
    }
    if (classifyQuality(s) === "PRIMARY") mix.primaryQuality += 1;
  }
  return mix;
}

/* ------------------------------------------------------------------ */
/* Catalyst classification                                             */
/* ------------------------------------------------------------------ */

export interface CatalystClassificationInput {
  catalystText: string | null;
  /** Raw model classification, if it supplied one. */
  proposed: string | null;
  /** Affiliations of the sources actually cited for the catalyst. */
  supportingAffiliations: SourceAffiliation[];
  supportingQualities: SourceQuality[];
}

/**
 * Deterministic catalyst classification.
 *
 * VERIFIED_INDEPENDENT requires a genuinely independent source. A credible
 * primary source (including a project-owned announcement) supports
 * VERIFIED_PRIMARY_SOURCE — real, but never described as independent.
 * Community claims alone can never verify: they cap at PLAUSIBLE.
 */
export function classifyCatalyst(input: CatalystClassificationInput): {
  classification: CatalystClassification;
  basis: string | null;
  downgraded: boolean;
} {
  if (!input.catalystText) return { classification: "NONE_FOUND", basis: null, downgraded: false };

  const proposed = (input.proposed ?? "").toUpperCase();
  const hasIndependent = input.supportingAffiliations.includes("INDEPENDENT");
  const hasProject =
    input.supportingAffiliations.includes("PROJECT_OWNED") ||
    input.supportingAffiliations.includes("PROJECT_AFFILIATED");
  const hasCommunity = input.supportingAffiliations.includes("COMMUNITY");
  const hasPrimary = input.supportingQualities.includes("PRIMARY");

  const wantsVerified =
    proposed === "VERIFIED" ||
    proposed === "VERIFIED_INDEPENDENT" ||
    proposed === "VERIFIED_PRIMARY_SOURCE";

  let classification: CatalystClassification;
  let basis: string | null;

  if (hasIndependent && wantsVerified) {
    classification = "VERIFIED_INDEPENDENT";
    basis = "independent source corroboration";
  } else if ((hasProject || hasPrimary) && wantsVerified) {
    classification = "VERIFIED_PRIMARY_SOURCE";
    basis = hasProject ? "primary/project source" : "primary source";
  } else if (proposed === "SPECULATIVE") {
    classification = "SPECULATIVE";
    basis = "no supporting source";
  } else if (proposed === "NONE_FOUND" || proposed === "NONE") {
    classification = "NONE_FOUND";
    basis = null;
  } else if (hasIndependent || hasProject || hasCommunity || hasPrimary) {
    classification = "PLAUSIBLE";
    basis = hasCommunity && !hasIndependent && !hasProject ? "community claim" : "cited evidence";
  } else {
    classification = "SPECULATIVE";
    basis = "no supporting source";
  }

  const downgraded = wantsVerified && classification !== "VERIFIED_INDEPENDENT" && proposed === "VERIFIED_INDEPENDENT";
  return { classification, basis, downgraded };
}

/** Legacy `catalystKind` for the frozen v2 column, derived from v2.1. */
export function legacyCatalystKind(c: CatalystClassification): "VERIFIED" | "PLAUSIBLE" | "NONE" {
  if (c === "VERIFIED_INDEPENDENT" || c === "VERIFIED_PRIMARY_SOURCE") return "VERIFIED";
  if (c === "PLAUSIBLE" || c === "SPECULATIVE") return "PLAUSIBLE";
  return "NONE";
}

/* ------------------------------------------------------------------ */
/* Narrative maturity                                                  */
/* ------------------------------------------------------------------ */

export interface NarrativeMaturityInput {
  proposed: string | null;
  supportCodes: NarrativeSupportCode[];
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  independentSourceCount: number;
  searchUnavailable: boolean;
}

/**
 * UNDER_THE_RADAR is an INFERENCE that requires affirmative evidence. Absence
 * of coverage alone must never produce it: without positive evidence the
 * honest answer is UNKNOWN (we could not establish anything) or
 * WEAK_OR_UNPROVEN (we looked and nothing supports the narrative).
 */
export function resolveNarrativeMaturity(input: NarrativeMaturityInput): {
  maturity: NarrativeMaturity;
  reasons: string[];
} {
  const proposedRaw = (input.proposed ?? "").toUpperCase();
  const proposed = (NARRATIVE_MATURITIES as readonly string[]).includes(proposedRaw)
    ? (proposedRaw as NarrativeMaturity)
    : "UNKNOWN";
  const reasons: string[] = [];
  const affirmative = input.supportCodes.length > 0 && input.positiveEvidenceCount > 0;

  if (proposed === "UNDER_THE_RADAR" || proposed === "EMERGING") {
    if (!affirmative) {
      reasons.push(
        `${proposed} not supported by affirmative evidence — downgraded (absence of coverage is not evidence)`,
      );
      const fallback: NarrativeMaturity = input.searchUnavailable
        ? "UNKNOWN"
        : input.negativeEvidenceCount > 0
          ? "WEAK_OR_UNPROVEN"
          : "UNKNOWN";
      reasons.push(
        input.searchUnavailable
          ? "external search unavailable — coverage is unproven, not absent"
          : "no affirmative lore / catalyst / participation evidence recorded",
      );
      return { maturity: fallback, reasons };
    }
    reasons.push(`affirmative evidence: ${input.supportCodes.join(", ")}`);
    if (proposed === "UNDER_THE_RADAR") {
      reasons.push(`limited independent coverage (${input.independentSourceCount} independent source(s))`);
    }
    return { maturity: proposed, reasons };
  }

  if (proposed === "ESTABLISHED") {
    if (input.independentSourceCount < 2) {
      reasons.push("ESTABLISHED requires broad independent coverage — downgraded to EMERGING/UNKNOWN");
      return { maturity: affirmative ? "EMERGING" : "UNKNOWN", reasons };
    }
    reasons.push(`${input.independentSourceCount} independent source(s) covering the narrative`);
    return { maturity: "ESTABLISHED", reasons };
  }

  if (proposed === "WEAK_OR_UNPROVEN") {
    if (input.searchUnavailable) {
      reasons.push("external search unavailable — cannot call the narrative unproven; UNKNOWN instead");
      return { maturity: "UNKNOWN", reasons };
    }
    reasons.push("narrative looked for and not supported by evidence");
    return { maturity: "WEAK_OR_UNPROVEN", reasons };
  }

  reasons.push("insufficient evidence to classify narrative maturity");
  return { maturity: "UNKNOWN", reasons };
}

/* ------------------------------------------------------------------ */
/* Calibration diagnostics for the independent-source gate             */
/* ------------------------------------------------------------------ */

export const CALIBRATION_HYPOTHESIS_INDEPENDENT_SOURCE_GATE =
  "CALIBRATION_HYPOTHESIS_INDEPENDENT_SOURCE_GATE";

export interface IndependentOriginGateSummary {
  version: string;
  status: "PASS" | "FAIL" | "NOT_EVALUABLE";
  distinctIndependentEvidenceOrigins: number | null;
  independentSourceCount: number;
  required: number;
  reason: string | null;
}

export interface GateDiagnosticsInput {
  independentSourceCount: number;
  /** opportunity_gate/v1.1 — the value the gate actually used. */
  originGate?: IndependentOriginGateSummary;
  primarySourceCount: number;
  communitySourceCount: number;
  evidenceConfidence: number;
  searchUnavailable: boolean;
  searchHealth: string;
  minIndependentSources: number;
  /** True when every gate EXCEPT source independence passed. */
  otherGatesPassed: boolean;
  qualified: boolean;
}

export interface GateDiagnostics {
  semanticsVersion: typeof THESIS_EVIDENCE_SEMANTICS_VERSION;
  /** DIAGNOSTIC_ONLY. */
  independentSourceCount: number;
  originGate: IndependentOriginGateSummary | null;
  primarySourceCount: number;
  communitySourceCount: number;
  searchHealth: string;
  searchUnavailable: boolean;
  evidenceConfidence: number;
  independentSourceGateBinding: boolean;
  otherGatesPassed: boolean;
  qualified: boolean;
  hypothesisMarkers: string[];
}

/**
 * Analysis only. This never changes whether a candidate qualifies; it records
 * whether source independence was the single binding constraint so the
 * Calibration Observatory can later ask if the gate is additive at all.
 */
export function buildGateDiagnostics(input: GateDiagnosticsInput): GateDiagnostics {
  const gateSatisfied = input.originGate
    ? input.originGate.status === "PASS"
    : input.independentSourceCount >= input.minIndependentSources;
  const binding = input.otherGatesPassed && !gateSatisfied;
  return {
    semanticsVersion: THESIS_EVIDENCE_SEMANTICS_VERSION,
    independentSourceCount: input.independentSourceCount,
    originGate: input.originGate ?? null,
    primarySourceCount: input.primarySourceCount,
    communitySourceCount: input.communitySourceCount,
    searchHealth: input.searchHealth,
    searchUnavailable: input.searchUnavailable,
    evidenceConfidence: input.evidenceConfidence,
    independentSourceGateBinding: binding,
    otherGatesPassed: input.otherGatesPassed,
    qualified: input.qualified,
    hypothesisMarkers: binding ? [CALIBRATION_HYPOTHESIS_INDEPENDENT_SOURCE_GATE] : [],
  };
}

/* ------------------------------------------------------------------ */
/* Validation of model-supplied semantics                              */
/* ------------------------------------------------------------------ */

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function refs(value: unknown, known: Set<string>, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const s = str(v);
    if (s && known.has(s) && !out.includes(s)) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export interface EvidenceSemanticsInput {
  raw: unknown;
  knownClaimRefs: string[];
  sources: SemanticSource[];
  catalystText: string | null;
  legacyCatalystKind: string | null;
  independentSourceCount: number;
  searchUnavailable: boolean;
  /** Structured gaps already known deterministically (packet/dossier). */
  knownGaps: string[];
}

/**
 * Builds the v2.1 semantics block from raw model output plus deterministic
 * dossier facts. Every honesty rule is enforced HERE, not trusted to the
 * model: affiliation comes from the dossier, MISSING can never be promoted to
 * NEGATIVE, and unverifiable catalysts/narratives are downgraded.
 */
export function buildEvidenceSemantics(input: EvidenceSemanticsInput): EvidenceSemantics {
  const issues: { code: string; detail: string }[] = [];
  const obj = (input.raw && typeof input.raw === "object" ? input.raw : {}) as Record<string, unknown>;
  const sourceByRef = new Map(input.sources.map((s) => [s.ref, s]));
  const knownSourceRefs = new Set(input.sources.map((s) => s.ref));
  const knownClaimRefs = new Set(input.knownClaimRefs);

  const rawItems = Array.isArray(obj["evidenceItems"]) ? (obj["evidenceItems"] as unknown[]) : [];
  const items: EvidenceItem[] = [];

  for (const entry of rawItems.slice(0, 30)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const statement = str(e["statement"]);
    if (!statement) continue;

    const polarityRaw = (str(e["polarity"]) ?? "").toUpperCase();
    let polarity: EvidencePolarity = (EVIDENCE_POLARITIES as readonly string[]).includes(polarityRaw)
      ? (polarityRaw as EvidencePolarity)
      : "AMBIGUOUS";

    const sourceRefs = refs(e["sourceRefs"], knownSourceRefs);
    const claimRefs = refs(e["claimRefs"], knownClaimRefs);
    const gapCode = str(e["gapCode"]);
    const basisRaw = (str(e["basis"]) ?? "").toUpperCase();
    let basis: EpistemicBasis = (EPISTEMIC_BASES as readonly string[]).includes(basisRaw)
      ? (basisRaw as EpistemicBasis)
      : "MODEL_JUDGMENT";

    // A NEGATIVE item must cite affirmative adverse evidence. An uncited
    // "negative" is an evidence GAP, never adverse evidence.
    if (polarity === "NEGATIVE" && sourceRefs.length === 0 && claimRefs.length === 0) {
      issues.push({ code: "NEGATIVE_WITHOUT_EVIDENCE_RECLASSIFIED", detail: statement.slice(0, 140) });
      polarity = "MISSING";
    }
    if (polarity === "POSITIVE" && sourceRefs.length === 0 && claimRefs.length === 0) {
      basis = basis === "VERIFIED_FACT" ? "MODEL_JUDGMENT" : basis;
      issues.push({ code: "POSITIVE_WITHOUT_CITATION", detail: statement.slice(0, 140) });
    }

    const affiliations = sourceRefs
      .map((ref) => sourceByRef.get(ref))
      .filter((s): s is SemanticSource => Boolean(s))
      .map(classifyAffiliation);
    const qualities = sourceRefs
      .map((ref) => sourceByRef.get(ref))
      .filter((s): s is SemanticSource => Boolean(s))
      .map(classifyQuality);

    const affiliation: SourceAffiliation = affiliations.includes("INDEPENDENT")
      ? "INDEPENDENT"
      : affiliations.includes("COMMUNITY")
        ? "COMMUNITY"
        : affiliations.includes("PROJECT_OWNED")
          ? "PROJECT_OWNED"
          : affiliations.includes("PROJECT_AFFILIATED")
            ? "PROJECT_AFFILIATED"
            : "UNKNOWN";
    const sourceQuality: SourceQuality = qualities.includes("PRIMARY")
      ? "PRIMARY"
      : qualities.includes("SECONDARY")
        ? "SECONDARY"
        : "UNVERIFIED";

    const severityRaw = (str(e["severity"]) ?? "").toUpperCase();
    const severity: EvidenceSeverity | null =
      polarity === "NEGATIVE"
        ? (EVIDENCE_SEVERITIES as readonly string[]).includes(severityRaw)
          ? (severityRaw as EvidenceSeverity)
          : "MODERATE"
        : null;

    items.push({
      polarity,
      domain: str(e["domain"]),
      statement,
      claimRefs,
      sourceRefs,
      affiliation,
      sourceQuality,
      basis,
      severity,
      contradictionTarget: polarity === "NEGATIVE" ? str(e["contradictionTarget"]) : null,
      gapCode: polarity === "MISSING" ? (gapCode ?? "UNSPECIFIED_GAP") : null,
    });
  }

  // Deterministic gaps are always represented, never as negative evidence.
  const knownGapCodes = new Set(items.filter((i) => i.gapCode).map((i) => i.gapCode));
  for (const gap of input.knownGaps) {
    if (knownGapCodes.has(gap)) continue;
    items.push({
      polarity: "MISSING",
      domain: null,
      statement: `Evidence gap: ${gap}`,
      claimRefs: [],
      sourceRefs: [],
      affiliation: "UNKNOWN",
      sourceQuality: "UNVERIFIED",
      basis: "VERIFIED_FACT",
      severity: null,
      contradictionTarget: null,
      gapCode: gap,
    });
  }
  if (input.searchUnavailable && !items.some((i) => i.gapCode === "SEARCH_UNAVAILABLE")) {
    items.push({
      polarity: "MISSING",
      domain: null,
      statement:
        "External search was unavailable — absence of external coverage is unproven, not a finding.",
      claimRefs: [],
      sourceRefs: [],
      affiliation: "UNKNOWN",
      sourceQuality: "UNVERIFIED",
      basis: "VERIFIED_FACT",
      severity: null,
      contradictionTarget: null,
      gapCode: "SEARCH_UNAVAILABLE",
    });
  }

  const positive = items.filter((i) => i.polarity === "POSITIVE");
  const negative = items.filter((i) => i.polarity === "NEGATIVE");
  const missing = items.filter((i) => i.polarity === "MISSING");
  const ambiguous = items.filter((i) => i.polarity === "AMBIGUOUS");

  const catalystSourceRefs = refs(obj["catalystSourceRefs"], knownSourceRefs);
  const catalystSources = catalystSourceRefs
    .map((ref) => sourceByRef.get(ref))
    .filter((s): s is SemanticSource => Boolean(s));
  const catalyst = classifyCatalyst({
    catalystText: input.catalystText,
    proposed: str(obj["catalystClassification"]) ?? input.legacyCatalystKind,
    supportingAffiliations: catalystSources.map(classifyAffiliation),
    supportingQualities: catalystSources.map(classifyQuality),
  });
  if (catalyst.downgraded) {
    issues.push({
      code: "CATALYST_INDEPENDENCE_DOWNGRADED",
      detail: "claimed independent corroboration without an independent source",
    });
  }

  const supportCodesRaw = Array.isArray(obj["narrativeSupportCodes"])
    ? (obj["narrativeSupportCodes"] as unknown[])
    : [];
  const supportCodes = supportCodesRaw
    .map((v) => (str(v) ?? "").toUpperCase())
    .filter((v): v is NarrativeSupportCode =>
      (NARRATIVE_SUPPORT_CODES as readonly string[]).includes(v),
    );
  if (
    catalyst.classification === "VERIFIED_PRIMARY_SOURCE" &&
    !supportCodes.includes("PRIMARY_SOURCE_CATALYST")
  ) {
    supportCodes.push("PRIMARY_SOURCE_CATALYST");
  }

  const narrative = resolveNarrativeMaturity({
    proposed: str(obj["narrativeMaturity"]),
    supportCodes,
    positiveEvidenceCount: positive.length,
    negativeEvidenceCount: negative.length,
    independentSourceCount: input.independentSourceCount,
    searchUnavailable: input.searchUnavailable,
  });
  for (const reason of (Array.isArray(obj["narrativeMaturityReasons"])
    ? (obj["narrativeMaturityReasons"] as unknown[])
    : []
  )
    .map(str)
    .filter((v): v is string => Boolean(v))
    .slice(0, 4)) {
    if (!narrative.reasons.includes(reason)) narrative.reasons.push(reason);
  }

  return {
    semanticsVersion: THESIS_EVIDENCE_SEMANTICS_VERSION,
    items,
    positive,
    negative,
    missing,
    ambiguous,
    counts: {
      positive: positive.length,
      negative: negative.length,
      missing: missing.length,
      ambiguous: ambiguous.length,
    },
    catalystClassification: catalyst.classification,
    catalystVerificationBasis: catalyst.basis,
    narrativeMaturity: narrative.maturity,
    narrativeMaturityReasons: narrative.reasons,
    narrativeSupportCodes: supportCodes,
    sourceMix: computeSourceMix(input.sources),
    issues,
  };
}

/** Honest human-readable label for a catalyst. Never overstates independence. */
export function catalystLabel(
  classification: CatalystClassification,
  basis: string | null,
): string {
  switch (classification) {
    case "VERIFIED_INDEPENDENT":
      return "Verified catalyst — independent corroboration";
    case "VERIFIED_PRIMARY_SOURCE":
      return `Verified catalyst — ${basis ?? "primary/project source"}`;
    case "PLAUSIBLE":
      return "Plausible catalyst — not verified";
    case "SPECULATIVE":
      return "Speculative catalyst — no supporting source";
    default:
      return "No verified catalyst found";
  }
}
