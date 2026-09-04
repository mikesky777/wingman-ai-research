/**
 * Participation Quality v1 — SHADOW / CALIBRATION ONLY (pure).
 *
 * Measures how repetitive observed trading is relative to how many distinct
 * wallets produced it, and whether activity is accelerating while participant
 * breadth is not.
 *
 * Hard boundaries:
 *   - descriptive only. Nothing here is read by Quantitative Research Priority,
 *     setup qualification, Structural Eligibility, Price Integrity, recurrence,
 *     outcomes or Survivor selection.
 *   - never asserts botting, wash trading or manipulation. The vocabulary is
 *     "repetitive trading", "narrow participant breadth", "activity/breadth
 *     divergence" and "concentrated participation".
 *   - no single metric can produce a status. High trades, high volume or a low
 *     wallet count on their own are ordinary market facts.
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

export const PARTICIPATION_POLICY_VERSION = "participation/v1";

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

export interface ParticipationCalibration {
  /** trades per unique wallet — repetition of the same participants. */
  repetitionConcentrated: number;
  repetitionExtreme: number;
  /** absolute unique wallets over 24h — participant breadth. */
  narrowWallets24h: number;
  veryNarrowWallets24h: number;
  /** volume per unique wallet (USD) — size concentration per participant. */
  volumePerWalletConcentrated: number;
  volumePerWalletExtreme: number;
  /** activity/breadth divergence: activity growth vs wallet growth. */
  divergenceActivityGrowthPct: number;
  divergenceWalletGrowthPct: number;
  divergenceRatio: number;
  /** How many independent signals are required for each status. */
  minSignalsConcentrated: number;
  minSignalsExtreme: number;
  /** EXTREME additionally requires repetition AND (breadth or divergence). */
  extremeRequiresRepetition: boolean;
}

/**
 * v1 starting points. These are calibration inputs, not truths: they are meant
 * to be revised from observed cohort distributions, never tuned to force a
 * specific token into a specific label.
 */
export const PARTICIPATION_CALIBRATION: ParticipationCalibration = {
  repetitionConcentrated: 3,
  repetitionExtreme: 6,
  narrowWallets24h: 150,
  veryNarrowWallets24h: 60,
  volumePerWalletConcentrated: 2_000,
  volumePerWalletExtreme: 8_000,
  divergenceActivityGrowthPct: 100,
  divergenceWalletGrowthPct: 25,
  divergenceRatio: 2.5,
  minSignalsConcentrated: 2,
  minSignalsExtreme: 3,
  extremeRequiresRepetition: true,
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

export interface ParticipationEvaluation {
  status: ParticipationStatus;
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

/** No usable observation at all (provider failure, unsupported, no data). */
export function unknownParticipation(
  reason: string,
  context: ParticipationContext = {},
): ParticipationEvaluation {
  return {
    status: "UNKNOWN",
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

  // 1. Repetition — the same participants trading repeatedly.
  const repetitionWindows = walletWindows.filter(
    (w) => (windows[w].tradesPerWallet ?? 0) >= cal.repetitionConcentrated,
  );
  const extremeRepetition = walletWindows.filter(
    (w) => (windows[w].tradesPerWallet ?? 0) >= cal.repetitionExtreme,
  );
  if (extremeRepetition.length > 0) {
    signals.push("EXTREME_TRADE_REPETITION");
    reasons.push(
      `Repetitive trading: ${extremeRepetition
        .map((w) => `${w} ${windows[w].tradesPerWallet!.toFixed(1)} trades/wallet`)
        .join(", ")} (threshold ${cal.repetitionExtreme}).`,
    );
  } else if (repetitionWindows.length > 0) {
    signals.push("ELEVATED_TRADE_REPETITION");
    reasons.push(
      `Elevated trade repetition: ${repetitionWindows
        .map((w) => `${w} ${windows[w].tradesPerWallet!.toFixed(1)} trades/wallet`)
        .join(", ")} (threshold ${cal.repetitionConcentrated}).`,
    );
  }
  const hasRepetition = signals.some((s) => s.endsWith("TRADE_REPETITION"));

  // 2. Participant breadth — how many distinct wallets exist at all.
  const wallets24h = windows["24h"].uniqueWallets;
  if (wallets24h !== null) {
    if (wallets24h <= cal.veryNarrowWallets24h) {
      signals.push("VERY_NARROW_PARTICIPANT_BREADTH");
      reasons.push(
        `Narrow participant breadth: ${wallets24h} unique wallets over 24h (threshold ${cal.veryNarrowWallets24h}).`,
      );
    } else if (wallets24h <= cal.narrowWallets24h) {
      signals.push("NARROW_PARTICIPANT_BREADTH");
      reasons.push(
        `Limited participant breadth: ${wallets24h} unique wallets over 24h (threshold ${cal.narrowWallets24h}).`,
      );
    }
  }

  // 3. Volume per participant — size concentrated in few hands.
  const volumePerWallet24h = windows["24h"].volumeUsdPerWallet;
  if (volumePerWallet24h !== null) {
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

  // 4. Activity / breadth divergence — activity accelerating without new wallets.
  const divergentWindows = walletWindows.filter((w) => windows[w].activityBreadthDivergence);
  if (divergentWindows.length > 0) {
    signals.push("ACTIVITY_BREADTH_DIVERGENCE");
    reasons.push(
      `Activity/breadth divergence in ${divergentWindows.join(", ")}: trades/volume accelerating while unique wallets are not expanding proportionally.`,
    );
  }
  const hasBreadthOrDivergence = signals.some(
    (s) => s.includes("PARTICIPANT_BREADTH") || s === "ACTIVITY_BREADTH_DIVERGENCE",
  );

  let status: ParticipationStatus = "BROAD";
  if (
    signals.length >= cal.minSignalsExtreme &&
    (!cal.extremeRequiresRepetition || hasRepetition) &&
    hasBreadthOrDivergence
  ) {
    status = "EXTREME";
  } else if (signals.length >= cal.minSignalsConcentrated) {
    status = "CONCENTRATED";
  }

  if (status === "BROAD" && reasons.length === 0) {
    reasons.push("No repetitive-trading or narrow-breadth pattern observed in the sampled windows.");
  }

  return { ...base, status, signals, reasons };
}

/** Shadow mode: every status remains fully eligible for Survivor selection. */
export function isParticipationEligible(_status: ParticipationStatus | null): boolean {
  return true;
}
