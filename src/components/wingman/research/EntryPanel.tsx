/**
 * Research → Entry (Entry State v1).
 *
 * TIMING only. This view is deliberately visually separated from the THESIS
 * layer: a strong thesis can sit in EXTENDED and a moderate thesis can sit in
 * BUY_ZONE. It shows no buy/sell wording and no position size, ever.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { DexScreenerEmbed } from "@/components/wingman/history/DexScreenerEmbed";
import {
  getEntryEligibility,
  getEntryEvaluations,
  refreshEntryState,
  runEntryStateEvaluation,
} from "@/lib/wingman/entry.functions";
import { ENTRY_COMPONENTS } from "@/lib/wingman/services/entry/contracts";
import { formatUsd, relativeTime } from "@/lib/wingman/format";
import { toast } from "sonner";

const stateTone: Record<string, string> = {
  BUY_ZONE: "border-positive/45 bg-positive/12 text-positive",
  ACCEPTABLE: "border-primary/40 bg-primary/10 text-primary",
  SETTING_UP: "border-primary/30 bg-primary/5 text-primary",
  WATCH: "border-border-strong bg-surface text-muted-foreground",
  EXTENDED: "border-warning/45 bg-warning/12 text-warning",
  BROKEN: "border-destructive/45 bg-destructive/12 text-destructive",
  UNKNOWN: "border-border bg-surface text-muted-foreground",
};

const divergenceTone: Record<string, string> = {
  POSITIVE: "border-positive/40 bg-positive/10 text-positive",
  NEUTRAL: "border-border-strong bg-surface text-foreground",
  NEGATIVE: "border-warning/40 bg-warning/10 text-warning",
  UNKNOWN: "border-border bg-surface text-muted-foreground",
};

function short(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 5)}…${mint.slice(-4)}` : mint;
}

function duration(since: string | null): string {
  if (!since) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export function EntryPanel({ calibration = false }: { calibration?: boolean } = {}) {
  const mode: "PRODUCTION" | "CALIBRATION" = calibration ? "CALIBRATION" : "PRODUCTION";
  const queryClient = useQueryClient();
  const fetchEvaluations = useServerFn(getEntryEvaluations);
  const runBatch = useServerFn(runEntryStateEvaluation);
  const refreshOne = useServerFn(refreshEntryState);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["entry", "evaluations", mode],
    queryFn: () => fetchEvaluations({ data: { mode } }),
  });

  const fetchEligibility = useServerFn(getEntryEligibility);
  const { data: eligibility } = useQuery({
    queryKey: ["entry", "eligibility"],
    queryFn: () => fetchEligibility(),
    enabled: !calibration,
  });
  const eligible = eligibility?.eligible ?? 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["entry", "evaluations"] });

  const batch = useMutation({
    mutationFn: () => runBatch({ data: { mode, limit: 15 } }),
    onSuccess: (result) => {
      if (result.code === "NO_THESIS_REPORTS") {
        toast.warning("No thesis candidates", {
          description: "Entry timing evaluates candidates that already have a thesis.",
        });
        return;
      }
      toast.success(`Evaluated ${result.evaluated} candidates`, {
        description: Object.entries(result.distribution)
          .map(([state, count]) => `${state} ${count}`)
          .join(" · "),
      });
      void invalidate();
    },
    onError: (e) => toast.error("Entry evaluation failed", { description: String(e) }),
  });

  const refresh = useMutation({
    mutationFn: (mint: string) => refreshOne({ data: { mint, mode } }),
    onSuccess: (result) => {
      const first = result.results[0];
      if (first?.error) {
        toast.warning("CURRENT ENTRY EVIDENCE UNAVAILABLE", {
          description: "The previous evaluation is kept, but it is not shown as current.",
        });
      } else {
        toast.success(`Entry: ${first?.state ?? "UNKNOWN"}`, { description: first?.rationale ?? "" });
      }
      void invalidate();
    },
    onError: (e) => toast.error("Refresh failed", { description: String(e) }),
  });

  return (
    <Section
      title="Entry timing"
      description="Given an existing thesis, is current market structure a sensible place to enter? Timing only — this layer never changes the Thesis Score and never suggests a trade or a size."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {!calibration ? (
            <Badge variant="outline" className="tabular text-[10px]">
              {eligible} eligible for timing
            </Badge>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => batch.mutate()}
            disabled={batch.isPending || (!calibration && eligible === 0)}
          >
            {batch.isPending ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <Crosshair className="mr-2 size-3.5" />
            )}
            {calibration ? "Evaluate entry (calibration)" : "Evaluate entry timing"}
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading entry evaluations…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Crosshair className="size-4" />}
          title="No entry evaluations yet"
          description={
            calibration
              ? "Run a calibration pass to produce timing states for candidates that already carry a thesis."
              : eligible === 0
                ? "Production Entry timing only evaluates real Thesis Calls. With 0 Thesis Calls, there is nothing eligible for timing."
                : "Evaluate entry timing for the Thesis Calls under active monitoring."
          }
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => {
            const stale = row.evidenceGaps.includes("CURRENT_MARKET_EVIDENCE_UNAVAILABLE");
            const open = openId === row.id;
            return (
              <li key={row.id} className="rounded-md border border-border bg-surface/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <TokenIdentity
                      symbol={row.symbol ?? short(row.mint)}
                      name={row.name ?? null}
                      mint={row.mint}
                      pairAddress={row.pairAddress}
                    />
                    {row.isCalibration ? (
                      <p className="label-xs mt-1 text-muted-foreground">CALIBRATION</p>
                    ) : null}
                    <p className="label-xs mt-1 text-muted-foreground">
                      Thesis (separate layer): {row.thesisScore ?? "—"} · Evidence{" "}
                      {row.evidenceConfidence ?? "—"}
                      {row.thesisVerdict ? ` · ${row.thesisVerdict}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => refresh.mutate(row.mint)}
                    disabled={refresh.isPending}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-3">
                  <Badge variant="outline" className={stateTone[row.state] ?? stateTone["UNKNOWN"]}>
                    ENTRY: {row.state}
                  </Badge>
                  <span className="tabular text-xs text-muted-foreground">
                    {/* UNKNOWN means timing cannot be judged — never show a score. */}
                    {row.state === "UNKNOWN" || row.entryScore === null
                      ? "Entry score: —"
                      : `${row.entryScore.toFixed(1)}/10`}
                  </span>
                  <Badge
                    variant="outline"
                    className={divergenceTone[row.divergence] ?? divergenceTone["UNKNOWN"]}
                  >
                    divergence {row.divergence}
                  </Badge>
                  {stale ? (
                    <Badge variant="outline" className="border-warning/45 bg-warning/12 text-warning">
                      <AlertTriangle className="mr-1 size-3" />
                      CURRENT ENTRY EVIDENCE UNAVAILABLE
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    TIMING EVIDENCE {row.priceHistorySource}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    RESOLUTION {row.timingResolution}
                  </Badge>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="label-xs block">Why now (timing)</span>
                  {row.rationale}
                </p>

                <div className="tabular mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                  <span>MC {formatUsd(row.marketCap ?? 0)}</span>
                  <span>Liq {formatUsd(row.liquidityUsd ?? 0)}</span>
                  <span>{row.setups.length ? row.setups.join(", ") : "NONE"}</span>
                  <span>{row.evaluatedAt ? relativeTime(row.evaluatedAt) : "—"}</span>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 px-0 text-xs"
                  onClick={() => setOpenId(open ? null : row.id)}
                >
                  {open ? "Hide detail" : "Timing detail"}
                </Button>

                {open ? (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <DexScreenerEmbed pairAddress={row.pairAddress} contractAddress={row.mint} height={220} />

                    <div className="grid gap-1">
                      {row.state === "UNKNOWN" ? (
                        <p className="text-[11px] text-muted-foreground">
                          Timing cannot be judged from the available evidence — no component
                          scores are authoritative for this evaluation.
                        </p>
                      ) : (
                        ENTRY_COMPONENTS.map((c) => (
                          <div key={c.key} className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">{c.label}</span>
                            <span className="tabular">
                              {row.components ? row.components[c.key].toFixed(2) : "—"} / {c.max}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                      <p>
                        <span className="label-xs block">Strongest positive timing signal</span>
                        {row.strongestPositiveSignal ?? "—"}
                      </p>
                      <p>
                        <span className="label-xs block">Strongest entry risk</span>
                        {row.strongestEntryRisk ?? "—"}
                      </p>
                    </div>

                    <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                      <div>
                        <span className="label-xs block">What would improve entry</span>
                        <ul className="mt-1 space-y-0.5">
                          {row.whatWouldImproveEntry.map((x) => (
                            <li key={x}>— {x}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="label-xs block">What would break entry</span>
                        <ul className="mt-1 space-y-0.5">
                          {row.whatWouldBreakEntry.map((x) => (
                            <li key={x}>— {x}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {row.timingFeatures ? (
                      <div className="tabular grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                        <span>bars {row.timingFeatures.bars} @ {row.timingFeatures.interval}</span>
                        <span>from high {row.timingFeatures.drawdownFromHighPct}%</span>
                        <span>from base {row.timingFeatures.distanceFromBasePct}%</span>
                        <span>impulse {row.timingFeatures.impulseGainPct}%</span>
                        <span>
                          retrace{" "}
                          {row.timingFeatures.retracementDepthPct === null
                            ? "—"
                            : `${Math.round(row.timingFeatures.retracementDepthPct)}%`}
                        </span>
                        <span>consolidation {row.timingFeatures.consolidationBars} bars</span>
                      </div>
                    ) : null}

                    <div className="text-[11px] text-muted-foreground">
                      <span className="label-xs block">Entry state history</span>
                      <p className="mt-1">
                        Current {row.state} for {duration(row.stateChangedAt)}
                        {row.previousState ? ` · previous ${row.previousState}` : ""}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {row.history.map((h) => (
                          <li key={`${h.evaluatedAt}-${h.state}`}>
                            {relativeTime(h.evaluatedAt)} · {h.state}
                            {h.entryScore === null ? "" : ` · ${h.entryScore.toFixed(1)}/10`}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {row.evidenceGaps.length ? (
                      <p className="text-[11px] text-muted-foreground">
                        <span className="label-xs block">Evidence gaps</span>
                        {row.evidenceGaps.join(", ")}
                      </p>
                    ) : null}

                    <p className="text-[10px] text-muted-foreground">
                      Market evidence {row.marketEvidenceAt ? relativeTime(row.marketEvidenceAt) : "—"} ·
                      narrative timing confidence {row.narrativeTimingConfidence ?? "UNKNOWN"} ·{" "}
                      {row.policyVersion}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
