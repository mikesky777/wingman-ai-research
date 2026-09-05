/**
 * History artifact contracts (client-safe, pure types).
 *
 * Deep Research and Thesis Synthesized are artifact stages. They deliberately
 * carry NO since / peak / drawdown / win-rate field, because no stage-relative
 * outcome baseline was captured for them.
 */

export interface HistoryArtifactIdentity {
  mint: string;
  symbol: string | null;
  name: string | null;
  pairAddress: string | null;
}

export interface DeepResearchArtifact extends HistoryArtifactIdentity {
  reportId: string;
  runId: string;
  completedAt: string | null;
  narrativeResolved: boolean;
  oneSentenceNarrative: string | null;
  sourceCount: number | null;
  independentSourceCount: number | null;
  coveragePct: number | null;
  researchPolicyVersion: string | null;
  searchVersion: string | null;
  dossierVersion: string | null;
  modelProvider: string | null;
  modelIdentifier: string | null;
  promptVersion: string | null;
}

/**
 * Frozen market state at the exact moment a thesis artifact was synthesized.
 *
 * `CAPTURED_AT_SYNTHESIS`  — persisted by the thesis run itself.
 * `RESOLVED_DECISION_TIME` — deterministically resolved for an older artifact
 *   from the exact persisted decision-time observation it was synthesized on.
 *   Never a later observation, never another stage's baseline.
 */
export interface ThesisBaseline {
  origin: "CAPTURED_AT_SYNTHESIS" | "RESOLVED_DECISION_TIME";
  observedAt: string | null;
  marketCap: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  pairAddress: string | null;
  source: string | null;
}

/** Stage-relative performance of one thesis artifact, from its own baseline. */
export interface ThesisPerformance {
  sincePct: number | null;
  peakPct: number | null;
  drawdownPct: number | null;
  currentMarketCap: number | null;
  currentPriceUsd: number | null;
  currentLiquidityUsd: number | null;
  currentVolume24h: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  currentObservedAt: string | null;
  observationCount: number;
}

export interface ThesisArtifact extends HistoryArtifactIdentity {
  reportId: string;
  synthesizedAt: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: string | null;
  bearCaseSeverity: string | null;
  oneSentenceThesis: string | null;
  strongestBearCase: string | null;
  qualifiedAsOpportunity: boolean;
  thesisPolicyVersion: string | null;
  rubricVersion: string | null;
  promptVersion: string | null;
  modelProvider: string | null;
  modelIdentifier: string | null;
  /** Provenance of the exact production cohort this artifact belongs to. */
  sourceScanId: string | null;
  triageRunId: string | null;
  deepResearchRunId: string | null;
  deepResearchReportId: string | null;
  /**
   * `thesis_population/v1` classification, derived from exact provenance only
   * — never from score or performance.
   */
  canonicalWithinCohortMint: boolean;
  sameCohortRerun: boolean;
  /** 1-based appearance of this mint across distinct production cohorts. */
  recurrenceNumberAcrossProductionCohorts: number;
  /** ms between this artifact and the prior canonical synthesis of the mint. */
  timeSincePriorCanonicalSynthesisMs: number | null;
  /** `null` when no legitimate thesis-time baseline exists for this artifact. */
  baseline: ThesisBaseline | null;
  performance: ThesisPerformance | null;
}

export interface HistoryArtifacts {
  deepResearch: DeepResearchArtifact[];
  thesis: ThesisArtifact[];
}

/** Shown wherever an artifact stage would otherwise imply a return series. */
export const ARTIFACT_NO_BASELINE_NOTE =
  "Historical performance baseline not captured for this artifact version.";

/** Shown on a single thesis card that has no legitimate thesis-time baseline. */
export const THESIS_NO_BASELINE_NOTE =
  "Performance baseline unavailable for this historical artifact.";

/** Diagnostic label for a preserved, non-canonical same-cohort duplicate. */
export const SAME_COHORT_RERUN_LABEL = "SAME-COHORT RERUN · NON-CANONICAL KPI";

export type ThesisPopulation = "THESIS_EVENTS" | "UNIQUE_TOKENS";

/**
 * `thesis_population/v1` — classify artifacts by exact provenance.
 *
 * Within one cohort (triage run) × mint, the EARLIEST artifact is canonical.
 * Later artifacts of that same cohort × mint are same-cohort reruns: they stay
 * visible in History but never count as independent observations. Selection is
 * purely chronological — never by score, peak or any later outcome.
 */
export function classifyThesisArtifacts(rows: ThesisArtifact[]): ThesisArtifact[] {
  const time = (r: ThesisArtifact) =>
    r.synthesizedAt ? Date.parse(r.synthesizedAt) : Number.POSITIVE_INFINITY;
  const ordered = [...rows].sort((a, b) => time(a) - time(b));

  const canonicalIds = new Set<string>();
  const seenCohortMint = new Set<string>();
  const cohortsPerMint = new Map<string, Set<string>>();
  const recurrence = new Map<string, number>();
  const lastCanonicalAt = new Map<string, number>();
  const sincePrior = new Map<string, number | null>();

  for (const r of ordered) {
    const cohort = r.triageRunId ?? `report:${r.reportId}`;
    const key = `${cohort}::${r.mint}`;
    if (seenCohortMint.has(key)) continue;
    seenCohortMint.add(key);
    canonicalIds.add(r.reportId);

    const cohorts = cohortsPerMint.get(r.mint) ?? new Set<string>();
    cohorts.add(cohort);
    cohortsPerMint.set(r.mint, cohorts);
    recurrence.set(r.reportId, cohorts.size);

    const prior = lastCanonicalAt.get(r.mint) ?? null;
    const at = time(r);
    sincePrior.set(r.reportId, prior !== null && Number.isFinite(at) ? at - prior : null);
    if (Number.isFinite(at)) lastCanonicalAt.set(r.mint, at);
  }

  return rows.map((r) => {
    const canonical = canonicalIds.has(r.reportId);
    return {
      ...r,
      canonicalWithinCohortMint: canonical,
      sameCohortRerun: !canonical,
      recurrenceNumberAcrossProductionCohorts: recurrence.get(r.reportId) ?? 0,
      timeSincePriorCanonicalSynthesisMs: sincePrior.get(r.reportId) ?? null,
    };
  });
}

/**
 * Statistical population for the KPI header.
 *
 * THESIS_EVENTS — one canonical observation per cohort × mint.
 * UNIQUE_TOKENS — the EARLIEST canonical event per exact mint. No hindsight
 * selection of the best score, best peak or latest winner.
 */
export function selectThesisPopulation(
  rows: ThesisArtifact[],
  population: ThesisPopulation,
): ThesisArtifact[] {
  const canonical = rows.filter((r) => r.canonicalWithinCohortMint);
  if (population === "THESIS_EVENTS") return canonical;
  const time = (r: ThesisArtifact) =>
    r.synthesizedAt ? Date.parse(r.synthesizedAt) : Number.POSITIVE_INFINITY;
  const earliest = new Map<string, ThesisArtifact>();
  for (const r of [...canonical].sort((a, b) => time(a) - time(b))) {
    if (!earliest.has(r.mint)) earliest.set(r.mint, r);
  }
  return [...earliest.values()];
}

/** Population counts shown above the KPI tiles. */
export function thesisPopulationCounts(rows: ThesisArtifact[]): {
  storedArtifacts: number;
  thesisEvents: number;
  uniqueTokens: number;
  sameCohortReruns: number;
} {
  const canonical = rows.filter((r) => r.canonicalWithinCohortMint);
  return {
    storedArtifacts: rows.length,
    thesisEvents: canonical.length,
    uniqueTokens: new Set(canonical.map((r) => r.mint)).size,
    sameCohortReruns: rows.length - canonical.length,
  };
}

/** A single statistic plus the number of valid readings behind it. */
export interface ArtifactStat {
  value: number | null;
  n: number;
}

export interface ThesisPerformanceSummary {
  /** Artifacts (synthesis events) with a legitimate thesis-time baseline. */
  artifactsWithBaseline: number;
  /** Unique mints among those artifacts. */
  uniqueTokens: number;
  avgSince: ArtifactStat;
  medianSince: ArtifactStat;
  avgPeak: ArtifactStat;
  medianPeak: ArtifactStat;
  winRate: ArtifactStat;
  avgMaxDd: ArtifactStat;
  medianMaxDd: ArtifactStat;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function stats(values: (number | null | undefined)[]): { valid: number[] } {
  return { valid: values.filter(isNum) };
}

function mean(values: (number | null | undefined)[]): ArtifactStat {
  const { valid } = stats(values);
  if (valid.length === 0) return { value: null, n: 0 };
  return { value: valid.reduce((s, v) => s + v, 0) / valid.length, n: valid.length };
}

function median(values: (number | null | undefined)[]): ArtifactStat {
  const valid = stats(values).valid.sort((a, b) => a - b);
  if (valid.length === 0) return { value: null, n: 0 };
  const mid = Math.floor(valid.length / 2);
  const value =
    valid.length % 2 === 0
      ? ((valid[mid - 1] as number) + (valid[mid] as number)) / 2
      : (valid[mid] as number);
  return { value, n: valid.length };
}

/**
 * KPI summary over thesis artifacts. ONLY artifacts with a legitimate
 * thesis-time baseline contribute; a missing measurement is excluded, never 0.
 */
export function summarizeThesisArtifacts(rows: ThesisArtifact[]): ThesisPerformanceSummary {
  const measured = rows.filter((r) => r.baseline !== null && r.performance !== null);
  const since = measured.map((r) => r.performance?.sincePct ?? null);
  const validSince = stats(since).valid;
  const wins = validSince.filter((v) => v > 0).length;
  return {
    artifactsWithBaseline: measured.length,
    uniqueTokens: new Set(measured.map((r) => r.mint)).size,
    avgSince: mean(since),
    medianSince: median(since),
    avgPeak: mean(measured.map((r) => r.performance?.peakPct ?? null)),
    medianPeak: median(measured.map((r) => r.performance?.peakPct ?? null)),
    winRate:
      validSince.length === 0
        ? { value: null, n: 0 }
        : { value: (wins / validSince.length) * 100, n: validSince.length },
    avgMaxDd: mean(measured.map((r) => r.performance?.drawdownPct ?? null)),
    medianMaxDd: median(measured.map((r) => r.performance?.drawdownPct ?? null)),
  };
}

export type ThesisArtifactSort = "RECENT" | "SCORE" | "PEAK" | "SINCE" | "WORST_DD";

/**
 * Sort thesis artifacts. Never drops an artifact and never collapses two
 * synthesis events of the same mint. Missing measurements always sort last.
 */
export function sortThesisArtifacts(
  rows: ThesisArtifact[],
  sort: ThesisArtifactSort,
): ThesisArtifact[] {
  const list = [...rows];
  const by = (pick: (r: ThesisArtifact) => number | null, asc = false) =>
    list.sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return asc ? av - bv : bv - av;
    });

  if (sort === "SCORE") return by((r) => r.thesisScore);
  if (sort === "PEAK") return by((r) => r.performance?.peakPct ?? null);
  if (sort === "SINCE") return by((r) => r.performance?.sincePct ?? null);
  if (sort === "WORST_DD") return by((r) => r.performance?.drawdownPct ?? null, true);
  return list.sort((a, b) => {
    const at = a.synthesizedAt;
    const bt = b.synthesizedAt;
    if (!at && !bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return Date.parse(bt) - Date.parse(at);
  });
}

