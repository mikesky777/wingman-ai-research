/**
 * Scanner outcome derivation (pure, deterministic, server- and browser-safe).
 *
 * Answers one question only: what happened to a token AFTER Wingman observed
 * it (First Seen) and, if it ever happened, after Wingman selected it as a
 * Survivor (First Wingman Call).
 *
 * Hard rules:
 *   - Observational only. Nothing here is a trade, a fill, or a backtest.
 *   - Nothing here is ever read back into priority, setup classification,
 *     hard filters or survivor selection.
 *   - Unavailable data stays `null`. A missing price is never `0`.
 *   - Values are only ever read from already-persisted observations. Nothing
 *     is interpolated, extrapolated or fabricated.
 */

export const OUTCOME_VERSION = "outcomes/v1";

export type ObservationSource = "scan_candidate" | "token_snapshot";

export interface Observation {
  /** ISO timestamp of the observation. */
  at: string;
  priceUsd: number | null;
  marketCap: number | null;
  source: ObservationSource;
}

/** One appearance of a token in a completed scan run. */
export interface CandidateAppearance {
  scanRunId: string;
  /** Run completion time. Incomplete runs must never be passed in. */
  completedAt: string;
  priceUsd: number | null;
  marketCap: number | null;
  /** True when the run selected the token as a Survivor. */
  survivor: boolean;
}

export interface SnapshotObservation {
  capturedAt: string;
  priceUsd: number | null;
  marketCap: number | null;
}

export interface Milestone {
  scanRunId: string;
  at: string;
  priceUsd: number | null;
  marketCap: number | null;
}

export interface Milestones {
  firstSeen: Milestone | null;
  firstCall: Milestone | null;
}

/**
 * First Seen  = earliest completed scan the token was persisted in, whatever
 *               its rank, setup or selection status.
 * First Call  = earliest completed scan the token was selected as a Survivor.
 * A token can have a First Seen and never a First Call.
 */
export function deriveMilestones(appearances: CandidateAppearance[]): Milestones {
  const ordered = [...appearances].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
  const first = ordered[0] ?? null;
  const call = ordered.find((a) => a.survivor) ?? null;
  return {
    firstSeen: first ? toMilestone(first) : null,
    firstCall: call ? toMilestone(call) : null,
  };
}

function toMilestone(a: CandidateAppearance): Milestone {
  return {
    scanRunId: a.scanRunId,
    at: a.completedAt,
    priceUsd: a.priceUsd,
    marketCap: a.marketCap,
  };
}

/**
 * Merge both persisted observation series.
 *
 * `token_snapshots` coverage is survivor-biased (enrichment only writes them
 * for survivors), so scan candidate rows carry the history of rejected and
 * near-miss tokens. Both are used, deduplicated by whole-second timestamp;
 * when the two collide, the snapshot wins because it is a direct provider
 * pull rather than a discovery-page reading.
 */
export function buildObservationSeries(
  candidates: CandidateAppearance[],
  snapshots: SnapshotObservation[],
): Observation[] {
  const byBucket = new Map<number, Observation>();

  const put = (observation: Observation) => {
    const t = Date.parse(observation.at);
    if (Number.isNaN(t)) return;
    const bucket = Math.floor(t / 1000);
    const existing = byBucket.get(bucket);
    if (existing && existing.source === "token_snapshot") return;
    byBucket.set(bucket, observation);
  };

  for (const c of candidates) {
    put({ at: c.completedAt, priceUsd: c.priceUsd, marketCap: c.marketCap, source: "scan_candidate" });
  }
  for (const s of snapshots) {
    put({ at: s.capturedAt, priceUsd: s.priceUsd, marketCap: s.marketCap, source: "token_snapshot" });
  }

  return [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, observation]) => observation);
}

export interface HorizonDefinition {
  key: string;
  minutes: number;
  /** Maximum absolute distance from the target time for a usable observation. */
  toleranceMinutes: number;
}

/** Centralized horizon windows. Widened with the horizon, never interpolated. */
export const HORIZONS: HorizonDefinition[] = [
  { key: "1h", minutes: 60, toleranceMinutes: 20 },
  { key: "6h", minutes: 360, toleranceMinutes: 60 },
  { key: "24h", minutes: 1440, toleranceMinutes: 180 },
  { key: "3d", minutes: 4320, toleranceMinutes: 360 },
  { key: "7d", minutes: 10080, toleranceMinutes: 720 },
  { key: "30d", minutes: 43200, toleranceMinutes: 2880 },
];

export interface HorizonPoint {
  priceUsd: number | null;
  marketCap: number | null;
  /** Market-cap change vs the baseline, or `null` when either side is missing. */
  changePct: number | null;
  sourceCapturedAt: string;
  offsetMinutes: number;
}

export type HorizonMap = Record<string, HorizonPoint | null>;

export interface OutcomeMetrics {
  currentPriceUsd: number | null;
  currentMarketCap: number | null;
  currentObservedAt: string | null;
  priceChangePct: number | null;
  marketCapChangePct: number | null;
  maxPrice: number | null;
  maxMarketCap: number | null;
  maxGainPct: number | null;
  /** Price-based peak gain vs the baseline price. Market cap stays primary. */
  maxPriceGainPct: number | null;
  /** Timestamp of the observation carrying the post-baseline market-cap peak. */
  maxMarketCapAt: string | null;
  maxPriceAt: string | null;
  minPrice: number | null;
  minMarketCap: number | null;
  /** Worst market-cap move against the baseline, as a negative percentage. */
  maxAdverseChangePct: number | null;
  /** Worst decline from a post-baseline market-cap peak, as a negative percentage. */
  maxPeakToTroughDrawdownPct: number | null;
  elapsedMinutes: number | null;
  observationCount: number;
  horizons: HorizonMap;
}

export interface OutcomeInput {
  baselineAt: string;
  baselinePriceUsd: number | null;
  baselineMarketCap: number | null;
  series: Observation[];
  nowIso: string;
  horizons?: HorizonDefinition[];
}

export function emptyOutcome(): OutcomeMetrics {
  return {
    currentPriceUsd: null,
    currentMarketCap: null,
    currentObservedAt: null,
    priceChangePct: null,
    marketCapChangePct: null,
    maxPrice: null,
    maxMarketCap: null,
    maxGainPct: null,
    maxPriceGainPct: null,
    maxMarketCapAt: null,
    maxPriceAt: null,
    minPrice: null,
    minMarketCap: null,
    maxAdverseChangePct: null,
    maxPeakToTroughDrawdownPct: null,
    elapsedMinutes: null,
    observationCount: 0,
    horizons: {},
  };
}

/** Percentage change. `null` whenever either side is unusable. */
export function changePct(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

/**
 * Everything is measured from `baselineAt` forward. Observations before the
 * baseline are ignored entirely, so First Seen and First Call metrics never
 * borrow each other's history.
 */
export function deriveOutcome(input: OutcomeInput): OutcomeMetrics {
  const baseTime = Date.parse(input.baselineAt);
  if (Number.isNaN(baseTime)) return emptyOutcome();

  const series = input.series
    .filter((o) => {
      const t = Date.parse(o.at);
      return !Number.isNaN(t) && t >= baseTime;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const out = emptyOutcome();
  out.observationCount = series.length;

  const now = Date.parse(input.nowIso);
  out.elapsedMinutes = Number.isNaN(now) ? null : (now - baseTime) / 60000;

  const prices = series.map((o) => o.priceUsd).filter(isNumber);
  const caps = series.map((o) => o.marketCap).filter(isNumber);

  const lastWithPrice = [...series].reverse().find((o) => isNumber(o.priceUsd)) ?? null;
  const lastWithCap = [...series].reverse().find((o) => isNumber(o.marketCap)) ?? null;
  out.currentPriceUsd = lastWithPrice?.priceUsd ?? null;
  out.currentMarketCap = lastWithCap?.marketCap ?? null;
  out.currentObservedAt = (lastWithCap ?? lastWithPrice)?.at ?? null;

  out.maxPrice = prices.length ? Math.max(...prices) : null;
  out.minPrice = prices.length ? Math.min(...prices) : null;
  out.maxMarketCap = caps.length ? Math.max(...caps) : null;
  out.minMarketCap = caps.length ? Math.min(...caps) : null;

  out.priceChangePct = changePct(input.baselinePriceUsd, out.currentPriceUsd);
  out.marketCapChangePct = changePct(input.baselineMarketCap, out.currentMarketCap);

  // Gain / adverse move are market-cap based: Wingman reasons in market caps.
  out.maxGainPct = changePct(input.baselineMarketCap, out.maxMarketCap);
  out.maxPriceGainPct = changePct(input.baselinePriceUsd, out.maxPrice);

  // Peak timestamps come from the observation that actually carried the peak;
  // nothing is interpolated. Earliest observation wins on an exact tie.
  out.maxMarketCapAt =
    out.maxMarketCap === null
      ? null
      : (series.find((o) => o.marketCap === out.maxMarketCap)?.at ?? null);
  out.maxPriceAt =
    out.maxPrice === null ? null : (series.find((o) => o.priceUsd === out.maxPrice)?.at ?? null);
  out.maxAdverseChangePct = changePct(input.baselineMarketCap, out.minMarketCap);

  out.maxPeakToTroughDrawdownPct = peakToTroughDrawdownPct(
    input.baselineMarketCap,
    series.map((o) => o.marketCap),
  );

  out.horizons = deriveHorizons(input, series, baseTime);
  return out;
}

/** Worst decline from any running peak (baseline included as the first peak). */
function peakToTroughDrawdownPct(baseline: number | null, caps: (number | null)[]): number | null {
  let peak = isNumber(baseline) ? baseline : null;
  let worst: number | null = null;
  for (const cap of caps) {
    if (!isNumber(cap)) continue;
    if (peak === null || cap > peak) {
      peak = cap;
      continue;
    }
    if (peak === 0) continue;
    const decline = ((cap - peak) / peak) * 100;
    if (worst === null || decline < worst) worst = decline;
  }
  return worst;
}

function deriveHorizons(
  input: OutcomeInput,
  series: Observation[],
  baseTime: number,
): HorizonMap {
  const map: HorizonMap = {};
  for (const horizon of input.horizons ?? HORIZONS) {
    const target = baseTime + horizon.minutes * 60000;
    const tolerance = horizon.toleranceMinutes * 60000;

    let best: Observation | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const observation of series) {
      if (!isNumber(observation.marketCap) && !isNumber(observation.priceUsd)) continue;
      const distance = Math.abs(Date.parse(observation.at) - target);
      if (distance > tolerance) continue;
      if (distance < bestDistance) {
        best = observation;
        bestDistance = distance;
      }
    }

    map[horizon.key] = best
      ? {
          priceUsd: best.priceUsd,
          marketCap: best.marketCap,
          changePct: changePct(input.baselineMarketCap, best.marketCap),
          sourceCapturedAt: best.at,
          offsetMinutes: (Date.parse(best.at) - baseTime) / 60000,
        }
      : null;
  }
  return map;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
