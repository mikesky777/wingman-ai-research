import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { EntryStateBadge } from "./EntryStateBadge";
import { cn } from "@/lib/utils";
import { STRUCTURAL_MULTIPLIERS } from "@/lib/wingman/config";
import { formatSigned, formatUsd, shortenAddress } from "@/lib/wingman/format";
import type { Opportunity } from "@/lib/wingman/types";

function ScoreCell({ value, max, weak }: { value: number; max: number; weak?: boolean }) {
  return (
    <span className={cn("tabular text-sm font-semibold", weak && "text-warning")}>
      {value}
      <span className="text-[11px] font-normal text-muted-foreground">/{max}</span>
    </span>
  );
}

function Change({ value }: { value: number }) {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 text-sm",
        value > 0 ? "text-positive" : value < 0 ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {formatSigned(value)}
    </span>
  );
}

export function OpportunityTable({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-left">
        <thead>
          <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:font-medium">
            <th className="w-10">#</th>
            <th>Token</th>
            <th className="text-right">Market cap</th>
            <th className="text-right">Liquidity</th>
            <th className="text-right">24h vol</th>
            <th className="text-right">Thesis</th>
            <th className="text-right">Evidence</th>
            <th className="text-right">Entry</th>
            <th>Entry state</th>
            <th className="text-right">Struct.</th>
            <th>Stage</th>
            <th className="text-right">Δ Score</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => {
            const structural = STRUCTURAL_MULTIPLIERS[o.structuralRisk];
            return (
              <tr
                key={o.id}
                className="group border-t border-border transition-colors hover:bg-secondary/50 [&>td]:border-t [&>td]:border-border [&>td]:py-3"
              >
                <td className="tabular text-sm text-muted-foreground">{o.rank}</td>
                <td className="pr-6">
                  <Link
                    to="/token/$tokenId"
                    params={{ tokenId: o.id }}
                    className="block leading-tight"
                  >
                    <span className="text-sm font-semibold group-hover:text-primary">
                      {o.token.name}
                    </span>
                    <span className="tabular block text-[11px] text-muted-foreground">
                      {o.token.ticker} · {shortenAddress(o.token.contractAddress)}
                    </span>
                  </Link>
                </td>
                <td className="tabular text-right text-sm">{formatUsd(o.snapshot.marketCapUsd)}</td>
                <td className="tabular text-right text-sm">{formatUsd(o.snapshot.liquidityUsd)}</td>
                <td className="tabular text-right text-sm">{formatUsd(o.snapshot.volume24hUsd)}</td>
                <td className="text-right">
                  <ScoreCell value={o.thesisScore} max={100} />
                </td>
                <td className="text-right">
                  <ScoreCell
                    value={o.evidenceConfidence}
                    max={100}
                    weak={o.evidenceConfidence < 60}
                  />
                </td>
                <td className="text-right">
                  <ScoreCell value={o.entryScore} max={10} />
                </td>
                <td className="px-3">
                  <EntryStateBadge state={o.entryState} />
                </td>
                <td className="tabular text-right text-sm text-muted-foreground">
                  {structural.multiplier === null ? "NO TRADE" : `${structural.multiplier}x`}
                </td>
                <td className="px-3">
                  <span className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                    {o.stage}
                  </span>
                </td>
                <td className="text-right">
                  <Change value={o.scoreChange} />
                </td>
                <td className="pl-3 text-right">
                  <Link
                    to="/token/$tokenId"
                    params={{ tokenId: o.id }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                  >
                    Report
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
