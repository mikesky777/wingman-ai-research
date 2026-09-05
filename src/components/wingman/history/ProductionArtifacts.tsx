/**
 * Production funnel artifacts (History).
 *
 * Shows what production actually produced at each stage. THESIS_SYNTHESIZED
 * (a completed production thesis) and THESIS_CALL (a thesis that passed every
 * opportunity gate) are counted separately and never conflated. Nothing here
 * writes or invents a milestone.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Section } from "@/components/wingman/Section";
import { StatTile } from "@/components/wingman/StatTile";
import { EmptyState } from "@/components/wingman/EmptyState";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { getProductionArtifacts } from "@/lib/wingman/history.functions";
import { relativeTime } from "@/lib/wingman/format";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "AI_SHORTLIST", label: "AI shortlist" },
  { key: "DEEP_RESEARCH_COMPLETED", label: "Deep research completed" },
  { key: "THESIS_SYNTHESIZED", label: "Thesis synthesized" },
  { key: "THESIS_CALL", label: "Thesis call" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

export function ProductionArtifacts() {
  const fetchArtifacts = useServerFn(getProductionArtifacts);
  const [stage, setStage] = useState<StageKey>("THESIS_SYNTHESIZED");
  const { data, isLoading } = useQuery({
    queryKey: ["wingman", "production-artifacts"],
    queryFn: () => fetchArtifacts(),
  });

  const rows = data?.tokens[stage] ?? [];

  return (
    <Section
      title="Production artifacts"
      description="What production actually produced. A synthesized thesis is not a thesis call — a call is a thesis that additionally passed every opportunity gate."
    >
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading production artifacts…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STAGES.map((s) => (
              <StatTile key={s.key} label={s.label} value={String(data?.counts[s.key] ?? 0)} />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1">
            {STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                className={cn(
                  "rounded border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors",
                  stage === s.key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border-strong text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Nothing at this stage yet"
                description="No production artifact exists for this stage. Stages are never backfilled retroactively."
              />
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {rows.map((row) => (
                <li key={row.mint} className="rounded-md border border-border bg-surface/60 p-3">
                  <TokenIdentity
                    symbol={row.symbol}
                    name={row.name}
                    mint={row.mint}
                    pairAddress={row.pairAddress}
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {row.detail ?? "—"}
                    {row.at ? ` · ${relativeTime(row.at)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
