/**
 * Entry State v1 orchestrator (server-only).
 *
 * Consumes: existing thesis reports + persisted research evidence + CURRENT
 * market/participation evidence + stored OHLCV history.
 * Produces: an append-only, time-series `entry_state_evaluations` row.
 *
 * It never re-runs Deep Research, never touches Thesis Score or Evidence
 * Confidence, never alters scanner selection or Quantitative Research
 * Priority, and never produces sizing, stops or trade actions.
 *
 * Hindsight firewall: for a historical (`asOf`) evaluation every market series
 * — candles AND snapshots — is cut strictly at the evaluation timestamp.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assessRecentMarketDamage } from "../scanner/market-damage";
import { ensurePriceHistory, loadStoredCandles } from "../scanner/price-history.server";
import { refreshTokenMarket } from "../market-refresh.server";
import {
  ENTRY_FEATURE_VERSION,
  ENTRY_POLICY_VERSION,
  assessEntryEligibility,
  classifyDivergence,
  mapEntryState,
  type DivergenceResult,
  type EntryComponentScores,
  type EntryStateV1,
} from "./contracts";
import { computeTimingFeatures, type EntryCandle, type TimingFeatures } from "./features";
import { buildRationale, scoreEntry, type EntryContext } from "./scoring";

type Row = Record<string, unknown>;

export type EntryMode = "production" | "calibration";

export interface EntryEvaluationResult {
  id: string | null;
  mint: string;
  symbol: string | null;
  name: string | null;
  state: EntryStateV1;
  previousState: EntryStateV1 | null;
  entryScore: number | null;
  components: EntryComponentScores | null;
  divergence: string;
  rationale: string | null;
  strongestPositiveSignal: string | null;
  strongestEntryRisk: string | null;
  whatWouldImproveEntry: string[];
  whatWouldBreakEntry: string[];
  evidenceGaps: string[];
  marketEvidenceAt: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  thesisVerdict: string | null;
  eligibilityReasons: string[];
  error: string | null;
}

export interface EntryBatchResult {
  mode: EntryMode;
  isCalibration: boolean;
  policyVersion: string;
  featureVersion: string;
  evaluated: number;
  providerRequests: number;
  distribution: Record<string, number>;
  results: EntryEvaluationResult[];
  code: "OK" | "NO_THESIS_REPORTS";
}

interface ThesisInput {
  thesisReportId: string;
  tokenId: string | null;
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: string | null;
  researchPacketId: string | null;
  researchPacketVersion: string | null;
  deepResearchReportId: string | null;
  setups: string[];
  createdAt: string;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function loadThesisInputs(options: {
  isCalibration: boolean;
  mints?: string[];
  limit: number;
}): Promise<ThesisInput[]> {
  let query = supabaseAdmin
    .from("thesis_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);
  if (options.mints?.length) query = query.in("mint", options.mints);
  else if (!options.isCalibration) query = query.eq("is_calibration", false);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const out: ThesisInput[] = [];
  for (const r of ((data as Row[]) ?? [])) {
    const mint = r["mint"] as string;
    if (seen.has(mint)) continue;
    seen.add(mint);
    out.push({
      thesisReportId: r["id"] as string,
      tokenId: (r["token_id"] as string) ?? null,
      mint,
      chain: (r["chain"] as string) ?? "solana",
      symbol: (r["symbol"] as string) ?? null,
      name: (r["name"] as string) ?? null,
      thesisScore: num(r["thesis_score"]),
      evidenceConfidence: num(r["evidence_confidence"]),
      verdict: (r["verdict"] as string) ?? null,
      researchPacketId: (r["research_packet_id"] as string) ?? null,
      researchPacketVersion: (r["research_packet_version"] as string) ?? null,
      deepResearchReportId: (r["deep_research_report_id"] as string) ?? null,
      setups: (r["setups"] as string[]) ?? [],
      createdAt: (r["created_at"] as string) ?? "",
    });
    if (out.length >= options.limit) break;
  }
  return out;
}

interface MarketEvidence {
  snapshotId: string | null;
  observedAt: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume1h: number | null;
  volume24h: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  valid: boolean;
  refreshed: boolean;
  error: string | null;
}

const INVALID_MARKET_LIQUIDITY = 100;

async function latestSnapshot(
  tokenId: string | null,
  atOrBefore: string | null,
): Promise<MarketEvidence> {
  const empty: MarketEvidence = {
    snapshotId: null,
    observedAt: null,
    priceUsd: null,
    marketCap: null,
    liquidityUsd: null,
    volume1h: null,
    volume24h: null,
    priceChange1h: null,
    priceChange6h: null,
    priceChange24h: null,
    valid: false,
    refreshed: false,
    error: null,
  };
  if (!tokenId) return { ...empty, error: "No persisted token for this mint." };

  let query = supabaseAdmin
    .from("token_snapshots")
    .select("*")
    .eq("token_id", tokenId)
    .order("captured_at", { ascending: false })
    .limit(1);
  // Historical evaluation: never read an observation from after evaluation time.
  if (atOrBefore) query = query.lte("captured_at", atOrBefore);

  const { data } = await query.maybeSingle();
  if (!data) return { ...empty, error: "No market observation available." };
  const r = data as Row;
  const liquidity = num(r["liquidity_usd"]);
  return {
    snapshotId: r["id"] as string,
    observedAt: (r["captured_at"] as string) ?? null,
    priceUsd: num(r["price_usd"]),
    marketCap: num(r["market_cap"]),
    liquidityUsd: liquidity,
    volume1h: num(r["volume_1h"]),
    volume24h: num(r["volume_24h"]),
    priceChange1h: num(r["price_change_1h"]),
    priceChange6h: num(r["price_change_6h"]),
    priceChange24h: num(r["price_change_24h"]),
    valid: num(r["price_usd"]) !== null && (liquidity === null || liquidity >= INVALID_MARKET_LIQUIDITY),
    refreshed: false,
    error: null,
  };
}

interface ScanContext {
  universe: string | null;
  structural: string | null;
  participationStatus: EntryContext["participationStatus"];
  breadth: EntryContext["breadth"];
  trades1h: number | null;
  trades24h: number | null;
  setups: string[];
  sourceScanId: string | null;
}

async function loadScanContext(mint: string, atOrBefore: string | null): Promise<ScanContext> {
  const empty: ScanContext = {
    universe: null,
    structural: null,
    participationStatus: null,
    breadth: null,
    trades1h: null,
    trades24h: null,
    setups: [],
    sourceScanId: null,
  };
  let query = supabaseAdmin
    .from("scan_candidates")
    .select(
      "scan_run_id, universe_eligibility, structural_status, participation_status, participation_detail, trades_1h, trades_24h, discovery_lanes, created_at",
    )
    .eq("contract_address", mint)
    .order("created_at", { ascending: false })
    .limit(1);
  if (atOrBefore) query = query.lte("created_at", atOrBefore);
  const { data } = await query.maybeSingle();
  if (!data) return empty;
  const r = data as Row;
  const detail = (r["participation_detail"] as Record<string, unknown> | null) ?? null;
  const dimensions = (detail?.["dimensions"] as Record<string, unknown> | null) ?? null;
  const breadthRaw = (dimensions?.["breadth"] as Record<string, unknown> | null)?.["status"];
  return {
    universe: (r["universe_eligibility"] as string) ?? null,
    structural: (r["structural_status"] as string) ?? null,
    participationStatus: ((r["participation_status"] as string) ?? null) as ScanContext["participationStatus"],
    breadth: (typeof breadthRaw === "string" ? breadthRaw : null) as ScanContext["breadth"],
    trades1h: num(r["trades_1h"]),
    trades24h: num(r["trades_24h"]),
    setups: (r["discovery_lanes"] as string[]) ?? [],
    sourceScanId: (r["scan_run_id"] as string) ?? null,
  };
}

async function previousEvaluation(mint: string): Promise<{
  state: EntryStateV1;
  stateChangedAt: string | null;
} | null> {
  const { data } = await supabaseAdmin
    .from("entry_state_evaluations")
    .select("state, state_changed_at")
    .eq("mint", mint)
    .order("evaluated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as Row;
  return {
    state: (r["state"] as EntryStateV1) ?? "UNKNOWN",
    stateChangedAt: (r["state_changed_at"] as string) ?? null,
  };
}

export interface RunEntryStateOptions {
  mode?: EntryMode;
  limit?: number;
  mints?: string[];
  /** Historical evaluation timestamp. Every series is cut strictly here. */
  asOf?: string;
  /** Skip the live provider refresh (used by historical calibration). */
  refreshMarket?: boolean;
}

export async function runEntryStateBatch(
  options: RunEntryStateOptions = {},
): Promise<EntryBatchResult> {
  const mode: EntryMode = options.mode ?? "calibration";
  const isCalibration = mode === "calibration";
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 25);
  const asOf = options.asOf ?? null;
  const refreshMarket = options.refreshMarket ?? !asOf;

  const inputs = await loadThesisInputs({
    isCalibration,
    limit,
    ...(options.mints?.length ? { mints: options.mints } : {}),
  });
  if (inputs.length === 0) {
    return {
      mode,
      isCalibration,
      policyVersion: ENTRY_POLICY_VERSION,
      featureVersion: ENTRY_FEATURE_VERSION,
      evaluated: 0,
      providerRequests: 0,
      distribution: {},
      results: [],
      code: "NO_THESIS_REPORTS",
    };
  }

  let providerRequests = 0;
  const results: EntryEvaluationResult[] = [];
  for (const input of inputs) {
    try {
      const outcome = await evaluateOne({ input, isCalibration, asOf, refreshMarket });
      providerRequests += outcome.providerRequests;
      results.push(outcome.result);
    } catch (error) {
      results.push({
        id: null,
        mint: input.mint,
        symbol: input.symbol,
        name: input.name,
        state: "UNKNOWN",
        previousState: null,
        entryScore: null,
        components: null,
        divergence: "UNKNOWN",
        rationale: null,
        strongestPositiveSignal: null,
        strongestEntryRisk: null,
        whatWouldImproveEntry: [],
        whatWouldBreakEntry: [],
        evidenceGaps: ["EVALUATION_FAILED"],
        marketEvidenceAt: null,
        thesisScore: input.thesisScore,
        evidenceConfidence: input.evidenceConfidence,
        thesisVerdict: input.verdict,
        eligibilityReasons: [],
        error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
      });
    }
  }

  const distribution: Record<string, number> = {};
  for (const r of results) distribution[r.state] = (distribution[r.state] ?? 0) + 1;

  return {
    mode,
    isCalibration,
    policyVersion: ENTRY_POLICY_VERSION,
    featureVersion: ENTRY_FEATURE_VERSION,
    evaluated: results.length,
    providerRequests,
    distribution,
    results,
    code: "OK",
  };
}

async function evaluateOne(args: {
  input: ThesisInput;
  isCalibration: boolean;
  asOf: string | null;
  refreshMarket: boolean;
}): Promise<{ result: EntryEvaluationResult; providerRequests: number }> {
  const { input, isCalibration, asOf, refreshMarket } = args;
  const evaluatedAt = asOf ?? new Date().toISOString();
  const evaluationUnix = Math.floor(new Date(evaluatedAt).getTime() / 1000);
  let providerRequests = 0;

  const { data: tokenRow } = await supabaseAdmin
    .from("tokens")
    .select("id, token_created_at, pair_created_at, dex_pair_address, symbol, name")
    .eq("contract_address", input.mint)
    .maybeSingle();
  const token = (tokenRow as Row | null) ?? null;
  const tokenId = input.tokenId ?? ((token?.["id"] as string) ?? null);

  // 1. Current market evidence. Entry is time-sensitive: a live evaluation
  //    always tries a fresh observation first. Provider failure never
  //    fabricates a reading — it degrades to UNKNOWN.
  let market: MarketEvidence;
  if (refreshMarket) {
    const refreshed = await refreshTokenMarket(input.mint);
    providerRequests += 1;
    market = await latestSnapshot(tokenId ?? refreshed.tokenId, null);
    market.refreshed = refreshed.ok;
    if (!refreshed.ok) market.error = refreshed.message;
  } else {
    market = await latestSnapshot(tokenId, asOf);
  }

  const scan = await loadScanContext(input.mint, asOf);
  const damage = assessRecentMarketDamage(market.priceChange1h);

  const ageMinutes = market.observedAt
    ? Math.max(0, (new Date(evaluatedAt).getTime() - new Date(market.observedAt).getTime()) / 60000)
    : null;
  const eligibility = assessEntryEligibility({
    researchEligibleNow: scan.universe !== "OUT_OF_SCOPE" && scan.structural !== "FAIL",
    universe: scan.universe,
    structural: scan.structural,
    marketDamage: damage.status,
    marketObservationValid: market.valid,
    marketEvidenceAgeMinutes: ageMinutes,
    // Historical calibration reads the observation that was current then.
    ...(asOf ? { maxMarketAgeMinutes: 24 * 60 } : {}),
  });

  // 2. Price history. Stored candles are the cache; a live run tops up the
  //    tail, a historical run reads storage only.
  let candles: EntryCandle[] = [];
  if (asOf) {
    candles = await loadStoredCandles(input.mint, input.chain);
  } else {
    const launchAt =
      (token?.["token_created_at"] as string) ?? (token?.["pair_created_at"] as string) ?? null;
    if (launchAt) {
      const history = await ensurePriceHistory({
        contractAddress: input.mint,
        chain: input.chain,
        launchAt,
        pairAddress: (token?.["dex_pair_address"] as string) ?? null,
      });
      providerRequests += history.providerRequests;
      candles = history.candles;
    } else {
      candles = await loadStoredCandles(input.mint, input.chain);
    }
  }

  const features: TimingFeatures | null = computeTimingFeatures(candles, evaluationUnix);

  // 3. Price-attention divergence (never decides the state alone).
  const divergence: DivergenceResult = classifyDivergence({
    tradeGrowthRatio:
      scan.trades1h !== null && scan.trades24h !== null && scan.trades24h > 0
        ? scan.trades1h / (scan.trades24h / 24)
        : null,
    volumeGrowthRatio: features?.volumeTrendRatio ?? null,
    priceChangePct: market.priceChange6h ?? market.priceChange1h,
    breadth: scan.breadth,
  });

  const context: EntryContext = {
    liquidityUsd: market.liquidityUsd,
    marketCap: market.marketCap,
    volume1h: market.volume1h,
    volume24h: market.volume24h,
    priceChange1h: market.priceChange1h,
    priceChange6h: market.priceChange6h,
    priceChange24h: market.priceChange24h,
    participationStatus: scan.participationStatus,
    breadth: scan.breadth,
    damageStatus: damage.status,
    setups: scan.setups.length ? scan.setups : input.setups,
    researchAgeHours: input.createdAt
      ? (new Date(evaluatedAt).getTime() - new Date(input.createdAt).getTime()) / 3_600_000
      : null,
  };

  const score = features ? scoreEntry({ features, context, divergence: divergence.state }) : null;

  const mapping = mapEntryState({
    components: score?.components ?? { structure: 0, extension: 0, volumeFlow: 0, riskDefinition: 0 },
    total: score?.total ?? 0,
    structureVerdict: score?.structureVerdict ?? "UNKNOWN",
    extensionVerdict: score?.extensionVerdict ?? "UNKNOWN",
    confirmations: score?.confirmations ?? 0,
    divergence: divergence.state,
    evidenceUsable: eligibility.evidenceUsable,
    damageFail: damage.status === "FAIL",
    hasStructuralHistory: features !== null,
  });

  const previous = await previousEvaluation(input.mint);
  const changed = !previous || previous.state !== mapping.state;
  const stateChangedAt = changed ? evaluatedAt : (previous?.stateChangedAt ?? evaluatedAt);

  const gaps = [...(score?.evidenceGaps ?? []), ...eligibility.reasons];
  if (!features) gaps.push("PRICE_HISTORY_INSUFFICIENT");
  if (!market.valid) gaps.push("CURRENT_MARKET_EVIDENCE_UNAVAILABLE");

  const rationale =
    features && score
      ? buildRationale({ state: mapping.state, score, features, divergence: divergence.state })
      : "Current market evidence is missing or stale — no timing judgement is possible.";

  const { data: inserted, error } = await supabaseAdmin
    .from("entry_state_evaluations")
    .insert({
      token_id: tokenId,
      mint: input.mint,
      chain: input.chain,
      symbol: input.symbol ?? ((token?.["symbol"] as string) ?? null),
      name: input.name ?? ((token?.["name"] as string) ?? null),
      thesis_report_id: input.thesisReportId,
      research_packet_id: input.researchPacketId,
      research_packet_version: input.researchPacketVersion,
      deep_research_report_id: input.deepResearchReportId,
      source_scan_id: scan.sourceScanId,
      market_snapshot_id: market.snapshotId,
      evaluated_at: evaluatedAt,
      market_evidence_at: market.observedAt,
      entry_policy_version: ENTRY_POLICY_VERSION,
      feature_version: ENTRY_FEATURE_VERSION,
      is_calibration: isCalibration,
      state: mapping.state,
      previous_state: previous?.state ?? null,
      state_changed_at: stateChangedAt,
      entry_score: score?.total ?? null,
      score_structure: score?.components.structure ?? null,
      score_extension: score?.components.extension ?? null,
      score_volume_flow: score?.components.volumeFlow ?? null,
      score_risk_definition: score?.components.riskDefinition ?? null,
      component_scores: (score?.components ?? null) as never,
      timing_features: (features ?? null) as never,
      price_attention_divergence: divergence.state,
      divergence_detail: divergence.detail as never,
      rationale,
      strongest_positive_signal: score?.strongestPositiveSignal ?? null,
      strongest_entry_risk: score?.strongestEntryRisk ?? null,
      what_would_improve_entry: score?.whatWouldImproveEntry ?? [],
      what_would_break_entry: score?.whatWouldBreakEntry ?? [],
      evidence_gaps: [...new Set(gaps)],
      current_eligibility: {
        actionable: eligibility.actionable,
        reasons: eligibility.reasons,
        universe: scan.universe,
        structural: scan.structural,
        marketDamage: damage.status,
        mappingReasons: mapping.reasons,
      } as never,
      narrative_timing_confidence:
        context.researchAgeHours === null
          ? "UNKNOWN"
          : context.researchAgeHours > 48
            ? "LOW"
            : context.researchAgeHours > 12
              ? "MODERATE"
              : "HIGH",
      thesis_score: input.thesisScore,
      evidence_confidence: input.evidenceConfidence,
      thesis_verdict: input.verdict,
      setups: context.setups,
      price_usd: market.priceUsd,
      market_cap: market.marketCap,
      liquidity_usd: market.liquidityUsd,
      diagnostics: {
        marketRefreshed: market.refreshed,
        marketError: market.error,
        candleCount: candles.length,
        notes: score?.notes ?? [],
        asOf,
      } as never,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return {
    providerRequests,
    result: {
      id: (inserted as Row)["id"] as string,
      mint: input.mint,
      symbol: input.symbol,
      name: input.name,
      state: mapping.state,
      previousState: previous?.state ?? null,
      entryScore: score?.total ?? null,
      components: score?.components ?? null,
      divergence: divergence.state,
      rationale,
      strongestPositiveSignal: score?.strongestPositiveSignal ?? null,
      strongestEntryRisk: score?.strongestEntryRisk ?? null,
      whatWouldImproveEntry: score?.whatWouldImproveEntry ?? [],
      whatWouldBreakEntry: score?.whatWouldBreakEntry ?? [],
      evidenceGaps: [...new Set(gaps)],
      marketEvidenceAt: market.observedAt,
      thesisScore: input.thesisScore,
      evidenceConfidence: input.evidenceConfidence,
      thesisVerdict: input.verdict,
      eligibilityReasons: eligibility.reasons,
      error: market.valid ? null : "CURRENT ENTRY EVIDENCE UNAVAILABLE",
    },
  };
}

export interface PersistedEligibility {
  actionable: boolean;
  reasons: string[];
  universe: string | null;
  structural: string | null;
  marketDamage: string;
  mappingReasons: string[];
}

export interface EntryEvaluationSummary {
  id: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  isCalibration: boolean;
  state: EntryStateV1;
  previousState: string | null;
  stateChangedAt: string | null;
  evaluatedAt: string;
  marketEvidenceAt: string | null;
  entryScore: number | null;
  components: EntryComponentScores | null;
  timingFeatures: TimingFeatures | null;
  divergence: string;
  divergenceDetail: DivergenceResult["detail"] | null;
  rationale: string | null;
  strongestPositiveSignal: string | null;
  strongestEntryRisk: string | null;
  whatWouldImproveEntry: string[];
  whatWouldBreakEntry: string[];
  evidenceGaps: string[];
  eligibility: PersistedEligibility | null;
  narrativeTimingConfidence: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  thesisVerdict: string | null;
  setups: string[];
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  policyVersion: string;
  history: { state: string; evaluatedAt: string; entryScore: number | null }[];
}

/** Latest evaluation per mint, plus that mint's recent transition history. */
export async function loadEntryEvaluations(limit = 20): Promise<EntryEvaluationSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("entry_state_evaluations")
    .select("*")
    .order("evaluated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data as Row[]) ?? [];

  const historyByMint = new Map<string, EntryEvaluationSummary["history"]>();
  for (const r of rows) {
    const mint = r["mint"] as string;
    const list = historyByMint.get(mint) ?? [];
    list.push({
      state: (r["state"] as string) ?? "UNKNOWN",
      evaluatedAt: (r["evaluated_at"] as string) ?? "",
      entryScore: num(r["entry_score"]),
    });
    historyByMint.set(mint, list);
  }

  const seen = new Set<string>();
  const out: EntryEvaluationSummary[] = [];
  for (const r of rows) {
    const mint = r["mint"] as string;
    if (seen.has(mint)) continue;
    seen.add(mint);
    out.push({
      id: r["id"] as string,
      mint,
      symbol: (r["symbol"] as string) ?? null,
      name: (r["name"] as string) ?? null,
      isCalibration: Boolean(r["is_calibration"]),
      state: (r["state"] as EntryStateV1) ?? "UNKNOWN",
      previousState: (r["previous_state"] as string) ?? null,
      stateChangedAt: (r["state_changed_at"] as string) ?? null,
      evaluatedAt: (r["evaluated_at"] as string) ?? "",
      marketEvidenceAt: (r["market_evidence_at"] as string) ?? null,
      entryScore: num(r["entry_score"]),
      components: (r["component_scores"] as EntryComponentScores) ?? null,
      timingFeatures: (r["timing_features"] as TimingFeatures) ?? null,
      divergence: (r["price_attention_divergence"] as string) ?? "UNKNOWN",
      divergenceDetail: (r["divergence_detail"] as DivergenceResult["detail"]) ?? null,
      rationale: (r["rationale"] as string) ?? null,
      strongestPositiveSignal: (r["strongest_positive_signal"] as string) ?? null,
      strongestEntryRisk: (r["strongest_entry_risk"] as string) ?? null,
      whatWouldImproveEntry: (r["what_would_improve_entry"] as string[]) ?? [],
      whatWouldBreakEntry: (r["what_would_break_entry"] as string[]) ?? [],
      evidenceGaps: (r["evidence_gaps"] as string[]) ?? [],
      eligibility: (r["current_eligibility"] as PersistedEligibility) ?? null,
      narrativeTimingConfidence: (r["narrative_timing_confidence"] as string) ?? null,
      thesisScore: num(r["thesis_score"]),
      evidenceConfidence: num(r["evidence_confidence"]),
      thesisVerdict: (r["thesis_verdict"] as string) ?? null,
      setups: (r["setups"] as string[]) ?? [],
      priceUsd: num(r["price_usd"]),
      marketCap: num(r["market_cap"]),
      liquidityUsd: num(r["liquidity_usd"]),
      policyVersion: (r["entry_policy_version"] as string) ?? ENTRY_POLICY_VERSION,
      history: (historyByMint.get(mint) ?? []).slice(0, 8),
    });
    if (out.length >= limit) break;
  }
  return out;
}
