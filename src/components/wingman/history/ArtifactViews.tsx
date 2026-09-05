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
import type {
  DeepResearchArtifact,
  ThesisArtifact,
} from "@/lib/wingman/services/history/artifacts.server";

const NO_BASELINE_NOTE =
  "Historical performance baseline not captured for this artifact version.";

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

export function ThesisSynthesizedArtifacts() {
  const { data, isLoading } = useArtifacts();
  const rows: ThesisArtifact[] = data?.thesis ?? [];

  return (
    <Section
      title="Thesis Synthesized"
      description={`Completed production thesis reports. A synthesized thesis is not a Thesis Call. ${NO_BASELINE_NOTE}`}
    >
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading thesis artifacts…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No production thesis reports yet"
          description="A report appears here only after a real production Thesis Synthesis completes."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <ArtifactCard
              key={r.reportId}
              identity={r}
              openLabel="Open thesis"
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
                { label: "Thesis policy", value: r.thesisPolicyVersion ?? "—" },
                { label: "Rubric version", value: r.rubricVersion ?? "—" },
                { label: "Prompt version", value: r.promptVersion ?? "—" },
                { label: "Model", value: r.modelIdentifier ?? "—" },
                { label: "Model provider", value: r.modelProvider ?? "—" },
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
