import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  classifyEntryPopulation,
  projectDeepResearchReport,
  projectEntryEvaluation,
  projectScannerCandidate,
  projectThesisReport,
  projectTriageDecision,
} from "./adapters";
import { assertNotOutcomeKey, feature, featureSemanticVersion } from "./contracts";

const T0 = "2026-10-01T14:10:00.000Z";
const ctx = { source: "t", sourceReference: "t:1", observedAt: T0, decisionAt: T0 };
const get = (fs: { featureKey: string }[], k: string) => fs.find((f) => f.featureKey === k) as any;
const mode = "HISTORICAL_FROZEN_ARTIFACT_PROJECTION" as const;

const scanRow = {
  id: "c1", scan_run_id: "s1", token_id: "t1", contract_address: "MINT1", created_at: T0,
  scanner_version: "scanner/v1", market_cap: 50000, liquidity_usd: 0, volume_24h: null,
  quantitative_priority: 42, priority_components: { turnover: { score: 0.07 } },
  stage_reached: "hard_filters", rejection_reason: "LOW_LIQUIDITY", discovery_lanes: ["b", "a"],
};
const thesisRow = {
  id: "th1", mint: "MINT1", created_at: T0, thesis_score: 72, evidence_confidence: 65, verdict: "PROMISING",
  bear_case_severity: "LOW", score_meme_quality: 8, score_distribution: 6, score_liquidity: 5,
  score_catalyst_narrative: 7, score_dev_integrity: 5, score_mindshare: 4, score_valuation: 6,
  thesis_call_milestone_id: null, current_eligibility: { actionable: true },
  gate_diagnostics: { originGate: { version: "opportunity_gate/v1.1", status: "FAIL", distinctIndependentEvidenceOrigins: 1 } },
};

describe("learning feature layer v1", () => {
  it("1 same source event → same learning event identity", () => {
    const a = projectScannerCandidate(scanRow, null, mode);
    const b = projectScannerCandidate(scanRow, null, mode);
    expect(a.event).toEqual(b.event);
  });
  it("2 rerun yields identical feature identities (no duplicates)", () => {
    const keys = projectScannerCandidate(scanRow, null, mode).features.map((f) => f.featureKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("3 feature semantic version is required", () => {
    expect(() => featureSemanticVersion("market.liquidity_usd")).toThrow();
    expect(featureSemanticVersion("market.liquidity_usd/v2")).toBe(2);
  });
  it("4 exact source provenance retained", () => {
    const f = get(projectScannerCandidate(scanRow, null, mode).features, "market.liquidity_usd/v1");
    expect(f.sourceReference).toBe("scan_candidates:c1");
  });
  it("5 later evidence cannot enter an earlier event", () => {
    expect(() => feature("x.y/v1", "number", 1, { ...ctx, observedAt: "2026-10-01T15:00:00.000Z" })).toThrow(/DECISION_TIME/);
  });
  it("6/23 adapters only read the frozen artifact passed in (no current state)", () => {
    const src = readFileSync(join(__dirname, "adapters.ts"), "utf8");
    expect(src).not.toMatch(/supabase|fetch\(|dexscreener|birdeye|token_snapshots|tokens"/i);
  });
  it("7 unavailable stays unavailable, not zero", () => {
    const f = get(projectScannerCandidate(scanRow, null, mode).features, "market.volume_24h_usd/v1");
    expect(f.status).toBe("UNAVAILABLE");
    expect(f.valueNumber).toBeNull();
  });
  it("8 legitimate observed zero remains zero", () => {
    const f = get(projectScannerCandidate(scanRow, null, mode).features, "market.liquidity_usd/v1");
    expect(f).toMatchObject({ status: "OBSERVED", valueNumber: 0 });
  });
  it("9 scanner adapter projects frozen fields", () => {
    const fs = projectScannerCandidate(scanRow, null, mode).features;
    expect(get(fs, "scanner.quant_priority/v1").valueNumber).toBe(42);
    expect(get(fs, "scanner.qp_turnover/v1").valueNumber).toBe(0.07);
    expect(get(fs, "scanner.setups/v1").valueText).toBe("a,b");
  });
  it("10 scanner rejection reason queryable verbatim", () => {
    const fs = projectScannerCandidate(scanRow, null, mode).features;
    expect(get(fs, "nonadvance.rejection_reason/v1").valueText).toBe("LOW_LIQUIDITY");
    expect(get(fs, "nonadvance.stage_reached/v1").valueText).toBe("hard_filters");
  });
  it("11/12 triage decision semantics preserved, no model regeneration", () => {
    for (const d of ["SKIP", "WATCH", "DEEP_RESEARCH"]) {
      const r = projectTriageDecision({ id: "d", mint: "M", created_at: T0, decision: d }, null, mode);
      expect(get(r.features, "triage.decision/v1").valueText).toBe(d);
    }
    const src = readFileSync(join(__dirname, "adapters.ts"), "utf8");
    expect(src).not.toMatch(/gateway|prompt\(|callModel|ai\//);
  });
  it("13 deep research uses persisted structured fields only", () => {
    const r = projectDeepResearchReport({ id: "r", mint: "M", created_at: T0, status: "completed", source_count: 0 }, mode);
    expect(get(r.features, "research.source_count/v1")).toMatchObject({ status: "OBSERVED", valueNumber: 0 });
    expect(get(r.features, "research.unresolved_gap_count/v1").status).toBe("UNAVAILABLE");
  });
  it("14 thesis rubric components map individually", () => {
    const fs = projectThesisReport(thesisRow, mode).features;
    expect(get(fs, "thesis.meme_lore_score/v1").valueNumber).toBe(8);
    expect(get(fs, "thesis.valuation_score/v1").valueNumber).toBe(6);
  });
  it("15 opportunity gates map individually", () => {
    const fs = projectThesisReport(thesisRow, mode).features;
    expect(get(fs, "gate.thesis_score/v1").valueText).toBe("PASS");
    expect(get(fs, "gate.independent_origins/v1").valueText).toBe("FAIL");
    const old = projectThesisReport({ ...thesisRow, gate_diagnostics: null }, mode).features;
    expect(get(old, "gate.thesis_score/v1").status).toBe("NOT_EVALUATED");
  });
  it("16 score >=70 alone does not create a THESIS_CALL", () => {
    const fs = projectThesisReport(thesisRow, mode).features;
    expect(get(fs, "thesis.is_canonical_thesis_call/v1").valueBoolean).toBe(false);
  });
  it("17 legacy entry diagnostic distinguishable from canonical", () => {
    expect(classifyEntryPopulation({}, thesisRow)).toBe("LEGACY_DIAGNOSTIC_PRE_THESIS_CALL_GATE");
    expect(classifyEntryPopulation({}, { ...thesisRow, thesis_call_milestone_id: "m" })).toBe("CANONICAL_POST_THESIS_CALL");
    const r = projectEntryEvaluation({ id: "e", mint: "M", evaluated_at: T0, state: "BUY_ZONE" }, null, mode);
    expect(r.event.populationClass).toBe("LEGACY_DIAGNOSTIC_PRE_THESIS_CALL_GATE");
  });
  it("18 affiliation does not become independent corroboration", () => {
    const r = projectDeepResearchReport({ id: "r", mint: "M", created_at: T0, community_source_count: 5 }, mode);
    const f = get(r.features, "research.community_source_count/v1");
    expect(f.affiliation).toBe("COMMUNITY");
    expect(r.features.some((x) => x.featureKey.includes("independent_origins"))).toBe(false);
  });
  it("19 event carries enrollment linkage fields (metadata only)", () => {
    const src = readFileSync(join(__dirname, "projection.server.ts"), "utf8");
    expect(src).toMatch(/outcome_enrollment_id/);
    expect(src).toMatch(/inclusion_probability/);
  });
  it("20 outcome-looking keys are rejected", () => {
    for (const k of ["outcome.peak_return/v1", "market.later_price/v1", "x.maxdd/v1"]) expect(() => assertNotOutcomeKey(k)).toThrow();
  });
  it("21 learning layer cannot import outcome read paths", () => {
    for (const file of ["adapters.ts", "contracts.ts", "projection.server.ts"]) {
      const src = readFileSync(join(__dirname, file), "utf8");
      expect(src).not.toMatch(/from ["'][^"']*(outcomes|outcome-service|outcome-sampler|observatory)/);
      expect(src).not.toMatch(/outcome_tracking|outcome_observations|token_scanner_outcomes|opportunity_outcomes|token_price_candles/);
    }
  });
  it("22 production stages cannot consume the learning layer", () => {
    const root = join(__dirname, "..");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    for (const dir of ["scanner", "ai", "research", "entry", "sizing", "production-cycle", "live"]) {
      for (const file of walk(join(root, dir))) {
        expect(readFileSync(file, "utf8"), file).not.toMatch(/learning\/|learning_feature|learning_decision/);
      }
    }
  });
  it("24 every projected key is valid and versioned", () => {
    const all = [
      ...projectScannerCandidate(scanRow, null, mode).features,
      ...projectThesisReport(thesisRow, mode).features,
    ];
    for (const f of all) expect(featureSemanticVersion(f.featureKey)).toBeGreaterThanOrEqual(1);
  });
});
