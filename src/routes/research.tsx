import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { InspectToken } from "@/components/wingman/InspectToken";
import { TriagePanel } from "@/components/wingman/research/TriagePanel";
import { ProductionFunnelPanel } from "@/components/wingman/research/ProductionFunnelPanel";
import { ProductionDeepResearchPanel } from "@/components/wingman/research/ProductionDeepResearchPanel";
import { ThesisPanel } from "@/components/wingman/research/ThesisPanel";
import { ThesisCallsPanel } from "@/components/wingman/research/ThesisCallsPanel";
import { EntryPanel } from "@/components/wingman/research/EntryPanel";


export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research queue — Wingman AI" },
      {
        name: "description",
        content:
          "Deep research reports produced by Wingman's multi-source pass over shortlisted Solana tokens.",
      },
      { property: "og:title", content: "Research queue — Wingman AI" },
      {
        property: "og:description",
        content: "Open a full thesis report for any token that cleared deep research.",
      },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <AppShell
      title="Research"
      subtitle="Production pipeline: TRIAGE → DEEP RESEARCH → THESIS → THESIS CALLS → ENTRY. Calibration tools live in Settings → Calibration Lab and never affect anything shown here."
    >
      <div className="space-y-6">
        <ProductionFunnelPanel />

        <TriagePanel />

        <ProductionDeepResearchPanel />

        <ThesisPanel />

        <ThesisCallsPanel />

        <EntryPanel />

        <Section
          title="Inspect Token"
          description="Paste a Solana contract address to fetch and persist live DexScreener market data. Verification only — no AI research or scoring."
        >
          <InspectToken />
        </Section>

      </div>
    </AppShell>
  );
}
