import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESEARCH_BUDGET,
  RESEARCH_DOMAINS,
  assembleDossier,
  buildQueryPlan,
  buildSystemPrompt,
  buildUserPrompt,
  classifyReliability,
  classifySourceType,
  computeCoverage,
  emptyDossier,
  shouldStopSearch,
  validateModelOutput,
  type ResearchSource,
} from "./contracts";
import { mentionsMint, mentionsSymbol } from "./identity.server";

const MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";

function source(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    ref: "S1",
    url: "https://example.com/a",
    title: "A",
    account: null,
    sourceType: "NEWS_MEDIA",
    reliabilityClass: "SECONDARY",
    publishedAt: null,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    relevance: null,
    mintVerified: true,
    attributionConfidence: "CONFIRMED",
    query: null,
    excerpt: "text",
    ...overrides,
  };
}

describe("exact-mint identity", () => {
  it("matches the exact mint string case-sensitively", () => {
    expect(mentionsMint(`token ${MINT} listed`, MINT)).toBe(true);
    expect(mentionsMint(MINT.toLowerCase(), MINT)).toBe(false);
    expect(mentionsMint("no address here", MINT)).toBe(false);
  });

  it("treats a ticker match as weaker evidence and ignores tiny tickers", () => {
    expect(mentionsSymbol("the $WING community", "WING")).toBe(true);
    expect(mentionsSymbol("ab cd", "AB")).toBe(false);
  });
});

describe("query plan", () => {
  it("always searches the exact mint first and never invents another address", () => {
    const plan = buildQueryPlan({ mint: MINT, symbol: "WING", name: "Wingman" });
    expect(plan[0]).toBe(`"${MINT}"`);
    expect(plan.every((q) => !/[1-9A-HJ-NP-Za-km-z]{32,44}/.test(q) || q.includes(MINT))).toBe(true);
    expect(new Set(plan).size).toBe(plan.length);
  });
});

describe("stopping rules", () => {
  const base = { startedAt: 0, queries: 0, fetches: 0, verifiedSources: 0, coveredDomains: 0, remainingQueries: 5 };

  it("stops on query, fetch and time budgets", () => {
    expect(shouldStopSearch({ ...base, queries: 6 }, DEFAULT_RESEARCH_BUDGET, 0)).toBe("BUDGET_QUERIES");
    expect(shouldStopSearch({ ...base, fetches: 8 }, DEFAULT_RESEARCH_BUDGET, 0)).toBe("BUDGET_FETCHES");
    expect(shouldStopSearch(base, DEFAULT_RESEARCH_BUDGET, 90_001)).toBe("BUDGET_TIME");
  });

  it("stops early only when evidence is genuinely sufficient", () => {
    expect(shouldStopSearch({ ...base, verifiedSources: 3, coveredDomains: 4 }, DEFAULT_RESEARCH_BUDGET, 0)).toBe(
      "SUFFICIENT_EVIDENCE",
    );
    expect(shouldStopSearch({ ...base, verifiedSources: 3, coveredDomains: 1 }, DEFAULT_RESEARCH_BUDGET, 0)).toBeNull();
  });
});

describe("source classification", () => {
  it("classifies types and never promotes an unverified source above UNVERIFIED", () => {
    expect(classifySourceType("https://x.com/someone/status/1")).toBe("SOCIAL");
    expect(classifySourceType("https://dexscreener.com/solana/abc")).toBe("DATA_AGGREGATOR");
    expect(classifyReliability("SOCIAL", false)).toBe("UNVERIFIED");
    expect(classifyReliability("SOCIAL", true)).toBe("SECONDARY");
    expect(classifyReliability("OFFICIAL_TOKEN_LINK", false)).toBe("PRIMARY");
  });
});

describe("model output validation", () => {
  it("drops claims that cite no known source", () => {
    const out = validateModelOutput(
      {
        claims: [
          { domain: "NARRATIVE_ORIGIN", claim: "Started as a joke", status: "INFERRED", confidence: "MEDIUM", supportingSourceRefs: [] },
          { domain: "SOCIAL_PRESENCE", claim: "Has an X account", status: "INFERRED", confidence: "MEDIUM", supportingSourceRefs: ["S9"] },
        ],
      },
      [source()],
    );
    expect(out.claims).toHaveLength(0);
    expect(out.issues.map((i) => i.code)).toContain("UNGROUNDED_CLAIM_DROPPED");
    expect(out.issues.map((i) => i.code)).toContain("UNKNOWN_SOURCE_REF");
  });

  it("demotes VERIFIED to INFERRED without a mint-verified source", () => {
    const out = validateModelOutput(
      {
        claims: [
          { domain: "TEAM_CREATOR", claim: "Creator is public", status: "VERIFIED", confidence: "HIGH", supportingSourceRefs: ["S1"] },
        ],
      },
      [source({ mintVerified: false, attributionConfidence: "PROBABLE" })],
    );
    expect(out.claims[0]?.status).toBe("INFERRED");
    expect(out.claims[0]?.confidence).toBe("MEDIUM");
  });

  it("rejects trading language anywhere in the output", () => {
    const out = validateModelOutput(
      {
        oneSentenceNarrative: "Strong buy on this one",
        claims: [
          { domain: "RISK_FLAGS", claim: "Good entry near support", status: "INFERRED", confidence: "LOW", supportingSourceRefs: ["S1"] },
        ],
      },
      [source()],
    );
    expect(out.oneSentenceNarrative).toBeNull();
    expect(out.claims).toHaveLength(0);
    expect(out.issues.map((i) => i.code)).toContain("CLAIM_CONTAINS_ADVICE");
  });

  it("keeps missing evidence neutral rather than negative", () => {
    const out = validateModelOutput(
      {
        claims: [
          { domain: "COMMUNITY_ACTIVITY", claim: "No community data was found", status: "UNAVAILABLE", confidence: "LOW", supportingSourceRefs: [] },
        ],
      },
      [source()],
    );
    expect(out.claims[0]?.status).toBe("UNAVAILABLE");
    const coverage = computeCoverage(out.claims, [source()]);
    expect(coverage.coveredDomains).not.toContain("COMMUNITY_ACTIVITY");
  });

  it("requires a counter-source for CONFLICTING", () => {
    const out = validateModelOutput(
      {
        claims: [
          { domain: "RISK_FLAGS", claim: "Sources disagree on the creator", status: "CONFLICTING", confidence: "LOW", supportingSourceRefs: ["S1"] },
        ],
      },
      [source()],
    );
    expect(out.claims[0]?.status).toBe("INFERRED");
  });

  it("drops an ungrounded narrative", () => {
    const out = validateModelOutput(
      {
        oneSentenceNarrative: "A dog coin from a viral clip",
        claims: [
          { domain: "SOCIAL_PRESENCE", claim: "Active X profile", status: "VERIFIED", confidence: "HIGH", supportingSourceRefs: ["S1"] },
        ],
      },
      [source()],
    );
    expect(out.oneSentenceNarrative).toBeNull();
    expect(out.narrativeResolved).toBe(false);
  });
});

describe("dossier assembly", () => {
  it("computes coverage and gaps from validated claims only", () => {
    const sources = [source(), source({ ref: "S2", url: "https://other.io/x", sourceType: "SOCIAL" })];
    const validated = validateModelOutput(
      {
        oneSentenceNarrative: "Community token tied to a recurring meme",
        claims: [
          { domain: "NARRATIVE_ORIGIN", claim: "Meme originates from a recurring clip", status: "VERIFIED", confidence: "HIGH", supportingSourceRefs: ["S1"] },
          { domain: "NARRATIVE_ORIGIN", claim: "Clip resurfaced recently", status: "INFERRED", confidence: "MEDIUM", supportingSourceRefs: ["S2"] },
          { domain: "SOCIAL_PRESENCE", claim: "One active account", status: "INFERRED", confidence: "MEDIUM", supportingSourceRefs: ["S2"] },
        ],
      },
      sources,
    );
    const dossier = assembleDossier({
      mint: MINT,
      chain: "solana",
      symbol: "WING",
      name: "Wingman",
      generatedAt: "2026-01-01T00:00:00.000Z",
      identityAttributionConfidence: "CONFIRMED",
      sources,
      validated,
    });
    expect(dossier.narrativeResolved).toBe(true);
    expect(dossier.coverage.coveredDomains).toEqual(["NARRATIVE_ORIGIN", "SOCIAL_PRESENCE"]);
    expect(dossier.evidenceGaps).toHaveLength(RESEARCH_DOMAINS.length - 2);
    expect(dossier.coverage.sourceDomainDiversity).toBe(2);
    expect(dossier.domains.find((d) => d.domain === "NARRATIVE_ORIGIN")?.status).toBe("COVERED");
    expect(JSON.stringify(dossier)).not.toMatch(/thesisScore|entryState|positionSize/i);
  });

  it("produces an explicit no-evidence dossier instead of guessing", () => {
    const dossier = emptyDossier({
      mint: MINT,
      chain: "solana",
      symbol: null,
      name: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(dossier.claims).toHaveLength(0);
    expect(dossier.coverage.coveragePct).toBe(0);
    expect(dossier.identityAttributionConfidence).toBe("UNRESOLVED");
    expect(dossier.unresolvedQuestions).toHaveLength(1);
  });
});

describe("prompts", () => {
  it("forbids ungrounded claims and trading output, and lists only supplied sources", () => {
    const system = buildSystemPrompt();
    expect(system).toMatch(/never produce a thesis score/i);
    expect(system).toMatch(/Missing evidence is NOT negative evidence/i);
    const user = buildUserPrompt({
      mint: MINT,
      chain: "solana",
      symbol: "WING",
      name: "Wingman",
      requestedDomains: ["NARRATIVE_ORIGIN"],
      triageQuestions: ["Who created it?"],
      sources: [source()],
    });
    expect(user).toContain(MINT);
    expect(user).toContain("[S1]");
    expect(user).not.toContain("S2");
  });
});

describe("corroboration accounting", () => {
  it("counts only sources the token did not publish itself as independent", () => {
    const coverage = computeCoverage(
      [],
      [
        source({ ref: "S1", sourceType: "OFFICIAL_TOKEN_LINK" }),
        source({ ref: "S2", sourceType: "OFFICIAL_TOKEN_LINK", url: "https://x.com/tok" }),
        source({ ref: "S3", sourceType: "NEWS_MEDIA", url: "https://news.example/a" }),
      ],
    );
    expect(coverage.sourceCount).toBe(3);
    expect(coverage.independentSourceCount).toBe(1);
  });

  it("reports zero independent sources for a purely self-published dossier", () => {
    const coverage = computeCoverage([], [source({ sourceType: "OFFICIAL_TOKEN_LINK" })]);
    expect(coverage.independentSourceCount).toBe(0);
  });
});
