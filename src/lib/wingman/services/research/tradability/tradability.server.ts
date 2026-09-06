/**
 * pre_deep_research_tradability/v1 — server side.
 *
 * Performs a FRESH exact-mint market observation (through the shared, rate
 * limited DexScreener infrastructure) immediately before paid Deep Research,
 * and persists the operational result.
 *
 * It never rewrites scan-frozen packet market state, never rewrites historical
 * pair provenance and never mutates an AI Triage decision.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DexScreenerAdapter } from "../../external/dexscreener";
import { ExternalDataError } from "../../external/dexscreener/errors";
import { selectPrimaryPair } from "../../external/dexscreener/pair-selection";
import {
  TRADABILITY_POLICY_VERSION,
  evaluateCurrentTradability,
  type CurrentMarketObservation,
  type TradabilityAssessment,
} from "./tradability";

export const TRADABILITY_MARKET_SOURCE = "dexscreener";

/** Fresh, cache-bypassing, exact-mint market observation. */
export async function observeCurrentMarket(mint: string): Promise<CurrentMarketObservation> {
  const observedAt = new Date().toISOString();
  const base = {
    mint,
    source: TRADABILITY_MARKET_SOURCE,
    observedAt,
  };
  try {
    const pairs = await DexScreenerAdapter.getPairsForToken(mint, { noCache: true });
    const selection = selectPrimaryPair(pairs, mint.trim());
    const primary = selection?.primary ?? null;
    return {
      ...base,
      pairAddress: primary?.pairAddress ?? null,
      dexId: primary?.dexId ?? null,
      liquidityUsd:
        typeof primary?.liquidity?.usd === "number" ? (primary.liquidity.usd as number) : null,
      providerFailed: false,
      providerErrorCode: null,
    };
  } catch (error) {
    const code =
      error instanceof ExternalDataError
        ? error.code
        : error instanceof Error
          ? "PROVIDER_ERROR"
          : "UNKNOWN";
    // A provider failure is missing evidence — never inferred zero liquidity.
    return {
      ...base,
      pairAddress: null,
      dexId: null,
      liquidityUsd: null,
      providerFailed: true,
      providerErrorCode: code,
    };
  }
}

export interface TradabilityCheckInput {
  mint: string;
  chain?: string;
  tokenId?: string | null;
  scanRunId?: string | null;
  triageRunId?: string | null;
  triageDecisionId?: string | null;
  triageDecision?: string | null;
  spendDecisionId?: string | null;
  spendDecision?: string | null;
  isCalibration?: boolean;
  persist?: boolean;
  /** Injectable for tests; defaults to a real fresh provider observation. */
  observe?: (mint: string) => Promise<CurrentMarketObservation>;
}

export interface TradabilityCheck {
  id: string | null;
  observation: CurrentMarketObservation;
  assessment: TradabilityAssessment;
  policyVersion: string;
}

/**
 * Runs the gate for one exact mint and records the operational provenance
 * separately from any packet or historical artefact.
 */
export async function checkCurrentTradability(
  input: TradabilityCheckInput,
): Promise<TradabilityCheck> {
  const observe = input.observe ?? observeCurrentMarket;
  const observation = await observe(input.mint);
  const assessment = evaluateCurrentTradability(observation);

  let id: string | null = null;
  if (input.persist !== false) {
    const { data } = await supabaseAdmin
      .from("research_tradability_checks")
      .insert({
        policy_version: TRADABILITY_POLICY_VERSION,
        is_calibration: input.isCalibration ?? false,
        checked_at: observation.observedAt,
        scan_run_id: input.scanRunId ?? null,
        triage_run_id: input.triageRunId ?? null,
        triage_decision_id: input.triageDecisionId ?? null,
        research_spend_decision_id: input.spendDecisionId ?? null,
        token_id: input.tokenId ?? null,
        mint: input.mint,
        chain: input.chain ?? "solana",
        triage_decision: input.triageDecision ?? null,
        spend_decision: input.spendDecision ?? null,
        resolved_pair_address: observation.pairAddress,
        dex_id: observation.dexId,
        market_source: observation.source,
        liquidity_usd: assessment.liquidityUsd,
        min_liquidity_usd: assessment.minLiquidityUsd,
        result: assessment.result,
        reason_code: assessment.reasonCode,
        provider_error_code: observation.providerErrorCode,
        detail: assessment.detail,
        deep_research_executed: false,
      } as never)
      .select("id")
      .maybeSingle();
    id = (data as { id?: string } | null)?.id ?? null;

    if (input.spendDecisionId) {
      await supabaseAdmin
        .from("research_spend_decisions")
        .update({
          tradability_result: assessment.result,
          tradability_reason_code: assessment.reasonCode,
          tradability_liquidity_usd: assessment.liquidityUsd,
          tradability_pair_address: observation.pairAddress,
          tradability_market_source: observation.source,
          tradability_checked_at: observation.observedAt,
        } as never)
        .eq("id", input.spendDecisionId);
    }
  }

  return { id, observation, assessment, policyVersion: TRADABILITY_POLICY_VERSION };
}

/** Links the check to the Deep Research run that actually executed. */
export async function markTradabilityExecuted(
  checkId: string | null,
  deepResearchRunId: string | null,
): Promise<void> {
  if (!checkId) return;
  await supabaseAdmin
    .from("research_tradability_checks")
    .update({ deep_research_executed: true, deep_research_run_id: deepResearchRunId } as never)
    .eq("id", checkId);
}
