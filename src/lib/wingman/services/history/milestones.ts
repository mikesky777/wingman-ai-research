/**
 * Funnel-stage milestones (pure, immutable).
 *
 * A milestone records the FIRST time an exact mint entered a meaningful
 * Wingman funnel stage. It is append-only: once a stage entry exists it is
 * never rewritten, even if the token later leaves and re-enters the stage.
 *
 * Nothing here participates in scanner selection, setup qualification,
 * Quantitative Research Priority, or any eligibility gate. Historical
 * scan_candidates rows and existing outcome baselines are never mutated.
 *
 * Provenance is never fabricated: a field with no authoritative source stays
 * null. AI_SHORTLIST / THESIS_CALL exist as stages but are created only by
 * future AI triage and thesis synthesis, never by this module.
 */
import type { CohortToken, Stat } from "./cohort";
import { mean, median, validValues } from "./cohort";
import { CURRENT_POLICY_EPOCH, SELECTION_POLICY_VERSION, type PolicyEpoch } from "./policy-epochs";
import {
  assessMarketValidity,
  isMetricUsable,
  type MarketValidityAssessment,
  type OutcomeMarketValidity,
} from "../outcomes/market-validity";

export const FUNNEL_STAGES = [
  "SETUP_QUALIFIED",
  "SURVIVOR",
  "AI_SHORTLIST",
  "THESIS_CALL",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** Stages that carry real persisted data today. */
export const IMPLEMENTED_STAGES: FunnelStage[] = ["SETUP_QUALIFIED", "SURVIVOR"];

/** Stages reserved for future AI work — no records are ever created here. */
export const FUTURE_STAGES: FunnelStage[] = ["AI_SHORTLIST", "THESIS_CALL"];

export type MilestoneSourceType = "SCANNER" | "AI_TRIAGE" | "THESIS_SYNTHESIS" | "BACKFILL";

/** Setups that can qualify a token for SETUP_QUALIFIED. NONE never qualifies. */
export const QUALIFYING_SETUPS = ["BASE", "REACCEL"] as const;
export type QualifyingSetup = (typeof QUALIFYING_SETUPS)[number];

export const MILESTONE_VERSION = "stage_milestone/v1";

/** Everything needed to reconstruct what caused a stage entry. */
export interface StageProvenance {
  sourceType: MilestoneSourceType;
  /** Scanner run, AI triage run or thesis run id — whichever applies. */
  sourceId: string | null;
  sourceRef: string | null;
  sourceScanId: string | null;
  researchPacketId: string | null;
  researchPacketVersion: string | null;
  researchRunId: string | null;
  researchReportId: string | null;
  policyVersion: string | null;
  milestoneVersion: string;
}

export function emptyProvenance(sourceType: MilestoneSourceType): StageProvenance {
  return {
    sourceType,
    sourceId: null,
    sourceRef: null,
    sourceScanId: null,
    researchPacketId: null,
    researchPacketVersion: null,
    researchRunId: null,
    researchReportId: null,
    policyVersion: null,
    milestoneVersion: MILESTONE_VERSION,
  };
}

/**
 * Setup dimension of a milestone.
 *
 * SETUP_QUALIFIED is measured per setup: BASE and REACCEL can first occur at
 * different times and market states, so each keeps its OWN frozen baseline.
 * Every other stage is one first entry per mint and uses "ALL".
 */
export type MilestoneSetupKey = "ALL" | QualifyingSetup;

/** A frozen first entry into one funnel stage (per setup where applicable). */
export interface StageMilestone {
  tokenId: string;
  contractAddress: string;
  chain: string;
  stage: FunnelStage;
  setupKey: MilestoneSetupKey;
  firstEnteredAt: string;
  setupAtEntry: string | null;
  firstSetup: QualifyingSetup | null;
  firstBaseAt: string | null;
  firstReaccelAt: string | null;
  marketCapAtEntry: number | null;
  priceAtEntry: number | null;
  liquidityAtEntry: number | null;
  quantitativePriorityAtEntry: number | null;
  /** True when market cap + price are both present, so outcomes are derivable. */
  baselineComplete: boolean;
  /** Policy era that was actually live at this event. Frozen, never recomputed. */
  policyEpoch: PolicyEpoch;
  selectionPolicyVersion: string | null;
  aiPolicyVersion: string | null;
  researchModelVersion: string | null;
  /** Exact moment of the event (same instant as firstEnteredAt for scans). */
  selectedAt: string | null;
  provenance: StageProvenance;
}

/** Policy stamp applied to a milestone created by the CURRENT scanner policy. */
export function currentPolicyStamp(selectedAt: string | null) {
  return {
    policyEpoch: CURRENT_POLICY_EPOCH,
    selectionPolicyVersion: SELECTION_POLICY_VERSION,
    aiPolicyVersion: null,
    researchModelVersion: null,
    selectedAt,
  } as const;
}

/** One persisted scanner appearance of an exact mint in a COMPLETED scan. */
export interface StageAppearance {
  scanRunId: string;
  completedAt: string;
  setups: string[];
  marketCap: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  quantitativePriority: number | null;
  survivor: boolean;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const byTime = (a: StageAppearance, b: StageAppearance) =>
  Date.parse(a.completedAt) - Date.parse(b.completedAt);

function qualifyingSetups(appearance: StageAppearance): QualifyingSetup[] {
  return QUALIFYING_SETUPS.filter((s) => appearance.setups.includes(s));
}

/**
 * ONE setup-specific first qualification. The baseline is the market state of
 * the earliest completed scan where this exact mint carried this exact setup —
 * a later BASE entry never measures from an earlier REACCEL entry, or vice
 * versa. NONE and unrecognized tags never qualify.
 */
export function deriveSetupMilestone(
  identity: { tokenId: string; contractAddress: string; chain?: string },
  appearances: StageAppearance[],
  setup: QualifyingSetup,
): StageMilestone | null {
  const ordered = [...appearances].sort(byTime);
  const first = ordered.find((a) => a.setups.includes(setup));
  if (!first) return null;

  const firstBase = ordered.find((a) => a.setups.includes("BASE")) ?? null;
  const firstReaccel = ordered.find((a) => a.setups.includes("REACCEL")) ?? null;

  return {
    tokenId: identity.tokenId,
    contractAddress: identity.contractAddress,
    chain: identity.chain ?? "solana",
    stage: "SETUP_QUALIFIED",
    setupKey: setup,
    firstEnteredAt: first.completedAt,
    setupAtEntry: qualifyingSetups(first).join("+") || setup,
    firstSetup: setup,
    firstBaseAt: firstBase?.completedAt ?? null,
    firstReaccelAt: firstReaccel?.completedAt ?? null,
    marketCapAtEntry: isNum(first.marketCap) ? first.marketCap : null,
    priceAtEntry: isNum(first.priceUsd) ? first.priceUsd : null,
    liquidityAtEntry: isNum(first.liquidityUsd) ? first.liquidityUsd : null,
    quantitativePriorityAtEntry: isNum(first.quantitativePriority)
      ? first.quantitativePriority
      : null,
    baselineComplete: isNum(first.marketCap) && isNum(first.priceUsd),
    policyEpoch: "UNKNOWN_POLICY",
    selectionPolicyVersion: null,
    aiPolicyVersion: null,
    researchModelVersion: null,
    selectedAt: first.completedAt,
    provenance: {
      ...emptyProvenance("SCANNER"),
      sourceId: first.scanRunId,
      sourceScanId: first.scanRunId,
      sourceRef: `scan_runs:${first.scanRunId}`,
    },
  };
}

/** Every setup-specific SETUP_QUALIFIED milestone this mint has earned. */
export function deriveSetupQualifiedMilestones(
  identity: { tokenId: string; contractAddress: string; chain?: string },
  appearances: StageAppearance[],
): StageMilestone[] {
  return QUALIFYING_SETUPS.map((setup) => deriveSetupMilestone(identity, appearances, setup)).filter(
    (m): m is StageMilestone => m !== null,
  );
}


/** The existing frozen First Call record, exactly as outcome tracking stores it. */
export interface FirstCallRecord {
  tokenId: string;
  contractAddress: string | null;
  firstCallAt: string | null;
  firstCallScanId: string | null;
  firstCallMarketCap: number | null;
  firstCallPriceUsd: number | null;
}

/**
 * SURVIVOR milestone == the existing frozen First Call. The baseline is copied
 * verbatim from outcome data; nothing new is computed, so the milestone can
 * never disagree with the authoritative record.
 */
export function deriveSurvivorMilestone(
  record: FirstCallRecord,
  callAppearance?: StageAppearance | null,
): StageMilestone | null {
  if (!record.firstCallAt || !record.contractAddress) return null;
  const setups = callAppearance ? qualifyingSetups(callAppearance) : [];
  return {
    tokenId: record.tokenId,
    contractAddress: record.contractAddress,
    chain: "solana",
    stage: "SURVIVOR",
    setupKey: "ALL",
    firstEnteredAt: record.firstCallAt,
    setupAtEntry: callAppearance ? (callAppearance.setups.join("+") || "NONE") : null,
    firstSetup: setups[0] ?? null,
    firstBaseAt: null,
    firstReaccelAt: null,
    marketCapAtEntry: isNum(record.firstCallMarketCap) ? record.firstCallMarketCap : null,
    priceAtEntry: isNum(record.firstCallPriceUsd) ? record.firstCallPriceUsd : null,
    liquidityAtEntry: isNum(callAppearance?.liquidityUsd) ? callAppearance!.liquidityUsd : null,
    quantitativePriorityAtEntry: isNum(callAppearance?.quantitativePriority)
      ? callAppearance!.quantitativePriority
      : null,
    baselineComplete: isNum(record.firstCallMarketCap) && isNum(record.firstCallPriceUsd),
    policyEpoch: "UNKNOWN_POLICY",
    selectionPolicyVersion: null,
    aiPolicyVersion: null,
    researchModelVersion: null,
    selectedAt: record.firstCallAt,
    provenance: {
      ...emptyProvenance("SCANNER"),
      sourceId: record.firstCallScanId,
      sourceScanId: record.firstCallScanId,
      sourceRef: record.firstCallScanId ? `scan_runs:${record.firstCallScanId}` : null,
    },
  };
}

/** Insert-once semantics: an existing milestone always wins. */
export function keepFirstMilestone(
  existing: StageMilestone | null | undefined,
  candidate: StageMilestone | null,
): StageMilestone | null {
  return existing ?? candidate ?? null;
}

/* ------------------------------------------------------------------ */
/* Stage read model                                                    */
/* ------------------------------------------------------------------ */

/** One token inside one stage cohort (per setup for SETUP_QUALIFIED). */
export interface StageRow {
  tokenId: string;
  contractAddress: string | null;
  name: string;
  symbol: string;
  stage: FunnelStage;
  /** Which frozen baseline this row measures from: BASE, REACCEL or ALL. */
  setupKey: MilestoneSetupKey;
  /** Setup(s) recorded at stage entry. */
  setups: string[];
  enteredAt: string | null;
  entryMarketCap: number | null;
  entryPriceUsd: number | null;
  entryLiquidityUsd: number | null;
  /** Persisted market-cap change since the frozen stage baseline, when known. */
  sincePct: number | null;
  peakPct: number | null;
  maxAdversePct: number | null;
  drawdownPct: number | null;
  currentMarketCap: number | null;
  currentPriceUsd: number | null;
  currentObservedAt: string | null;
  scanMarketCap: number | null;
  scanLiquidityUsd: number | null;
  scanVolume24h: number | null;
  priceIntegrityStatus: string | null;
  structuralStatus: string | null;
  participationStatus: string | null;
  dexPairAddress: string | null;
  observationCount: number;
  latestObservationAt: string | null;
  latestRecurrenceState: string | null;
  provenance: StageProvenance | null;
  baselineComplete: boolean;
  /** Policy era frozen at stage entry. */
  policyEpoch: PolicyEpoch;
  selectionPolicyVersion: string | null;
}

/** Stage-appropriate wording. Survivor metrics are never called thesis returns. */
export const STAGE_TERMS: Record<FunnelStage, { title: string; since: string; peak: string; entry: string; maxDd: string }> = {
  SETUP_QUALIFIED: {
    title: "Setup Qualified",
    since: "Since setup",
    peak: "Peak since setup",
    entry: "MC @ setup",
    maxDd: "Max DD since setup",
  },
  SURVIVOR: {
    title: "Survivors",
    since: "Since survivor",
    peak: "Peak since survivor",
    entry: "MC @ survivor",
    maxDd: "Max DD since survivor",
  },
  AI_SHORTLIST: {
    title: "AI Shortlist",
    since: "Since shortlist",
    peak: "Peak since shortlist",
    entry: "MC @ shortlist",
    maxDd: "Max DD since shortlist",
  },
  THESIS_CALL: {
    title: "Thesis Calls",
    since: "Since thesis call",
    peak: "Peak since thesis call",
    entry: "MC @ thesis call",
    maxDd: "Max DD since thesis call",
  },
};

/** Adapter: the existing First Survivor cohort expressed as stage rows. */
export function survivorRowFromCohortToken(
  token: CohortToken,
  provenance?: StageProvenance | null,
  policy?: { policyEpoch: PolicyEpoch; selectionPolicyVersion: string | null } | null,
): StageRow {
  return {
    tokenId: token.tokenId,
    contractAddress: token.contractAddress,
    name: token.name,
    symbol: token.symbol,
    stage: "SURVIVOR",
    setupKey: "ALL",
    setups: token.setups,
    enteredAt: token.firstCallAt,
    entryMarketCap: token.firstCallMarketCap,
    entryPriceUsd: token.firstCallPriceUsd,
    entryLiquidityUsd: token.scanLiquidityUsd,
    sincePct: token.sinceCallPct,
    peakPct: token.peakSinceCallPct,
    maxAdversePct: token.maxAdverseSinceCallPct,
    drawdownPct: token.drawdownSinceCallPct,
    currentMarketCap: token.currentMarketCap,
    currentPriceUsd: token.currentPriceUsd,
    currentObservedAt: token.currentObservedAt,
    scanMarketCap: token.scanMarketCap,
    scanLiquidityUsd: token.scanLiquidityUsd,
    scanVolume24h: token.scanVolume24h,
    priceIntegrityStatus: token.priceIntegrityStatus,
    structuralStatus: token.structuralStatus,
    participationStatus: token.participationStatus,
    dexPairAddress: token.dexPairAddress,
    observationCount: token.observationCount,
    latestObservationAt: token.latestObservationAt,
    latestRecurrenceState: token.latestRecurrenceState,
    provenance: provenance ?? null,
    baselineComplete: token.firstCallMarketCap !== null,
    policyEpoch: policy?.policyEpoch ?? "UNKNOWN_POLICY",
    selectionPolicyVersion: policy?.selectionPolicyVersion ?? null,
  };
}

/**
 * One row per token. Used for headline unique-token counts only — it never
 * merges two setup-specific baselines into one measurement, because callers
 * filter to a single setup before measuring. The EARLIEST entry wins.
 */
export function uniqueStageRows(rows: StageRow[]): StageRow[] {
  const byId = new Map<string, StageRow>();
  for (const row of rows) {
    const prior = byId.get(row.tokenId);
    if (!prior) {
      byId.set(row.tokenId, row);
      continue;
    }
    const a = prior.enteredAt ? Date.parse(prior.enteredAt) : Number.POSITIVE_INFINITY;
    const b = row.enteredAt ? Date.parse(row.enteredAt) : Number.POSITIVE_INFINITY;
    if (b < a) byId.set(row.tokenId, row);
  }
  return [...byId.values()];
}

export type StageSetupFilter = "ALL" | "BASE" | "REACCEL" | "NONE";

/**
 * BASE and REACCEL select the setup-specific frozen baseline, so REACCEL
 * History can never measure from a token's earlier BASE entry, or vice versa.
 */
export function filterStageRows(rows: StageRow[], filter: StageSetupFilter): StageRow[] {
  if (filter === "ALL") return uniqueStageRows(rows);
  if (filter === "NONE") {
    return uniqueStageRows(
      rows.filter(
        (r) => r.setupKey === "ALL" && !QUALIFYING_SETUPS.some((s) => r.setups.includes(s)),
      ),
    );
  }
  const setupSpecific = rows.filter((r) => r.setupKey === filter);
  if (setupSpecific.length > 0) return uniqueStageRows(setupSpecific);
  // Stages without a setup dimension (SURVIVOR) fall back to entry setups.
  return uniqueStageRows(rows.filter((r) => r.setups.includes(filter)));
}


export type StageSort = "RECENT" | "PEAK";

/** Missing peak values sort last and are never coerced to 0. */
export function sortStageRows(rows: StageRow[], sort: StageSort): StageRow[] {
  const list = [...rows];
  if (sort === "PEAK") {
    return list.sort((a, b) => {
      const av = isNum(a.peakPct) ? a.peakPct : null;
      const bv = isNum(b.peakPct) ? b.peakPct : null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });
  }
  return list.sort((a, b) => {
    const at = a.latestObservationAt ?? a.enteredAt;
    const bt = b.latestObservationAt ?? b.enteredAt;
    if (!at && !bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return Date.parse(bt) - Date.parse(at);
  });
}

/**
 * A live market quote used only for display. Liquidity is required to judge
 * validity: `outcome_market_validity/v1` applies to live quotes exactly as it
 * applies to persisted observations.
 */
export interface LiveQuote {
  marketCap: number | null;
  liquidityUsd: number | null;
}

export type SinceStageSource = "LIVE" | "PERSISTED" | "LIVE_INVALID" | "NONE";

export interface SinceStageReading {
  pct: number | null;
  source: SinceStageSource;
  validity: OutcomeMarketValidity | null;
  reason: MarketValidityAssessment["reason"];
}

/**
 * Live Since Stage against the FROZEN entry baseline.
 *
 * An INVALID_MARKET live quote (drained pool, implausible MC/liquidity) can
 * never produce a valid-looking return: it is reported as unavailable rather
 * than coerced to zero or silently replaced by the persisted value. The
 * invalid observation itself is preserved untouched for audit.
 */
export function liveSinceStage(
  row: StageRow,
  live?: LiveQuote | null,
): SinceStageReading {
  const persisted: SinceStageReading = {
    pct: row.sincePct,
    source: row.sincePct === null ? "NONE" : "PERSISTED",
    validity: null,
    reason: null,
  };
  if (!live || !isNum(live.marketCap)) return persisted;

  const assessment = assessMarketValidity({
    liquidityUsd: live.liquidityUsd,
    marketCap: live.marketCap,
  });
  if (!isMetricUsable(assessment.validity)) {
    return {
      pct: null,
      source: "LIVE_INVALID",
      validity: assessment.validity,
      reason: assessment.reason,
    };
  }

  const baseline = row.entryMarketCap;
  if (!isNum(baseline) || baseline <= 0) return persisted;
  return {
    pct: ((live.marketCap - baseline) / baseline) * 100,
    source: "LIVE",
    validity: assessment.validity,
    reason: assessment.reason,
  };
}

/** Numeric convenience form; invalid live quotes yield null, never 0. */
export function liveSinceStagePct(row: StageRow, live?: LiveQuote | null): number | null {
  return liveSinceStage(row, live).pct;
}

/**
 * Stage-relative peak / max-drawdown series exist only where an outcome
 * baseline is genuinely tracked over time (First Survivor today). Every other
 * stage has a frozen entry baseline but no series, so those metrics are hidden
 * rather than rendered empty.
 */
export function stageSupportsPeakMetrics(stage: FunnelStage): boolean {
  return stage === "SURVIVOR";
}

export interface StageSummary {
  stage: FunnelStage;
  sampleSize: number;
  supportsPeakMetrics: boolean;
  avgSince: Stat;
  medianSince: Stat;
  avgPeak: Stat;
  medianPeak: Stat;
  winRate: Stat;
  avgMaxDd: Stat;
}

export function summarizeStageRows(
  stage: FunnelStage,
  rows: StageRow[],
  live?: Map<string, LiveQuote | null> | null,
): StageSummary {
  const cohort = uniqueStageRows(rows);
  const since = cohort.map((r) => liveSinceStagePct(r, live?.get(r.contractAddress ?? "") ?? null));
  const validSince = validValues(since);
  const wins = validSince.filter((v) => v > 0).length;
  return {
    stage,
    sampleSize: cohort.length,
    supportsPeakMetrics: stageSupportsPeakMetrics(stage),
    avgSince: mean(since),
    medianSince: median(since),
    avgPeak: mean(cohort.map((r) => r.peakPct)),
    medianPeak: median(cohort.map((r) => r.peakPct)),
    winRate:
      validSince.length === 0
        ? { value: null, n: 0 }
        : { value: (wins / validSince.length) * 100, n: validSince.length },
    avgMaxDd: mean(cohort.map((r) => r.maxAdversePct)),
  };
}

