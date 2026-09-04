import { describe, expect, it } from "vitest";
import {
  buildSearchVariants,
  canonicalizeUrl,
  classifyHttpFailure,
  classifyIndependence,
  dedupeResults,
  isSearchSuccess,
  looksLikeChallenge,
  type ExternalSearchResult,
} from "./external-search";

const MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";

function result(over: Partial<ExternalSearchResult> = {}): ExternalSearchResult {
  return {
    query: "q",
    provider: "firecrawl",
    title: "t",
    url: "https://example.com/a",
    snippet: "s",
    publishedAt: null,
    rank: 1,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("search outcome semantics", () => {
  it("never turns an infrastructure failure into a successful empty search", () => {
    for (const status of [401, 403, 402, 429, 500, 503, 418]) {
      expect(isSearchSuccess(classifyHttpFailure(status))).toBe(false);
    }
    expect(classifyHttpFailure(401)).toBe("AUTH_FAILED");
    expect(classifyHttpFailure(429)).toBe("RATE_LIMITED");
    expect(classifyHttpFailure(503)).toBe("PROVIDER_UNAVAILABLE");
  });

  it("detects bot/challenge bodies that previously read as zero results", () => {
    expect(looksLikeChallenge("<html>Please verify you are human</html>")).toBe(true);
    expect(looksLikeChallenge("Our systems have detected unusual traffic")).toBe(true);
    expect(looksLikeChallenge("")).toBe(false);
    expect(looksLikeChallenge("A normal article about a solana token")).toBe(false);
  });

  it("treats a genuine empty result set as a success", () => {
    expect(isSearchSuccess("SUCCESS_NO_RESULTS")).toBe(true);
    expect(isSearchSuccess("PROVIDER_UNAVAILABLE")).toBe(false);
  });
});

describe("deduplication", () => {
  it("collapses mirrors, trackers and trailing-slash variants", () => {
    expect(canonicalizeUrl("https://www.Example.com/a/?utm_source=x")).toBe("https://example.com/a");
    expect(canonicalizeUrl("https://mobile.twitter.com/foo/status/1")).toBe("https://x.com/foo/status/1");
    expect(canonicalizeUrl("not a url")).toBeNull();
  });

  it("keeps the best-ranked copy of a duplicated source", () => {
    const deduped = dedupeResults([
      result({ url: "https://example.com/a", rank: 4 }),
      result({ url: "https://www.example.com/a/?utm_medium=q", rank: 2 }),
      result({ url: "https://other.example/b", rank: 3 }),
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((r) => r.url.includes("example.com/a"))?.rank).toBe(2);
  });
});

describe("source independence", () => {
  const officialUrls = ["https://wingman.fun", "https://x.com/wingmantoken"];

  it("marks the project's own site and account as project-owned", () => {
    expect(classifyIndependence({ url: "https://wingman.fun/about", officialUrls })).toBe("PROJECT_OWNED");
    expect(
      classifyIndependence({ url: "https://x.com/wingmantoken/status/9", officialUrls }),
    ).toBe("PROJECT_OWNED");
  });

  it("marks launchpads and listing aggregators as project-affiliated, not independent", () => {
    expect(classifyIndependence({ url: "https://pump.fun/coin/abc", officialUrls })).toBe(
      "PROJECT_AFFILIATED",
    );
    expect(classifyIndependence({ url: "https://dexscreener.com/solana/x", officialUrls })).toBe(
      "PROJECT_AFFILIATED",
    );
  });

  it("marks a third-party account or outlet as independent", () => {
    expect(classifyIndependence({ url: "https://x.com/someanalyst/status/3", officialUrls })).toBe(
      "INDEPENDENT",
    );
    expect(classifyIndependence({ url: "https://news.example/story", officialUrls })).toBe("INDEPENDENT");
  });

  it("does not guess when there is no usable URL", () => {
    expect(classifyIndependence({ url: null, officialUrls })).toBe("UNKNOWN");
    expect(classifyIndependence({ url: "javascript:alert(1)", officialUrls })).toBe("UNKNOWN");
  });
});

describe("identity-safe query variants", () => {
  const base = {
    mint: MINT,
    symbol: "WING",
    name: "Wingman",
    officialUrls: ["https://x.com/wingmantoken"],
  };

  it("anchors discovery to the exact mint and never emits a different address", () => {
    const variants = buildSearchVariants({ ...base, identityEstablished: false });
    expect(variants[0]?.query).toBe(`"${MINT}"`);
    for (const v of variants) {
      const addresses = v.query.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? [];
      expect(addresses.every((a) => a === MINT)).toBe(true);
    }
  });

  it("never issues a bare ticker-only query", () => {
    const variants = buildSearchVariants({ ...base, identityEstablished: false });
    expect(variants.some((v) => v.query.trim() === '"WING"')).toBe(false);
  });

  it("withholds narrative queries until identity is established", () => {
    const before = buildSearchVariants({
      ...base,
      identityEstablished: false,
      narrativeTerms: ["cat meta"],
    });
    const after = buildSearchVariants({
      ...base,
      identityEstablished: true,
      narrativeTerms: ["cat meta"],
    });
    expect(before.some((v) => v.purpose === "NARRATIVE")).toBe(false);
    expect(after.some((v) => v.purpose === "NARRATIVE")).toBe(true);
  });

  it("always includes a mint-anchored risk query and no duplicates", () => {
    const variants = buildSearchVariants({ ...base, identityEstablished: true });
    const risk = variants.find((v) => v.purpose === "RISK");
    expect(risk?.query).toContain(MINT);
    expect(new Set(variants.map((v) => v.query)).size).toBe(variants.length);
  });
});
