/**
 * History ARTIFACT tabs: Deep Research and Thesis Synthesized.
 *
 * These stages are backed by real persisted production reports, but no
 * stage-relative performance baseline was captured for them, so no since /
 * peak / drawdown / win-rate number is ever shown or invented here.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Section, KeyValue } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { getHistoryArtifacts } from "@/lib/wingman/history.functions";
import { formatDate } from "@/lib/wingman/format";
import {
  ARTIFACT_NO_BASELINE_NOTE as NO_BASELINE_NOTE,
  type DeepResearchArtifact,
  type ThesisArtifact,
} from "@/lib/wingman/services/history/artifacts";

function useArtifacts() {
  const fetchArtifacts = useServerFn(getHistoryArtifacts);
  return useQuery({
    queryKey: ["wingman", "history-artifacts"],
    queryFn: () => fetchArtifacts(),
  });
}

function ArtifactCard({
  identity,
  headline,
  summary,
  details,
  openLabel,
}: {
  identity: { mint: string; symbol: string | null; name: string | null; pairAddress: string | null };
  headline: React.ReactNode;
  summary: string | null;
  details: { label: string; value: React.ReactNode }[];
  openLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TokenIdentity
          symbol={identity.symbol}
          name={identity.name}
          mint={identity.mint}
          pairAddress={identity.pairAddress}
        />
        <div className="text-right text-[11px] text-muted-foreground">{headline}</div>
      </div>
      {summary ? <p className="mt-2 text-[11px] text-muted-foreground">{summary}</p> : null}
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex items-center gap-1 font-mono text-[10px] tracking-wide text-primary"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {openLabel}
      </button>
      {open ? (
        <div className="mt-3 border-t border-border pt-3">
          <KeyValue columns={2} items={details} />
        </div>
      ) : null}
    </li>
  );
}

export function DeepResearchArtifacts() {
  const { data, isLoading } = useArtifacts();
  const rows: DeepResearchArtifact[] = data?.deepResearch ?? [];

  return (
    <Section
      title="Deep Research"
      description={`Completed production Deep Research reports. ${NO_BASELINE_NOTE}`}
    >
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading Deep Research artifacts…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No production Deep Research reports yet"
          description="A report appears here only after a real production Deep Research run completes."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <ArtifactCard
              key={r.reportId}
              identity={r}
              openLabel="Open report"
              headline={
                <>
                  <span className="tabular block">
                    {r.completedAt ? formatDate(r.completedAt) : "—"}
                  </span>
                  <span>{r.narrativeResolved ? "Narrative resolved" : "Narrative unresolved"}</span>
                </>
              }
              summary={r.oneSentenceNarrative}
              details={[
                { label: "Sources", value: r.sourceCount ?? "—" },
                { label: "Independent sources", value: r.independentSourceCount ?? "—" },
                {
                  label: "Evidence coverage",
                  value: r.coveragePct === null ? "—" : `${r.coveragePct.toFixed(0)}%`,
                },
                { label: "Research policy", value: r.researchPolicyVersion ?? "—" },
                { label: "Dossier version", value: r.dossierVersion ?? "—" },
                { label: "Search version", value: r.searchVersion ?? "—" },
                { label: "Model", value: r.modelIdentifier ?? "—" },
                { label: "Model provider", value: r.modelProvider ?? "—" },
                { label: "Prompt version", value: r.promptVersion ?? "—" },
                { label: "Report id", value: r.reportId },
                { label: "Performance baseline", value: NO_BASELINE_NOTE },
              ]}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

const SORTS: { id: ThesisArtifactSort; label: string }[] = [
  { id: "RECENT", label: "Most recent" },
  { id: "SCORE", label: "Thesis score" },
  { id: "PEAK", label: "Best peak" },
  { id: "SINCE", label: "Best since thesis" },
  { id: "WORST_DD", label: "Worst drawdown" },
];

function pctText(value: number | null, digits = 1): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function statDetail(stat: ArtifactStat): string {
  return `n=${stat.n}`;
}

function ThesisSummaryCards({ summary }: { summary: ThesisPerformanceSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Avg since thesis"
        value={pctText(summary.avgSince.value)}
        tone={(summary.avgSince.value ?? 0) > 0 ? "positive" : "default"}
        detail={`${statDetail(summary.avgSince)} · live vs frozen thesis baseline`}
      />
      <StatTile
        label="Median since thesis"
        value={pctText(summary.medianSince.value)}
        detail={statDetail(summary.medianSince)}
      />
      <StatTile
        label="Avg peak since thesis"
        value={pctText(summary.avgPeak.value)}
        tone="primary"
        detail={`${statDetail(summary.avgPeak)} · persisted observations`}
      />
      <StatTile
        label="Median peak since thesis"
        value={pctText(summary.medianPeak.value)}
        detail={statDetail(summary.medianPeak)}
      />
      <StatTile
        label="Win rate"
        value={summary.winRate.value === null ? "—" : `${summary.winRate.value.toFixed(0)}%`}
        detail={`${statDetail(summary.winRate)} · since thesis > 0`}
      />
      <StatTile
        label="Theses measured"
        value={`${summary.artifactsWithBaseline} · ${summary.uniqueTokens} tokens`}
        detail="Each synthesis event counts once"
      />
      <StatTile
        label="Avg max DD since thesis"
        value={pctText(summary.avgMaxDd.value)}
        detail={`${statDetail(summary.avgMaxDd)} · peak-to-trough decline`}
      />
      <StatTile
        label="Median max DD since thesis"
        value={pctText(summary.medianMaxDd.value)}
        detail={statDetail(summary.medianMaxDd)}
      />
    </div>
  );
}

function ThesisPerformanceRow({ row }: { row: ThesisArtifact }) {
  if (!row.baseline || !row.performance) {
    return (
      <p className="mt-2 rounded border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground">
        {THESIS_NO_BASELINE_NOTE}
      </p>
    );
  }
  const p = row.performance;
  return (
    <div className="tabular mt-2 grid grid-cols-3 gap-2 rounded border border-border bg-background/40 px-2 py-1.5 text-[11px]">
      <span className={p.sincePct !== null && p.sincePct > 0 ? "text-positive" : undefined}>
        Since {pctText(p.sincePct)}
      </span>
      <span className="text-primary">Peak {pctText(p.peakPct)}</span>
      <span className="text-destructive">Max DD {pctText(p.drawdownPct)}</span>
    </div>
  );
}

export function ThesisSynthesizedArtifacts() {
  const { data, isLoading } = useArtifacts();
  const [sort, setSort] = useState<ThesisArtifactSort>("RECENT");
  const rows: ThesisArtifact[] = data?.thesis ?? [];
  const sorted = sortThesisArtifacts(rows, sort);
  const summary = summarizeThesisArtifacts(rows);
  const unmeasured = rows.length - summary.artifactsWithBaseline;

  return (
    <Section
      title="Thesis Synthesized"
      description="Completed production thesis reports, measured from each report's own frozen thesis-time market baseline. A synthesized thesis is not a Thesis Call."
    >
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading thesis artifacts…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No production thesis reports yet"
          description="A report appears here only after a real production Thesis Synthesis completes."
        />
      ) : (
        <div className="space-y-4">
          <ThesisSummaryCards summary={summary} />
          <div className="flex flex-wrap items-center gap-2">
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`rounded border px-2 py-1 font-mono text-[10px] tracking-wide ${
                  sort === s.id
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
            {unmeasured > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                {unmeasured} of {rows.length} without a thesis-time baseline
              </span>
            ) : null}
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {sorted.map((r) => (
              <ArtifactCard
                key={r.reportId}
                identity={r}
                openLabel="Open thesis"
                performance={<ThesisPerformanceRow row={r} />}
                headline={
                  <>
                    <span className="tabular block">
                      {r.synthesizedAt ? formatDate(r.synthesizedAt) : "—"}
                    </span>
                    <span className="tabular">
                      Thesis {r.thesisScore ?? "—"} · Evidence {r.evidenceConfidence ?? "—"}
                    </span>
                    <span className="block">
                      {r.verdict ?? "—"} · bear {r.bearCaseSeverity ?? "—"}
                    </span>
                  </>
                }
                summary={r.oneSentenceThesis}
                details={[
                  { label: "Thesis score", value: r.thesisScore ?? "—" },
                  { label: "Evidence confidence", value: r.evidenceConfidence ?? "—" },
                  { label: "Verdict", value: r.verdict ?? "—" },
                  { label: "Bear severity", value: r.bearCaseSeverity ?? "—" },
                  { label: "Strongest bear case", value: r.strongestBearCase ?? "—" },
                  {
                    label: "Passed opportunity gates",
                    value: r.qualifiedAsOpportunity ? "YES" : "NO",
                  },
                  {
                    label: "Thesis baseline MC",
                    value:
                      r.baseline?.marketCap != null ? formatUsd(r.baseline.marketCap) : "—",
                  },
                  {
                    label: "Baseline observed",
                    value: r.baseline?.observedAt ? formatDate(r.baseline.observedAt) : "—",
                  },
                  { label: "Baseline origin", value: r.baseline?.origin ?? "Unavailable" },
                  {
                    label: "Live market cap",
                    value:
                      r.performance?.currentMarketCap != null
                        ? formatUsd(r.performance.currentMarketCap)
                        : "—",
                  },
                  {
                    label: "Live liquidity",
                    value:
                      r.performance?.currentLiquidityUsd != null
                        ? formatUsd(r.performance.currentLiquidityUsd)
                        : "—",
                  },
                  {
                    label: "Live 24h volume",
                    value:
                      r.performance?.currentVolume24h != null
                        ? formatUsd(r.performance.currentVolume24h)
                        : "—",
                  },
                  { label: "1h change", value: pctText(r.performance?.priceChange1h ?? null) },
                  { label: "24h change", value: pctText(r.performance?.priceChange24h ?? null) },
                  {
                    label: "Observations since thesis",
                    value: r.performance?.observationCount ?? "—",
                  },
                  {
                    label: "Last observation",
                    value: r.performance?.currentObservedAt
                      ? formatDate(r.performance.currentObservedAt)
                      : "—",
                  },
                  { label: "Thesis policy", value: r.thesisPolicyVersion ?? "—" },
                  { label: "Rubric version", value: r.rubricVersion ?? "—" },
                  { label: "Prompt version", value: r.promptVersion ?? "—" },
                  { label: "Model", value: r.modelIdentifier ?? "—" },
                  { label: "Model provider", value: r.modelProvider ?? "—" },
                  { label: "Triage run", value: r.triageRunId ?? "—" },
                  { label: "Deep Research run", value: r.deepResearchRunId ?? "—" },
                  { label: "Report id", value: r.reportId },
                ]}
              />
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

