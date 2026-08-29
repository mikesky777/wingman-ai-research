import type {
  Opportunity,
  ScanSummary,
  ScannedCandidate,
  TradeOutcome,
  ChartAnalysis,
} from "./types";

/**
 * Centralized mock-data layer.
 *
 * Every component reads data through the accessors at the bottom of this file.
 * Replacing these with Supabase queries or provider APIs later requires no
 * component changes.
 */

function series(seed: number, points = 60, drift = 1): ChartAnalysis["series"] {
  const out: ChartAnalysis["series"] = [];
  let v = 100;
  let s = seed;
  for (let i = 0; i < points; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const noise = (s / 2147483648 - 0.5) * 8;
    v = Math.max(12, v + noise + drift * Math.sin(i / 7) + drift * 0.6);
    out.push({ t: i, v: Number(v.toFixed(2)) });
  }
  return out;
}

export const SCAN_SUMMARY: ScanSummary = {
  regime: "NEUTRAL",
  lastScanAt: "2026-08-29T11:00:00.000Z",
  tokensScanned: 2483,
  passedFilters: 61,
  quantRanked: 23,
  deepResearched: 14,
  actionable: 3,
};

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp-gta",
    rank: 1,
    stage: "DEVELOPING",
    thesisScore: 84,
    evidenceConfidence: 89,
    entryScore: 8,
    entryState: "BUY_ZONE",
    structuralRisk: "CLEAN",
    scoreChange: 3,
    lastAnalyzedAt: "2026-08-29T11:00:00.000Z",
    thesisBreakdown: {
      memeQuality: 17,
      catalystNarrative: 13,
      distribution: 12,
      liquidity: 12,
      devIntegrity: 9,
      chartEntry: 8,
      mindshare: 9,
      valuation: 4,
    },
    token: {
      id: "opp-gta",
      name: "GTAMEMES",
      ticker: "GTA",
      contractAddress: "7hK9dQxRr2mVbT4pLcZ8yWfN3sJuEa6XgQ1nDvMk5RtP",
      chain: "solana",
      launchedAt: "2026-08-23T14:10:00.000Z",
    },
    snapshot: {
      tokenId: "opp-gta",
      capturedAt: "2026-08-29T11:00:00.000Z",
      marketCapUsd: 850_000,
      liquidityUsd: 140_000,
      volume24hUsd: 1_300_000,
      priceUsd: 0.00085,
      holderCount: 4210,
    },
    report: {
      tokenId: "opp-gta",
      generatedAt: "2026-08-29T11:00:00.000Z",
      verdict:
        "Strong GTA-related cultural thesis with accelerating holder growth and healthy liquidity. Current chart has formed a constructive higher low after the initial impulse. Structure remains clean and the current entry is attractive relative to invalidation.",
      whyNow:
        "A new trailer cycle has pushed GTA-adjacent content back to the top of gaming feeds this week, and this token is currently the highest-liquidity community expression of that attention on Solana.",
      coreThesis:
        "A durable mainstream culture reference with a natural refresh schedule, paired with clean distribution and enough liquidity for real position sizing. The thesis is that attention flows toward the single most liquid meme expression of a mainstream cultural event, and this token currently owns that slot.",
      memeLore:
        "Originated from a community edit account that has been posting GTA-styled loading-screen art for two years. The art direction is instantly recognisable, reproducible by anyone, and predates the token itself — a strong signal of organic origin rather than a launch-day narrative.",
      catalystNarrative:
        "Attention is likely to expand as the trailer cycle continues and mainstream gaming coverage picks up. Secondary catalyst: several mid-size accounts have begun using the loading-screen format for unrelated posts, which historically precedes broader propagation.",
      distribution: {
        holderCount: 4210,
        top10Pct: 18.4,
        top20Pct: 24.9,
        insiderEstimatePct: 3.1,
        bundledSupplyPct: 1.8,
        smartWalletPct: 6.2,
        holderGrowth24hPct: 27.5,
      },
      walletSignals: [
        {
          id: "ws-1",
          tokenId: "opp-gta",
          kind: "SMART_ACCUMULATION",
          label: "Smart wallets accumulating",
          detail: "6 wallets with >60% historical win rate added during the retrace.",
          sentiment: "positive",
          observedAt: "2026-08-29T09:40:00.000Z",
        },
        {
          id: "ws-2",
          tokenId: "opp-gta",
          kind: "LARGE_DISTRIBUTION",
          label: "Large holders distributing",
          detail: "One top-20 wallet trimmed ~18% of its position into strength. Not coordinated.",
          sentiment: "neutral",
          observedAt: "2026-08-29T08:15:00.000Z",
        },
        {
          id: "ws-3",
          tokenId: "opp-gta",
          kind: "DEV_BEHAVIOR",
          label: "Dev wallet behavior",
          detail: "Dev holds 1.2% and has not moved tokens since launch.",
          sentiment: "positive",
          observedAt: "2026-08-29T07:00:00.000Z",
        },
        {
          id: "ws-4",
          tokenId: "opp-gta",
          kind: "NEW_PROFITABLE_WALLETS",
          label: "New profitable-wallet activity",
          detail: "14 newly profitable wallets opened positions in the last 6 hours.",
          sentiment: "positive",
          observedAt: "2026-08-29T10:20:00.000Z",
        },
      ],
      developer: {
        reputation: "NEUTRAL",
        previousLaunches: 2,
        successfulLaunches: 1,
        suspiciousLaunches: 0,
        linkedWallets: 3,
        currentOwnershipPct: 1.2,
        note: "No rug history detected. Prior launch peaked near $4M and did not collapse abruptly.",
      },
      liquidity: {
        liquidityUsd: 140_000,
        volumeToLiquidityRatio: 9.3,
        starterPositionUsd: 2_000,
        starterImpactPct: 0.7,
        largerPositionUsd: 8_000,
        largerImpactPct: 2.9,
        exitImpactPct: 3.6,
        note: "Depth supports a mid-size position with tolerable slippage in both directions.",
      },
      mindshare: {
        tokenId: "opp-gta",
        capturedAt: "2026-08-29T11:00:00.000Z",
        mentionVelocityPerHour: 62,
        uniqueAuthors24h: 431,
        engagementQuality: "HIGH",
        narrativePropagation: "SPREADING",
        organicSharePct: 81,
        mindshareScore: 78,
      },
      chart: {
        entryState: "BUY_ZONE",
        entryScore: 8,
        structure: "Uptrend with a completed first pullback",
        recentImpulse: "+180% impulse over 14 hours, then orderly cooling",
        pullbackDepthPct: 32,
        higherLowStatus: "Confirmed higher low on rising holder count",
        distanceFromBasePct: 41,
        buyerSellerBehavior: "Buyers absorbing supply on dips; sellers passive",
        volumeBehavior: "Volume contracting into the retrace — constructive",
        riskDefinitionLevel: "Invalidation ~14% below current price at the higher low",
        series: series(7, 60, 1.1),
      },
      bullCase:
        "The cultural reference keeps refreshing without any effort from the community, holder growth continues at its current pace, and the token remains the most liquid expression of the theme. That combination historically supports a multi-week reflexive expansion.",
      bearCase:
        "Mainstream gaming attention is episodic. If the trailer cycle cools before holder growth compounds, the token loses its attention anchor and reverts toward the pre-impulse base with little support from fundamentals.",
      scenarios: {
        failure: "$200K–$350K",
        base: "$2M–$4M",
        reflexive: "$8M–$15M+",
      },
      invalidation: [
        "Loss of the confirmed higher low on closing basis",
        "Liquidity falls below ~$90K or depth thins sharply",
        "Coordinated distribution from more than two top-20 wallets",
        "Trailer/attention catalyst fails to sustain coverage",
        "24h holder growth turns negative for two consecutive scans",
      ],
    },
  },
  {
    id: "opp-lumen",
    rank: 2,
    stage: "EMERGING",
    thesisScore: 76,
    evidenceConfidence: 54,
    entryScore: 6,
    entryState: "SETTING_UP",
    structuralRisk: "ONE_CONCERN",
    scoreChange: 5,
    lastAnalyzedAt: "2026-08-29T11:00:00.000Z",
    thesisBreakdown: {
      memeQuality: 15,
      catalystNarrative: 12,
      distribution: 10,
      liquidity: 10,
      devIntegrity: 8,
      chartEntry: 6,
      mindshare: 11,
      valuation: 4,
    },
    token: {
      id: "opp-lumen",
      name: "Lumen Cat",
      ticker: "LUMEN",
      contractAddress: "3xQ8fPbW9mNz1KcVr6TdUy2SaHjE7LgB4RvMn5XwQpZk",
      chain: "solana",
      launchedAt: "2026-08-27T02:35:00.000Z",
    },
    snapshot: {
      tokenId: "opp-lumen",
      capturedAt: "2026-08-29T11:00:00.000Z",
      marketCapUsd: 410_000,
      liquidityUsd: 72_000,
      volume24hUsd: 640_000,
      priceUsd: 0.00041,
      holderCount: 1890,
    },
    report: {
      tokenId: "opp-lumen",
      generatedAt: "2026-08-29T11:00:00.000Z",
      verdict:
        "Genuinely original meme with unusually high engagement quality, but the evidence base is thin: the token is under 48 hours old and wallet history is too short to verify distribution claims. Thesis is interesting; confidence is not yet there.",
      whyNow:
        "A single high-reach post drove the first wave of attention 30 hours ago and the follow-through has been unusually organic rather than paid.",
      coreThesis:
        "Original artwork with a repeatable format and no obvious parent project to compete with. If the community holds through the first real drawdown, the meme has room to become a persistent format rather than a one-day event.",
      memeLore:
        "A hand-drawn cat rendered in the style of early 2000s screensavers. No prior token history attached to the art. Originality is high; cultural reach is currently narrow.",
      catalystNarrative:
        "Format is being copied by small accounts, which is the earliest stage of propagation. No scheduled external catalyst.",
      distribution: {
        holderCount: 1890,
        top10Pct: 26.8,
        top20Pct: 34.2,
        insiderEstimatePct: 7.9,
        bundledSupplyPct: 4.4,
        smartWalletPct: 3.1,
        holderGrowth24hPct: 61.0,
      },
      walletSignals: [
        {
          id: "ws-5",
          tokenId: "opp-lumen",
          kind: "SMART_ACCUMULATION",
          label: "Smart wallets accumulating",
          detail: "2 known-profitable wallets opened small positions.",
          sentiment: "positive",
          observedAt: "2026-08-29T06:12:00.000Z",
        },
        {
          id: "ws-6",
          tokenId: "opp-lumen",
          kind: "DEV_BEHAVIOR",
          label: "Dev wallet behavior",
          detail: "Dev sold 40% of an initial 5% allocation on day one.",
          sentiment: "negative",
          observedAt: "2026-08-28T19:05:00.000Z",
        },
      ],
      developer: {
        reputation: "MIXED",
        previousLaunches: 4,
        successfulLaunches: 1,
        suspiciousLaunches: 1,
        linkedWallets: 6,
        currentOwnershipPct: 3.0,
        note: "One prior launch showed an abrupt dev exit. Treat as a meaningful structural concern.",
      },
      liquidity: {
        liquidityUsd: 72_000,
        volumeToLiquidityRatio: 8.9,
        starterPositionUsd: 1_500,
        starterImpactPct: 1.2,
        largerPositionUsd: 6_000,
        largerImpactPct: 4.8,
        exitImpactPct: 6.1,
        note: "Adequate for a starter position only. Exit costs rise steeply above ~$6K.",
      },
      mindshare: {
        tokenId: "opp-lumen",
        capturedAt: "2026-08-29T11:00:00.000Z",
        mentionVelocityPerHour: 38,
        uniqueAuthors24h: 212,
        engagementQuality: "HIGH",
        narrativePropagation: "SPREADING",
        organicSharePct: 88,
        mindshareScore: 66,
      },
      chart: {
        entryState: "SETTING_UP",
        entryScore: 6,
        structure: "First base forming after the initial discovery move",
        recentImpulse: "+240% in 9 hours, currently cooling",
        pullbackDepthPct: 44,
        higherLowStatus: "Not yet confirmed — awaiting a reaction low",
        distanceFromBasePct: 22,
        buyerSellerBehavior: "Two-sided; no clear absorption yet",
        volumeBehavior: "Declining, but not yet compressed",
        riskDefinitionLevel: "No tight invalidation available until the base completes",
        series: series(19, 60, 0.7),
      },
      bullCase:
        "Original art plus high organic share is the profile that produces persistent formats. A confirmed higher low with continued holder growth would materially raise both thesis and entry quality.",
      bearCase:
        "Dev sold into day-one strength, bundled supply is non-trivial, and the token has no external catalyst. Attention could fade before any structure forms.",
      scenarios: {
        failure: "$80K–$150K",
        base: "$1M–$2.5M",
        reflexive: "$5M–$9M",
      },
      invalidation: [
        "Dev wallet sells further",
        "Base fails to form within 24 hours",
        "Organic share falls below 60%",
        "Liquidity deteriorates below ~$50K",
      ],
    },
  },
  {
    id: "opp-ledgerdog",
    rank: 3,
    stage: "ESTABLISHED",
    thesisScore: 88,
    evidenceConfidence: 91,
    entryScore: 3,
    entryState: "EXTENDED",
    structuralRisk: "CLEAN",
    scoreChange: -2,
    lastAnalyzedAt: "2026-08-29T11:00:00.000Z",
    thesisBreakdown: {
      memeQuality: 18,
      catalystNarrative: 14,
      distribution: 13,
      liquidity: 14,
      devIntegrity: 9,
      chartEntry: 3,
      mindshare: 10,
      valuation: 3,
    },
    token: {
      id: "opp-ledgerdog",
      name: "Ledger Dog",
      ticker: "LDOG",
      contractAddress: "9pR4vJmXt7Wq2NcBz5YdKa8ErUf1LhS6GnQv3MkTxAe2",
      chain: "solana",
      launchedAt: "2026-08-11T18:00:00.000Z",
    },
    snapshot: {
      tokenId: "opp-ledgerdog",
      capturedAt: "2026-08-29T11:00:00.000Z",
      marketCapUsd: 6_200_000,
      liquidityUsd: 720_000,
      volume24hUsd: 4_900_000,
      priceUsd: 0.0062,
      holderCount: 15_400,
    },
    report: {
      tokenId: "opp-ledgerdog",
      generatedAt: "2026-08-29T11:00:00.000Z",
      verdict:
        "One of the strongest theses currently tracked — clean distribution, deep liquidity, well-verified evidence. The problem is location: price is vertically extended above its last base and offers no acceptable risk definition. High thesis score does not make this a buy today.",
      whyNow:
        "The narrative is already widely known. Wingman is tracking it for a future retrace rather than an immediate entry.",
      coreThesis:
        "Best-in-class community structure for its narrative, deep enough liquidity for institutional-size memecoin flow, and a dev team with a clean multi-launch record.",
      memeLore:
        "A long-running hardware-wallet joke that predates this cycle by years, giving it durability most memes lack.",
      catalystNarrative:
        "Attention already expanded. Further expansion likely requires a new external event rather than continuation of the current one.",
      distribution: {
        holderCount: 15_400,
        top10Pct: 12.1,
        top20Pct: 16.8,
        insiderEstimatePct: 1.4,
        bundledSupplyPct: 0.6,
        smartWalletPct: 9.8,
        holderGrowth24hPct: 4.2,
      },
      walletSignals: [
        {
          id: "ws-7",
          tokenId: "opp-ledgerdog",
          kind: "LARGE_DISTRIBUTION",
          label: "Large holders distributing",
          detail: "Three top-20 wallets reduced exposure into the vertical move.",
          sentiment: "negative",
          observedAt: "2026-08-29T05:45:00.000Z",
        },
        {
          id: "ws-8",
          tokenId: "opp-ledgerdog",
          kind: "SMART_ACCUMULATION",
          label: "Smart wallets accumulating",
          detail: "Net smart-wallet flow has flattened after two weeks of accumulation.",
          sentiment: "neutral",
          observedAt: "2026-08-29T04:10:00.000Z",
        },
      ],
      developer: {
        reputation: "TRUSTED",
        previousLaunches: 3,
        successfulLaunches: 3,
        suspiciousLaunches: 0,
        linkedWallets: 2,
        currentOwnershipPct: 0.4,
        note: "Clean multi-launch history with no abrupt exits.",
      },
      liquidity: {
        liquidityUsd: 720_000,
        volumeToLiquidityRatio: 6.8,
        starterPositionUsd: 5_000,
        starterImpactPct: 0.3,
        largerPositionUsd: 25_000,
        largerImpactPct: 1.4,
        exitImpactPct: 1.9,
        note: "Deepest book in the current shortlist. Exitability is not a constraint here.",
      },
      mindshare: {
        tokenId: "opp-ledgerdog",
        capturedAt: "2026-08-29T11:00:00.000Z",
        mentionVelocityPerHour: 104,
        uniqueAuthors24h: 980,
        engagementQuality: "MEDIUM",
        narrativePropagation: "VIRAL",
        organicSharePct: 64,
        mindshareScore: 84,
      },
      chart: {
        entryState: "EXTENDED",
        entryScore: 3,
        structure: "Vertical expansion with no nearby support",
        recentImpulse: "+95% in 26 hours with widening range",
        pullbackDepthPct: 6,
        higherLowStatus: "No recent higher low to reference",
        distanceFromBasePct: 138,
        buyerSellerBehavior: "Late buyers chasing; upper-wick distribution visible",
        volumeBehavior: "Volume expanding on up-moves, thin on retraces — climactic",
        riskDefinitionLevel: "Nearest structural invalidation is ~38% below price",
        series: series(31, 60, 2.4),
      },
      bullCase:
        "Deep liquidity and durable meme mean continuation is possible, and a controlled retrace would create an excellent entry within days.",
      bearCase:
        "Climactic volume plus top-20 distribution into strength is the classic profile of a local top. Buying here risks a 35%+ drawdown before any thesis-level invalidation triggers.",
      scenarios: {
        failure: "$1.5M–$2.5M",
        base: "$8M–$12M",
        reflexive: "$25M–$40M",
      },
      invalidation: [
        "Break of the last consolidation shelf",
        "Continued distribution from top-20 wallets",
        "Organic share falling below 50%",
        "Holder growth turning negative",
      ],
    },
  },
];

export const SCANNED_CANDIDATES: ScannedCandidate[] = [
  {
    id: "c1",
    name: "GTAMEMES",
    ticker: "GTA",
    marketCapUsd: 850_000,
    liquidityUsd: 140_000,
    quantScore: 91,
    stageReached: "SHORTLIST",
    outcome: "Promoted to shortlist — thesis 84 / evidence 89",
  },
  {
    id: "c2",
    name: "Ledger Dog",
    ticker: "LDOG",
    marketCapUsd: 6_200_000,
    liquidityUsd: 720_000,
    quantScore: 89,
    stageReached: "SHORTLIST",
    outcome: "Promoted — flagged EXTENDED, tracked for retrace",
  },
  {
    id: "c3",
    name: "Lumen Cat",
    ticker: "LUMEN",
    marketCapUsd: 410_000,
    liquidityUsd: 72_000,
    quantScore: 84,
    stageReached: "SHORTLIST",
    outcome: "Promoted with low evidence confidence (54)",
  },
  {
    id: "c4",
    name: "Sunday Frog",
    ticker: "SFROG",
    marketCapUsd: 320_000,
    liquidityUsd: 58_000,
    quantScore: 77,
    stageReached: "DEEP_RESEARCH",
    outcome: "Rejected — thesis 61, derivative meme with no catalyst",
  },
  {
    id: "c5",
    name: "Terminal Cow",
    ticker: "MOO",
    marketCapUsd: 1_100_000,
    liquidityUsd: 96_000,
    quantScore: 74,
    stageReached: "DEEP_RESEARCH",
    outcome: "Rejected — top 10 hold 41%, distribution risk",
  },
  {
    id: "c6",
    name: "Pixel Hydra",
    ticker: "HYDRA",
    marketCapUsd: 240_000,
    liquidityUsd: 31_000,
    quantScore: 68,
    stageReached: "AI_TRIAGE",
    outcome: "Rejected — narrative recycled from a dead 2025 token",
  },
  {
    id: "c7",
    name: "Grand Bonk",
    ticker: "GBONK",
    marketCapUsd: 180_000,
    liquidityUsd: 24_000,
    quantScore: 61,
    stageReached: "QUANT_RANKING",
    outcome: "Rejected — volume/liquidity profile indicates wash trading",
  },
  {
    id: "c8",
    name: "Vault Ape",
    ticker: "VAPE",
    marketCapUsd: 95_000,
    liquidityUsd: 12_000,
    quantScore: 44,
    stageReached: "HARD_FILTERS",
    outcome: "Rejected — liquidity below floor, dev on blacklist",
  },
];

export const TRADE_OUTCOMES: TradeOutcome[] = [
  {
    id: "h1",
    token: { id: "h1", name: "Neon Otter", ticker: "OTTER" },
    thesisScoreAtDiscovery: 86,
    entryScoreAtDiscovery: 8,
    marketCapAtDiscoveryUsd: 640_000,
    peakMarketCapUsd: 7_900_000,
    maxGainPct: 1134,
    maxDrawdownPct: -18,
    status: "TARGET_HIT",
    discoveredAt: "2026-07-14T09:30:00.000Z",
  },
  {
    id: "h2",
    token: { id: "h2", name: "Boardroom Cat", ticker: "BRCAT" },
    thesisScoreAtDiscovery: 81,
    entryScoreAtDiscovery: 7,
    marketCapAtDiscoveryUsd: 1_200_000,
    peakMarketCapUsd: 4_100_000,
    maxGainPct: 242,
    maxDrawdownPct: -26,
    status: "TARGET_HIT",
    discoveredAt: "2026-07-22T16:05:00.000Z",
  },
  {
    id: "h3",
    token: { id: "h3", name: "Solar Toad", ticker: "STOAD" },
    thesisScoreAtDiscovery: 74,
    entryScoreAtDiscovery: 6,
    marketCapAtDiscoveryUsd: 380_000,
    peakMarketCapUsd: 910_000,
    maxGainPct: 139,
    maxDrawdownPct: -47,
    status: "EXPIRED",
    discoveredAt: "2026-08-02T11:45:00.000Z",
  },
  {
    id: "h4",
    token: { id: "h4", name: "Midnight Mule", ticker: "MULE" },
    thesisScoreAtDiscovery: 72,
    entryScoreAtDiscovery: 5,
    marketCapAtDiscoveryUsd: 520_000,
    peakMarketCapUsd: 610_000,
    maxGainPct: 17,
    maxDrawdownPct: -63,
    status: "INVALIDATED",
    discoveredAt: "2026-08-06T20:15:00.000Z",
  },
  {
    id: "h5",
    token: { id: "h5", name: "Archive Bird", ticker: "ARBD" },
    thesisScoreAtDiscovery: 83,
    entryScoreAtDiscovery: 9,
    marketCapAtDiscoveryUsd: 760_000,
    peakMarketCapUsd: 5_400_000,
    maxGainPct: 610,
    maxDrawdownPct: -22,
    status: "TARGET_HIT",
    discoveredAt: "2026-08-12T08:20:00.000Z",
  },
  {
    id: "h6",
    token: { id: "h6", name: "Quiet Whale", ticker: "QWHL" },
    thesisScoreAtDiscovery: 78,
    entryScoreAtDiscovery: 7,
    marketCapAtDiscoveryUsd: 940_000,
    peakMarketCapUsd: 2_300_000,
    maxGainPct: 145,
    maxDrawdownPct: -31,
    status: "OPEN",
    discoveredAt: "2026-08-25T13:00:00.000Z",
  },
];

/* ------------------------------------------------------------------ */
/* Accessors — swap these for API / Supabase calls later.              */
/* ------------------------------------------------------------------ */

export function getScanSummary(): ScanSummary {
  return SCAN_SUMMARY;
}

export function getOpportunities(): Opportunity[] {
  return OPPORTUNITIES;
}

export function getOpportunity(id: string): Opportunity | undefined {
  return OPPORTUNITIES.find((o) => o.id === id);
}

export function getScannedCandidates(): ScannedCandidate[] {
  return SCANNED_CANDIDATES;
}

export function getTradeOutcomes(): TradeOutcome[] {
  return TRADE_OUTCOMES;
}
