import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ExternalLink, Loader2, ShieldQuestion } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/wingman/format";
import { checkTokenHolders, setCandidateLabel } from "@/lib/wingman/workbench.functions";
import type { WorkbenchCandidate } from "@/lib/wingman/services/scanner-service";
import {
  COMPONENT_LABELS,
  EXTENSION_TONE,
  LANE_TONE,
  RECURRENCE_HINT,
  RECURRENCE_TONE,
  REFRESH_HINT,
  REFRESH_TONE,
  formatEvidenceAge,
  formatOutcomePct,
  formatOutcomeTime,
  outcomeTone,
  SIGNAL_TONE,
  formatAge,
  formatNum,
  formatPctChange,
  formatRatioPct,
  formatScanTime,
  laneLabel,
} from "./shared";

const LABELS = ["UNREVIEWED", "INTERESTING", "RESEARCH", "JUNK"] as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
      <span className="label-xs">{label}</span>
      <span className="tabular text-xs">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface/60 p-3">
      <p className="label-xs mb-2">{title}</p>
      {children}
    </section>
  );
}

export function CandidateDrawer({
  candidate,
  scanRunId,
  onClose,
}: {
  candidate: WorkbenchCandidate | null;
  scanRunId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const holderCheck = useServerFn(checkTokenHolders);
  const labelFn = useServerFn(setCandidateLabel);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const holders = useMutation({
    mutationFn: () =>
      holderCheck({
        data: {
          contractAddress: candidate?.contractAddress ?? "",
          tokenId: candidate?.tokenId ?? null,
        },
      }),
  });

  const label = useMutation({
    mutationFn: (value: (typeof LABELS)[number]) =>
      labelFn({
        data: {
          tokenId: candidate!.tokenId,
          scanRunId,
          label: value,
          note: note.trim() || null,
        },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["wingman"] }),
  });

  if (!candidate) return null;
  const c = candidate;
  const breakdown = c.priorityBreakdown;

  return (
    <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {c.name}
            <span className="tabular text-xs font-normal text-muted-foreground">{c.symbol}</span>
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] break-all">
            {c.contractAddress ?? "contract address unavailable"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-8">
          {c.contractAddress ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(c.contractAddress!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy CA"}
              </Button>
              <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <a
                  href={`https://dexscreener.com/solana/${c.contractAddress}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  DexScreener
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1">
            {c.lanes.length === 0 ? (
              <span className="text-xs text-muted-foreground">No lane qualified</span>
            ) : (
              c.lanes.map((lane) => (
                <span
                  key={lane}
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                    LANE_TONE[lane] ?? "border-border-strong",
                  )}
                >
                  {laneLabel(lane)} · lane rank {c.laneRanks[lane] ?? "—"}
                </span>
              ))
            )}
          </div>

          <Block title="Why this candidate surfaced">
            <Row label="Global rank" value={c.globalRank ?? "—"} />
            <Row
              label="Selection"
              value={
                c.selectedByLaneReservation
                  ? "LANE QUOTA"
                  : c.selectedByGlobalRanking
                    ? "GLOBAL RANK"
                    : c.rejectionReason
                      ? "REJECTED"
                      : "NEAR MISS"
              }
            />
            {c.discoveryQueries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No discovery provenance recorded.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {c.discoveryQueries.map((q) => (
                  <li key={q} className="flex justify-between gap-2">
                    <span className="font-mono text-[11px]">{q}</span>
                    <span className="tabular text-muted-foreground">
                      rank {c.discoveryRanks[q] ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Current market state">
            <Row label="Market cap" value={c.marketCap === null ? "—" : formatUsd(c.marketCap)} />
            <Row label="Bucket" value={c.marketCapBucket} />
            <Row
              label="Liquidity"
              value={c.liquidityUsd === null ? "—" : formatUsd(c.liquidityUsd)}
            />
            <Row label="Volume 1h" value={c.volume1h === null ? "—" : formatUsd(c.volume1h)} />
            <Row label="Volume 24h" value={c.volume24h === null ? "—" : formatUsd(c.volume24h)} />
            <Row label="Turnover 24h (vol/MC)" value={formatRatioPct(c.turnover24h)} />
            <Row label="Volume / liquidity 24h" value={formatNum(c.volumeToLiquidity24h)} />
            <Row label="Trades 1h / 24h" value={`${c.trades1h ?? "—"} / ${c.trades24h ?? "—"}`} />
            <Row label="Buys / sells 24h" value={`${c.buys24h ?? "—"} / ${c.sells24h ?? "—"}`} />
            <Row label="Price change 1h" value={formatPctChange(c.priceChange1h)} />
            <Row label="Price change 24h" value={formatPctChange(c.priceChange24h)} />
            <Row label="Age" value={`${formatAge(c.ageMinutes)} (${c.ageBasis ?? "unknown"})`} />
            <Row label="Snapshots in Wingman history" value={c.historySnapshotCount} />
          </Block>

          <Block title="Scan recurrence">
            <p className="mb-2 text-[11px] text-muted-foreground">
              Wingman scan history only. Descriptive — it never changes priority, filtering or
              survivor selection.
            </p>
            <Row
              label="Recurrence state"
              value={
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                    RECURRENCE_TONE[c.recurrenceState] ?? "border-border-strong",
                  )}
                  title={RECURRENCE_HINT[c.recurrenceState] ?? ""}
                >
                  {c.recurrenceState}
                </span>
              }
            />
            <Row label="First seen (Wingman)" value={formatScanTime(c.firstSeenScanAt)} />
            <Row label="Previous seen" value={formatScanTime(c.previousSeenScanAt)} />
            <Row label="Scans seen" value={c.scansSeenCount} />
            <Row label="Consecutive scans seen" value={c.consecutiveScansSeen} />
            <Row
              label="Priority previous → current"
              value={`${c.previousQuantitativePriority ?? "—"} → ${c.quantitativePriority ?? "—"}`}
            />
            <Row
              label="Priority delta"
              value={
                c.priorityDelta === null
                  ? "—"
                  : `${c.priorityDelta > 0 ? "+" : ""}${c.priorityDelta}`
              }
            />
            <Row
              label="Setups previous → current"
              value={`${c.previousSetups.length ? c.previousSetups.join("+") : "—"} → ${
                c.lanes.length ? c.lanes.join("+") : "NONE"
              }`}
            />
            <Row
              label="Last survivor selection"
              value={formatScanTime(c.lastSelectedAsSurvivorAt)}
            />
            <Row
              label="Refresh state"
              value={
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
                    REFRESH_TONE[c.refreshState] ?? "border-border-strong",
                  )}
                  title={REFRESH_HINT[c.refreshState] ?? ""}
                >
                  {c.refreshState}
                </span>
              }
            />
            <Row label="Most recent enrichment" value={formatScanTime(c.lastEnrichedAt)} />
            <Row label="Evidence age" value={formatEvidenceAge(c.evidenceAgeMinutes)} />
            <Row
              label="Evidence for this scan"
              value={c.evidenceCarriedForward ? "Carried forward" : "Fresh evidence"}
            />

            {c.refreshDomains ? (
              <div className="mt-2 space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Evidence domains (judged independently)
                </div>
                {Object.values(c.refreshDomains).map((d) => (
                  <div
                    key={d.domain}
                    className="flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono uppercase text-muted-foreground">{d.domain}</span>
                    <span className="text-right">
                      <span
                        className={cn(
                          "rounded border px-1 py-0.5 font-mono text-[10px]",
                          REFRESH_TONE[d.state] ?? "border-border-strong",
                        )}
                        title={d.reason}
                      >
                        {d.state}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {formatEvidenceAge(d.evidenceAgeMinutes)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {c.universeEligibility === "OUT_OF_SCOPE" ? (
              <Row
                label="Mandate"
                value={`Out of scope · ${c.universeCategory ?? "—"}${
                  c.universeReason ? ` — ${c.universeReason}` : ""
                }`}
              />
            ) : null}


            {c.recurrenceChangeReasons.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {c.recurrenceChangeReasons.map((reason) => (
                  <li key={reason} className="text-[11px] text-muted-foreground">
                    · {reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </Block>

          <Block title="Outcome since Wingman observation">
            <p className="mb-2 text-[11px] text-muted-foreground">
              Historical market behavior after Wingman observation/selection — not a simulated or
              backtested trade return. Derived from stored observations only.
            </p>
            <Row label="First seen" value={formatOutcomeTime(c.outcome?.firstSeenAt ?? null)} />
            <Row
              label="First-seen MC"
              value={
                c.outcome?.firstSeenMarketCap == null
                  ? "—"
                  : formatUsd(c.outcome.firstSeenMarketCap)
              }
            />
            <Row
              label="Since seen"
              value={
                <span className={outcomeTone(c.outcome?.sinceSeenPct)}>
                  {formatOutcomePct(c.outcome?.sinceSeenPct)}
                </span>
              }
            />
            <Row
              label="First Wingman call"
              value={
                c.outcome?.firstCallAt ? formatOutcomeTime(c.outcome.firstCallAt) : "Never selected"
              }
            />
            <Row
              label="First-call MC"
              value={
                c.outcome?.firstCallMarketCap == null
                  ? "—"
                  : formatUsd(c.outcome.firstCallMarketCap)
              }
            />
            <Row
              label="Since call"
              value={
                <span className={outcomeTone(c.outcome?.sinceCallPct)}>
                  {c.outcome?.firstCallAt ? formatOutcomePct(c.outcome.sinceCallPct) : "—"}
                </span>
              }
            />
            <Row
              label="Current MC"
              value={
                c.outcome?.currentMarketCap == null ? "—" : formatUsd(c.outcome.currentMarketCap)
              }
            />
            <Row
              label="Max gain (seen / call)"
              value={`${formatOutcomePct(c.outcome?.maxGainSinceSeenPct)} / ${
                c.outcome?.firstCallAt ? formatOutcomePct(c.outcome.maxGainSinceCallPct) : "—"
              }`}
            />
            <Row
              label="Max adverse change (seen / call)"
              value={`${formatOutcomePct(c.outcome?.maxAdverseSinceSeenPct)} / ${
                c.outcome?.firstCallAt ? formatOutcomePct(c.outcome.maxAdverseSinceCallPct) : "—"
              }`}
            />
            <Row
              label="Peak-to-trough drawdown (seen / call)"
              value={`${formatOutcomePct(c.outcome?.drawdownSinceSeenPct)} / ${
                c.outcome?.firstCallAt ? formatOutcomePct(c.outcome.drawdownSinceCallPct) : "—"
              }`}
            />
            <Row label="Stored observations" value={c.outcome?.observationCount ?? 0} />
          </Block>

          <Block title="Lifecycle signals">
            <Row
              label="Activity state"
              value={
                <span className={SIGNAL_TONE[c.activityState ?? "UNKNOWN"]}>
                  {c.activityState ?? "—"}
                </span>
              }
            />
            <Row
              label="Persistence"
              value={
                <span className={SIGNAL_TONE[c.persistenceSignal ?? "UNKNOWN"]}>
                  {c.persistenceSignal ?? "—"}
                </span>
              }
            />
            <Row
              label="Reacceleration"
              value={
                <span className={SIGNAL_TONE[c.reaccelerationSignal ?? "UNKNOWN"]}>
                  {c.reaccelerationSignal ?? "—"}
                </span>
              }
            />
            <Row
              label="Attention vs price"
              value={
                <span className={SIGNAL_TONE[c.attentionPriceDivergence ?? "UNKNOWN"]}>
                  {c.attentionPriceDivergence ?? "—"}
                </span>
              }
            />
            <Row
              label="Extension risk"
              value={
                <span className={EXTENSION_TONE[c.extensionRisk ?? "UNKNOWN"]}>
                  {c.extensionRisk ?? "—"}
                </span>
              }
            />
            {c.extensionReasons.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {c.extensionReasons.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            ) : null}
          </Block>

          <Block title="Quantitative priority breakdown">
            {!breakdown ? (
              <p className="text-xs text-muted-foreground">
                Not ranked — this candidate never reached quantitative scoring.
              </p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(breakdown.components).map(([key, part]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-36 shrink-0 text-[11px]">
                      {COMPONENT_LABELS[key] ?? key}
                    </span>
                    <div className="h-1.5 flex-1 rounded bg-secondary">
                      <div
                        className="h-full rounded bg-primary/70"
                        style={{ width: `${Math.min(Math.max(part.score, 0), 1) * 100}%` }}
                      />
                    </div>
                    <span className="tabular w-24 text-right text-[11px] text-muted-foreground">
                      {formatNum(part.points, 1)} pts · w{formatNum(part.weight, 2)}
                    </span>
                  </div>
                ))}
                <div className="mt-2 border-t border-border pt-2 text-xs">
                  <Row label="Raw" value={formatNum(breakdown.raw, 1)} />
                  <Row label="Extension penalty" value={formatNum(breakdown.extensionPenalty, 1)} />
                  <Row
                    label="Divergence adjustment"
                    value={formatNum(breakdown.divergenceAdjustment, 1)}
                  />
                  <Row label="Total priority" value={formatNum(breakdown.total, 1)} />
                  <Row
                    label="Change vs previous scan"
                    value={
                      c.priorityChange === null
                        ? "no prior scan"
                        : `${c.priorityChange >= 0 ? "+" : ""}${formatNum(c.priorityChange, 1)}`
                    }
                  />
                </div>
              </div>
            )}
          </Block>

          {Object.keys(c.laneRejections).length > 0 ? (
            <Block title="Lane refusals">
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {Object.entries(c.laneRejections).map(([lane, reason]) => (
                  <li key={lane}>
                    <span className="font-mono">{laneLabel(lane)}</span> — {reason}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {c.rejectionReason ? (
            <Block title="Hard-filter rejection">
              <p className="font-mono text-[11px]">{c.rejectionReason}</p>
              {c.rejectionDetails ? (
                <pre className="mt-2 overflow-x-auto rounded bg-secondary/60 p-2 text-[10px] text-muted-foreground">
                  {JSON.stringify(c.rejectionDetails, null, 2)}
                </pre>
              ) : null}
            </Block>
          ) : null}

          <Block title="Structural checks">
            <Row label="Structural safety" value={c.structuralSafety} />
            <Row label="Token security" value={c.tokenSecurity} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Wingman never derives a safety verdict automatically. Holder concentration is a fact,
              not a rug verdict; token-security scanning is not wired up yet.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 gap-2"
              disabled={holders.isPending || !c.contractAddress}
              onClick={() => holders.mutate()}
            >
              {holders.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldQuestion className="size-3.5" />
              )}
              Run holder check
            </Button>
            {holders.data ? (
              holders.data.ok ? (
                <div className="mt-2">
                  <Row label="Wallet holders" value={holders.data.walletHolderCount ?? "—"} />
                  <Row
                    label="Top 10 wallets"
                    value={
                      holders.data.top10WalletPct === null
                        ? "—"
                        : `${holders.data.top10WalletPct.toFixed(1)}%`
                    }
                  />
                  <Row
                    label="Top 20 wallets"
                    value={
                      holders.data.top20WalletPct === null
                        ? "—"
                        : `${holders.data.top20WalletPct.toFixed(1)}%`
                    }
                  />
                  {holders.data.cohorts.map((cohort) => (
                    <Row
                      key={cohort.cohort}
                      label={cohort.cohort}
                      value={`${cohort.walletCount ?? "—"} wallets · ${
                        cohort.pctOfSupply === null ? "—" : `${cohort.pctOfSupply.toFixed(1)}%`
                      }`}
                    />
                  ))}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Cohorts overlap and are never summed into a single “suspicious supply” number.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-warning">
                  Holder data unavailable — {holders.data.message ?? "provider error"}.
                </p>
              )
            ) : null}
          </Block>

          <Block title="Human calibration label">
            <div className="flex flex-wrap gap-1.5">
              {LABELS.map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={c.label === value ? "default" : "outline"}
                  disabled={label.isPending}
                  onClick={() => label.mutate(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
            <Textarea
              className="mt-2 text-xs"
              rows={2}
              placeholder={c.labelNote ?? "Optional calibration note"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Labels are private calibration input for humans. They never feed scoring or ranking.
            </p>
          </Block>
        </div>
      </SheetContent>
    </Sheet>
  );
}
