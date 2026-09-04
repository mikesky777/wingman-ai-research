/**
 * History token drawer.
 *
 * Read-only inspection: the live DexScreener chart for the exact pair Wingman
 * resolved, current lightweight market values, and the immutable scan-time /
 * outcome record beside them. Opening it never creates a scan run and never
 * mutates historical data.
 */
import { X } from "lucide-react";
import { KeyValue } from "@/components/wingman/Section";
import { DexScreenerEmbed } from "./DexScreenerEmbed";
import { formatDate, formatUsd, relativeTime } from "@/lib/wingman/format";
import type { CohortToken } from "@/lib/wingman/services/history/cohort";
import { liveSinceCallPct } from "@/lib/wingman/services/history/cohort";
import type { LiveMarketValues } from "@/lib/wingman/services/history/live-market";

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function HistoryTokenDrawer({
  token,
  live,
  onClose,
}: {
  token: CohortToken | null;
  live: LiveMarketValues | null;
  onClose: () => void;
}) {
  if (!token) return null;
  const since = liveSinceCallPct(token, live ? { marketCap: live.marketCap } : null);
  const pairAddress = live?.pairAddress ?? token.dexPairAddress;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm">
      <button className="flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-surface">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{token.name}</h2>
            <p className="tabular text-[11px] text-muted-foreground">
              {token.symbol} · {token.setups.join(" + ") || "NONE"} · first call{" "}
              {token.firstCallAt ? formatDate(token.firstCallAt) : "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-border-strong p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-6 px-5 py-4">
          <section>
            <h3 className="label-xs mb-2">Live chart</h3>
            <DexScreenerEmbed pairAddress={pairAddress} contractAddress={token.contractAddress} />
          </section>

          <section>
            <h3 className="label-xs mb-2">
              Live market{" "}
              <span className="font-normal text-muted-foreground">
                {live ? `· updated ${relativeTime(live.observedAt)}` : "· awaiting first update"}
              </span>
            </h3>
            <KeyValue
              columns={2}
              items={[
                {
                  label: "LIVE market cap",
                  value: live?.marketCap != null ? formatUsd(live.marketCap) : "—",
                },
                {
                  label: "LIVE price",
                  value: live?.priceUsd != null ? `$${live.priceUsd.toPrecision(4)}` : "—",
                },
                {
                  label: "Liquidity",
                  value: live?.liquidityUsd != null ? formatUsd(live.liquidityUsd) : "—",
                },
                {
                  label: "24h volume",
                  value: live?.volume24h != null ? formatUsd(live.volume24h) : "—",
                },
                { label: "1h change", value: pct(live?.priceChange1h) },
                { label: "6h change", value: pct(live?.priceChange6h) },
                { label: "24h change", value: pct(live?.priceChange24h) },
                { label: "Resolved pair", value: pairAddress ?? "—" },
              ]}
            />
          </section>

          <section>
            <h3 className="label-xs mb-2">Scan-time & outcome record (immutable)</h3>
            <KeyValue
              columns={2}
              items={[
                {
                  label: "MC @ first call",
                  value:
                    token.firstCallMarketCap !== null ? formatUsd(token.firstCallMarketCap) : "—",
                },
                {
                  label: "MC @ scan",
                  value: token.scanMarketCap !== null ? formatUsd(token.scanMarketCap) : "—",
                },
                {
                  label: "Liquidity @ scan",
                  value:
                    token.scanLiquidityUsd !== null ? formatUsd(token.scanLiquidityUsd) : "—",
                },
                {
                  label: "24h volume @ scan",
                  value: token.scanVolume24h !== null ? formatUsd(token.scanVolume24h) : "—",
                },
                { label: "Since call (live)", value: pct(since) },
                { label: "Since call (persisted)", value: pct(token.sinceCallPct) },
                { label: "Peak call", value: pct(token.peakSinceCallPct) },
                { label: "Max DD call", value: pct(token.maxAdverseSinceCallPct) },
                { label: "Peak-to-trough", value: pct(token.drawdownSinceCallPct) },
                { label: "Price integrity", value: token.priceIntegrityStatus ?? "—" },
                { label: "Structural", value: token.structuralStatus ?? "—" },
                { label: "Participation", value: token.participationStatus ?? "—" },
                { label: "Observations", value: token.observationCount },
              ]}
            />
          </section>
        </div>
      </aside>
    </div>
  );
}
