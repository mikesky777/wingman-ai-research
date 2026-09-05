/**
 * Current production research funnel.
 *
 * Read-only summary of the exact production provenance chain. Calibration runs
 * are never counted here.
 */
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { getProductionFunnel } from "@/lib/wingman/triage.functions";
import { relativeTime } from "@/lib/wingman/format";

function Stage({
  label,
  lines,
}: {
  label: string;
  lines: { text: string; tone?: string }[];
}) {
  return (
    <div className="min-w-40 flex-1 rounded-md border border-border bg-surface/60 p-3">
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1.5 space-y-0.5">
        {lines.map((l, i) => (
          <li key={i} className={`tabular text-xs ${l.tone ?? ""}`}>
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProductionFunnelPanel() {
  const fetchFunnel = useServerFn(getProductionFunnel);
  const { data, isLoading } = useQuery({
    queryKey: ["research", "production-funnel"],
    queryFn: () => fetchFunnel(),
  });

  if (isLoading) {
    return (
      <Section title="Current Production Funnel">
        <p className="text-xs text-muted-foreground">Loading production state…</p>
      </Section>
    );
  }

  if (!data?.triage) {
    return (
      <Section title="Current Production Funnel">
        <p className="text-xs text-muted-foreground">
          No production triage run yet. Calibration runs are shown separately and never count here.
        </p>
      </Section>
    );
  }

  const t = data.triage;
  const dr = data.deepResearch;

  return (
    <Section
      title="Current Production Funnel"
      description="Live production provenance: scan → research packets → AI triage → deep research → thesis."
      actions={<Badge variant="outline">PRODUCTION</Badge>}
    >
      <div className="flex flex-wrap gap-2">
        <Stage
          label="SCANNER"
          lines={[
            { text: `${t.packetCount} research candidates` },
            {
              text: data.scan?.completedAt ? relativeTime(data.scan.completedAt) : "—",
              tone: "text-muted-foreground",
            },
          ]}
        />
        <Stage
          label="AI TRIAGE"
          lines={[
            { text: `${t.deepResearchCount} deep research`, tone: "text-positive" },
            { text: `${t.watchCount} watch`, tone: "text-warning" },
            { text: `${t.skipCount} skip`, tone: "text-muted-foreground" },
          ]}
        />
        <Stage
          label="DEEP RESEARCH"
          lines={[
            { text: `${dr.completed} completed`, tone: "text-positive" },
            { text: `${dr.pending} pending`, tone: "text-muted-foreground" },
            {
              text: `${dr.blockedOrFailed} blocked / failed`,
              tone: dr.blockedOrFailed > 0 ? "text-negative" : "text-muted-foreground",
            },
          ]}
        />
        <Stage
          label="THESIS"
          lines={[
            { text: `${data.thesisReportCount} synthesized` },
            {
              text: `${data.thesisCallMilestoneCount} thesis calls`,
              tone: "text-muted-foreground",
            },
          ]}
        />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Scan {data.scan?.id?.slice(0, 8) ?? "—"} · triage {t.id.slice(0, 8)} ·{" "}
        {data.aiShortlistMilestoneCount} AI_SHORTLIST milestones · {t.triagePolicyVersion ?? "—"}
      </p>
    </Section>
  );
}
