/**
 * History cohort statistics (pure).
 *
 * Descriptive historical measurement only. Nothing here participates in
 * scanner selection, setup qualification, priority, universe/structural
 * eligibility, price integrity, participation quality or outcome baselines.
 *
 * Hard rules:
 *   - Statistics are computed over UNIQUE TOKENS. A token seen in 20 scans
 *     counts once.
 *   - A missing measurement is EXCLUDED, never treated as 0.
 *   - BASE and REACCEL cohorts are independent sets.
 */

/** Setup cohorts exposed by the History view. */
export type HistorySetup = "BASE" | "REACCEL";

export const HISTORY_SETUPS: HistorySetup[] = ["BASE", "REACCEL"];

/** One unique token in a cohort, derived from its frozen First Call record. */
export interface CohortToken {
  tokenId: string;
  contractAddress: string | null;
  name: string;
  symbol: string;
  /** Setup(s) recorded on the candidate row of the token's First Call scan. */
  setups: string[];
  firstCallAt: string | null;
  firstCallMarketCap: number | null;
  firstCallPriceUsd: number | null;
  /** Persisted market-cap change since the frozen First Call baseline. */
  sinceCallPct: number | null;
  peakSinceCallPct: number | null;
  maxAdverseSinceCallPct: number | null;
  drawdownSinceCallPct: number | null;
  currentMarketCap: number | null;
  currentPriceUsd: number | null;
  currentObservedAt: string | null;
  /** Immutable scan-time values from the First Call candidate row. */
  scanMarketCap: number | null;
  scanLiquidityUsd: number | null;
  scanVolume24h: number | null;
  priceIntegrityStatus: string | null;
  structuralStatus: string | null;
  participationStatus: string | null;
  dexPairAddress: string | null;
  observationCount: number;
  /**
   * created_at of the token's MOST RECENT persisted scan_candidates row — the
   * newest scanner observation of this exact mint, regardless of setup or
   * survivor status. This is the timestamp the "Most recent" sort uses.
   */
  latestObservationAt: string | null;
  /** recurrence_state persisted on that most recent observation. */
  latestRecurrenceState: string | null;
}

/** History cohort sort modes. */
export type CohortSort = "RECENT" | "PEAK";

/**
 * Sort a cohort. Never mutates the input and never drops a token.
 *
 *  - RECENT: latestObservationAt descending (falls back to firstCallAt when a
 *    token has no persisted candidate row). Missing both sorts last.
 *  - PEAK: peak_since_call_pct descending. MISSING VALUES SORT LAST and are
 *    never coerced to 0.
 */
export function sortCohort(tokens: CohortToken[], sort: CohortSort): CohortToken[] {
  const rows = [...tokens];
  if (sort === "PEAK") {
    return rows.sort((a, b) => {
      const av = isNum(a.peakSinceCallPct) ? a.peakSinceCallPct : null;
      const bv = isNum(b.peakSinceCallPct) ? b.peakSinceCallPct : null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });
  }
  return rows.sort((a, b) => {
    const at = a.latestObservationAt ?? a.firstCallAt;
    const bt = b.latestObservationAt ?? b.firstCallAt;
    if (!at && !bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return Date.parse(bt) - Date.parse(at);
  });
}

/** A single statistic plus the number of valid observations behind it. */
export interface Stat {
  value: number | null;
  n: number;
}

export interface CohortSummary {
  setup: HistorySetup;
  /** Unique tokens in the cohort. */
  sampleSize: number;
  avgSinceCall: Stat;
  medianSinceCall: Stat;
  avgPeakCall: Stat;
  medianPeakCall: Stat;
  /** Percentage of tokens whose CURRENT Since Call is above zero. */
  winRate: Stat;
  avgMaxDdCall: Stat;
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Valid numeric readings only. Missing values are dropped, never zeroed. */
export function validValues(values: (number | null | undefined)[]): number[] {
  return values.filter(isNum);
}

export function mean(values: (number | null | undefined)[]): Stat {
  const valid = validValues(values);
  if (valid.length === 0) return { value: null, n: 0 };
  const total = valid.reduce((sum, v) => sum + v, 0);
  return { value: total / valid.length, n: valid.length };
}

export function median(values: (number | null | undefined)[]): Stat {
  const valid = validValues(values).sort((a, b) => a - b);
  if (valid.length === 0) return { value: null, n: 0 };
  const mid = Math.floor(valid.length / 2);
  const value =
    valid.length % 2 === 0 ? ((valid[mid - 1] as number) + (valid[mid] as number)) / 2 : (valid[mid] as number);
  return { value, n: valid.length };
}

/** One row per token, even if the same token appears in several scans. */
export function uniqueTokens(tokens: CohortToken[]): CohortToken[] {
  const byId = new Map<string, CohortToken>();
  for (const token of tokens) {
    if (!byId.has(token.tokenId)) byId.set(token.tokenId, token);
  }
  return [...byId.values()];
}

/** Cohort membership: the setups recorded at the token's First Call scan. */
export function cohortFor(tokens: CohortToken[], setup: HistorySetup): CohortToken[] {
  return uniqueTokens(tokens.filter((t) => t.setups.includes(setup) && t.firstCallAt !== null));
}

/**
 * Optional LIVE overlay: current Since Call recomputed from a live market cap
 * against the FROZEN First Call baseline. The persisted record is never
 * rewritten — this only changes what the summary card displays.
 */
export interface LiveSinceCall {
  marketCap: number | null;
}

export function liveSinceCallPct(token: CohortToken, live?: LiveSinceCall | null): number | null {
  const baseline = token.firstCallMarketCap;
  const current = live?.marketCap ?? null;
  if (!isNum(baseline) || baseline <= 0 || !isNum(current)) return token.sinceCallPct;
  return ((current - baseline) / baseline) * 100;
}

export function summarizeCohort(
  tokens: CohortToken[],
  setup: HistorySetup,
  live?: Map<string, LiveSinceCall> | null,
): CohortSummary {
  const cohort = cohortFor(tokens, setup);
  const sinceCall = cohort.map((t) =>
    liveSinceCallPct(t, live?.get(t.contractAddress ?? "") ?? null),
  );
  const peaks = cohort.map((t) => t.peakSinceCallPct);
  const drawdowns = cohort.map((t) => t.maxAdverseSinceCallPct);

  const validSince = validValues(sinceCall);
  const wins = validSince.filter((v) => v > 0).length;

  return {
    setup,
    sampleSize: cohort.length,
    avgSinceCall: mean(sinceCall),
    medianSinceCall: median(sinceCall),
    avgPeakCall: mean(peaks),
    medianPeakCall: median(peaks),
    winRate:
      validSince.length === 0
        ? { value: null, n: 0 }
        : { value: (wins / validSince.length) * 100, n: validSince.length },
    avgMaxDdCall: mean(drawdowns),
  };
}
