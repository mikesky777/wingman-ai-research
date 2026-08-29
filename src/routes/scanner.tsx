import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { PIPELINE_STAGES, MOCK_DATA_NOTICE } from "@/lib/wingman/config";
import { useLatestScan, useScanCandidates } from "@/lib/wingman/hooks";
import { formatNumber, formatUsd } from "@/lib/wingman/format";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Scanner pipeline — Wingman AI" },
      {
        name: "description",
        content:
          "See how Wingman narrows thousands of Solana tokens down to a handful of researched theses, stage by stage.",
      },
      { property: "og:title", content: "Scanner pipeline — Wingman AI" },
      {
        property: "og:description",
        content: "Token universe, hard filters, quantitative ranking, AI triage, deep research.",
      },
    ],
  }),
  component: ScannerPage,
});

const STAGE_TONE: Record<string, string> = {
  SHORTLIST: "border-positive/40 bg-positive/10 text-positive",
  DEEP_RESEARCH: "border-primary/40 bg-primary/10 text-primary",
  AI_TRIAGE: "border-border-strong text-muted-foreground",
  QUANT_RANKING: "border-border-strong text-muted-foreground",
  HARD_FILTERS: "border-destructive/40 bg-destructive/10 text-destructive",
};

function ScannerPage() {
  const { data: latestScan } = useLatestScan();
  const { data: candidates = [] } = useScanCandidates(latestScan?.runId);
  const summary = latestScan?.summary;
  const counts: Record<string, number> = {
    universe: summary?.tokensScanned ?? 0,
    hard_filters: summary?.passedFilters ?? 0,
    quant: summary?.quantRanked ?? 0,
    triage: summary?.deepResearched ?? 0,
    deep: summary?.deepResearched ?? 0,
    shortlist: summary?.actionable ?? 0,
  };

  return (
    <AppShell
      title="Scanner"
      subtitle="The funnel from token universe to Wingman shortlist."
      actions={<span className="text-[11px] text-muted-foreground">{MOCK_DATA_NOTICE}</span>}
    >
      <div className="space-y-6">
        <Section title="Pipeline" description="Counts from the most recent completed scan.">
          {!summary ? (
            <EmptyState
              title="No completed scan yet"
              description="Pipeline counts appear after Wingman finishes its first scan cycle."
            />
          ) : (
          <div className="mx-auto max-w-3xl">
            {PIPELINE_STAGES.map((stage, i) => {
              const count = counts[stage.key] ?? 0;
              const pct = (count / Math.max(summary.tokensScanned, 1)) * 100;

              return (
                <div key={stage.key}>
                  <div className="relative overflow-hidden rounded-md border border-border bg-surface/60 px-4 py-3.5">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-700"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-4">
                      <div>
                        <p className="font-mono text-xs tracking-wide">
                          {stage.label.toUpperCase()}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{stage.description}</p>
                      </div>
                      <span
                        className={cn(
                          "tabular text-xl font-semibold",
                          stage.key === "shortlist" && "text-primary",
                        )}
                      >
                        {formatNumber(count)}
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
        </Section>

        <Section
          title="Recently Scanned Candidates"
          description="Every candidate that reached at least the hard-filter stage."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:font-medium">
                  <th>Token</th>
                  <th className="text-right">Market cap</th>
                  <th className="text-right">Liquidity</th>
                  <th className="text-right">Quant score</th>
                  <th>Stage reached</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="[&>td]:border-t [&>td]:border-border [&>td]:py-3">
                    <td>
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="tabular block text-[11px] text-muted-foreground">
                        {c.ticker}
                      </span>
                    </td>
                    <td className="tabular text-right text-sm">{formatUsd(c.marketCapUsd)}</td>
                    <td className="tabular text-right text-sm">{formatUsd(c.liquidityUsd)}</td>
                    <td className="tabular text-right text-sm">{c.quantScore}</td>
                    <td className="px-3">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                          STAGE_TONE[c.stageReached],
                        )}
                      >
                        {c.stageReached.replace("_", " ")}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground">{c.outcome}</td>
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
