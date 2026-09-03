import { describe, expect, it } from "vitest";
import {
  aggregateStructuralStatus,
  evaluateStructural,
  structuralDiagnostics,
  STRUCTURAL_SHADOW_MODE,
  type MarketStructureFact,
  type MintAccountFact,
} from "./structural";
import { parseMintAccount } from "../external/solana-rpc/client.server";
import { marketStructureFact } from "./structural.server";

const AT = "2026-09-04T00:00:00.000Z";

function mint(overrides: Partial<MintAccountFact> = {}): MintAccountFact {
  return {
    address: "So11111111111111111111111111111111111111112",
    mintAuthority: "REVOKED",
    freezeAuthority: "REVOKED",
    mintAuthorityAddress: null,
    freezeAuthorityAddress: null,
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    source: "solana_rpc",
    observedAt: AT,
    capturedAt: AT,
    unavailable: false,
    unavailableReason: null,
    ...overrides,
  };
}

const okMarket: MarketStructureFact = {
  valid: true,
  pairAddress: "pair",
  dexId: "raydium",
  quoteTokenSymbol: "SOL",
  liquidityUsd: 50_000,
  detail: null,
  source: "dexscreener",
};

describe("structural rules", () => {
  it("passes when both authorities are revoked and a market is confirmed", () => {
    const result = evaluateStructural({ evaluatedAt: AT, mint: mint(), market: okMarket, holders: null });
    expect(result.status).toBe("PASS");
  });

  it("fails on an active mint authority", () => {
    const result = evaluateStructural({
      evaluatedAt: AT,
      mint: mint({ mintAuthority: "ACTIVE", mintAuthorityAddress: "Auth111" }),
      market: okMarket,
      holders: null,
    });
    expect(result.status).toBe("FAIL");
    expect(result.rules.find((r) => r.id === "mint_authority")?.reason).toBe("MINT_AUTHORITY_ACTIVE");
  });

  it("flags an active freeze authority as CONCERN", () => {
    const result = evaluateStructural({
      evaluatedAt: AT,
      mint: mint({ freezeAuthority: "ACTIVE", freezeAuthorityAddress: "Frz111" }),
      market: okMarket,
      holders: null,
    });
    expect(result.status).toBe("CONCERN");
  });

  it("treats unreadable authorities as UNKNOWN, never clean", () => {
    const result = evaluateStructural({
      evaluatedAt: AT,
      mint: mint({ unavailable: true, mintAuthority: "UNKNOWN", freezeAuthority: "UNKNOWN" }),
      market: okMarket,
      holders: null,
    });
    expect(result.status).toBe("UNKNOWN");
  });

  it("fails a confirmed missing market but stays UNKNOWN on provider failure", () => {
    const confirmed = evaluateStructural({
      evaluatedAt: AT,
      mint: mint(),
      market: { ...okMarket, valid: false, pairAddress: null },
      holders: null,
    });
    expect(confirmed.status).toBe("FAIL");

    const failure = evaluateStructural({
      evaluatedAt: AT,
      mint: mint(),
      market: { ...okMarket, valid: null, pairAddress: null },
      holders: null,
    });
    expect(failure.status).toBe("UNKNOWN");
  });

  it("keeps holder evidence as context that cannot move the aggregate", () => {
    const result = evaluateStructural({
      evaluatedAt: AT,
      mint: mint(),
      market: okMarket,
      holders: {
        available: true,
        top10PctOfSupply: 92,
        top20PctOfSupply: 97,
        holderCount: 120,
        labeledPctOfSupply: 100,
        cohorts: [{ cohort: "bundler", walletCount: 12, pctOfSupply: 40 }],
        source: "birdeye",
        observedAt: AT,
        caveats: ["coverage caveat"],
      },
    });
    expect(result.status).toBe("PASS");
    expect(result.context.length).toBeGreaterThan(0);
  });

  it("applies FAIL > CONCERN > UNKNOWN > PASS precedence", () => {
    expect(aggregateStructuralStatus(["PASS", "UNKNOWN", "CONCERN", "FAIL"])).toBe("FAIL");
    expect(aggregateStructuralStatus(["PASS", "UNKNOWN"])).toBe("UNKNOWN");
    expect(aggregateStructuralStatus([])).toBe("UNKNOWN");
  });

  it("stays in shadow mode and reports diagnostics", () => {
    expect(STRUCTURAL_SHADOW_MODE).toBe(true);
    const e = evaluateStructural({ evaluatedAt: AT, mint: mint(), market: okMarket, holders: null });
    expect(e.shadowMode).toBe(true);
    expect(structuralDiagnostics([e]).pass).toBe(1);
  });
});

describe("mint account parsing", () => {
  const account = (info: Record<string, unknown>) => ({
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    data: { parsed: { type: "mint", info } },
  });

  it("reads explicit nulls as revoked", () => {
    const fact = parseMintAccount("Mint1", account({ mintAuthority: null, freezeAuthority: null }), AT);
    expect(fact.mintAuthority).toBe("REVOKED");
    expect(fact.freezeAuthority).toBe("REVOKED");
    expect(fact.unavailable).toBe(false);
  });

  it("reads present authorities as active and keeps the address", () => {
    const fact = parseMintAccount(
      "Mint1",
      account({ mintAuthority: "Auth111", freezeAuthority: "Frz111" }),
      AT,
    );
    expect(fact.mintAuthority).toBe("ACTIVE");
    expect(fact.mintAuthorityAddress).toBe("Auth111");
    expect(fact.freezeAuthority).toBe("ACTIVE");
  });

  it("marks a missing account unavailable rather than revoked", () => {
    const fact = parseMintAccount("Mint1", null, AT);
    expect(fact.unavailable).toBe(true);
    expect(fact.mintAuthority).toBe("UNKNOWN");
  });
});

describe("market structure evidence", () => {
  it("distinguishes provider failure from a confirmed absent market", () => {
    expect(
      marketStructureFact({
        ok: false,
        pairAddress: null,
        liquidityUsd: null,
        reasonDetail: "lookup failed",
        providerFailure: true,
      }).valid,
    ).toBeNull();
    expect(
      marketStructureFact({
        ok: false,
        pairAddress: null,
        liquidityUsd: null,
        reasonDetail: "no market",
      }).valid,
    ).toBe(false);
  });
});
