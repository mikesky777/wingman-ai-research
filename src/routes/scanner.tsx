import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { Button } from "@/components/ui/button";
import { PIPELINE_STAGES } from "@/lib/wingman/config";
import {
  useLatestFunnel,
  useRunDiagnostics,
  useWorkbenchCandidates,
} from "@/lib/wingman/hooks";
import {
  getDiscoveryProviderStatus,
  getScanRunStatus,
  runScan,
} from "@/lib/wingman/scanner.functions";
import {
  DiscoveryProviderPanel,
  type DiscoveryProviderStatus,
} from "@/components/wingman/scanner/DiscoveryProviderPanel";
import {
  scanStatusMessage,
  scanUiState,
  shouldRefreshCandidates,
  type ScanAttempt,
} from "@/lib/wingman/services/scanner/run-lifecycle";
import { getStrategySettings } from "@/lib/wingman/strategy.functions";
import { formatNumber, formatUsd } from "@/lib/wingman/format";
import {
  RefreshMarketButton,
  useMarketRefresh,
} from "@/components/wingman/scanner/RefreshMarketButton";
import { CandidateDrawer } from "@/components/wingman/scanner/CandidateDrawer";
import { DiagnosticsPanels } from "@/components/wingman/scanner/DiagnosticsPanels";
import { ManualCheck } from "@/components/wingman/scanner/ManualCheck";
import { StrategySettingsPanel } from "@/components/wingman/scanner/StrategySettings";
import {
  LANES,
  LANE_TONE,
  PRICE_INTEGRITY_TONE,
  PRICE_STRUCTURE_HINT,
  PRICE_STRUCTURE_LABEL,
  RECURRENCE_HINT,
  RECURRENCE_STATES,
  RECURRENCE_TONE,
  REFRESH_LABEL,
  REFRESH_HINT,
  REFRESH_TONE,
  type RecurrenceFilter,
  disabledSetups,
  enabledSetups,
  formatAge,
  formatRatioPct,
  laneLabel,
  formatOutcomePct,
  outcomeTone,
  priceStructureOf,
  setupOf,
} from "@/components/wingman/scanner/shared";
import type { WorkbenchCandidate } from "@/lib/wingman/services/scanner-service";
import { cn } from "@/lib/utils";
import { assessRecentMarketDamage } from "@/lib/wingman/services/scanner/market-damage";
import { SuspectTable } from "@/components/wingman/scanner/SuspectTable";
import {
  selectSuspects,
  suspectCount,
  type SuspectFilters,
} from "@/lib/wingman/services/scanner/suspect-review";

/** Review-only filters inside the SUSPECT tab. None affect selection. */
const SUSPECT_FILTER_GROUPS: {
  key: keyof Required<SuspectFilters>;
  label: string;
  options: string[];
}[] = [
  { key: "status", label: "PQ", options: ["ALL", "EXTREME", "CONCENTRATED"] },
  { key: "lane", label: "Setup", options: ["ALL", "BASE", "REACCEL"] },
  {
    key: "priceIntegrity",
    label: "PI",
    options: ["ALL", "HEALTHY", "CONCERN", "DAMAGED", "UNKNOWN"],
  },
  { key: "structural", label: "Struct", options: ["ALL", "PASS", "CONCERN", "FAIL", "UNKNOWN"] },
];

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Scanner Workbench — Wingman AI" },
      {
        name: "description",
        content:
          "Live Solana discovery: observable setups, activity state, persistence, reacceleration and quantitative research priority.",
      },
      { property: "og:title", content: "Scanner Workbench — Wingman AI" },
      {
        property: "og:description",
        content:
          "Tokens discovered, hard filters, quantitative ranking and enrichment — Wingman Scanner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScannerPage,
});


type Filter =
  | "SURVIVORS"
  | "SUSPECT"
  | "ALL"
  | "NEAR_MISS"
  | "SETUP_NONE"
  | "EXPLORATION"
  | "OUT_OF_SCOPE"
  | "PI_HEALTHY"
  | "PI_CONCERN"
  | "PI_DAMAGED"
  | "PI_UNKNOWN"
  | "PI_DAMAGED_EXCLUDED"
  | "RECENT_CATASTROPHIC_COLLAPSE"
  | "PQ_BROAD"
  | "PQ_CONCENTRATED"
  | "PQ_EXTREME"
  | "PQ_UNKNOWN"
  | (typeof LANES)[number];

/**
 * Price Integrity calibration views. Every evaluated candidate — including
 * DAMAGED ones vetoed from Survivor selection — stays persisted and clickable.
 */
const PRICE_INTEGRITY_FILTERS: { key: Filter; label: string }[] = [
  { key: "PI_HEALTHY", label: "PI: healthy" },
  { key: "PI_CONCERN", label: "PI: concern" },
  { key: "PI_DAMAGED", label: "PI: damaged" },
  { key: "PI_UNKNOWN", label: "PI: unknown" },
  { key: "PI_DAMAGED_EXCLUDED", label: "Excluded: PRICE_INTEGRITY_DAMAGED" },
];

/**
 * Participation Quality calibration views (shadow). Descriptive labels only —
 * no status here affects Survivor selection.
 */
const PARTICIPATION_FILTERS: { key: Filter; label: string }[] = [
  { key: "PQ_BROAD", label: "PQ: broad" },
  { key: "PQ_CONCENTRATED", label: "PQ: concentrated" },
  { key: "PQ_EXTREME", label: "PQ: extreme" },
  { key: "PQ_UNKNOWN", label: "PQ: unknown" },
];

type StrategyShape = { setups: Record<string, { enabled: boolean }> } | null;

/** Normal Scanner filters: one status view plus the ENABLED setups. */
function normalFilters(strategy: StrategyShape): { key: Filter; label: string }[] {
  return [
    { key: "SURVIVORS" as Filter, label: "Survivors" },
    ...enabledSetups(strategy).map((lane) => ({ key: lane as Filter, label: laneLabel(lane) })),
  ];
}

/** Dataset/debug views plus disabled setups. Kept inside Calibration, never removed. */
function calibrationFilters(strategy: StrategyShape): { key: Filter; label: string }[] {
  return [
    { key: "ALL" as Filter, label: "All candidates" },
    { key: "NEAR_MISS" as Filter, label: "Near misses" },
    { key: "SETUP_NONE" as Filter, label: "Setup: NONE" },
    { key: "EXPLORATION" as Filter, label: "Exploration (NONE, not selected)" },
    { key: "OUT_OF_SCOPE" as Filter, label: "Out of mandate" },
    { key: "RECENT_CATASTROPHIC_COLLAPSE" as Filter, label: "RECENT_CATASTROPHIC_COLLAPSE" },
    ...PRICE_INTEGRITY_FILTERS,
    ...PARTICIPATION_FILTERS,
    ...disabledSetups(strategy).map((lane) => ({
      key: lane as Filter,
      label: `${laneLabel(lane)} (disabled)`,
    })),
  ];
}

type Row = WorkbenchCandidate & { passedNearMiss: boolean };

/** Recurrence view: descriptive history only, never a scanner behavior change. */
function applyRecurrenceFilter(candidates: Row[], filter: RecurrenceFilter): Row[] {
  if (filter === "ALL") return candidates;
  return candidates.filter((c) => c.recurrenceState === filter);
}

function applyFilter(candidates: Row[], filter: Filter): Row[] {
  switch (filter) {
    case "ALL":
      return candidates;
    case "SUSPECT":
      // Review queue only — rendered by its own table, never a reclassification.
      return selectSuspects(candidates);
    case "SURVIVORS":
      return candidates.filter((c) => c.enriched || c.selectedByLaneReservation || c.selectedByGlobalRanking);
    case "OUT_OF_SCOPE":
      // Mandate exclusions: retained and inspectable, never silently dropped.
      return candidates.filter((c) => c.universeEligibility === "OUT_OF_SCOPE");
    case "PI_HEALTHY":
    case "PI_CONCERN":
    case "PI_DAMAGED":
      return candidates.filter((c) => c.priceIntegrityStatus === filter.slice(3));
    case "PI_UNKNOWN":
      // Evaluated but not classifiable. Excludes candidates never evaluated.
      return candidates.filter(
        (c) => c.priceIntegrityStatus === "UNKNOWN" || (c.priceIntegrityPolicyVersion !== null && c.priceIntegrityStatus === null),
      );
    case "PI_DAMAGED_EXCLUDED":
      // Vetoed from Survivor selection by Price Integrity; retained and inspectable.
      return candidates.filter(
        (c) =>
          c.rejectionReason === "PRICE_INTEGRITY_DAMAGED" ||
          (c.priceIntegrityStatus === "DAMAGED" &&
            !c.selectedByLaneReservation &&
            !c.selectedByGlobalRanking),
      );
    case "PQ_BROAD":
    case "PQ_CONCENTRATED":
    case "PQ_EXTREME":
      // Participation Quality is descriptive only; these are calibration views.
      return candidates.filter((c) => c.participationStatus === filter.slice(3));
    case "PQ_UNKNOWN":
      return candidates.filter(
        (c) =>
          c.participationStatus === "UNKNOWN" ||
          (c.participationPolicyVersion !== null && c.participationStatus === null),
      );
    case "RECENT_CATASTROPHIC_COLLAPSE":
      // Temporarily vetoed by the current-market collapse gate. Fully
      // persisted and inspectable; may qualify again on a later scan.
      return candidates.filter(
        (c) =>
          assessRecentMarketDamage(c.priceChange1h).status === "FAIL" &&
          !c.selectedByLaneReservation &&
          !c.selectedByGlobalRanking,
      );
    case "EXPLORATION":
      // High-priority NONE candidates that passed the pipeline but did not get
      // one of the limited NONE exception slots. Review surface only: they stay
      // persisted, never receive First Call, and this view changes nothing.
      return candidates
        .filter(
          (c) =>
            c.lanes.length === 0 &&
            c.quantitativePriority !== null &&
            !c.selectedByLaneReservation &&
            !c.selectedByGlobalRanking,
        )
        .sort((a, b) => (b.quantitativePriority ?? 0) - (a.quantitativePriority ?? 0));
    case "SETUP_NONE":
      // Review view over candidates that matched no recognized setup. NONE is a
      // valid observation, never a negative label, and this filter is display only.
      return candidates.filter((c) => c.lanes.length === 0);
    case "NEAR_MISS":
      // Passed the mechanical filters but was never enriched.
      return candidates.filter(
        (c) => c.passedNearMiss,
      );
    default:
      return candidates
        .filter((c) => c.lanes.includes(filter))
        .sort((a, b) => (a.laneRanks[filter] ?? 1e9) - (b.laneRanks[filter] ?? 1e9));
  }
}

function ScannerPage() {
  const queryClient = useQueryClient();
  const { data: funnel } = useLatestFunnel();
  const { data: rawCandidates = [] } = useWorkbenchCandidates(funnel?.runId);
  const { data: diagnostics } = useRunDiagnostics(funnel?.runId);
  const [filter, setFilter] = useState<Filter>("SURVIVORS");
  const [recurrence, setRecurrence] = useState<RecurrenceFilter>("ALL");
  const [suspectFilters, setSuspectFilters] = useState<Required<SuspectFilters>>({
    status: "ALL",
    lane: "ALL",
    priceIntegrity: "ALL",
    structural: "ALL",
  });
  const [selected, setSelected] = useState<string | null>(null);
  const scan = useServerFn(runScan);
  const loadProviderStatus = useServerFn(getDiscoveryProviderStatus);
  // Diagnostic only: readiness never changes scoring, selection or health.
  const { data: providerStatus } = useQuery({
    queryKey: ["wingman", "discovery-provider-status"],
    queryFn: () => loadProviderStatus() as Promise<DiscoveryProviderStatus>,
    refetchInterval: 120_000,
  });
  const loadStrategy = useServerFn(getStrategySettings);
  const { data: strategyResult } = useQuery({
    queryKey: ["wingman", "strategy-settings"],
    queryFn: () => loadStrategy(),
  });
  const strategy: StrategyShape = strategyResult?.settings ?? null;

  const candidates: Row[] = rawCandidates.map((c) => ({
    ...c,
    passedNearMiss:
      c.rejectionReason === null &&
      !c.enriched &&
      !c.selectedByLaneReservation &&
      !c.selectedByGlobalRanking,
  }));

  // The attempt result is kept separately from persisted state: a resolved
  // POST is never treated as completion on its own.
  const [attempt, setAttempt] = useState<ScanAttempt | null>(null);
  const readRunStatus = useServerFn(getScanRunStatus);
  const watchedRunId = attempt?.runId ?? attempt?.activeRunId ?? null;

  const mutation = useMutation({
    mutationFn: () => scan({ data: {} }),
    onSuccess: (result) => {
      setAttempt({
        code: result.code,
        runId: result.runId,
        activeRunId: result.activeRunId,
        message: result.ok
          ? `Scan complete — ${result.summary?.tokensDiscovered ?? 0} tokens discovered, ${result.summary?.enriched ?? 0} enriched.`
          : (result.message ?? "Scan failed."),
      });
    },
    onError: (error: Error) =>
      setAttempt({ code: "FAILED", runId: null, activeRunId: null, message: error.message }),
  });

  // Poll the real run row while a watched run is still open.
  const { data: runStatus } = useQuery({
    queryKey: ["wingman", "scan-run-status", watchedRunId],
    queryFn: () => readRunStatus({ data: { runId: watchedRunId } }),
    enabled: watchedRunId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 3000;
    },
  });


  const counts: Record<string, number | null> = {
    discovered: funnel?.discovered ?? 0,
    hard_filters: funnel?.passedHardFilters ?? 0,
    quant: funnel?.quantitativelyRanked ?? 0,
    enriched: funnel?.enriched ?? 0,
    triage: null,
    deep: null,
  };
  const maxCount = Math.max(funnel?.discovered ?? 1, 1);
  const rows = applyRecurrenceFilter(applyFilter(candidates, filter), recurrence);
  // Derived review queue over the same persisted rows. No new records.
  const suspectTotal = suspectCount(candidates);
  const suspectRows = selectSuspects(candidates, suspectFilters);
  const active = candidates.find((c) => c.id === selected) ?? null;

  // UI state comes from the real persisted run this session is watching —
  // never from the latest historical run, and never from a resolved POST.
  const runState = scanUiState({
    pending: mutation.isPending,
    attempt,
    watchedRunStatus: runStatus?.status ?? null,
  });
  const message =
    runState === "FAILED" && runStatus?.errorMessage
      ? runStatus.errorMessage
      : scanStatusMessage(runState, attempt);

  // Candidate data refreshes only after a watched run is persisted COMPLETED.
  const completedRunKey = shouldRefreshCandidates(runState) ? watchedRunId : null;
  useEffect(() => {
    if (!completedRunKey) return;
    void queryClient.invalidateQueries({ queryKey: ["wingman"] });
  }, [completedRunKey, queryClient]);

  return (
    <AppShell
      title="Scanner Workbench"
      subtitle="Inspect, explain and calibrate every live scan. No thesis scores, no recommendations."
      actions={
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {funnel?.scannerVersion ?? "scanner/v1"}
            {funnel?.calibrationMode ? " · calibration" : ""}
          </span>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || runState === "RUNNING" || runState === "ALREADY_RUNNING"}
          >
            {mutation.isPending || runState === "RUNNING" || runState === "ALREADY_RUNNING" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Scanning
              </>
            ) : (
              "Run scan"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {message ? (
          <p className="rounded-md border border-border bg-surface/60 px-3 py-2 text-xs text-muted-foreground">
            {message}
          </p>
        ) : null}

        {providerStatus && providerStatus.readiness.state !== "AVAILABLE" ? (
          <DiscoveryProviderPanel status={providerStatus} />
        ) : null}

        <div className="panel flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 font-mono text-xs">
          <span
            className={
              runState === "COMPLETED"
                ? "text-positive"
                : runState === "FAILED"
                  ? "text-negative"
                  : "text-foreground"
            }
          >
            {runState}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular">
            {diagnostics?.durationMs ? `${Math.round(diagnostics.durationMs / 1000)}s` : "—"}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular">{formatNumber(funnel?.discovered ?? 0)} discovered</span>
          <span className="text-muted-foreground">→</span>
          <span className="tabular">{formatNumber(funnel?.passedHardFilters ?? 0)} hard-filtered</span>
          <span className="text-muted-foreground">→</span>
          <span className="tabular">{formatNumber(funnel?.quantitativelyRanked ?? 0)} ranked</span>
          <span className="text-muted-foreground">→</span>
          <span className="tabular text-primary">{formatNumber(funnel?.enriched ?? 0)} enriched</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {diagnostics?.scannerVersion ?? funnel?.scannerVersion ?? "scanner/v1"}
          </span>
        </div>

        <details className="panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Calibration</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Run metadata, pipeline stages and diagnostic breakdowns.
              </p>
            </div>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-6 border-t border-border px-5 py-4">
            <section>
              <h3 className="mb-3 label-xs">Discovery provider</h3>
              {providerStatus ? (
                <DiscoveryProviderPanel status={providerStatus} />
              ) : (
                <p className="text-xs text-muted-foreground">Checking provider readiness…</p>
              )}
            </section>

            <section>
              <h3 className="mb-3 label-xs">Run status</h3>
              <div className="grid gap-3 text-xs sm:grid-cols-3 xl:grid-cols-6">
                {[
                  ["State", runState],
                  [
                    "Started",
                    diagnostics?.startedAt ? new Date(diagnostics.startedAt).toLocaleString() : "—",
                  ],
                  [
                    "Duration",
                    diagnostics?.durationMs ? `${Math.round(diagnostics.durationMs / 1000)}s` : "—",
                  ],
                  ["Survivor limit", diagnostics?.survivorLimit ?? "—"],
                  ["Scanner version", diagnostics?.scannerVersion ?? funnel?.scannerVersion ?? "—"],
                  [
                    "Discovery config",
                    diagnostics?.discoveryConfigVersion ?? funnel?.discoveryConfigVersion ?? "—",
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border border-border bg-surface/60 p-3">
                    <p className="label-xs">{label}</p>
                    <p className="tabular mt-1 text-sm">{String(value)}</p>
                  </div>
                ))}
              </div>
              {diagnostics?.errorMessage ? (
                <p className="mt-3 text-xs text-destructive">{diagnostics.errorMessage}</p>
              ) : null}
            </section>

            <section>
              <h3 className="label-xs">Pipeline</h3>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                Counts from the latest scan. Discovery uses several ranked queries, not every Solana token.
              </p>
              {!funnel ? (
                <EmptyState
                  title="No completed scan yet"
                  description="Run a scan to populate the funnel with live discovery counts."
                />
              ) : (
                <div className="mx-auto max-w-3xl">
                  {PIPELINE_STAGES.map((stage, i) => {
                    const count = counts[stage.key] ?? null;
                    const pct = count === null ? 0 : (count / maxCount) * 100;

                    return (
                      <div key={stage.key}>
                        <div
                          className={cn(
                            "relative overflow-hidden rounded-md border border-border bg-surface/60 px-4 py-3.5",
                            !stage.active && "opacity-55",
                          )}
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-700"
                            style={{ width: `${Math.max(pct, stage.active ? 4 : 0)}%` }}
                          />
                          <div className="relative flex items-center justify-between gap-4">
                            <div>
                              <p className="font-mono text-xs tracking-wide">
                                {stage.label.toUpperCase()}
                                {!stage.active ? " — NOT ACTIVE" : ""}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{stage.description}</p>
                            </div>
                            <span
                              className={cn(
                                "tabular text-xl font-semibold",
                                stage.key === "enriched" && "text-primary",
                                count === null && "text-muted-foreground",
                              )}
                            >
                              {count === null ? "—" : formatNumber(count)}
                            </span>
                          </div>
                        </div>
                        {i < PIPELINE_STAGES.length - 1 ? (
                          <div className="flex justify-center py-1.5">
                            <ChevronDown className="size-4 text-muted-foreground" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h3 className="label-xs">Dataset views</h3>
              <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                Debug views over the same stored scan. They never affect ranking or selection.
              </p>
              <div className="flex flex-wrap gap-1">
                {calibrationFilters(strategy).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "rounded border px-2 py-1 font-mono text-[10px] tracking-wide transition-colors",
                      filter === f.key
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border-strong text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </section>

            <StrategySettingsPanel />

            {diagnostics ? <DiagnosticsPanels diagnostics={diagnostics} /> : null}
          </div>
        </details>

        <Section
          title="Candidates"
          description="Every column is labelled and read from the stored scan. Quantitative priority ranks research effort — it is not a thesis score."
          actions={
            <div className="flex flex-wrap items-center gap-1">
              {normalFilters(strategy).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded border px-2 py-1 font-mono text-[10px] tracking-wide transition-colors",
                    filter === f.key
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border-strong text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
              <button
                onClick={() => setFilter("SUSPECT")}
                title="Review queue for candidates flagged by Participation Quality. Review prompt only — no selection effect."
                className={cn(
                  "rounded border px-2 py-1 font-mono text-[10px] tracking-wide transition-colors",
                  filter === "SUSPECT"
                    ? "border-warning/60 bg-warning/10 text-warning"
                    : "border-border-strong text-muted-foreground hover:text-foreground",
                )}
              >
                SUSPECT
                <span className="ml-1 rounded bg-warning/15 px-1 text-warning">
                  {suspectTotal}
                </span>
              </button>
              <span className="mx-1 h-4 w-px bg-border" />
              {(["ALL", ...RECURRENCE_STATES] as RecurrenceFilter[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRecurrence(r)}
                  title={RECURRENCE_HINT[r] ?? "All candidates, any scan history."}
                  className={cn(
                    "rounded border px-2 py-1 font-mono text-[10px] tracking-wide transition-colors",
                    recurrence === r
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border-strong text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r === "ALL" ? "All history" : r}
                </button>
              ))}
            </div>
          }
        >
          {filter === "SUSPECT" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-1">
                {SUSPECT_FILTER_GROUPS.map((group) => (
                  <div key={group.key} className="flex items-center gap-1">
                    <span className="label-xs pl-1 pr-0.5">{group.label}</span>
                    {group.options.map((option) => {
                      const activeOption = suspectFilters[group.key] === option;
                      return (
                        <button
                          key={`${group.key}-${option}`}
                          onClick={() =>
                            setSuspectFilters((prev) => ({ ...prev, [group.key]: option }))
                          }
                          className={cn(
                            "rounded border px-2 py-1 font-mono text-[10px] tracking-wide transition-colors",
                            activeOption
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border-strong text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option === "ALL" ? "all" : option}
                        </button>
                      );
                    })}
                    <span className="mx-1 h-4 w-px bg-border" />
                  </div>
                ))}
              </div>
              <SuspectTable rows={suspectRows} onSelect={setSelected} />
            </>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No candidates in this view"
              description="Change the filter, or run a scan to populate live candidates."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:pr-4 [&>th]:font-medium [&>th]:whitespace-nowrap [&>th:last-child]:pr-0">
                    <th className="w-10">Rank</th>
                    <th>Token</th>
                    <th className="text-right">Market cap</th>
                    <th className="text-right">Liquidity</th>
                    <th className="text-right">Age</th>
                    <th className="text-right">24h volume</th>
                    <th className="text-right">Turnover</th>
                    <th>Setup</th>
                    <th title="Price / launch integrity label. Independent of setup classification; never affects Survivor selection.">
                      Price structure
                    </th>
                    <th>Seen</th>
                    <th className="text-right" title="Market-cap change since Wingman first observed this token.">
                      Since seen
                    </th>
                    <th className="text-right" title="Market-cap change since Wingman first selected this token as a Survivor.">
                      Since call
                    </th>
                    <th
                      className="text-right"
                      title="Maximum observed market-cap gain since Wingman's first Survivor call. Historical observation, not simulated or realized trading profit."
                    >
                      Peak call
                    </th>
                    <th
                      className="text-right"
                      title="Worst observed market-cap move below Wingman's first Survivor call."
                    >
                      Max DD call
                    </th>

                    <th className="text-right">Priority</th>
                    <th className="w-8" title="Refresh current market data for this token." />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(c.id)}
                      className="cursor-pointer transition-colors hover:bg-secondary/50 [&>td]:border-t [&>td]:border-border [&>td]:py-3 [&>td]:pr-4 [&>td:last-child]:pr-0"
                    >
                      <td className="tabular text-xs text-muted-foreground">
                        {LANES.includes(filter as (typeof LANES)[number])
                          ? (c.laneRanks[filter as (typeof LANES)[number]] ?? "—")
                          : (c.globalRank ?? "—")}
                      </td>
                      <td className="pr-3">
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="tabular block text-[11px] text-muted-foreground">
                          {c.symbol}
                        </span>
                      </td>
                      <td className="tabular text-right text-sm">
                        {c.marketCap === null ? "—" : formatUsd(c.marketCap)}
                      </td>
                      <td className="tabular text-right text-sm">
                        {c.liquidityUsd === null ? "—" : formatUsd(c.liquidityUsd)}
                      </td>
                      <td className="tabular text-right text-sm text-muted-foreground">
                        {formatAge(c.ageMinutes)}
                      </td>
                      <td className="tabular text-right text-sm">
                        {c.volume24h === null ? "—" : formatUsd(c.volume24h)}
                      </td>
                      <td className="tabular text-right text-sm">
                        {formatRatioPct(c.turnover24h)}
                      </td>
                      <td className="px-3" data-testid="setup-cell">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                              LANE_TONE[setupOf(c)] ?? "border-border-strong",
                            )}
                            title={
                              c.lanes.length === 0
                                ? "Passed hard filters, matched no recognized setup. Not a rejection."
                                : undefined
                            }
                          >
                            {laneLabel(setupOf(c))}
                          </span>
                          {c.lanes.length > 1 ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              +{c.lanes.length - 1}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3" data-testid="price-structure-cell">
                        {(() => {
                          const structure = priceStructureOf(c);
                          if (structure === "NOT_EVALUATED") {
                            return (
                              <span
                                className="font-mono text-[10px] text-muted-foreground"
                                title={PRICE_STRUCTURE_HINT.NOT_EVALUATED}
                              >
                                —
                              </span>
                            );
                          }
                          return (
                            <span
                              className={cn(
                                "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                                PRICE_INTEGRITY_TONE[structure] ?? "border-border-strong",
                              )}
                              title={PRICE_STRUCTURE_HINT[structure]}
                            >
                              {PRICE_STRUCTURE_LABEL[structure]}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3">
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                            RECURRENCE_TONE[c.recurrenceState] ?? "border-border-strong",
                          )}
                          title={RECURRENCE_HINT[c.recurrenceState] ?? ""}
                        >
                          {c.recurrenceState}
                        </span>
                        <span
                          className={cn(
                            "ml-1 rounded border px-1 py-0.5 font-mono text-[9px] tracking-wide",
                            REFRESH_TONE[c.refreshState] ?? "border-border-strong",
                          )}
                          title={REFRESH_HINT[c.refreshState] ?? ""}
                        >
                          {REFRESH_LABEL[c.refreshState] ?? "—"}
                        </span>
                        {c.scansSeenCount > 1 ? (
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                            ×{c.scansSeenCount}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={cn(
                          "tabular text-right text-sm",
                          outcomeTone(c.outcome?.sinceSeenPct),
                        )}
                      >
                        {formatOutcomePct(c.outcome?.sinceSeenPct)}
                      </td>
                      <td
                        className={cn(
                          "tabular text-right text-sm",
                          outcomeTone(c.outcome?.sinceCallPct),
                        )}
                      >
                        {c.outcome?.firstCallAt ? formatOutcomePct(c.outcome.sinceCallPct) : "—"}
                      </td>
                      <td
                        className={cn(
                          "tabular text-right text-sm",
                          outcomeTone(c.outcome?.peakMarketCapSinceCallPct),
                        )}
                        title="Maximum observed market-cap gain since Wingman's first Survivor call. Historical observation, not simulated or realized trading profit."
                      >
                        {c.outcome?.firstCallAt
                          ? formatOutcomePct(c.outcome.peakMarketCapSinceCallPct)
                          : "—"}
                      </td>
                      <td
                        className={cn(
                          "tabular text-right text-sm",
                          outcomeTone(c.outcome?.maxAdverseSinceCallPctV2),
                        )}
                        title="Worst observed market-cap move below Wingman's first Survivor call."
                      >
                        {c.outcome?.firstCallAt
                          ? formatOutcomePct(c.outcome.maxAdverseSinceCallPctV2)
                          : "—"}
                      </td>

                      <td className="tabular text-right text-sm font-semibold">
                        {c.quantitativePriority ?? "—"}
                      </td>
                      <td className="text-right">
                        <RefreshCell contractAddress={c.contractAddress} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filter === "SUSPECT" ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              SUSPECT is a review queue derived from the persisted Participation Quality evaluation
              of this scan. Every token here also remains in its normal setup view; nothing is
              reclassified, excluded or duplicated, and no label asserts botting or wash trading.
            </p>
          ) : null}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Gate hierarchy: Universe OUT_OF_SCOPE excludes, Structural FAIL vetoes, Price Integrity is a label only and never removes a candidate from Survivor selection. Setup labels describe observable market behaviour only. The scanner produces no thesis scores and creates no opportunities. Research reports and
            opportunity records elsewhere in Wingman remain simulated demo data.
          </p>
        </Section>

        <ManualCheck />
      </div>

      <CandidateDrawer
        candidate={active}
        scanRunId={funnel?.runId ?? null}
        onClose={() => setSelected(null)}
      />
    </AppShell>
  );
}

/** Per-row manual market refresh. Appends an observation; never edits the scan row. */
function RefreshCell({ contractAddress }: { contractAddress: string | null }) {
  const refresh = useMarketRefresh(contractAddress);
  return (
    <RefreshMarketButton
      contractAddress={contractAddress}
      pending={refresh.pending}
      disabled={refresh.disabled}
      onClick={refresh.refresh}
    />
  );
}
