import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { StatTile } from "@/components/wingman/StatTile";
import { EmptyState } from "@/components/wingman/EmptyState";
import { useOutcomes } from "@/lib/wingman/hooks";
import { OutcomeService } from "@/lib/wingman/services";
import { formatDate, formatUsd } from "@/lib/wingman/format";
import { MOCK_DATA_NOTICE } from "@/lib/wingman/config";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History & learning — Wingman AI" },
      {
        name: "description",
        content:
          "Past Wingman recommendations with peak market cap, maximum gain and drawdown, used to measure whether the scoring system works.",
      },
      { property: "og:title", content: "History & learning — Wingman AI" },
      {
        property: "og:description",
        content: "Hit rates by thesis score band across past Wingman shortlists.",
      },
    ],
  }),
  component: HistoryPage,
});

const STATUS_TONE: Record<string, string> = {
  TARGET_HIT: "border-positive/40 bg-positive/10 text-positive",
  OPEN: "border-primary/40 bg-primary/10 text-primary",
  EXPIRED: "border-border-strong text-muted-foreground",
  INVALIDATED: "border-destructive/40 bg-destructive/10 text-destructive",
};

function HistoryPage() {
  const { data: outcomes = [], isLoading } = useOutcomes();
  const stats = OutcomeService.stats(outcomes);
  const rate = (band: { hits: number; total: number } | null) =>
    band ? `${Math.round((band.hits / band.total) * 100)}% (${band.hits}/${band.total})` : "—";

  return (
    <AppShell
      title="History"
      subtitle="Did Wingman's scores actually predict anything? Measurement lives here."
      actions={<span className="text-[11px] text-muted-foreground">{MOCK_DATA_NOTICE}</span>}
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Average thesis score"
            value={stats.averageThesisScore ?? "—"}
            detail="Across all discoveries"
          />
          <StatTile
            label="Average max return"
            value={stats.averageMaxReturnPct == null ? "—" : `+${stats.averageMaxReturnPct}%`}
            tone="positive"
            detail="Peak vs discovery market cap"
          />
          <StatTile
            label="Hit rate — 80+"
            value={rate(stats.hitRate80Plus)}
            tone="primary"
            detail="≥100% max gain counts as a hit"
          />
          <StatTile
            label="Hit rate — 70–79"
            value={rate(stats.hitRate70to79)}
            detail="≥100% max gain counts as a hit"
          />
        </div>


        <Section
          title="Previous Recommendations"
          description="Every token that reached the Wingman shortlist."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead>
                <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:font-medium">
                  <th>Token</th>
                  <th className="text-right">Thesis @ discovery</th>
                  <th className="text-right">Entry score</th>
                  <th className="text-right">MC @ discovery</th>
                  <th className="text-right">Peak MC</th>
                  <th className="text-right">Max gain</th>
                  <th className="text-right">Max drawdown</th>
                  <th>Status</th>
                  <th className="text-right">Discovered</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.id} className="[&>td]:border-t [&>td]:border-border [&>td]:py-3">
                    <td>
                      <span className="text-sm font-medium">{o.token.name}</span>
                      <span className="tabular block text-[11px] text-muted-foreground">
                        {o.token.ticker}
                      </span>
                    </td>
                    <td className="tabular text-right text-sm">{o.thesisScoreAtDiscovery}</td>
                    <td className="tabular text-right text-sm">{o.entryScoreAtDiscovery}/10</td>
                    <td className="tabular text-right text-sm">
                      {formatUsd(o.marketCapAtDiscoveryUsd)}
                    </td>
                    <td className="tabular text-right text-sm">{formatUsd(o.peakMarketCapUsd)}</td>
                    <td className="tabular text-right text-sm text-positive">+{o.maxGainPct}%</td>
                    <td className="tabular text-right text-sm text-destructive">
                      {o.maxDrawdownPct}%
                    </td>
                    <td className="px-3">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                          STATUS_TONE[o.status],
                        )}
                      >
                        {o.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="tabular text-right text-xs text-muted-foreground">
                      {formatDate(o.discoveredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
