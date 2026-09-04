/**
 * History stage drawer.
 *
 * Read-only inspection: the live DexScreener chart for the exact pair Wingman
 * resolved, current lightweight market values, the immutable stage-entry
 * baseline, and the milestone provenance. Opening it never creates a scan run
 * and never mutates historical data.
 */
import { X } from "lucide-react";
import { KeyValue } from "@/components/wingman/Section";
import { DexScreenerEmbed } from "./DexScreenerEmbed";
import { formatDate, formatUsd, relativeTime } from "@/lib/wingman/format";
import {
  STAGE_TERMS,
  liveSinceStagePct,
  type StageRow,
} from "@/lib/wingman/services/history/milestones";
import type { LiveMarketValues } from "@/lib/wingman/services/history/live-market";
import { POLICY_LABELS } from "@/lib/wingman/services/history/policy-epochs";

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function HistoryTokenDrawer({
  token,
  live,
  onClose,
}: {
  token: StageRow | null;
  live: LiveMarketValues | null;
  onClose: () => void;
}) {
  if (!token) return null;
  const terms = STAGE_TERMS[token.stage];
  const since = liveSinceStagePct(token, live?.marketCap ?? null);
  const pairAddress = live?.pairAddress ?? token.dexPairAddress;
  const p = token.provenance;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm">
      <button className="flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-surface">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{token.name}</h2>
            <p className="tabular text-[11px] text-muted-foreground">
              {token.symbol} · {token.setups.join(" + ") || "NONE"} · {terms.title} entry{" "}
              {token.enteredAt ? formatDate(token.enteredAt) : "—"}
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
            <h3 className="label-xs mb-2">Stage baseline & outcome record (immutable)</h3>
            <KeyValue
              columns={2}
              items={[
                { label: "Stage", value: token.stage },
                { label: "First entered", value: token.enteredAt ? formatDate(token.enteredAt) : "—" },
                {
                  label: terms.entry,
                  value: token.entryMarketCap !== null ? formatUsd(token.entryMarketCap) : "—",
                },
                {
                  label: "Price @ entry",
                  value:
                    token.entryPriceUsd !== null ? `$${token.entryPriceUsd.toPrecision(4)}` : "—",
                },
                {
                  label: "Liquidity @ entry",
                  value:
                    token.entryLiquidityUsd !== null ? formatUsd(token.entryLiquidityUsd) : "—",
                },
                { label: `${terms.since} (live)`, value: pct(since) },
                { label: `${terms.since} (persisted)`, value: pct(token.sincePct) },
                { label: terms.peak, value: pct(token.peakPct) },
                { label: terms.maxDd, value: pct(token.maxAdversePct) },
                { label: "Peak-to-trough", value: pct(token.drawdownPct) },
                { label: "Baseline complete", value: token.baselineComplete ? "YES" : "NO" },
                { label: "Price integrity", value: token.priceIntegrityStatus ?? "—" },
                { label: "Structural", value: token.structuralStatus ?? "—" },
                { label: "Participation", value: token.participationStatus ?? "—" },
                { label: "Observations", value: token.observationCount },
              ]}
            />
          </section>

          <section>
            <h3 className="label-xs mb-2">Milestone provenance</h3>
            <KeyValue
              columns={2}
              items={[
                { label: "Source type", value: p?.sourceType ?? "—" },
                { label: "Originating run", value: p?.sourceScanId ?? p?.sourceId ?? "—" },
                { label: "Source ref", value: p?.sourceRef ?? "—" },
                { label: "Research packet", value: p?.researchPacketId ?? "—" },
                { label: "Packet version", value: p?.researchPacketVersion ?? "—" },
                { label: "AI / thesis run", value: p?.researchRunId ?? "—" },
                { label: "Research report", value: p?.researchReportId ?? "—" },
                {
                  label: "Policy era",
                  value: `${POLICY_LABELS[token.policyEpoch] ?? token.policyEpoch} (${token.policyEpoch})`,
                },
                { label: "Selection policy", value: token.selectionPolicyVersion ?? "—" },
                { label: "Policy version", value: p?.policyVersion ?? "—" },
                { label: "Milestone version", value: p?.milestoneVersion ?? "—" },

              ]}
            />
          </section>
        </div>
      </aside>
    </div>
  );
}
