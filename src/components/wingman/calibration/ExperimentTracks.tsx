/**
 * Calibration Experiment Tracks v1 (Calibration → Experiments).
 *
 * CALIBRATION ONLY. Challenger variants produce SHADOW_CALL decisions that are
 * stored in dedicated calibration tables. Nothing here creates a production
 * Thesis Call, Entry or Live state, and nothing here can promote a challenger.
 * Every number comes from persisted rows: switching variant or horizon costs
 * zero market-data provider requests.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FlaskConical, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/wingman/Section";
import { StatTile } from "@/components/wingman/StatTile";
import { EmptyState } from "@/components/wingman/EmptyState";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { formatDate } from "@/lib/wingman/format";
import { loadObservatory } from "@/lib/wingman/calibration.functions";
import {
  listCalibrationExperiments,
  loadCalibrationExperiment,
  runCalibrationExperiment,
  setCalibrationPromotionState,
  activateCalibrationShadow,
} from "@/lib/wingman/experiments.functions";
import {
  DEFAULT_HORIZON_KEY,
  OBSERVATORY_HORIZONS,
  type ObservatoryEvent,
} from "@/lib/wingman/services/calibration/observatory";
import {
  EXPERIMENT_TYPE_LABEL,
  GATE_LABEL,
  INTERPRETATION_NOTE,
  OTHER_GATE_KEYS,
  PROMOTION_NOTE,
  RETROSPECTIVE_DISCLAIMER,
  buildDecisionDiffs,
  buildGateFunnel,
  computeSelectionOverlap,
  coverageForVariant,
  evaluateVariantOutcomes,
  groupResultsByMint,
  interpretExperiment,
  type ExperimentResultRow,
  type ExperimentSpec,
  type VariantKey,
} from "@/lib/wingman/services/calibration/experiments";

const pct = (value: number | null, digits = 1) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;

const selectClass =
  "h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground outline-none focus:border-primary";

function TypeBadge({ type }: { type: ExperimentSpec["experimentType"] }) {
  const retro = type === "RETROSPECTIVE_BACKTEST";
  return (
    <Badge
      variant="outline"
      className={
        retro
          ? "border-warning/45 bg-warning/12 text-warning"
          : "border-primary/45 bg-primary/12 text-primary"
      }
    >
      {EXPERIMENT_TYPE_LABEL[type]}
    </Badge>
  );
}

export function ExperimentTracks() {
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useServerFn(listCalibrationExperiments);
  const query = useQuery({
    queryKey: ["calibration-experiments"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  if (openId) {
    return <ExperimentDetail experimentId={openId} onBack={() => setOpenId(null)} />;
  }

  const experiments = query.data ?? [];

  return (
    <Section
      title="Experiment Tracks"
      description="Versioned challenger policies replayed over frozen production decisions. Calibration only — no production effect."
      actions={
        <Badge variant="outline" className="border-warning/45 bg-warning/12 text-warning">
          CALIBRATION — NO PRODUCTION EFFECT
        </Badge>
      }
    >
      {query.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading experiments…
        </div>
      ) : experiments.length === 0 ? (
        <EmptyState
          title="No experiments defined"
          description="Experiments are declared explicitly by a human before evaluation. None exist yet."
          icon={<FlaskConical className="size-4" />}
        />
      ) : (
        <div className="space-y-3">
          {experiments.map((e) => (
            <button
              key={e.experimentId}
              type="button"
              onClick={() => setOpenId(e.experimentId)}
              className="w-full rounded-md border border-border bg-surface px-4 py-3 text-left transition hover:border-primary/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{e.name}</span>
                <TypeBadge type={e.experimentType} />
                <Badge variant="outline">{e.status}</Badge>
                <Badge variant="outline">
                  {e.predeclared ? "PREDECLARED" : "EXPLORATORY"}
                </Badge>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {e.experimentVersion}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{e.hypothesis}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>Source: {e.sourceStage}</span>
                <span>Control: {String(e.controlPolicy["policy"] ?? "production")}</span>
                <span>
                  Variants: CONTROL
                  {e.challengerVariants.map((v) => ` · ${v.key}`).join("")}
                </span>
                <span>Horizons: {e.evaluationHorizons.join(" / ")}</span>
                <span>
                  Last evaluation:{" "}
                  {e.lastEvaluatedAt ? formatDate(e.lastEvaluatedAt) : "not evaluated"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function ExperimentDetail({
  experimentId,
  onBack,
}: {
  experimentId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(loadCalibrationExperiment);
  const loadEvents = useServerFn(loadObservatory);
  const run = useServerFn(runCalibrationExperiment);
  const promote = useServerFn(setCalibrationPromotionState);
  const activateShadow = useServerFn(activateCalibrationShadow);

  const [horizon, setHorizon] = useState(DEFAULT_HORIZON_KEY);
  const [variantKey, setVariantKey] = useState<VariantKey>("CHALLENGER_A");

  const detail = useQuery({
    queryKey: ["calibration-experiment", experimentId],
    queryFn: () => load({ data: { experimentId } }),
  });
  // Persisted observations only — reused from the Observatory read model.
  const observatory = useQuery({
    queryKey: ["calibration-observatory"],
    queryFn: () => loadEvents(),
    staleTime: 60_000,
  });

  const runMutation = useMutation({
    mutationFn: () => run({ data: { experimentId } }),
    onSuccess: (r) => {
      toast.success(
        `Experiment evaluated — ${r.populationN} compatible frozen decisions, ${r.uniqueMints} unique mints, ${r.incompatibleN} excluded as NOT_EVALUABLE_FOR_EXPERIMENT_VERSION`,
      );
      void queryClient.invalidateQueries({ queryKey: ["calibration-experiment", experimentId] });
      void queryClient.invalidateQueries({ queryKey: ["calibration-experiments"] });
    },
    onError: (e: unknown) => toast.error("Experiment run failed", { description: String(e) }),
  });

  const promoteMutation = useMutation({
    mutationFn: (promotionState: "CANDIDATE_FOR_PROSPECTIVE_SHADOW" | "PROPOSED_FOR_REVIEW") =>
      promote({ data: { experimentId, promotionState } }),
    onSuccess: () => {
      toast.success("Marked for human review — production policy unchanged");
      void queryClient.invalidateQueries({ queryKey: ["calibration-experiment", experimentId] });
    },
  });

  const shadowMutation = useMutation({
    mutationFn: () => activateShadow({ data: { experimentId } }),
    onSuccess: (r) => {
      toast.success(
        r.created
          ? `Prospective shadow activated ${formatDate(r.shadowStartAt)} — no backfill`
          : "Prospective shadow already active",
      );
      void queryClient.invalidateQueries({ queryKey: ["calibration-experiments"] });
    },
    onError: (e: unknown) => toast.error("Activation failed", { description: String(e) }),
  });


  const spec = detail.data?.spec ?? null;
  const results = useMemo(
    () => (detail.data?.results ?? []) as ExperimentResultRow[],
    [detail.data],
  );

  const eventsByKey = useMemo(() => {
    const map = new Map<string, ObservatoryEvent>();
    for (const e of observatory.data?.events ?? []) {
      if (e.stage === "THESIS_SYNTHESIZED") map.set(`THESIS_SYNTHESIZED:${e.eventId}`, e);
    }
    return map;
  }, [observatory.data]);

  const byVariant = useMemo(() => {
    const map = new Map<VariantKey, ExperimentResultRow[]>();
    for (const row of results) map.set(row.variantKey, [...(map.get(row.variantKey) ?? []), row]);
    return map;
  }, [results]);

  if (!spec) {
    return (
      <Section title="Experiment" description="Loading experiment specification…">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </Section>
    );
  }

  const variantSpecs = [
    {
      key: "CONTROL" as VariantKey,
      label: String(spec.controlPolicy["label"] ?? "Production control"),
      differsBy: "NONE" as const,
      description: String(
        spec.controlPolicy["description"] ?? "Exactly what production did at decision time.",
      ),
    },
    ...spec.challengerVariants,
  ];

  const evaluations = variantSpecs.map((v) =>
    evaluateVariantOutcomes(
      v.key,
      v.label,
      v.differsBy,
      byVariant.get(v.key) ?? [],
      eventsByKey,
      horizon,
    ),
  );

  const controlRows = byVariant.get("CONTROL") ?? [];
  const challengerRows = byVariant.get(variantKey) ?? [];
  const overlap = computeSelectionOverlap(controlRows, challengerRows);
  const diffs = buildDecisionDiffs(challengerRows, eventsByKey, horizon);
  const mintGroups = groupResultsByMint(controlRows);

  const compatibility = detail.data?.compatibility ?? null;
  const activeRule =
    spec.challengerVariants.find((v) => v.key === variantKey)?.differsBy ?? "NONE";
  const funnel = buildGateFunnel(controlRows, challengerRows, activeRule, variantKey);
  const challengerEvaluation = evaluations.find((e) => e.variantKey === variantKey) ?? null;
  // Persisted treatment-exposure diagnostics, with a funnel fallback for rows
  // stored before Phase 2C.1.
  const treatmentCandidates =
    challengerRows.filter((r) => r.treatmentExposure === "SCORE_TREATMENT_CANDIDATE").length ||
    funnel.changedRuleCandidates;
  const maskedCandidates =
    challengerRows.filter(
      (r) => r.treatmentExposure === "SCORE_TREATMENT_CANDIDATE" && r.maskedByOtherGates,
    ).length || funnel.maskedByOtherGates;
  const interpretation = interpretExperiment({
    funnel,
    compatibleEvents: compatibility?.compatibleEvents ?? controlRows.length,
    measuredOutcomes: challengerEvaluation?.kpis.measuredN ?? 0,
  });


  return (
    <div className="space-y-6">
      <Section
        title={spec.name}
        description={spec.hypothesis}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={spec.experimentType} />
            <Badge variant="outline">{spec.status}</Badge>
            <Button size="sm" variant="ghost" onClick={onBack}>
              <ArrowLeft className="size-3.5" />
              All experiments
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-[11px] text-warning">
            {spec.experimentType === "RETROSPECTIVE_BACKTEST"
              ? RETROSPECTIVE_DISCLAIMER
              : "PROSPECTIVE SHADOW — challenger decisions accumulate forward from the declared activation time. Pre-activation events are never backfilled."}
          </p>

          {/* Overview */}
          <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div>Experiment version: {spec.experimentVersion}</div>
            <div>Source stage: {spec.sourceStage}</div>
            <div>Population: {spec.populationSemantics}</div>
            <div>Created: {spec.createdAt ? formatDate(spec.createdAt) : "—"}</div>
            <div>
              Shadow start: {spec.shadowStartAt ? formatDate(spec.shadowStartAt) : "n/a"}
            </div>
            <div>
              Last evaluation:{" "}
              {spec.lastEvaluatedAt ? formatDate(spec.lastEvaluatedAt) : "not evaluated"}
            </div>
            <div>Promotion state: {spec.promotionState}</div>
            <div>Horizons: {spec.evaluationHorizons.join(" / ")}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={runMutation.isPending}
              onClick={() => runMutation.mutate()}
            >
              {runMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Run experiment
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={promoteMutation.isPending}
              onClick={() => promoteMutation.mutate("CANDIDATE_FOR_PROSPECTIVE_SHADOW")}
            >
              Mark as candidate for prospective shadow
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={promoteMutation.isPending}
              onClick={() => promoteMutation.mutate("PROPOSED_FOR_REVIEW")}
            >
              Propose for review
            </Button>
            <span className="text-[11px] text-muted-foreground">{PROMOTION_NOTE}</span>
          </div>
        </div>
      </Section>

      {/* Variant definitions */}
      <Section
        title="Variant Definitions"
        description="Each challenger states exactly one rule that differs from control."
      >
        <div className="space-y-2">
          {variantSpecs.map((v) => (
            <div key={v.key} className="rounded-md border border-border bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{v.key}</Badge>
                <span className="text-xs font-medium">{v.label}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Differs by: {v.differsBy}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{v.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Informativeness + gate masking (Phase 2B.1) */}
      {spec.experimentType === "RETROSPECTIVE_BACKTEST" ? (
        <Section
          title="Retrospective Informativeness"
          description="Whether this replay could observe anything at all. Diagnostics, not performance labels."
          actions={
            <Badge variant="outline" className="border-warning/45 bg-warning/12 text-warning">
              {interpretation.state.replace(/_/g, " ")}
            </Badge>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatTile label="Eligible frozen events" value={funnel.eligibleFrozenEvents} />
              <StatTile
                label="Changed-rule candidates"
                value={funnel.changedRuleCandidates}
                detail="Challenger's own gate verdict differs"
              />
              <StatTile
                label="Treatment exposure"
                value={funnel.treatmentExposure}
                detail="Rule could decide the outcome"
              />
              <StatTile
                label="Masked by other gates"
                value={funnel.maskedByOtherGates}
                detail={
                  funnel.primaryMask
                    ? `Primary mask: ${GATE_LABEL[funnel.primaryMask] ?? funnel.primaryMask}`
                    : "No masking observed"
                }
              />
              <StatTile label="Decision differences" value={funnel.decisionDifferences} />
            </div>

            <div className="rounded-md border border-border bg-surface px-3 py-2 text-[11px] text-muted-foreground">
              <div className="font-medium text-foreground">Gate funnel — {variantKey}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Eligible {funnel.eligibleFrozenEvents}</span>
                <span>→ changed-rule {funnel.changedRuleCandidates}</span>
                {OTHER_GATE_KEYS.map((k) => (
                  <span key={k}>
                    → pass {GATE_LABEL[k] ?? k}: {funnel.passCounts[k]}
                  </span>
                ))}
                <span>→ shadow decisions {funnel.finalShadowCalls}</span>
              </div>
              {Object.keys(funnel.maskCounts).length > 0 ? (
                <div className="mt-1">
                  Masking gates:{" "}
                  {Object.entries(funnel.maskCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([g, n]) => `${GATE_LABEL[g] ?? g} (${n})`)
                    .join(" · ")}
                </div>
              ) : null}
              <div className="mt-1">{interpretation.detail}</div>
            </div>

            <div className="rounded-md border border-border bg-surface px-3 py-2 text-[11px] text-muted-foreground">
              <div className="font-medium text-foreground">Historical semantics compatibility</div>
              <div className="mt-1">
                Compatible frozen events: {compatibility?.compatibleEvents ?? funnel.eligibleFrozenEvents}
                {" · "}Excluded as NOT_EVALUABLE_FOR_EXPERIMENT_VERSION:{" "}
                {compatibility?.incompatibleEvents ?? 0}
              </div>
              {compatibility && Object.keys(compatibility.incompatibleReasons).length > 0 ? (
                <div className="mt-1">
                  Reasons:{" "}
                  {Object.entries(compatibility.incompatibleReasons)
                    .map(([r, n]) => `${r} (${n})`)
                    .join(" · ")}
                </div>
              ) : null}
              {compatibility && compatibility.compatiblePolicyVersions.length > 0 ? (
                <div className="mt-1">
                  Control reproduces production for:{" "}
                  {compatibility.compatiblePolicyVersions.join(", ")}
                </div>
              ) : null}
            </div>

            <p className="text-[11px] text-muted-foreground">{INTERPRETATION_NOTE}</p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={shadowMutation.isPending}
                onClick={() => shadowMutation.mutate()}
              >
                {shadowMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                Activate prospective shadow
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Activation starts now. Pre-activation events are never backfilled.
              </span>
            </div>
          </div>
        </Section>
      ) : (
        <Section
          title="Prospective Shadow Evidence"
          description="Accumulates forward from activation only. Structurally separate from retrospective replay."
          actions={
            <Badge variant="outline" className="border-primary/45 bg-primary/12 text-primary">
              {interpretation.state.replace(/_/g, " ")}
            </Badge>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Active since"
              value={spec.shadowStartAt ? formatDate(spec.shadowStartAt) : "—"}
            />
            <StatTile label="Eligible events observed" value={funnel.eligibleFrozenEvents} />
            <StatTile
              label="Treatment candidates"
              value={treatmentCandidates}
              detail={
                activeRule === "THESIS_SCORE_MIN_65"
                  ? "Thesis Score 65–69"
                  : "Challenger rule verdict differs"
              }
            />
            <StatTile
              label="Masked by other gates"
              value={maskedCandidates}
              detail={
                funnel.primaryMask
                  ? `Primary masking gate: ${GATE_LABEL[funnel.primaryMask] ?? funnel.primaryMask}`
                  : "No masking observed"
              }
            />
            <StatTile label="Decision differences" value={funnel.decisionDifferences} />
            <StatTile label="Unique mints" value={mintGroups.length} />
            <StatTile
              label="Outcome coverage"
              value={challengerEvaluation?.kpis.measuredN ?? 0}
              detail="Persisted observations only"
            />
            <StatTile
              label="Provider requests"
              value={0}
              detail="Persisted observations only"
              tone="positive"
            />
          </div>
          {activeRule === "THESIS_SCORE_MIN_65" ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Tests only the Thesis Score threshold. All other production gates remain unchanged.
            </p>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground">{interpretation.detail}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">{INTERPRETATION_NOTE}</p>
        </Section>
      )}


      {/* Population + filters */}
      <Section
        title="Population"
        description="Canonical frozen production decisions only. Same-cohort reruns are excluded."
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="label-xs">Horizon</span>
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
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-xs">Compare challenger</span>
            <select
              className={selectClass}
              value={variantKey}
              onChange={(e) => setVariantKey(e.target.value as VariantKey)}
            >
              {spec.challengerVariants.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.key} — {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Frozen decisions" value={controlRows.length} />
          <StatTile label="Unique mints" value={mintGroups.length} />
          <StatTile
            label="Repeated mints"
            value={mintGroups.filter((g) => g.eventKeys.length > 1).length}
            detail="All events of one mint stay in one group"
          />
          <StatTile
            label="Provider requests"
            value={0}
            detail="Persisted observations only"
            tone="positive"
          />
        </div>
      </Section>

      {/* Outcome comparison + coverage */}
      <Section
        title="Outcome Comparison"
        description={`Descriptive market outcomes at ${horizon}, joined only after each variant decision was persisted.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3">Variant</th>
                <th className="py-2 pr-3">Eligible N</th>
                <th className="py-2 pr-3">Calls</th>
                <th className="py-2 pr-3">Unique mints</th>
                <th className="py-2 pr-3">Measured</th>
                <th className="py-2 pr-3">Median ret</th>
                <th className="py-2 pr-3">Avg ret</th>
                <th className="py-2 pr-3">Median peak</th>
                <th className="py-2 pr-3">Avg peak</th>
                <th className="py-2 pr-3">Median DD</th>
                <th className="py-2 pr-3">Avg DD</th>
                <th className="py-2 pr-3">Liq survival</th>
                <th className="py-2 pr-3">Time to peak</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((e) => (
                <tr key={e.variantKey} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-medium">{e.variantKey}</td>
                  <td className="tabular py-2 pr-3">{e.eligibleN}</td>
                  <td className="tabular py-2 pr-3">{e.callN}</td>
                  <td className="tabular py-2 pr-3">{e.uniqueCallMints}</td>
                  <td className="tabular py-2 pr-3">{e.kpis.measuredN}</td>
                  <td className="tabular py-2 pr-3">{pct(e.kpis.medianReturnPct)}</td>
                  <td className="tabular py-2 pr-3">{pct(e.kpis.avgReturnPct)}</td>
                  <td className="tabular py-2 pr-3">{pct(e.kpis.medianPeakPct)}</td>
                  <td className="tabular py-2 pr-3">{pct(e.kpis.avgPeakPct)}</td>
                  <td className="tabular py-2 pr-3">{pct(e.kpis.medianMaxDrawdownPct)}</td>
                  <td className="tabular py-2 pr-3">{pct(e.kpis.avgMaxDrawdownPct)}</td>
                  <td className="tabular py-2 pr-3">
                    {e.kpis.liquiditySurvivalPct === null
                      ? "—"
                      : `${e.kpis.liquiditySurvivalPct.toFixed(0)}% (n=${e.kpis.liquiditySurvivalN})`}
                  </td>
                  <td className="tabular py-2 pr-3">
                    {e.kpis.medianTimeToPeakMinutes === null
                      ? "—"
                      : `${e.kpis.medianTimeToPeakMinutes}m`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Control ∩ challenger" value={overlap.both} />
          <StatTile label="Control only" value={overlap.controlOnly} />
          <StatTile label="Challenger only" value={overlap.challengerOnly} />
          <StatTile label="Neither" value={overlap.neither} />
        </div>
      </Section>

      <Section
        title="Coverage"
        description="Collection state of the selected calls. Delayed and unknown are collection states, never performance."
      >
        <div className="space-y-1 text-[11px] text-muted-foreground">
          {variantSpecs.map((v) => {
            const c = coverageForVariant(byVariant.get(v.key) ?? [], eventsByKey, horizon);
            return (
              <div key={v.key}>
                <span className="text-foreground">{v.key}</span> — {c.measured} measured ·{" "}
                {c.notYetMeasured} not yet · {c.delayed} delayed · {c.unknown} unknown ·{" "}
                {c.invalidMarket} invalid
              </div>
            );
          })}
        </div>
      </Section>

      {/* Decision differences */}
      <Section
        title="Decision Differences"
        description={`Events where ${variantKey} differs from production control. Verified frozen input is kept separate from the evaluation outcome.`}
      >
        {diffs.length === 0 ? (
          <EmptyState
            title="No differences"
            description="This challenger selected exactly the same events as production control, or the experiment has not been run yet."
            icon={<FlaskConical className="size-4" />}
          />
        ) : (
          <div className="space-y-3">
            {diffs.map((d) => (
              <div key={d.eventKey} className="rounded-md border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <TokenIdentity mint={d.mint} symbol={d.symbol} name={null} pairAddress={null} />
                  <Badge variant="outline">Production: {d.productionDecision}</Badge>
                  <Badge variant="outline" className="border-primary/45 text-primary">
                    {variantKey}: {d.challengerDecision}
                  </Badge>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {d.decisionAt ? formatDate(d.decisionAt) : "—"}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Differing rule: {d.differingRule ?? "—"} · cohort {d.cohortId ?? "—"}
                </p>
                <div className="mt-2 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border border-border/60 px-3 py-2">
                    <p className="label-xs">Verified input (frozen at decision time)</p>
                    <p className="tabular mt-1 text-[11px] text-muted-foreground">
                      Thesis {d.frozenInput.thesisScore ?? "—"} · EC{" "}
                      {d.frozenInput.evidenceConfidence ?? "—"} ·{" "}
                      {d.frozenInput.verdict ?? "—"} · bear {d.frozenInput.bearSeverity ?? "—"} ·
                      distinct origins{" "}
                      {d.frozenInput.distinctIndependentEvidenceOrigins ?? "missing"} · raw
                      independent {d.frozenInput.independentSourceCount ?? "—"} (diagnostic) ·
                      verified primary{" "}
                      {d.frozenInput.verifiedPrimarySourceEvidence ? "yes" : "no"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 px-3 py-2">
                    <p className="label-xs">Evaluation outcome ({horizon})</p>
                    <p className="tabular mt-1 text-[11px] text-muted-foreground">
                      {d.outcome
                        ? `${d.outcome.status} · return ${pct(d.outcome.returnPct)} · peak ${pct(
                            d.outcome.peakPct,
                          )} · max DD ${pct(d.outcome.maxDrawdownPct)}`
                        : "No persisted observation series"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Provenance */}
      <Section
        title="Provenance"
        description="Exact frozen artifacts and contracts this experiment was decided on."
      >
        <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
          <div>Input contract: {results[0]?.inputContractVersion ?? "—"}</div>
          <div>Control policy: {String(spec.controlPolicy["policy"] ?? "—")}</div>
          <div>
            Source filters: {JSON.stringify(spec.sourcePolicyFilters)}
          </div>
          <div>Population definition: {JSON.stringify(spec.populationDefinition)}</div>
          <div>Persisted decisions: {results.length}</div>
          <div>Calibration storage: calibration_experiment_results</div>
        </div>
      </Section>
    </div>
  );
}
