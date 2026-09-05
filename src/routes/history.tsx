import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncStageMilestones } from "@/lib/wingman/history.functions";
import { Loader2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { Button } from "@/components/ui/button";
import { HistoryCohortService } from "@/lib/wingman/services/history/cohort-service";
import { StageMilestoneService } from "@/lib/wingman/services/history/stage-service";
import {
  STAGE_TERMS,
  filterStageRows,
  sortStageRows,
  stageSupportsPeakMetrics,
  summarizeStageRows,
  survivorRowFromCohortToken,
  type FunnelStage,
  type LiveQuote,
  type StageRow,
  type StageSetupFilter,
  type StageSort,
} from "@/lib/wingman/services/history/milestones";
import {
  POLICY_LABELS,
  filterByPolicy,
  type PolicyFilter,
} from "@/lib/wingman/services/history/policy-epochs";
import { LIVE_REFRESH_INTERVAL_MS } from "@/lib/wingman/services/history/live-market";
import { CohortSummaryCards } from "@/components/wingman/history/CohortSummary";
import { CohortTable } from "@/components/wingman/history/CohortTable";
import { HistoryTokenDrawer } from "@/components/wingman/history/HistoryTokenDrawer";
import { useLiveMarket } from "@/components/wingman/history/useLiveMarket";
import { ProductionArtifacts } from "@/components/wingman/history/ProductionArtifacts";
import {
  DeepResearchArtifacts,
  ThesisSynthesizedArtifacts,
} from "@/components/wingman/history/ArtifactViews";
import { relativeTime } from "@/lib/wingman/format";
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

/**
 * History tabs follow the real production funnel. Deep Research and Thesis
 * Synthesized are ARTIFACT tabs: real persisted reports with no stage-relative
 * performance baseline. The legacy seeded Outcomes view is not part of the
 * production workflow; those demo rows remain untouched in the database.
 */
type Tab = FunnelStage | "DEEP_RESEARCH" | "THESIS_SYNTHESIZED";

const TABS: { key: Tab; label: string }[] = [
  { key: "SETUP_QUALIFIED", label: STAGE_TERMS.SETUP_QUALIFIED.title },
  { key: "SURVIVOR", label: STAGE_TERMS.SURVIVOR.title },
  { key: "AI_SHORTLIST", label: STAGE_TERMS.AI_SHORTLIST.title },
  { key: "DEEP_RESEARCH", label: "Deep Research" },
  { key: "THESIS_SYNTHESIZED", label: "Thesis Synthesized" },
  { key: "THESIS_CALL", label: STAGE_TERMS.THESIS_CALL.title },
];

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
        <ProductionArtifacts />

        <div className="flex flex-wrap items-center gap-1">
          {TABS.map(({ key, label }) => (
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
              {label}
            </button>
          ))}
        </div>

        {tab === "DEEP_RESEARCH" ? (
          <DeepResearchArtifacts />
        ) : tab === "THESIS_SYNTHESIZED" ? (
          <ThesisSynthesizedArtifacts />
        ) : (
          <StageView stage={tab} />
        )}
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
  const survivorPolicy = useQuery({
    queryKey: ["wingman", "stage-policy", "SURVIVOR"],
    queryFn: () => StageMilestoneService.policyByToken("SURVIVOR"),
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
      .map((t) =>
        survivorRowFromCohortToken(
          t,
          survivorProvenance.data?.get(t.tokenId) ?? null,
          survivorPolicy.data?.get(t.tokenId) ?? null,
        ),
      );
  }, [isSurvivor, stageQuery.data, survivorQuery.data, survivorProvenance.data, survivorPolicy.data]);

  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<StageSort>("RECENT");
  const [setupFilter, setSetupFilter] = useState<StageSetupFilter>("ALL");
  const [policy, setPolicy] = useState<PolicyFilter>("CURRENT");

  // Setup Qualified is deliberately NOT policy-filtered: qualifying for a setup
  // never meant Survivor eligibility, so a policy cohort there would imply a
  // selection decision that was never made.
  const policyApplies = stage === "SURVIVOR" || stage === "AI_SHORTLIST" || stage === "THESIS_CALL";

  const cohort = useMemo(
    () =>
      sortStageRows(
        filterStageRows(policyApplies ? filterByPolicy(rows, policy) : rows, setupFilter),
        sort,
      ),
    [rows, setupFilter, sort, policy, policyApplies],
  );
  const addresses = useMemo(
    () => cohort.map((t) => t.contractAddress).filter((a): a is string => Boolean(a)),
    [cohort],
  );

  const live = useLiveMarket(addresses, true);
  // Liquidity travels with the quote so `outcome_market_validity/v1` can reject
  // drained-pool prints instead of publishing a valid-looking Since Stage.
  const liveByAddress = useMemo(() => {
    const map = new Map<string, LiveQuote | null>();
    for (const [address, value] of Object.entries(live.values)) {
      map.set(address, { marketCap: value.marketCap, liquidityUsd: value.liquidityUsd });
    }
    return map;
  }, [live.values]);

  const summary = useMemo(
    () => summarizeStageRows(stage, cohort, liveByAddress),
    [stage, cohort, liveByAddress],
  );

  const active = cohort.find((t) => t.tokenId === selected) ?? null;
  const activeLive = active?.contractAddress ? (live.values[active.contractAddress] ?? null) : null;
  const terms = STAGE_TERMS[stage];
  const supportsSeries = stageSupportsPeakMetrics(stage);

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
            ? `Unique tokens with a frozen First Survivor selection. ${policy === "CURRENT" ? `Only calls made under ${POLICY_LABELS.CURRENT_V1.toLowerCase()} (CURRENT_V1).` : "Every historical call, across all policy eras."} Descriptive historical measurement — not thesis returns or simulated trading.`
            : stage === "SETUP_QUALIFIED"
              ? "Unique tokens the first time they qualified for a recognized BASE or REACCEL setup."
              : stage === "AI_SHORTLIST"
                ? "Unique tokens the AI triage layer shortlisted, measured from the frozen market state at shortlisting. Stage-relative peak and drawdown are not tracked for this stage."
                : "Unique tokens whose thesis passed every opportunity gate. Created only by a real thesis run."
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {policyApplies ? (
            <>
              <span className="label-xs mr-1">Policy</span>
              {(
                [
                  ["CURRENT", "Current"],
                  ["ALL", "All history"],
                ] as [PolicyFilter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPolicy(key)}
                  className={cn(
                    "rounded border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors",
                    policy === key
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border-strong text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
              <span className="mr-1 ml-4" />
            </>
          ) : null}
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
            supportsSeries
              ? ([
                  ["RECENT", "Most recent"],
                  ["PEAK", `Highest ${terms.peak.toLowerCase()}`],
                ] as [StageSort, string][])
              : ([["RECENT", "Most recent"]] as [StageSort, string][])
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
              policyApplies && policy === "CURRENT" && rows.length > 0
                ? "No calls have been made yet under the current policy. Switch to All history to see earlier calls, measured under the rules that were live at the time."
                : stage === "SURVIVOR"
                  ? "A token joins this cohort once it is selected as a Wingman Survivor."
                  : stage === "SETUP_QUALIFIED"
                    ? "A token joins this cohort the first time it qualifies for BASE or REACCEL."
                    : "This stage is created only by a real AI run, with the exact research packet it saw."
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
