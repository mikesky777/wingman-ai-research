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

/** A frozen first entry into one funnel stage. */
export interface StageMilestone {
  tokenId: string;
  contractAddress: string;
  chain: string;
  stage: FunnelStage;
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
  provenance: StageProvenance;
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
 * First qualification for a recognized setup (BASE or REACCEL). NONE and any
 * unrecognized tag never qualify. Later appearances never rewrite the entry;
 * they only contribute the setup-specific first timestamps.
 */
export function deriveSetupQualifiedMilestone(
  identity: { tokenId: string; contractAddress: string; chain?: string },
  appearances: StageAppearance[],
): StageMilestone | null {
  const ordered = [...appearances].sort(byTime);
  const first = ordered.find((a) => qualifyingSetups(a).length > 0);
  if (!first) return null;

  const firstBase = ordered.find((a) => a.setups.includes("BASE")) ?? null;
  const firstReaccel = ordered.find((a) => a.setups.includes("REACCEL")) ?? null;
  const setups = qualifyingSetups(first);

  return {
    tokenId: identity.tokenId,
    contractAddress: identity.contractAddress,
    chain: identity.chain ?? "solana",
    stage: "SETUP_QUALIFIED",
    firstEnteredAt: first.completedAt,
    setupAtEntry: setups.join("+"),
    firstSetup: setups[0] ?? null,
    firstBaseAt: firstBase?.completedAt ?? null,
    firstReaccelAt: firstReaccel?.completedAt ?? null,
    marketCapAtEntry: isNum(first.marketCap) ? first.marketCap : null,
    priceAtEntry: isNum(first.priceUsd) ? first.priceUsd : null,
    liquidityAtEntry: isNum(first.liquidityUsd) ? first.liquidityUsd : null,
    quantitativePriorityAtEntry: isNum(first.quantitativePriority)
      ? first.quantitativePriority
      : null,
    baselineComplete: isNum(first.marketCap) && isNum(first.priceUsd),
    provenance: {
      ...emptyProvenance("SCANNER"),
      sourceId: first.scanRunId,
      sourceScanId: first.scanRunId,
      sourceRef: `scan_runs:${first.scanRunId}`,
    },
  };
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

/** One unique token inside one stage cohort. */
export interface StageRow {
  tokenId: string;
  contractAddress: string | null;
  name: string;
  symbol: string;
  stage: FunnelStage;
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
export function survivorRowFromCohortToken(token: CohortToken, provenance?: StageProvenance | null): StageRow {
  return {
    tokenId: token.tokenId,
    contractAddress: token.contractAddress,
    name: token.name,
    symbol: token.symbol,
    stage: "SURVIVOR",
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
  };
}

/** One row per token inside a stage cohort. */
export function uniqueStageRows(rows: StageRow[]): StageRow[] {
  const byId = new Map<string, StageRow>();
  for (const row of rows) if (!byId.has(row.tokenId)) byId.set(row.tokenId, row);
  return [...byId.values()];
}

export type StageSetupFilter = "ALL" | "BASE" | "REACCEL" | "NONE";

export function filterStageRows(rows: StageRow[], filter: StageSetupFilter): StageRow[] {
  const unique = uniqueStageRows(rows);
  if (filter === "ALL") return unique;
  if (filter === "NONE") {
    return unique.filter((r) => !QUALIFYING_SETUPS.some((s) => r.setups.includes(s)));
  }
  return unique.filter((r) => r.setups.includes(filter));
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

/** Live Since Stage against the FROZEN entry baseline. Persisted rows untouched. */
export function liveSinceStagePct(row: StageRow, liveMarketCap: number | null | undefined): number | null {
  const baseline = row.entryMarketCap;
  if (!isNum(baseline) || baseline <= 0 || !isNum(liveMarketCap)) return row.sincePct;
  return ((liveMarketCap - baseline) / baseline) * 100;
}

export interface StageSummary {
  stage: FunnelStage;
  sampleSize: number;
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
  live?: Map<string, number | null> | null,
): StageSummary {
  const cohort = uniqueStageRows(rows);
  const since = cohort.map((r) => liveSinceStagePct(r, live?.get(r.contractAddress ?? "") ?? null));
  const validSince = validValues(since);
  const wins = validSince.filter((v) => v > 0).length;
  return {
    stage,
    sampleSize: cohort.length,
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
