import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { StatTile } from "@/components/wingman/StatTile";
import { EmptyState } from "@/components/wingman/EmptyState";
import { Button } from "@/components/ui/button";
import { useOutcomes } from "@/lib/wingman/hooks";
import { OutcomeService } from "@/lib/wingman/services";
import { HistoryCohortService } from "@/lib/wingman/services/history/cohort-service";
import {
  HISTORY_SETUPS,
  cohortFor,
  summarizeCohort,
  type HistorySetup,
} from "@/lib/wingman/services/history/cohort";
import { LIVE_REFRESH_INTERVAL_MS } from "@/lib/wingman/services/history/live-market";
import { CohortSummaryCards } from "@/components/wingman/history/CohortSummary";
import { CohortTable } from "@/components/wingman/history/CohortTable";
import { HistoryTokenDrawer } from "@/components/wingman/history/HistoryTokenDrawer";
import { useLiveMarket } from "@/components/wingman/history/useLiveMarket";
import { formatDate, formatUsd, relativeTime } from "@/lib/wingman/format";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

type Tab = "OUTCOMES" | HistorySetup;

function HistoryPage() {
  const [tab, setTab] = useState<Tab>("OUTCOMES");
  const cohortActive = tab !== "OUTCOMES";

  return (
    <AppShell
      title="History"
      subtitle="Did Wingman's scores actually predict anything? Measurement lives here."
      actions={<span className="text-[11px] text-muted-foreground">{MOCK_DATA_NOTICE}</span>}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-1">
          {(["OUTCOMES", ...HISTORY_SETUPS] as Tab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors",
                tab === key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border-strong text-muted-foreground hover:text-foreground",
              )}
            >
              {key}
            </button>
          ))}
        </div>

        {cohortActive ? <CohortView setup={tab as HistorySetup} /> : <OutcomesView />}
      </div>
    </AppShell>
  );
}

/** BASE / REACCEL cohort view with the live market overlay. */
function CohortView({ setup }: { setup: HistorySetup }) {
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["wingman", "history-cohort"],
    queryFn: () => HistoryCohortService.calledTokens(),
  });
  const [selected, setSelected] = useState<string | null>(null);

  const cohort = useMemo(() => cohortFor(tokens, setup), [tokens, setup]);
  const addresses = useMemo(
    () => cohort.map((t) => t.contractAddress).filter((a): a is string => Boolean(a)),
    [cohort],
  );

  const live = useLiveMarket(addresses, true);
  const liveByToken = useMemo(() => {
    const map = new Map<string, { marketCap: number | null }>();
    for (const [address, value] of Object.entries(live.values)) {
      map.set(address, { marketCap: value.marketCap });
    }
    return map;
  }, [live.values]);

  const summary = useMemo(
    () => summarizeCohort(tokens, setup, liveByToken),
    [tokens, setup, liveByToken],
  );

  const active = cohort.find((t) => t.tokenId === selected) ?? null;
  const activeLive = active?.contractAddress ? (live.values[active.contractAddress] ?? null) : null;

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 font-mono text-xs">
        <span className="flex items-center gap-1.5 text-positive">
          <span className="size-1.5 rounded-full bg-positive" /> LIVE
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          every {Math.round(LIVE_REFRESH_INTERVAL_MS / 1000)}s while this tab is visible
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular text-muted-foreground">
          {live.lastRefreshedAt ? `updated ${relativeTime(live.lastRefreshedAt)}` : "awaiting first update"}
        </span>
        {live.isRefreshing ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> refreshing
          </span>
        ) : null}
        {live.error ? <span className="text-destructive">{live.error}</span> : null}
        <Button size="sm" variant="outline" className="ml-auto" onClick={live.refreshNow}>
          <RefreshCw className={cn("size-3.5", live.isRefreshing && "animate-spin")} /> Refresh now
        </Button>
      </div>

      <CohortSummaryCards summary={summary} />

      <Section
        title={`${setup} cohort`}
        description="Unique tokens with a frozen First Wingman Call. Descriptive historical measurement — not simulated trading returns."
      >
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading cohort…</p>
        ) : cohort.length === 0 ? (
          <EmptyState
            title={`No ${setup} calls yet`}
            description="A token joins this cohort once it is selected as a Wingman Survivor with this setup."
          />
        ) : (
          <CohortTable tokens={cohort} live={live.values} onSelect={setSelected} />
        )}
      </Section>

      <details className="panel group">
        <summary className="cursor-pointer list-none px-5 py-3 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
          Live refresh diagnostics
        </summary>
        <div className="grid gap-3 border-t border-border px-5 py-4 text-xs sm:grid-cols-3 xl:grid-cols-6">
          {[
            ["Batches", live.diagnostics.batches],
            ["Addresses refreshed", live.diagnostics.addressesRefreshed],
            ["Provider requests", live.diagnostics.providerRequests],
            ["Skipped (tab hidden)", live.diagnostics.skippedHidden],
            ["Observations persisted", live.diagnostics.persistedObservations],
            ["Writes avoided (recent)", live.diagnostics.persistenceSkippedRecent],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-border bg-surface/60 p-3">
              <p className="label-xs">{label}</p>
              <p className="tabular mt-1 text-sm">{String(value)}</p>
            </div>
          ))}
        </div>
      </details>

      <HistoryTokenDrawer token={active} live={activeLive} onClose={() => setSelected(null)} />
    </div>
  );
}

function OutcomesView() {
  const { data: outcomes = [], isLoading } = useOutcomes();
  const stats = OutcomeService.stats(outcomes);
  const rate = (band: { hits: number; total: number } | null) =>
    band ? `${Math.round((band.hits / band.total) * 100)}% (${band.hits}/${band.total})` : "—";

  return (
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
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading outcomes…</p>
        ) : outcomes.length === 0 ? (
          <EmptyState
            title="No recorded outcomes yet"
            description="Outcome tracking begins once promoted opportunities have measurable history."
          />
        ) : (
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
        )}
      </Section>
    </div>
  );
}
