/**
 * Thesis Synthesis — pure contracts, rubric, scoring and validation.
 *
 * This module is deliberately I/O-free so every safety rule (component sum,
 * evidence-confidence separation, verdict derivation, opportunity policy,
 * hindsight redaction) is unit-testable without a network or a model.
 *
 * Thesis Synthesis produces JUDGEMENT over already-collected evidence. It is
 * not another search agent, it never introduces new external facts, and it
 * never produces an Entry State, position size, stop loss or trade action.
 *
 * VERSIONING
 * v1 (`thesis_synthesis/v1`, `thesis_rubric/v1`) included a 10-point
 * "chart / entry context" component. Those reports are FROZEN and are never
 * rescored. v2 removes chart/entry/timing from Thesis completely: timing lives
 * exclusively in the Entry layer. v1 and v2 Thesis Scores are NOT directly
 * interchangeable and must always be read with their persisted rubric version.
 */

/** FROZEN v1 identifiers — kept so historical reports stay readable. */
export const THESIS_POLICY_VERSION_V1 = "thesis_synthesis/v1";
export const THESIS_RUBRIC_VERSION_V1 = "thesis_rubric/v1";
export const THESIS_COMPONENTS_V1 = [
  { key: "memeQuality", label: "Thesis / meme quality", weight: 20 },
  { key: "catalystNarrative", label: "Catalyst / narrative", weight: 15 },
  { key: "distribution", label: "Distribution / holder structure", weight: 15 },
  { key: "liquidity", label: "Liquidity / exitability", weight: 15 },
  { key: "devIntegrity", label: "Dev / launch integrity", weight: 10 },
  { key: "chartContext", label: "Chart / entry context", weight: 10 },
  { key: "mindshare", label: "Mindshare / reflexivity", weight: 10 },
  { key: "valuation", label: "Valuation / asymmetry", weight: 5 },
] as const;

/** ACTIVE policy. Thesis answers fundamentals only — never timing. */
export const THESIS_POLICY_VERSION = "thesis_synthesis/v2";
export const THESIS_RUBRIC_VERSION = "thesis_rubric/v2";
/** v2 removes chart/entry context; v1.1 catalyst-vs-market-signal rules stay. */
export const THESIS_PROMPT_VERSION = "thesis_synthesis_prompt/v2";
export const NO_VERIFIED_CATALYST = "No verified catalyst found";
/**
 * Input policy. Realized post-cutoff performance (outcomes) is stripped from
 * everything the synthesizer sees, exactly as in triage.
 */
export const THESIS_INPUT_POLICY_VERSION = "thesis_synthesis_input/v1_no_outcomes";

/** Compact-packet keys removed before the model ever sees a candidate. */
export const THESIS_REDACTED_PACKET_KEYS = ["outcomes"] as const;

/**
 * v2 rubric — 100 points, zero of which may come from current candle
 * structure, breakout/retest, extension, momentum, entry quality or any other
 * technical timing consideration. Those belong to Entry State only.
 */
export const THESIS_COMPONENTS = [
  { key: "memeQuality", label: "Meme / lore quality", weight: 20 },
  { key: "catalystNarrative", label: "Narrative / catalyst", weight: 20 },
  { key: "distribution", label: "Distribution / holder structure", weight: 15 },
  { key: "liquidity", label: "Liquidity / exitability", weight: 15 },
  { key: "devIntegrity", label: "Dev / launch integrity", weight: 10 },
  { key: "mindshare", label: "Mindshare / reflexivity / virality", weight: 10 },
  { key: "valuation", label: "Valuation / asymmetry", weight: 10 },
] as const;

/** Component keys ever used by any rubric version. */
export type ThesisComponentKey = (typeof THESIS_COMPONENTS_V1)[number]["key"];

/** Sparse by design: a v2 report has no `chartContext` entry at all. */
export type ComponentScores = Partial<Record<ThesisComponentKey, number>>;

export const THESIS_MAX_SCORE = THESIS_COMPONENTS.reduce((sum, c) => sum + c.weight, 0);

/** Timing concepts that must never contribute Thesis points. */
export const THESIS_FORBIDDEN_TIMING_KEYS = [
  "chartContext",
  "entryState",
  "entryScore",
  "extension",
  "breakout",
  "momentum",
] as const;

export interface RubricComponent {
  key: ThesisComponentKey;
  label: string;
  weight: number;
}

/** Renders the rubric a stored report was actually scored with. */
export function componentsForRubric(
  rubricVersion: string | null | undefined,
  policyVersion?: string | null,
): readonly RubricComponent[] {
  const v1 =
    rubricVersion === THESIS_RUBRIC_VERSION_V1 ||
    (!rubricVersion && policyVersion === THESIS_POLICY_VERSION_V1);
  return v1 ? THESIS_COMPONENTS_V1 : THESIS_COMPONENTS;
}


export const BEAR_SEVERITIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export type BearSeverity = (typeof BEAR_SEVERITIES)[number];

/**
 * A catalyst is an identifiable EXTERNAL trigger (event, launch, listing,
 * announcement, cultural/media moment). Price/volume/participation
 * acceleration is a MARKET SIGNAL and is never a catalyst.
 */
export const CATALYST_KINDS = ["VERIFIED", "PLAUSIBLE", "NONE"] as const;
export type CatalystKind = (typeof CATALYST_KINDS)[number];

/** Market-behaviour language that must never be stored as an external catalyst. */
export const MARKET_SIGNAL_PATTERN =
  /\b(volume|price action|price momentum|momentum|reaccelerat\w*|re-accelerat\w*|acceleration|buy pressure|renewed (?:interest|participation)|participation|wallet activity|buyer count|scanner persistence|liquidity (?:rising|increase)|market cap (?:rising|climbing)|pump\w*|rallied|rally)\b/i;

/** True when the text describes market behaviour rather than an external trigger. */
export function isMarketSignalOnly(text: string | null): boolean {
  if (!text) return false;
  return MARKET_SIGNAL_PATTERN.test(text);
}

export const THESIS_VERDICTS = [
  "STRONG_THESIS",
  "PROMISING",
  "WATCH",
  "WEAK_THESIS",
  "INSUFFICIENT_EVIDENCE",
] as const;
export type ThesisVerdict = (typeof THESIS_VERDICTS)[number];

export type ThesisStatus =
  | "completed"
  | "insufficient_evidence"
  | "blocked_before_thesis"
  | "failed";

export const THESIS_SECTION_KEYS = [
  "thesis",
  "catalyst",
  "mindshare",
  "holdersDev",
  "valuation",
] as const;
export type ThesisSectionKey = (typeof THESIS_SECTION_KEYS)[number];
export type ThesisSections = Record<ThesisSectionKey, string | null>;

export interface EvidenceConfidenceInput {
  /** Deep Research domains that stayed unresolved. */
  unresolvedDomainCount: number;
  totalDomainCount: number;
  independentSourceCount: number;
  sourceCount: number;
  sourceDomainDiversity: number;
  conflictingClaimCount: number;
  corroboratedClaimCount: number;
  identityAttributionConfidence: string;
  narrativeResolved: boolean;
  /** Machine-readable gaps carried by the Research Packet. */
  packetEvidenceGapCount: number;
  marketStale: boolean;
  /** True when external search could not be performed at all. */
  searchUnavailable: boolean;
}

export interface EvidenceConfidenceBreakdown {
  score: number;
  deductions: { code: string; points: number; detail: string }[];
}

const ATTRIBUTION_PENALTY: Record<string, number> = {
  CONFIRMED: 0,
  STRONG: 3,
  PROBABLE: 8,
  WEAK: 15,
  UNRESOLVED: 25,
};

/**
 * Evidence Confidence answers "how complete, current, independent and
 * trustworthy is the evidence behind our judgement?" — never "how likely is
 * this to succeed". It is computed deterministically from coverage so that a
 * model can never talk its own confidence up, and so that missing evidence
 * lands HERE instead of being double-counted as a thesis penalty.
 */
export function computeEvidenceConfidence(
  input: EvidenceConfidenceInput,
): EvidenceConfidenceBreakdown {
  const deductions: { code: string; points: number; detail: string }[] = [];
  const add = (code: string, points: number, detail: string) => {
    if (points > 0) deductions.push({ code, points: Math.round(points), detail });
  };

  add(
    "UNRESOLVED_DOMAINS",
    Math.min(48, input.unresolvedDomainCount * 8),
    `${input.unresolvedDomainCount}/${input.totalDomainCount} research domains unresolved`,
  );

  const independent = input.independentSourceCount;
  const independencePenalty = independent >= 3 ? 0 : independent === 2 ? 8 : independent === 1 ? 15 : 25;
  add(
    "INDEPENDENT_SOURCES",
    independencePenalty,
    `${independent} independent (non project-owned) source(s)`,
  );

  add(
    "ATTRIBUTION",
    ATTRIBUTION_PENALTY[input.identityAttributionConfidence] ?? 25,
    `exact-mint attribution ${input.identityAttributionConfidence}`,
  );

  const diversityPenalty = input.sourceDomainDiversity >= 3 ? 0 : input.sourceDomainDiversity === 2 ? 4 : 8;
  add("SOURCE_DIVERSITY", diversityPenalty, `${input.sourceDomainDiversity} distinct source host(s)`);

  add(
    "CONFLICTS",
    Math.min(12, input.conflictingClaimCount * 4),
    `${input.conflictingClaimCount} conflicting claim(s)`,
  );

  add(
    "PACKET_GAPS",
    Math.min(15, input.packetEvidenceGapCount * 3),
    `${input.packetEvidenceGapCount} structured evidence gap(s)`,
  );

  if (!input.narrativeResolved) add("NARRATIVE_UNRESOLVED", 10, "origin/narrative not resolved");
  if (input.marketStale) add("STALE_MARKET", 5, "current market evidence is stale");
  if (input.searchUnavailable) {
    add("SEARCH_UNAVAILABLE", 20, "external search was unavailable — absence of sources is unproven");
  }
  if (input.sourceCount === 0) add("NO_SOURCES", 10, "no sources at all");

  const total = deductions.reduce((sum, d) => sum + d.points, 0);
  return { score: Math.max(0, Math.min(100, 100 - total)), deductions };
}

export interface VerdictInput {
  thesisScore: number;
  evidenceConfidence: number;
  bearSeverity: BearSeverity;
  /** No dossier claims at all, or external search never worked. */
  evidenceUnusable: boolean;
  criticalUnresolvedIssues: number;
}

/**
 * Verdict is deliberately NOT a function of score alone: a high score built on
 * thin, project-owned or unreachable evidence must not read as conviction.
 */
export function deriveVerdict(input: VerdictInput): ThesisVerdict {
  if (input.evidenceUnusable || input.evidenceConfidence < 35) return "INSUFFICIENT_EVIDENCE";
  if (input.bearSeverity === "CRITICAL") return "WEAK_THESIS";
  if (input.criticalUnresolvedIssues >= 2 && input.evidenceConfidence < 55) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (input.thesisScore >= 75 && input.evidenceConfidence >= 65 && input.bearSeverity !== "HIGH") {
    return "STRONG_THESIS";
  }
  if (input.thesisScore >= 60 && input.evidenceConfidence >= 50) return "PROMISING";
  if (input.thesisScore >= 45) return "WATCH";
  return "WEAK_THESIS";
}

/**
 * Opportunity policy. Conservative and explicit: a maximum, never a quota.
 * Ranking top-5 in a weak cohort is NOT a qualification.
 */
export interface OpportunityPolicy {
  maxOpportunities: number;
  minThesisScore: number;
  minEvidenceConfidence: number;
  allowedVerdicts: ThesisVerdict[];
  maxBearSeverity: BearSeverity;
  minIndependentSources: number;
}

export const OPPORTUNITY_POLICY: OpportunityPolicy = {
  maxOpportunities: 5,
  minThesisScore: 70,
  minEvidenceConfidence: 60,
  allowedVerdicts: ["STRONG_THESIS", "PROMISING"],
  maxBearSeverity: "MODERATE",
  minIndependentSources: 2,
};

const SEVERITY_ORDER: Record<BearSeverity, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export interface OpportunityCandidate {
  mint: string;
  thesisScore: number;
  evidenceConfidence: number;
  verdict: ThesisVerdict;
  bearSeverity: BearSeverity;
  independentSourceCount: number;
  eligibleNow: boolean;
}

export function qualifiesAsOpportunity(
  c: OpportunityCandidate,
  policy: OpportunityPolicy = OPPORTUNITY_POLICY,
): boolean {
  if (!c.eligibleNow) return false;
  if (!policy.allowedVerdicts.includes(c.verdict)) return false;
  if (c.thesisScore < policy.minThesisScore) return false;
  if (c.evidenceConfidence < policy.minEvidenceConfidence) return false;
  if (SEVERITY_ORDER[c.bearSeverity] > SEVERITY_ORDER[policy.maxBearSeverity]) return false;
  if (c.independentSourceCount < policy.minIndependentSources) return false;
  return true;
}

/** Qualifying candidates only, best-first, capped. Never force-filled. */
export function selectOpportunities(
  candidates: OpportunityCandidate[],
  policy: OpportunityPolicy = OPPORTUNITY_POLICY,
): OpportunityCandidate[] {
  return candidates
    .filter((c) => qualifiesAsOpportunity(c, policy))
    .sort(
      (a, b) =>
        b.thesisScore - a.thesisScore ||
        b.evidenceConfidence - a.evidenceConfidence ||
        a.mint.localeCompare(b.mint),
    )
    .slice(0, policy.maxOpportunities);
}

/** Strip post-cutoff realized outcomes from the compact packet. */
export function redactCompactForThesis(
  compact: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(compact)) {
    if ((THESIS_REDACTED_PACKET_KEYS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out;
}

export interface ValidationIssue {
  code: string;
  detail: string;
}

export interface ValidatedThesisOutput {
  components: ComponentScores;
  thesisScore: number;
  oneSentenceThesis: string | null;
  narrativeThesis: string | null;
  sections: ThesisSections;
  strongestBullCase: string | null;
  strongestBearCase: string | null;
  bearSeverity: BearSeverity;
  /** Real external catalyst only; null when none was verified. */
  strongestCatalyst: string | null;
  catalystKind: CatalystKind;
  /** Timing context from market behaviour — never presented as a catalyst. */
  whyNowMarketSignal: string | null;
  strongestConcern: string | null;
  catalysts: string[];
  invalidation: string[];
  evidenceGaps: string[];
  supportingClaimRefs: string[];
  supportingSourceRefs: string[];
  criticalUnresolvedIssues: number;
  issues: ValidationIssue[];
}

/**
 * Action language only. Descriptive words ("short-term attention", "buyers")
 * are legitimate analysis; this matches recommendations and trade mechanics.
 */
const BANNED_ACTION =
  /\b(buy zone|position siz\w*|stop loss|take profit|price target|target price|entry price|risk\/reward ratio of)\b|\b(?:should|would|we|you|i)\s+(?:buy|sell|ape|accumulate|enter|exit)\b|\bgo (?:long|short)\b|\bape in\b|\brecommend\w*\s+(?:buying|selling|a position)\b/i;

const GENERIC_INVALIDATION = /^\s*(price\s+(goes|drops|falls)\s+down|it\s+dumps|chart\s+breaks)\s*\.?\s*$/i;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const s = asString(v);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function clampComponent(value: unknown, weight: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(weight, Math.round(n)));
}

/**
 * Strict validation of raw model output.
 *
 * The model proposes component scores only; the TOTAL is always recomputed
 * here, so Thesis Score is the exact sum of the eight components by
 * construction. Source/claim citations are filtered to references that
 * actually exist in the dossier: synthesis may not invent evidence.
 */
export function validateThesisOutput(
  raw: unknown,
  known: { sourceRefs: string[]; claimRefs: string[] },
): ValidatedThesisOutput {
  const issues: ValidationIssue[] = [];
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") issues.push({ code: "OUTPUT_MALFORMED", detail: "not an object" });

  const rawComponents = (obj["components"] && typeof obj["components"] === "object"
    ? obj["components"]
    : {}) as Record<string, unknown>;

  const components = {} as ComponentScores;
  for (const c of THESIS_COMPONENTS) {
    const value = rawComponents[c.key];
    if (value === undefined) issues.push({ code: "COMPONENT_MISSING", detail: c.key });
    const clamped = clampComponent(value, c.weight);
    if (typeof value === "number" && (value < 0 || value > c.weight)) {
      issues.push({ code: "COMPONENT_OUT_OF_RANGE", detail: `${c.key}=${value}` });
    }
    components[c.key] = clamped;
  }
  const thesisScore = THESIS_COMPONENTS.reduce((sum, c) => sum + (components[c.key] ?? 0), 0);

  const sections = {} as ThesisSections;
  const rawSections = (obj["sections"] && typeof obj["sections"] === "object"
    ? obj["sections"]
    : {}) as Record<string, unknown>;
  for (const key of THESIS_SECTION_KEYS) sections[key] = asString(rawSections[key]);

  const severityRaw = asString(obj["bearCaseSeverity"])?.toUpperCase() as BearSeverity | undefined;
  const bearSeverity: BearSeverity =
    severityRaw && BEAR_SEVERITIES.includes(severityRaw) ? severityRaw : "HIGH";
  if (!severityRaw || !BEAR_SEVERITIES.includes(severityRaw)) {
    issues.push({ code: "BEAR_SEVERITY_MISSING", detail: String(severityRaw ?? "none") });
  }

  const invalidation = asStringArray(obj["invalidation"]).filter((line) => {
    if (GENERIC_INVALIDATION.test(line)) {
      issues.push({ code: "INVALIDATION_GENERIC", detail: line });
      return false;
    }
    return true;
  });

  const knownSources = new Set(known.sourceRefs);
  const knownClaims = new Set(known.claimRefs);
  const supportingSourceRefs = asStringArray(obj["supportingSourceRefs"], 40).filter((r) => {
    if (knownSources.has(r)) return true;
    issues.push({ code: "UNKNOWN_SOURCE_REF", detail: r });
    return false;
  });
  const supportingClaimRefs = asStringArray(obj["supportingClaimRefs"], 40).filter((r) => {
    if (knownClaims.has(r)) return true;
    issues.push({ code: "UNKNOWN_CLAIM_REF", detail: r });
    return false;
  });

  const checkAction = (label: string, text: string | null) => {
    if (text && BANNED_ACTION.test(text)) {
      issues.push({ code: "TRADE_LANGUAGE_STRIPPED", detail: `${label}: ${text.slice(0, 120)}` });
      return null;
    }
    return text;
  };

  // Catalyst semantics: market behaviour is a WHY NOW signal, never a catalyst.
  let strongestCatalyst = asString(obj["strongestCatalyst"]);
  let whyNowMarketSignal = asString(obj["whyNowMarketSignal"]);
  const kindRaw = asString(obj["catalystKind"])?.toUpperCase() as CatalystKind | undefined;
  let catalystKind: CatalystKind =
    kindRaw && CATALYST_KINDS.includes(kindRaw) ? kindRaw : strongestCatalyst ? "PLAUSIBLE" : "NONE";
  if (strongestCatalyst && isMarketSignalOnly(strongestCatalyst)) {
    issues.push({
      code: "CATALYST_WAS_MARKET_SIGNAL",
      detail: strongestCatalyst.slice(0, 160),
    });
    whyNowMarketSignal = whyNowMarketSignal ?? strongestCatalyst;
    strongestCatalyst = null;
    catalystKind = "NONE";
  }
  if (!strongestCatalyst) catalystKind = "NONE";
  const catalysts = asStringArray(obj["catalysts"]).filter((c) => !isMarketSignalOnly(c));

  const criticalRaw = obj["criticalUnresolvedIssues"];
  const criticalUnresolvedIssues = Number.isFinite(Number(criticalRaw))
    ? Math.max(0, Math.min(10, Math.round(Number(criticalRaw))))
    : 0;

  return {
    components,
    thesisScore,
    oneSentenceThesis: checkAction("oneSentenceThesis", asString(obj["oneSentenceThesis"])),
    narrativeThesis: checkAction("narrativeThesis", asString(obj["narrativeThesis"])),
    sections,
    strongestBullCase: checkAction("bullCase", asString(obj["strongestBullCase"])),
    strongestBearCase: asString(obj["strongestBearCase"]),
    bearSeverity,
    strongestCatalyst,
    catalystKind,
    whyNowMarketSignal,
    strongestConcern: asString(obj["strongestConcern"]),
    catalysts,
    invalidation,
    evidenceGaps: asStringArray(obj["evidenceGaps"]),
    supportingClaimRefs,
    supportingSourceRefs,
    criticalUnresolvedIssues,
    issues,
  };
}

export interface ThesisPromptInput {
  header: {
    mint: string;
    symbol: string | null;
    name: string | null;
    policyVersion: string;
    promptVersion: string;
    inputPolicyVersion: string;
    mode: "PRODUCTION" | "CALIBRATION";
    generatedAt: string;
  };
  /** Outcome-redacted compact Research Packet. */
  packet: Record<string, unknown>;
  /** Deep Research dossier, evidence only. */
  dossier: unknown;
  triage: {
    decision: string;
    confidence: string | null;
    rationale: string | null;
    unresolvedQuestions: string[];
  } | null;
  eligibility: { researchEligibleNow: boolean; exclusionReasons: string[] };
  searchUnavailable: boolean;
}

export function buildThesisSystemPrompt(): string {
  const rubric = THESIS_COMPONENTS.map((c) => `- ${c.key} (${c.label}): 0-${c.weight}`).join("\n");
  return [
    "You are Wingman's Thesis Synthesis analyst for Solana memecoins.",
    "You judge ALREADY-COLLECTED evidence. You are not a search agent: never introduce an external fact that is not present in the Research Packet or the Deep Research dossier.",
    "",
    "HARD RULES",
    "1. Every major claim must trace to packet evidence or a dossier claim/source reference.",
    "2. Label reasoning honestly: VERIFIED FACT, INFERENCE, SPECULATION or MODEL JUDGEMENT. Never present inference as fact.",
    "3. Project-owned sources (the token's own site, X account, Telegram, launchpad page) are the PROJECT SPEAKING. They can never count as independent corroboration.",
    "4. Missing evidence is NOT bearish evidence. Do not deduct thesis points merely because a domain is unresolved; unresolved evidence is handled separately by Evidence Confidence, which you do not compute.",
    "5. Never output a buy/sell recommendation, entry state, position size, stop loss or price target. No trade language at all.",
    "6. Never reason about what happened to the price after the evidence cutoff. You are given none of it.",
    "7. A DAMAGED price structure or a NONE setup is not an automatic failure, and neither is an interesting scanner profile a substitute for external evidence.",
    "",
    "CATALYST VS MARKET SIGNAL (strict)",
    "A CATALYST is an identifiable EXTERNAL trigger: an upcoming event, launch, listing, announcement, scheduled cultural/media moment, or ecosystem event with a defensible connection. Set catalystKind to VERIFIED (evidenced) or PLAUSIBLE (reasonably inferred from evidence).",
    "Price/volume/momentum/reacceleration/renewed participation/wallet activity/scanner persistence are MARKET SIGNALS, never catalysts. Put them in whyNowMarketSignal.",
    "If no real external catalyst exists, set strongestCatalyst to null and catalystKind to NONE. Never fill the catalyst field with market behaviour to avoid an empty value.",
    "Market behaviour may still inform the catalystNarrative component as timing context, labelled as MARKET SIGNAL.",
    "",
    "SCORING RUBRIC (score each component independently, integers only)",
    rubric,
    "Do not output a total: the total is computed as the exact sum of your components.",
    "",
    "ADVERSARIAL STEP (required before scoring)",
    "Challenge the thesis explicitly: is this merely temporary attention? what contradicts the narrative? is the token derivative? is social activity concentrated or manufactured? is the catalyst already priced in? is valuation already demanding? is holder/dev risk understated? what would make this obviously a bad thesis in hindsight?",
    "Report the strongest bear case honestly and set bearCaseSeverity to LOW, MODERATE, HIGH or CRITICAL. Never soften it to protect the score.",
    "",
    "INVALIDATION",
    "Give concrete, checkable invalidation conditions tied to structure, attention, holders, liquidity or narrative status. Never write 'price goes down'.",
    "",
    "OUTPUT: strict JSON only, matching this shape:",
    JSON.stringify(
      {
        components: Object.fromEntries(THESIS_COMPONENTS.map((c) => [c.key, 0])),
        oneSentenceThesis: "string",
        narrativeThesis: "string",
        sections: {
          thesis: "string",
          catalyst: "string",
          mindshare: "string",
          holdersDev: "string",
          valuation: "string",
        },
        strongestBullCase: "string",
        strongestBearCase: "string",
        bearCaseSeverity: "LOW|MODERATE|HIGH|CRITICAL",
        strongestCatalyst: "string|null (external trigger only)",
        catalystKind: "VERIFIED|PLAUSIBLE|NONE",
        whyNowMarketSignal: "string|null (market behaviour timing context)",
        strongestConcern: "string",
        catalysts: ["string"],
        invalidation: ["string"],
        evidenceGaps: ["string"],
        supportingClaimRefs: ["C1"],
        supportingSourceRefs: ["S1"],
        criticalUnresolvedIssues: 0,
      },
      null,
      0,
    ),
  ].join("\n");
}

export function buildThesisUserPrompt(input: ThesisPromptInput): string {
  return [
    `HEADER: ${JSON.stringify(input.header)}`,
    `CURRENT_OPERATIONAL_ELIGIBILITY: ${JSON.stringify(input.eligibility)}`,
    input.searchUnavailable
      ? "EXTERNAL_SEARCH_STATUS: UNAVAILABLE — absence of external sources is UNPROVEN, not a finding."
      : "EXTERNAL_SEARCH_STATUS: AVAILABLE",
    `TRIAGE_PROVENANCE: ${JSON.stringify(input.triage)}`,
    `RESEARCH_PACKET (structured scanner evidence, realized outcomes removed): ${JSON.stringify(input.packet)}`,
    `DEEP_RESEARCH_DOSSIER (external evidence; cite claims as C<n> and sources as S<n>): ${JSON.stringify(input.dossier)}`,
  ].join("\n\n");
}
