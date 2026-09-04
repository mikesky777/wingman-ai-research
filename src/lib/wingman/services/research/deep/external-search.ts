/**
 * External search policy — pure, vendor-neutral, independently versioned.
 *
 * Deep Research policy says WHAT evidence is acceptable. This module says how
 * the outside world is queried, how a search attempt is classified, and how a
 * retrieved source is judged for ownership/independence. It is versioned
 * separately from Deep Research so a vendor swap never rewrites research policy.
 *
 * Hard rule encoded here: a bot/challenge/interstitial response is a PROVIDER
 * FAILURE. It can never become "the provider answered and found nothing".
 */

export const EXTERNAL_SEARCH_POLICY_VERSION = "external_search/v1";

/** Every search attempt terminates in exactly one of these outcomes. */
export const SEARCH_OUTCOMES = [
  "SUCCESS_WITH_RESULTS",
  "SUCCESS_NO_RESULTS",
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "AUTH_FAILED",
  "BOT_OR_CHALLENGE_RESPONSE",
  "TIMEOUT",
  "FAILED",
] as const;
export type SearchOutcome = (typeof SEARCH_OUTCOMES)[number];

export function isSearchSuccess(outcome: SearchOutcome): boolean {
  return outcome === "SUCCESS_WITH_RESULTS" || outcome === "SUCCESS_NO_RESULTS";
}

export interface ExternalSearchResult {
  query: string;
  provider: string;
  title: string | null;
  url: string;
  snippet: string | null;
  /** Publication or index time when the provider supplies one. */
  publishedAt: string | null;
  rank: number;
  fetchedAt: string;
}

export interface ExternalSearchResponse {
  query: string;
  provider: string;
  policyVersion: string;
  outcome: SearchOutcome;
  results: ExternalSearchResult[];
  rawResultCount: number;
  error: string | null;
  latencyMs: number;
  attemptedAt: string;
}

/** HTTP status → outcome. Never returns a SUCCESS_* value. */
export function classifyHttpFailure(status: number): SearchOutcome {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 402) return "PROVIDER_UNAVAILABLE";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "FAILED";
}

const CHALLENGE_MARKERS = [
  "are you a robot",
  "unusual traffic",
  "automated traffic",
  "automated queries",
  "verify you are human",
  "verifying you are human",
  "human verification",
  "captcha",
  "recaptcha",
  "hcaptcha",
  "cf-challenge",
  "checking your browser",
  "access denied",
  "request blocked",
  "enable javascript and cookies to continue",
  "ddos protection",
];

/** Detects bot walls, captchas and generic interstitials in a raw response body. */
export function looksLikeChallenge(body: string): boolean {
  if (!body) return false;
  const text = body.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => text.includes(marker));
}

/** Canonical form used for deduplication: mirrors and tracking noise collapse. */
export function canonicalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    let host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (host === "mobile.twitter.com" || host === "twitter.com" || host === "nitter.net") host = "x.com";
    if (host === "amp.reddit.com" || host === "old.reddit.com" || host === "np.reddit.com") {
      host = "reddit.com";
    }
    let path = url.pathname.replace(/\/amp\/?$/, "/").replace(/\/+$/, "");
    if (!path) path = "/";
    const keep = [...url.searchParams.entries()]
      .filter(([k]) => !/^(utm_|ref$|ref_|fbclid|gclid|igshid|si$|s$|t$)/i.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = keep.map(([k, v]) => `${k}=${v}`).join("&");
    return `https://${host}${path}${qs ? `?${qs}` : ""}`;
  } catch {
    return null;
  }
}

/** Drops duplicate URLs and mirrors, keeping the best-ranked copy of each source. */
export function dedupeResults(results: ExternalSearchResult[]): ExternalSearchResult[] {
  const byCanonical = new Map<string, ExternalSearchResult>();
  for (const result of results) {
    const key = canonicalizeUrl(result.url) ?? result.url;
    const existing = byCanonical.get(key);
    if (!existing || result.rank < existing.rank) byCanonical.set(key, result);
  }
  return [...byCanonical.values()];
}

/* ------------------------------------------------------------------ */
/* Ownership / independence                                            */
/* ------------------------------------------------------------------ */

export const SOURCE_INDEPENDENCE = [
  "PROJECT_OWNED",
  "PROJECT_AFFILIATED",
  "INDEPENDENT",
  "UNKNOWN",
] as const;
export type SourceIndependence = (typeof SOURCE_INDEPENDENCE)[number];

/** Launch platforms and project-controlled listing pages: content is project-supplied. */
const AFFILIATED_HOSTS = /(^|\.)(pump\.fun|bonk\.fun|letsbonk\.fun|moonshot\.money|dexscreener\.com|dextools\.io)$/;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Social handle/path identity, e.g. x.com/foo/status/1 → x.com|foo. */
function socialIdentity(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean);
    if (/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(host)) {
      const handle = path[0]?.toLowerCase();
      if (!handle || handle === "i" || handle === "search") return null;
      return `x.com|${handle}`;
    }
    if (/(^|\.)t\.me$/.test(host)) return path[0] ? `t.me|${path[0].toLowerCase()}` : null;
    return null;
  } catch {
    return null;
  }
}

/**
 * A source is only INDEPENDENT when it is provably not the project speaking.
 * A different domain alone proves nothing — launchpad pages and reposts of the
 * project's own account stay project-side.
 */
export function classifyIndependence(input: {
  url: string | null;
  officialUrls: string[];
}): SourceIndependence {
  if (!input.url) return "UNKNOWN";
  const host = hostOf(input.url);
  if (!host) return "UNKNOWN";

  const officialHosts = new Set<string>();
  const officialIdentities = new Set<string>();
  for (const official of input.officialUrls) {
    const oHost = hostOf(official);
    if (oHost) officialHosts.add(oHost);
    const identity = socialIdentity(official);
    if (identity) officialIdentities.add(identity);
  }

  const identity = socialIdentity(input.url);
  if (identity && officialIdentities.has(identity)) return "PROJECT_OWNED";
  if (officialHosts.has(host)) {
    // Same social platform but a different account is not the project itself.
    if (identity && !officialIdentities.has(identity)) return "INDEPENDENT";
    return "PROJECT_OWNED";
  }
  if (AFFILIATED_HOSTS.test(host)) return "PROJECT_AFFILIATED";
  return "INDEPENDENT";
}

/* ------------------------------------------------------------------ */
/* Query strategy                                                      */
/* ------------------------------------------------------------------ */

export interface SearchVariant {
  query: string;
  purpose:
    | "EXACT_MINT"
    | "NAME_PLUS_MINT"
    | "SYMBOL_PLUS_MINT"
    | "OFFICIAL_ACCOUNT"
    | "OFFICIAL_DOMAIN"
    | "NARRATIVE"
    | "RISK";
}

/**
 * Identity-safe query plan. Tickers collide, so every discovery query is
 * anchored to the exact mint, an official account, or an official domain.
 * Narrative queries only run once identity has been established.
 */
export function buildSearchVariants(input: {
  mint: string;
  symbol: string | null;
  name: string | null;
  officialUrls: string[];
  identityEstablished: boolean;
  narrativeTerms?: string[];
}): SearchVariant[] {
  const clean = (v: string | null) => (v && v.trim() ? v.trim().replace(/^\$/, "") : null);
  const symbol = clean(input.symbol);
  const name = clean(input.name);
  const variants: SearchVariant[] = [{ query: `"${input.mint}"`, purpose: "EXACT_MINT" }];

  if (name) variants.push({ query: `"${name}" "${input.mint}"`, purpose: "NAME_PLUS_MINT" });
  if (symbol && symbol !== name) {
    variants.push({ query: `"${symbol}" solana "${input.mint}"`, purpose: "SYMBOL_PLUS_MINT" });
  }

  for (const official of input.officialUrls.slice(0, 3)) {
    const identity = socialIdentity(official);
    if (identity) {
      const handle = identity.split("|")[1];
      if (handle) variants.push({ query: `"${handle}" solana token`, purpose: "OFFICIAL_ACCOUNT" });
      continue;
    }
    const host = hostOf(official);
    if (host) variants.push({ query: `"${host}" solana token`, purpose: "OFFICIAL_DOMAIN" });
  }

  if (input.identityEstablished) {
    for (const term of input.narrativeTerms ?? []) {
      if (term.trim()) variants.push({ query: `"${term.trim()}" solana meme coin`, purpose: "NARRATIVE" });
    }
  }

  variants.push({ query: `"${input.mint}" scam OR rug OR warning`, purpose: "RISK" });

  const seen = new Set<string>();
  return variants.filter((v) => {
    const key = v.query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
