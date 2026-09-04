import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  checkTokenHolders,
  getCandidateCandles,
  setCandidateLabel,
} from "@/lib/wingman/workbench.functions";
import {
  RefreshMarketButton,
  UpdatedAgo,
  useMarketRefresh,
} from "./RefreshMarketButton";
import { PriceIntegrityChart } from "./PriceIntegrityChart";
import { DexScreenerEmbed } from "@/components/wingman/history/DexScreenerEmbed";
import type { WorkbenchCandidate } from "@/lib/wingman/services/scanner-service";
import { evaluateFromCandidateRowSummary } from "@/lib/wingman/services/scanner/price-integrity";
import { assessRecentMarketDamage } from "@/lib/wingman/services/scanner/market-damage";
import {
  COMPONENT_LABELS,
  EXTENSION_TONE,
  LANE_TONE,
  RECURRENCE_HINT,
  RECURRENCE_TONE,
  REFRESH_HINT,
  REFRESH_TONE,
  STRUCTURAL_TONE,
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

/** Ratio → percent, preserving "unavailable" rather than inventing a zero. */
function fmtPct(v: number | null | undefined): string {
  return v == null ? "unavailable" : `${(v * 100).toFixed(1)}%`;
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
  const marketRefresh = useMarketRefresh(candidate?.contractAddress ?? null);
  const holderCheck = useServerFn(checkTokenHolders);
  const labelFn = useServerFn(setCandidateLabel);
  const loadCandles = useServerFn(getCandidateCandles);
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

  // Persisted candles only. Storage read — never a provider request.
  const candlesQuery = useQuery({
    queryKey: ["wingman", "candles", candidate?.contractAddress ?? null],
    queryFn: () => loadCandles({ data: { contractAddress: candidate!.contractAddress! } }),
    enabled: Boolean(candidate?.contractAddress),
    staleTime: Infinity,
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
  // Shadow-only coverage read. A persisted row carries no price series, so this
  // reports what history exists and never classifies from it.
  // Persisted candle-derived evaluation when the run computed one; otherwise a
  // coverage-only read (a persisted row carries no price series).
  const persistedIntegrity = c.priceIntegrityDetail;
  const priceIntegrity = evaluateFromCandidateRowSummary({
    historySnapshotCount: c.historySnapshotCount,
    ageMinutes: c.ageMinutes,
    firstSeenScanAt: c.firstSeenScanAt,
    scanAt: c.lastEnrichedAt,
  });

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
              <RefreshMarketButton
                contractAddress={c.contractAddress}
                pending={marketRefresh.pending}
                disabled={marketRefresh.disabled}
                onClick={marketRefresh.refresh}
                className="h-7 px-2"
              />
              <UpdatedAgo at={marketRefresh.lastAt} />
              {marketRefresh.error ? (
                <span className="font-mono text-[10px] text-destructive">
                  {marketRefresh.error}
                </span>
              ) : null}
            </div>
          ) : null}

          <Block title="Live DexScreener chart (visual only)">
            <p className="mb-2 text-[11px] text-muted-foreground">
              The exact pair Wingman resolved. Visual reference only — no Wingman calculation ever
              reads this embed.
            </p>
            <DexScreenerEmbed
              pairAddress={marketRefresh.result?.pair?.pairAddress ?? null}
              contractAddress={c.contractAddress}
              height={360}
            />
          </Block>

          {marketRefresh.result?.ok && marketRefresh.result.values ? (
            <Block title="Refreshed market (current, not scan-time)">
              <Row
                label="Price"
                value={
                  marketRefresh.result.values.priceUsd == null
                    ? "—"
                    : `$${marketRefresh.result.values.priceUsd}`
                }
              />
              <Row
                label="Market cap"
                value={
                  marketRefresh.result.values.marketCap == null
                    ? "—"
                    : formatUsd(marketRefresh.result.values.marketCap)
                }
              />
              <Row
                label="Liquidity"
                value={
                  marketRefresh.result.values.liquidityUsd == null
                    ? "—"
                    : formatUsd(marketRefresh.result.values.liquidityUsd)
                }
              />
              <Row
                label="24h volume"
                value={
                  marketRefresh.result.values.volume24h == null
                    ? "—"
                    : formatUsd(marketRefresh.result.values.volume24h)
                }
              />
              <Row
                label="Turnover"
                value={
                  marketRefresh.result.values.turnover24h == null
                    ? "—"
                    : `${(marketRefresh.result.values.turnover24h * 100).toFixed(1)}%`
                }
              />
              <Row
                label="Pair"
                value={`${marketRefresh.result.pair?.dexId ?? "—"} / ${
                  marketRefresh.result.pair?.quoteTokenSymbol ?? "—"
                }`}
              />
              <p className="pt-1 text-[11px] text-muted-foreground">
                Stored as a new immutable observation. Scan-time values above the fold are
                unchanged.
              </p>
            </Block>
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

          <Block title="Structural eligibility">
            <p className="mb-2 text-[11px] text-muted-foreground">
              Deterministic structural risk only — not a thesis score and not entry quality. A FAIL
              candidate cannot be selected as a Survivor or sent to expensive research. PASS,
              CONCERN and UNKNOWN stay eligible; missing evidence stays UNKNOWN, never read as
              clean.
            </p>
            <Row
              label="Status"
              value={
                <span
                  className={cn(
                    "rounded border px-1 py-0.5 font-mono text-[10px]",
                    STRUCTURAL_TONE[c.structuralStatus ?? "UNKNOWN"],
                  )}
                >
                  {c.structuralStatus ?? "UNKNOWN"}
                </span>
              }
            />
            <Row label="Policy" value={c.structuralPolicyVersion ?? "—"} />
            {(c.structuralDetail?.rules ?? []).map((rule) => (
              <div key={rule.id} className="mt-1 text-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono uppercase text-muted-foreground">{rule.label}</span>
                  <span
                    className={cn(
                      "rounded border px-1 py-0.5 font-mono text-[10px]",
                      STRUCTURAL_TONE[rule.status],
                    )}
                  >
                    {rule.status}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {rule.detail ?? rule.fact} · {rule.source}
                  {rule.observedAt ? ` · ${formatOutcomeTime(rule.observedAt)}` : ""}
                </p>
              </div>
            ))}
            {(c.structuralDetail?.context ?? []).length > 0 ? (
              <div className="mt-2 border-t border-border pt-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Holder context (descriptive, not scored)
                </div>
                {(c.structuralDetail?.context ?? []).map((item) => (
                  <Row key={item.id} label={item.label} value={item.value} />
                ))}
              </div>
            ) : null}
          </Block>

          <Block title="Recent market damage">
            {(() => {
              const damage = assessRecentMarketDamage(c.priceChange1h);
              return (
                <>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Current-market Survivor gate only. Temporary — never a structural verdict, a
                    priority input or a permanent exclusion. Missing data stays UNKNOWN.
                  </p>
                  <Row
                    label="1h change"
                    value={
                      c.priceChange1h === null || c.priceChange1h === undefined
                        ? "—"
                        : `${c.priceChange1h.toFixed(2)}%`
                    }
                  />
                  <Row label="Threshold" value={`${damage.thresholdPct}% or lower`} />
                  <Row
                    label="Status"
                    value={
                      <span
                        className={cn(
                          "rounded border px-1 py-0.5 font-mono text-[10px]",
                          damage.status === "FAIL"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : damage.status === "PASS"
                              ? "border-positive/40 bg-positive/10 text-positive"
                              : "border-border-strong text-muted-foreground",
                        )}
                      >
                        {damage.status}
                      </span>
                    }
                  />
                  {damage.reason ? <Row label="Rejection reason" value={damage.reason} /> : null}
                </>
              );
            })()}
          </Block>

          <Block title="Participation quality (shadow)">
            {(() => {
              const pq = c.participationDetail;
              const status = c.participationStatus ?? "UNKNOWN";
              const windows = pq?.windows ?? null;
              const order = ["30m", "1h", "4h", "24h"] as const;
              return (
                <>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Descriptive market-structure observation only — never a veto, never an input to
                    priority, setups, structural status or Survivor selection. Repetitive trading and
                    narrow participant breadth are patterns, not proof of any actor's intent.
                  </p>
                  <Row
                    label="Status"
                    value={
                      <span className="rounded border border-border-strong px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {status}
                      </span>
                    }
                  />
                  <Row label="Policy" value={c.participationPolicyVersion ?? "participation/v1"} />
                  <Row label="Breadth" value={pq?.dimensions?.breadth ?? "UNKNOWN"} />
                  <Row label="Repetition" value={pq?.dimensions?.repetition ?? "UNKNOWN"} />
                  <Row label="Divergence" value={pq?.dimensions?.divergence ?? "UNKNOWN"} />
                  {pq?.subSignals?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {pq.subSignals.map((sub) => (
                        <span
                          key={sub}
                          className="rounded border border-border-strong px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {windows ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="label-xs text-left">
                            <th className="py-1 pr-2">Window</th>
                            <th className="py-1 pr-2 text-right">Trades</th>
                            <th className="py-1 pr-2 text-right">Wallets</th>
                            <th className="py-1 pr-2 text-right">Trades/wallet</th>
                            <th className="py-1 pr-2 text-right">Volume</th>
                            <th className="py-1 text-right">Vol/wallet</th>
                          </tr>
                        </thead>
                        <tbody className="tabular">
                          {order.map((w) => {
                            const m = windows[w];
                            if (!m) return null;
                            return (
                              <tr key={w} className="border-t border-border/60">
                                <td className="py-1 pr-2">{w}</td>
                                <td className="py-1 pr-2 text-right">{formatNum(m.trades)}</td>
                                <td className="py-1 pr-2 text-right">
                                  {formatNum(m.uniqueWallets)}
                                </td>
                                <td className="py-1 pr-2 text-right">
                                  {m.tradesPerWallet == null ? "—" : m.tradesPerWallet.toFixed(2)}
                                </td>
                                <td className="py-1 pr-2 text-right">
                                  {m.volumeUsd == null ? "—" : formatUsd(m.volumeUsd)}
                                </td>
                                <td className="py-1 text-right">
                                  {m.volumeUsdPerWallet == null
                                    ? "—"
                                    : formatUsd(m.volumeUsdPerWallet)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      No participation evidence observed for this candidate.
                    </p>
                  )}
                  {windows ? (
                    <div className="mt-2">
                      <Row
                        label="Activity/breadth divergence"
                        value={
                          order
                            .filter((w) => windows[w]?.activityBreadthDivergence)
                            .join(", ") || "none observed"
                        }
                      />
                      <Row
                        label="Wallet growth (1h)"
                        value={
                          windows["1h"]?.walletGrowthPct == null
                            ? "—"
                            : `${windows["1h"]!.walletGrowthPct!.toFixed(1)}%`
                        }
                      />
                      <Row
                        label="Trade growth (1h)"
                        value={
                          windows["1h"]?.tradeGrowthPct == null
                            ? "—"
                            : `${windows["1h"]!.tradeGrowthPct!.toFixed(1)}%`
                        }
                      />
                    </div>
                  ) : null}
                  <Row
                    label="Volume / liquidity (24h)"
                    value={formatRatioPct(c.volumeToLiquidity24h)}
                  />
                  <Row label="Turnover (24h)" value={formatRatioPct(c.turnover24h)} />
                  {pq?.reasons?.length ? (
                    <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      {pq.reasons.map((reason) => (
                        <li key={reason}>· {reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              );
            })()}
          </Block>


          <Block title="Price / launch integrity (shadow)">
            <p className="mb-2 text-[11px] text-muted-foreground">
              Calibration only — never affects priority, setups, structural status or Survivor
              selection. Deep drawdown alone is never damage, and unobserved launch history stays
              UNKNOWN rather than being guessed.
            </p>
            <Row
              label="Status"
              value={
                <span className="rounded border border-border-strong px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {persistedIntegrity ? (c.priceIntegrityStatus ?? "UNKNOWN") : priceIntegrity.status}
                </span>
              }
            />
            <Row
              label="Policy"
              value={c.priceIntegrityPolicyVersion ?? priceIntegrity.policyVersion}
            />
            <Row
              label="Selection effect"
              value="None — label only (Universe and Structural remain the gates)"
            />
            <Row
              label="Historical candles"
              value={
                persistedIntegrity
                  ? `${persistedIntegrity.coverage.observations} · ${
                      persistedIntegrity.coverage.resolutions?.join(", ") || "n/a"
                    }`
                  : "none fetched"
              }
            />
            <div className="mt-2 border-t border-border pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Measured coverage
              </div>
              <p className="pt-1 text-[11px] text-muted-foreground">
              Peak call is the maximum observed market-cap gain since Wingman's first Survivor
              call. Historical observation, not simulated or realized trading profit.
            </p>
            <Row label="Stored observations" value={c.historySnapshotCount} />
              <Row label="Scans seen" value={c.scansSeenCount} />
              <Row label="First seen" value={formatOutcomeTime(c.firstSeenScanAt)} />
              <Row
                label="Launch → first observation"
                value={
                  priceIntegrity.coverage.minutesFromLaunchToFirstObservation === null
                    ? "unknown"
                    : formatAge(priceIntegrity.coverage.minutesFromLaunchToFirstObservation)
                }
              />
              <Row
                label="Launch impulse observed"
                value={priceIntegrity.coverage.launchImpulseObserved ? "yes" : "no"}
              />
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Derived features
              </div>
              <Row
                label="Peak → current drawdown"
                value={fmtPct(persistedIntegrity?.features.drawdownFromPeak)}
              />
              <Row
                label="Peak → stabilized ratio"
                value={
                  persistedIntegrity?.features.peakToStabilizedRatio != null
                    ? `${persistedIntegrity.features.peakToStabilizedRatio.toFixed(1)}x`
                    : "unavailable"
                }
              />
              <Row
                label="Early-peak timing"
                value={
                  persistedIntegrity?.features.minutesFirstObservationToPeak != null
                    ? formatAge(persistedIntegrity.features.minutesFirstObservationToPeak)
                    : "unavailable"
                }
              />
              <Row
                label="Recovery from low"
                value={fmtPct(persistedIntegrity?.features.recoveryFromLow)}
              />
              <Row
                label="Launch-window volume share"
                value={fmtPct(persistedIntegrity?.features.earlyVolumeShare)}
              />
              <Row
                label="Liquidity retention"
                value={fmtPct(persistedIntegrity?.features.liquidityRetention)}
              />
            </div>
            <ul className="mt-2 space-y-1">
              {(persistedIntegrity?.reasons ?? priceIntegrity.reasons).map((reason) => (
                <li key={reason} className="text-[11px] text-muted-foreground">
                  · {reason}
                </li>
              ))}
            </ul>
            {(persistedIntegrity?.signals ?? []).length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {(persistedIntegrity?.signals ?? []).map((s) => (
                  <span
                    key={s}
                    className="rounded border border-border-strong px-1 py-0.5 font-mono text-[9px] tracking-wide text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : null}
          </Block>

          <Block title="Historical candles (as evaluated)">
            <p className="mb-2 text-[11px] text-muted-foreground">
              The exact stored candle dataset Price Integrity read. Served from Wingman storage —
              opening this drawer never requests new provider history.
            </p>
            {candlesQuery.isLoading ? (
              <p className="text-[11px] text-muted-foreground">Loading stored candles…</p>
            ) : (
              <>
                <PriceIntegrityChart
                  candles={candlesQuery.data?.candles ?? []}
                  levels={{
                    peakValue: persistedIntegrity?.features.peakValue ?? null,
                    postPeakLowValue: persistedIntegrity?.features.postPeakLowValue ?? null,
                    sustainedHigh: persistedIntegrity?.features.postCollapseSustainedHigh ?? null,
                    currentValue: persistedIntegrity?.features.currentValue ?? null,
                  }}
                />
                <div className="mt-2 border-t border-border pt-2">
                  <Row
                    label="Candles stored"
                    value={`${candlesQuery.data?.candles.length ?? 0} · ${
                      candlesQuery.data?.intervals.join(", ") || "n/a"
                    }`}
                  />
                  <Row
                    label="Window"
                    value={`${formatOutcomeTime(candlesQuery.data?.firstCandleAt ?? null)} → ${formatOutcomeTime(
                      candlesQuery.data?.lastCandleAt ?? null,
                    )}`}
                  />
                  <Row
                    label="Status"
                    value={persistedIntegrity ? (c.priceIntegrityStatus ?? "UNKNOWN") : "UNKNOWN"}
                  />
                  <Row
                    label="Peak → stabilized ratio"
                    value={
                      persistedIntegrity?.features.peakToStabilizedRatio != null
                        ? `${persistedIntegrity.features.peakToStabilizedRatio.toFixed(1)}x`
                        : "unavailable"
                    }
                  />
                  <Row
                    label="Peak drawdown"
                    value={fmtPct(persistedIntegrity?.features.drawdownFromPeak)}
                  />
                  <Row
                    label="Current repair fraction"
                    value={fmtPct(persistedIntegrity?.features.currentRepairFraction)}
                  />
                  <Row
                    label="Sustained repair fraction"
                    value={fmtPct(persistedIntegrity?.features.peakRepairFraction)}
                  />
                  <Row
                    label="First observation → peak"
                    value={
                      persistedIntegrity?.features.minutesFirstObservationToPeak != null
                        ? formatAge(persistedIntegrity.features.minutesFirstObservationToPeak)
                        : "unavailable"
                    }
                  />
                  <Row
                    label="Peak → major collapse"
                    value={
                      persistedIntegrity?.features.minutesPeakToMajorDrawdown != null
                        ? formatAge(persistedIntegrity.features.minutesPeakToMajorDrawdown)
                        : "unavailable"
                    }
                  />
                  <Row
                    label="Volume 30m / 1h / 3h"
                    value={`${fmtPct(persistedIntegrity?.features.first30mVolumeShare)} / ${fmtPct(
                      persistedIntegrity?.features.first1hVolumeShare,
                    )} / ${fmtPct(persistedIntegrity?.features.first3hVolumeShare)}`}
                  />
                  <Row
                    label="Lifecycle blowoff"
                    value={
                      (persistedIntegrity?.signals ?? []).includes("LIFECYCLE_BLOWOFF_COLLAPSE")
                        ? "LIFECYCLE_BLOWOFF_COLLAPSE"
                        : persistedIntegrity?.features.peakToPrePeakBaselineRatio != null
                          ? `no · peak/baseline ${persistedIntegrity.features.peakToPrePeakBaselineRatio.toFixed(1)}x`
                          : "unavailable"
                    }
                  />
                </div>
              </>
            )}
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
              label="First call price"
              value={
                c.outcome?.firstCallPriceUsd == null ? "—" : `$${c.outcome.firstCallPriceUsd}`
              }
            />
            <Row
              label="Peak call"
              value={
                <span className={outcomeTone(c.outcome?.peakMarketCapSinceCallPct)}>
                  {c.outcome?.firstCallAt
                    ? formatOutcomePct(c.outcome.peakMarketCapSinceCallPct)
                    : "—"}
                </span>
              }
            />
            <Row
              label="Peak post-call MC / price"
              value={`${
                c.outcome?.firstCallAt && c.outcome.peakMarketCapSinceCall != null
                  ? formatUsd(c.outcome.peakMarketCapSinceCall)
                  : "—"
              } / ${
                c.outcome?.firstCallAt && c.outcome.peakPriceSinceCall != null
                  ? `$${c.outcome.peakPriceSinceCall}`
                  : "—"
              }`}
            />
            <Row
              label="Peak observed at"
              value={
                c.outcome?.peakMarketCapSinceCallAt
                  ? formatOutcomeTime(c.outcome.peakMarketCapSinceCallAt)
                  : "—"
              }
            />
            <Row
              label="Current price"
              value={c.outcome?.currentPriceUsd == null ? "—" : `$${c.outcome.currentPriceUsd}`}
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
            <Row
              label="Max adverse since call"
              value={
                <span className={outcomeTone(c.outcome?.maxAdverseSinceCallPctV2)}>
                  {c.outcome?.firstCallAt
                    ? formatOutcomePct(c.outcome.maxAdverseSinceCallPctV2)
                    : "—"}
                </span>
              }
            />
            <Row
              label="Post-call low MC / at"
              value={`${
                c.outcome?.firstCallAt && c.outcome.maxAdverseMarketCapSinceCall != null
                  ? formatUsd(c.outcome.maxAdverseMarketCapSinceCall)
                  : "—"
              } · ${
                c.outcome?.maxAdverseSinceCallAt
                  ? formatOutcomeTime(c.outcome.maxAdverseSinceCallAt)
                  : "—"
              }`}
            />
            <Row
              label="Max peak-to-trough drawdown since call"
              value={
                <span className={outcomeTone(c.outcome?.drawdownSinceCallPctV2)}>
                  {c.outcome?.firstCallAt
                    ? formatOutcomePct(c.outcome.drawdownSinceCallPctV2)
                    : "—"}
                </span>
              }
            />
            <Row
              label="Drawdown peak MC / at"
              value={`${
                c.outcome?.firstCallAt && c.outcome.drawdownPeakMarketCapSinceCall != null
                  ? formatUsd(c.outcome.drawdownPeakMarketCapSinceCall)
                  : "—"
              } · ${
                c.outcome?.drawdownPeakSinceCallAt
                  ? formatOutcomeTime(c.outcome.drawdownPeakSinceCallAt)
                  : "—"
              }`}
            />
            <Row
              label="Drawdown trough MC / at"
              value={`${
                c.outcome?.firstCallAt && c.outcome.drawdownTroughMarketCapSinceCall != null
                  ? formatUsd(c.outcome.drawdownTroughMarketCapSinceCall)
                  : "—"
              } · ${
                c.outcome?.drawdownTroughSinceCallAt
                  ? formatOutcomeTime(c.outcome.drawdownTroughSinceCallAt)
                  : "—"
              }`}
            />
            <p className="pt-1 text-[11px] text-muted-foreground">
              Max adverse and peak-to-trough drawdown are historical market-cap observations
              measured from Wingman's frozen first Survivor call — not simulated or realized trade
              P&amp;L, and not a stop-loss recommendation.
            </p>
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
