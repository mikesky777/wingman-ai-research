/**
 * SUSPECT review queue table (presentation only).
 *
 * Renders the derived Participation Quality review projection. It never
 * mutates candidates, never reclassifies them, and never removes them from
 * their normal setup views.
 */
import { EmptyState } from "@/components/wingman/EmptyState";
import { cn } from "@/lib/utils";
import { formatNumber, formatUsd } from "@/lib/wingman/format";
import type { WorkbenchCandidate } from "@/lib/wingman/services/scanner-service";
import {
  SUSPECT_HINT,
  SUSPECT_LABEL,
  SUSPECT_TONE,
  suspectDivergence,
  suspectStatusOf,
  suspectTradesPerWallet,
  suspectUniqueWallets,
} from "@/lib/wingman/services/scanner/suspect-review";
import {
  LANE_TONE,
  PRICE_INTEGRITY_TONE,
  PRICE_STRUCTURE_HINT,
  PRICE_STRUCTURE_LABEL,
  formatNum,
  formatOutcomePct,
  laneLabel,
  outcomeTone,
  priceStructureOf,
  setupOf,
} from "./shared";

const STRUCTURAL_TONE: Record<string, string> = {
  PASS: "border-positive/40 bg-positive/10 text-positive",
  CONCERN: "border-warning/40 bg-warning/10 text-warning",
  FAIL: "border-destructive/40 bg-destructive/10 text-destructive",
  UNKNOWN: "border-border-strong text-muted-foreground",
};

export function SuspectTable({
  rows,
  onSelect,
}: {
  rows: WorkbenchCandidate[];
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to review"
        description="No candidate in this scan was flagged EXTREME or CONCENTRATED by Participation Quality."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left">
        <thead>
          <tr className="[&>th]:label-xs [&>th]:pb-2.5 [&>th]:pr-4 [&>th]:font-medium [&>th]:whitespace-nowrap [&>th:last-child]:pr-0">
            <th>Token</th>
            <th>Setup</th>
            <th>Participation</th>
            <th className="text-right">Priority</th>
            <th className="text-right">Market cap</th>
            <th className="text-right">Liquidity</th>
            <th className="text-right">24h volume</th>
            <th className="text-right" title="Trades per unique wallet in the most repetitive observed window.">
              Trades/wallet
            </th>
            <th className="text-right">Unique wallets</th>
            <th title="Activity accelerating faster than participant breadth.">Divergence</th>
            <th title="Price / launch integrity label. Independent of setup; never affects selection.">Price structure</th>
            <th>Structural</th>
            <th className="text-right">Since call</th>
            <th className="text-right">Peak call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const status = suspectStatusOf(c);
            const structural = c.structuralStatus ?? "UNKNOWN";
            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-secondary/50 [&>td]:border-t [&>td]:border-border [&>td]:py-3 [&>td]:pr-4 [&>td:last-child]:pr-0",
                  status === "EXTREME" && "bg-destructive/[0.06]",
                )}
              >
                <td className="pr-3">
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="tabular block text-[11px] text-muted-foreground">{c.symbol}</span>
                </td>
                <td>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                      LANE_TONE[setupOf(c)] ?? "border-border-strong",
                    )}
                  >
                    {laneLabel(setupOf(c))}
                  </span>
                  {c.lanes.length > 1 ? (
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                      +{c.lanes.length - 1}
                    </span>
                  ) : null}
                </td>
                <td>
                  {status ? (
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                        SUSPECT_TONE[status],
                      )}
                      title={SUSPECT_HINT[status]}
                    >
                      {SUSPECT_LABEL[status]}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="tabular text-right text-sm font-semibold">
                  {c.quantitativePriority ?? "—"}
                </td>
                <td className="tabular text-right text-sm">
                  {c.marketCap === null ? "—" : formatUsd(c.marketCap)}
                </td>
                <td className="tabular text-right text-sm">
                  {c.liquidityUsd === null ? "—" : formatUsd(c.liquidityUsd)}
                </td>
                <td className="tabular text-right text-sm">
                  {c.volume24h === null ? "—" : formatUsd(c.volume24h)}
                </td>
                <td className="tabular text-right text-sm">
                  {formatNum(suspectTradesPerWallet(c), 1)}
                </td>
                <td className="tabular text-right text-sm">
                  {suspectUniqueWallets(c) === null ? "—" : formatNumber(suspectUniqueWallets(c)!)}
                </td>
                <td className="font-mono text-[10px] tracking-wide text-muted-foreground">
                  {suspectDivergence(c)}
                </td>
                <td>
                  {(() => {
                    const structure = priceStructureOf(c);
                    if (structure === "NOT_EVALUATED") {
                      return (
                        <span
                          className="font-mono text-[10px] text-muted-foreground"
                          title={PRICE_STRUCTURE_HINT.NOT_EVALUATED}
                        >
                          —
                        </span>
                      );
                    }
                    return (
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                          PRICE_INTEGRITY_TONE[structure] ?? "border-border-strong",
                        )}
                        title={PRICE_STRUCTURE_HINT[structure]}
                      >
                        {PRICE_STRUCTURE_LABEL[structure]}
                      </span>
                    );
                  })()}
                </td>
                <td>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                      STRUCTURAL_TONE[structural] ?? "border-border-strong",
                    )}
                  >
                    {structural}
                  </span>
                </td>
                <td className={cn("tabular text-right text-sm", outcomeTone(c.outcome?.sinceCallPct))}>
                  {c.outcome?.firstCallAt ? formatOutcomePct(c.outcome.sinceCallPct) : "—"}
                </td>
                <td
                  className={cn(
                    "tabular text-right text-sm",
                    outcomeTone(c.outcome?.peakMarketCapSinceCallPct),
                  )}
                >
                  {c.outcome?.firstCallAt
                    ? formatOutcomePct(c.outcome.peakMarketCapSinceCallPct)
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
