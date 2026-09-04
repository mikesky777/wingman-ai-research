/**
 * Research Packet v1 assembly (pure).
 *
 * Reads persisted Wingman facts and shapes them into one canonical packet.
 * It never calls a provider, never writes anything, never establishes a First
 * Call, never touches Survivor selection, recurrence, scanner evidence or
 * outcomes. Building a packet is a read.
 */
import { deriveDamageTimeline } from "../scanner/market-damage";
import type {
  ParticipationDetail,
  PriceIntegrityDetail,
  StructuralDetail,
  TokenOutcome,
} from "../scanner-service";

/**
 * The exact persisted candidate fields a packet reads. `WorkbenchCandidate`
 * satisfies this structurally, so the pure layer never depends on the browser
 * read service or on any database row shape.
 */
export interface PacketCandidate {
  tokenId: string;
  name: string;
  symbol: string;
  contractAddress: string | null;
  lanes: string[];
  ageMinutes: number | null;
  ageBasis: string | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  priceUsd: number | null;
  volume1h: number | null;
  volume24h: number | null;
  trades1h: number | null;
  trades24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  holderCount: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  turnover24h: number | null;
  volumeToLiquidity24h: number | null;
  quantitativePriority: number | null;
  globalRank: number | null;
  selectedByLaneReservation: boolean;
  selectedByGlobalRanking: boolean;
  recurrenceState: string;
  scansSeenCount: number;
  consecutiveScansSeen: number;
  firstSeenScanAt: string | null;
  previousSeenScanAt: string | null;
  universeEligibility: string;
  universeCategory: string | null;
  universeReason: string | null;
  structuralStatus: string | null;
  structuralPolicyVersion: string | null;
  structuralDetail: StructuralDetail | null;
  priceIntegrityStatus: string | null;
  priceIntegrityPolicyVersion: string | null;
  priceIntegrityDetail: PriceIntegrityDetail | null;
  participationStatus: string | null;
  participationPolicyVersion: string | null;
  participationDetail: ParticipationDetail | null;
  outcome: TokenOutcome | null;
}
import {
  RESEARCH_PACKET_VERSION,
  type CandidateSource,
  type EvidenceGap,
  type ExclusionReason,
  type Fact,
  type LayerStatus,
  type PacketHolders,
  type PacketMarket,
  type PacketOutcomes,
  type ResearchPacket,
} from "./types";

/** Research universe configuration. Persisted per generation run. */
export interface ResearchUniverseConfig {
  maxExplorationForAi: number;
}

export const RESEARCH_UNIVERSE_CONFIG: ResearchUniverseConfig = {
  maxExplorationForAi: 10,
};

/** A current-market observation is stale beyond this age. Context, not a veto. */
export const CURRENT_MARKET_STALE_MINUTES = 45;

/** Latest persisted market observation for the token. */
export interface CurrentMarketObservation {
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume1h: number | null;
  volume24h: number | null;
  trades1h: number | null;
  trades24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  source: string | null;
  observedAt: string | null;
}

/** Minimal evidence row shape needed for holder/creator facts. */
export interface HolderEvidenceRow {
  domain: string;
  key: string;
  value: number | string | boolean | null;
  source: string;
  observedAt: string | null;
  capturedAt: string;
  status: string;
}

export interface PacketInput {
  candidate: PacketCandidate;
  candidateSource: CandidateSource;
  scanRunId: string;
  scanCompletedAt: string | null;
  currentMarket: CurrentMarketObservation | null;
  holderEvidence: HolderEvidenceRow[];
  pairAddress?: string | null;
  dex?: string | null;
  chain?: string | null;
  generatedAt?: string;
  nowMs?: number;
}

function observed<T>(value: T | null | undefined, source: string | null, at: string | null): Fact<T> {
  if (value === null || value === undefined) {
    return { value: null, status: "unavailable", source: null, observedAt: null };
  }
  return { value, status: "observed", source, observedAt: at };
}

function derived<T>(value: T | null | undefined, version: string | null): Fact<T> {
  if (value === null || value === undefined) {
    return { value: null, status: "unavailable", version: null };
  }
  return { value, status: "deterministic_derived", version };
}

function unavailable<T>(): Fact<T> {
  return { value: null, status: "unavailable" };
}

/**
 * Whether a scanner layer produced an actual evaluation. A missing evaluation
 * is NOT_EVALUATED; a produced-but-inconclusive one is UNKNOWN. Never merge.
 */
function layerStatus(status: string | null, policyVersion: string | null): LayerStatus {
  if (status) return status as LayerStatus;
  return policyVersion ? "UNKNOWN" : "NOT_EVALUATED";
}

export function isSurvivor(candidate: PacketCandidate): boolean {
  return candidate.selectedByLaneReservation || candidate.selectedByGlobalRanking;
}

export function primarySetupOf(candidate: PacketCandidate): string {
  return candidate.lanes[0] ?? "NONE";
}

/**
 * CURRENT research eligibility. Historical Survivor status, First Call and
 * outcomes are never affected by this: a token blocked now stays fully
 * preserved in history.
 */
export function assessResearchEligibility(input: {
  candidate: PacketCandidate;
  currentPriceChange1h: number | null;
}): { researchEligibleNow: boolean; exclusionReasons: ExclusionReason[] } {
  const reasons: ExclusionReason[] = [];
  const { candidate } = input;

  if (candidate.universeEligibility === "OUT_OF_SCOPE") reasons.push("UNIVERSE_OUT_OF_SCOPE");
  if (candidate.structuralStatus === "FAIL") reasons.push("STRUCTURAL_FAIL");

  // Only a CONFIRMED current failure blocks. Missing data never blocks.
  const timeline = deriveDamageTimeline({
    callTime1hPct: candidate.priceChange1h,
    callTimeAt: null,
    current1hPct: input.currentPriceChange1h,
    currentAt: null,
  });
  if (!timeline.researchEligibleNow) reasons.push("CURRENT_RECENT_MARKET_DAMAGE_FAIL");

  return { researchEligibleNow: reasons.length === 0, exclusionReasons: reasons };
}

/**
 * The candidates future AI may see for one completed scan:
 *   1. current Survivors
 *   2. eligible BASE non-Survivors
 *   3. eligible REACCEL non-Survivors
 *   4. top-N high-priority Exploration (SETUP = NONE) candidates
 *
 * Price Integrity and Participation Quality are CONTEXT and never gate here.
 */
export interface UniverseMember {
  candidate: PacketCandidate;
  candidateSource: CandidateSource;
}

export interface UniverseSelection {
  members: UniverseMember[];
  considered: number;
  excluded: { candidate: PacketCandidate; reasons: ExclusionReason[] }[];
  counts: Record<CandidateSource, number>;
  exclusionCounts: Record<ExclusionReason, number>;
}

function byPriorityDesc(a: PacketCandidate, b: PacketCandidate): number {
  return (b.quantitativePriority ?? -Infinity) - (a.quantitativePriority ?? -Infinity);
}

export function selectResearchUniverse(
  candidates: PacketCandidate[],
  options: {
    config?: ResearchUniverseConfig;
    currentPriceChange1hByToken?: Record<string, number | null>;
  } = {},
): UniverseSelection {
  const config = options.config ?? RESEARCH_UNIVERSE_CONFIG;
  const current = options.currentPriceChange1hByToken ?? {};

  const counts: Record<CandidateSource, number> = {
    SURVIVOR: 0,
    BASE: 0,
    REACCEL: 0,
    EXPLORATION: 0,
  };
  const exclusionCounts: Record<ExclusionReason, number> = {
    UNIVERSE_OUT_OF_SCOPE: 0,
    STRUCTURAL_FAIL: 0,
    CURRENT_RECENT_MARKET_DAMAGE_FAIL: 0,
  };

  const excluded: UniverseSelection["excluded"] = [];
  const members: UniverseMember[] = [];
  const seen = new Set<string>();

  const admit = (candidate: PacketCandidate, candidateSource: CandidateSource): boolean => {
    if (seen.has(candidate.tokenId)) return false;
    const verdict = assessResearchEligibility({
      candidate,
      currentPriceChange1h: current[candidate.tokenId] ?? candidate.priceChange1h,
    });
    if (!verdict.researchEligibleNow) {
      excluded.push({ candidate, reasons: verdict.exclusionReasons });
      for (const reason of verdict.exclusionReasons) exclusionCounts[reason] += 1;
      seen.add(candidate.tokenId);
      return false;
    }
    seen.add(candidate.tokenId);
    members.push({ candidate, candidateSource });
    counts[candidateSource] += 1;
    return true;
  };

  const survivors = candidates.filter(isSurvivor).sort(byPriorityDesc);
  for (const candidate of survivors) admit(candidate, "SURVIVOR");

  const nonSurvivors = candidates.filter((c) => !isSurvivor(c)).sort(byPriorityDesc);
  for (const candidate of nonSurvivors) {
    if (candidate.lanes.includes("BASE")) admit(candidate, "BASE");
  }
  for (const candidate of nonSurvivors) {
    if (candidate.lanes.includes("REACCEL")) admit(candidate, "REACCEL");
  }

  // Exploration is capped: only the configured top-N NONE candidates enter.
  let explorationAdmitted = 0;
  for (const candidate of nonSurvivors) {
    if (explorationAdmitted >= config.maxExplorationForAi) break;
    if (seen.has(candidate.tokenId)) continue;
    if (candidate.lanes.length > 0) continue;
    if (candidate.quantitativePriority === null) continue;
    if (admit(candidate, "EXPLORATION")) explorationAdmitted += 1;
  }

  return {
    members,
    considered: candidates.length,
    excluded,
    counts,
    exclusionCounts,
  };
}

const HOLDER_KEYS = {
  holderCount: "holders.wallet_holder_count",
  top10: "holders.top10_wallet_pct_of_total_supply",
  top20: "holders.top20_wallet_pct_of_total_supply",
} as const;

const COHORT_PREFIXES = [
  "holders.bundler",
  "holders.sniper",
  "holders.insider",
  "holders.smart_trader",
] as const;

function buildHolders(input: PacketInput): { holders: PacketHolders; gaps: EvidenceGap[] } {
  const gaps: EvidenceGap[] = [];
  const rows = input.holderEvidence.filter((r) => r.status === "observed" && r.value !== null);
  const latest = new Map<string, HolderEvidenceRow>();
  for (const row of rows) {
    const prior = latest.get(row.key);
    if (!prior || (row.capturedAt ?? "") > (prior.capturedAt ?? "")) latest.set(row.key, row);
  }

  const factFor = <T,>(key: string): Fact<T> => {
    const row = latest.get(key);
    if (!row) return unavailable<T>();
    return observed<T>(row.value as T, row.source, row.observedAt ?? row.capturedAt);
  };

  const cohorts: Record<string, Fact<number>> = {};
  for (const [key, row] of latest) {
    if (COHORT_PREFIXES.some((p) => key.startsWith(p)) && typeof row.value === "number") {
      cohorts[key] = observed<number>(row.value, row.source, row.observedAt ?? row.capturedAt);
    }
  }

  const creator: Record<string, Fact<string | number | boolean>> = {};
  for (const [key, row] of latest) {
    if (row.domain === "creator") {
      creator[key] = observed(row.value as string | number | boolean, row.source, row.observedAt ?? row.capturedAt);
    }
  }

  const holderCount = factFor<number>(HOLDER_KEYS.holderCount);
  const scanHolderCount = input.candidate.holderCount;

  const holders: PacketHolders = {
    holderCount:
      holderCount.status === "observed"
        ? holderCount
        : observed<number>(scanHolderCount, "wingman_scan", input.scanCompletedAt),
    top10Pct: factFor<number>(HOLDER_KEYS.top10),
    top20Pct: factFor<number>(HOLDER_KEYS.top20),
    cohorts,
    creator,
    caveats:
      Object.keys(cohorts).length === 0
        ? ["Labeled-cohort coverage depends on provider availability and is often absent."]
        : [],
  };

  const noHolderEvidence =
    holders.holderCount.status !== "observed" &&
    holders.top10Pct.status !== "observed" &&
    holders.top20Pct.status !== "observed";
  if (noHolderEvidence) gaps.push("HOLDER_DATA_UNAVAILABLE");
  if (Object.keys(creator).length === 0) gaps.push("CREATOR_DATA_UNAVAILABLE");

  return { holders, gaps };
}

function buildMarket(input: PacketInput): { market: PacketMarket; gaps: EvidenceGap[] } {
  const gaps: EvidenceGap[] = [];
  const cur = input.currentMarket;
  const source = cur?.source ?? "wingman_scan";
  const at = cur?.observedAt ?? input.scanCompletedAt;
  const c = input.candidate;

  const pick = (live: number | null | undefined, fallback: number | null): number | null =>
    live === null || live === undefined ? fallback : live;

  const marketCap = pick(cur?.marketCap, c.marketCap);
  const volume24h = pick(cur?.volume24h, c.volume24h);
  const liquidityUsd = pick(cur?.liquidityUsd, c.liquidityUsd);

  const turnover =
    marketCap && marketCap > 0 && volume24h !== null ? volume24h / marketCap : c.turnover24h;
  const volToLiq =
    liquidityUsd && liquidityUsd > 0 && volume24h !== null
      ? volume24h / liquidityUsd
      : c.volumeToLiquidity24h;

  const nowMs = input.nowMs ?? Date.parse(input.generatedAt ?? new Date().toISOString());
  const observedMs = at ? Date.parse(at) : NaN;
  const stale =
    !Number.isFinite(observedMs) ||
    (nowMs - observedMs) / 60000 > CURRENT_MARKET_STALE_MINUTES;

  if (!cur) gaps.push("CURRENT_MARKET_EVIDENCE_UNAVAILABLE");
  if (stale) gaps.push("CURRENT_MARKET_EVIDENCE_STALE");

  const market: PacketMarket = {
    price: observed(pick(cur?.priceUsd, c.priceUsd), source, at),
    marketCap: observed(marketCap, source, at),
    liquidityUsd: observed(liquidityUsd, source, at),
    volume1h: observed(pick(cur?.volume1h, c.volume1h), source, at),
    volume24h: observed(volume24h, source, at),
    turnover24h: derived(turnover, "scanner/metrics"),
    volumeToLiquidity24h: derived(volToLiq, "scanner/metrics"),
    trades1h: observed(pick(cur?.trades1h, c.trades1h), source, at),
    trades24h: observed(pick(cur?.trades24h, c.trades24h), source, at),
    buys24h: observed(pick(cur?.buys24h, c.buys24h), source, at),
    sells24h: observed(pick(cur?.sells24h, c.sells24h), source, at),
    priceChange1hPct: observed(pick(cur?.priceChange1h, c.priceChange1h), source, at),
    priceChange24hPct: observed(pick(cur?.priceChange24h, c.priceChange24h), source, at),
    source,
    observedAt: at,
    stale,
  };
  return { market, gaps };
}

function buildOutcomes(input: PacketInput): PacketOutcomes | null {
  const o = input.candidate.outcome;
  if (!o) return null;
  return {
    firstSeenAt: o.firstSeenAt,
    firstSeenMarketCap: o.firstSeenMarketCap,
    firstCallAt: o.firstCallAt,
    firstCallMarketCap: o.firstCallMarketCap,
    sinceSeenPct: o.sinceSeenPct,
    sinceCallPct: o.sinceCallPct,
    peakSinceCallPct: o.peakMarketCapSinceCallPct ?? o.peakSinceCallPct,
    maxAdverseSinceCallPct: o.maxAdverseSinceCallPctV2 ?? o.maxAdverseSinceCallPct,
    drawdownSinceCallPct: o.drawdownSinceCallPctV2 ?? o.drawdownSinceCallPct,
    currentMarketValidity: o.currentMarketValidity,
    lastValidObservationAt: o.lastValidObservationAt,
    invalidObservationCount: o.invalidObservationCount,
    note: "historical_context_only",
  };
}

export function buildResearchPacket(input: PacketInput): ResearchPacket {
  const c = input.candidate;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const currentPriceChange1h = input.currentMarket?.priceChange1h ?? null;

  const timeline = deriveDamageTimeline({
    callTime1hPct: c.priceChange1h,
    callTimeAt: input.scanCompletedAt,
    current1hPct: currentPriceChange1h ?? c.priceChange1h,
    currentAt: input.currentMarket?.observedAt ?? input.scanCompletedAt,
  });

  const eligibility = assessResearchEligibility({
    candidate: c,
    currentPriceChange1h: currentPriceChange1h ?? c.priceChange1h,
  });

  const { market, gaps: marketGaps } = buildMarket(input);
  const { holders, gaps: holderGaps } = buildHolders(input);

  const priceIntegrityStatus = layerStatus(c.priceIntegrityStatus, c.priceIntegrityPolicyVersion);
  const participationStatus = layerStatus(c.participationStatus, c.participationPolicyVersion);
  const structuralStatus = layerStatus(c.structuralStatus, c.structuralPolicyVersion);

  const gaps = new Set<EvidenceGap>([...marketGaps, ...holderGaps]);
  if (priceIntegrityStatus === "NOT_EVALUATED") gaps.add("PRICE_INTEGRITY_NOT_EVALUATED");
  if (participationStatus === "NOT_EVALUATED") gaps.add("PARTICIPATION_NOT_EVALUATED");
  if (structuralStatus === "NOT_EVALUATED") gaps.add("STRUCTURAL_NOT_EVALUATED");
  // Social research does not exist yet — always an explicit gap in v1.
  gaps.add("SOCIAL_DATA_NOT_COLLECTED");
  if (!input.pairAddress) gaps.add("PROVENANCE_UNAVAILABLE");
  const outcomes = buildOutcomes(input);
  if (!outcomes) gaps.add("OUTCOMES_UNAVAILABLE");
  // The AI must be told the latest outcome quote is not a real market rather
  // than silently reading a drained-pool number as a fact.
  if (outcomes?.currentMarketValidity === "INVALID_MARKET")
    gaps.add("CURRENT_OUTCOME_MARKET_INVALID");
  if (outcomes?.currentMarketValidity === "UNKNOWN") gaps.add("CURRENT_OUTCOME_MARKET_UNKNOWN");

  const structuralRules = c.structuralDetail?.rules ?? [];
  const ruleFact = (id: string): Fact<string> => {
    const rule = structuralRules.find((r) => r.id === id);
    if (!rule) return unavailable<string>();
    return {
      value: rule.status,
      status: rule.status === "UNKNOWN" ? "unavailable" : "observed",
      source: rule.source ?? null,
      observedAt: rule.observedAt ?? rule.capturedAt ?? null,
      version: c.structuralPolicyVersion,
    };
  };

  const dims = c.participationDetail?.dimensions ?? null;
  const windows = c.participationDetail?.windows ?? null;
  const uniqueWallets: Record<string, number | null> | null = windows
    ? Object.fromEntries(
        Object.entries(windows).map(([w, m]) => [w, m?.uniqueWallets ?? null]),
      )
    : null;
  const tradesPerWallet: Record<string, number | null> | null = windows
    ? Object.fromEntries(
        Object.entries(windows).map(([w, m]) => [w, m?.tradesPerWallet ?? null]),
      )
    : null;

  return {
    packetVersion: RESEARCH_PACKET_VERSION,
    generatedAt,
    candidateSource: input.candidateSource,
    identity: {
      chain: input.chain ?? "solana",
      mint: c.contractAddress,
      name: c.name,
      symbol: c.symbol,
      pairAddress: observed(input.pairAddress ?? null, "dexscreener", input.scanCompletedAt),
      dex: observed(input.dex ?? null, "dexscreener", input.scanCompletedAt),
      ageMinutes: observed(c.ageMinutes, "wingman_scan", input.scanCompletedAt),
      ageBasis: c.ageBasis,
    },
    scanner: {
      scanId: input.scanRunId,
      scanCompletedAt: input.scanCompletedAt,
      quantitativeResearchPriority: derived(c.quantitativePriority, "scanner/priority"),
      globalRank: derived(c.globalRank, "scanner/priority"),
      setups: c.lanes,
      primarySetup: primarySetupOf(c),
      survivor: isSurvivor(c),
      selectionRoute: c.selectedByLaneReservation
        ? "RESERVATION"
        : c.selectedByGlobalRanking
          ? "GLOBAL"
          : "NOT_SELECTED",
      recurrenceState: c.recurrenceState,
      scansSeenCount: c.scansSeenCount,
      consecutiveScansSeen: c.consecutiveScansSeen,
      firstSeenScanAt: c.firstSeenScanAt,
      previousSeenScanAt: c.previousSeenScanAt,
    },
    eligibility: {
      researchEligibleNow: eligibility.researchEligibleNow,
      exclusionReasons: eligibility.exclusionReasons,
      callTimeEligibility: isSurvivor(c)
        ? {
            recentMarketDamage: timeline.callTime.status,
            priceChange1hPct: timeline.callTime.priceChange1hPct,
            at: input.scanCompletedAt,
          }
        : null,
      currentEligibility: {
        recentMarketDamage: timeline.current.status,
        priceChange1hPct: timeline.current.priceChange1hPct,
        at: timeline.currentAt,
      },
    },
    market,
    universe: {
      status: c.universeEligibility,
      category: c.universeCategory,
      reason: c.universeReason,
      source: "exact_mint_registry",
    },
    structural: {
      status: structuralStatus,
      policyVersion: c.structuralPolicyVersion,
      mintAuthority: ruleFact("mint_authority"),
      freezeAuthority: ruleFact("freeze_authority"),
      dexMarket: ruleFact("dex_market"),
      reasons: structuralRules.map((r) => r.reason).filter((r): r is string => Boolean(r)),
      evaluatedAt: structuralRules[0]?.capturedAt ?? null,
    },
    marketDamage: {
      callTime: isSurvivor(c)
        ? {
            status: timeline.callTime.status,
            priceChange1hPct: timeline.callTime.priceChange1hPct,
            at: input.scanCompletedAt,
            reason: timeline.callTime.reason,
          }
        : null,
      current: {
        status: timeline.current.status,
        priceChange1hPct: timeline.current.priceChange1hPct,
        at: timeline.currentAt,
        reason: timeline.current.reason,
      },
      derivedState: timeline.state,
    },
    priceIntegrity: {
      status: priceIntegrityStatus,
      policyVersion: c.priceIntegrityPolicyVersion,
      features:
        (c.priceIntegrityDetail?.features as unknown as Record<string, number | string | boolean | null>) ??
        null,
      signals: c.priceIntegrityDetail?.signals ?? [],
      reasons: c.priceIntegrityDetail?.reasons ?? [],
      coverage:
        (c.priceIntegrityDetail?.coverage as unknown as Record<string, number | string | boolean | null>) ??
        null,
      evaluatedAt: c.priceIntegrityDetail?.evaluatedAt ?? null,
    },
    participation: {
      status: participationStatus,
      policyVersion: c.participationPolicyVersion,
      breadth: dims?.breadth ?? null,
      repetition: dims?.repetition ?? null,
      divergence: dims?.divergence ?? null,
      uniqueWalletsByWindow: uniqueWallets,
      tradesPerWalletByWindow: tradesPerWallet,
      peakDivergenceRatio: dims?.peakDivergenceRatio ?? null,
      reasons: c.participationDetail?.reasons ?? [],
      observedAt: c.participationDetail?.observedAt ?? null,
    },
    holders,
    outcomes,
    evidenceGaps: [...gaps].sort(),
  };
}
