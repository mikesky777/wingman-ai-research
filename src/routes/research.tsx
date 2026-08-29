import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { Button } from "@/components/ui/button";
import { useOpportunities } from "@/lib/wingman/hooks";
import { relativeTime } from "@/lib/wingman/format";


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
  const { data: reports = [] } = useOpportunities();


  return (
    <AppShell
      title="Research"
      subtitle="Completed deep-research reports. Ad-hoc research requests arrive in a later version."
    >
      <div className="space-y-6">
        <Section title="Completed Reports">
          {reports.length === 0 ? (
            <EmptyState
              icon={<FlaskConical className="size-4" />}
              title="No research reports yet"
              description="Reports appear here once a scan promotes candidates into the deep-research stage."
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {reports.map((o) => (
                <li key={o.id} className="rounded-md border border-border bg-surface/60 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {o.token.name}{" "}
                      <span className="text-muted-foreground">· {o.token.ticker}</span>
                    </span>
                    <span className="tabular text-xs text-muted-foreground">
                      {o.thesisScore}/100
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {o.report.verdict}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {relativeTime(o.report.generatedAt)}
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/token/$tokenId" params={{ tokenId: o.id }}>
                        Open report
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Requested Research"
          description="Queue your own tokens for a deep-research pass."
        >
          <EmptyState
            title="Manual research requests are not enabled in v0"
            description="Wingman currently researches only what the scanner promotes. Manual submissions will land here once live data sources are connected."
          />
        </Section>
      </div>
    </AppShell>
  );
}
