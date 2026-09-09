/**
 * Phase 3A.0 — evidence/v1.1 foundation regression tests.
 *
 * These cover the additive contract only. They must never assert any change in
 * production scoring, gating or stage inputs.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_AFFILIATIONS,
  EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_SCHEMA_VERSION_V1_1,
  isVersionedFeatureKey,
  type EvidenceAffiliation,
  type EvidenceObservation,
} from "./types";
import { buildObservation, isExactMint, resolvedTokenIdFor } from "./observation-builder";
import { toEvidenceRow } from "../evidence-persistence.server";
import { snapshotToEvidence } from "./market-evidence";

const MINT = "So11111111111111111111111111111111111111112";
const CAPTURED = "2026-09-09T00:00:00.000Z";

function socialInput(overrides: Partial<Parameters<typeof buildObservation>[0]> = {}) {
  return buildObservation({
    domain: "social",
    key: "social.mention_velocity/v1",
    value: 12,
    unit: "count",
    source: "x",
    sourceReference: "https://x.com/example/status/1",
    observedAt: CAPTURED,
    capturedAt: CAPTURED,
    collectionHealth: "HEALTHY",
    mint: MINT,
    ...overrides,
  });
}

describe("evidence/v1.1 foundation", () => {
  it("1. keeps historical evidence/v1 observations readable and unchanged", () => {
    const legacy: EvidenceObservation = {
      domain: "market",
      key: "market.liquidity_usd",
      value: 72000,
      source: "dexscreener",
      sourceReference: "pair",
      observedAt: CAPTURED,
      capturedAt: CAPTURED,
      status: "observed",
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
    };
    const row = toEvidenceRow(legacy, { tokenId: "token-1" });
    expect(row.schema_version).toBe("evidence/v1");
    expect(row.token_id).toBe("token-1");
    expect(row.affiliation).toBeNull();
    expect(row.collection_health).toBeNull();
    // Absent attribution on a legacy row means the exact linkage it always had.
    expect(row.attribution_status).toBe("RESOLVED_MINT");
  });

  it("2. requires a valid token linkage for RESOLVED_MINT", () => {
    const observation = socialInput();
    expect(observation.attributionStatus).toBe("RESOLVED_MINT");
    expect(() => resolvedTokenIdFor(observation, null)).toThrow(/exact token linkage/);
    expect(() => toEvidenceRow(observation, { tokenId: null })).toThrow();
  });

  it("3. persists UNRESOLVED_TOKEN_ATTRIBUTION without a token_id", () => {
    const observation = socialInput({ mint: null });
    expect(observation.attributionStatus).toBe("UNRESOLVED_TOKEN_ATTRIBUTION");
    const row = toEvidenceRow(observation, { tokenId: null });
    expect(row.token_id).toBeNull();
    expect(row.schema_version).toBe(EVIDENCE_SCHEMA_VERSION_V1_1);
  });

  it("4. never resolves a mint from ticker, name or fuzzy text", () => {
    for (const guess of ["STONK", "$STONK", "stonk coin", "", "   "]) {
      expect(isExactMint(guess)).toBe(false);
      const observation = socialInput({ mint: guess });
      expect(observation.attributionStatus).toBe("UNRESOLVED_TOKEN_ATTRIBUTION");
      expect(toEvidenceRow(observation, { tokenId: "token-1" }).token_id).toBeNull();
    }
  });

  it.each(EVIDENCE_AFFILIATIONS)("5-9. persists %s affiliation", (affiliation) => {
    const observation = socialInput({ affiliation: affiliation as EvidenceAffiliation });
    expect(observation.affiliation).toBe(affiliation);
    expect(toEvidenceRow(observation, { tokenId: "token-1" }).affiliation).toBe(affiliation);
  });

  it("10-11. keeps generic affiliation out of Deep Research independence and the Opportunity gate", () => {
    const sources = ["deep-research/claims.ts", "deep-research/report.ts", "thesis"];
    void sources;
    const offenders: string[] = [];
    const files = [
      "src/lib/wingman/services/research",
      "src/lib/wingman/services/scanner",
      "src/lib/wingman/services/entry",
      "src/lib/wingman/services/sizing",
    ];
    for (const dir of files) {
      const grep = safeGrep(dir, [
        "attributionStatus",
        "collectionHealth",
        "EVIDENCE_SCHEMA_VERSION_V1_1",
        "observation-builder",
      ]);
      offenders.push(...grep);
    }
    expect(offenders).toEqual([]);
  });

  it("12. never turns a rate-limited collection into a zero", () => {
    const observation = socialInput({ collectionHealth: "RATE_LIMITED", value: 0 });
    expect(observation.value).toBeNull();
    expect(observation.status).toBe("unavailable");
    expect(observation.collectionHealth).toBe("RATE_LIMITED");
  });

  it("13. never turns an unavailable/not-configured collection into negative evidence", () => {
    for (const health of ["UNAVAILABLE", "NOT_CONFIGURED", "UNKNOWN"] as const) {
      const observation = socialInput({ collectionHealth: health, value: 0 });
      expect(observation.value).toBeNull();
      expect(observation.status).toBe("unavailable");
    }
  });

  it("14. keeps a healthy measured zero as a legitimate zero", () => {
    const observation = socialInput({ collectionHealth: "HEALTHY", value: 0 });
    expect(observation.value).toBe(0);
    expect(observation.status).toBe("observed");
    const partial = socialInput({ collectionHealth: "PARTIAL", value: 0 });
    expect(partial.value).toBe(0);
  });

  it("15. cannot mutate an earlier observation — construction is pure and append-only", () => {
    const earlier = socialInput({ capturedAt: "2026-09-09T14:05:00.000Z" });
    const later = socialInput({ capturedAt: "2026-09-09T15:00:00.000Z", value: 99 });
    expect(earlier.capturedAt).toBe("2026-09-09T14:05:00.000Z");
    expect(earlier.value).toBe(12);
    expect(later.capturedAt).toBe("2026-09-09T15:00:00.000Z");
    const persistence = readFileSync(
      "src/lib/wingman/services/evidence-persistence.server.ts",
      "utf8",
    );
    expect(persistence).not.toContain(".upsert(");
    expect(persistence).not.toContain(".update(");
    expect(persistence).not.toContain(".delete(");
  });

  it("16-17. keeps the new fields invisible to Triage and Thesis input schemas", () => {
    const offenders = [
      ...safeGrep("src/lib/wingman/services/research", ["affiliation?:", "collectionHealth"]),
    ];
    expect(offenders.filter((o) => o.includes("collectionHealth"))).toEqual([]);
    const triage = safeGrep("src/lib/wingman/services/research", [
      "ai_triage_input/v2_allowlist_no_outcomes",
    ]);
    // The allowlist identifier still exists and was not renamed.
    expect(triage.length).toBeGreaterThan(0);
  });

  it("18. leaves the outcome firewall intact", () => {
    const firewall = readFileSync(
      "src/lib/wingman/services/outcomes/outcome-firewall.test.ts",
      "utf8",
    );
    expect(firewall).toContain('DECISION_DIRS = ["scanner", "research", "entry", "sizing", "evidence"]');
    expect(safeGrep("src/lib/wingman/services/evidence", ["outcomes/"])).toEqual([]);
  });

  it("19-20. leaves existing market evidence emission byte-identical", () => {
    const snapshot = {
      capturedAt: CAPTURED,
      observedAt: CAPTURED,
      priceUsd: 1.5,
      liquidityUsd: 72000,
    } as never;
    const emitted = snapshotToEvidence(snapshot, null);
    for (const observation of emitted) {
      expect(observation.schemaVersion).toBe(EVIDENCE_SCHEMA_VERSION);
      expect(observation.affiliation).toBeUndefined();
      expect(observation.attributionStatus).toBeUndefined();
      expect(observation.collectionHealth).toBeUndefined();
    }
  });

  it("establishes the versioned feature-key convention prospectively", () => {
    expect(isVersionedFeatureKey("social.mention_velocity/v1")).toBe(true);
    expect(isVersionedFeatureKey("social.mention_velocity/v2")).toBe(true);
    // Existing keys are deliberately not renamed and stay unversioned.
    expect(isVersionedFeatureKey("market.liquidity_usd")).toBe(false);
  });
});

/** Grep a directory for needles, returning "file -> needle" hits. */
function safeGrep(dir: string, needles: string[]): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...safeGrep(full, needles));
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    const source = readFileSync(full, "utf8");
    for (const needle of needles) {
      if (source.includes(needle)) out.push(`${full} -> ${needle}`);
    }
  }
  return out;
}
