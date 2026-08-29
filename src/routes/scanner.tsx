import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { Button } from "@/components/ui/button";
import { PIPELINE_STAGES } from "@/lib/wingman/config";
import { useLatestFunnel, useRankedCandidates } from "@/lib/wingman/hooks";
import { runScan } from "@/lib/wingman/scanner.functions";
import { formatNumber, formatUsd } from "@/lib/wingman/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Scanner pipeline — Wingman AI" },
      {
        name: "description",
        content:
          "Live Solana discovery: lifecycle lanes, activity state, persistence, reacceleration and quantitative research priority.",
      },
      { property: "og:title", content: "Scanner pipeline — Wingman AI" },
      {
        property: "og:description",
        content:
          "Tokens discovered, hard filters, quantitative ranking and enrichment — Wingman Scanner v1.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScannerPage,
});

const LANE_TONE: Record<string, string> = {
  EARLY_MOMENTUM: "border-primary/40 bg-primary/10 text-primary",
  POST_BOND_BASE: "border-positive/40 bg-positive/10 text-positive",
  DEVELOPING_THESIS: "border-border-strong text-muted-foreground",
  REACCELERATION: "border-border-strong text-foreground",
};

const SIGNAL_TONE: Record<string, string> = {
  ACCELERATING: "text-positive",
  EXTREME: "text-destructive",
  ACTIVE: "text-foreground",
  LOW: "text-muted-foreground",
  DORMANT: "text-muted-foreground",
  HIGH: "text-positive",
  MODERATE: "text-foreground",
  CONFIRMED: "text-positive",
  EARLY: "text-primary",
  NONE: "text-muted-foreground",
  UNKNOWN: "text-muted-foreground",
  POSITIVE: "text-positive",
  NEGATIVE: "text-destructive",
  NEUTRAL: "text-muted-foreground",
};

const EXTENSION_TONE: Record<string, string> = {
  LOW: "text-positive",
  MODERATE: "text-foreground",
  HIGH: "text-destructive",
  EXTREME: "text-destructive",
  UNKNOWN: "text-muted-foreground",
};

function formatAge(minutes: number | null): string {
  if (minutes === null) return "unknown";
  if (minutes < 90) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function formatPct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
}

function ScannerPage() {
  const queryClient = useQueryClient();
  const { data: funnel } = useLatestFunnel();
  const { data: candidates = [] } = useRankedCandidates(funnel?.runId);
  const [message, setMessage] = useState<string | null>(null);
  const scan = useServerFn(runScan);

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

  return (
    <AppShell
      title="Scanner"
      subtitle="Live Solana discovery, lifecycle classification and research prioritisation."
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

        <Section
          title="Pipeline"
          description="Counts from the most recent completed scan. Wingman discovers through several ranked queries — it does not scan every Solana token."
        >
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
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {stage.description}
                          </p>
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
        </Section>

        <Section
          title="Ranked Candidates"
          description="Live scanner data. Quantitative priority ranks research effort — it is not a thesis score."
        >
          {candidates.length === 0 ? (
            <EmptyState
              title="No ranked candidates"
              description="Candidates appear once a scan completes and tokens match a lifecycle lane."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left">
                <thead>
                  <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:font-medium">
                    <th>Token</th>
                    <th className="text-right">Market cap</th>
                    <th className="text-right">Age</th>
                    <th>Lane(s)</th>
                    <th className="text-right">24h volume</th>
                    <th className="text-right">Turnover</th>
                    <th>Activity</th>
                    <th>Persist.</th>
                    <th>Reaccel.</th>
                    <th>Extension</th>
                    <th className="text-right">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} className="[&>td]:border-t [&>td]:border-border [&>td]:py-3">
                      <td className="pr-3">
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="tabular block text-[11px] text-muted-foreground">
                          {c.symbol}
                        </span>
                      </td>
                      <td className="tabular text-right text-sm">
                        {c.marketCap === null ? "—" : formatUsd(c.marketCap)}
                      </td>
                      <td className="tabular text-right text-sm text-muted-foreground">
                        {formatAge(c.ageMinutes)}
                      </td>
                      <td className="px-3">
                        <div className="flex flex-wrap gap-1">
                          {c.lanes.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            c.lanes.map((lane) => (
                              <span
                                key={lane}
                                className={cn(
                                  "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                                  LANE_TONE[lane] ?? "border-border-strong",
                                )}
                              >
                                {lane.replace(/_/g, " ")}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="tabular text-right text-sm">
                        {c.volume24h === null ? "—" : formatUsd(c.volume24h)}
                      </td>
                      <td className="tabular text-right text-sm">{formatPct(c.turnover24h)}</td>
                      <td
                        className={cn(
                          "px-3 font-mono text-[10px]",
                          SIGNAL_TONE[c.activityState ?? "UNKNOWN"],
                        )}
                      >
                        {c.activityState ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 font-mono text-[10px]",
                          SIGNAL_TONE[c.persistenceSignal ?? "UNKNOWN"],
                        )}
                      >
                        {c.persistenceSignal ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 font-mono text-[10px]",
                          SIGNAL_TONE[c.reaccelerationSignal ?? "UNKNOWN"],
                        )}
                      >
                        {c.reaccelerationSignal ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 font-mono text-[10px]",
                          EXTENSION_TONE[c.extensionRisk ?? "UNKNOWN"],
                        )}
                      >
                        {c.extensionRisk ?? "—"}
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
            Scanner v1 produces no thesis scores and creates no opportunities. Research reports and
            opportunity records elsewhere in Wingman remain simulated demo data.
          </p>
        </Section>
      </div>
    </AppShell>
  );
}
