import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
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
import { runScan } from "@/lib/wingman/scanner.functions";
import { getStrategySettings } from "@/lib/wingman/strategy.functions";
import { formatNumber, formatUsd } from "@/lib/wingman/format";
import { CandidateDrawer } from "@/components/wingman/scanner/CandidateDrawer";
import { DiagnosticsPanels } from "@/components/wingman/scanner/DiagnosticsPanels";
import { ManualCheck } from "@/components/wingman/scanner/ManualCheck";
import { StrategySettingsPanel } from "@/components/wingman/scanner/StrategySettings";
import {
  LANES,
  LANE_TONE,
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
} from "@/components/wingman/scanner/shared";
import type { WorkbenchCandidate } from "@/lib/wingman/services/scanner-service";
import { cn } from "@/lib/utils";

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


type Filter = "SURVIVORS" | "ALL" | "NEAR_MISS" | "OUT_OF_SCOPE" | (typeof LANES)[number];

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
    { key: "OUT_OF_SCOPE" as Filter, label: "Out of mandate" },
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
    case "SURVIVORS":
      return candidates.filter((c) => c.enriched || c.selectedByLaneReservation || c.selectedByGlobalRanking);
    case "OUT_OF_SCOPE":
      // Mandate exclusions: retained and inspectable, never silently dropped.
      return candidates.filter((c) => c.universeEligibility === "OUT_OF_SCOPE");
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
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("SURVIVORS");
  const [recurrence, setRecurrence] = useState<RecurrenceFilter>("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const scan = useServerFn(runScan);
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

  const mutation = useMutation({
    mutationFn: () => scan({ data: {} }),
    onSuccess: (result) => {
      setMessage(
        result.ok
          ? `Scan complete — ${result.summary?.tokensDiscovered ?? 0} tokens discovered, ${result.summary?.enriched ?? 0} enriched.`
          : (result.message ?? "Scan failed."),
      );
      void queryClient.invalidateQueries({ queryKey: ["wingman"] });
    },
    onError: (error: Error) => setMessage(error.message),
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
  const active = candidates.find((c) => c.id === selected) ?? null;

  const runState = mutation.isPending
    ? "RUNNING"
    : (diagnostics?.status ?? funnel?.status ?? "IDLE").toUpperCase();

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
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
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

        <div className="panel flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 font-mono text-xs">
          <span className={runState === "COMPLETED" ? "text-positive" : "text-foreground"}>
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
          {rows.length === 0 ? (
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
                    <th>Primary lane</th>
                    <th>Seen</th>
                    <th className="text-right" title="Market-cap change since Wingman first observed this token.">
                      Since seen
                    </th>
                    <th className="text-right" title="Market-cap change since Wingman first selected this token as a Survivor.">
                      Since call
                    </th>
                    <th className="text-right">Priority</th>
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
                        {filter !== "ALL" && filter !== "SURVIVORS" && filter !== "NEAR_MISS"
                          ? (c.laneRanks[filter] ?? "—")
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
                      <td className="px-3">
                        {c.lanes.length === 0 ? (
                          <span
                            className={cn(
                              "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                              LANE_TONE["NONE"],
                            )}
                            title="Passed hard filters, matched no recognized setup. Not a rejection."
                          >
                            NONE
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                                LANE_TONE[c.lanes[0] ?? "UNKNOWN"] ?? "border-border-strong",
                              )}
                            >
                              {laneLabel(c.lanes[0] ?? "UNKNOWN")}
                            </span>
                            {c.lanes.length > 1 ? (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                +{c.lanes.length - 1}
                              </span>
                            ) : null}
                          </div>
                        )}
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
                      <td className="tabular text-right text-sm font-semibold">
                        {c.quantitativePriority ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Setup labels describe observable market behaviour only. The scanner produces no thesis scores and creates no opportunities. Research reports and
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
