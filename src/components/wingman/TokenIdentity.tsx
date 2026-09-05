/**
 * Canonical token identity block: ticker, name, full exact mint and actions.
 *
 * Exact mint is the authoritative identity. The DexScreener link reuses the
 * resolved exact pair when Wingman has one and falls back to an exact-mint
 * search URL — it is never built from ticker/name.
 */
import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dexScreenerPairUrl } from "@/lib/wingman/services/history/live-market";

/** Exact-mint DexScreener search link used when no resolved pair is stored. */
export function dexScreenerTokenSearchUrl(mint: string): string {
  return `https://dexscreener.com/solana?q=${encodeURIComponent(mint)}`;
}

export function dexScreenerUrlForToken(pairAddress: string | null, mint: string): string {
  return pairAddress ? dexScreenerPairUrl(pairAddress) : dexScreenerTokenSearchUrl(mint);
}

export function CopyCaButton({ mint, className }: { mint: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className={className ?? "h-6 gap-1 px-2 text-[10px]"}
      onClick={() => {
        void navigator.clipboard.writeText(mint);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy CA"}
    </Button>
  );
}

export function DexScreenerLink({
  pairAddress,
  mint,
  className,
}: {
  pairAddress: string | null;
  mint: string;
  className?: string;
}) {
  return (
    <Button asChild variant="outline" size="sm" className={className ?? "h-6 gap-1 px-2 text-[10px]"}>
      <a
        href={dexScreenerUrlForToken(pairAddress, mint)}
        target="_blank"
        rel="noreferrer noopener"
        title={pairAddress ? "Exact resolved DexScreener pair" : "Exact-mint DexScreener search"}
      >
        DexScreener
        <ExternalLink className="size-3" />
      </a>
    </Button>
  );
}

/**
 * Full identity stack used in table rows and detail headers:
 * SYMBOL — name — full mint (never truncated on desktop) — actions.
 */
export function TokenIdentity({
  symbol,
  name,
  mint,
  pairAddress,
}: {
  symbol: string | null;
  name: string | null;
  mint: string;
  pairAddress: string | null;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold">{symbol ?? "—"}</span>
        {name ? <span className="text-[11px] text-muted-foreground">{name}</span> : null}
      </div>
      <p className="font-mono text-[10px] break-all text-muted-foreground" title={mint}>
        {mint}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <CopyCaButton mint={mint} />
        <DexScreenerLink pairAddress={pairAddress} mint={mint} />
      </div>
    </div>
  );
}
