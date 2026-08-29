/**
 * Scanner Workbench server helpers (server-only).
 *
 * Three on-demand operations that reuse EXISTING deterministic services:
 *   - manual CA evaluation through the same scanner pipeline logic
 *   - Birdeye holder enrichment (immutable evidence, never a safety verdict)
 *   - private human calibration labels (never an input to scoring)
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DexScreenerAdapter, isValidSolanaAddress } from "../external/dexscreener";
import { toFailure } from "../external/dexscreener/errors";
import { normalizeIdentity, normalizeSnapshot } from "../external/dexscreener/normalizer";
import { DEFAULT_CHAIN } from "../external/chains";
import { enrichTokenHolders } from "../holder-enrichment.server";
import { appendEvidenceObservations } from "../evidence-persistence.server";
import { evaluateCandidate } from "./evaluate";
import { marketCapBucket } from "./diagnostics";
import { loadTokenContext } from "./persistence.server";
import type { DiscoveredToken, EvaluatedCandidate } from "./types";

export interface ManualEvaluationResult {
  ok: boolean;
  message: string | null;
  contractAddress: string;
  name: string | null;
  symbol: string | null;
  bucket: string;
  candidate: EvaluatedCandidate | null;
}

/**
 * Evaluate a pasted contract address with the SAME deterministic scanner
 * logic used by a live run. Nothing is inserted into any scan ranking.
 */
export async function evaluateContractAddressManually(
  contractAddress: string,
): Promise<ManualEvaluationResult> {
  const address = contractAddress.trim();
  const empty: ManualEvaluationResult = {
    ok: false,
    message: null,
    contractAddress: address,
    name: null,
    symbol: null,
    bucket: "unknown",
    candidate: null,
  };

  if (!isValidSolanaAddress(address)) {
    return { ...empty, message: "Not a valid Solana contract address." };
  }

  try {
    const selection = await DexScreenerAdapter.resolvePrimaryPair(address, { noCache: true });
    const identity = normalizeIdentity(selection.primary, address);
    const snapshot = normalizeSnapshot(selection.primary);
    const pair = selection.primary;

    const buys24h =
      typeof pair.txns?.h24?.buys === "number" ? pair.txns.h24.buys : null;
    const sells24h =
      typeof pair.txns?.h24?.sells === "number" ? pair.txns.h24.sells : null;
    const trades = (b: number | null, s: number | null) =>
      b === null && s === null ? null : (b ?? 0) + (s ?? 0);

    const token: DiscoveredToken = {
      chain: DEFAULT_CHAIN,
      contractAddress: address,
      symbol: identity.symbol,
      name: identity.name,
      imageUrl: identity.imageUrl,
      priceUsd: snapshot.priceUsd,
      marketCap: snapshot.marketCap,
      fdv: snapshot.fdv,
      liquidityUsd: snapshot.liquidityUsd,
      volume5m: snapshot.volume5m,
      volume1h: snapshot.volume1h,
      volume6h: snapshot.volume6h,
      volume24h: snapshot.volume24h,
      trades5m: trades(
        typeof pair.txns?.m5?.buys === "number" ? pair.txns.m5.buys : null,
        typeof pair.txns?.m5?.sells === "number" ? pair.txns.m5.sells : null,
      ),
      trades1h: trades(snapshot.buys1h, snapshot.sells1h),
      trades6h: trades(
        typeof pair.txns?.h6?.buys === "number" ? pair.txns.h6.buys : null,
        typeof pair.txns?.h6?.sells === "number" ? pair.txns.h6.sells : null,
      ),
      trades24h: trades(buys24h, sells24h),
      buys24h,
      sells24h,
      priceChange5m: snapshot.priceChange5m,
      priceChange1h: snapshot.priceChange1h,
      priceChange6h: snapshot.priceChange6h,
      priceChange24h: snapshot.priceChange24h,
      // DexScreener cannot supply these; they stay unavailable.
      holderCount: null,
      uniqueWallets24h: null,
      listedAt: identity.pairCreatedAt,
      lastTradeAt: null,
      discovery: [
        {
          source: "manual",
          queryId: "manual_contract_address",
          family: "liquidity",
          rank: 0,
          laneHints: [],
        },
      ],
    };

    const context = await loadTokenContext([address]);
    const ctx = context.get(address);

    const candidate = evaluateCandidate(token, {
      history: ctx?.history ?? [],
      ageFallbacks: {
        pairCreatedAt: ctx?.pairCreatedAt ?? identity.pairCreatedAt,
        tokenCreatedAt: ctx?.tokenCreatedAt ?? null,
      },
    });

    return {
      ok: true,
      message: null,
      contractAddress: address,
      name: identity.name,
      symbol: identity.symbol,
      bucket: marketCapBucket(snapshot.marketCap),
      candidate,
    };
  } catch (error) {
    return { ...empty, message: toFailure(error).message };
  }
}

export interface HolderCheckCohort {
  cohort: string;
  walletCount: number | null;
  pctOfSupply: number | null;
}

export interface HolderCheckResult {
  ok: boolean;
  message: string | null;
  /** Structural safety NEVER becomes PASS from holder data alone. */
  structuralSafety: "UNKNOWN" | "PASS" | "CONCERN" | "FAIL";
  tokenSecurity: "NOT_CHECKED";
  capturedAt: string | null;
  walletHolderCount: number | null;
  top10WalletPct: number | null;
  top20WalletPct: number | null;
  cohorts: HolderCheckCohort[];
  observationsPersisted: number;
}

/**
 * On-demand Birdeye holder enrichment for one token. Evidence is appended to
 * the existing immutable evidence store. Overlapping cohorts are reported
 * separately and NEVER summed.
 */
export async function runHolderCheck(input: {
  contractAddress: string;
  tokenId?: string | null;
}): Promise<HolderCheckResult> {
  const address = input.contractAddress.trim();
  const base: HolderCheckResult = {
    ok: false,
    message: null,
    structuralSafety: "UNKNOWN",
    tokenSecurity: "NOT_CHECKED",
    capturedAt: null,
    walletHolderCount: null,
    top10WalletPct: null,
    top20WalletPct: null,
    cohorts: [],
    observationsPersisted: 0,
  };

  if (!isValidSolanaAddress(address)) {
    return { ...base, message: "Not a valid Solana contract address." };
  }

  const capturedAt = new Date().toISOString();
  const result = await enrichTokenHolders({
    contractAddress: address,
    chain: DEFAULT_CHAIN,
    capturedAt,
  });

  let tokenId = input.tokenId ?? null;
  if (!tokenId) {
    const { data } = await supabaseAdmin
      .from("tokens")
      .select("id")
      .eq("contract_address", address)
      .maybeSingle();
    tokenId = (data as { id?: string } | null)?.id ?? null;
  }

  let persisted = 0;
  if (tokenId && result.observations.length > 0) {
    const outcome = await appendEvidenceObservations(result.observations, { tokenId });
    persisted = outcome.inserted;
  }

  const cohorts = (result.profile?.cohorts ?? []).map((c) => ({
    cohort: c.cohort,
    walletCount: c.walletCount,
    pctOfSupply: c.pctOfSupply,
  }));

  // Concentration is a fact; the verdict is deliberately not automated.
  const top10 =
    result.distribution?.top10WalletPctOfTotalSupply ??
    result.profile?.top10WalletPctOfTotalSupply ??
    null;

  return {
    ...base,
    ok: result.ok,
    message: result.failure?.message ?? null,
    capturedAt: result.ok ? capturedAt : null,
    walletHolderCount: result.distribution?.walletHolderCount ?? null,
    top10WalletPct: top10,
    top20WalletPct: result.distribution?.top20WalletPctOfTotalSupply ?? null,
    cohorts,
    observationsPersisted: persisted,
  };
}

export type CalibrationLabel = "UNREVIEWED" | "INTERESTING" | "RESEARCH" | "JUNK";

/** Human calibration labels. Never an input to any scanner computation. */
export async function saveCalibrationLabel(input: {
  tokenId: string;
  scanRunId: string | null;
  label: CalibrationLabel;
  note: string | null;
}): Promise<{ ok: boolean; message: string | null }> {
  const { error } = await supabaseAdmin.from("scanner_labels").upsert(
    {
      token_id: input.tokenId,
      scan_run_id: input.scanRunId,
      label: input.label,
      note: input.note,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "token_id,scan_run_id" },
  );
  return { ok: !error, message: error?.message ?? null };
}
