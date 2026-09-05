/**
 * Compact production funnel counters (History).
 *
 * Counters only — the token detail for each stage lives in that stage's own
 * History tab, so nothing is duplicated here. THESIS_SYNTHESIZED (a completed
 * production thesis) and THESIS_CALL (a thesis that passed every opportunity
 * gate) are counted separately and never conflated.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductionArtifacts } from "@/lib/wingman/history.functions";

const STAGES = [
  { key: "AI_SHORTLIST", label: "AI Shortlist" },
  { key: "DEEP_RESEARCH_COMPLETED", label: "Deep Research" },
  { key: "THESIS_SYNTHESIZED", label: "Thesis Synthesized" },
  { key: "THESIS_CALL", label: "Thesis Calls" },
] as const;

export function ProductionArtifacts() {
  const fetchArtifacts = useServerFn(getProductionArtifacts);
  const { data, isLoading } = useQuery({
    queryKey: ["wingman", "production-artifacts"],
    queryFn: () => fetchArtifacts(),
  });

  return (
    <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <span className="label-xs">Production artifacts</span>
      {STAGES.map((s) => (
        <span key={s.key} className="flex items-baseline gap-1.5 text-xs">
          <span className="text-muted-foreground">{s.label}</span>
          <span className="tabular text-sm font-semibold">
            {isLoading ? "…" : (data?.counts[s.key] ?? 0)}
          </span>
        </span>
      ))}
    </div>
  );
}
