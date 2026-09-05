/**
 * History → Live Lifecycle.
 *
 * The append-only ledger behind Live status: THESIS_CALL, monitoring-status
 * changes, LIVE_ACTIVATED and LIVE_DEACTIVATED events, and every historical
 * Live episode with its outcome measured from the activation baseline.
 * Historical events are immutable; current state is shown separately.
 */
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { Badge } from "@/components/ui/badge";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { formatTime } from "@/lib/wingman/format";
import { MONITORING_STATUS_MEANING } from "@/lib/wingman/services/live/lifecycle";
import { useLiveLifecycle } from "@/lib/wingman/hooks";
import { cn } from "@/lib/utils";

const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

const duration = (ms: number | null) => {
  if (ms == null) return "open";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

export function LiveLifecycleLedger() {
  const { data, isLoading } = useLiveLifecycle();
  const calls = data?.calls ?? [];
  const events = data?.events ?? [];
  const activations = data?.activations ?? [];

  return (
    <div className="space-y-6">
      <Section
        title="Thesis Calls — current monitoring"
        description="A Thesis Call is an immutable historical qualification. Monitoring status controls whether Entry keeps being evaluated; it never rewrites the call."
      >
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading lifecycle…</p>
        ) : calls.length === 0 ? (
          <EmptyState
            title="No production Thesis Calls"
            description="No thesis has passed every production opportunity gate yet, so nothing is being monitored."
          />
        ) : (
          <div className="space-y-2">
            {calls.map((call) => (
              <div
                key={call.thesisCallMilestoneId}
                className="flex flex-wrap items-start justify-between gap-3 rounded border border-border/60 p-3"
              >
                <TokenIdentity
                  symbol={call.symbol}
                  name={call.name}
                  mint={call.mint}
                  pairAddress={call.pairAddress ?? null}
                />
                <div className="flex flex-col items-end gap-1 text-right">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="text-[10px]"
                      title={MONITORING_STATUS_MEANING[call.monitoringStatus]}
                    >
                      {call.monitoringStatus}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        call.isLive ? "border-positive/40 text-positive" : "text-muted-foreground",
                      )}
                    >
                      {call.isLive ? `LIVE · episode #${call.currentEpisode?.episodeNumber}` : "NOT LIVE"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{call.assessment.reason}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Called {formatTime(call.calledAt)} · episodes {call.episodes.length}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Live episodes"
        description="Every activation is measured from its own frozen baseline and keeps being measured after the episode ends."
      >
        {activations.length === 0 ? (
          <EmptyState
            title="No Live activations recorded"
            description="A Live episode starts only when a monitored Thesis Call transitions OFF → ON."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="py-1.5 pr-3">Token</th>
                  <th className="py-1.5 pr-3">#</th>
                  <th className="py-1.5 pr-3">Activated</th>
                  <th className="py-1.5 pr-3">Deactivated</th>
                  <th className="py-1.5 pr-3">Duration</th>
                  <th className="py-1.5 pr-3">Since activation</th>
                  <th className="py-1.5 pr-3">Peak</th>
                  <th className="py-1.5 pr-3">Max DD</th>
                </tr>
              </thead>
              <tbody>
                {activations.map((a) => (
                  <tr key={a.eventId} className="border-t border-border/50">
                    <td className="py-1.5 pr-3 font-medium">{a.symbol ?? a.mint.slice(0, 6)}</td>
                    <td className="py-1.5 pr-3">{a.episodeNumber}</td>
                    <td className="py-1.5 pr-3">{formatTime(a.activatedAt)}</td>
                    <td className="py-1.5 pr-3">
                      {a.deactivatedAt ? formatTime(a.deactivatedAt) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">{duration(a.durationMs)}</td>
                    <td className="py-1.5 pr-3 tabular">{pct(a.outcome.sincePct)}</td>
                    <td className="py-1.5 pr-3 tabular">{pct(a.outcome.peakPct)}</td>
                    <td className="py-1.5 pr-3 tabular">{pct(a.outcome.drawdownPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Lifecycle events"
        description="Append-only. Events are never modified or deleted, including earlier activations of the same Thesis Call."
      >
        {events.length === 0 ? (
          <EmptyState
            title="No lifecycle events"
            description="Activations, deactivations and monitoring-status changes will appear here as they happen."
          />
        ) : (
          <ul className="space-y-1.5">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {event.eventType}
                  </Badge>
                  <span className="font-medium">{event.mint.slice(0, 8)}…</span>
                  {event.episodeNumber ? (
                    <span className="text-muted-foreground">episode #{event.episodeNumber}</span>
                  ) : null}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {event.reason ?? event.reasonCode} · {formatTime(event.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
