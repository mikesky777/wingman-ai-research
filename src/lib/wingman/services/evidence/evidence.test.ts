import { describe, expect, it } from "vitest";
import { snapshotToEvidence } from "./market-evidence";
import type { EvidenceObservation } from "./types";
import { normalizeSnapshot } from "../external/dexscreener/normalizer";
import type { DsPair } from "../external/dexscreener/types";
import type { SelectedPairMeta } from "@/lib/wingman/ingest-types";

const ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CAPTURED = "2026-08-29T20:00:00.000Z";

function pair(overrides: Record<string, unknown> = {}): DsPair {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: "PAIR1",
    baseToken: { address: ADDRESS, name: "Demo Token", symbol: "DEMO" },
    quoteToken: {
      address: "So11111111111111111111111111111111111111112",
      name: "Wrapped SOL",
      symbol: "SOL",
    },
    priceUsd: "0.0421",
    txns: { m5: { buys: 0, sells: 4 }, h1: { buys: 90, sells: 61 } },
    volume: { m5: 0, h1: 30000, h6: 90000, h24: 250000 },
    priceChange: { m5: 1.2, h1: -3.4, h6: 12, h24: 44 },
    liquidity: { usd: 72000 },
    fdv: 9000000,
    marketCap: 8000000,
    pairCreatedAt: Date.UTC(2026, 0, 1),
    boosts: { active: 3 },
    ...overrides,
  } as DsPair;
}

const meta: SelectedPairMeta = {
  pairAddress: "PAIR1",
  dexId: "raydium",
  quoteTokenSymbol: "SOL",
  quoteTokenAddress: "So11111111111111111111111111111111111111112",
  pairCreatedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
  eligiblePairCount: 2,
  rejectedPairCount: 1,
  ambiguous: true,
  selectionVersion: "pair-selection/v1-highest-liquidity",
};

const byKey = (obs: EvidenceObservation[]) => new Map(obs.map((o) => [o.key, o]));

function build(overrides: Record<string, unknown> = {}) {
  return snapshotToEvidence(normalizeSnapshot(pair(overrides), { capturedAt: CAPTURED }), meta);
}

describe("evidence mapping", () => {
  it("maps normalized data deterministically", () => {
    const a = build();
    const b = build();
    expect(a).toEqual(b);
    expect(a.map((o) => o.key)).toEqual(b.map((o) => o.key));
    expect(byKey(a).get("market.liquidity_usd")).toMatchObject({
      value: 72000,
      unit: "usd",
      status: "observed",
      source: "dexscreener",
      domain: "market",
      schemaVersion: "evidence/v1",
    });
  });

  it("keeps unavailable values null rather than zero", () => {
    const obs = byKey(build({ liquidity: undefined, marketCap: undefined, priceUsd: undefined }));
    for (const key of ["market.liquidity_usd", "market.market_cap_usd", "market.price_usd"]) {
      expect(obs.get(key)!.value).toBeNull();
      expect(obs.get(key)!.status).toBe("unavailable");
    }
  });

  it("keeps genuine zeros as zero", () => {
    const obs = byKey(build());
    expect(obs.get("market.volume_5m_usd")!.value).toBe(0);
    expect(obs.get("market.volume_5m_usd")!.status).toBe("observed");
    expect(obs.get("market.buys_5m")!.value).toBe(0);
    expect(obs.get("market.buys_5m")!.status).toBe("observed");
  });

  it("keeps market cap and FDV as distinct keys", () => {
    const obs = byKey(build());
    expect(obs.get("market.market_cap_usd")!.value).toBe(8000000);
    expect(obs.get("market.fdv_usd")!.value).toBe(9000000);
  });

  it("does not leak provider-specific shapes", () => {
    const serialized = JSON.stringify(build());
    for (const token of ["baseToken", "quoteToken", "chainId", "priceChange", "txns", "h24", "m5"]) {
      expect(serialized).not.toContain(token);
    }
    const allowed = new Set([
      "domain",
      "key",
      "value",
      "unit",
      "source",
      "sourceReference",
      "observedAt",
      "capturedAt",
      "status",
      "confidence",
      "metadata",
      "schemaVersion",
    ]);
    for (const o of build()) {
      for (const field of Object.keys(o)) expect(allowed.has(field)).toBe(true);
    }
  });

  it("preserves captured/source timestamps and provenance", () => {
    const obs = byKey(build());
    for (const o of obs.values()) {
      expect(o.capturedAt).toBe(CAPTURED);
      expect(o.observedAt).toBe(CAPTURED);
      expect(o.sourceReference).toBe("PAIR1");
    }
    expect(obs.get("provenance.pair_created_at")!.value).toBe(
      new Date(Date.UTC(2026, 0, 1)).toISOString(),
    );
    expect(obs.get("provenance.primary_dex")!.value).toBe("raydium");
    expect(obs.get("provenance.quote_token")!.value).toBe("SOL");
    expect(obs.get("provenance.pair_address")!.value).toBe("PAIR1");
  });

  it("treats boosts as descriptive-only evidence", () => {
    const boost = byKey(build()).get("market.active_boosts")!;
    expect(boost.value).toBe(3);
    expect(boost.metadata).toMatchObject({ descriptiveOnly: true, promotional: true });
    const serialized = JSON.stringify(boost);
    for (const word in { quality: 1, score: 1, signal: 1, positive: 1 })
      expect(serialized.toLowerCase()).not.toContain(word);
  });

  it("does not generate holder, creator or social claims", () => {
    const keys = build().map((o) => o.key);
    expect(keys.some((k) => /holder|unique_buyer|unique_seller|creator|dev|social/.test(k))).toBe(
      false,
    );
    const domains = new Set(build().map((o) => o.domain));
    expect([...domains].sort()).toEqual(["market", "provenance"]);
  });
});
