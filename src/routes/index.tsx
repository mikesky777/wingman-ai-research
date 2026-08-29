import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, RefreshCw, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { StatTile } from "@/components/wingman/StatTile";
import { OpportunityTable } from "@/components/wingman/OpportunityTable";
import { EmptyState } from "@/components/wingman/EmptyState";
import { EntryStateMachine } from "@/components/wingman/EntryStateMachine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOpportunities, getScanSummary } from "@/lib/wingman/mock-data";
import { formatNumber, formatTime } from "@/lib/wingman/format";
import { MOCK_DATA_NOTICE } from "@/lib/wingman/config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wingman AI — Solana memecoin thesis dashboard" },
      {
        name: "description",
        content:
          "Market regime, scan pipeline stats and the current Wingman shortlist of scored Solana memecoin opportunities.",
      },
      { property: "og:title", content: "Wingman AI — Solana memecoin thesis dashboard" },
      {
        property: "og:description",
        content:
          "Thesis score, evidence confidence and entry quality for the few Solana tokens that clear Wingman's threshold.",
      },
    ],
  }),
  component: Dashboard,
});

const REGIME_LABEL = {
  RISK_ON: { text: "Risk-On", tone: "positive" as const },
  NEUTRAL: { text: "Neutral", tone: "default" as const },
  RISK_OFF: { text: "Risk-Off", tone: "danger" as const },
};

function Dashboard() {
  const summary = getScanSummary();
  const opportunities = getOpportunities();
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState(summary.lastScanAt);

  const runScan = () => {
    if (scanning) return;
    setScanning(true);
    window.setTimeout(() => {
      setLastScanAt(new Date().toISOString());
      setScanning(false);
    }, 1800);
  };

  const regime = REGIME_LABEL[summary.regime];

  return (
    <AppShell
      title="Wingman Market Overview"
      subtitle="AI-powered Solana thesis discovery — quality over quantity."
      actions={
        <Button onClick={runScan} disabled={scanning} className="gap-2">
          <RefreshCw className={cn("size-4", scanning && "animate-spin")} />
          {scanning ? "Scanning…" : "Run Scan"}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatTile
            label="Market Regime"
            value={regime.text}
            tone={regime.tone}
            detail="Aggregate risk appetite across Solana majors"
          />
          <StatTile
            label="Last Scan"
            value={scanning ? "Running…" : formatTime(lastScanAt)}
            detail={scanning ? "Refreshing pipeline" : "Automatic hourly cadence"}
          />
          <StatTile
            label="Tokens Scanned"
            value={formatNumber(summary.tokensScanned)}
            detail="Full observed universe"
          />
          <StatTile
            label="Passed Filters"
            value={formatNumber(summary.passedFilters)}
            detail="Cleared hard filters"
          />
          <StatTile
            label="Deep Researched"
            value={formatNumber(summary.deepResearched)}
            detail="Full research pass run"
          />
          <StatTile
            label="Actionable"
            value={formatNumber(opportunities.length)}
            tone="primary"
            detail="Cleared the shortlist threshold"
          />
        </div>

        <Section
          title="Top Opportunities"
          description="Up to five ranked theses. Wingman shows fewer when fewer qualify."
          actions={
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              {MOCK_DATA_NOTICE}
            </span>
          }
        >
          {opportunities.length === 0 ? (
            <EmptyState
              icon={<Activity className="size-4" />}
              title="No high-quality setups currently meet our threshold."
              description="Wingman will not force recommendations. The next scan runs automatically, or trigger one manually."
            />
          ) : (
            <OpportunityTable opportunities={opportunities} />
          )}
        </Section>

        <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          <Section
            title="Thesis vs Evidence vs Entry"
            description="Three independent judgements. A strong thesis is not a signal to buy now."
          >
            <div className="space-y-3">
              {[
                {
                  title: "Thesis Score — 0–100",
                  body: "How attractive the token itself is: meme quality, catalyst, distribution, liquidity, dev integrity, chart, mindshare and valuation.",
                },
                {
                  title: "Evidence Confidence — 0–100",
                  body: "How complete and trustworthy the underlying research is. A token can score Thesis 82 / Evidence 46 — interesting, but unverified.",
                },
                {
                  title: "Entry Score — 0–10",
                  body: "Whether the current chart offers a good place to take risk. Thesis 88 with Entry 3 and state EXTENDED means wait, not buy.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-md border border-border bg-surface/60 p-4">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Chart Entry State Machine"
            description="Informational rules only in v0 — no calculation engine is running."
          >
            <EntryStateMachine />
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
