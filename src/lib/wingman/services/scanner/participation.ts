/**
 * Participation Quality v1.1 — SHADOW / CALIBRATION ONLY (pure).
 *
 * v1.1 separates three independent dimensions instead of counting undifferentiated
 * "signals":
 *
 *   - participation breadth      BROAD | MODERATE | NARROW | UNKNOWN
 *   - trading repetition         NORMAL | ELEVATED | EXTREME | UNKNOWN
 *   - activity/breadth divergence NONE | PRESENT | STRONG | UNKNOWN
 *
 * The user-facing aggregate (BROAD / CONCENTRATED / EXTREME / UNKNOWN) is now
 * breadth-aware: a market with genuinely broad wallet participation can be
 * described as highly repetitive, but is never called concentrated, and can
 * never become EXTREME from repetition or divergence alone.
 *
 * Hard boundaries (unchanged):
 *   - descriptive only. Nothing here is read by Quantitative Research Priority,
 *     setup qualification, Structural Eligibility, Price Integrity, recurrence,
 *     outcomes or Survivor selection.
 *   - never asserts botting, wash trading or manipulation. The vocabulary is
 *     "repetitive trading", "narrow participant breadth", "activity/breadth
 *     divergence" and "concentrated participation".
 *   - missing wallet evidence or a provider failure is UNKNOWN, never zero.
 */
import type {
  NormalizedParticipation,
  ParticipationWindow,
  ParticipationWindowFacts,
} from "../external/birdeye/trade-data-normalizer";
import { PARTICIPATION_WINDOWS } from "../external/birdeye/trade-data-normalizer";

export { PARTICIPATION_WINDOWS };
export type { ParticipationWindow, ParticipationWindowFacts };

export const PARTICIPATION_POLICY_VERSION = "participation/v1.1";

/** Shadow build: Participation Quality has NO selection effect whatsoever. */
export const PARTICIPATION_SHADOW_MODE = true;
export const PARTICIPATION_SELECTION_EFFECT = "NONE" as const;
export const PARTICIPATION_IS_VETO = false;

/**
 * Future gate contract only — NOT active. If calibration ever justifies it,
 * EXTREME could become a temporary current-market eligibility veto under this
 * reason code. It must never become a Structural FAIL, and a token must always
 * be able to qualify again once participation broadens.
 */
export const EXTREME_REPETITIVE_PARTICIPATION = "EXTREME_REPETITIVE_PARTICIPATION";

export type ParticipationStatus = "BROAD" | "CONCENTRATED" | "EXTREME" | "UNKNOWN";
export type BreadthStatus = "BROAD" | "MODERATE" | "NARROW" | "UNKNOWN";
export type RepetitionStatus = "NORMAL" | "ELEVATED" | "EXTREME" | "UNKNOWN";
export type DivergenceStatus = "NONE" | "PRESENT" | "STRONG" | "UNKNOWN";

export interface ParticipationCalibration {
  /** trades per unique wallet — repetition of the same participants. */
  repetitionConcentrated: number;
  repetitionExtreme: number;
  /** How many windows must show repetition for it to count as persistent. */
  repetitionPersistentWindows: number;
  /** absolute unique wallets over 24h — participant breadth. */
  broadWallets24h: number;
  narrowWallets24h: number;
  veryNarrowWallets24h: number;
  /** volume per unique wallet (USD) — size concentration per participant. */
  volumePerWalletConcentrated: number;
  volumePerWalletExtreme: number;
  /** activity/breadth divergence: activity growth vs wallet growth. */
  divergenceActivityGrowthPct: number;
  divergenceWalletGrowthPct: number;
  divergenceRatio: number;
  divergenceStrongRatio: number;
  /** How many diverging windows make divergence STRONG. */
  divergenceStrongWindows: number;
  /** CONCENTRATED needs this many dimension signals (breadth excluded alone). */
  minSignalsConcentrated: number;
}

/**
 * v1.1 starting points, informed by the first live cohort (30m–24h windows on
 * BASE / REACCEL survivors). Calibration inputs, not truths.
 */
export const PARTICIPATION_CALIBRATION: ParticipationCalibration = {
  repetitionConcentrated: 3,
  repetitionExtreme: 6,
  repetitionPersistentWindows: 2,
  broadWallets24h: 600,
  narrowWallets24h: 150,
  veryNarrowWallets24h: 60,
  volumePerWalletConcentrated: 2_000,
  volumePerWalletExtreme: 8_000,
  divergenceActivityGrowthPct: 100,
  divergenceWalletGrowthPct: 25,
  divergenceRatio: 2.5,
  divergenceStrongRatio: 4,
  divergenceStrongWindows: 2,
  minSignalsConcentrated: 2,
};

export interface ParticipationWindowMetrics extends ParticipationWindowFacts {
  /** trades / unique wallets. Null when either side is unavailable. */
  tradesPerWallet: number | null;
  /** volume USD / unique wallets. Null when either side is unavailable. */
  volumeUsdPerWallet: number | null;
  /** Wallet breadth change vs the previous comparable window, in percent. */
  walletGrowthPct: number | null;
  /** Trade-count growth vs the previous comparable window, in percent. */
  tradeGrowthPct: number | null;
  /** Volume growth vs the previous comparable window, in percent. */
  volumeGrowthPct: number | null;
  /**
   * (1 + activity growth) / (1 + wallet growth). Above 1 means activity grew
   * faster than the participant base. Null when either side is unavailable.
   */
  divergenceRatio: number | null;
  /** Descriptive flag: activity accelerating while breadth is not. */
  activityBreadthDivergence: boolean;
}

export interface ParticipationDimensions {
  breadth: BreadthStatus;
  repetition: RepetitionStatus;
  divergence: DivergenceStatus;
  /** Peak unique wallets observed in the 24h window (breadth evidence). */
  uniqueWallets24h: number | null;
  /** Highest trades-per-wallet across available windows. */
  peakTradesPerWallet: number | null;
  /** Windows whose trades-per-wallet cleared the elevated threshold. */
  repetitiveWindows: ParticipationWindow[];
  /** Windows showing activity/breadth divergence. */
  divergentWindows: ParticipationWindow[];
  /** Highest divergence ratio across available windows. */
  peakDivergenceRatio: number | null;
  /** 24h USD volume per unique wallet. */
  volumeUsdPerWallet24h: number | null;
}

export interface ParticipationEvaluation {
  status: ParticipationStatus;
  /** v1.1 independent dimensions; kept alongside the aggregate. */
  dimensions: ParticipationDimensions;
  /** Human-readable combinations, e.g. "BROAD + HIGH REPETITION". */
  subSignals: string[];
  policyVersion: string;
  shadowMode: boolean;
  evaluatedAt: string;
  observedAt: string | null;
  capturedAt: string | null;
  source: string;
  sourceReference: string | null;
  holders: number | null;
  windows: Record<ParticipationWindow, ParticipationWindowMetrics> | null;
  /** Existing market context shown alongside, never a participation input. */
  context: {
    liquidityUsd: number | null;
    volumeToLiquidity24h: number | null;
    turnover24h: number | null;
  };
  signals: string[];
  reasons: string[];
  /** True when the provider supplied no usable wallet evidence. */
  evidenceMissing: boolean;
  calibration: ParticipationCalibration;
}

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** Provider change percent when supplied, else derived from current/previous. */
function growthPct(current: number | null, previous: number | null, provided: number | null) {
  if (provided !== null && Number.isFinite(provided)) return provided;
  if (current === null || previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function deriveWindowMetrics(
  facts: ParticipationWindowFacts,
  calibration: ParticipationCalibration = PARTICIPATION_CALIBRATION,
): ParticipationWindowMetrics {
  const tradesPerWallet = safeRatio(facts.trades, facts.uniqueWallets);
  const volumeUsdPerWallet = safeRatio(facts.volumeUsd, facts.uniqueWallets);
  const walletGrowthPct = growthPct(
    facts.uniqueWallets,
    facts.uniqueWalletsPrev,
    facts.uniqueWalletsChangePct,
  );
  const tradeGrowthPct = growthPct(facts.trades, facts.tradesPrev, facts.tradesChangePct);
  const volumeGrowthPct = growthPct(facts.volumeUsd, facts.volumeUsdPrev, facts.volumeChangePct);

  const activityGrowth =
    tradeGrowthPct === null && volumeGrowthPct === null
      ? null
      : Math.max(tradeGrowthPct ?? -Infinity, volumeGrowthPct ?? -Infinity);

  const divergenceRatio =
    activityGrowth === null || walletGrowthPct === null
      ? null
      : (1 + activityGrowth / 100) / Math.max(0.01, 1 + walletGrowthPct / 100);

  const activityBreadthDivergence =
    activityGrowth !== null &&
    walletGrowthPct !== null &&
    activityGrowth >= calibration.divergenceActivityGrowthPct &&
    walletGrowthPct < calibration.divergenceWalletGrowthPct &&
    (divergenceRatio ?? 0) >= calibration.divergenceRatio;

  return {
    ...facts,
    tradesPerWallet,
    volumeUsdPerWallet,
    walletGrowthPct,
    tradeGrowthPct,
    volumeGrowthPct,
    divergenceRatio,
    activityBreadthDivergence,
  };
}

export interface ParticipationContext {
  liquidityUsd?: number | null;
  volumeToLiquidity24h?: number | null;
  turnover24h?: number | null;
  evaluatedAt?: string;
  calibration?: ParticipationCalibration;
}

const UNKNOWN_DIMENSIONS: ParticipationDimensions = {
  breadth: "UNKNOWN",
  repetition: "UNKNOWN",
  divergence: "UNKNOWN",
  uniqueWallets24h: null,
  peakTradesPerWallet: null,
  repetitiveWindows: [],
  divergentWindows: [],
  peakDivergenceRatio: null,
  volumeUsdPerWallet24h: null,
};

/** No usable observation at all (provider failure, unsupported, no data). */
export function unknownParticipation(
  reason: string,
  context: ParticipationContext = {},
): ParticipationEvaluation {
  return {
    status: "UNKNOWN",
    dimensions: { ...UNKNOWN_DIMENSIONS },
    subSignals: [],
    policyVersion: PARTICIPATION_POLICY_VERSION,
    shadowMode: PARTICIPATION_SHADOW_MODE,
    evaluatedAt: context.evaluatedAt ?? new Date().toISOString(),
    observedAt: null,
    capturedAt: null,
    source: "birdeye",
    sourceReference: null,
    holders: null,
    windows: null,
    context: {
      liquidityUsd: context.liquidityUsd ?? null,
      volumeToLiquidity24h: context.volumeToLiquidity24h ?? null,
      turnover24h: context.turnover24h ?? null,
    },
    signals: [],
    reasons: [reason],
    evidenceMissing: true,
    calibration: context.calibration ?? PARTICIPATION_CALIBRATION,
  };
}

/** Participant breadth from real unique-wallet counts. Never inferred. */
export function classifyBreadth(
  wallets24h: number | null,
  cal: ParticipationCalibration = PARTICIPATION_CALIBRATION,
): BreadthStatus {
  if (wallets24h === null || !Number.isFinite(wallets24h)) return "UNKNOWN";
  if (wallets24h >= cal.broadWallets24h) return "BROAD";
  if (wallets24h > cal.narrowWallets24h) return "MODERATE";
  return "NARROW";
}

export function evaluateParticipation(
  observation: NormalizedParticipation,
  context: ParticipationContext = {},
): ParticipationEvaluation {
  const cal = context.calibration ?? PARTICIPATION_CALIBRATION;
  const windows = {} as Record<ParticipationWindow, ParticipationWindowMetrics>;
  for (const window of PARTICIPATION_WINDOWS) {
    windows[window] = deriveWindowMetrics(observation.windows[window], cal);
  }

  const base: ParticipationEvaluation = {
    status: "UNKNOWN",
    dimensions: { ...UNKNOWN_DIMENSIONS },
    subSignals: [],
    policyVersion: PARTICIPATION_POLICY_VERSION,
    shadowMode: PARTICIPATION_SHADOW_MODE,
    evaluatedAt: context.evaluatedAt ?? new Date().toISOString(),
    observedAt: observation.observedAt,
    capturedAt: observation.capturedAt,
    source: observation.source,
    sourceReference: observation.sourceReference,
    holders: observation.holders,
    windows,
    context: {
      liquidityUsd: context.liquidityUsd ?? null,
      volumeToLiquidity24h: context.volumeToLiquidity24h ?? null,
      turnover24h: context.turnover24h ?? null,
    },
    signals: [],
    reasons: [],
    evidenceMissing: false,
    calibration: cal,
  };

  // Wallet breadth is the whole point of the layer. Without it there is no
  // participation judgement to make — trades and volume alone say nothing.
  const walletWindows = PARTICIPATION_WINDOWS.filter(
    (w) => windows[w].uniqueWallets !== null && windows[w].trades !== null,
  );
  if (walletWindows.length === 0) {
    return {
      ...base,
      evidenceMissing: true,
      reasons: ["NO_UNIQUE_WALLET_EVIDENCE"],
    };
  }

  const signals: string[] = [];
  const reasons: string[] = [];

  // ── Dimension 1: participation breadth ────────────────────────────────────
  const wallets24h = windows["24h"].uniqueWallets;
  const breadth = classifyBreadth(wallets24h, cal);
  if (breadth === "NARROW" && wallets24h !== null) {
    if (wallets24h <= cal.veryNarrowWallets24h) {
      signals.push("VERY_NARROW_PARTICIPANT_BREADTH");
      reasons.push(
        `Narrow participant breadth: ${wallets24h} unique wallets over 24h (threshold ${cal.veryNarrowWallets24h}).`,
      );
    } else {
      signals.push("NARROW_PARTICIPANT_BREADTH");
      reasons.push(
        `Limited participant breadth: ${wallets24h} unique wallets over 24h (threshold ${cal.narrowWallets24h}).`,
      );
    }
  } else if (breadth === "BROAD" && wallets24h !== null) {
    reasons.push(`Broad participation: ${wallets24h} unique wallets over 24h.`);
  }

  // ── Dimension 2: trading repetition ───────────────────────────────────────
  const repetitiveWindows = walletWindows.filter(
    (w) => (windows[w].tradesPerWallet ?? 0) >= cal.repetitionConcentrated,
  );
  const extremeRepetitionWindows = walletWindows.filter(
    (w) => (windows[w].tradesPerWallet ?? 0) >= cal.repetitionExtreme,
  );
  const peakTradesPerWallet = walletWindows.reduce<number | null>((peak, w) => {
    const v = windows[w].tradesPerWallet;
    if (v === null) return peak;
    return peak === null || v > peak ? v : peak;
  }, null);

  let repetition: RepetitionStatus = "NORMAL";
  if (
    extremeRepetitionWindows.length >= cal.repetitionPersistentWindows ||
    (extremeRepetitionWindows.length > 0 && walletWindows.length < cal.repetitionPersistentWindows)
  ) {
    repetition = "EXTREME";
    signals.push("EXTREME_TRADE_REPETITION");
    reasons.push(
      `Repetitive trading: ${extremeRepetitionWindows
        .map((w) => `${w} ${windows[w].tradesPerWallet!.toFixed(1)} trades/wallet`)
        .join(", ")} (threshold ${cal.repetitionExtreme}).`,
    );
  } else if (repetitiveWindows.length > 0) {
    repetition = "ELEVATED";
    signals.push("ELEVATED_TRADE_REPETITION");
    reasons.push(
      `Elevated trade repetition: ${repetitiveWindows
        .map((w) => `${w} ${windows[w].tradesPerWallet!.toFixed(1)} trades/wallet`)
        .join(", ")} (threshold ${cal.repetitionConcentrated}).`,
    );
  }

  // Size concentration per participant, reported as a repetition-adjacent
  // signal but only meaningful when breadth is not broad.
  const volumePerWallet24h = windows["24h"].volumeUsdPerWallet;
  if (volumePerWallet24h !== null && breadth !== "BROAD") {
    if (volumePerWallet24h >= cal.volumePerWalletExtreme) {
      signals.push("EXTREME_VOLUME_PER_PARTICIPANT");
      reasons.push(
        `Concentrated participation: $${Math.round(volumePerWallet24h).toLocaleString()} 24h volume per unique wallet.`,
      );
    } else if (volumePerWallet24h >= cal.volumePerWalletConcentrated) {
      signals.push("ELEVATED_VOLUME_PER_PARTICIPANT");
      reasons.push(
        `Elevated volume per participant: $${Math.round(volumePerWallet24h).toLocaleString()} 24h volume per unique wallet.`,
      );
    }
  }

  // ── Dimension 3: activity / breadth divergence ────────────────────────────
  const divergentWindows = walletWindows.filter((w) => windows[w].activityBreadthDivergence);
  const peakDivergenceRatio = walletWindows.reduce<number | null>((peak, w) => {
    const v = windows[w].divergenceRatio;
    if (v === null) return peak;
    return peak === null || v > peak ? v : peak;
  }, null);
  const measurableDivergence = walletWindows.some((w) => windows[w].divergenceRatio !== null);

  let divergence: DivergenceStatus = measurableDivergence ? "NONE" : "UNKNOWN";
  if (divergentWindows.length > 0) {
    const strong =
      divergentWindows.length >= cal.divergenceStrongWindows ||
      (peakDivergenceRatio ?? 0) >= cal.divergenceStrongRatio;
    divergence = strong ? "STRONG" : "PRESENT";
    signals.push("ACTIVITY_BREADTH_DIVERGENCE");
    reasons.push(
      `Activity/breadth divergence in ${divergentWindows.join(", ")}: trades/volume accelerating while unique wallets are not expanding proportionally.`,
    );
  }

  const dimensions: ParticipationDimensions = {
    breadth,
    repetition,
    divergence,
    uniqueWallets24h: wallets24h,
    peakTradesPerWallet,
    repetitiveWindows,
    divergentWindows,
    peakDivergenceRatio,
    volumeUsdPerWallet24h: volumePerWallet24h,
  };

  // ── Aggregate, breadth-aware ──────────────────────────────────────────────
  // EXTREME requires the full conjunction: deficient breadth AND unusually
  // repetitive trading AND strong divergence. No single dimension can reach it.
  let status: ParticipationStatus;
  if (breadth === "UNKNOWN") {
    status = "UNKNOWN";
  } else if (breadth === "NARROW" && repetition === "EXTREME" && divergence === "STRONG") {
    status = "EXTREME";
  } else if (breadth === "BROAD") {
    // Genuinely broad participation is never described as concentrated. The
    // repetition/divergence sub-signals stay visible for later analysis.
    status = "BROAD";
  } else {
    const concentrationSignals =
      (breadth === "NARROW" ? 1 : 0) +
      (repetition === "ELEVATED" || repetition === "EXTREME" ? 1 : 0) +
      (divergence === "PRESENT" || divergence === "STRONG" ? 1 : 0) +
      (signals.includes("EXTREME_VOLUME_PER_PARTICIPANT") ||
      signals.includes("ELEVATED_VOLUME_PER_PARTICIPANT")
        ? 1
        : 0);
    status = concentrationSignals >= cal.minSignalsConcentrated ? "CONCENTRATED" : "BROAD";
  }

  const subSignals = buildSubSignals(dimensions);

  if (status === "BROAD" && reasons.length === 0) {
    reasons.push("No repetitive-trading or narrow-breadth pattern observed in the sampled windows.");
  }

  return { ...base, status, dimensions, subSignals, signals, reasons };
}

/** Diagnostic combinations — preserved even when the aggregate is BROAD. */
export function buildSubSignals(d: ParticipationDimensions): string[] {
  const out: string[] = [];
  const breadthLabel =
    d.breadth === "BROAD"
      ? "BROAD"
      : d.breadth === "MODERATE"
        ? "MODERATE"
        : d.breadth === "NARROW"
          ? "NARROW"
          : null;
  if (!breadthLabel) return out;
  if (d.repetition === "ELEVATED" || d.repetition === "EXTREME") {
    out.push(`${breadthLabel} + HIGH REPETITION`);
  }
  if (d.divergence === "STRONG") out.push(`${breadthLabel} + STRONG DIVERGENCE`);
  else if (d.divergence === "PRESENT") out.push(`${breadthLabel} + DIVERGENCE`);
  if (
    d.breadth === "NARROW" &&
    d.repetition === "EXTREME" &&
    (d.divergence === "STRONG" || d.divergence === "PRESENT")
  ) {
    out.push("NARROW + REPETITIVE + DIVERGENT");
  }
  return out;
}

/** Shadow mode: every status remains fully eligible for Survivor selection. */
export function isParticipationEligible(_status: ParticipationStatus | null): boolean {
  return true;
}
