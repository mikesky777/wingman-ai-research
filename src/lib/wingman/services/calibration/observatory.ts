/**
 * Calibration Observatory v1 — pure read-model rules.
 *
 * `calibration_observatory/v1` is ANALYSIS ONLY. It reads frozen production
 * decisions plus independently persisted market observations and describes
 * what happened afterwards. It never becomes a production input.
 *
 * Hard rules encoded here:
 *   - Descriptive market outcomes only. Never a trade, fill or backtest.
 *   - Only observations at or after the frozen decision baseline are used.
 *   - Confirmed-invalid market observations never move any metric.
 *   - Provider delay / failure is a COLLECTION state, never performance.
 *   - Missing data stays `null`; a missing measurement is never `0` and is
 *     never silently removed from the denominator context.
 *   - Repeated cohort×mint events are preserved; they are never described as
 *     statistically independent samples.
 */
import { assessMarketValidity, isMetricUsable } from "../outcomes/market-validity";

export const OBSERVATORY_VERSION = "calibration_observatory/v1";

/* ------------------------------------------------------------------ *
 * Stages, populations, filters
 * ------------------------------------------------------------------ */

export const OBSERVATORY_STAGES = [
  "SETUP_QUALIFIED",
  "SURVIVOR",
  "AI_SHORTLIST",
  "THESIS_SYNTHESIZED",
  "THESIS_CALL",
  "LIVE_ACTIVATION",
] as const;

export type ObservatoryStage = (typeof OBSERVATORY_STAGES)[number];

export const OBSERVATORY_STAGE_LABEL: Record<ObservatoryStage, string> = {
  SETUP_QUALIFIED: "Setup Qualified",
  SURVIVOR: "Survivors",
  AI_SHORTLIST: "AI Shortlist",
  THESIS_SYNTHESIZED: "Thesis Synthesized",
  THESIS_CALL: "Thesis Calls",
  LIVE_ACTIVATION: "Live Activations",
};

export type ObservatoryPopulation = "DECISIONS" | "UNIQUE_TOKENS";

export type ObservatorySetupFilter = "ALL" | "BASE" | "REACCEL" | "NONE" | "UNKNOWN";

export const OBSERVATORY_SETUP_FILTERS: ObservatorySetupFilter[] = [
  "ALL",
  "BASE",
  "REACCEL",
  "NONE",
  "UNKNOWN",
];

export type ResearchExecutionFilter =
  | "ALL"
  | "EXECUTED"
  | "DEFERRED_RECENT_RESEARCH"
  | "DEFERRED_BUDGET";

export const RESEARCH_EXECUTION_FILTERS: ResearchExecutionFilter[] = [
  "ALL",
  "EXECUTED",
  "DEFERRED_RECENT_RESEARCH",
  "DEFERRED_BUDGET",
];

/* ------------------------------------------------------------------ *
 * Horizons — evaluation windows, never strategy definitions
 * ------------------------------------------------------------------ */

export interface ObservatoryHorizon {
  key: string;
  label: string;
  ms: number;
}

export const OBSERVATORY_HORIZON_SET_VERSION = "observatory_horizons/v1";

export const OBSERVATORY_HORIZONS: ObservatoryHorizon[] = [
  { key: "1h", label: "1h", ms: 60 * 60_000 },
  { key: "4h", label: "4h", ms: 4 * 60 * 60_000 },
  { key: "12h", label: "12h", ms: 12 * 60 * 60_000 },
  { key: "24h", label: "24h", ms: 24 * 60 * 60_000 },
  { key: "3d", label: "3d", ms: 3 * 24 * 60 * 60_000 },
  { key: "7d", label: "7d", ms: 7 * 24 * 60 * 60_000 },
];

export const DEFAULT_HORIZON_KEY = "24h";

/**
 * A horizon counts as measured only when a valid observation exists inside the
 * final quarter of the window. Anything older is a collection gap (DELAYED),
 * never a market statement.
 */
export const HORIZON_FRESHNESS_FRACTION = 0.25;

/** Liquidity at the horizon must retain this share of the frozen baseline. */
export const LIQUIDITY_SURVIVAL_FRACTION = 0.25;

/* ------------------------------------------------------------------ *
 * Events and measurements
 * ------------------------------------------------------------------ */

export interface ObservatoryObservation {
  at: string;
  marketCap: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

export interface ObservatoryBaseline {
  observedAt: string | null;
  marketCap: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

export type HorizonStatus =
  | "MEASURED"
  | "NOT_YET_MEASURED"
  | "DELAYED"
  | "UNKNOWN"
  | "INVALID_MARKET";

export interface HorizonMeasurement {
  status: HorizonStatus;
  returnPct: number | null;
  peakPct: number | null;
  maxDrawdownPct: number | null;
  timeToPeakMinutes: number | null;
  /** `null` when liquidity evidence is missing on either side. */
  liquiditySurvived: boolean | null;
  /** Valid observations inside the window. */
  observationCount: number;
}

export interface ThesisDetail {
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: string | null;
  bearCaseSeverity: string | null;
  distinctIndependentEvidenceOrigins: number | null;
  components: Record<string, number | null>;
  rubricVersion: string | null;
  thesisPolicyVersion: string | null;
  promptVersion: string | null;
}

export interface TriageDetail {
  quantPriority: number | null;
  quantRank: number | null;
  triageRank: number | null;
  rankDelta: number | null;
  decision: string | null;
  confidence: string | null;
}

export interface SpendDetail {
  deepSelected: boolean;
  spendDecision: string | null;
  spendDecisionReason: string | null;
  executed: boolean;
  priorResearchAgeMinutes: number | null;
  materialChangeOverride: boolean;
  budgetState: string | null;
  policyVersion: string | null;
}

export interface ObservatoryEvent {
  stage: ObservatoryStage;
  eventId: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  /** Frozen decision timestamp. */
  eventAt: string | null;
  /** Exact persisted cohort of this event (scan / triage / run). */
  cohortId: string | null;
  policyVersion: string | null;
  /** Exact upstream setup provenance; `null` = UNKNOWN. */
  setups: string[] | null;
  /** Canonical event for its cohort×mint. Non-canonical stays visible. */
  canonical: boolean;
  /** 1-based appearance of this exact mint across distinct cohorts. */
  recurrenceNumber: number;
  msSincePriorCanonicalEvent: number | null;
  baseline: ObservatoryBaseline | null;
  horizons: Record<string, HorizonMeasurement>;
  thesis: ThesisDetail | null;
  triage: TriageDetail | null;
  spend: SpendDetail | null;
}

export interface SamplerHealthView {
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  oldestStaleObservationAt: string | null;
  mintsTracked: number;
  mintsDue: number;
  mintsRefreshed: number;
  mintsDelayed: number;
  batchesSent: number;
  rateLimitedCount: number;
  providerErrorCount: number;
  observationAsOf: string | null;
}

export interface ObservatoryDataset {
  version: string;
  generatedAt: string;
  events: ObservatoryEvent[];
  samplerHealth: SamplerHealthView;
  /** Always zero: the Observatory never talks to a market data provider. */
  providerRequests: 0;
}

/* ------------------------------------------------------------------ *
 * Horizon measurement
 * ------------------------------------------------------------------ */

const ts = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const usable = (o: ObservatoryObservation): boolean =>
  isMetricUsable(
    assessMarketValidity({ liquidityUsd: o.liquidityUsd, marketCap: o.marketCap }).validity,
  );

/**
 * Measure one horizon from one frozen baseline over persisted observations.
 * Never fabricates a print and never treats a collection gap as a return.
 */
export function measureHorizon(
  baseline: ObservatoryBaseline | null,
  observations: ObservatoryObservation[],
  horizonMs: number,
  nowIso: string = new Date().toISOString(),
): HorizonMeasurement {
  const empty: HorizonMeasurement = {
    status: "UNKNOWN",
    returnPct: null,
    peakPct: null,
    maxDrawdownPct: null,
    timeToPeakMinutes: null,
    liquiditySurvived: null,
    observationCount: 0,
  };

  const start = ts(baseline?.observedAt ?? null);
  const baseMc = baseline?.marketCap ?? null;
  if (start === null || !isNum(baseMc) || baseMc <= 0) return empty;

  const end = start + horizonMs;
  const now = ts(nowIso) ?? Date.now();

  const inWindow = observations
    .map((o) => ({ o, at: ts(o.at) }))
    .filter((x): x is { o: ObservatoryObservation; at: number } => x.at !== null)
    .filter((x) => x.at >= start && x.at <= end)
    .sort((a, b) => a.at - b.at);

  if (inWindow.length === 0) {
    return { ...empty, status: now < end ? "NOT_YET_MEASURED" : "DELAYED" };
  }

  const valid = inWindow.filter((x) => usable(x.o) && isNum(x.o.marketCap));
  if (valid.length === 0) {
    return { ...empty, status: "INVALID_MARKET", observationCount: 0 };
  }

  if (now < end) return { ...empty, status: "NOT_YET_MEASURED", observationCount: valid.length };

  const last = valid[valid.length - 1]!;
  const freshnessCutoff = end - horizonMs * HORIZON_FRESHNESS_FRACTION;
  if (last.at < freshnessCutoff) {
    return { ...empty, status: "DELAYED", observationCount: valid.length };
  }

  const pct = (mc: number) => (mc / baseMc - 1) * 100;

  let peak = Number.NEGATIVE_INFINITY;
  let peakAt = last.at;
  let runningPeakMc = baseMc;
  let worstDrawdown = 0;
  for (const x of valid) {
    const mc = x.o.marketCap as number;
    const change = pct(mc);
    if (change > peak) {
      peak = change;
      peakAt = x.at;
    }
    if (mc > runningPeakMc) runningPeakMc = mc;
    const dd = (mc / runningPeakMc - 1) * 100;
    if (dd < worstDrawdown) worstDrawdown = dd;
  }

  const baseLiq = baseline?.liquidityUsd ?? null;
  const lastLiq = last.o.liquidityUsd;
  const liquiditySurvived =
    isNum(lastLiq) && isNum(baseLiq) && baseLiq > 0
      ? lastLiq >= baseLiq * LIQUIDITY_SURVIVAL_FRACTION
      : null;

  return {
    status: "MEASURED",
    returnPct: pct(last.o.marketCap as number),
    peakPct: peak === Number.NEGATIVE_INFINITY ? null : peak,
    maxDrawdownPct: worstDrawdown,
    timeToPeakMinutes: Math.max(0, Math.round((peakAt - start) / 60_000)),
    liquiditySurvived,
    observationCount: valid.length,
  };
}

export function measureAllHorizons(
  baseline: ObservatoryBaseline | null,
  observations: ObservatoryObservation[],
  nowIso: string = new Date().toISOString(),
): Record<string, HorizonMeasurement> {
  const out: Record<string, HorizonMeasurement> = {};
  for (const horizon of OBSERVATORY_HORIZONS) {
    out[horizon.key] = measureHorizon(baseline, observations, horizon.ms, nowIso);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Filters and populations
 * ------------------------------------------------------------------ */

export interface ObservatoryFilters {
  stage: ObservatoryStage;
  population: ObservatoryPopulation;
  setup: ObservatorySetupFilter;
  policyVersion: string | "ALL";
  researchExecution: ResearchExecutionFilter;
  fromIso: string | null;
  toIso: string | null;
}

export function matchesObservatorySetup(
  setups: string[] | null | undefined,
  filter: ObservatorySetupFilter,
): boolean {
  if (filter === "ALL") return true;
  if (setups === null || setups === undefined) return filter === "UNKNOWN";
  if (filter === "UNKNOWN") return false;
  if (filter === "NONE") return setups.length === 0;
  return setups.includes(filter);
}

function matchesResearchExecution(
  event: ObservatoryEvent,
  filter: ResearchExecutionFilter,
): boolean {
  if (filter === "ALL") return true;
  if (!event.spend) return false;
  if (filter === "EXECUTED") return event.spend.executed;
  return event.spend.spendDecision === filter;
}

export function filterObservatoryEvents(
  events: ObservatoryEvent[],
  filters: ObservatoryFilters,
): ObservatoryEvent[] {
  const from = ts(filters.fromIso);
  const to = ts(filters.toIso);
  return events.filter((e) => {
    if (e.stage !== filters.stage) return false;
    if (!matchesObservatorySetup(e.setups, filters.setup)) return false;
    if (filters.policyVersion !== "ALL" && e.policyVersion !== filters.policyVersion) return false;
    if (!matchesResearchExecution(e, filters.researchExecution)) return false;
    const at = ts(e.eventAt);
    if (from !== null && (at === null || at < from)) return false;
    if (to !== null && (at === null || at > to)) return false;
    return true;
  });
}

/**
 * DECISIONS   — one canonical decision per legitimate cohort×mint event.
 * UNIQUE_TOKENS — the EARLIEST canonical event per exact mint inside the
 * active filters. Never the best-scoring, best-performing or latest event.
 */
export function selectObservatoryPopulation(
  events: ObservatoryEvent[],
  population: ObservatoryPopulation,
): ObservatoryEvent[] {
  const canonical = events.filter((e) => e.canonical);
  if (population === "DECISIONS") return canonical;
  const time = (e: ObservatoryEvent) => ts(e.eventAt) ?? Number.POSITIVE_INFINITY;
  const earliest = new Map<string, ObservatoryEvent>();
  for (const e of [...canonical].sort((a, b) => time(a) - time(b))) {
    if (!earliest.has(e.mint)) earliest.set(e.mint, e);
  }
  return [...earliest.values()];
}

/* ------------------------------------------------------------------ *
 * KPIs and coverage
 * ------------------------------------------------------------------ */

export interface CoverageCounts {
  measured: number;
  notYetMeasured: number;
  delayed: number;
  unknown: number;
  invalidMarket: number;
}

export interface ObservatoryKpis {
  horizonKey: string;
  events: number;
  uniqueMints: number;
  coverage: CoverageCounts;
  /** Denominator for every average/median below. */
  measuredN: number;
  measuredUniqueMints: number;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  avgPeakPct: number | null;
  medianPeakPct: number | null;
  avgMaxDrawdownPct: number | null;
  medianMaxDrawdownPct: number | null;
  medianTimeToPeakMinutes: number | null;
  /** Descriptive only — never an optimization target. */
  winRatePct: number | null;
  winRateN: number;
  liquiditySurvivalPct: number | null;
  liquiditySurvivalN: number;
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
};

export function coverageFor(events: ObservatoryEvent[], horizonKey: string): CoverageCounts {
  const counts: CoverageCounts = {
    measured: 0,
    notYetMeasured: 0,
    delayed: 0,
    unknown: 0,
    invalidMarket: 0,
  };
  for (const e of events) {
    const status = e.horizons[horizonKey]?.status ?? "UNKNOWN";
    if (status === "MEASURED") counts.measured += 1;
    else if (status === "NOT_YET_MEASURED") counts.notYetMeasured += 1;
    else if (status === "DELAYED") counts.delayed += 1;
    else if (status === "INVALID_MARKET") counts.invalidMarket += 1;
    else counts.unknown += 1;
  }
  return counts;
}

export function summarizeObservatory(
  events: ObservatoryEvent[],
  horizonKey: string,
): ObservatoryKpis {
  const coverage = coverageFor(events, horizonKey);
  const measured = events.filter((e) => e.horizons[horizonKey]?.status === "MEASURED");
  const pick = (fn: (m: HorizonMeasurement) => number | null): number[] =>
    measured.map((e) => fn(e.horizons[horizonKey] as HorizonMeasurement)).filter(isNum);

  const returns = pick((m) => m.returnPct);
  const survival = measured
    .map((e) => (e.horizons[horizonKey] as HorizonMeasurement).liquiditySurvived)
    .filter((v): v is boolean => typeof v === "boolean");

  return {
    horizonKey,
    events: events.length,
    uniqueMints: new Set(events.map((e) => e.mint)).size,
    coverage,
    measuredN: measured.length,
    measuredUniqueMints: new Set(measured.map((e) => e.mint)).size,
    avgReturnPct: mean(returns),
    medianReturnPct: median(returns),
    avgPeakPct: mean(pick((m) => m.peakPct)),
    medianPeakPct: median(pick((m) => m.peakPct)),
    avgMaxDrawdownPct: mean(pick((m) => m.maxDrawdownPct)),
    medianMaxDrawdownPct: median(pick((m) => m.maxDrawdownPct)),
    medianTimeToPeakMinutes: median(pick((m) => m.timeToPeakMinutes)),
    winRatePct: returns.length ? (returns.filter((v) => v > 0).length / returns.length) * 100 : null,
    winRateN: returns.length,
    liquiditySurvivalPct: survival.length
      ? (survival.filter(Boolean).length / survival.length) * 100
      : null,
    liquiditySurvivalN: survival.length,
  };
}

export interface StageComparisonRow {
  stage: ObservatoryStage;
  events: number;
  uniqueMints: number;
  coverage: CoverageCounts;
  medianReturnPct: number | null;
  medianPeakPct: number | null;
  medianMaxDrawdownPct: number | null;
  measuredN: number;
}

/**
 * DESCRIPTIVE STAGE COMPARISON. Stages have different populations, cohorts and
 * collection coverage; nothing here establishes causal lift.
 */
export function describeStageComparison(
  events: ObservatoryEvent[],
  filters: Omit<ObservatoryFilters, "stage">,
  horizonKey: string,
): StageComparisonRow[] {
  return OBSERVATORY_STAGES.map((stage) => {
    const scoped = selectObservatoryPopulation(
      filterObservatoryEvents(events, { ...filters, stage }),
      filters.population,
    );
    const kpis = summarizeObservatory(scoped, horizonKey);
    return {
      stage,
      events: kpis.events,
      uniqueMints: kpis.uniqueMints,
      coverage: kpis.coverage,
      medianReturnPct: kpis.medianReturnPct,
      medianPeakPct: kpis.medianPeakPct,
      medianMaxDrawdownPct: kpis.medianMaxDrawdownPct,
      measuredN: kpis.measuredN,
    };
  });
}

/** Distinct persisted policy versions for the current stage. */
export function policyVersionsFor(
  events: ObservatoryEvent[],
  stage: ObservatoryStage,
): string[] {
  return [
    ...new Set(
      events
        .filter((e) => e.stage === stage)
        .map((e) => e.policyVersion)
        .filter((v): v is string => !!v),
    ),
  ].sort();
}

/** Grouping hook for later calibration work (train/test splits by mint). */
export function groupEventsByMint(
  events: ObservatoryEvent[],
): { mint: string; events: ObservatoryEvent[] }[] {
  const byMint = new Map<string, ObservatoryEvent[]>();
  for (const e of events) byMint.set(e.mint, [...(byMint.get(e.mint) ?? []), e]);
  return [...byMint.entries()].map(([mint, list]) => ({ mint, events: list }));
}
