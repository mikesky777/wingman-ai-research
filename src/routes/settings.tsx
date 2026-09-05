import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/wingman/AppShell";
import { Section, KeyValue } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { THESIS_CATEGORIES, MOCK_DATA_NOTICE } from "@/lib/wingman/config";
import { CalibrationLab } from "@/components/wingman/research/CalibrationLab";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Wingman AI" },
      {
        name: "description",
        content:
          "Scoring configuration, data source status and safety constraints for the Wingman AI research terminal.",
      },
      { property: "og:title", content: "Settings — Wingman AI" },
      {
        property: "og:description",
        content: "Fixed scoring weights, planned integrations and v0 safety constraints.",
      },
    ],
  }),
  component: SettingsPage,
});

const SOURCES = [
  "DexScreener",
  "Birdeye",
  "Helius",
  "Bubblemaps",
  "Pump.fun / PumpPortal",
  "Jupiter",
  "X / social data",
  "LLM research agents",
];

function SettingsPage() {
  return (
    <AppShell title="Settings" subtitle={MOCK_DATA_NOTICE}>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Scoring Weights"
          description="Fixed in v0. Weights are defined once in configuration, never in UI code."
        >
          <KeyValue
            items={THESIS_CATEGORIES.map((c) => ({ label: c.label, value: `${c.weight} pts` }))}
            columns={2}
          />
        </Section>

        <Section title="Data Sources" description="Planned integrations — none are live yet.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map((s) => (
              <li
                key={s}
                className="flex items-center justify-between rounded-md border border-border bg-surface/60 px-3 py-2 text-xs"
              >
                <span>{s}</span>
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
                  NOT CONNECTED
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Safety Constraints" description="Hard product boundaries for v0.">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "No wallet connections and no private keys, ever.",
              "No automatic purchases, swaps or trade execution.",
              "Wingman produces research; the human trader decides.",
              "Wingman may return zero opportunities rather than force a shortlist.",
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Account & Alerts">
          <EmptyState
            title="Account settings arrive with the backend"
            description="Alert delivery, scan cadence and bankroll configuration become editable once Wingman is connected to persistent storage."
          />
        </Section>
      </div>

      <div className="mt-6">
        <CalibrationLab />
      </div>
    </AppShell>
  );
}
