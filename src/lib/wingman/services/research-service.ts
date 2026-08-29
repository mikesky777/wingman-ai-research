import { supabase } from "../data/supabase";
import { formatUsd } from "../format";
import { MarketDataService } from "./market-data-service";
import { simulatedDetailFor } from "./simulated-detail";
import { toDomainToken, type TokenRow } from "./token-data-service";
import type { EntryState, Opportunity, OpportunityStage, StructuralRiskKey } from "../types";

interface ReportRow {
  id: string;
  token_id: string;
  created_at: string;
  thesis_score: number;
  evidence_confidence: number;
  entry_score: number;
  structural_multiplier: number;
  meme_quality_score: number | null;
  catalyst_score: number | null;
  distribution_score: number | null;
  liquidity_score: number | null;
  dev_integrity_score: number | null;
  chart_entry_score: number | null;
  mindshare_score: number | null;
  valuation_score: number | null;
  entry_state: EntryState;
  opportunity_stage: OpportunityStage;
  wingman_verdict: string | null;
  why_now: string | null;
  core_thesis: string | null;
  meme_lore: string | null;
  catalyst_analysis: string | null;
  bull_case: string | null;
  bear_case: string | null;
  invalidation: string[] | null;
  failure_mc_low: number | null;
  failure_mc_high: number | null;
  base_mc_low: number | null;
  base_mc_high: number | null;
  bull_mc_low: number | null;
  bull_mc_high: number | null;
}

interface OpportunityRow {
  id: string;
  rank: number;
  created_at: string;
  token: TokenRow;
  report: ReportRow | null;
}

const REPORT_FIELDS = `id, token_id, created_at, thesis_score, evidence_confidence, entry_score, structural_multiplier,
  meme_quality_score, catalyst_score, distribution_score, liquidity_score, dev_integrity_score, chart_entry_score,
  mindshare_score, valuation_score, entry_state, opportunity_stage, wingman_verdict, why_now, core_thesis, meme_lore,
  catalyst_analysis, bull_case, bear_case, invalidation, failure_mc_low, failure_mc_high, base_mc_low, base_mc_high,
  bull_mc_low, bull_mc_high`;

const TOKEN_FIELDS = "id, contract_address, chain, symbol, name, token_created_at, created_at";

function structuralRiskFor(multiplier: number): StructuralRiskKey {
  if (multiplier >= 1) return "CLEAN";
  if (multiplier >= 0.75) return "ONE_CONCERN";
  if (multiplier >= 0.5) return "SIGNIFICANT";
  if (multiplier > 0) return "BORDERLINE";
  return "FATAL";
}

function range(low: number | null, high: number | null): string {
  if (low == null || high == null) return "—";
  return `${formatUsd(low)}–${formatUsd(high)}`;
}

function buildOpportunity(row: OpportunityRow, snapshot: ReturnType<typeof emptySnapshot>): Opportunity | null {
  const report = row.report;
  if (!report) return null;
  const token = toDomainToken(row.token);
  const detail = simulatedDetailFor(token.ticker);

  return {
    id: row.id,
    rank: row.rank,
    token,
    snapshot,
    thesisScore: report.thesis_score,
    evidenceConfidence: report.evidence_confidence,
    entryScore: report.entry_score,
    entryState: report.entry_state,
    stage: report.opportunity_stage,
    structuralRisk: structuralRiskFor(Number(report.structural_multiplier)),
    scoreChange: detail.scoreChange,
    lastAnalyzedAt: report.created_at,
    thesisBreakdown: {
      memeQuality: Number(report.meme_quality_score ?? 0),
      catalystNarrative: Number(report.catalyst_score ?? 0),
      distribution: Number(report.distribution_score ?? 0),
      liquidity: Number(report.liquidity_score ?? 0),
      devIntegrity: Number(report.dev_integrity_score ?? 0),
      chartEntry: Number(report.chart_entry_score ?? 0),
      mindshare: Number(report.mindshare_score ?? 0),
      valuation: Number(report.valuation_score ?? 0),
    },
    report: {
      tokenId: token.id,
      generatedAt: report.created_at,
      verdict: report.wingman_verdict ?? "",
      whyNow: report.why_now ?? "",
      coreThesis: report.core_thesis ?? "",
      memeLore: report.meme_lore ?? "",
      catalystNarrative: report.catalyst_analysis ?? "",
      distribution: detail.distribution,
      walletSignals: detail.walletSignals,
      developer: detail.developer,
      liquidity: detail.liquidity,
      mindshare: detail.mindshare,
      chart: { ...detail.chart, entryState: report.entry_state, entryScore: report.entry_score },
      bullCase: report.bull_case ?? "",
      bearCase: report.bear_case ?? "",
      scenarios: {
        failure: range(report.failure_mc_low, report.failure_mc_high),
        base: range(report.base_mc_low, report.base_mc_high),
        reflexive: range(report.bull_mc_low, report.bull_mc_high),
      },
      invalidation: report.invalidation ?? [],
    },
  };
}

function emptySnapshot(tokenId: string) {
  return {
    tokenId,
    capturedAt: new Date().toISOString(),
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume24hUsd: 0,
    priceUsd: 0,
    holderCount: 0,
  };
}

/** ResearchService — immutable research reports and promoted opportunities. */
export const ResearchService = {
  /** Currently promoted shortlist. May legitimately be empty. */
  async activeOpportunities(): Promise<Opportunity[]> {
    const { data, error } = await supabase
      .from("opportunities")
      .select(`id, rank, created_at, token:tokens!inner(${TOKEN_FIELDS}), report:research_reports(${REPORT_FIELDS})`)
      .eq("is_active", true)
      .order("rank", { ascending: true });
    if (error) throw error;

    const rows = data as unknown as OpportunityRow[];
    const snapshots = await MarketDataService.latestByToken(rows.map((r) => r.token.id));
    return rows
      .map((r) => buildOpportunity(r, snapshots[r.token.id] ?? emptySnapshot(r.token.id)))
      .filter((o): o is Opportunity => Boolean(o));
  },

  async getOpportunity(id: string): Promise<Opportunity | null> {
    const { data, error } = await supabase
      .from("opportunities")
      .select(`id, rank, created_at, token:tokens!inner(${TOKEN_FIELDS}), report:research_reports(${REPORT_FIELDS})`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as OpportunityRow;
    const snapshots = await MarketDataService.latestByToken([row.token.id]);
    return buildOpportunity(row, snapshots[row.token.id] ?? emptySnapshot(row.token.id));
  },
};
