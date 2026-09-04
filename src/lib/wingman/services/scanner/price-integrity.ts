/**
 * Price / Launch Integrity v1 — deterministic, pure, SHADOW / CALIBRATION ONLY.
 *
 * Purpose: distinguish a constructive post-launch lifecycle (impulse → cooldown
 * → sustained trading → consolidation) from a structurally damaged one
 * (concentrated launch spike → catastrophic surrender → no meaningful
 * recovery). It is NOT a thesis score, NOT entry quality and NOT safety.
 *
 * Hard rules:
 *   - Deep drawdown ALONE can never produce DAMAGED.
 *   - Missing history is UNKNOWN. It is never DAMAGED and never zero.
 *   - Launch behaviour that was not observed is never inferred or fabricated.
 *   - This module is read by nobody in the scan pipeline: it cannot affect
 *     Quantitative Research Priority, setup qualification, Structural
 *     Eligibility, Survivor selection or outcomes.
 */

export const PRICE_INTEGRITY_POLICY_VERSION = "price_integrity/v1.1";

/** Shadow mode: evaluation is observational only. Never a veto. */
export const PRICE_INTEGRITY_SHADOW_MODE = true;

export type PriceIntegrityStatus = "HEALTHY" | "CONCERN" | "DAMAGED" | "UNKNOWN";

/**
 * CALIBRATION DEFAULTS — not universal truths. Every threshold lives here so a
 * calibration change is one versioned edit, never a scattered constant.
 */
export const PRICE_INTEGRITY_CALIBRATION = {
  version: PRICE_INTEGRITY_POLICY_VERSION,
  /** Minimum usable observations before any classification is attempted. */
  minObservations: 8,
  /** Minimum observed window (minutes) before any classification. */
  minObservedWindowMinutes: 6 * 60,
  /**
   * The early peak must be observed close enough to launch for "launch
   * integrity" to mean anything. Beyond this, launch behaviour is unobserved.
   */
  maxMinutesFromLaunchToFirstObservation: 90,
  /** Peak reached within this window of the first observation = concentrated. */
  concentratedPeakMinutes: 60,
  /** Losing this share of the peak within `rapidSurrenderMinutes` = rapid. */
  rapidSurrenderFraction: 0.7,
  rapidSurrenderMinutes: 120,
  /** Drawdown considered severe. Severe ALONE is never damage. */
  severeDrawdown: 0.85,
  /** Recovery from the post-peak low below this is "weak". */
  weakRecoveryFromLow: 0.25,
  /** Subsequent highs must improve by at least this to count as improving. */
  improvingSubsequentHigh: 0.15,
  /** Liquidity retained vs peak-era liquidity below this is poor retention. */
  poorLiquidityRetention: 0.25,
  /** Window (minutes from first observation) counted as launch-era volume. */
  earlyVolumeWindowMinutes: 6 * 60,
  /** Launch-era share of observed volume above this is concentrated (context only in v1.1). */
  concentratedEarlyVolumeShare: 0.6,
  /** Fixed short launch windows, in minutes, measured from the first observation. */
  fixedVolumeWindowsMinutes: [30, 60, 180] as number[],
  /** Window used for the launch volume RATE (USD/min). */
  launchRateWindowMinutes: 60,
  /**
   * Age-normalized concentration: launch USD/min divided by later USD/min.
   * This, not the 12h share, is what may contribute to classification.
   */
  concentratedVolumeRateRatio: 6,
  /** Volume traded within +/- this many minutes of the peak counts as peak-window volume. */
  peakVolumeWindowMinutes: 30,
  /** Peak / stabilized value above this is an extreme spike (context only). */
  extremePeakToStabilizedRatio: 15,
  /** Normalized repair: fraction of peak→low damage reclaimed. */
  repairedPeakFraction: 0.25,
  /** Below this, the reclaim of the original peak is weak (normalized). */
  weakPeakRepairFraction: 0.15,
  /** Current value at or above this fraction of the original peak = repaired. */
  repairedCurrentToPeakRatio: 0.5,
  /** A late peak this many times the pre-peak baseline is a blowoff candidate. */
  blowoffPeakToBaselineRatio: 5,
  /** Minutes before the peak used to compute the pre-peak baseline. */
  prePeakBaselineMinutes: 120,
  /** Damage requires at least this many independent damage signals. */
  minDamageSignals: 4,
  /** Concern requires at least this many. */
  minConcernSignals: 2,
} as const;

/** One observed point. Any field may be null = genuinely unavailable. */
export interface PricePoint {
  capturedAt: string;
  marketCap: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  /** Intra-interval extremes, when the source is a candle rather than a poll. */
  highPrice?: number | null;
  lowPrice?: number | null;
  /** USD volume traded during the interval, when supplied. */
  volumeUsd?: number | null;
}

export interface PriceIntegrityInput {
  /** Observations, any order. Points with no market cap and no price are unusable. */
  points: PricePoint[];
  /** Token/pair creation time (ISO), when actually known. Null = unknown. */
  launchAt: string | null;
  /** Setup context. Only changes how the result is *described*, never gated. */
  setups?: string[];
  /** Resolutions the observations came from, e.g. ["1m", "15m"]. */
  resolutions?: string[];
}

export interface PriceIntegrityCoverage {
  observations: number;
  usableObservations: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  observedWindowMinutes: number | null;
  /** Minutes between launch and Wingman's first stored observation. */
  minutesFromLaunchToFirstObservation: number | null;
  /** True only when the launch impulse itself was plausibly observed. */
  launchImpulseObserved: boolean;
  hasLiquidityHistory: boolean;
  /** Resolutions actually present in the observed history. */
  resolutions: string[];
  hasCandleHistory: boolean;
  sufficientForClassification: boolean;
  gaps: string[];
}

/** Derived features. `null` always means "not derivable from real data". */
export interface PriceIntegrityFeatures {
  earliestValue: number | null;
  peakValue: number | null;
  currentValue: number | null;
  postPeakLowValue: number | null;
  /** Peak → current, as a fraction (0.9 = 90% below peak). */
  drawdownFromPeak: number | null;
  /** Max adverse move observed across the early lifecycle. */
  maxAdverseMove: number | null;
  minutesFirstObservationToPeak: number | null;
  minutesPeakToMajorDrawdown: number | null;
  /** Recovery off the post-peak low, as a fraction of that low. */
  recoveryFromLow: number | null;
  /** Best post-collapse high vs the post-peak low. */
  subsequentHighImprovement: number | null;
  observationsAfterCollapse: number;
  minutesSustainedAfterCollapse: number | null;
  liquidityRetention: number | null;
  /** Early peak / current (stabilized) value. Never damage on its own. */
  peakToStabilizedRatio: number | null;
  /** Share of observed USD volume traded inside the 12h fetch window (context only). */
  earlyVolumeShare: number | null;
  earlyVolumeUsd: number | null;
  laterVolumeUsd: number | null;

  // --- v1.1 normalized post-collapse repair (peak-relative, never low-relative) ---
  /** Best value observed after the collapse (or after the post-peak low). */
  postCollapseMaxHigh: number | null;
  /** postCollapseMaxHigh / original peak. */
  postCollapseHighToOriginalPeakRatio: number | null;
  /** current / original peak. */
  currentToOriginalPeakRatio: number | null;
  /** (postCollapseMaxHigh − postPeakLow) / (peak − postPeakLow). */
  peakRepairFraction: number | null;

  // --- v1.1 fixed-window volume concentration (age-normalized) ---
  first30mVolumeShare: number | null;
  first1hVolumeShare: number | null;
  first3hVolumeShare: number | null;
  /** USD/min traded inside the launch rate window. */
  launchVolumeRateUsdPerMin: number | null;
  /** USD/min traded across the remaining observed lifecycle. */
  laterVolumeRateUsdPerMin: number | null;
  /** launch rate / later rate. Age-normalized, unlike a raw share. */
  launchToLaterVolumeRateRatio: number | null;
  /** Share of observed USD volume traded within ±window of the peak. */
  peakWindowVolumeShare: number | null;

  // --- v1.1 lifecycle blowoff context ---
  /** Median value in the window preceding the peak. */
  prePeakBaselineValue: number | null;
  /** peak / pre-peak baseline. */
  peakToPrePeakBaselineRatio: number | null;

  basis: "market_cap" | "price" | "none";
}

export interface PriceIntegrityEvaluation {
  status: PriceIntegrityStatus;
  policyVersion: string;
  shadowMode: boolean;
  evaluatedAt: string;
  coverage: PriceIntegrityCoverage;
  features: PriceIntegrityFeatures;
  /** Named damage signals that actually fired. Never inferred. */
  signals: string[];
  reasons: string[];
  /** Source references for the observations used. */
  sourceReferences: string[];
}

function minutesBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

const EMPTY_FEATURES: PriceIntegrityFeatures = {
  earliestValue: null,
  peakValue: null,
  currentValue: null,
  postPeakLowValue: null,
  drawdownFromPeak: null,
  maxAdverseMove: null,
  minutesFirstObservationToPeak: null,
  minutesPeakToMajorDrawdown: null,
  recoveryFromLow: null,
  subsequentHighImprovement: null,
  observationsAfterCollapse: 0,
  minutesSustainedAfterCollapse: null,
  liquidityRetention: null,
  peakToStabilizedRatio: null,
  earlyVolumeShare: null,
  earlyVolumeUsd: null,
  laterVolumeUsd: null,
  postCollapseMaxHigh: null,
  postCollapseHighToOriginalPeakRatio: null,
  currentToOriginalPeakRatio: null,
  peakRepairFraction: null,
  first30mVolumeShare: null,
  first1hVolumeShare: null,
  first3hVolumeShare: null,
  launchVolumeRateUsdPerMin: null,
  laterVolumeRateUsdPerMin: null,
  launchToLaterVolumeRateRatio: null,
  peakWindowVolumeShare: null,
  prePeakBaselineValue: null,
  peakToPrePeakBaselineRatio: null,
  basis: "none",
};

/** Coverage assessment. Pure bookkeeping — no judgement about the token. */
export function assessCoverage(input: PriceIntegrityInput): PriceIntegrityCoverage {
  const cal = PRICE_INTEGRITY_CALIBRATION;
  const sorted = [...input.points].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
  const usable = sorted.filter((p) => p.marketCap !== null || p.priceUsd !== null);
  const first = usable[0] ?? null;
  const last = usable[usable.length - 1] ?? null;

  const observedWindowMinutes =
    first && last ? minutesBetween(first.capturedAt, last.capturedAt) : null;
  const minutesFromLaunch =
    input.launchAt && first ? minutesBetween(input.launchAt, first.capturedAt) : null;
  const launchImpulseObserved =
    minutesFromLaunch !== null && minutesFromLaunch <= cal.maxMinutesFromLaunchToFirstObservation;

  const gaps: string[] = [];
  if (usable.length < cal.minObservations) {
    gaps.push(`Only ${usable.length} usable observations (need ${cal.minObservations}).`);
  }
  if (observedWindowMinutes !== null && observedWindowMinutes < cal.minObservedWindowMinutes) {
    gaps.push(`Observed window is ${Math.round(observedWindowMinutes)}m (need ${cal.minObservedWindowMinutes}m).`);
  }
  if (minutesFromLaunch === null) {
    gaps.push("Launch time unknown — launch impulse cannot be located.");
  } else if (!launchImpulseObserved) {
    gaps.push(
      `First observation is ${Math.round(minutesFromLaunch)}m after launch — the launch impulse and early peak were not observed.`,
    );
  }

  return {
    observations: sorted.length,
    usableObservations: usable.length,
    firstObservedAt: first?.capturedAt ?? null,
    lastObservedAt: last?.capturedAt ?? null,
    observedWindowMinutes,
    minutesFromLaunchToFirstObservation: minutesFromLaunch,
    launchImpulseObserved,
    hasLiquidityHistory: usable.some((p) => p.liquidityUsd !== null),
    resolutions: input.resolutions ?? [],
    hasCandleHistory: usable.some((p) => (p.highPrice ?? null) !== null),
    sufficientForClassification:
      usable.length >= cal.minObservations &&
      observedWindowMinutes !== null &&
      observedWindowMinutes >= cal.minObservedWindowMinutes &&
      launchImpulseObserved,
    gaps,
  };
}

/** Deterministic feature derivation from observed points only. */
export function deriveFeatures(input: PriceIntegrityInput): PriceIntegrityFeatures {
  const sorted = [...input.points].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
  const useMarketCap = sorted.some((p) => p.marketCap !== null);
  const basis: PriceIntegrityFeatures["basis"] = useMarketCap
    ? "market_cap"
    : sorted.some((p) => p.priceUsd !== null)
      ? "price"
      : "none";
  if (basis === "none") return { ...EMPTY_FEATURES };

  const series = sorted
    .map((p) => {
      const value = basis === "market_cap" ? p.marketCap : p.priceUsd;
      return {
        at: p.capturedAt,
        value,
        // Candle extremes reveal a wick a close-only series cannot see.
        high: p.highPrice ?? value,
        low: p.lowPrice ?? value,
        liquidity: p.liquidityUsd,
        volumeUsd: p.volumeUsd ?? null,
      };
    })
    .filter(
      (p): p is {
        at: string;
        value: number;
        high: number;
        low: number;
        liquidity: number | null;
        volumeUsd: number | null;
      } => p.value !== null,
    );

  if (series.length === 0) return { ...EMPTY_FEATURES };

  const firstPoint = series[0]!;
  const lastPoint = series[series.length - 1]!;
  let peakIndex = 0;
  for (let i = 1; i < series.length; i += 1) {
    if (series[i]!.high > series[peakIndex]!.high) peakIndex = i;
  }
  const peakPoint = series[peakIndex]!;
  const peak = { at: peakPoint.at, value: peakPoint.high, liquidity: peakPoint.liquidity };
  const after = series.slice(peakIndex + 1);

  let lowIndex = -1;
  for (let i = 0; i < after.length; i += 1) {
    if (lowIndex === -1 || after[i]!.low < after[lowIndex]!.low) lowIndex = i;
  }
  const lowPoint = lowIndex >= 0 ? after[lowIndex]! : null;
  const low = lowPoint ? { at: lowPoint.at, value: lowPoint.low } : null;

  const drawdownFromPeak = peak.value > 0 ? 1 - lastPoint.value / peak.value : null;
  const maxAdverseMove = low && peak.value > 0 ? 1 - low.value / peak.value : null;

  const majorDrawdownPoint = after.find(
    (p) => peak.value > 0 && 1 - p.value / peak.value >= PRICE_INTEGRITY_CALIBRATION.rapidSurrenderFraction,
  );

  const recoveryFromLow = low && low.value > 0 ? lastPoint.value / low.value - 1 : null;

  let subsequentHighImprovement: number | null = null;
  if (low && lowIndex >= 0) {
    const afterLow = after.slice(lowIndex + 1);
    if (afterLow.length > 0 && low.value > 0) {
      const best = afterLow.reduce((m, p) => (p.value > m ? p.value : m), afterLow[0]!.value);
      subsequentHighImprovement = best / low.value - 1;
    }
  }

  const collapseAt = majorDrawdownPoint?.at ?? null;
  const afterCollapse = collapseAt
    ? series.filter((p) => new Date(p.at).getTime() > new Date(collapseAt).getTime())
    : [];

  // Volume concentration: launch window versus the rest of the observed life.
  const windowEndMs =
    new Date(firstPoint.at).getTime() +
    PRICE_INTEGRITY_CALIBRATION.earlyVolumeWindowMinutes * 60_000;
  const volumePoints = series.filter((p) => p.volumeUsd !== null);
  let earlyVolumeUsd: number | null = null;
  let laterVolumeUsd: number | null = null;
  if (volumePoints.length > 0) {
    earlyVolumeUsd = 0;
    laterVolumeUsd = 0;
    for (const p of volumePoints) {
      if (new Date(p.at).getTime() <= windowEndMs) earlyVolumeUsd += p.volumeUsd!;
      else laterVolumeUsd += p.volumeUsd!;
    }
  }
  const totalVolume =
    earlyVolumeUsd === null || laterVolumeUsd === null ? null : earlyVolumeUsd + laterVolumeUsd;
  const earlyVolumeShare =
    totalVolume !== null && totalVolume > 0 ? (earlyVolumeUsd ?? 0) / totalVolume : null;

  const peakEraLiquidity = peak.liquidity;
  const currentLiquidity = lastPoint.liquidity;
  const liquidityRetention =
    peakEraLiquidity !== null && peakEraLiquidity > 0 && currentLiquidity !== null
      ? currentLiquidity / peakEraLiquidity
      : null;

  // --- v1.1: repair normalized against the ORIGINAL peak, never the crash low.
  // A 20x off a near-zero low is not repair; reclaiming the peak is.
  const repairWindow = collapseAt
    ? afterCollapse
    : lowIndex >= 0
      ? after.slice(lowIndex + 1)
      : [];
  const postCollapseMaxHigh =
    repairWindow.length > 0 ? repairWindow.reduce((m, p) => (p.high > m ? p.high : m), repairWindow[0]!.high) : null;
  // Sustained reclaim: the highest level actually HELD for a full window, so a
  // single bounce wick off the crash low can never read as repaired structure.
  const holdMs = PRICE_INTEGRITY_CALIBRATION.sustainedReclaimMinutes * 60_000;
  let postCollapseSustainedHigh: number | null = null;
  for (let i = 0; i < repairWindow.length; i += 1) {
    const startMs = new Date(repairWindow[i]!.at).getTime();
    let floor = repairWindow[i]!.value;
    let covered = false;
    for (let j = i; j < repairWindow.length; j += 1) {
      const t = new Date(repairWindow[j]!.at).getTime();
      if (t - startMs > holdMs) {
        covered = true;
        break;
      }
      if (repairWindow[j]!.value < floor) floor = repairWindow[j]!.value;
    }
    if (!covered) break;
    if (postCollapseSustainedHigh === null || floor > postCollapseSustainedHigh) {
      postCollapseSustainedHigh = floor;
    }
  }
  const postCollapseHighToOriginalPeakRatio =
    postCollapseMaxHigh !== null && peak.value > 0 ? postCollapseMaxHigh / peak.value : null;
  const currentToOriginalPeakRatio = peak.value > 0 ? lastPoint.value / peak.value : null;
  const damageSpan = low ? peak.value - low.value : null;
  const normalize = (v: number | null): number | null =>
    v !== null && low && damageSpan !== null && damageSpan > 0
      ? Math.max(0, Math.min(1, (v - low.value) / damageSpan))
      : null;
  const peakRepairFraction = normalize(postCollapseSustainedHigh);
  const currentRepairFraction = normalize(lastPoint.value);

  // --- v1.1: fixed short launch windows + age-normalized volume RATES.
  // The 12h high-resolution fetch window is a data strategy, not a behaviour.
  const firstMs = new Date(firstPoint.at).getTime();
  const lastMs = new Date(lastPoint.at).getTime();
  const volumeInFirst = (minutes: number): number | null => {
    if (volumePoints.length === 0) return null;
    const end = firstMs + minutes * 60_000;
    return volumePoints
      .filter((p) => new Date(p.at).getTime() <= end)
      .reduce((s, p) => s + p.volumeUsd!, 0);
  };
  const shareOfTotal = (usd: number | null): number | null =>
    usd !== null && totalVolume !== null && totalVolume > 0 ? usd / totalVolume : null;
  const first30mVolumeShare = shareOfTotal(volumeInFirst(30));
  const first1hVolumeShare = shareOfTotal(volumeInFirst(60));
  const first3hVolumeShare = shareOfTotal(volumeInFirst(180));

  const rateWindow = PRICE_INTEGRITY_CALIBRATION.launchRateWindowMinutes;
  const observedMinutes = (lastMs - firstMs) / 60_000;
  const launchUsd = volumeInFirst(rateWindow);
  const launchMinutes = Math.min(rateWindow, Math.max(1, observedMinutes));
  const laterMinutes = observedMinutes - launchMinutes;
  const launchVolumeRateUsdPerMin = launchUsd !== null ? launchUsd / launchMinutes : null;
  const laterVolumeRateUsdPerMin =
    launchUsd !== null && totalVolume !== null && laterMinutes >= 1
      ? Math.max(0, totalVolume - launchUsd) / laterMinutes
      : null;
  const launchToLaterVolumeRateRatio =
    launchVolumeRateUsdPerMin !== null &&
    laterVolumeRateUsdPerMin !== null &&
    laterVolumeRateUsdPerMin > 0
      ? launchVolumeRateUsdPerMin / laterVolumeRateUsdPerMin
      : null;

  const peakWindowMs = PRICE_INTEGRITY_CALIBRATION.peakVolumeWindowMinutes * 60_000;
  const peakMs = new Date(peak.at).getTime();
  const peakWindowUsd =
    volumePoints.length > 0
      ? volumePoints
          .filter((p) => Math.abs(new Date(p.at).getTime() - peakMs) <= peakWindowMs)
          .reduce((s, p) => s + p.volumeUsd!, 0)
      : null;
  const peakWindowVolumeShare = shareOfTotal(peakWindowUsd);

  // --- v1.1: pre-peak baseline, so a LATE blowoff is visible as a blowoff.
  const baselineStartMs = peakMs - PRICE_INTEGRITY_CALIBRATION.prePeakBaselineMinutes * 60_000;
  const baselineValues = series
    .slice(0, peakIndex)
    .filter((p) => new Date(p.at).getTime() >= baselineStartMs)
    .map((p) => p.value)
    .sort((a, b) => a - b);
  const prePeakBaselineValue =
    baselineValues.length > 0 ? baselineValues[Math.floor(baselineValues.length / 2)]! : null;
  const peakToPrePeakBaselineRatio =
    prePeakBaselineValue !== null && prePeakBaselineValue > 0
      ? peak.value / prePeakBaselineValue
      : null;

  return {
    earliestValue: firstPoint.value,
    peakValue: peak.value,
    currentValue: lastPoint.value,
    postPeakLowValue: low?.value ?? null,
    drawdownFromPeak,
    maxAdverseMove,
    minutesFirstObservationToPeak: minutesBetween(firstPoint.at, peak.at),
    minutesPeakToMajorDrawdown: majorDrawdownPoint
      ? minutesBetween(peak.at, majorDrawdownPoint.at)
      : null,
    recoveryFromLow,
    subsequentHighImprovement,
    observationsAfterCollapse: afterCollapse.length,
    minutesSustainedAfterCollapse:
      afterCollapse.length > 1
        ? minutesBetween(afterCollapse[0]!.at, afterCollapse[afterCollapse.length - 1]!.at)
        : null,
    liquidityRetention,
    peakToStabilizedRatio:
      lastPoint.value > 0 && peak.value > 0 ? peak.value / lastPoint.value : null,
    earlyVolumeShare,
    earlyVolumeUsd,
    laterVolumeUsd,
    postCollapseMaxHigh,
    postCollapseHighToOriginalPeakRatio,
    currentToOriginalPeakRatio,
    peakRepairFraction,
    first30mVolumeShare,
    first1hVolumeShare,
    first3hVolumeShare,
    launchVolumeRateUsdPerMin,
    laterVolumeRateUsdPerMin,
    launchToLaterVolumeRateRatio,
    peakWindowVolumeShare,
    prePeakBaselineValue,
    peakToPrePeakBaselineRatio,
    basis,
  };
}

/**
 * Classification. Damage requires a COMBINATION of independent signals of
 * launch distortion; drawdown alone is explicitly insufficient.
 */
export function evaluatePriceIntegrity(
  input: PriceIntegrityInput,
  now: string = new Date().toISOString(),
): PriceIntegrityEvaluation {
  const cal = PRICE_INTEGRITY_CALIBRATION;
  const coverage = assessCoverage(input);
  const features = deriveFeatures(input);
  const sourceReferences = input.points
    .map((p) => p.capturedAt)
    .sort()
    .filter((v, i, a) => a.indexOf(v) === i);

  const base = {
    policyVersion: PRICE_INTEGRITY_POLICY_VERSION,
    shadowMode: PRICE_INTEGRITY_SHADOW_MODE,
    evaluatedAt: now,
    coverage,
    features,
    sourceReferences,
  };

  if (!coverage.sufficientForClassification) {
    return {
      ...base,
      status: "UNKNOWN",
      signals: [],
      reasons: [
        "Insufficient observed history to judge launch structure.",
        ...coverage.gaps,
      ],
    };
  }

  const signals: string[] = [];
  const reasons: string[] = [];

  const concentratedPeak =
    features.minutesFirstObservationToPeak !== null &&
    features.minutesFirstObservationToPeak <= cal.concentratedPeakMinutes;
  if (concentratedPeak) {
    signals.push("CONCENTRATED_EARLY_PEAK");
    reasons.push(
      `Peak reached ${Math.round(features.minutesFirstObservationToPeak!)}m after the first observation.`,
    );
  }

  const rapidSurrender =
    features.minutesPeakToMajorDrawdown !== null &&
    features.minutesPeakToMajorDrawdown <= cal.rapidSurrenderMinutes;
  if (rapidSurrender) {
    signals.push("RAPID_SURRENDER");
    reasons.push(
      `Lost ${Math.round(cal.rapidSurrenderFraction * 100)}% of the peak within ${Math.round(features.minutesPeakToMajorDrawdown!)}m.`,
    );
  }

  const severeDrawdown =
    features.drawdownFromPeak !== null && features.drawdownFromPeak >= cal.severeDrawdown;
  if (severeDrawdown) {
    signals.push("SEVERE_DRAWDOWN");
    reasons.push(
      `Currently ${Math.round(features.drawdownFromPeak! * 100)}% below the observed peak (context only — never damage on its own).`,
    );
  }

  const weakRecovery =
    features.recoveryFromLow !== null && features.recoveryFromLow < cal.weakRecoveryFromLow;
  if (weakRecovery) {
    signals.push("WEAK_RECOVERY");
    reasons.push(
      `Recovery from the post-peak low is ${Math.round(features.recoveryFromLow! * 100)}%.`,
    );
  }

  const noImprovingStructure =
    features.subsequentHighImprovement !== null &&
    features.subsequentHighImprovement < cal.improvingSubsequentHigh;
  if (noImprovingStructure) {
    signals.push("NO_IMPROVING_STRUCTURE");
    reasons.push("Subsequent highs did not materially improve on the post-peak low.");
  }

  const poorRetention =
    features.liquidityRetention !== null &&
    features.liquidityRetention < cal.poorLiquidityRetention;
  if (poorRetention) {
    signals.push("POOR_LIQUIDITY_RETENTION");
    reasons.push(
      `Liquidity retained vs the peak era is ${Math.round(features.liquidityRetention! * 100)}%.`,
    );
  }

  const extremeSpike =
    features.peakToStabilizedRatio !== null &&
    features.peakToStabilizedRatio >= cal.extremePeakToStabilizedRatio;
  if (extremeSpike) {
    signals.push("EXTREME_PEAK_TO_STABILIZED_RATIO");
    reasons.push(
      `Early peak is ${features.peakToStabilizedRatio!.toFixed(1)}x the stabilized value (context only — never damage on its own).`,
    );
  }

  // v1.1: the 12h share is DESCRIPTIVE ONLY. It never forms a signal, because a
  // young token whose whole life sits inside 12h would otherwise be penalized.
  if (
    features.earlyVolumeShare !== null &&
    features.earlyVolumeShare >= cal.concentratedEarlyVolumeShare
  ) {
    reasons.push(
      `${Math.round(features.earlyVolumeShare! * 100)}% of observed USD volume traded inside the 12h high-resolution window (descriptive context only).`,
    );
  }

  // v1.1: age-normalized concentration. USD/min in the launch hour vs later.
  const concentratedVolume =
    features.launchToLaterVolumeRateRatio !== null &&
    features.launchToLaterVolumeRateRatio >= cal.concentratedVolumeRateRatio;
  if (concentratedVolume) {
    signals.push("LAUNCH_CONCENTRATED_VOLUME");
    reasons.push(
      `Launch-hour volume rate is ${features.launchToLaterVolumeRateRatio!.toFixed(1)}x the later-lifecycle rate (${Math.round((features.first1hVolumeShare ?? 0) * 100)}% of observed volume in the first hour).`,
    );
  }

  // v1.1: repair is measured against the ORIGINAL peak, never the crash low.
  const weakNormalizedReclaim =
    features.peakRepairFraction !== null &&
    features.peakRepairFraction < cal.weakPeakRepairFraction;
  if (weakNormalizedReclaim) {
    signals.push("WEAK_NORMALIZED_RECLAIM");
    reasons.push(
      `Only ${Math.round(features.peakRepairFraction! * 100)}% of the peak→low damage was reclaimed (normalized against the original peak).`,
    );
  }
  const repaired =
    (features.peakRepairFraction !== null &&
      features.peakRepairFraction >= cal.repairedPeakFraction) ||
    (features.currentToOriginalPeakRatio !== null &&
      features.currentToOriginalPeakRatio >= cal.repairedCurrentToPeakRatio);
  if (repaired) {
    reasons.push(
      `Structure repaired on a peak-normalized basis (reclaimed ${Math.round((features.peakRepairFraction ?? 0) * 100)}% of the damage; now ${Math.round((features.currentToOriginalPeakRatio ?? 0) * 100)}% of the original peak).`,
    );
  }

  // v1.1: blowoffs are not only a launch phenomenon.
  const lateBlowoff =
    !concentratedPeak &&
    features.peakToPrePeakBaselineRatio !== null &&
    features.peakToPrePeakBaselineRatio >= cal.blowoffPeakToBaselineRatio &&
    rapidSurrender &&
    weakNormalizedReclaim &&
    !repaired;
  if (lateBlowoff) {
    signals.push("LIFECYCLE_BLOWOFF_COLLAPSE");
    reasons.push(
      `Late-lifecycle blowoff: peak was ${features.peakToPrePeakBaselineRatio!.toFixed(1)}x the preceding baseline, surrendered rapidly and was never reclaimed.`,
    );
  }

  // Drawdown alone is never damage: damage needs distortion + failed repair.
  const contextOnly = new Set(["SEVERE_DRAWDOWN", "EXTREME_PEAK_TO_STABILIZED_RATIO"]);
  const distortionSignals = signals.filter((s) => !contextOnly.has(s));
  const hasLaunchDistortion = concentratedPeak && rapidSurrender;

  let status: PriceIntegrityStatus = "HEALTHY";
  if (
    (hasLaunchDistortion || lateBlowoff) &&
    !repaired &&
    weakNormalizedReclaim &&
    signals.length >= cal.minDamageSignals &&
    distortionSignals.length >= 3
  ) {
    status = "DAMAGED";
    reasons.unshift(
      lateBlowoff
        ? "Lifecycle blowoff, rapid surrender and no peak-normalized repair."
        : "Concentrated launch peak, rapid surrender and no peak-normalized repair.",
    );
  } else if (distortionSignals.length >= cal.minConcernSignals && !repaired) {
    status = "CONCERN";
    reasons.unshift("Some distortion evidence, but not enough to call the lifecycle damaged.");
  } else {
    reasons.unshift(
      "Observed lifecycle is consistent with constructive cooldown and consolidation.",
    );
  }

  if ((input.setups ?? []).includes("REACCEL") && status !== "HEALTHY") {
    reasons.push(
      "REACCEL context: historical launch damage is descriptive only and never invalidates a genuinely new reacceleration.",
    );
  }

  return { ...base, status, signals, reasons };
}

/**
 * UI helper: what a persisted scan-candidate row alone can say about price /
 * launch integrity. A row carries counts and ages, never a price series, so
 * this can only ever report coverage — it deliberately never classifies.
 */
export function evaluateFromCandidateRowSummary(row: {
  historySnapshotCount: number;
  ageMinutes: number | null;
  firstSeenScanAt: string | null;
  scanAt: string | null;
}): PriceIntegrityEvaluation {
  const minutesSinceFirstSeen =
    row.firstSeenScanAt && row.scanAt ? minutesBetween(row.firstSeenScanAt, row.scanAt) : null;
  const minutesFromLaunch =
    row.ageMinutes !== null && minutesSinceFirstSeen !== null
      ? Math.max(0, row.ageMinutes - minutesSinceFirstSeen)
      : null;
  const launchImpulseObserved =
    minutesFromLaunch !== null &&
    minutesFromLaunch <= PRICE_INTEGRITY_CALIBRATION.maxMinutesFromLaunchToFirstObservation;

  const gaps: string[] = [];
  if (row.historySnapshotCount < PRICE_INTEGRITY_CALIBRATION.minObservations) {
    gaps.push(
      `Only ${row.historySnapshotCount} stored observations (need ${PRICE_INTEGRITY_CALIBRATION.minObservations}).`,
    );
  }
  if (!launchImpulseObserved) {
    gaps.push(
      minutesFromLaunch === null
        ? "Launch time unknown — the launch impulse cannot be located."
        : "Wingman's first observation is well after launch, so the launch impulse and early peak were never observed.",
    );
  }

  return {
    status: "UNKNOWN",
    policyVersion: PRICE_INTEGRITY_POLICY_VERSION,
    shadowMode: PRICE_INTEGRITY_SHADOW_MODE,
    evaluatedAt: row.scanAt ?? new Date().toISOString(),
    coverage: {
      observations: row.historySnapshotCount,
      usableObservations: row.historySnapshotCount,
      firstObservedAt: row.firstSeenScanAt,
      lastObservedAt: row.scanAt,
      observedWindowMinutes: minutesSinceFirstSeen,
      minutesFromLaunchToFirstObservation: minutesFromLaunch,
      launchImpulseObserved,
      hasLiquidityHistory: false,
      resolutions: [],
      hasCandleHistory: false,
      sufficientForClassification: false,
      gaps,
    },
    features: { ...EMPTY_FEATURES },
    signals: [],
    reasons: [
      "Not classified: stored scan history does not observe launch structure.",
      ...gaps,
    ],
    sourceReferences: [],
  };
}

/** A historical candle, provider-independent. Any field may be unavailable. */
export interface IntegrityCandle {
  interval: string;
  candleTime: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volumeUsd: number | null;
}

/**
 * Map real historical candles into the evaluation input. Close is the observed
 * value, candle extremes preserve wick geometry, and nothing absent is filled.
 */
export function candlesToInput(
  candles: IntegrityCandle[],
  launchAt: string | null,
  setups: string[] = [],
): PriceIntegrityInput {
  const points: PricePoint[] = candles
    .filter((c) => c.close !== null || c.high !== null)
    .map((c) => ({
      capturedAt: c.candleTime,
      marketCap: null,
      priceUsd: c.close ?? c.high,
      liquidityUsd: null,
      highPrice: c.high,
      lowPrice: c.low,
      volumeUsd: c.volumeUsd,
    }));
  return {
    points,
    launchAt,
    setups,
    resolutions: [...new Set(candles.map((c) => c.interval))],
  };
}

/** Convenience: evaluate straight from candles. Shadow-mode like every path. */
export function evaluateFromCandles(
  candles: IntegrityCandle[],
  launchAt: string | null,
  setups: string[] = [],
  now: string = new Date().toISOString(),
): PriceIntegrityEvaluation {
  return evaluatePriceIntegrity(candlesToInput(candles, launchAt, setups), now);
}
