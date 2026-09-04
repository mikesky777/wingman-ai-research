/**
 * DexScreener chart embed — VISUAL ONLY.
 *
 * The iframe is never read as a data source: every Wingman calculation keeps
 * using normalized provider/evidence data. It uses the exact pair Wingman
 * already resolved, and degrades to an external link when embedding fails.
 */
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  dexScreenerEmbedUrl,
  dexScreenerPairUrl,
} from "@/lib/wingman/services/history/live-market";

export function DexScreenerEmbed({
  pairAddress,
  contractAddress,
  height = 420,
}: {
  pairAddress: string | null;
  contractAddress?: string | null;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [pairAddress]);

  const fallbackUrl = pairAddress
    ? dexScreenerPairUrl(pairAddress)
    : contractAddress
      ? `https://dexscreener.com/solana/${contractAddress}`
      : null;

  if (!pairAddress || failed) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-surface/60 p-4">
        <p className="text-xs text-muted-foreground">
          {pairAddress
            ? "The embedded chart could not be displayed."
            : "No resolved DexScreener pair for this token."}
        </p>
        {fallbackUrl ? (
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded border border-border-strong px-2 py-1 font-mono text-[10px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3" /> Open on DexScreener
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className="w-full overflow-hidden rounded-md border border-border bg-surface/60"
        style={{ height }}
      >
        <iframe
          key={pairAddress}
          title="DexScreener chart"
          src={dexScreenerEmbedUrl(pairAddress, "dark")}
          className="h-full w-full border-0"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
      <a
        href={dexScreenerPairUrl(pairAddress)}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        <ExternalLink className="size-3" /> Open on DexScreener
      </a>
    </div>
  );
}
