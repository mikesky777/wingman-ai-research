/**
 * Independent outcome sampler — pure rules and configuration.
 *
 * `outcome_sampler/v1` decouples market-observation collection from any UI.
 * The scheduled sampler (not History, not Calibration) is responsible for
 * keeping persisted observations alive.
 *
 * Hard rules encoded here:
 *   - A MARKET OBSERVATION is a reusable fact for one exact mint at one time.
 *     It is never derived per decision event and never per stage.
 *   - A provider failure is a COLLECTION state, never a market outcome.
 *   - Nothing here may be read by Scanner / Triage / Deep Research / Thesis /
 *     Entry / Sizing. Evaluation-only, downstream of frozen decisions.
 */

export const OUTCOME_SAMPLER_VERSION = "outcome_sampler/v1";

/** Scheduled collection cadence. Operational, not a trading parameter. */
export const SAMPLER_CADENCE_MS = 5 * 60_000;

/** DexScreener batch endpoint limit (`/tokens/v1/solana/{addresses}`). */
export const SAMPLER_BATCH_SIZE = 30;

/** Conservative ceiling well below the provider maximum. */
export const SAMPLER_MAX_BATCHES_PER_RUN = 12;

/** How long a decision baseline keeps requiring fresh observations. */
export const OUTCOME_TRACKING_WINDOW_MS = 7 * 24 * 60 * 60_000;

/** Lease duration for one sampling window (stale leases are reclaimable). */
export const SAMPLER_LEASE_MS = 4 * 60_000;

/**
 * Horizons Calibration may evaluate later. The sampler never labels
 * WIN/LOSS — it only guarantees observation density for these horizons.
 */
export const OUTCOME_HORIZONS_MS: Record<string, number> = {
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "3d": 3 * 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

/**
 * Age-tiered refresh cadence: young decisions move fast, old ones do not need
 * five-minute resolution. This is what stops a 700-mint fan-out per cycle.
 */
const REFRESH_TIERS: { maxAgeMs: number; intervalMs: number }[] = [
  { maxAgeMs: 60 * 60_000, intervalMs: 5 * 60_000 },
  { maxAgeMs: 6 * 60 * 60_000, intervalMs: 15 * 60_000 },
  { maxAgeMs: 24 * 60 * 60_000, intervalMs: 30 * 60_000 },
  { maxAgeMs: OUTCOME_TRACKING_WINDOW_MS, intervalMs: 2 * 60 * 60_000 },
];

export function refreshIntervalMs(baselineAgeMs: number): number {
  for (const tier of REFRESH_TIERS) {
    if (baselineAgeMs <= tier.maxAgeMs) return tier.intervalMs;
  }
  return REFRESH_TIERS[REFRESH_TIERS.length - 1]!.intervalMs;
}

/** Observation availability. NEVER a statement about the market itself. */
export type CoverageStatus =
  | "FRESH"
  | "DELAYED"
  | "UNKNOWN"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE";

/** Whether a horizon can be evaluated. Distinct from any return value. */
export type MeasurementStatus = "MEASURED" | "NOT_YET_MEASURED" | "DELAYED";

export interface TrackingState {
  contractAddress: string;
  /** Newest frozen decision baseline for this exact mint. */
  latestBaselineAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextEligibleAt: string | null;
  consecutiveFailures: number;
  priorityRequestedAt?: string | null;
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
};

/** A mint stops being sampled once every baseline has aged past the window. */
export function isTracked(state: TrackingState, nowIso: string): boolean {
  const baseline = ms(state.latestBaselineAt);
  const now = ms(nowIso) ?? Date.now();
  if (baseline === null) return false;
  return now - baseline <= OUTCOME_TRACKING_WINDOW_MS;
}

export function isDue(state: TrackingState, nowIso: string): boolean {
  if (!isTracked(state, nowIso)) return false;
  const now = ms(nowIso) ?? Date.now();
  const next = ms(state.nextEligibleAt ?? null);
  return next === null || next <= now;
}

/**
 * Deterministic ordering: explicit priority requests first, then the stalest
 * observation. Repeated decision events for the same mint collapse to one
 * entry because tracking is keyed by exact mint.
 */
export function selectDueMints(
  states: TrackingState[],
  nowIso: string,
  limit = SAMPLER_BATCH_SIZE * SAMPLER_MAX_BATCHES_PER_RUN,
): string[] {
  const now = ms(nowIso) ?? Date.now();
  const due = states.filter((state) => isDue(state, nowIso));
  const staleness = (state: TrackingState) => now - (ms(state.lastSuccessAt) ?? 0);
  due.sort((a, b) => {
    const pa = a.priorityRequestedAt ? 1 : 0;
    const pb = b.priorityRequestedAt ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const diff = staleness(b) - staleness(a);
    if (diff !== 0) return diff;
    return a.contractAddress.localeCompare(b.contractAddress);
  });
  return [...new Set(due.map((s) => s.contractAddress))].slice(0, limit);
}

/** Exponential backoff with jitter; a provider `Retry-After` always wins. */
export function backoffDelayMs(
  consecutiveFailures: number,
  retryAfterSeconds: number | null,
  random: () => number = Math.random,
): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) return retryAfterSeconds * 1000;
  const attempt = Math.max(1, Math.min(consecutiveFailures, 6));
  const base = Math.min(SAMPLER_CADENCE_MS * 2 ** (attempt - 1), 60 * 60_000);
  return Math.round(base * (0.8 + random() * 0.4));
}

export function nextEligibleAfterSuccess(
  state: TrackingState,
  nowIso: string,
): string {
  const now = ms(nowIso) ?? Date.now();
  const baseline = ms(state.latestBaselineAt) ?? now;
  return new Date(now + refreshIntervalMs(now - baseline)).toISOString();
}

export function nextEligibleAfterFailure(
  consecutiveFailures: number,
  retryAfterSeconds: number | null,
  nowIso: string,
  random: () => number = Math.random,
): string {
  const now = ms(nowIso) ?? Date.now();
  return new Date(now + backoffDelayMs(consecutiveFailures, retryAfterSeconds, random)).toISOString();
}

/** Coverage is about data availability only. Never about the token. */
export function coverageStatusFor(
  state: TrackingState & { lastErrorCode?: string | null },
  nowIso: string,
): CoverageStatus {
  const now = ms(nowIso) ?? Date.now();
  const success = ms(state.lastSuccessAt);
  const baseline = ms(state.latestBaselineAt) ?? now;
  const expected = refreshIntervalMs(now - baseline);

  if (state.consecutiveFailures > 0) {
    if (state.lastErrorCode === "RATE_LIMITED") return "PROVIDER_RATE_LIMITED";
    // The provider is healthy but has no indexed pool: availability unknown,
    // NOT a statement that the token failed or lost liquidity.
    if (state.lastErrorCode === "NO_ELIGIBLE_PAIR") return "UNKNOWN";
    if (state.lastErrorCode) return "PROVIDER_UNAVAILABLE";
  }
  if (success === null) return "UNKNOWN";
  return now - success <= expected * 2 ? "FRESH" : "DELAYED";
}

/**
 * Horizon evaluability for one frozen baseline. A missing observation is
 * NOT_YET_MEASURED or DELAYED — never zero, never an adverse outcome.
 */
export function measurementStatusFor(
  baselineAtIso: string,
  horizonMs: number,
  lastObservedAtIso: string | null,
  nowIso: string,
): MeasurementStatus {
  const baseline = ms(baselineAtIso);
  const now = ms(nowIso) ?? Date.now();
  if (baseline === null) return "NOT_YET_MEASURED";
  const target = baseline + horizonMs;
  if (now < target) return "NOT_YET_MEASURED";
  const observed = ms(lastObservedAtIso);
  if (observed !== null && observed >= target) return "MEASURED";
  return "DELAYED";
}

/** Canonical observation bucket — at most one persisted row per mint+window. */
export function observationWindowKey(iso: string, bucketMs = SAMPLER_CADENCE_MS): string {
  const at = ms(iso) ?? Date.now();
  return new Date(Math.floor(at / bucketMs) * bucketMs).toISOString();
}

/** Sampler window key. Two concurrent workers resolve to the same key. */
export function samplerWindowKey(iso: string, bucketMs = SAMPLER_CADENCE_MS): string {
  return `${OUTCOME_SAMPLER_VERSION}:${observationWindowKey(iso, bucketMs)}`;
}

export function batchMints(mints: string[], size = SAMPLER_BATCH_SIZE): string[][] {
  const unique = [...new Set(mints.map((m) => m.trim()).filter(Boolean))];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

export interface SamplerHealth {
  samplerVersion: string;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  mintsTracked: number;
  mintsDue: number;
  mintsRefreshed: number;
  mintsDelayed: number;
  batchesSent: number;
  rateLimitedCount: number;
  providerErrorCount: number;
  oldestStaleObservationAt: string | null;
}

export function emptyHealth(): SamplerHealth {
  return {
    samplerVersion: OUTCOME_SAMPLER_VERSION,
    lastRunAt: null,
    lastSuccessfulRunAt: null,
    mintsTracked: 0,
    mintsDue: 0,
    mintsRefreshed: 0,
    mintsDelayed: 0,
    batchesSent: 0,
    rateLimitedCount: 0,
    providerErrorCount: 0,
    oldestStaleObservationAt: null,
  };
}
