/**
 * Current production research funnel — ACTIVE COHORT ONLY.
 *
 * The root is the newest eligible healthy production scan. Every stage below
 * is scoped by exact provenance to that scan, so a stage with no artefact for
 * this cohort reads NOT_STARTED instead of borrowing the previous scan's
 * numbers. Calibration runs are never counted here.
 */
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { getProductionFunnel } from "@/lib/wingman/triage.functions";
import { relativeTime } from "@/lib/wingman/format";

const stageTone: Record<string, string> = {
  COMPLETED: "border-positive/40 bg-positive/10 text-positive",
  READY: "border-positive/40 bg-positive/10 text-positive",
  PARTIAL: "border-warning/40 bg-warning/10 text-warning",
  PENDING: "border-warning/40 bg-warning/10 text-warning",
  FAILED: "border-negative/40 bg-negative/10 text-negative",
};

function Stage({
  label,
  status,
  lines,
}: {
  label: string;
  status?: string;
  lines: { text: string; tone?: string }[];
}) {
  return (
    <div className="min-w-40 flex-1 rounded-md border border-border bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground">{label}</p>
        {status ? (
          <span
            className={`rounded border px-1 py-0.5 text-[9px] ${
              stageTone[status] ?? "border-border text-muted-foreground"
            }`}
          >
            {status}
          </span>
        ) : null}
      </div>
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

  if (!data?.scan) {
    return (
      <Section title="Current Production Funnel">
        <p className="text-xs text-muted-foreground">
          No eligible current scan. Research stays empty until a healthy, completed scan under the
          current policy has research packets — older scans are never reused here.
        </p>
      </Section>
    );
  }

  const t = data.triage;
  const dr = data.deepResearch;
  const s = data.stages;

  return (
    <Section
      title="Current Production Funnel"
      description="Active cohort only: scan → research packets → AI triage → deep research → thesis → entry. Every count belongs to this scan; anything from an earlier scan lives in History. A thesis call is a thesis that passed every opportunity gate."
      actions={<Badge variant="outline">PRODUCTION</Badge>}
    >
      <div className="flex flex-wrap gap-2">
        <Stage
          label="SCANNER"
          status={s.packets}
          lines={[
            { text: `${data.scan.packetCount} research candidates` },
            {
              text: data.scan.completedAt ? relativeTime(data.scan.completedAt) : "—",
              tone: "text-muted-foreground",
            },
          ]}
        />
        <Stage
          label="AI TRIAGE"
          status={s.triage}
          lines={
            t
              ? [
                  { text: `${t.deepResearchCount} deep research`, tone: "text-positive" },
                  { text: `${t.watchCount} watch`, tone: "text-warning" },
                  { text: `${t.skipCount} skip`, tone: "text-muted-foreground" },
                ]
              : [{ text: "not run for this scan", tone: "text-muted-foreground" }]
          }
        />
        <Stage
          label="DEEP RESEARCH"
          status={s.deepResearch}
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
          status={s.thesis}
          lines={[
            { text: `${data.thesisReportCount} synthesized` },
            { text: `${data.thesisCallCount} thesis calls`, tone: "text-muted-foreground" },
          ]}
        />
        <Stage
          label="ENTRY"
          status={s.entry}
          lines={[
            { text: `${data.entryEvaluatedCount} timed` },
            {
              text: `${data.entryActionableCount} in entry range`,
              tone: "text-muted-foreground",
            },
          ]}
        />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Scan {data.scan.id?.slice(0, 8) ?? "—"} · triage {t ? t.id.slice(0, 8) : "—"} ·{" "}
        {data.cohortShortlistCount} shortlisted in this cohort ·{" "}
        {t?.triagePolicyVersion ?? "—"}
      </p>
    </Section>
  );
}
