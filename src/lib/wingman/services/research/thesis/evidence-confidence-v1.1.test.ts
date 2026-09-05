/**
 * evidence_confidence/v1.1 — semantic correctness regressions.
 *
 * These tests pin the CORRECTNESS fixes only. No threshold, weight or gate is
 * asserted here beyond the behaviour that already existed in v1.
 */
import { describe, expect, it } from "vitest";

import {
  EVIDENCE_CONFIDENCE_VERSION,
  computeEvidenceConfidence,
  OPPORTUNITY_POLICY,
  type EvidenceConfidenceInput,
} from "./contracts";
import { computeCoverage, type ResearchClaim, type ResearchSource } from "../deep/contracts";

const base: EvidenceConfidenceInput = {
  unresolvedDomainCount: 0,
  totalDomainCount: 6,
  independentSourceCount: 5,
  distinctIndependentEvidenceOrigins: 5,
  distinctEvidenceOrigins: 6,
  sourceCount: 8,
  rawSourceCount: 8,
  sourceDomainDiversity: 5,
  conflictingClaimCount: 0,
  corroboratedClaimCount: 4,
  tokenIdentityConfidence: "CONFIRMED",
  projectAttributionConfidence: "CONFIRMED",
  narrativeResolved: true,
  packetEvidenceGapCount: 0,
  marketStale: false,
  searchUnavailable: false,
  searchHealth: "READY",
};

describe("evidence_confidence/v1.1 — attribution input", () => {
  it("deducts on project/creator attribution, not exact-mint identity", () => {
    const r = computeEvidenceConfidence({
      ...base,
      tokenIdentityConfidence: "CONFIRMED",
      projectAttributionConfidence: "UNRESOLVED",
    });
    const attribution = r.deductions.find((d) => d.code === "ATTRIBUTION");
    expect(attribution?.points).toBe(25);
    expect(attribution?.detail).toMatch(/project\/creator attribution UNRESOLVED/);
  });

  it("certain mint identity never buys certainty about the creator", () => {
    const certainMintUnknownCreator = computeEvidenceConfidence({
      ...base,
      projectAttributionConfidence: "WEAK",
    });
    expect(certainMintUnknownCreator.score).toBeLessThan(
      computeEvidenceConfidence(base).score,
    );
  });
});

describe("evidence_confidence/v1.1 — independence semantics", () => {
  it("chain-state mirrors do not inflate independent corroboration", () => {
    const mirrorsOnly = computeEvidenceConfidence({
      ...base,
      independentSourceCount: 5,
      distinctIndependentEvidenceOrigins: 1,
      onChainMirrorCount: 4,
    });
    const genuine = computeEvidenceConfidence(base);
    expect(mirrorsOnly.diagnostics.effectiveIndependentSources).toBe(1);
    expect(mirrorsOnly.score).toBeLessThan(genuine.score);
    expect(
      mirrorsOnly.deductions.find((d) => d.code === "INDEPENDENT_SOURCES")?.detail,
    ).toMatch(/on-chain mirror source\(s\) excluded/);
  });

  it("does not use total distinct origins: project/community origins are not independence", () => {
    const r = computeEvidenceConfidence({
      ...base,
      independentSourceCount: 0,
      distinctIndependentEvidenceOrigins: 0,
      distinctEvidenceOrigins: 7,
      projectSourceCount: 3,
      communitySourceCount: 4,
    });
    expect(r.diagnostics.effectiveIndependentSources).toBe(0);
    expect(r.deductions.find((d) => d.code === "INDEPENDENT_SOURCES")?.points).toBe(25);
  });

  it("coverage exposes distinct INDEPENDENT evidence origins separately", () => {
    const sources: ResearchSource[] = [
      {
        ref: "S1",
        url: "https://solscan.io/token/abc",
        title: "Explorer",
        publisher: "solscan",
        sourceType: "EXPLORER",
        independence: "INDEPENDENT",
        reliabilityClass: "SECONDARY",
        onChainMirror: true,
        evidenceOrigin: "ONCHAIN_STATE",
      } as unknown as ResearchSource,
      {
        ref: "S2",
        url: "https://birdeye.so/token/abc",
        title: "Explorer 2",
        publisher: "birdeye",
        sourceType: "EXPLORER",
        independence: "INDEPENDENT",
        reliabilityClass: "SECONDARY",
        onChainMirror: true,
        evidenceOrigin: "ONCHAIN_STATE",
      } as unknown as ResearchSource,
      {
        ref: "S3",
        url: "https://www.coindesk.com/article",
        title: "Editorial",
        publisher: "coindesk",
        sourceType: "NEWS",
        independence: "INDEPENDENT",
        reliabilityClass: "SECONDARY",
        onChainMirror: false,
        evidenceOrigin: "HOST:coindesk.com",
      } as unknown as ResearchSource,
    ];
    const coverage = computeCoverage([] as ResearchClaim[], sources);
    expect(coverage.independentSourceCount).toBe(3);
    expect(coverage.distinctIndependentEvidenceOrigins).toBe(1);
  });
});

describe("evidence_confidence/v1.1 — diagnostics, floors and search health", () => {
  it("stamps the version and preserves the pre-floor raw score", () => {
    const r = computeEvidenceConfidence({
      ...base,
      unresolvedDomainCount: 6,
      independentSourceCount: 0,
      distinctIndependentEvidenceOrigins: 0,
      sourceCount: 0,
      sourceDomainDiversity: 0,
      packetEvidenceGapCount: 5,
      narrativeResolved: false,
      searchUnavailable: true,
      searchHealth: "SEARCH_UNAVAILABLE",
    });
    expect(r.version).toBe(EVIDENCE_CONFIDENCE_VERSION);
    expect(r.score).toBe(0);
    expect(r.rawScore).toBeLessThan(0);
    expect(r.floored).toBe(true);
    expect(r.totalDeductions).toBe(100 - r.rawScore);
  });

  it("keeps healthy-empty distinguishable from search failure", () => {
    const healthyEmpty = computeEvidenceConfidence({
      ...base,
      unresolvedDomainCount: 6,
      unresolvedReasons: Array(6).fill("NO_EVIDENCE_FOUND"),
      independentSourceCount: 0,
      distinctIndependentEvidenceOrigins: 0,
      sourceCount: 0,
      sourceDomainDiversity: 0,
      searchHealth: "READY",
      searchUnavailable: false,
    });
    const healthyEmptyInput: EvidenceConfidenceInput = {
      ...base,
      unresolvedDomainCount: 6,
      unresolvedReasons: Array(6).fill("NO_EVIDENCE_FOUND"),
      independentSourceCount: 0,
      distinctIndependentEvidenceOrigins: 0,
      sourceCount: 0,
      sourceDomainDiversity: 0,
      searchHealth: "READY",
      searchUnavailable: false,
    };
    const searchFailed = computeEvidenceConfidence({
      ...healthyEmptyInput,
      unresolvedReasons: Array(6).fill("SEARCH_UNAVAILABLE"),
      searchHealth: "SEARCH_UNAVAILABLE",
      searchUnavailable: true,
    });
    expect(healthyEmpty.searchHealth).toBe("READY");
    expect(healthyEmpty.unresolvedReasons[0]).toBe("NO_EVIDENCE_FOUND");
    expect(searchFailed.searchHealth).toBe("SEARCH_UNAVAILABLE");
    expect(searchFailed.unresolvedReasons[0]).toBe("SEARCH_UNAVAILABLE");
    expect(
      healthyEmpty.deductions.find((d) => d.code === "UNRESOLVED_DOMAINS")?.unresolvedReasons,
    ).toEqual(Array(6).fill("NO_EVIDENCE_FOUND"));
  });

  it("carries DEGRADED search without inventing a new penalty", () => {
    const ready = computeEvidenceConfidence(base);
    const degraded = computeEvidenceConfidence({ ...base, searchHealth: "DEGRADED" });
    expect(degraded.searchHealth).toBe("DEGRADED");
    expect(degraded.score).toBe(ready.score);
    expect(degraded.deductions.some((d) => d.code === "SEARCH_DEGRADED")).toBe(false);
  });

  it("keeps corroboratedClaimCount diagnostic-only", () => {
    const none = computeEvidenceConfidence({ ...base, corroboratedClaimCount: 0 });
    const many = computeEvidenceConfidence({ ...base, corroboratedClaimCount: 12 });
    expect(none.score).toBe(many.score);
    expect(many.diagnostics.corroboratedClaimCount).toBe(12);
  });

  it("leaves the Thesis Call thresholds untouched", () => {
    expect(OPPORTUNITY_POLICY.minEvidenceConfidence).toBe(60);
    expect(OPPORTUNITY_POLICY.minIndependentSources).toBe(2);
    expect(OPPORTUNITY_POLICY.minThesisScore).toBe(70);
  });
});
