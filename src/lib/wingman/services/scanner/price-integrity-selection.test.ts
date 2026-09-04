/**
 * Gate-hierarchy tests.
 *
 *   Universe OUT_OF_SCOPE -> excluded
 *   Structural FAIL       -> vetoed
 *   Price Integrity       -> LABEL ONLY, never excluded
 */
import { describe, expect, it } from "vitest";
import { assignRanks, evaluateCandidate, rankCandidates, selectSurvivorsWithReservations } from "./index";
import { classifyUniverse } from "./universe";
import {
  PRICE_INTEGRITY_IS_VETO,
  PRICE_INTEGRITY_SELECTION_EFFECT,
  isPriceIntegrityEligible,
  type PriceIntegrityStatus,
} from "./price-integrity";
import type { DiscoveredToken, EvaluatedCandidate } from "./types";

const NOW = "2026-04-01T12:00:00.000Z";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const STATUSES: PriceIntegrityStatus[] = ["HEALTHY", "CONCERN", "DAMAGED", "UNKNOWN"];

function minutesAgo(minutes: number): string {
  return new Date(Date.parse(NOW) - minutes * 60_000).toISOString();
}

/** A post-bond token that qualifies as BASE on its own merits. */
function baseToken(address: string, overrides: Partial<DiscoveredToken> = {}): DiscoveredToken {
  return {
    chain: "solana",
    contractAddress: address,
    symbol: "BASE",
    name: "Base Token",
    priceUsd: 0.001,
    marketCap: 900_000,
    fdv: 900_000,
    liquidityUsd: 180_000,
    volume5m: 4_000,
    volume1h: 40_000,
    volume6h: 200_000,
    volume24h: 700_000,
    priceChange1h: 4,
    priceChange6h: 9,
    priceChange24h: 20,
    trades5m: 40,
    trades1h: 400,
    trades24h: 4_000,
    buys24h: 2_100,
    sells24h: 1_900,
    holderCount: 3_000,
    uniqueWallets24h: 900,
    pairCreatedAt: minutesAgo(60 * 24 * 20),
    tokenCreatedAt: null,
    lastTradeAt: minutesAgo(1),
    pairAddress: "pair",
    dexId: "raydium",
    discovery: [{ source: "birdeye", queryId: "q", family: "volume", rank: 1 }],
    ...overrides,
  } as DiscoveredToken;
}

function withPriceIntegrity(c: EvaluatedCandidate, status: PriceIntegrityStatus) {
  // Price Integrity is attached AFTER evaluation, exactly as the pipeline does.
  (c as EvaluatedCandidate & { priceIntegrity: unknown }).priceIntegrity = {
    status,
    policyVersion: "price_integrity/v1.1",
  };
  return c;
}

describe("price integrity is label only", () => {
  it("declares no selection effect", () => {
    expect(PRICE_INTEGRITY_SELECTION_EFFECT).toBe("NONE");
    expect(PRICE_INTEGRITY_IS_VETO).toBe(false);
    for (const status of [...STATUSES, null]) {
      expect(isPriceIntegrityEligible(status)).toBe(true);
    }
  });

  it("keeps a DAMAGED BASE eligible and lets it consume a survivor slot", () => {
    const damaged = withPriceIntegrity(
      evaluateCandidate(baseToken("Damaged11111111111111111111111111111111111"), { nowIso: NOW }),
      "DAMAGED",
    );
    expect(damaged.lanes).toContain("BASE");
    const selection = selectSurvivorsWithReservations(assignRanks(rankCandidates([damaged])), 5);
    expect(selection.survivors.map((s) => s.token.contractAddress)).toContain(
      damaged.token.contractAddress,
    );
    expect(selection.structurallyVetoed).toHaveLength(0);
  });

  it("selects identically for every status — no slot is removed or backfilled", () => {
    const results = STATUSES.map((status) => {
      const candidates = [
        withPriceIntegrity(
          evaluateCandidate(baseToken("Aaaa11111111111111111111111111111111111111"), {
            nowIso: NOW,
          }),
          status,
        ),
        withPriceIntegrity(
          evaluateCandidate(
            baseToken("Bbbb22222222222222222222222222222222222222", { marketCap: 700_000 }),
            { nowIso: NOW },
          ),
          status,
        ),
      ];
      const selection = selectSurvivorsWithReservations(
        assignRanks(rankCandidates(candidates)),
        5,
      );
      return {
        addresses: selection.survivors.map((s) => s.token.contractAddress).sort(),
        priorities: candidates.map((c) => c.quantitativePriority),
        lanes: candidates.map((c) => c.lanes.join(",")),
      };
    });
    for (const r of results) {
      expect(r).toEqual(results[0]);
      expect(r.addresses).toHaveLength(2);
    }
  });

  it("cannot alter quantitative priority or setup qualification", () => {
    const plain = evaluateCandidate(baseToken("Cccc33333333333333333333333333333333333333"), {
      nowIso: NOW,
    });
    const labelled = withPriceIntegrity(
      evaluateCandidate(baseToken("Cccc33333333333333333333333333333333333333"), { nowIso: NOW }),
      "DAMAGED",
    );
    expect(labelled.quantitativePriority).toBe(plain.quantitativePriority);
    expect(labelled.lanes).toEqual(plain.lanes);
    expect(labelled.priorityComponents).toEqual(plain.priorityComponents);
  });
});

describe("deterministic gates still apply", () => {
  it("structural FAIL still vetoes even when price integrity is HEALTHY", () => {
    const c = withPriceIntegrity(
      evaluateCandidate(baseToken("Dddd44444444444444444444444444444444444444"), { nowIso: NOW }),
      "HEALTHY",
    );
    c.structural = { status: "FAIL" } as EvaluatedCandidate["structural"];
    const selection = selectSurvivorsWithReservations(assignRanks(rankCandidates([c])), 5);
    expect(selection.survivors).toHaveLength(0);
    expect(selection.structurallyVetoed).toHaveLength(1);
  });

  it("universe OUT_OF_SCOPE still excludes even when price integrity is HEALTHY", () => {
    const c = withPriceIntegrity(
      evaluateCandidate(baseToken(USDC), { nowIso: NOW, universe: classifyUniverse(USDC) }),
      "HEALTHY",
    );
    expect(c.rejection?.reason).toBe("OUT_OF_SCOPE_ASSET");
    const selection = selectSurvivorsWithReservations(assignRanks(rankCandidates([c])), 5);
    expect(selection.survivors).toHaveLength(0);
  });
});
