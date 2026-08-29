import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Eye, EyeOff } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section, KeyValue } from "@/components/wingman/Section";
import { ScoreMeter } from "@/components/wingman/ScoreMeter";
import { EntryStateBadge } from "@/components/wingman/EntryStateBadge";
import { ThesisBreakdown } from "@/components/wingman/ThesisBreakdown";
import { PositionFramework } from "@/components/wingman/PositionFramework";
import { EntryStateMachine } from "@/components/wingman/EntryStateMachine";
import { MiniChart } from "@/components/wingman/MiniChart";
import { Button } from "@/components/ui/button";
import { getOpportunity } from "@/lib/wingman/mock-data";
import { MOCK_DATA_NOTICE, STRUCTURAL_MULTIPLIERS } from "@/lib/wingman/config";
import { formatNumber, formatPct, formatUsd, shortenAddress, tokenAge } from "@/lib/wingman/format";
import { useWatchlist } from "@/lib/wingman/watchlist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/token/$tokenId")({
  loader: ({ params }) => {
    const opportunity = getOpportunity(params.tokenId);
    if (!opportunity) throw notFound();
    return { opportunity };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Unavailable — Wingman AI" }, { name: "robots", content: "noindex" }],
      };
    }
    const { token, thesisScore, entryScore } = loaderData.opportunity;
    const title = `${token.name} (${token.ticker}) research — Wingman AI`;
    const description = `Thesis ${thesisScore}/100, entry ${entryScore}/10. Full Wingman research report covering distribution, wallets, liquidity, mindshare and invalidation.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: TokenResearch,
});

function Prose({ title, body }: { title: string; body: string }) {
  return (
    <Section title={title}>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{body}</p>
    </Section>
  );
}

function TokenResearch() {
  const { opportunity } = Route.useLoaderData();
  const { token, snapshot, report } = opportunity;
  const structural = STRUCTURAL_MULTIPLIERS[opportunity.structuralRisk];
  const watchlist = useWatchlist();
  const watched = watchlist.isWatched(token.id);
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(token.contractAddress);
      setCopied(true);
      toast.success("Contract address copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy address");
    }
  };

  return (
    <AppShell
      title={`${token.name} · ${token.ticker}`}
      subtitle={`Wingman research report — ${MOCK_DATA_NOTICE}`}
      actions={
        <>
          <Button
            variant={watched ? "secondary" : "outline"}
            className="gap-2"
            onClick={() => {
              watchlist.toggle(token.id);
              toast.success(watched ? "Removed from watchlist" : "Added to watchlist");
            }}
          >
            {watched ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {watched ? "Watching" : "Add to watchlist"}
          </Button>
          <Button variant="ghost" asChild className="gap-2">
            <Link to="/">
              <ArrowLeft className="size-4" />
              Dashboard
            </Link>
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="panel px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="label-xs">Contract</p>
              <button
                onClick={copyAddress}
                className="tabular mt-1 inline-flex items-center gap-2 text-sm transition-colors hover:text-primary"
              >
                {shortenAddress(token.contractAddress, 6, 6)}
                {copied ? (
                  <Check className="size-3.5 text-positive" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
            {[
              { label: "Market cap", value: formatUsd(snapshot.marketCapUsd) },
              { label: "Liquidity", value: formatUsd(snapshot.liquidityUsd) },
              { label: "24h volume", value: formatUsd(snapshot.volume24hUsd) },
              { label: "Token age", value: tokenAge(token.launchedAt) },
              { label: "Holders", value: formatNumber(snapshot.holderCount) },
            ].map((s) => (
              <div key={s.label}>
                <p className="label-xs">{s.label}</p>
                <p className="tabular mt-1 text-sm font-medium">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="panel px-4 py-3.5">
            <ScoreMeter label="Thesis Score" value={opportunity.thesisScore} max={100} />
          </div>
          <div className="panel px-4 py-3.5">
            <ScoreMeter
              label="Evidence Confidence"
              value={opportunity.evidenceConfidence}
              max={100}
              variant="evidence"
              hint={
                opportunity.evidenceConfidence < 60
                  ? "Evidence is thin — treat the thesis as unverified."
                  : undefined
              }
            />
          </div>
          <div className="panel px-4 py-3.5">
            <ScoreMeter
              label="Entry Score"
              value={opportunity.entryScore}
              max={10}
              variant="entry"
            />
          </div>
          <div className="panel flex flex-col justify-between px-4 py-3.5">
            <p className="label-xs">Entry State</p>
            <div className="mt-2">
              <EntryStateBadge state={opportunity.entryState} size="lg" />
            </div>
          </div>
          <div className="panel px-4 py-3.5">
            <p className="label-xs">Structural Risk</p>
            <p
              className={cn(
                "tabular mt-2 text-xl font-semibold",
                structural.multiplier === 1 ? "text-positive" : "text-warning",
              )}
            >
              {structural.multiplier === null ? "NO TRADE" : `${structural.multiplier}x`}
              <span className="ml-2 font-sans text-[11px] font-normal tracking-wide text-muted-foreground uppercase">
                {structural.label}
              </span>
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{structural.description}</p>
          </div>
        </div>

        <Section title="Wingman Verdict">
          <p className="max-w-4xl text-sm leading-relaxed">{report.verdict}</p>
        </Section>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <Prose title="Why Now" body={report.whyNow} />
            <Prose title="Core Thesis" body={report.coreThesis} />
            <Prose title="Meme / Lore" body={report.memeLore} />
            <Prose title="Catalyst / Narrative" body={report.catalystNarrative} />
          </div>
          <Section
            title="Thesis Score Breakdown"
            description="Fixed category weights — total 100 points."
          >
            <ThesisBreakdown breakdown={opportunity.thesisBreakdown} />
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Distribution" description="Holder structure and supply concentration.">
            <KeyValue
              items={[
                { label: "Holder count", value: formatNumber(report.distribution.holderCount) },
                { label: "Top 10 ownership", value: formatPct(report.distribution.top10Pct) },
                { label: "Top 20 ownership", value: formatPct(report.distribution.top20Pct) },
                {
                  label: "Insider estimate",
                  value: formatPct(report.distribution.insiderEstimatePct),
                  tone: report.distribution.insiderEstimatePct > 5 ? "warning" : "default",
                },
                {
                  label: "Bundled supply estimate",
                  value: formatPct(report.distribution.bundledSupplyPct),
                  tone: report.distribution.bundledSupplyPct > 3 ? "warning" : "default",
                },
                {
                  label: "Smart-wallet ownership",
                  value: formatPct(report.distribution.smartWalletPct),
                },
                {
                  label: "Holder growth (24h)",
                  value: `+${formatPct(report.distribution.holderGrowth24hPct)}`,
                  tone: "positive",
                },
              ]}
            />
          </Section>

          <Section title="Wallet Intelligence" description="Observed on-chain behaviour clusters.">
            <ul className="space-y-2.5">
              {report.walletSignals.map((sig) => (
                <li
                  key={sig.id}
                  className="rounded-md border border-border bg-surface/60 px-3.5 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{sig.label}</span>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                        sig.sentiment === "positive" &&
                          "border-positive/40 bg-positive/10 text-positive",
                        sig.sentiment === "negative" &&
                          "border-destructive/40 bg-destructive/10 text-destructive",
                        sig.sentiment === "neutral" && "border-border-strong text-muted-foreground",
                      )}
                    >
                      {sig.sentiment.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{sig.detail}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Developer Analysis">
            <KeyValue
              items={[
                { label: "Reputation", value: report.developer.reputation },
                { label: "Previous launches", value: report.developer.previousLaunches },
                { label: "Successful launches", value: report.developer.successfulLaunches },
                {
                  label: "Suspicious launches",
                  value: report.developer.suspiciousLaunches,
                  tone: report.developer.suspiciousLaunches > 0 ? "danger" : "default",
                },
                { label: "Linked wallets", value: report.developer.linkedWallets },
                {
                  label: "Dev current ownership",
                  value: formatPct(report.developer.currentOwnershipPct),
                },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">{report.developer.note}</p>
          </Section>

          <Section title="Liquidity / Exitability" description="Simulated impact estimates.">
            <KeyValue
              items={[
                { label: "Liquidity", value: formatUsd(report.liquidity.liquidityUsd) },
                {
                  label: "Volume / liquidity ratio",
                  value: `${report.liquidity.volumeToLiquidityRatio.toFixed(1)}x`,
                },
                {
                  label: `Starter position (${formatUsd(report.liquidity.starterPositionUsd)})`,
                  value: `${formatPct(report.liquidity.starterImpactPct)} impact`,
                },
                {
                  label: `Larger position (${formatUsd(report.liquidity.largerPositionUsd)})`,
                  value: `${formatPct(report.liquidity.largerImpactPct)} impact`,
                },
                {
                  label: "Estimated exit impact",
                  value: formatPct(report.liquidity.exitImpactPct),
                  tone: report.liquidity.exitImpactPct > 5 ? "warning" : "default",
                },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">{report.liquidity.note}</p>
          </Section>

          <Section title="Mindshare">
            <KeyValue
              items={[
                {
                  label: "Mention velocity",
                  value: `${report.mindshare.mentionVelocityPerHour}/hr`,
                },
                { label: "Unique authors (24h)", value: report.mindshare.uniqueAuthors24h },
                { label: "Engagement quality", value: report.mindshare.engagementQuality },
                { label: "Narrative propagation", value: report.mindshare.narrativePropagation },
                {
                  label: "Organic vs paid attention",
                  value: `${report.mindshare.organicSharePct}% organic`,
                },
                {
                  label: "Mindshare score",
                  value: `${report.mindshare.mindshareScore} / 100`,
                  tone: "positive",
                },
              ]}
            />
          </Section>

          <Section
            title="Chart / Entry Analysis"
            description="Placeholder visualisation — no charting provider connected in v0."
            actions={<EntryStateBadge state={report.chart.entryState} />}
          >
            <MiniChart
              series={report.chart.series}
              className="h-32 bg-surface/50"
              label="SIMULATED STRUCTURE"
            />
            <div className="mt-4">
              <KeyValue
                items={[
                  { label: "Current structure", value: report.chart.structure },
                  { label: "Most recent impulse", value: report.chart.recentImpulse },
                  { label: "Pullback depth", value: formatPct(report.chart.pullbackDepthPct, 0) },
                  { label: "Higher-low status", value: report.chart.higherLowStatus },
                  {
                    label: "Distance from recent base",
                    value: formatPct(report.chart.distanceFromBasePct, 0),
                    tone: report.chart.distanceFromBasePct > 90 ? "warning" : "default",
                  },
                  { label: "Buyer / seller behaviour", value: report.chart.buyerSellerBehavior },
                  { label: "Volume behaviour", value: report.chart.volumeBehavior },
                  { label: "Risk-definition level", value: report.chart.riskDefinitionLevel },
                ]}
                columns={2}
              />
            </div>
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Prose title="Bull Case" body={report.bullCase} />
          <Prose title="Bear Case" body={report.bearCase} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section
            title="Market Cap Scenarios"
            description="Illustrative ranges, not forecasts or guarantees."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Failure", value: report.scenarios.failure, tone: "text-destructive" },
                { label: "Base case", value: report.scenarios.base, tone: "text-foreground" },
                {
                  label: "Strong reflexive run",
                  value: report.scenarios.reflexive,
                  tone: "text-positive",
                },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-border bg-surface/60 p-4">
                  <p className="label-xs">{s.label}</p>
                  <p className={cn("tabular mt-1.5 text-base font-semibold", s.tone)}>{s.value}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Invalidation" description="What would make this thesis wrong.">
            <ul className="space-y-2">
              {report.invalidation.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <PositionFramework
          thesisScore={opportunity.thesisScore}
          structuralRisk={opportunity.structuralRisk}
        />

        <Section
          title="Entry State Reference"
          description="Where this token currently sits in the entry state machine."
        >
          <EntryStateMachine current={opportunity.entryState} />
        </Section>
      </div>
    </AppShell>
  );
}
