/**
 * Core Wingman AI domain models.
 *
 * These interfaces describe the shape of data the UI consumes. Today they are
 * fulfilled by the mock-data layer (`src/lib/wingman/mock-data.ts`); later they
 * can be fulfilled by Supabase tables or external market-data providers without
 * changing any component.
 */

export type MarketRegime = "RISK_ON" | "NEUTRAL" | "RISK_OFF";

export type EntryState =
  | "BUY_ZONE"
  | "ACCEPTABLE"
  | "SETTING_UP"
  | "WATCH"
  | "EXTENDED"
  | "BROKEN";

export type OpportunityStage = "EMERGING" | "DEVELOPING" | "ESTABLISHED" | "LATE";

export type StructuralRiskKey = "CLEAN" | "ONE_CONCERN" | "SIGNIFICANT" | "BORDERLINE" | "FATAL";

export interface Token {
  id: string;
  name: string;
  ticker: string;
  contractAddress: string;
  chain: "solana";
  launchedAt: string; // ISO date
  imageHue?: number;
}

export interface TokenSnapshot {
  tokenId: string;
  capturedAt: string; // ISO date
  marketCapUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  priceUsd: number;
  holderCount: number;
}

export interface ThesisScoreBreakdown {
  memeQuality: number;
  catalystNarrative: number;
  distribution: number;
  liquidity: number;
  devIntegrity: number;
  chartEntry: number;
  mindshare: number;
  valuation: number;
}

export interface DistributionMetrics {
  holderCount: number;
  top10Pct: number;
  top20Pct: number;
  insiderEstimatePct: number;
  bundledSupplyPct: number;
  smartWalletPct: number;
  holderGrowth24hPct: number;
}

export interface WalletSignal {
  id: string;
  tokenId: string;
  kind: "SMART_ACCUMULATION" | "LARGE_DISTRIBUTION" | "DEV_BEHAVIOR" | "NEW_PROFITABLE_WALLETS";
  label: string;
  detail: string;
  sentiment: "positive" | "neutral" | "negative";
  observedAt: string;
}

export interface DeveloperAnalysis {
  reputation: "TRUSTED" | "NEUTRAL" | "MIXED" | "SUSPICIOUS";
  previousLaunches: number;
  successfulLaunches: number;
  suspiciousLaunches: number;
  linkedWallets: number;
  currentOwnershipPct: number;
  note: string;
}

export interface LiquidityAnalysis {
  liquidityUsd: number;
  volumeToLiquidityRatio: number;
  starterPositionUsd: number;
  starterImpactPct: number;
  largerPositionUsd: number;
  largerImpactPct: number;
  exitImpactPct: number;
  note: string;
}

export interface MindshareSnapshot {
  tokenId: string;
  capturedAt: string;
  mentionVelocityPerHour: number;
  uniqueAuthors24h: number;
  engagementQuality: "LOW" | "MEDIUM" | "HIGH";
  narrativePropagation: "CONTAINED" | "SPREADING" | "VIRAL";
  organicSharePct: number;
  mindshareScore: number;
}

export interface ChartAnalysis {
  entryState: EntryState;
  entryScore: number; // 0-10
  structure: string;
  recentImpulse: string;
  pullbackDepthPct: number;
  higherLowStatus: string;
  distanceFromBasePct: number;
  buyerSellerBehavior: string;
  volumeBehavior: string;
  riskDefinitionLevel: string;
  series: { t: number; v: number }[];
}

export interface MarketCapScenarios {
  failure: string;
  base: string;
  reflexive: string;
}

export interface ResearchReport {
  tokenId: string;
  generatedAt: string;
  verdict: string;
  whyNow: string;
  coreThesis: string;
  memeLore: string;
  catalystNarrative: string;
  distribution: DistributionMetrics;
  walletSignals: WalletSignal[];
  developer: DeveloperAnalysis;
  liquidity: LiquidityAnalysis;
  mindshare: MindshareSnapshot;
  chart: ChartAnalysis;
  bullCase: string;
  bearCase: string;
  scenarios: MarketCapScenarios;
  invalidation: string[];
}

export interface Opportunity {
  id: string;
  rank: number;
  token: Token;
  snapshot: TokenSnapshot;
  thesisScore: number;
  thesisBreakdown: ThesisScoreBreakdown;
  evidenceConfidence: number;
  entryScore: number;
  entryState: EntryState;
  structuralRisk: StructuralRiskKey;
  stage: OpportunityStage;
  scoreChange: number;
  lastAnalyzedAt: string;
  report: ResearchReport;
}

export interface TradeOutcome {
  id: string;
  token: Pick<Token, "id" | "name" | "ticker">;
  thesisScoreAtDiscovery: number;
  entryScoreAtDiscovery: number;
  marketCapAtDiscoveryUsd: number;
  peakMarketCapUsd: number;
  maxGainPct: number;
  maxDrawdownPct: number;
  status: "OPEN" | "TARGET_HIT" | "INVALIDATED" | "EXPIRED";
  discoveredAt: string;
}

export interface ScanPipelineStage {
  key: string;
  label: string;
  description: string;
  count: number;
}

export interface ScanSummary {
  regime: MarketRegime;
  lastScanAt: string;
  tokensScanned: number;
  passedFilters: number;
  quantRanked: number;
  deepResearched: number;
  actionable: number;
}

export interface ScannedCandidate {
  id: string;
  name: string;
  ticker: string;
  marketCapUsd: number;
  liquidityUsd: number;
  quantScore: number;
  stageReached: "HARD_FILTERS" | "QUANT_RANKING" | "AI_TRIAGE" | "DEEP_RESEARCH" | "SHORTLIST";
  outcome: string;
}

export interface WatchlistEntry {
  tokenId: string;
  addedAt: string;
  alert: "ON" | "OFF";
}
