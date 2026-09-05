import { describe, expect, it } from "vitest";
import {
  dexScreenerTokenSearchUrl,
  dexScreenerUrlForToken,
} from "@/components/wingman/TokenIdentity";
import { extractPacketIdentity } from "@/lib/wingman/services/research/triage";

const MINT = "8KAPV5bS26u6kvQ4S8o6Fef8Wh7u5iqJWXWyTgzPpump";
const PAIR = "B9d8SzPairAddress1111111111111111111111111";

describe("dexScreenerUrlForToken", () => {
  it("uses the exact resolved pair when available", () => {
    expect(dexScreenerUrlForToken(PAIR, MINT)).toBe(`https://dexscreener.com/solana/${PAIR}`);
  });

  it("falls back to an exact-mint search when no pair is resolved", () => {
    expect(dexScreenerUrlForToken(null, MINT)).toBe(
      `https://dexscreener.com/solana?q=${encodeURIComponent(MINT)}`,
    );
  });

  it("never builds the link from ticker or name", () => {
    const url = dexScreenerUrlForToken(null, MINT);
    expect(url).toContain(MINT);
    expect(url).not.toContain("COT");
  });

  it("same-ticker tokens with different mints produce different links", () => {
    const other = "OtherMint11111111111111111111111111111111";
    expect(dexScreenerUrlForToken(null, MINT)).not.toBe(dexScreenerUrlForToken(null, other));
  });
});

describe("extractPacketIdentity", () => {
  it("reads symbol, name, pair and the authoritative mint from a packet", () => {
    const idn = extractPacketIdentity({
      identity: {
        mint: MINT,
        symbol: "COT",
        name: "Chain Of Thought",
        pairAddress: { value: PAIR, status: "observed" },
      },
    });
    expect(idn).toEqual({ symbol: "COT", name: "Chain Of Thought", pairAddress: PAIR, packetMint: MINT });
  });

  it("is null-safe for missing identity/facts", () => {
    expect(extractPacketIdentity(null)).toEqual({
      symbol: null,
      name: null,
      pairAddress: null,
      packetMint: null,
    });
    expect(extractPacketIdentity({ identity: { symbol: 7, pairAddress: { value: null } } })).toEqual({
      symbol: null,
      name: null,
      pairAddress: null,
      packetMint: null,
    });
  });
});
