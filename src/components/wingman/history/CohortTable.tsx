/**
 * History stage table — one row per UNIQUE token inside one funnel stage.
 *
 * Stage-entry values stay visible next to LIVE values so the distinction
 * between immutable history and the current market remains auditable.
 */
import { formatDate, formatUsd, relativeTime } from "@/lib/wingman/format";
import { cn } from "@/lib/utils";
import {
  STAGE_TERMS,
  liveSinceStagePct,
  type FunnelStage,
  type StageRow,
} from "@/lib/wingman/services/history/milestones";
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
  stage,
  tokens,
  live,
  onSelect,
}: {
  stage: FunnelStage;
  tokens: StageRow[];
  live: Record<string, LiveMarketValues>;
  onSelect: (tokenId: string) => void;
}) {
  const terms = STAGE_TERMS[stage];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left">
        <thead>
          <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:pr-4 [&>th]:font-medium [&>th]:whitespace-nowrap">
            <th>Token</th>
            <th>Setup</th>
            <th className="text-right">{terms.entry}</th>
            <th className="text-right" title="Current market cap from the live overlay.">
              Live MC
            </th>
            <th className="text-right">Live liquidity</th>
            <th className="text-right">Live 24h vol</th>
            <th className="text-right">1h</th>
            <th className="text-right">24h</th>
            <th className="text-right">{terms.since}</th>
            <th className="text-right">{terms.peak}</th>
            <th className="text-right">{terms.maxDd}</th>
            <th className="text-right">Entered</th>
            <th>Seen now</th>
            <th className="text-right">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => {
            const l = t.contractAddress ? live[t.contractAddress] : undefined;
            const since = liveSinceStagePct(t, l?.marketCap ?? null);
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
                <td>
                  <span className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                    {t.setups.length > 0 ? t.setups.join("+") : "NONE"}
                  </span>
                </td>
                <td className="tabular text-right text-sm text-muted-foreground">
                  {t.entryMarketCap === null ? "—" : formatUsd(t.entryMarketCap)}
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
                <td className="tabular text-right text-sm text-primary">{pct(t.peakPct)}</td>
                <td className="tabular text-right text-sm text-destructive">
                  {pct(t.maxAdversePct)}
                </td>
                <td className="tabular text-right text-xs text-muted-foreground">
                  {t.enteredAt ? formatDate(t.enteredAt) : "—"}
                </td>
                <td>
                  {t.latestRecurrenceState ? (
                    <span className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                      {t.latestRecurrenceState}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="tabular text-right text-xs text-muted-foreground">
                  {t.latestObservationAt ? relativeTime(t.latestObservationAt) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
