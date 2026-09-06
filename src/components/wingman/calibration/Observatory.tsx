/**
 * Calibration Observatory v1 (Settings → Calibration Lab).
 *
 * READ-ONLY analysis over frozen production decisions and independently
 * persisted market observations. Nothing here creates calls, changes policy,
 * or requests market data from any provider: every number comes from stored
 * rows, so filtering, sorting and tab switching cost zero provider requests.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { StatTile } from "@/components/wingman/StatTile";
import { EmptyState } from "@/components/wingman/EmptyState";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { loadObservatory } from "@/lib/wingman/calibration.functions";
import { formatDate } from "@/lib/wingman/format";
import { setupLabel } from "@/lib/wingman/services/history/setup-filter";
import {
  DEFAULT_HORIZON_KEY,
  OBSERVATORY_HORIZONS,
  OBSERVATORY_SETUP_FILTERS,
  OBSERVATORY_STAGES,
  OBSERVATORY_STAGE_LABEL,
  RESEARCH_EXECUTION_FILTERS,
  describeStageComparison,
  filterObservatoryEvents,
  policyVersionsFor,
  selectObservatoryPopulation,
  summarizeObservatory,
  type CoverageCounts,
  type ObservatoryEvent,
  type ObservatoryPopulation,
  type ObservatorySetupFilter,
  type ObservatoryStage,
  type ResearchExecutionFilter,
} from "@/lib/wingman/services/calibration/observatory";

const pct = (value: number | null, digits = 1) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;

const selectClass =
  "h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-xs">{label}</span>
      {children}
    </label>
  );
}

function coverageText(coverage: CoverageCounts) {
  return `n=${coverage.measured} measured · ${coverage.notYetMeasured} not yet · ${coverage.delayed} delayed · ${coverage.unknown} unknown · ${coverage.invalidMarket} invalid`;
}

export function Observatory() {
  const load = useServerFn(loadObservatory);
  const query = useQuery({
    queryKey: ["calibration-observatory"],
    queryFn: () => load(),
    staleTime: 60_000,
  });

  const [stage, setStage] = useState<ObservatoryStage>("THESIS_SYNTHESIZED");
  const [population, setPopulation] = useState<ObservatoryPopulation>("DECISIONS");
  const [setup, setSetup] = useState<ObservatorySetupFilter>("ALL");
  const [policyVersion, setPolicyVersion] = useState<string>("ALL");
  const [research, setResearch] = useState<ResearchExecutionFilter>("ALL");
  const [horizon, setHorizon] = useState<string>(DEFAULT_HORIZON_KEY);
  const [fromIso, setFromIso] = useState<string>("");
  const [toIso, setToIso] = useState<string>("");

  const events = query.data?.events ?? [];
  const filters = useMemo(
    () => ({
      population,
      setup,
      policyVersion,
      researchExecution: research,
      fromIso: fromIso ? new Date(fromIso).toISOString() : null,
      toIso: toIso ? new Date(`${toIso}T23:59:59.999Z`).toISOString() : null,
    }),
    [population, setup, policyVersion, research, fromIso, toIso],
  );

  const scoped = useMemo(
    () =>
      selectObservatoryPopulation(
        filterObservatoryEvents(events as ObservatoryEvent[], { ...filters, stage }),
        population,
      ),
    [events, filters, stage, population],
  );
  const allStageEvents = useMemo(
    () => (events as ObservatoryEvent[]).filter((e) => e.stage === stage),
    [events, stage],
  );
  const kpis = useMemo(() => summarizeObservatory(scoped, horizon), [scoped, horizon]);
  const comparison = useMemo(
    () => describeStageComparison(events as ObservatoryEvent[], filters, horizon),
    [events, filters, horizon],
  );
  const versions = useMemo(
    () => policyVersionsFor(events as ObservatoryEvent[], stage),
    [events, stage],
  );

  const health = query.data?.samplerHealth;

  return (
    <div className="space-y-6">
      <Section
        title="Calibration Observatory"
        description="Read-only analysis of frozen production decisions against independently collected market observations. No production effect, no market data requests."
        actions={
          <Badge variant="outline" className="border-warning/45 bg-warning/12 text-warning">
            CALIBRATION — NO PRODUCTION EFFECT
          </Badge>
        }
      >
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Reading stored decisions and observations…
          </div>
        ) : query.isError ? (
          <p className="text-xs text-destructive">
            Could not read the calibration dataset: {String(query.error)}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Stage">
                <select
                  className={selectClass}
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value as ObservatoryStage);
                    setPolicyVersion("ALL");
                  }}
                >
                  {OBSERVATORY_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {OBSERVATORY_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Population">
                <select
                  className={selectClass}
                  value={population}
                  onChange={(e) => setPopulation(e.target.value as ObservatoryPopulation)}
                >
                  <option value="DECISIONS">DECISIONS</option>
                  <option value="UNIQUE_TOKENS">UNIQUE TOKENS</option>
                </select>
              </Field>
              <Field label="Setup">
                <select
                  className={selectClass}
                  value={setup}
                  onChange={(e) => setSetup(e.target.value as ObservatorySetupFilter)}
                >
                  {OBSERVATORY_SETUP_FILTERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Policy / version">
                <select
                  className={selectClass}
                  value={policyVersion}
                  onChange={(e) => setPolicyVersion(e.target.value)}
                >
                  <option value="ALL">ALL</option>
                  {versions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Research execution">
                <select
                  className={selectClass}
                  value={research}
                  onChange={(e) => setResearch(e.target.value as ResearchExecutionFilter)}
                >
                  {RESEARCH_EXECUTION_FILTERS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="From">
                <input
                  type="date"
                  className={selectClass}
                  value={fromIso}
                  onChange={(e) => setFromIso(e.target.value)}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  className={selectClass}
                  value={toIso}
                  onChange={(e) => setToIso(e.target.value)}
                />
              </Field>
              <Field label="Horizon">
                <select
                  className={selectClass}
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value)}
                >
                  {OBSERVATORY_HORIZONS.map((h) => (
                    <option key={h.key} value={h.key}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {allStageEvents.length} stored events · {kpis.events}{" "}
              {population === "DECISIONS" ? "decisions" : "unique-token decisions"} ·{" "}
              {kpis.uniqueMints} unique exact mints in view. Repeated events of one mint are
              preserved but are not independent samples. Horizons are evaluation windows, not
              strategy definitions.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label={`Median return · ${horizon}`}
                value={pct(kpis.medianReturnPct)}
                detail={coverageText(kpis.coverage)}
              />
              <StatTile
                label={`Average return · ${horizon}`}
                value={pct(kpis.avgReturnPct)}
                detail={`denominator n=${kpis.measuredN} measured · ${kpis.measuredUniqueMints} mints`}
              />
              <StatTile
                label="Median peak"
                value={pct(kpis.medianPeakPct)}
                detail={`avg ${pct(kpis.avgPeakPct)} · n=${kpis.measuredN}`}
              />
              <StatTile
                label="Median max drawdown"
                value={pct(kpis.medianMaxDrawdownPct)}
                detail={`avg ${pct(kpis.avgMaxDrawdownPct)} · n=${kpis.measuredN}`}
              />
              <StatTile
                label="Liquidity survival"
                value={pct(kpis.liquiditySurvivalPct, 0)}
                detail={`n=${kpis.liquiditySurvivalN} with liquidity evidence`}
              />
              <StatTile
                label="Median time to peak"
                value={
                  kpis.medianTimeToPeakMinutes === null
                    ? "—"
                    : `${Math.round(kpis.medianTimeToPeakMinutes)}m`
                }
                detail={`n=${kpis.measuredN}`}
              />
              <StatTile
                label="Win rate (descriptive)"
                value={pct(kpis.winRatePct, 0)}
                detail={`return > 0 · n=${kpis.winRateN}. Secondary metric — never an optimization target.`}
              />
              <StatTile
                label="Coverage"
                value={`${kpis.measuredN}/${kpis.events}`}
                detail={coverageText(kpis.coverage)}
              />
            </div>
          </div>
        )}
      </Section>

      {query.data ? (
        <>
          <Section
            title="Descriptive stage comparison"
            description="Different stages have different populations, cohorts and collection coverage. This is a description, not causal lift."
            actions={
              <Badge variant="outline" className="text-[10px]">
                DESCRIPTIVE STAGE COMPARISON
              </Badge>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3 font-medium">Stage</th>
                    <th className="py-2 pr-3 font-medium">Events</th>
                    <th className="py-2 pr-3 font-medium">Unique mints</th>
                    <th className="py-2 pr-3 font-medium">Measured</th>
                    <th className="py-2 pr-3 font-medium">Median return</th>
                    <th className="py-2 pr-3 font-medium">Median peak</th>
                    <th className="py-2 pr-3 font-medium">Median max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.stage} className="border-b border-border/50">
                      <td className="py-2 pr-3">{OBSERVATORY_STAGE_LABEL[row.stage]}</td>
                      <td className="tabular py-2 pr-3">{row.events}</td>
                      <td className="tabular py-2 pr-3">{row.uniqueMints}</td>
                      <td className="tabular py-2 pr-3 text-muted-foreground">
                        {row.measuredN} / {row.events}
                      </td>
                      <td className="tabular py-2 pr-3">{pct(row.medianReturnPct)}</td>
                      <td className="tabular py-2 pr-3">{pct(row.medianPeakPct)}</td>
                      <td className="tabular py-2 pr-3">{pct(row.medianMaxDrawdownPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title={`${OBSERVATORY_STAGE_LABEL[stage]} — events in view`}
            description="Exact persisted provenance per event. Unmeasured horizons are shown as collection states, never as zero performance."
          >
            {scoped.length === 0 ? (
              <EmptyState
                title="No events for these filters"
                description="No frozen production decision matches the selected stage, setup, policy version or date range."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-3 font-medium">Token</th>
                      <th className="py-2 pr-3 font-medium">Decided</th>
                      <th className="py-2 pr-3 font-medium">Setup</th>
                      <th className="py-2 pr-3 font-medium">Recurrence</th>
                      <th className="py-2 pr-3 font-medium">{horizon} state</th>
                      <th className="py-2 pr-3 font-medium">Return</th>
                      <th className="py-2 pr-3 font-medium">Peak</th>
                      <th className="py-2 pr-3 font-medium">Max DD</th>
                      <th className="py-2 pr-3 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoped.slice(0, 250).map((e) => {
                      const m = e.horizons[horizon];
                      return (
                        <tr key={e.eventId} className="border-b border-border/50 align-top">
                          <td className="py-2 pr-3">
                            <TokenIdentity
                              symbol={e.symbol}
                              name={e.name}
                              mint={e.mint}
                              compact
                            />
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {e.eventAt ? formatDate(e.eventAt) : "—"}
                          </td>
                          <td className="py-2 pr-3">{setupLabel(e.setups)}</td>
                          <td className="tabular py-2 pr-3 text-muted-foreground">
                            #{e.recurrenceNumber || "—"}
                            {e.msSincePriorCanonicalEvent !== null
                              ? ` · +${Math.round(e.msSincePriorCanonicalEvent / 3_600_000)}h`
                              : ""}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={
                                m?.status === "MEASURED"
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                              }
                            >
                              {m?.status ?? "UNKNOWN"}
                            </span>
                          </td>
                          <td className="tabular py-2 pr-3">{pct(m?.returnPct ?? null)}</td>
                          <td className="tabular py-2 pr-3">{pct(m?.peakPct ?? null)}</td>
                          <td className="tabular py-2 pr-3">{pct(m?.maxDrawdownPct ?? null)}</td>
                          <td className="py-2 pr-3 text-[11px] text-muted-foreground">
                            {e.thesis ? (
                              <span>
                                score {e.thesis.thesisScore ?? "—"} · conf{" "}
                                {e.thesis.evidenceConfidence ?? "—"} · {e.thesis.verdict ?? "—"} ·
                                bear {e.thesis.bearCaseSeverity ?? "—"} · origins{" "}
                                {e.thesis.distinctIndependentEvidenceOrigins ?? "—"} ·{" "}
                                {e.thesis.rubricVersion ?? "—"}
                                {Object.entries(e.thesis.components).some(([, v]) => v !== null) ? (
                                  <span className="block">
                                    {Object.entries(e.thesis.components)
                                      .map(([k, v]) => `${k} ${v ?? "—"}`)
                                      .join(" · ")}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                            {e.triage ? (
                              <span className="block">
                                {e.triage.decision ?? "—"} · conf {e.triage.confidence ?? "—"} ·
                                quant {e.triage.quantPriority ?? "—"} (rank{" "}
                                {e.triage.quantRank ?? "—"} → AI {e.triage.triageRank ?? "—"}, Δ{" "}
                                {e.triage.rankDelta ?? "—"})
                              </span>
                            ) : null}
                            {e.spend ? (
                              <span className="block">
                                spend {e.spend.spendDecision ?? "—"}
                                {e.spend.spendDecisionReason
                                  ? ` (${e.spend.spendDecisionReason})`
                                  : ""}{" "}
                                · {e.spend.executed ? "executed" : "not executed"} · prior research{" "}
                                {e.spend.priorResearchAgeMinutes ?? "—"}m ·{" "}
                                {e.spend.materialChangeOverride ? "material-change override · " : ""}
                                budget {e.spend.budgetState ?? "—"} ·{" "}
                                {e.spend.policyVersion ?? "—"} — operational deferral is not a
                                failed candidate
                              </span>
                            ) : null}
                            {!e.canonical ? (
                              <span className="block text-warning">
                                SAME-COHORT RERUN · NON-CANONICAL KPI
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {scoped.length > 250 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Showing the first 250 of {scoped.length} events. KPIs above cover all of them.
                  </p>
                ) : null}
              </div>
            )}
          </Section>

          <Section
            title="Collection health"
            description="Observation availability only. A delayed or failed collection is never negative performance."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Last successful sampler run"
                value={
                  health?.lastSuccessfulRunAt ? formatDate(health.lastSuccessfulRunAt) : "—"
                }
                detail={health?.lastRunAt ? `last attempt ${formatDate(health.lastRunAt)}` : ""}
              />
              <StatTile
                label="Observations as of"
                value={health?.observationAsOf ? formatDate(health.observationAsOf) : "—"}
                detail={
                  health?.oldestStaleObservationAt
                    ? `oldest stale required ${formatDate(health.oldestStaleObservationAt)}`
                    : "no stale required observation"
                }
              />
              <StatTile
                label="Mints tracked / due"
                value={`${health?.mintsTracked ?? 0} / ${health?.mintsDue ?? 0}`}
                detail={`refreshed ${health?.mintsRefreshed ?? 0} · delayed ${health?.mintsDelayed ?? 0}`}
              />
              <StatTile
                label="Provider errors / 429"
                value={`${health?.providerErrorCount ?? 0} / ${health?.rateLimitedCount ?? 0}`}
                detail={`batches sent ${health?.batchesSent ?? 0} · Observatory provider requests ${query.data.providerRequests}`}
              />
            </div>
          </Section>
        </>
      ) : null}
    </div>
  );
}
