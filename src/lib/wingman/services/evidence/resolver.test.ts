import { describe, expect, it } from "vitest";
import {
  buildEvidenceBundle,
  evidenceCompleteness,
  lookupResolved,
  resolveEvidence,
} from "./resolver";
import { EVIDENCE_SCHEMA_VERSION, type EvidenceObservation } from "./types";
import { snapshotToEvidence } from "./market-evidence";
import { normalizeSnapshot } from "../external/dexscreener/normalizer";
import type { DsPair } from "../external/dexscreener/types";

const NOW = "2026-08-29T20:00:00.000Z";
const FRESH = "2026-08-29T19:59:00.000Z";
const OLD = "2026-08-29T10:00:00.000Z";

function obs(over: Partial<EvidenceObservation> = {}): EvidenceObservation {
  return {
    domain: "market",
    key: "market.market_cap_usd",
    value: 8_000_000,
    unit: "usd",
    source: "dexscreener",
    sourceReference: "PAIR1",
    observedAt: FRESH,
    capturedAt: FRESH,
    status: "observed",
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    ...over,
  };
}

const one = (list: EvidenceObservation[], key: string) =>
  resolveEvidence(list, { now: NOW }).find((r) => r.key === key)!;

describe("evidence resolver", () => {
  it("resolves a single observation as single_source", () => {
    const r = one([obs()], "market.market_cap_usd");
    expect(r.resolutionStatus).toBe("single_source");
    expect(r.value).toBe(8_000_000);
    expect(r.primarySource).toBe("dexscreener");
    expect(r.observedAt).toBe(FRESH);
    expect(r.observations).toHaveLength(1);
  });

  it("confirms two semantically identical observations", () => {
    const r = one([obs(), obs({ source: "birdeye", value: 8_050_000 })], "market.market_cap_usd");
    expect(r.resolutionStatus).toBe("confirmed");
    expect(r.observations).toHaveLength(2);
  });

  it("keeps genuine zero as an observed value", () => {
    const r = one([obs({ key: "market.volume_5m_usd", value: 0 })], "market.volume_5m_usd");
    expect(r.value).toBe(0);
    expect(r.status).toBe("observed");
    expect(r.resolutionStatus).toBe("single_source");
  });

  it("never lets an unavailable observation override an observed value", () => {
    const r = one(
      [obs({ source: "birdeye", value: null, status: "unavailable" }), obs()],
      "market.market_cap_usd",
    );
    expect(r.value).toBe(8_000_000);
    expect(r.primarySource).toBe("dexscreener");
    expect(r.resolutionStatus).toBe("single_source");
    expect(r.observations).toHaveLength(2);
  });

  it("does not average conflicting numbers and keeps them accessible", () => {
    const r = one([obs(), obs({ source: "birdeye", value: 8_350_000 })], "market.market_cap_usd");
    expect(r.resolutionStatus).toBe("conflicting");
    expect([8_000_000, 8_350_000]).toContain(r.value);
    expect(r.value).not.toBe(8_175_000);
    expect(r.conflictingValues?.map((c) => c.value).sort()).toEqual([8_000_000, 8_350_000]);
  });

  it("never resolves market cap and FDV into each other", () => {
    const resolved = resolveEvidence(
      [obs(), obs({ key: "market.fdv_usd", value: 9_000_000 })],
      { now: NOW },
    );
    expect(resolved).toHaveLength(2);
    expect(resolved.find((r) => r.key === "market.market_cap_usd")!.value).toBe(8_000_000);
    expect(resolved.find((r) => r.key === "market.fdv_usd")!.value).toBe(9_000_000);
  });

  it("keeps raw and clustered holder concentration distinct", () => {
    const resolved = resolveEvidence(
      [
        obs({ domain: "holders", key: "holders.top10_pct", value: 21, unit: "percent" }),
        obs({
          domain: "holders",
          key: "holders.effective_clustered_top10_pct",
          value: 21,
          unit: "percent",
        }),
      ],
      { now: NOW },
    );
    expect(resolved.map((r) => r.key).sort()).toEqual([
      "holders.effective_clustered_top10_pct",
      "holders.top10_pct",
    ]);
  });

  it("marks stale evidence without discarding its value", () => {
    const r = one([obs({ observedAt: OLD, capturedAt: OLD })], "market.market_cap_usd");
    expect(r.resolutionStatus).toBe("stale");
    expect(r.value).toBe(8_000_000);
    expect(r.observedAt).toBe(OLD);
    expect(r.status).toBe("observed");
  });

  it("is deterministic and order independent", () => {
    const list = [obs(), obs({ source: "birdeye", value: 8_350_000 }), obs({ key: "market.fdv_usd", value: 9e6 })];
    const a = resolveEvidence(list, { now: NOW });
    const b = resolveEvidence([...list].reverse(), { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(resolveEvidence(list, { now: NOW }))).toBe(JSON.stringify(a));
  });

  it("applies provider preference deterministically", () => {
    const list = [
      obs({ key: "market.price_usd", value: 1, source: "dexscreener" }),
      obs({ key: "market.price_usd", value: 2, source: "birdeye" }),
    ];
    // Configured price preference puts birdeye ahead of dexscreener.
    expect(one(list, "market.price_usd").primarySource).toBe("birdeye");
    expect(one([...list].reverse(), "market.price_usd").primarySource).toBe("birdeye");
  });

  it("reports missing holder evidence as uncertainty, not bearish evidence", () => {
    const bundle = buildEvidenceBundle([obs()], { now: NOW });
    expect(bundle.availability.holders).toBe(false);
    expect(bundle.availability.market).toBe(true);
    const holders = evidenceCompleteness(bundle).find((c) => c.domain === "holders")!;
    expect(holders).toMatchObject({ available: false, note: "unavailable", observedFactCount: 0 });
    expect(JSON.stringify(bundle).toLowerCase()).not.toMatch(/bearish|negative|risk|penalty/);
  });

  it("lookup helper returns explicit unavailable without inventing data", () => {
    const resolved = resolveEvidence([obs()], { now: NOW });
    const missing = lookupResolved(resolved, "holders", "holders.top10_pct", { now: NOW });
    expect(missing.value).toBeNull();
    expect(missing.resolutionStatus).toBe("unavailable");
    expect(missing.observations).toEqual([]);
  });

  it("counts bundle facts descriptively", () => {
    const bundle = buildEvidenceBundle(
      [obs(), obs({ source: "birdeye", value: 8_350_000 }), obs({ key: "market.fdv_usd", value: null, status: "unavailable" })],
      { now: NOW },
    );
    expect(bundle.counts.totalObserved).toBe(2);
    expect(bundle.counts.totalUnavailable).toBe(1);
    expect(bundle.counts.resolvedConflicting).toBe(1);
    expect(bundle.counts.resolvedUnavailable).toBe(1);
  });
});

const ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function dsPair(): DsPair {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: "PAIR1",
    baseToken: { address: ADDRESS, name: "Demo", symbol: "DEMO" },
    quoteToken: { address: "So11111111111111111111111111111111111111112", name: "SOL", symbol: "SOL" },
    priceUsd: "0.0421",
    txns: { m5: { buys: 0, sells: 4 } },
    volume: { m5: 0, h24: 250000 },
    liquidity: { usd: 72000 },
    marketCap: 8000000,
    fdv: 9000000,
    pairCreatedAt: Date.UTC(2026, 0, 1),
  } as DsPair;
}

describe("dexscreener evidence through the resolver", () => {
  const observations = snapshotToEvidence(normalizeSnapshot(dsPair(), { capturedAt: FRESH }));

  it("marks the capturedAt proxy as capture_time", () => {
    for (const o of observations) {
      expect(o.metadata?.observedAtBasis).toBe("capture_time");
      expect(o.observedAt).toBe(o.capturedAt);
    }
  });

  it("does not leak provider response fields through resolved evidence", () => {
    const serialized = JSON.stringify(resolveEvidence(observations, { now: FRESH }));
    for (const token of ["baseToken", "quoteToken", "chainId", "priceChange", "txns", "h24", "m5"]) {
      expect(serialized).not.toContain(token);
    }
  });

  it("resolves live DexScreener facts as single_source today", () => {
    const resolved = resolveEvidence(observations, { now: FRESH });
    const observed = resolved.filter((r) => r.status === "observed");
    expect(observed.length).toBeGreaterThan(0);
    for (const r of observed) expect(r.resolutionStatus).toBe("single_source");
  });
});
