/**
 * Exact-mint identity resolution for Deep Research (server-only).
 *
 * Memecoin tickers collide constantly. Nothing enters a dossier as VERIFIED
 * unless it is tied to the exact mint string, or comes from a link published
 * on the token's own on-chain-indexed pair metadata.
 */
import { DexScreenerAdapter, type DsPair } from "../../external/dexscreener";

export interface OfficialLink {
  url: string;
  label: string | null;
  kind: "website" | "social";
}

export interface MintIdentity {
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  officialLinks: OfficialLink[];
  pairAddress: string | null;
  resolved: boolean;
}

/** Case-sensitive exact-mint containment: base58 is case-significant. */
export function mentionsMint(text: string, mint: string): boolean {
  if (!text || !mint) return false;
  return text.includes(mint);
}

/** Ticker-only match — never sufficient for VERIFIED, only PROBABLE. */
export function mentionsSymbol(text: string, symbol: string | null): boolean {
  if (!text || !symbol) return false;
  const clean = symbol.replace(/^\$/, "").trim();
  if (clean.length < 3) return false;
  return new RegExp(`\\$?\\b${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function linksFromPair(pair: DsPair): OfficialLink[] {
  const out: OfficialLink[] = [];
  for (const site of pair.info?.websites ?? []) {
    if (site.url) out.push({ url: site.url, label: site.label ?? null, kind: "website" });
  }
  for (const social of pair.info?.socials ?? []) {
    if (social.url) out.push({ url: social.url, label: social.type ?? null, kind: "social" });
  }
  return out.filter((l, i, a) => a.findIndex((x) => x.url === l.url) === i);
}

/**
 * Resolve the token's own identity and official links from its primary pair.
 * Failure is non-fatal: research continues with `resolved: false`.
 */
export async function resolveMintIdentity(input: {
  mint: string;
  chain?: string;
  fallbackSymbol?: string | null;
  fallbackName?: string | null;
}): Promise<MintIdentity> {
  const base: MintIdentity = {
    mint: input.mint,
    chain: input.chain ?? "solana",
    symbol: input.fallbackSymbol ?? null,
    name: input.fallbackName ?? null,
    officialLinks: [],
    pairAddress: null,
    resolved: false,
  };
  try {
    const selection = await DexScreenerAdapter.resolvePrimaryPair(input.mint);
    const pair = selection.primary;
    const isBase = pair.baseToken?.address === input.mint;
    const token = isBase ? pair.baseToken : pair.quoteToken;
    return {
      ...base,
      symbol: token?.symbol ?? base.symbol,
      name: token?.name ?? base.name,
      officialLinks: linksFromPair(pair),
      pairAddress: pair.pairAddress ?? null,
      resolved: true,
    };
  } catch {
    return base;
  }
}
