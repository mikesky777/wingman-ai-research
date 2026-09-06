import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { Button } from "@/components/ui/button";
import {
  ProductionPolicyCard,
  ThesisRubricCard,
} from "@/components/wingman/settings/ProductionPolicyCard";
import { ProviderHealthCard } from "@/components/wingman/settings/ProviderHealthCard";

export const Route = createFileRoute("/settings/")({
  head: () => ({
    meta: [
      { title: "Settings — Wingman AI" },
      {
        name: "description",
        content:
          "Active production policy versions, provider and data health, and safety constraints for the Wingman AI research terminal.",
      },
      { property: "og:title", content: "Settings — Wingman AI" },
      {
        property: "og:description",
        content:
          "Read-only production policy versions, honest provider health and hard safety boundaries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="Read-only view of what production actually runs. Calibration lives in its own lab."
    >
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <ThesisRubricCard />
          <ProviderHealthCard />
        </div>

        <ProductionPolicyCard />

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Safety Constraints" description="Hard product boundaries.">
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "No wallet connections and no private keys, ever.",
                "No automatic purchases, swaps or trade execution.",
                "Wingman produces research; the human trader decides.",
                "Wingman may return zero opportunities rather than force a shortlist.",
                "Outcome data is never an input to any production decision.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Calibration"
            description="Benchmarks, the Calibration Observatory and future experiment tracks."
          >
            <p className="text-xs text-muted-foreground">
              Calibration never creates production milestones, Thesis Calls, Entry states or live
              state, and never changes production policy.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to="/calibration">
                <FlaskConical className="size-3.5" />
                Open Calibration
              </Link>
            </Button>
          </Section>
        </div>

        <Section title="Account & Alerts — COMING LATER">
          <p className="text-xs text-muted-foreground">
            Alert delivery, scan cadence and bankroll configuration are not implemented yet. Nothing
            on this page is editable.
          </p>
        </Section>
      </div>
    </AppShell>
  );
}
