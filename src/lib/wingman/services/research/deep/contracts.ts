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

export const DEEP_RESEARCH_POLICY_VERSION = "deep_research/v1";
export const DEEP_RESEARCH_DOSSIER_VERSION = "deep_research_dossier/v1";
export const DEEP_RESEARCH_PROMPT_VERSION = "deep_research_prompt/v1";
export const DEEP_RESEARCH_SEARCH_VERSION = "deep_research_search/v1-keyless";

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

export type ReliabilityClass = "PRIMARY" | "SECONDARY" | "UNVERIFIED";
export type AttributionConfidence = "CONFIRMED" | "PROBABLE" | "UNRESOLVED";

export interface ResearchSource {
  /** Stable in-dossier reference the model must cite, e.g. "S1". */
  ref: string;
  url: string | null;
  title: string | null;
  account: string | null;
  sourceType: SourceType;
  reliabilityClass: ReliabilityClass;
  publishedAt: string | null;
  fetchedAt: string;
  relevance: string | null;
  /** True when the exact mint string was found on the source, or the source is an official token link. */
  mintVerified: boolean;
  attributionConfidence: AttributionConfidence;
  query: string | null;
  excerpt: string | null;
}

export interface ResearchClaim {
  domain: ResearchDomain;
  claim: string;
  claimType: string;
  status: ClaimStatus;
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
}

export interface ResearchDossier {
  dossierVersion: string;
  policyVersion: string;
  promptVersion: string;
  searchVersion: string;
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  generatedAt: string;
  oneSentenceNarrative: string | null;
  narrativeResolved: boolean;
  identityAttributionConfidence: AttributionConfidence;
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
    primarySourceCount: number;
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
  | "NO_SOURCES_FOUND";

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

/** Deterministic query plan. Never invents a different mint or symbol. */
export function buildQueryPlan(input: {
  mint: string;
  symbol: string | null;
  name: string | null;
}): string[] {
  const label = [input.symbol, input.name]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim())
    .filter((v, i, a) => a.indexOf(v) === i);
  const queries = [`"${input.mint}"`];
  if (label[0]) {
    queries.push(`"${label[0]}" solana ${input.mint}`);
    queries.push(`"${label[0]}" solana memecoin`);
    queries.push(`"${label[0]}" solana token twitter`);
  }
  if (label[1]) queries.push(`"${label[1]}" solana token`);
  queries.push(`${input.mint} solana rug OR scam OR warning`);
  return queries.filter((q, i, a) => a.indexOf(q) === i);
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
 * mint-verified source; otherwise the claim is demoted to INFERRED.
 */
export function validateModelOutput(
  raw: unknown,
  sources: ResearchSource[],
): ValidatedModelOutput {
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
    if (status === "VERIFIED" && !supporting.some((ref) => byRef.get(ref)?.mintVerified)) {
      issues.push({ code: "VERIFIED_DEMOTED_TO_INFERRED", detail: text.slice(0, 160) });
      status = "INFERRED";
      if (confidence === "HIGH") confidence = "MEDIUM";
    }
    if (status === "CONFLICTING" && contradicting.length === 0) {
      issues.push({ code: "CONFLICT_WITHOUT_COUNTER_SOURCE", detail: text.slice(0, 160) });
      status = "INFERRED";
    }

    claims.push({
      domain,
      claim: text,
      claimType: asString(c["claimType"]) ?? "OBSERVATION",
      status,
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
  return {
    coveredDomains: [...covered],
    unresolvedDomains: [...unresolved],
    coveragePct: Math.round((covered.length / RESEARCH_DOMAINS.length) * 100),
    sourceCount: sources.length,
    primarySourceCount: sources.filter((s) => s.reliabilityClass === "PRIMARY").length,
    sourceDomainDiversity: hosts.size,
    conflictingClaimCount: claims.filter((c) => c.status === "CONFLICTING").length,
  };
}

export function assembleDossier(input: {
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  generatedAt: string;
  identityAttributionConfidence: AttributionConfidence;
  sources: ResearchSource[];
  validated: ValidatedModelOutput;
}): ResearchDossier {
  const coverage = computeCoverage(input.validated.claims, input.sources);
  return {
    dossierVersion: DEEP_RESEARCH_DOSSIER_VERSION,
    policyVersion: DEEP_RESEARCH_POLICY_VERSION,
    promptVersion: DEEP_RESEARCH_PROMPT_VERSION,
    searchVersion: DEEP_RESEARCH_SEARCH_VERSION,
    mint: input.mint,
    chain: input.chain,
    symbol: input.symbol,
    name: input.name,
    generatedAt: input.generatedAt,
    oneSentenceNarrative: input.validated.oneSentenceNarrative,
    narrativeResolved: input.validated.narrativeResolved,
    identityAttributionConfidence: input.identityAttributionConfidence,
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
}): ResearchDossier {
  return assembleDossier({
    ...input,
    identityAttributionConfidence: "UNRESOLVED",
    sources: [],
    validated: {
      oneSentenceNarrative: null,
      narrativeResolved: false,
      domains: RESEARCH_DOMAINS.map((domain) => ({ domain, status: "UNRESOLVED", summary: null })),
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
      `[${s.ref}] type=${s.sourceType} reliability=${s.reliabilityClass} mintVerified=${s.mintVerified}`,
      `url: ${s.url ?? "n/a"}`,
      `title: ${s.title ?? "n/a"}`,
      `fetchedAt: ${s.fetchedAt}`,
      `content: ${s.excerpt ?? "(no readable content)"}`,
    ].join("\n"),
  );
  return [...header, ...(body.length ? body : ["(none)"])].join("\n\n");
}
