import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncStageMilestones } from "@/lib/wingman/history.functions";
import { Loader2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { StatTile } from "@/components/wingman/StatTile";
import { EmptyState } from "@/components/wingman/EmptyState";
import { Button } from "@/components/ui/button";
import { useOutcomes } from "@/lib/wingman/hooks";
import { OutcomeService } from "@/lib/wingman/services";
import { HistoryCohortService } from "@/lib/wingman/services/history/cohort-service";
import { StageMilestoneService } from "@/lib/wingman/services/history/stage-service";
import {
  FUNNEL_STAGES,
  STAGE_TERMS,
  filterStageRows,
  sortStageRows,
  summarizeStageRows,
  survivorRowFromCohortToken,
  type FunnelStage,
  type StageRow,
  type StageSetupFilter,
  type StageSort,
} from "@/lib/wingman/services/history/milestones";
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
          "Wingman funnel history by stage: setup qualified, survivors and future AI stages, each measured from its own frozen baseline.",
      },
      { property: "og:title", content: "History & learning — Wingman AI" },
      {
        property: "og:description",
        content: "Funnel-stage cohorts with frozen entry baselines and live market overlay.",
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

type Tab = "OUTCOMES" | FunnelStage;

function HistoryPage() {
  const [tab, setTab] = useState<Tab>("SURVIVOR");
  const queryClient = useQueryClient();
  const sync = useServerFn(syncStageMilestones);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  // Appends missing stage milestones from persisted scanner/outcome records.
  // Existing milestones are never rewritten and no AI stage row is created.
  const runSync = async () => {
    setSyncing(true);
    setSyncNote(null);
    try {
      const result = await sync({} as never);
      setSyncNote(
        `Setup qualified ${result.setupQualifiedTotal} · Survivors ${result.survivorTotal} · mismatches ${result.reconciliationMismatches.length} · incomplete baselines ${result.incompleteBaselines}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["wingman"] });
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : "Milestone sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell
      title="History"
      subtitle="Every funnel stage measured from its own frozen baseline."
      actions={
        <div className="flex items-center gap-3">
          {syncNote ? (
            <span className="tabular text-[11px] text-muted-foreground">{syncNote}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{MOCK_DATA_NOTICE}</span>
          )}
          <Button size="sm" variant="outline" onClick={runSync} disabled={syncing}>
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} /> Sync stage
            milestones
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-1">
          {([...FUNNEL_STAGES, "OUTCOMES"] as Tab[]).map((key) => (
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
              {key === "OUTCOMES" ? "Outcomes" : STAGE_TERMS[key as FunnelStage].title}
            </button>
          ))}
        </div>

        {tab === "OUTCOMES" ? <OutcomesView /> : <StageView stage={tab as FunnelStage} />}
      </div>
    </AppShell>
  );
}

/** One funnel-stage cohort with the live market overlay. */
function StageView({ stage }: { stage: FunnelStage }) {
  const isSurvivor = stage === "SURVIVOR";

  // Survivors keep the existing frozen First Call cohort exactly as it is.
  const survivorQuery = useQuery({
    queryKey: ["wingman", "history-cohort"],
    queryFn: () => HistoryCohortService.calledTokens(),
    enabled: isSurvivor,
  });
  const survivorProvenance = useQuery({
    queryKey: ["wingman", "stage-provenance", "SURVIVOR"],
    queryFn: () => StageMilestoneService.provenanceByToken("SURVIVOR"),
    enabled: isSurvivor,
  });
  const stageQuery = useQuery({
    queryKey: ["wingman", "stage-cohort", stage],
    queryFn: () => StageMilestoneService.stageCohort(stage),
    enabled: !isSurvivor,
  });

  const isLoading = isSurvivor ? survivorQuery.isLoading : stageQuery.isLoading;

  const rows = useMemo<StageRow[]>(() => {
    if (!isSurvivor) return stageQuery.data ?? [];
    return (survivorQuery.data ?? [])
      .filter((t) => t.firstCallAt !== null)
      .map((t) => survivorRowFromCohortToken(t, survivorProvenance.data?.get(t.tokenId) ?? null));
  }, [isSurvivor, stageQuery.data, survivorQuery.data, survivorProvenance.data]);

  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<StageSort>("RECENT");
  const [setupFilter, setSetupFilter] = useState<StageSetupFilter>("ALL");

  const cohort = useMemo(
    () => sortStageRows(filterStageRows(rows, setupFilter), sort),
    [rows, setupFilter, sort],
  );
  const addresses = useMemo(
    () => cohort.map((t) => t.contractAddress).filter((a): a is string => Boolean(a)),
    [cohort],
  );

  const live = useLiveMarket(addresses, true);
  const liveByAddress = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const [address, value] of Object.entries(live.values)) map.set(address, value.marketCap);
    return map;
  }, [live.values]);

  const summary = useMemo(
    () => summarizeStageRows(stage, cohort, liveByAddress),
    [stage, cohort, liveByAddress],
  );

  const active = cohort.find((t) => t.tokenId === selected) ?? null;
  const activeLive = active?.contractAddress ? (live.values[active.contractAddress] ?? null) : null;
  const terms = STAGE_TERMS[stage];

  if (stage === "AI_SHORTLIST" || stage === "THESIS_CALL") {
    return (
      <Section
        title={terms.title}
        description="Reserved for AI triage and thesis synthesis. Nothing is simulated here."
      >
        <EmptyState
          title="No stage entries yet"
          description="This stage is created only by a real AI run, with the exact research packet it saw."
        />
      </Section>
    );
  }

  const setupFilters: StageSetupFilter[] =
    stage === "SURVIVOR" ? ["ALL", "BASE", "REACCEL", "NONE"] : ["ALL", "BASE", "REACCEL"];

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
          {live.lastRefreshedAt
            ? `updated ${relativeTime(live.lastRefreshedAt)}`
            : "awaiting first update"}
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
        title={`${terms.title} cohort`}
        description={
          stage === "SURVIVOR"
            ? "Unique tokens with a frozen First Survivor selection. Descriptive historical measurement — not thesis returns or simulated trading."
            : "Unique tokens the first time they qualified for a recognized BASE or REACCEL setup."
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1">
          <span className="label-xs mr-1">Setup</span>
          {setupFilters.map((key) => (
            <button
              key={key}
              onClick={() => setSetupFilter(key)}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors",
                setupFilter === key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border-strong text-muted-foreground hover:text-foreground",
              )}
            >
              {key}
            </button>
          ))}
          <span className="label-xs mr-1 ml-4">Sort</span>
          {(
            [
              ["RECENT", "Most recent"],
              ["PEAK", `Highest ${terms.peak.toLowerCase()}`],
            ] as [StageSort, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors",
                sort === key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border-strong text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading cohort…</p>
        ) : cohort.length === 0 ? (
          <EmptyState
            title="No stage entries yet"
            description={
              stage === "SURVIVOR"
                ? "A token joins this cohort once it is selected as a Wingman Survivor."
                : "A token joins this cohort the first time it qualifies for BASE or REACCEL."
            }
          />
        ) : (
          <CohortTable stage={stage} tokens={cohort} live={live.values} onSelect={setSelected} />
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
        title="Recorded outcomes"
        description="Descriptive measurement of past Wingman discoveries."
      >
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading outcomes…</p>
        ) : outcomes.length === 0 ? (
          <EmptyState
            title="No outcomes recorded yet"
            description="Outcomes appear once discoveries have been tracked over time."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:pr-4 [&>th]:font-medium">
                  <th>Token</th>
                  <th className="text-right">Thesis</th>
                  <th className="text-right">MC @ discovery</th>
                  <th className="text-right">Peak MC</th>
                  <th className="text-right">Max gain</th>
                  <th className="text-right">Max DD</th>
                  <th>Status</th>
                  <th className="text-right">Discovered</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr
                    key={o.id}
                    className="[&>td]:border-t [&>td]:border-border [&>td]:py-3 [&>td]:pr-4"
                  >
                    <td>
                      <span className="text-sm font-medium">{o.token.name}</span>
                      <span className="tabular block text-[11px] text-muted-foreground">
                        {o.token.ticker}
                      </span>
                    </td>
                    <td className="tabular text-right text-sm">{o.thesisScoreAtDiscovery}</td>
                    <td className="tabular text-right text-sm">
                      {formatUsd(o.marketCapAtDiscoveryUsd)}
                    </td>
                    <td className="tabular text-right text-sm">{formatUsd(o.peakMarketCapUsd)}</td>
                    <td className="tabular text-right text-sm text-positive">+{o.maxGainPct}%</td>
                    <td className="tabular text-right text-sm text-destructive">
                      {o.maxDrawdownPct}%
                    </td>
                    <td>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                          STATUS_TONE[o.status] ?? "border-border-strong text-muted-foreground",
                        )}
                      >
                        {o.status}
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
