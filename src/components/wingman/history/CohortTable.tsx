/**
 * History cohort table — one row per UNIQUE token.
 *
 * Scan-time values stay visible next to LIVE values so the distinction
 * between immutable history and the current market remains auditable.
 */
import { formatDate, formatUsd } from "@/lib/wingman/format";
import { cn } from "@/lib/utils";
import type { CohortToken } from "@/lib/wingman/services/history/cohort";
import { liveSinceCallPct } from "@/lib/wingman/services/history/cohort";
import type { LiveMarketValues } from "@/lib/wingman/services/history/live-market";

function pct(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function tone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-positive";
  if (value < 0) return "text-destructive";
  return "";
}

export function CohortTable({
  tokens,
  live,
  onSelect,
}: {
  tokens: CohortToken[];
  live: Record<string, LiveMarketValues>;
  onSelect: (tokenId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left">
        <thead>
          <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:pr-4 [&>th]:font-medium [&>th]:whitespace-nowrap">
            <th>Token</th>
            <th className="text-right">MC @ call</th>
            <th className="text-right" title="Current market cap from the live overlay.">
              Live MC
            </th>
            <th className="text-right">Live liquidity</th>
            <th className="text-right">Live 24h vol</th>
            <th className="text-right">1h</th>
            <th className="text-right">24h</th>
            <th className="text-right">Since call</th>
            <th className="text-right">Peak call</th>
            <th className="text-right">Max DD call</th>
            <th className="text-right">First call</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => {
            const l = t.contractAddress ? live[t.contractAddress] : undefined;
            const since = liveSinceCallPct(t, l ? { marketCap: l.marketCap } : null);
            return (
              <tr
                key={t.tokenId}
                onClick={() => onSelect(t.tokenId)}
                className="cursor-pointer transition-colors hover:bg-secondary/50 [&>td]:border-t [&>td]:border-border [&>td]:py-3 [&>td]:pr-4"
              >
                <td>
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="tabular block text-[11px] text-muted-foreground">{t.symbol}</span>
                </td>
                <td className="tabular text-right text-sm text-muted-foreground">
                  {t.firstCallMarketCap === null ? "—" : formatUsd(t.firstCallMarketCap)}
                </td>
                <td className="tabular text-right text-sm">
                  {l?.marketCap != null
                    ? formatUsd(l.marketCap)
                    : t.currentMarketCap !== null
                      ? formatUsd(t.currentMarketCap)
                      : "—"}
                </td>
                <td className="tabular text-right text-sm">
                  {l?.liquidityUsd != null ? formatUsd(l.liquidityUsd) : "—"}
                </td>
                <td className="tabular text-right text-sm">
                  {l?.volume24h != null ? formatUsd(l.volume24h) : "—"}
                </td>
                <td className={cn("tabular text-right text-sm", tone(l?.priceChange1h ?? null))}>
                  {pct(l?.priceChange1h ?? null)}
                </td>
                <td className={cn("tabular text-right text-sm", tone(l?.priceChange24h ?? null))}>
                  {pct(l?.priceChange24h ?? null)}
                </td>
                <td className={cn("tabular text-right text-sm", tone(since))}>{pct(since)}</td>
                <td className="tabular text-right text-sm text-primary">
                  {pct(t.peakSinceCallPct)}
                </td>
                <td className="tabular text-right text-sm text-destructive">
                  {pct(t.maxAdverseSinceCallPct)}
                </td>
                <td className="tabular text-right text-xs text-muted-foreground">
                  {t.firstCallAt ? formatDate(t.firstCallAt) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
