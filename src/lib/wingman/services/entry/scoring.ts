/**
 * Entry State v1 — deterministic component scoring (pure).
 *
 * Structure 0–3, Extension 0–3, Volume/order flow 0–2, Risk definition 0–2.
 * The four components describe TIMING only. Nothing here reads, produces or
 * modifies a Thesis Score, Evidence Confidence, position size or trade action.
 */
import {
  COARSE_UNSUPPORTED_REASON,
  CANDLE_GRADE_FEATURES,
  clampComponents,
  supportsCandleGradeClaims,
  totalEntryScore,
  type DivergenceState,
  type EntryComponentScores,
  type TimingResolution,
} from "./contracts";
import type { TimingFeatures } from "./features";

export interface EntryContext {
  liquidityUsd: number | null;
  marketCap: number | null;
  volume1h: number | null;
  volume24h: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  participationStatus: "BROAD" | "CONCENTRATED" | "EXTREME" | "UNKNOWN" | null;
  breadth: "BROAD" | "MODERATE" | "NARROW" | "UNKNOWN" | null;
  damageStatus: "PASS" | "FAIL" | "UNKNOWN";
  setups: string[];
  /** Deep Research evidence is older than this many hours (narrative timing). */
  researchAgeHours: number | null;
}

export type StructureVerdict = "CONSTRUCTIVE" | "NEUTRAL" | "DETERIORATING" | "BROKEN" | "UNKNOWN";
export type ExtensionVerdict = "RESET" | "MODERATE" | "STRETCHED" | "PARABOLIC" | "UNKNOWN";

export interface EntryScoreResult {
  components: EntryComponentScores;
  total: number;
  structureVerdict: StructureVerdict;
  extensionVerdict: ExtensionVerdict;
  confirmations: number;
  strongestPositiveSignal: string;
  strongestEntryRisk: string;
  whatWouldImproveEntry: string[];
  whatWouldBreakEntry: string[];
  evidenceGaps: string[];
  notes: string[];
  /** v1.1: resolution the score was computed under. */
  resolution: TimingResolution;
  /** v1.1: candle-grade fields ignored because the evidence is coarse. */
  unsupportedFeatures: string[];
}

const MIN_PRACTICAL_LIQUIDITY = 15_000;
const COMFORTABLE_LIQUIDITY = 60_000;

/**
 * v1.1: at COARSE resolution only broad trajectory / broad deterioration may
 * be claimed. Candle-grade structure (higher low, reclaim, compression,
 * consolidation-bar counting, lower-high sequences) carries zero weight.
 */
export function classifyStructure(
  f: TimingFeatures,
  resolution: TimingResolution = "HIGH",
): StructureVerdict {
  if (!supportsCandleGradeClaims(resolution)) {
    if (f.drawdownFromHighPct <= -70) return "DETERIORATING";
    if (f.drawdownFromHighPct <= -40) return "DETERIORATING";
    return "NEUTRAL";
  }
  if (f.lowerHighs && f.drawdownFromHighPct <= -35) return "BROKEN";
  if (f.drawdownFromHighPct <= -55 && !f.higherLow) return "BROKEN";
  if (f.lowerHighs) return "DETERIORATING";
  if (
    (f.higherLow || f.reclaimHolding) &&
    (f.consolidationBars >= 3 || (f.compressionRatio !== null && f.compressionRatio <= 0.8))
  ) {
    return "CONSTRUCTIVE";
  }
  if (f.consolidationBars >= 5 && f.drawdownFromHighPct >= -25) return "CONSTRUCTIVE";
  if (f.drawdownFromHighPct <= -40) return "DETERIORATING";
  return "NEUTRAL";
}

/** COARSE evidence may still support APPROXIMATE extension (distance from base). */
export function classifyExtension(
  f: TimingFeatures,
  context: EntryContext,
  resolution: TimingResolution = "HIGH",
): ExtensionVerdict {
  const highRes = supportsCandleGradeClaims(resolution);
  const change1h = context.priceChange1h;
  if (
    (highRes && f.verticalExpansion) ||
    (typeof change1h === "number" && change1h >= 60 && f.barsSinceHigh <= 1)
  ) {
    return "PARABOLIC";
  }
  if (f.distanceFromBasePct >= 120 && f.barsSinceHigh <= 2) return "PARABOLIC";
  if (f.distanceFromBasePct >= 60 && (!highRes || f.consolidationBars < 3)) return "STRETCHED";
  if (
    f.distanceFromBasePct <= 25 ||
    (highRes &&
      f.retracementDepthPct !== null &&
      f.retracementDepthPct >= 30 &&
      f.retracementDepthPct <= 70)
  ) {
    return "RESET";
  }
  return "MODERATE";
}

export function scoreEntry(args: {
  features: TimingFeatures;
  context: EntryContext;
  divergence: DivergenceState;
  /** v1.1 resolution firewall. Defaults to HIGH (candle-derived features). */
  resolution?: TimingResolution;
}): EntryScoreResult {
  const { features: f, context, divergence } = args;
  const resolution: TimingResolution = args.resolution ?? "HIGH";
  const highRes = supportsCandleGradeClaims(resolution);
  const unsupportedFeatures = highRes
    ? []
    : CANDLE_GRADE_FEATURES.map((k) => `${k}:${COARSE_UNSUPPORTED_REASON}`);
  const notes: string[] = [];
  const gaps: string[] = [...f.gaps];
  const improve: string[] = [];
  const breaks: string[] = [];
  if (!highRes) gaps.push("CANDLE_GRADE_FEATURES_UNSUPPORTED_AT_COARSE_RESOLUTION");

  const structureVerdict = classifyStructure(f, resolution);
  const extensionVerdict = classifyExtension(f, context, resolution);


  // ---- Structure 0–3 -------------------------------------------------
  let structure = 1;
  if (structureVerdict === "CONSTRUCTIVE") structure = 2;
  if (structureVerdict === "NEUTRAL") structure = 1.5;
  if (structureVerdict === "DETERIORATING") structure = 0.5;
  if (structureVerdict === "BROKEN") structure = 0;
  if (highRes && f.higherLow && structureVerdict === "CONSTRUCTIVE") {
    structure += 0.5;
    notes.push("Higher low in place");
  }
  if (highRes && f.reclaimHolding) {
    structure += 0.5;
    notes.push("Reclaim holding above the derived base");
  }
  if (highRes && f.compressionRatio !== null && f.compressionRatio <= 0.6) {
    structure += 0.25;
    notes.push("Range compressing versus the earlier window");
  }
  if (highRes && f.lowerHighs) breaks.push("A further lower high confirming the downtrend");
  if (!highRes) {
    notes.push("Broad trajectory only — coarse observations cannot prove candle-grade structure");
    improve.push("Candle-resolution history that can confirm or deny a higher low");
  }

  // ---- Extension 0–3 -------------------------------------------------
  let extension = 1.5;
  if (extensionVerdict === "RESET") extension = 2.5;
  if (extensionVerdict === "MODERATE") extension = 1.75;
  if (extensionVerdict === "STRETCHED") extension = 0.75;
  if (extensionVerdict === "PARABOLIC") extension = 0.25;
  if (
    highRes &&
    f.retracementDepthPct !== null &&
    f.retracementDepthPct >= 25 &&
    f.retracementDepthPct <= 65 &&
    structureVerdict !== "BROKEN"
  ) {
    extension += 0.5;
    notes.push(`Controlled ${Math.round(f.retracementDepthPct)}% retracement of the last impulse`);
  }
  if (highRes && f.consolidationBars >= 5 && extensionVerdict !== "PARABOLIC") {
    extension += 0.25;
    notes.push(`${f.consolidationBars} bars of digestion since the last expansion`);
  }
  if (extensionVerdict === "PARABOLIC" || extensionVerdict === "STRETCHED") {
    improve.push("A pullback into, or consolidation above, the recent base");
  }

  // ---- Volume / order flow 0–2 ---------------------------------------
  // v1.1: order-flow quality is judged on its OWN merits. Volume disappearing
  // is a flow failure whether or not price has already fallen — flat price on
  // dead volume is stagnation, not controlled consolidation. Low volume alone
  // still never forces BROKEN; it only lowers this component and confirmations.
  let volumeFlow = 1;
  if (f.volumeTrendRatio === null) {
    volumeFlow = 0.75;
    gaps.push("VOLUME_TREND_UNAVAILABLE");
  } else if (f.volumeTrendRatio <= 0.1) {
    volumeFlow = 0.1;
    notes.push("Trading activity has all but disappeared");
    breaks.push("Order flow staying near zero");
  } else if (f.volumeTrendRatio < 0.35) {
    volumeFlow = 0.25;
    notes.push("Order flow decaying sharply versus the earlier window");
    breaks.push("Continued volume decay");
  } else if (f.volumeTrendRatio < 0.6) {
    volumeFlow = 0.75;
  } else if (f.volumeTrendRatio >= 1.2 && f.drawdownFromHighPct >= -25) {
    volumeFlow = 1.5;
    notes.push("Participation renewing without a price blowoff");
  }
  if (
    highRes &&
    f.consolidationVolumeRatio !== null &&
    f.consolidationVolumeRatio >= 0.35 &&
    f.consolidationBars >= 3
  ) {
    volumeFlow += 0.25;
    notes.push("Participation sustained through the consolidation");
  }
  if (context.participationStatus === "EXTREME") {
    volumeFlow -= 0.5;
    notes.push("Participation reads as extremely repetitive");
  } else if (context.participationStatus === "BROAD") {
    volumeFlow += 0.25;
  } else if (context.participationStatus === null || context.participationStatus === "UNKNOWN") {
    gaps.push("PARTICIPATION_QUALITY_UNKNOWN");
  }
  if (divergence === "POSITIVE") {
    volumeFlow += 0.25;
    notes.push("Attention broadening faster than price");
  } else if (divergence === "NEGATIVE") {
    volumeFlow -= 0.25;
    notes.push("Price accelerating while participation fails to broaden");
  }
  // v1.1 divergence safety: contextual credit can never lift collapsed flow
  // back into constructive territory.
  if (f.volumeTrendRatio !== null && f.volumeTrendRatio < 0.35) {
    volumeFlow = Math.min(volumeFlow, 0.5);
  }


  // ---- Risk definition 0–2 -------------------------------------------
  let riskDefinition = 0.5;
  const liq = context.liquidityUsd;
  if (liq === null) {
    gaps.push("LIQUIDITY_UNAVAILABLE");
    riskDefinition = 0.5;
  } else if (liq >= COMFORTABLE_LIQUIDITY) riskDefinition = 1.25;
  else if (liq >= MIN_PRACTICAL_LIQUIDITY) riskDefinition = 0.9;
  else {
    riskDefinition = 0.25;
    breaks.push("Liquidity thinning further, removing any practical exit");
    improve.push("Liquidity stabilising at a level that allows a practical exit");
  }

  const hasNearbyInvalidation =
    highRes && (f.higherLow || f.consolidationBars >= 3) && f.distanceFromBasePct <= 80;
  if (hasNearbyInvalidation) {
    riskDefinition += 0.6;
    notes.push("Nearby structural level gives a coherent invalidation");
  } else {
    improve.push("A defined higher low that bounds entry risk");
  }
  if (highRes && f.realizedVolatilityPct >= 12) {
    riskDefinition -= 0.35;
    notes.push("Highly discontinuous price action widens practical risk");
  }

  const components = clampComponents({ structure, extension, volumeFlow, riskDefinition });
  const total = totalEntryScore(components);

  // Independent confirmations. Score alone never decides the state.
  let confirmations = 0;
  if (structureVerdict === "CONSTRUCTIVE") confirmations += 1;
  if (extensionVerdict === "RESET") confirmations += 1;
  if (components.volumeFlow >= 1.25) confirmations += 1;
  if (components.riskDefinition >= 1.5) confirmations += 1;
  // Divergence stays contextual: it only confirms when order flow is alive.
  if (divergence === "POSITIVE" && components.volumeFlow >= 0.75) confirmations += 1;

  if (context.damageStatus === "UNKNOWN") gaps.push("RECENT_MARKET_DAMAGE_UNKNOWN");
  if (context.researchAgeHours !== null && context.researchAgeHours > 48) {
    gaps.push("RESEARCH_EVIDENCE_OLDER_THAN_48H");
  }

  if (structureVerdict !== "CONSTRUCTIVE") {
    improve.push("Constructive consolidation or a successful retest of the recent base");
  }
  if (components.volumeFlow < 1.25) {
    improve.push("Renewed broad participation through the current range");
  }
  breaks.push("A decisive loss of the consolidation low on expanding sell volume");
  if (extensionVerdict === "RESET" || extensionVerdict === "MODERATE") {
    breaks.push("A vertical expansion away from the base that removes defined risk");
  }

  const strongestPositiveSignal =
    notes.find((n) =>
      /higher low|reclaim|compress|retracement|digestion|broadening|sustained|renewing|invalidation/i.test(n),
    ) ?? "No distinctive positive timing signal in the current window";

  const strongestEntryRisk =
    extensionVerdict === "PARABOLIC"
      ? "Entering here means chasing a fresh vertical expansion"
      : structureVerdict === "BROKEN"
        ? "Current structure has failed: lower highs and lower lows"
        : liq !== null && liq < MIN_PRACTICAL_LIQUIDITY
          ? "Market is too thin for a practical exit"
          : components.volumeFlow <= 0.5
            ? "Participation is fading while price holds up"
            : "Invalidation is further away than an ideal entry allows";

  return {
    components,
    total,
    structureVerdict,
    extensionVerdict,
    confirmations,
    strongestPositiveSignal,
    strongestEntryRisk,
    whatWouldImproveEntry: [...new Set(improve)].slice(0, 5),
    whatWouldBreakEntry: [...new Set(breaks)].slice(0, 5),
    evidenceGaps: [...new Set(gaps)],
    notes,
    resolution,
    unsupportedFeatures,
  };
}

/** Deterministic, evidence-only rationale. No trade language, no sizing. */
export function buildRationale(args: {
  state: string;
  score: EntryScoreResult;
  features: TimingFeatures;
  divergence: DivergenceState;
}): string {
  const { score, features: f, divergence } = args;
  const parts: string[] = [];
  parts.push(
    `${score.structureVerdict.toLowerCase()} structure with price ${
      f.drawdownFromHighPct < 0
        ? `${Math.abs(f.drawdownFromHighPct).toFixed(1)}% below the window high`
        : "at the window high"
    } and ${Math.abs(f.distanceFromBasePct).toFixed(0)}% ${
      f.distanceFromBasePct >= 0 ? "above" : "below"
    } the derived base`,
  );
  if (f.retracementDepthPct !== null) {
    parts.push(`${Math.round(f.retracementDepthPct)}% retracement of a ${f.impulseGainPct.toFixed(0)}% impulse`);
  }
  parts.push(
    f.volumeTrendRatio === null
      ? "volume trend unavailable"
      : `volume ${f.volumeTrendRatio >= 1 ? "expanding" : "contracting"} (${f.volumeTrendRatio.toFixed(2)}x)`,
  );
  parts.push(`price-attention divergence ${divergence}`);
  const sentence = parts.join("; ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
