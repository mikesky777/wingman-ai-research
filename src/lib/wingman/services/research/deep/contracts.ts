/**
 * Deep Research v1 — pure contracts, budgets and validation.
 *
 * This module is deliberately free of I/O so every safety rule (source
 * grounding, attribution, claim status demotion, coverage accounting) is
 * unit-testable without a network or a model.
 *
 * Deep Research produces EVIDENCE ONLY. It never produces a Thesis Score,
 * an Entry State, position sizing, or any buy/sell recommendation.
 */

import {
  EXTERNAL_SEARCH_POLICY_VERSION,
  buildSearchVariants,
  countDistinctEvidenceOrigins,
  evidenceOriginOf,
  isOnChainMirror,
  type SourceIndependence,
} from "./external-search";

export const DEEP_RESEARCH_POLICY_VERSION = "deep_research/v1";
export const DEEP_RESEARCH_DOSSIER_VERSION = "deep_research_dossier/v1.1";
export const DEEP_RESEARCH_PROMPT_VERSION = "deep_research_prompt/v1.1";
/**
 * Evidence semantics of the dossier: source affiliation (incl. COMMUNITY),
 * on-chain mirror separation, distinct evidence origins, search health,
 * unresolved reasons and separated attribution confidences.
 */
export const DEEP_RESEARCH_EVIDENCE_SEMANTICS_VERSION = "deep_research_evidence/v1.1";
/** Which search infrastructure produced the evidence in a dossier. */
export const DEEP_RESEARCH_SEARCH_VERSION = `deep_research_search/v2-api(${EXTERNAL_SEARCH_POLICY_VERSION})`;

export const RESEARCH_DOMAINS = [
  "NARRATIVE_ORIGIN",
  "SOCIAL_PRESENCE",
  "COMMUNITY_ACTIVITY",
  "TEAM_CREATOR",
  "EXTERNAL_CATALYST",
  "RISK_FLAGS",
] as const;
export type ResearchDomain = (typeof RESEARCH_DOMAINS)[number];

export const CLAIM_STATUSES = [
  "VERIFIED",
  "INFERRED",
  "SPECULATIVE",
  "CONFLICTING",
  "UNAVAILABLE",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const SOURCE_TYPES = [
  "OFFICIAL_TOKEN_LINK",
  "SOCIAL",
  "NEWS_MEDIA",
  "DATA_AGGREGATOR",
  "FORUM",
  "UNKNOWN",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Source QUALITY. Deliberately separate from ownership/independence. */
export type ReliabilityClass = "PRIMARY" | "SECONDARY" | "UNVERIFIED";
export type AttributionConfidence = "CONFIRMED" | "STRONG" | "PROBABLE" | "WEAK" | "UNRESOLVED";

/** Health of the external search infrastructure that produced this dossier. */
export const SEARCH_HEALTH_STATUSES = ["READY", "DEGRADED", "SEARCH_UNAVAILABLE"] as const;
export type SearchHealthStatus = (typeof SEARCH_HEALTH_STATUSES)[number];

export interface DossierSearchHealth {
  status: SearchHealthStatus;
  provider: string | null;
  attempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  lastError: string | null;
}

/** Why a domain has no settled evidence. Absence ≠ tooling failure. */
export const UNRESOLVED_REASONS = [
  "NO_EVIDENCE_FOUND",
  "SEARCH_UNAVAILABLE",
  "PARTIAL_EVIDENCE",
  "NOT_RESEARCHED",
  "UNKNOWN",
] as const;
export type UnresolvedReason = (typeof UNRESOLVED_REASONS)[number];

export const CLAIM_PROVENANCES = [
  "PROJECT_CLAIM",
  /**
   * A credible primary/project source verifying something it is authoritative
   * for (e.g. that its own announcement exists). NOT outside corroboration.
   */
  "PRIMARY_SOURCE_VERIFIED",
  "COMMUNITY_REPORTED",
  "INDEPENDENTLY_CORROBORATED",
  "EXTERNAL_OBSERVATION",
  "INFERENCE",
  "SPECULATION",
] as const;
export type ClaimProvenance = (typeof CLAIM_PROVENANCES)[number];

export interface ResearchSource {
  /** Stable in-dossier reference the model must cite, e.g. "S1". */
  ref: string;
  url: string | null;
  title: string | null;
  account: string | null;
  sourceType: SourceType;
  reliabilityClass: ReliabilityClass;
  /** Ownership relative to the project. Independence is not the same as quality. */
  independence: SourceIndependence;
  publishedAt: string | null;
  fetchedAt: string;
  relevance: string | null;
  /** True when the exact mint string was found on the source, or the source is an official token link. */
  mintVerified: boolean;
  /** True when the source body was actually retrieved (not snippet-only). */
  contentFetched: boolean;
  attributionConfidence: AttributionConfidence;
  /** True when the source only reflects on-chain state (explorer, wallet, aggregator). */
  onChainMirror: boolean;
  /** Underlying origin key: many mirrors of the same fact share one origin. */
  evidenceOrigin: string;
  query: string | null;
  excerpt: string | null;
}

export interface ResearchClaim {
  domain: ResearchDomain;
  claim: string;
  claimType: string;
  status: ClaimStatus;
  /** Who is asserting this: the project, community, an independent source, or the model. */
  provenance: ClaimProvenance;
  confidence: Confidence;
  supportingSourceRefs: string[];
  contradictingSourceRefs: string[];
  observedAt: string | null;
  publishedAt: string | null;
}

export interface DomainSummary {
  domain: ResearchDomain;
  status: "COVERED" | "PARTIAL" | "UNRESOLVED";
  summary: string | null;
  /** Present for PARTIAL/UNRESOLVED domains; null when the domain is COVERED. */
  unresolvedReason: UnresolvedReason | null;
}

export interface ResearchDossier {
  dossierVersion: string;
  policyVersion: string;
  promptVersion: string;
  searchVersion: string;
  evidenceSemanticsVersion: string;
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  generatedAt: string;
  oneSentenceNarrative: string | null;
  narrativeResolved: boolean;
  /** Retained field name; equals `tokenIdentityConfidence`. */
  identityAttributionConfidence: AttributionConfidence;
  /** Confidence that sources refer to THIS exact mint. */
  tokenIdentityConfidence: AttributionConfidence;
  /**
   * Confidence that a creator/team/project claim is correctly attributed.
   * Never inherited from token identity, and never CONFIRMED when external
   * search was unavailable and no sufficient source verified attribution.
   */
  projectAttributionConfidence: AttributionConfidence;
  /** Search infrastructure health, carried on the report itself. */
  searchHealth: DossierSearchHealth;
  domains: DomainSummary[];
  claims: ResearchClaim[];
  sources: ResearchSource[];
  conflicts: string[];
  unresolvedQuestions: string[];
  evidenceGaps: ResearchDomain[];
  coverage: {
    coveredDomains: ResearchDomain[];
    unresolvedDomains: ResearchDomain[];
    coveragePct: number;
    sourceCount: number;
    /** Total retained sources, including mirrors and community posts. */
    rawSourceCount: number;
    primarySourceCount: number;
    /**
     * Sources that are provably not the project speaking and not community
     * chatter. Official links, launchpad pages, the project's own social
     * account and community posts are excluded: a dossier with zero
     * independent sources is uncorroborated, however high its coverage looks.
     */
    independentSourceCount: number;
    communitySourceCount: number;
    projectOwnedSourceCount: number;
    projectAffiliatedSourceCount: number;
    projectSourceCount: number;
    unknownIndependenceSourceCount: number;
    /** Sources that only reflect the same underlying chain state. */
    onChainMirrorCount: number;
    /** Genuinely distinct underlying evidence origins behind the sources. */
    distinctEvidenceOrigins: number;
    /**
     * Distinct evidence origins that are ALSO genuinely independent: project,
     * community and on-chain-mirror origins are excluded. Five explorers
     * showing the same chain state count once — and not as independence.
     */
    distinctIndependentEvidenceOrigins: number;
    /** Domains supported by at least one claim citing an independent source. */
    independentDomainsCovered: ResearchDomain[];
    corroboratedClaimCount: number;
    projectClaimCount: number;
    communityClaimCount: number;
    primarySourceVerifiedClaimCount: number;
    sourceDomainDiversity: number;
    conflictingClaimCount: number;
  };

}


export interface ResearchBudget {
  maxQueries: number;
  maxFetches: number;
  maxModelPasses: number;
  maxWallClockMs: number;
  maxSourceChars: number;
}

export const DEFAULT_RESEARCH_BUDGET: ResearchBudget = {
  maxQueries: 6,
  maxFetches: 8,
  maxModelPasses: 1,
  maxWallClockMs: 90_000,
  maxSourceChars: 4_000,
};

export type StopReason =
  | "BUDGET_QUERIES"
  | "BUDGET_FETCHES"
  | "BUDGET_TIME"
  | "SUFFICIENT_EVIDENCE"
  | "NO_MORE_QUERIES"
  | "NO_SOURCES_FOUND"
  /** Every external search attempt failed: absence of sources is unproven. */
  | "SEARCH_PROVIDER_UNAVAILABLE";

export interface SearchState {
  startedAt: number;
  queries: number;
  fetches: number;
  verifiedSources: number;
  coveredDomains: number;
  remainingQueries: number;
}

/**
 * Deterministic stopping rule. Research stops on budget exhaustion, when the
 * planned query list is finished, or once evidence is clearly sufficient.
 */
export function shouldStopSearch(
  state: SearchState,
  budget: ResearchBudget,
  now: number,
): StopReason | null {
  if (state.queries >= budget.maxQueries) return "BUDGET_QUERIES";
  if (state.fetches >= budget.maxFetches) return "BUDGET_FETCHES";
  if (now - state.startedAt >= budget.maxWallClockMs) return "BUDGET_TIME";
  if (state.verifiedSources >= 3 && state.coveredDomains >= 4) return "SUFFICIENT_EVIDENCE";
  if (state.remainingQueries <= 0) return "NO_MORE_QUERIES";
  return null;
}

/**
 * Deterministic, identity-safe query plan. Every discovery query is anchored
 * to the exact mint or to an official account/domain — never a bare ticker.
 */
export function buildQueryPlan(input: {
  mint: string;
  symbol: string | null;
  name: string | null;
  officialUrls?: string[];
}): string[] {
  return buildSearchVariants({
    mint: input.mint,
    symbol: input.symbol,
    name: input.name,
    officialUrls: input.officialUrls ?? [],
    identityEstablished: false,
  }).map((v) => v.query);
}

const RELIABILITY_BY_TYPE: Record<SourceType, ReliabilityClass> = {
  OFFICIAL_TOKEN_LINK: "PRIMARY",
  SOCIAL: "SECONDARY",
  NEWS_MEDIA: "SECONDARY",
  DATA_AGGREGATOR: "SECONDARY",
  FORUM: "UNVERIFIED",
  UNKNOWN: "UNVERIFIED",
};

export function classifyReliability(type: SourceType, mintVerified: boolean): ReliabilityClass {
  const base = RELIABILITY_BY_TYPE[type];
  if (base === "PRIMARY") return "PRIMARY";
  return mintVerified ? base : "UNVERIFIED";
}

export function classifySourceType(url: string): SourceType {
  const host = safeHost(url);
  if (!host) return "UNKNOWN";
  if (/(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)t\.me$|telegram|(^|\.)discord/.test(host)) {
    return "SOCIAL";
  }
  if (/dexscreener|birdeye|coingecko|coinmarketcap|solscan|dextools|rugcheck|gmgn|pump\.fun/.test(host)) {
    return "DATA_AGGREGATOR";
  }
  if (/reddit|medium|substack|stackexchange|4chan/.test(host)) return "FORUM";
  if (/news|coindesk|cointelegraph|decrypt|blockworks|theblock|beincrypto|crypto/.test(host)) {
    return "NEWS_MEDIA";
  }
  return "UNKNOWN";
}

export function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export interface ValidationIssue {
  code: string;
  detail: string;
}

export interface ValidatedModelOutput {
  oneSentenceNarrative: string | null;
  narrativeResolved: boolean;
  domains: DomainSummary[];
  claims: ResearchClaim[];
  conflicts: string[];
  unresolvedQuestions: string[];
  issues: ValidationIssue[];
}

const BANNED_ADVICE = /\b(buy|sell|long|short|ape|entry|exit|take profit|stop loss|position size|allocat\w*|target price|price target)\b/i;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter((v): v is string => Boolean(v));
}

/**
 * Strict validation of raw model output.
 *
 * Every claim must be grounded in a known source reference. Unsupported
 * claims are DROPPED, never softened into narrative. VERIFIED requires a
 * mint-verified source; otherwise the claim is demoted to INFERRED. Community
 * lore alone can never reach VERIFIED.
 */
export function validateModelOutput(
  raw: unknown,
  sources: ResearchSource[],
  options: { searchHealth?: SearchHealthStatus; researched?: boolean } = {},
): ValidatedModelOutput {
  const searchHealth: SearchHealthStatus = options.searchHealth ?? "READY";
  const researched = options.researched !== false;
  const issues: ValidationIssue[] = [];
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const rawClaims = Array.isArray(obj["claims"]) ? (obj["claims"] as unknown[]) : [];
  const claims: ResearchClaim[] = [];

  for (const entry of rawClaims) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    const domain = asString(c["domain"])?.toUpperCase() as ResearchDomain | undefined;
    const text = asString(c["claim"]);
    if (!domain || !RESEARCH_DOMAINS.includes(domain) || !text) {
      issues.push({ code: "CLAIM_MALFORMED", detail: String(asString(c["claim"]) ?? "") });
      continue;
    }
    if (BANNED_ADVICE.test(text)) {
      issues.push({ code: "CLAIM_CONTAINS_ADVICE", detail: text.slice(0, 160) });
      continue;
    }

    let status = (asString(c["status"])?.toUpperCase() ?? "SPECULATIVE") as ClaimStatus;
    if (!CLAIM_STATUSES.includes(status)) status = "SPECULATIVE";
    let confidence = (asString(c["confidence"])?.toUpperCase() ?? "LOW") as Confidence;
    if (!CONFIDENCES.includes(confidence)) confidence = "LOW";

    const supporting = asStringArray(c["supportingSourceRefs"]).filter((ref) => {
      const known = byRef.has(ref);
      if (!known) issues.push({ code: "UNKNOWN_SOURCE_REF", detail: ref });
      return known;
    });
    const contradicting = asStringArray(c["contradictingSourceRefs"]).filter((ref) =>
      byRef.has(ref),
    );

    if (status !== "UNAVAILABLE" && supporting.length === 0) {
      issues.push({ code: "UNGROUNDED_CLAIM_DROPPED", detail: text.slice(0, 160) });
      continue;
    }
    // VERIFIED demands a mint-verified source whose CONTENT was actually
    // retrieved. A search snippet alone can never verify a claim.
    if (
      status === "VERIFIED" &&
      !supporting.some((ref) => {
        const source = byRef.get(ref);
        return Boolean(source?.mintVerified && source?.contentFetched);
      })
    ) {
      issues.push({ code: "VERIFIED_DEMOTED_TO_INFERRED", detail: text.slice(0, 160) });
      status = "INFERRED";
      if (confidence === "HIGH") confidence = "MEDIUM";
    }
    if (status === "CONFLICTING" && contradicting.length === 0) {
      issues.push({ code: "CONFLICT_WITHOUT_COUNTER_SOURCE", detail: text.slice(0, 160) });
      status = "INFERRED";
    }
    // Community lore is real evidence of chatter, never a verified fact. A
    // VERIFIED claim needs at least one independent or primary source.
    if (status === "VERIFIED") {
      const supportingSources = supporting
        .map((ref) => byRef.get(ref))
        .filter((s): s is ResearchSource => Boolean(s));
      const sufficient = supportingSources.some(
        (s) => s.independence === "INDEPENDENT" || s.reliabilityClass === "PRIMARY",
      );
      if (!sufficient) {
        issues.push({ code: "COMMUNITY_LORE_NOT_VERIFIED", detail: text.slice(0, 160) });
        status = "INFERRED";
        if (confidence === "HIGH") confidence = "MEDIUM";
      }
    }


    claims.push({
      domain,
      claim: text,
      claimType: asString(c["claimType"]) ?? "OBSERVATION",
      status,
      provenance: deriveClaimProvenance(status, supporting, byRef),
      confidence,
      supportingSourceRefs: supporting,
      contradictingSourceRefs: contradicting,
      observedAt: asString(c["observedAt"]),
      publishedAt: asString(c["publishedAt"]),
    });
  }

  const rawDomains = Array.isArray(obj["domains"]) ? (obj["domains"] as unknown[]) : [];
  const summaryByDomain = new Map<ResearchDomain, string | null>();
  for (const entry of rawDomains) {
    if (!entry || typeof entry !== "object") continue;
    const d = entry as Record<string, unknown>;
    const domain = asString(d["domain"])?.toUpperCase() as ResearchDomain | undefined;
    if (!domain || !RESEARCH_DOMAINS.includes(domain)) continue;
    const summary = asString(d["summary"]);
    if (summary && BANNED_ADVICE.test(summary)) {
      issues.push({ code: "SUMMARY_CONTAINS_ADVICE", detail: domain });
      continue;
    }
    summaryByDomain.set(domain, summary);
  }

  const domains: DomainSummary[] = RESEARCH_DOMAINS.map((domain) => {
    const domainClaims = claims.filter((c) => c.domain === domain);
    const grounded = domainClaims.filter((c) => c.status !== "UNAVAILABLE");
    const status: DomainSummary["status"] =
      grounded.length === 0 ? "UNRESOLVED" : grounded.length === 1 ? "PARTIAL" : "COVERED";
    return {
      domain,
      status,
      summary: status === "UNRESOLVED" ? null : (summaryByDomain.get(domain) ?? null),
      unresolvedReason: deriveUnresolvedReason({
        status,
        searchHealth,
        researched,
        hasAnyClaim: domainClaims.length > 0,
      }),
    };
  });


  let narrative = asString(obj["oneSentenceNarrative"]);
  if (narrative && BANNED_ADVICE.test(narrative)) {
    issues.push({ code: "NARRATIVE_CONTAINS_ADVICE", detail: narrative.slice(0, 160) });
    narrative = null;
  }
  const narrativeGrounded = claims.some(
    (c) => c.domain === "NARRATIVE_ORIGIN" && (c.status === "VERIFIED" || c.status === "INFERRED"),
  );
  if (narrative && !narrativeGrounded) {
    issues.push({ code: "NARRATIVE_UNGROUNDED", detail: narrative.slice(0, 160) });
    narrative = null;
  }

  return {
    oneSentenceNarrative: narrative,
    narrativeResolved: Boolean(narrative) && narrativeGrounded,
    domains,
    claims,
    conflicts: asStringArray(obj["conflicts"]),
    unresolvedQuestions: asStringArray(obj["unresolvedQuestions"]),
    issues,
  };
}

/**
 * Why a domain did not settle. Absence of evidence is never conflated with a
 * tooling failure, and a partially covered domain is labelled as such.
 */
export function deriveUnresolvedReason(input: {
  status: DomainSummary["status"];
  searchHealth: SearchHealthStatus;
  researched: boolean;
  hasAnyClaim: boolean;
}): UnresolvedReason | null {
  if (input.status === "COVERED") return null;
  if (input.status === "PARTIAL") return "PARTIAL_EVIDENCE";
  if (!input.researched) return "NOT_RESEARCHED";
  if (input.searchHealth === "SEARCH_UNAVAILABLE") return "SEARCH_UNAVAILABLE";
  if (input.searchHealth === "DEGRADED" && !input.hasAnyClaim) return "SEARCH_UNAVAILABLE";
  return "NO_EVIDENCE_FOUND";
}

/**
 * Deterministic provenance: separates what the PROJECT says about itself, what
 * the COMMUNITY reports, and what independent sources observed. A project-owned
 * source can never make a claim "independently corroborated"; a credible
 * primary source verifying its own announcement is PRIMARY_SOURCE_VERIFIED.
 */
export function deriveClaimProvenance(
  status: ClaimStatus,
  supportingRefs: string[],
  byRef: Map<string, ResearchSource>,
): ClaimProvenance {
  if (status === "SPECULATIVE") return "SPECULATION";
  const supporting = supportingRefs
    .map((ref) => byRef.get(ref))
    .filter((s): s is ResearchSource => Boolean(s));
  const hasIndependent = supporting.some((s) => s.independence === "INDEPENDENT");
  const hasCommunity = supporting.some((s) => s.independence === "COMMUNITY");
  const projectSources = supporting.filter(
    (s) => s.independence === "PROJECT_OWNED" || s.independence === "PROJECT_AFFILIATED",
  );
  if (hasIndependent) {
    return status === "VERIFIED" ? "INDEPENDENTLY_CORROBORATED" : "EXTERNAL_OBSERVATION";
  }
  if (projectSources.length > 0) {
    if (status === "INFERRED") return "INFERENCE";
    // A primary project source is authoritative for its own statement only.
    if (status === "VERIFIED" && projectSources.some((s) => s.reliabilityClass === "PRIMARY")) {
      return "PRIMARY_SOURCE_VERIFIED";
    }
    return "PROJECT_CLAIM";
  }
  if (hasCommunity) return status === "INFERRED" ? "INFERENCE" : "COMMUNITY_REPORTED";
  return "INFERENCE";
}

/** Coverage accounting derived only from validated claims and sources. */
export function computeCoverage(
  claims: ResearchClaim[],
  sources: ResearchSource[],
): ResearchDossier["coverage"] {
  const covered = RESEARCH_DOMAINS.filter((domain) =>
    claims.some((c) => c.domain === domain && c.status !== "UNAVAILABLE"),
  );
  const unresolved = RESEARCH_DOMAINS.filter((d) => !covered.includes(d));
  const hosts = new Set(
    sources.map((s) => (s.url ? safeHost(s.url) : null)).filter((h): h is string => Boolean(h)),
  );
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const countBy = (independence: SourceIndependence) =>
    sources.filter((s) => s.independence === independence).length;
  const independentDomains = RESEARCH_DOMAINS.filter((domain) =>
    claims.some(
      (c) =>
        c.domain === domain &&
        c.status !== "UNAVAILABLE" &&
        c.supportingSourceRefs.some((ref) => byRef.get(ref)?.independence === "INDEPENDENT"),
    ),
  );
  const projectOwned = countBy("PROJECT_OWNED");
  const projectAffiliated = countBy("PROJECT_AFFILIATED");
  return {
    coveredDomains: [...covered],
    unresolvedDomains: [...unresolved],
    coveragePct: Math.round((covered.length / RESEARCH_DOMAINS.length) * 100),
    sourceCount: sources.length,
    rawSourceCount: sources.length,
    primarySourceCount: sources.filter((s) => s.reliabilityClass === "PRIMARY").length,
    independentSourceCount: countBy("INDEPENDENT"),
    communitySourceCount: countBy("COMMUNITY"),
    projectOwnedSourceCount: projectOwned,
    projectAffiliatedSourceCount: projectAffiliated,
    projectSourceCount: projectOwned + projectAffiliated,
    unknownIndependenceSourceCount: countBy("UNKNOWN"),
    onChainMirrorCount: sources.filter((s) => s.onChainMirror || isOnChainMirror(s.url)).length,
    distinctEvidenceOrigins: countDistinctEvidenceOrigins(sources.map((s) => s.url)),
    distinctIndependentEvidenceOrigins: countDistinctEvidenceOrigins(
      sources
        .filter(
          (s) =>
            s.independence === "INDEPENDENT" && !(s.onChainMirror || isOnChainMirror(s.url)),
        )
        .map((s) => s.url),
    ),
    independentDomainsCovered: [...independentDomains],
    corroboratedClaimCount: claims.filter((c) => c.provenance === "INDEPENDENTLY_CORROBORATED")
      .length,
    projectClaimCount: claims.filter((c) => c.provenance === "PROJECT_CLAIM").length,
    communityClaimCount: claims.filter((c) => c.provenance === "COMMUNITY_REPORTED").length,
    primarySourceVerifiedClaimCount: claims.filter(
      (c) => c.provenance === "PRIMARY_SOURCE_VERIFIED",
    ).length,
    sourceDomainDiversity: hosts.size,
    conflictingClaimCount: claims.filter((c) => c.status === "CONFLICTING").length,
  };
}

/** Fills the evidence-origin fields of a source from its URL. */
export function withEvidenceOrigin(
  source: Omit<ResearchSource, "onChainMirror" | "evidenceOrigin">,
): ResearchSource {
  return {
    ...source,
    onChainMirror: isOnChainMirror(source.url),
    evidenceOrigin: evidenceOriginOf(source.url),
  };
}

export const UNKNOWN_SEARCH_HEALTH: DossierSearchHealth = {
  status: "READY",
  provider: null,
  attempts: 0,
  successfulAttempts: 0,
  failedAttempts: 0,
  lastError: null,
};

/**
 * Project/creator attribution confidence, derived SEPARATELY from token
 * identity. Confirming the mint never confirms who is behind the project, and
 * a failed search can never leave attribution CONFIRMED.
 */
export function deriveProjectAttributionConfidence(input: {
  sources: ResearchSource[];
  claims: ResearchClaim[];
  searchHealth: SearchHealthStatus;
}): AttributionConfidence {
  const byRef = new Map(input.sources.map((s) => [s.ref, s]));
  const attributionClaims = input.claims.filter(
    (c) => c.domain === "TEAM_CREATOR" && c.status !== "UNAVAILABLE",
  );
  if (attributionClaims.length === 0) return "UNRESOLVED";

  const supporting = attributionClaims
    .flatMap((c) => c.supportingSourceRefs)
    .map((ref) => byRef.get(ref))
    .filter((s): s is ResearchSource => Boolean(s));
  const independentVerified = supporting.some(
    (s) => s.independence === "INDEPENDENT" && s.mintVerified && s.contentFetched,
  );
  const primaryVerified = supporting.some(
    (s) => s.reliabilityClass === "PRIMARY" && s.contentFetched,
  );

  if (input.searchHealth === "SEARCH_UNAVAILABLE") {
    // Nothing outside the project could be reached: never CONFIRMED.
    return primaryVerified ? "PROBABLE" : "WEAK";
  }
  if (independentVerified && primaryVerified) return "CONFIRMED";
  if (independentVerified) return "STRONG";
  if (primaryVerified) return "PROBABLE";
  return "WEAK";
}

export function assembleDossier(input: {
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  generatedAt: string;
  identityAttributionConfidence: AttributionConfidence;
  searchHealth?: DossierSearchHealth;
  sources: ResearchSource[];
  validated: ValidatedModelOutput;
}): ResearchDossier {
  const coverage = computeCoverage(input.validated.claims, input.sources);
  const searchHealth = input.searchHealth ?? UNKNOWN_SEARCH_HEALTH;
  return {
    dossierVersion: DEEP_RESEARCH_DOSSIER_VERSION,
    policyVersion: DEEP_RESEARCH_POLICY_VERSION,
    promptVersion: DEEP_RESEARCH_PROMPT_VERSION,
    searchVersion: DEEP_RESEARCH_SEARCH_VERSION,
    evidenceSemanticsVersion: DEEP_RESEARCH_EVIDENCE_SEMANTICS_VERSION,
    mint: input.mint,
    chain: input.chain,
    symbol: input.symbol,
    name: input.name,
    generatedAt: input.generatedAt,
    oneSentenceNarrative: input.validated.oneSentenceNarrative,
    narrativeResolved: input.validated.narrativeResolved,
    identityAttributionConfidence: input.identityAttributionConfidence,
    tokenIdentityConfidence: input.identityAttributionConfidence,
    projectAttributionConfidence: deriveProjectAttributionConfidence({
      sources: input.sources,
      claims: input.validated.claims,
      searchHealth: searchHealth.status,
    }),
    searchHealth,
    domains: input.validated.domains,
    claims: input.validated.claims,
    sources: input.sources,
    conflicts: input.validated.conflicts,
    unresolvedQuestions: input.validated.unresolvedQuestions,
    evidenceGaps: coverage.unresolvedDomains,
    coverage,
  };
}


/** Empty, explicitly source-grounded dossier for a candidate with no usable sources. */
export function emptyDossier(input: {
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  generatedAt: string;
  searchHealth?: DossierSearchHealth;
}): ResearchDossier {
  const health = input.searchHealth ?? UNKNOWN_SEARCH_HEALTH;
  return assembleDossier({
    ...input,
    identityAttributionConfidence: "UNRESOLVED",
    searchHealth: health,
    sources: [],
    validated: {
      oneSentenceNarrative: null,
      narrativeResolved: false,
      domains: RESEARCH_DOMAINS.map((domain) => ({
        domain,
        status: "UNRESOLVED" as const,
        summary: null,
        unresolvedReason: deriveUnresolvedReason({
          status: "UNRESOLVED",
          searchHealth: health.status,
          researched: true,
          hasAnyClaim: false,
        }),
      })),
      claims: [],
      conflicts: [],
      unresolvedQuestions: ["No external sources could be attributed to this exact mint."],
      issues: [],
    },
  });
}

export function buildSystemPrompt(): string {
  return [
    "You are Wingman's deep research analyst for Solana tokens.",
    "You produce EVIDENCE ONLY. You never produce a thesis score, entry state, position size, price target, or any buy/sell recommendation.",
    "",
    "Absolute rules:",
    "1. Every claim must cite at least one supplied source reference (S1, S2, ...). Never cite a reference that was not supplied.",
    "2. Never state anything the supplied sources do not contain. If evidence is missing, emit a claim with status UNAVAILABLE, or leave the domain empty.",
    "3. Missing evidence is NOT negative evidence. Say it is unknown.",
    "4. Only use status VERIFIED when the source is explicitly tied to the exact mint address supplied.",
    "5. If two sources disagree, emit a CONFLICTING claim citing both sides.",
    "6. No trading language of any kind.",
    "7. COMMUNITY sources (social posts, forums, chats) report chatter and lore. Community lore alone is never VERIFIED — use INFERRED or SPECULATIVE.",
    "8. A project's own source can only verify what it is authoritative for (that its own statement exists). It never corroborates the statement's truth.",
    "9. Explorers, wallets, aggregators and DEX data sites all mirror the SAME on-chain state. Several of them agreeing is ONE piece of evidence, not several.",
    "",
    `Domains: ${RESEARCH_DOMAINS.join(", ")}.`,
    `Claim status values: ${CLAIM_STATUSES.join(", ")}. Confidence: ${CONFIDENCES.join(", ")}.`,
    "",
    "Return STRICT JSON only:",
    "{",
    '  "oneSentenceNarrative": string | null,',
    '  "domains": [{ "domain": string, "summary": string | null }],',
    '  "claims": [{ "domain": string, "claim": string, "claimType": string, "status": string, "confidence": string, "supportingSourceRefs": string[], "contradictingSourceRefs": string[], "observedAt": string | null, "publishedAt": string | null }],',
    '  "conflicts": string[],',
    '  "unresolvedQuestions": string[]',
    "}",
  ].join("\n");
}


export function buildUserPrompt(input: {
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  requestedDomains: string[];
  triageQuestions: string[];
  sources: ResearchSource[];
}): string {
  const header = [
    `MINT (exact): ${input.mint}`,
    `CHAIN: ${input.chain}`,
    `SYMBOL: ${input.symbol ?? "unknown"}`,
    `NAME: ${input.name ?? "unknown"}`,
    input.requestedDomains.length
      ? `TRIAGE REQUESTED DOMAINS: ${input.requestedDomains.join(", ")}`
      : "TRIAGE REQUESTED DOMAINS: none",
    input.triageQuestions.length
      ? `TRIAGE OPEN QUESTIONS: ${input.triageQuestions.join(" | ")}`
      : "TRIAGE OPEN QUESTIONS: none",
    "",
    "SOURCES:",
  ];
  const body = input.sources.map((s) =>
    [
      `[${s.ref}] type=${s.sourceType} reliability=${s.reliabilityClass} affiliation=${s.independence} onChainMirror=${s.onChainMirror} mintVerified=${s.mintVerified}`,
      `url: ${s.url ?? "n/a"}`,
      `title: ${s.title ?? "n/a"}`,
      `fetchedAt: ${s.fetchedAt}`,
      `content: ${s.excerpt ?? "(no readable content)"}`,
    ].join("\n"),
  );
  return [...header, ...(body.length ? body : ["(none)"])].join("\n\n");
}
