/**
 * Research Packet v1 — the canonical, versioned, machine-readable view of one
 * Wingman candidate that future AI triage / deep research consumes.
 *
 * Hard rules:
 *   - No AI interpretation, thesis, score or recommendation belongs here.
 *   - Every value is explicitly `observed`, `deterministic_derived` or
 *     `unavailable`. Missing evidence is NEVER bearish evidence and never 0.
 *   - `NOT_EVALUATED` (a layer never ran) is never conflated with `UNKNOWN`
 *     (a layer ran and could not classify).
 *   - Building a packet is a pure read: it can never create a First Call,
 *     change Survivor state, recurrence, scanner evidence or outcomes.
 */

export const RESEARCH_PACKET_VERSION = "research_packet/v1";
export const RESEARCH_COMPACT_VERSION = "research_packet_compact/v1";

/** How a value came to be, so the model can never mistake a gap for a fact. */
export type FactStatus = "observed" | "deterministic_derived" | "unavailable";

export interface Fact<T> {
  value: T | null;
  status: FactStatus;
  /** Provider / system that supplied it. Null for derived or unavailable. */
  source?: string | null;
  /** When the fact was true at the source (ISO). */
  observedAt?: string | null;
  /** Policy or schema version behind a derived value. */
  version?: string | null;
}

/** Which slice of the research universe surfaced this candidate. */
export type CandidateSource = "SURVIVOR" | "BASE" | "REACCEL" | "EXPLORATION";

/** Machine-readable reasons a candidate is excluded from CURRENT AI research. */
export type ExclusionReason =
  | "UNIVERSE_OUT_OF_SCOPE"
  | "STRUCTURAL_FAIL"
  | "CURRENT_RECENT_MARKET_DAMAGE_FAIL";

/** Machine-readable evidence gaps. Never a judgement. */
export type EvidenceGap =
  | "HOLDER_DATA_UNAVAILABLE"
  | "CREATOR_DATA_UNAVAILABLE"
  | "PRICE_INTEGRITY_NOT_EVALUATED"
  | "PARTICIPATION_NOT_EVALUATED"
  | "SOCIAL_DATA_NOT_COLLECTED"
  | "PROVENANCE_UNAVAILABLE"
  | "CURRENT_MARKET_EVIDENCE_STALE"
  | "CURRENT_MARKET_EVIDENCE_UNAVAILABLE"
  | "STRUCTURAL_NOT_EVALUATED"
  | "OUTCOMES_UNAVAILABLE";

/** Evaluated-layer status. NOT_EVALUATED is distinct from UNKNOWN by design. */
export type LayerStatus =
  | "HEALTHY"
  | "CONCERN"
  | "DAMAGED"
  | "BROAD"
  | "CONCENTRATED"
  | "EXTREME"
  | "PASS"
  | "FAIL"
  | "UNKNOWN"
  | "NOT_EVALUATED";

export interface PacketIdentity {
  chain: string;
  /** Exact mint. Identity is never symbol/name based. */
  mint: string | null;
  name: string | null;
  symbol: string | null;
  pairAddress: Fact<string>;
  dex: Fact<string>;
  ageMinutes: Fact<number>;
  ageBasis: string | null;
}

export interface PacketScannerContext {
  scanId: string;
  scanCompletedAt: string | null;
  quantitativeResearchPriority: Fact<number>;
  globalRank: Fact<number>;
  setups: string[];
  primarySetup: string;
  survivor: boolean;
  selectionRoute: "RESERVATION" | "GLOBAL" | "NOT_SELECTED";
  recurrenceState: string;
  scansSeenCount: number;
  consecutiveScansSeen: number;
  firstSeenScanAt: string | null;
  previousSeenScanAt: string | null;
}

export interface PacketEligibility {
  researchEligibleNow: boolean;
  exclusionReasons: ExclusionReason[];
  /** Frozen state at Survivor selection. Never recomputed or rewritten. */
  callTimeEligibility: {
    recentMarketDamage: LayerStatus;
    priceChange1hPct: number | null;
    at: string | null;
  } | null;
  currentEligibility: {
    recentMarketDamage: LayerStatus;
    priceChange1hPct: number | null;
    at: string | null;
  };
}

export interface PacketMarket {
  price: Fact<number>;
  marketCap: Fact<number>;
  liquidityUsd: Fact<number>;
  volume1h: Fact<number>;
  volume24h: Fact<number>;
  turnover24h: Fact<number>;
  volumeToLiquidity24h: Fact<number>;
  trades1h: Fact<number>;
  trades24h: Fact<number>;
  buys24h: Fact<number>;
  sells24h: Fact<number>;
  priceChange1hPct: Fact<number>;
  priceChange24hPct: Fact<number>;
  source: string | null;
  observedAt: string | null;
  /** True when the newest market observation is older than the freshness bound. */
  stale: boolean;
}

export interface PacketUniverse {
  status: string;
  category: string | null;
  reason: string | null;
  source: string;
}

export interface PacketStructural {
  status: LayerStatus;
  policyVersion: string | null;
  mintAuthority: Fact<string>;
  freezeAuthority: Fact<string>;
  dexMarket: Fact<string>;
  reasons: string[];
  evaluatedAt: string | null;
}

export interface PacketMarketDamage {
  callTime: {
    status: LayerStatus;
    priceChange1hPct: number | null;
    at: string | null;
    reason: string | null;
  } | null;
  current: {
    status: LayerStatus;
    priceChange1hPct: number | null;
    at: string | null;
    reason: string | null;
  };
  /** ELIGIBLE | POST_CALL_COLLAPSE | BLOCKED_AT_CALL | CURRENTLY_BLOCKED | UNKNOWN */
  derivedState: string;
}

export interface PacketPriceIntegrity {
  status: LayerStatus;
  policyVersion: string | null;
  features: Record<string, number | string | boolean | null> | null;
  signals: string[];
  reasons: string[];
  coverage: Record<string, number | string | boolean | null> | null;
  evaluatedAt: string | null;
}

export interface PacketParticipation {
  status: LayerStatus;
  policyVersion: string | null;
  breadth: string | null;
  repetition: string | null;
  divergence: string | null;
  uniqueWalletsByWindow: Record<string, number | null> | null;
  tradesPerWalletByWindow: Record<string, number | null> | null;
  peakDivergenceRatio: number | null;
  reasons: string[];
  observedAt: string | null;
}

export interface PacketHolders {
  holderCount: Fact<number>;
  top10Pct: Fact<number>;
  top20Pct: Fact<number>;
  cohorts: Record<string, Fact<number>>;
  creator: Record<string, Fact<string | number | boolean>>;
  /** Known provider/coverage caveats. Never an inference about cleanliness. */
  caveats: string[];
}

export interface PacketOutcomes {
  firstSeenAt: string | null;
  firstSeenMarketCap: number | null;
  firstCallAt: string | null;
  firstCallMarketCap: number | null;
  sinceSeenPct: number | null;
  sinceCallPct: number | null;
  peakSinceCallPct: number | null;
  maxAdverseSinceCallPct: number | null;
  drawdownSinceCallPct: number | null;
  /** Historical context only. Never predictive. */
  note: "historical_context_only";
}

export interface ResearchPacket {
  packetVersion: typeof RESEARCH_PACKET_VERSION;
  generatedAt: string;
  candidateSource: CandidateSource;
  identity: PacketIdentity;
  scanner: PacketScannerContext;
  eligibility: PacketEligibility;
  market: PacketMarket;
  universe: PacketUniverse;
  structural: PacketStructural;
  marketDamage: PacketMarketDamage;
  priceIntegrity: PacketPriceIntegrity;
  participation: PacketParticipation;
  holders: PacketHolders;
  outcomes: PacketOutcomes | null;
  evidenceGaps: EvidenceGap[];
}
