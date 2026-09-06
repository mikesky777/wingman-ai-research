import { describe, expect, it } from "vitest";
import {
  MIN_CURRENT_LIQUIDITY_USD,
  TRADABILITY_POLICY_VERSION,
  evaluateCurrentTradability,
  type CurrentMarketObservation,
} from "./tradability";
import {
  buildProductionShortlist,
  mapDeepResearchStatus,
} from "../production-view";

const obs = (over: Partial<CurrentMarketObservation>): CurrentMarketObservation => ({
  mint: "So11111111111111111111111111111111111111112",
  pairAddress: "PairAddr",
  dexId: "raydium",
  liquidityUsd: 20_000,
  source: "dexscreener",
  observedAt: "2026-09-07T00:00:00.000Z",
  providerFailed: false,
  providerErrorCode: null,
  ...over,
});

describe("pre_deep_research_tradability/v1", () => {
  it("uses the existing $3,000 catastrophic floor, not a new threshold", () => {
    expect(MIN_CURRENT_LIQUIDITY_USD).toBe(3_000);
    expect(TRADABILITY_POLICY_VERSION).toBe("pre_deep_research_tradability/v1");
  });

  it("blocks a collapsed mint (frozen $40k, current $0)", () => {
    const a = evaluateCurrentTradability(obs({ liquidityUsd: 0 }));
    expect(a.result).toBe("BLOCKED");
    expect(a.reasonCode).toBe("CURRENT_LIQUIDITY_BELOW_MINIMUM");
  });

  it("blocks at $2,500", () => {
    expect(evaluateCurrentTradability(obs({ liquidityUsd: 2_500 })).result).toBe("BLOCKED");
  });

  it("passes at $20,000", () => {
    const a = evaluateCurrentTradability(obs({ liquidityUsd: 20_000 }));
    expect(a.result).toBe("TRADABLE");
    expect(a.reasonCode).toBe("CURRENT_LIQUIDITY_OK");
  });

  it("never infers zero when the provider fails", () => {
    const a = evaluateCurrentTradability(
      obs({ providerFailed: true, providerErrorCode: "RATE_LIMITED", liquidityUsd: null }),
    );
    expect(a.result).toBe("NOT_EVALUABLE");
    expect(a.reasonCode).toBe("CURRENT_TRADABILITY_NOT_EVALUABLE");
  });

  it("is NOT_EVALUABLE when no current pair resolves", () => {
    expect(evaluateCurrentTradability(obs({ pairAddress: null })).result).toBe("NOT_EVALUABLE");
    expect(evaluateCurrentTradability(null).result).toBe("NOT_EVALUABLE");
  });

  it("is NOT_EVALUABLE when liquidity is missing on a resolved pair", () => {
    expect(evaluateCurrentTradability(obs({ liquidityUsd: null })).result).toBe("NOT_EVALUABLE");
  });

  it("adds no LP-lock or profile/metadata veto", () => {
    // No profile, no icon, no banner, no LP-lock evidence — still tradable.
    expect(evaluateCurrentTradability(obs({ liquidityUsd: 8_000 })).result).toBe("TRADABLE");
  });
});

describe("shortlist view keeps Triage frozen", () => {
  it("maps a tradability block to its own operational status", () => {
    expect(mapDeepResearchStatus("blocked", null, "CURRENT_LIQUIDITY_BELOW_MINIMUM")).toBe(
      "BLOCKED_TRADABILITY",
    );
    expect(mapDeepResearchStatus("blocked", null, "CURRENT_TRADABILITY_NOT_EVALUABLE")).toBe(
      "BLOCKED_TRADABILITY",
    );
    expect(mapDeepResearchStatus("blocked", null, null)).toBe("BLOCKED");
  });

  it("keeps the DEEP_RESEARCH decision while blocking research", () => {
    const [entry] = buildProductionShortlist(
      [
        {
          mint: "M1",
          symbol: "STONK",
          name: "STONK",
          pairAddress: null,
          triageRank: 3,
          quantRank: 9,
          setup: "NONE",
          decision: "DEEP_RESEARCH",
        },
      ],
      [
        {
          mint: "M1",
          runStatus: "blocked",
          reportId: null,
          reportStatus: null,
          narrativeResolved: null,
          sourceCount: null,
          independentSourceCount: null,
          coveragePct: null,
          researchedAt: null,
          blockedReasonCode: "CURRENT_LIQUIDITY_BELOW_MINIMUM",
          blockedStatement: "Current liquidity fell below the $3,000 operational minimum after Triage.",
          tradabilityLiquidityUsd: 0,
          tradabilityCheckedAt: "2026-09-07T00:00:00.000Z",
        },
      ],
    );
    expect(entry?.decision).toBe("DEEP_RESEARCH");
    expect(entry?.status).toBe("BLOCKED_TRADABILITY");
    expect(entry?.pairAddress).toBeNull(); // historical packet provenance untouched
  });
});
