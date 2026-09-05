/**
 * Research → Thesis Calls.
 *
 * A Thesis Call is the immutable production qualification event created only
 * when a synthesized thesis passed every Opportunity gate. This section is
 * always rendered — an empty state is meaningful pipeline information, never
 * a reason to hide the stage. Timing (Entry) and Live state sit downstream
 * and never change the call itself.
 */
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { useLiveLifecycle } from "@/lib/wingman/hooks";
import { relativeTime } from "@/lib/wingman/format";

function short(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 5)}…${mint.slice(-4)}` : mint;
}

const monitoringTone: Record<string, string> = {
  ACTIVE: "border-positive/40 bg-positive/10 text-positive",
  RESEARCH_DUE: "border-warning/40 bg-warning/10 text-warning",
  INACTIVE: "border-border bg-surface text-muted-foreground",
  INVALIDATED: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function ThesisCallsPanel() {
  const { data, isLoading } = useLiveLifecycle();
  const calls = data?.calls ?? [];

  return (
    <Section
      title="Thesis Calls"
      description="Immutable production qualification events. A Thesis Call is created only when a synthesized thesis passes every Opportunity gate (Thesis Score, Evidence Confidence, verdict, bear severity, and distinct independent evidence origins). Calls are monitored here; Entry timing downstream only ever evaluates these records."
      actions={
        <Badge variant="outline" className="tabular text-[10px]">
          {calls.length} Thesis Call{calls.length === 1 ? "" : "s"}
        </Badge>
      }
    >
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading Thesis Calls…</p>
      ) : calls.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">0 Thesis Calls.</span> No synthesized thesis
          passed every Opportunity gate.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {calls.map((c) => (
            <li
              key={c.thesisCallMilestoneId}
              className="rounded-md border border-border bg-surface/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <TokenIdentity
                  symbol={c.symbol ?? short(c.mint)}
                  name={c.name ?? null}
                  mint={c.mint}
                  pairAddress={null}
                />
                <Badge
                  variant="outline"
                  className={`text-[10px] ${monitoringTone[c.monitoringStatus] ?? ""}`}
                >
                  {c.monitoringStatus}
                </Badge>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Called {relativeTime(c.calledAt)} · entry{" "}
                {c.entry.state ?? "not yet evaluated"}
                {c.isLive ? " · LIVE" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
