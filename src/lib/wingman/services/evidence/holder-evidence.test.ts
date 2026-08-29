import { describe, expect, it } from "vitest";
import {
  normalizeHolderDistribution,
  normalizeHolderProfile,
} from "../external/birdeye/normalizer";
import { supportsChain } from "../external/capabilities";
import { birdeyeToEvidence, holderProfileToEvidence } from "./holder-evidence";
import { snapshotToEvidence } from "./market-evidence";
import { buildEvidenceBundle, resolveEvidence } from "./resolver";
import { EVIDENCE_RESOLVER_VERSION } from "./resolved-types";
import type { EvidenceObservation } from "./types";

const CAPTURED = "2026-05-01T12:00:00.000Z";
const ADDRESS = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

function beProfile(overrides: Record<string, unknown> = {}) {
  return {
    token: {
      creation_time: 1_700_000_000,
      market_cap: 8_100_000,
      liquidity: 250_000,
      volume_1h_usd: 40_000,
      top10_holder: { percent_of_supply: 21.5 },
    },
    holder_summary: { total_holder: 120, percent_of_supply: 30 },
    tags: [
      { tag: "bundler", holder_count: 0, percent_of_supply: 0 },
      { tag: "sniper", holder_count: 12, percent_of_supply: 4.2, buy_volume_usd: 900 },
      { tag: "insider", holder_count: 3, percent_of_supply: 2.1 },
      { tag: "dev", holder_count: 1, percent_of_supply: 1.5, avg_buy_price: null },
      { tag: "smart_trader", holder_count: 5, percent_of_supply: 3.3, pnl: -120 },
    ],
    ...overrides,
  };
}

function profileEvidence(overrides: Record<string, unknown> = {}): EvidenceObservation[] {
  return holderProfileToEvidence(
    normalizeHolderProfile(beProfile(overrides), {
      tokenAddress: ADDRESS,
      chain: "solana",
      capturedAt: CAPTURED,
    }),
  );
}

const find = (obs: EvidenceObservation[], key: string) => obs.find((o) => o.key === key);

function marketObservation(
  source: string,
  key: string,
  value: number | null,
): EvidenceObservation {
  return {
    domain: "market",
    key,
    value,
    unit: "usd",
    source,
    sourceReference: `${source}:test`,
    observedAt: CAPTURED,
    capturedAt: CAPTURED,
    status: value === null ? "unavailable" : "observed",
    schemaVersion: "evidence/v1",
  };
}

describe("birdeye holder evidence", () => {
  it("keeps bundler/sniper/insider/dev percentages as separate keys", () => {
    const obs = profileEvidence();
    expect(find(obs, "holders.bundler_pct_of_supply")?.value).toBe(0);
    expect(find(obs, "holders.sniper_pct_of_supply")?.value).toBe(4.2);
    expect(find(obs, "holders.insider_pct_of_supply")?.value).toBe(2.1);
    expect(find(obs, "creator.dev_pct_of_supply")?.value).toBe(1.5);
    expect(find(obs, "holders.smart_trader_pct_of_supply")?.value).toBe(3.3);
  });

  it("never emits a summed suspicious-supply metric", () => {
    const keys = profileEvidence().map((o) => o.key);
    expect(keys.some((k) => /suspicious|combined|total_bad|risk/i.test(k))).toBe(false);
    expect(profileEvidence().every((o) => o.metadata?.["cohortsMayOverlap"] !== false)).toBe(true);
  });

  it("treats a genuine zero bundler percentage as zero", () => {
    expect(find(profileEvidence(), "holders.bundler_pct_of_supply")?.value).toBe(0);
    expect(find(profileEvidence(), "holders.bundler_pct_of_supply")?.status).toBe("observed");
  });

  it("treats a missing bundler field as unavailable, not zero", () => {
    const obs = profileEvidence({ tags: [{ tag: "bundler", holder_count: 4 }] });
    const pct = find(obs, "holders.bundler_pct_of_supply");
    expect(pct?.value).toBeNull();
    expect(pct?.status).toBe("unavailable");
    expect(pct?.value).not.toBe(0);
  });

  it("flags pre-2026-03-01 bundler evidence with a coverage caveat", () => {
    const old = find(profileEvidence(), "holders.bundler_wallet_count");
    expect(old?.metadata?.["bundlerCoverage"]).toBe("historical_backfill_limited");
    expect(old?.metadata?.["absenceIsNotProofOfCleanLaunch"]).toBe(true);

    const recent = profileEvidence({
      token: { ...beProfile().token, creation_time: Math.floor(Date.UTC(2026, 5, 1) / 1000) },
    });
    expect(find(recent, "holders.bundler_wallet_count")?.metadata?.["bundlerCoverage"]).toBe("full");

    const unknown = profileEvidence({ token: { ...beProfile().token, creation_time: null } });
    expect(find(unknown, "holders.bundler_wallet_count")?.metadata?.["bundlerCoverage"]).toBe(
      "unknown_token_age",
    );
  });

  it("labels concentration as raw wallet-level, with no exclusions", () => {
    const distribution = normalizeHolderDistribution(
      { holder: 900, top10_hold_percent: 34.2, items: [] },
      { tokenAddress: ADDRESS, chain: "solana", capturedAt: CAPTURED },
    );
    const obs = birdeyeToEvidence({ distribution, profile: null });
    const top10 = find(obs, "holders.top10_wallet_pct_of_total_supply");
    expect(top10?.value).toBe(34.2);
    expect(top10?.metadata?.["exclusionsApplied"]).toBe("none");
    expect(top10?.metadata?.["lpBurnTreasuryExcluded"]).toBe(false);
    expect(obs.some((o) => o.key.includes("clean_top10"))).toBe(false);
  });

  it("uses wallet-level holder counts rather than token accounts", () => {
    const distribution = normalizeHolderDistribution(
      { holder: 900, top10_hold_percent: 34.2 },
      { tokenAddress: ADDRESS, chain: "solana", capturedAt: CAPTURED },
    );
    expect(distribution.addressType).toBe("wallet");
    const obs = birdeyeToEvidence({ distribution, profile: null });
    expect(find(obs, "holders.wallet_holder_count")?.metadata?.["countBasis"]).toBe(
      "owner_wallet_not_token_account",
    );
  });

  it("preserves provider time where the provider supplies a fact timestamp", () => {
    const created = find(profileEvidence(), "provenance.token_created_at");
    expect(created?.metadata?.["observedAtBasis"]).toBe("provider_time");
    expect(created?.observedAt).toBe(created?.value);
  });

  it("falls back to capture_time when no fact timestamp exists", () => {
    const pct = find(profileEvidence(), "holders.sniper_pct_of_supply");
    expect(pct?.metadata?.["observedAtBasis"]).toBe("capture_time");
    expect(pct?.observedAt).toBe(CAPTURED);
    expect(pct?.capturedAt).toBe(CAPTURED);
  });

  it("records Birdeye labels as provider classifications", () => {
    const pct = find(profileEvidence(), "holders.sniper_pct_of_supply");
    expect(pct?.metadata?.["classificationProvider"]).toBe("birdeye");
    expect(typeof pct?.metadata?.["labelSemanticsVersion"]).toBe("string");
  });

  it("does not leak provider response shapes into evidence", () => {
    for (const o of profileEvidence()) {
      expect(Object.keys(o)).not.toContain("tags");
      expect(o.key.startsWith("holders.") || o.key.startsWith("creator.") || o.key.startsWith("market.") || o.key.startsWith("provenance.")).toBe(true);
      expect(["number", "string", "boolean", "object"]).toContain(typeof o.value);
    }
  });

  it("fails unsupported chains at the capability boundary", () => {
    expect(supportsChain("birdeye", "holder_distribution", "solana")).toBe(true);
    expect(supportsChain("birdeye", "holder_distribution", "ethereum")).toBe(false);
    expect(supportsChain("birdeye", "market_data", "solana")).toBe(false);
  });
});

describe("multi-provider resolution", () => {
  it("confirms the same market metric when providers agree within tolerance", () => {
    const resolved = resolveEvidence(
      [
        marketObservation("dexscreener", "market.market_cap_usd", 8_000_000),
        marketObservation("birdeye", "market.market_cap_usd", 8_100_000),
      ],
      { now: CAPTURED },
    );
    const mc = resolved.find((r) => r.key === "market.market_cap_usd");
    expect(mc?.resolutionStatus).toBe("confirmed");
    expect(mc?.observations).toHaveLength(2);
  });

  it("reports conflict without averaging when providers disagree materially", () => {
    const resolved = resolveEvidence(
      [
        marketObservation("dexscreener", "market.market_cap_usd", 8_000_000),
        marketObservation("birdeye", "market.market_cap_usd", 12_000_000),
      ],
      { now: CAPTURED },
    );
    const mc = resolved.find((r) => r.key === "market.market_cap_usd");
    expect(mc?.resolutionStatus).toBe("conflicting");
    expect([8_000_000, 12_000_000]).toContain(mc?.value);
    expect(mc?.value).not.toBe(10_000_000);
    expect(mc?.conflictingValues).toHaveLength(2);
  });

  it("marks a Birdeye-only holder fact as single_source", () => {
    const resolved = resolveEvidence(profileEvidence(), { now: CAPTURED });
    expect(
      resolved.find((r) => r.key === "holders.sniper_pct_of_supply")?.resolutionStatus,
    ).toBe("single_source");
  });

  it("keeps market evidence working when the holder profile is missing", () => {
    const observations = [
      marketObservation("dexscreener", "market.market_cap_usd", 8_000_000),
      ...birdeyeToEvidence({ distribution: null, profile: null }),
    ];
    const bundle = buildEvidenceBundle(observations, { now: CAPTURED });
    expect(bundle.availability.market).toBe(true);
    expect(bundle.availability.holders).toBe(false);
    expect(bundle.resolved.find((r) => r.key === "market.market_cap_usd")?.value).toBe(8_000_000);
  });

  it("exposes a stable resolver behaviour version", () => {
    expect(EVIDENCE_RESOLVER_VERSION).toBe("evidence-resolver/v1");
  });

  it("does not fabricate social evidence from holder data", () => {
    expect(profileEvidence().some((o) => o.domain === "social")).toBe(false);
  });

  it("combines DexScreener market evidence with Birdeye holder evidence", () => {
    const snapshotEvidence = snapshotToEvidence(
      {
        capturedAt: CAPTURED,
        priceUsd: "0.5",
        marketCap: 8_000_000,
        fdv: 9_000_000,
        liquidityUsd: 250_000,
        volume5m: 0,
        volume1h: 40_000,
        volume6h: null,
        volume24h: null,
        priceChange5m: null,
        priceChange1h: null,
        priceChange6h: null,
        priceChange24h: null,
        buys5m: 0,
        sells5m: 0,
        buys1h: null,
        sells1h: null,
        promotion: { activeBoostCount: null },
      } as never,
      undefined,
    );
    const bundle = buildEvidenceBundle([...snapshotEvidence, ...profileEvidence()], {
      now: CAPTURED,
    });
    expect(bundle.availability.market).toBe(true);
    expect(bundle.availability.holders).toBe(true);
    // Market cap and FDV never collapse into one key.
    expect(bundle.resolved.filter((r) => r.key === "market.fdv_usd")).toHaveLength(1);
    expect(bundle.resolved.filter((r) => r.key === "market.market_cap_usd")).toHaveLength(1);
  });
});
