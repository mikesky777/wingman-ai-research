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
  liveSinceStage,
  stageSupportsPeakMetrics,
  type FunnelStage,
  type StageRow,
} from "@/lib/wingman/services/history/milestones";
import type { LiveMarketValues } from "@/lib/wingman/services/history/live-market";
import { POLICY_LABELS } from "@/lib/wingman/services/history/policy-epochs";

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
  // Peak / max-drawdown columns exist only where an outcome series is tracked.
  const showSeries = stageSupportsPeakMetrics(stage);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left">
        <thead>
          <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:pr-4 [&>th]:font-medium [&>th]:whitespace-nowrap">
            <th>Token</th>
            <th>Setup</th>
            <th>Policy</th>
            <th className="text-right">{terms.entry}</th>
            <th className="text-right" title="Current market cap from the live overlay.">
              Live MC
            </th>
            <th className="text-right">Live liquidity</th>
            <th className="text-right">Live 24h vol</th>
            <th className="text-right">1h</th>
            <th className="text-right">24h</th>
            <th className="text-right">{terms.since}</th>
            {showSeries ? <th className="text-right">{terms.peak}</th> : null}
            {showSeries ? (
              <th
                className="text-right"
                title="Worst decline from a post-entry running peak. Never positive."
              >
                {terms.maxDd}
              </th>
            ) : null}
            <th className="text-right">Entered</th>
            <th>Seen now</th>
            <th className="text-right">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => {
            const l = t.contractAddress ? live[t.contractAddress] : undefined;
            const since = liveSinceStage(
              t,
              l ? { marketCap: l.marketCap, liquidityUsd: l.liquidityUsd } : null,
            );
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
                <td>
                  <span
                    title={POLICY_LABELS[t.policyEpoch] ?? t.policyEpoch}
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                      t.policyEpoch === "CURRENT_V1"
                        ? "border-primary/40 text-primary"
                        : "border-border-strong text-muted-foreground",
                    )}
                  >
                    {t.policyEpoch}
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
                <td
                  className={cn(
                    "tabular text-right text-sm",
                    since.source === "LIVE_INVALID" ? "text-warning" : tone(since.pct),
                  )}
                  title={
                    since.source === "LIVE_INVALID"
                      ? `Current market observation invalid (${since.reason ?? "INVALID_MARKET"}) — preserved for audit, excluded from metrics.`
                      : undefined
                  }
                >
                  {since.source === "LIVE_INVALID" ? "Unavailable" : pct(since.pct)}
                </td>
                {showSeries ? (
                  <td className="tabular text-right text-sm text-primary">{pct(t.peakPct)}</td>
                ) : null}
                {showSeries ? (
                  <td className="tabular text-right text-sm text-destructive">
                    {pct(t.drawdownPct)}
                  </td>
                ) : null}
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
