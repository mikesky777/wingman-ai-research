/**
 * Regression tests for the Deep Research evidence semantics patch v1.1.
 *
 * Each test encodes a failure mode found by the read-only evidence audit:
 * community lore graded as fact, on-chain mirrors counted as independent
 * corroboration, tooling failure indistinguishable from absence, and project
 * attribution inherited from a confirmed token identity.
 */
import { describe, expect, it } from "vitest";
import {
  assembleDossier,
  computeCoverage,
  deriveClaimProvenance,
  deriveProjectAttributionConfidence,
  deriveUnresolvedReason,
  emptyDossier,
  validateModelOutput,
  withEvidenceOrigin,
  type DossierSearchHealth,
  type ResearchClaim,
  type ResearchSource,
} from "./contracts";
import {
  classifyIndependence,
  countDistinctEvidenceOrigins,
  isOnChainMirror,
} from "./external-search";

const MINT = "So11111111111111111111111111111111111111112";

function source(overrides: Partial<ResearchSource> & { ref: string }): ResearchSource {
  return withEvidenceOrigin({
    url: null,
    title: null,
    account: null,
    sourceType: "UNKNOWN",
    reliabilityClass: "SECONDARY",
    independence: "INDEPENDENT",
    publishedAt: null,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    relevance: null,
    mintVerified: true,
    contentFetched: true,
    attributionConfidence: "STRONG",
    query: null,
    excerpt: null,
    ...overrides,
  });
}

const healthyReady: DossierSearchHealth = {
  status: "READY",
  provider: "test",
  attempts: 4,
  successfulAttempts: 4,
  failedAttempts: 0,
  lastError: null,
};

const searchDown: DossierSearchHealth = {
  status: "SEARCH_UNAVAILABLE",
  provider: "test",
  attempts: 4,
  successfulAttempts: 0,
  failedAttempts: 4,
  lastError: "PROVIDER_ERROR",
};

describe("source affiliation", () => {
  it("classifies community platforms as COMMUNITY, never INDEPENDENT", () => {
    expect(classifyIndependence({ url: "https://x.com/randomdegen/status/1", officialUrls: [] })).toBe(
      "COMMUNITY",
    );
    expect(classifyIndependence({ url: "https://t.me/somechat", officialUrls: [] })).toBe("COMMUNITY");
    expect(
      classifyIndependence({ url: "https://www.reuters.com/story", officialUrls: [] }),
    ).toBe("INDEPENDENT");
  });

  it("keeps the project's own account PROJECT_OWNED", () => {
    expect(
      classifyIndependence({
        url: "https://x.com/officialtoken/status/9",
        officialUrls: ["https://x.com/officialtoken"],
      }),
    ).toBe("PROJECT_OWNED");
  });
});

describe("on-chain mirrors", () => {
  it("treats explorers, wallets and aggregators as one evidence origin", () => {
    const urls = [
      "https://solscan.io/token/abc",
      "https://birdeye.so/token/abc",
      "https://dexscreener.com/solana/abc",
      "https://jup.ag/swap/abc",
    ];
    for (const url of urls) expect(isOnChainMirror(url)).toBe(true);
    expect(countDistinctEvidenceOrigins(urls)).toBe(1);
  });

  it("counts genuinely different origins separately", () => {
    expect(
      countDistinctEvidenceOrigins([
        "https://solscan.io/token/abc",
        "https://www.coindesk.com/article",
        "https://blog.example.com/post",
      ]),
    ).toBe(3);
  });

  it("separates mirror count from independence in coverage", () => {
    const sources = [
      source({ ref: "S1", url: "https://solscan.io/token/abc" }),
      source({ ref: "S2", url: "https://birdeye.so/token/abc" }),
      source({ ref: "S3", url: "https://x.com/degen/status/2", independence: "COMMUNITY" }),
    ];
    const coverage = computeCoverage([], sources);
    expect(coverage.onChainMirrorCount).toBe(2);
    expect(coverage.distinctEvidenceOrigins).toBe(2);
    expect(coverage.communitySourceCount).toBe(1);
    expect(coverage.rawSourceCount).toBe(3);
  });
});

describe("claim grading", () => {
  it("never promotes community lore to VERIFIED", () => {
    const sources = [
      source({
        ref: "S1",
        url: "https://x.com/degen/status/3",
        independence: "COMMUNITY",
        reliabilityClass: "UNVERIFIED",
      }),
    ];
    const out = validateModelOutput(
      {
        claims: [
          {
            domain: "NARRATIVE_ORIGIN",
            claim: "The mascot originated from a viral community post.",
            status: "VERIFIED",
            confidence: "HIGH",
            supportingSourceRefs: ["S1"],
          },
        ],
      },
      sources,
    );
    expect(out.claims[0]?.status).toBe("INFERRED");
    expect(out.claims[0]?.provenance).toBe("INFERENCE");
    expect(out.issues.some((i) => i.code === "COMMUNITY_LORE_NOT_VERIFIED")).toBe(true);
  });

  it("labels a primary project source as PRIMARY_SOURCE_VERIFIED, not corroborated", () => {
    const byRef = new Map([
      [
        "S1",
        source({
          ref: "S1",
          url: "https://token.example/announcement",
          independence: "PROJECT_OWNED",
          reliabilityClass: "PRIMARY",
        }),
      ],
    ]);
    expect(deriveClaimProvenance("VERIFIED", ["S1"], byRef)).toBe("PRIMARY_SOURCE_VERIFIED");
  });

  it("labels community-only observations as COMMUNITY_REPORTED", () => {
    const byRef = new Map([
      ["S1", source({ ref: "S1", url: "https://t.me/chat/9", independence: "COMMUNITY" })],
    ]);
    expect(deriveClaimProvenance("CONFLICTING", ["S1"], byRef)).toBe("COMMUNITY_REPORTED");
  });
});

describe("unresolved reasons", () => {
  it("distinguishes absence from tooling failure", () => {
    expect(
      deriveUnresolvedReason({
        status: "UNRESOLVED",
        searchHealth: "READY",
        researched: true,
        hasAnyClaim: false,
      }),
    ).toBe("NO_EVIDENCE_FOUND");
    expect(
      deriveUnresolvedReason({
        status: "UNRESOLVED",
        searchHealth: "SEARCH_UNAVAILABLE",
        researched: true,
        hasAnyClaim: false,
      }),
    ).toBe("SEARCH_UNAVAILABLE");
    expect(
      deriveUnresolvedReason({
        status: "PARTIAL",
        searchHealth: "READY",
        researched: true,
        hasAnyClaim: true,
      }),
    ).toBe("PARTIAL_EVIDENCE");
    expect(
      deriveUnresolvedReason({
        status: "UNRESOLVED",
        searchHealth: "READY",
        researched: false,
        hasAnyClaim: false,
      }),
    ).toBe("NOT_RESEARCHED");
    expect(
      deriveUnresolvedReason({
        status: "COVERED",
        searchHealth: "READY",
        researched: true,
        hasAnyClaim: true,
      }),
    ).toBeNull();
  });
});

describe("attribution", () => {
  const attributionClaim: ResearchClaim = {
    domain: "TEAM_CREATOR",
    claim: "The deployer is linked to a named team.",
    claimType: "OBSERVATION",
    status: "INFERRED",
    provenance: "INFERENCE",
    confidence: "MEDIUM",
    supportingSourceRefs: ["S1"],
    contradictingSourceRefs: [],
    observedAt: null,
    publishedAt: null,
  };

  it("does not confirm project attribution when search was unavailable", () => {
    const sources = [
      source({
        ref: "S1",
        url: "https://token.example/about",
        independence: "PROJECT_OWNED",
        reliabilityClass: "PRIMARY",
      }),
    ];
    expect(
      deriveProjectAttributionConfidence({
        sources,
        claims: [attributionClaim],
        searchHealth: "SEARCH_UNAVAILABLE",
      }),
    ).toBe("PROBABLE");
  });

  it("keeps project attribution separate from a confirmed token identity", () => {
    const dossier = assembleDossier({
      mint: MINT,
      chain: "solana",
      symbol: "TEST",
      name: "Test",
      generatedAt: "2026-01-01T00:00:00.000Z",
      identityAttributionConfidence: "CONFIRMED",
      searchHealth: healthyReady,
      sources: [source({ ref: "S1", url: "https://solscan.io/token/abc" })],
      validated: {
        oneSentenceNarrative: null,
        narrativeResolved: false,
        domains: [],
        claims: [],
        conflicts: [],
        unresolvedQuestions: [],
        issues: [],
      },
    });
    expect(dossier.tokenIdentityConfidence).toBe("CONFIRMED");
    expect(dossier.projectAttributionConfidence).toBe("UNRESOLVED");
  });
});

describe("search health on the report", () => {
  it("carries search health and unresolved reasons into an empty dossier", () => {
    const dossier = emptyDossier({
      mint: MINT,
      chain: "solana",
      symbol: null,
      name: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
      searchHealth: searchDown,
    });
    expect(dossier.searchHealth.status).toBe("SEARCH_UNAVAILABLE");
    expect(dossier.searchHealth.failedAttempts).toBe(4);
    expect(dossier.domains.every((d) => d.unresolvedReason === "SEARCH_UNAVAILABLE")).toBe(true);
    expect(dossier.evidenceSemanticsVersion).toBe("deep_research_evidence/v1.1");
  });
});
