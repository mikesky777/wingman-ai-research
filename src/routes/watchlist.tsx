import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, BellOff, Eye, Plus, X } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { EntryStateBadge } from "@/components/wingman/EntryStateBadge";
import { Button } from "@/components/ui/button";
import { useOpportunities } from "@/lib/wingman/hooks";
import { formatSigned, formatUsd, relativeTime } from "@/lib/wingman/format";
import { useWatchlist } from "@/lib/wingman/watchlist";
import { cn } from "@/lib/utils";
import type { Opportunity } from "@/lib/wingman/types";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist — Wingman AI" },
      {
        name: "description",
        content:
          "Track Solana tokens Wingman is monitoring, filtered by entry state and thesis score.",
      },
      { property: "og:title", content: "Watchlist — Wingman AI" },
      {
        property: "og:description",
        content: "Thesis score, entry state, market cap and alert status for tracked tokens.",
      },
    ],
  }),
  component: WatchlistPage,
});

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "BUY_ZONE", label: "BUY ZONE" },
  { key: "SETTING_UP", label: "SETTING UP" },
  { key: "EXTENDED", label: "EXTENDED" },
  { key: "S80", label: "Score 80+" },
  { key: "S70", label: "Score 70+" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matches(o: Opportunity, f: FilterKey) {
  if (f === "ALL") return true;
  if (f === "S80") return o.thesisScore >= 80;
  if (f === "S70") return o.thesisScore >= 70;
  return o.entryState === f;
}

function WatchlistPage() {
  const { data: all = [] } = useOpportunities();
  const { entries, remove, add, toggleAlert, isWatched } = useWatchlist();
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const rows = useMemo(
    () =>
      entries
        .map((e) => ({ entry: e, opp: all.find((o) => o.token.id === e.tokenId) }))
        .filter((r): r is { entry: (typeof entries)[number]; opp: Opportunity } => Boolean(r.opp))
        .filter((r) => matches(r.opp, filter)),
    [entries, all, filter],
  );

  const addable = all.filter((o) => !isWatched(o.token.id));

  return (
    <AppShell
      title="Watchlist"
      subtitle="Tokens you are tracking between scans. Saved to your Wingman backend."
    >

      <div className="space-y-6">
        <Section
          title="Tracked Tokens"
          description={`${entries.length} token${entries.length === 1 ? "" : "s"} tracked`}
          actions={
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors",
                    filter === f.key
                      ? "border-primary/50 bg-primary/12 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={<Eye className="size-4" />}
              title="Nothing matches this filter"
              description="Add tokens from the dashboard or a research report, then filter by entry state or thesis score."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead>
                  <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:font-medium">
                    <th>Token</th>
                    <th className="text-right">Thesis</th>
                    <th>Entry state</th>
                    <th className="text-right">Market cap</th>
                    <th className="text-right">Δ Score</th>
                    <th>Last analyzed</th>
                    <th>Alert</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ entry, opp }) => (
                    <tr key={opp.id} className="[&>td]:border-t [&>td]:border-border [&>td]:py-3">
                      <td>
                        <Link
                          to="/token/$tokenId"
                          params={{ tokenId: opp.id }}
                          className="text-sm font-medium hover:text-primary"
                        >
                          {opp.token.name}
                        </Link>
                        <span className="tabular block text-[11px] text-muted-foreground">
                          {opp.token.ticker}
                        </span>
                      </td>
                      <td className="tabular text-right text-sm font-semibold">
                        {opp.thesisScore}
                      </td>
                      <td className="px-3">
                        <EntryStateBadge state={opp.entryState} />
                      </td>
                      <td className="tabular text-right text-sm">
                        {formatUsd(opp.snapshot.marketCapUsd)}
                      </td>
                      <td
                        className={cn(
                          "tabular text-right text-sm",
                          opp.scoreChange > 0
                            ? "text-positive"
                            : opp.scoreChange < 0
                              ? "text-destructive"
                              : "text-muted-foreground",
                        )}
                      >
                        {formatSigned(opp.scoreChange)}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {relativeTime(opp.lastAnalyzedAt)}
                      </td>
                      <td>
                        <button
                          onClick={() => toggleAlert(opp.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
                            entry.alert === "ON"
                              ? "border-primary/45 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {entry.alert === "ON" ? (
                            <Bell className="size-3" />
                          ) : (
                            <BellOff className="size-3" />
                          )}
                          {entry.alert}
                        </button>
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => remove(opp.id)}
                          aria-label={`Remove ${opp.token.name} from watchlist`}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Add From Current Shortlist">
          {addable.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Every shortlisted token is already on your watchlist.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {addable.map((o) => (
                <Button key={o.id} variant="outline" size="sm" onClick={() => add(o.id)}>
                  <Plus className="size-3.5" />
                  {o.token.name} · {o.token.ticker}
                </Button>
              ))}
            </div>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
