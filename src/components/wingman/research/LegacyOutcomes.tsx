/**
 * Legacy Diagnostics — seeded `opportunity_outcomes` rows.
 *
 * These rows are demo/seed data from the prototype era, not real production
 * Wingman calls, so they are deliberately kept OUT of the production History
 * workflow. They are preserved untouched and shown here for engineering
 * inspection only.
 */
import { useState } from "react";
import { Section } from "@/components/wingman/Section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/wingman/EmptyState";
import { useOutcomes } from "@/lib/wingman/hooks";
import { formatDate, formatUsd } from "@/lib/wingman/format";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  TARGET_HIT: "border-positive/40 bg-positive/10 text-positive",
  OPEN: "border-primary/40 bg-primary/10 text-primary",
  EXPIRED: "border-border-strong text-muted-foreground",
  INVALIDATED: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function LegacyOutcomesDiagnostics() {
  const [open, setOpen] = useState(false);
  const { data: outcomes = [], isLoading } = useOutcomes();

  return (
    <Section
      title="Legacy diagnostics — seeded outcomes"
      description="Prototype seed rows from opportunity_outcomes. Not production Wingman calls and never shown in History."
      actions={
        <Badge variant="outline" className="border-warning/45 bg-warning/12 text-warning">
          SEED DATA — NOT PRODUCTION
        </Badge>
      }
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-border-strong px-2.5 py-1 font-mono text-[10px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? "Hide seeded rows" : `Show seeded rows (${outcomes.length})`}
      </button>

      {open ? (
        isLoading ? (
          <p className="mt-3 text-xs text-muted-foreground">Loading seeded outcomes…</p>
        ) : outcomes.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No seeded outcome rows"
              description="The legacy opportunity_outcomes table is empty."
            />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:pr-4 [&>th]:font-medium">
                  <th>Token</th>
                  <th className="text-right">Thesis</th>
                  <th className="text-right">MC @ discovery</th>
                  <th className="text-right">Peak MC</th>
                  <th className="text-right">Max gain</th>
                  <th className="text-right">Max DD</th>
                  <th>Status</th>
                  <th className="text-right">Discovered</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr
                    key={o.id}
                    className="[&>td]:border-t [&>td]:border-border [&>td]:py-3 [&>td]:pr-4"
                  >
                    <td>
                      <span className="text-sm font-medium">{o.token.name}</span>
                      <span className="tabular block text-[11px] text-muted-foreground">
                        {o.token.ticker}
                      </span>
                    </td>
                    <td className="tabular text-right text-sm">{o.thesisScoreAtDiscovery}</td>
                    <td className="tabular text-right text-sm">
                      {formatUsd(o.marketCapAtDiscoveryUsd)}
                    </td>
                    <td className="tabular text-right text-sm">{formatUsd(o.peakMarketCapUsd)}</td>
                    <td className="tabular text-right text-sm text-positive">+{o.maxGainPct}%</td>
                    <td className="tabular text-right text-sm text-destructive">
                      {o.maxDrawdownPct}%
                    </td>
                    <td>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                          STATUS_TONE[o.status] ?? "border-border-strong text-muted-foreground",
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="tabular text-right text-xs text-muted-foreground">
                      {formatDate(o.discoveredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </Section>
  );
}
