/**
 * Live Calls read model (server-only, read-only).
 *
 * A Live Call is EXACTLY a production THESIS_CALL milestone — the immutable
 * funnel record created only when a production thesis passed every
 * opportunity gate. AI_SHORTLIST, DEEP_RESEARCH_COMPLETED,
 * THESIS_SYNTHESIZED-without-a-call, WATCH/PROMISING near misses and all
 * calibration artefacts are never included.
 *
 * This view is a CURRENT READ MODEL over History's canonical audit trail.
 * Nothing here creates, rewrites or deletes milestones or thesis reports.
 * Entry timing is shown alongside the thesis but can never modify whether
 * the historical THESIS_CALL existed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Row = Record<string, unknown>;

const num = (row: Row, key: string): number | null => {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Liquidity below this means the market cannot realistically be traded. */
const INVALID_MARKET_LIQUIDITY_USD = 100;

export type LiveCallOperationalStatus =
  | { status: "OPERATIONAL"; reason: string }
  | { status: "BLOCKED"; reason: string }
  | { status: "UNKNOWN"; reason: string };

export interface LiveCall {
  tokenId: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  pairAddress: string | null;
  /** Immutable THESIS_CALL record. */
  call: {
    milestoneId: string;
    calledAt: string;
    marketCapAtCall: number | null;
    liquidityAtCall: number | null;
    setupAtCall: string | null;
    thesisPolicyVersion: string | null;
    milestoneVersion: string | null;
  };
  /** The qualifying production thesis (quality judgement, timeless). */
  thesis: {
    reportId: string | null;
    thesisScore: number | null;
    evidenceConfidence: number | null;
    verdict: string | null;
    strongestCatalyst: string | null;
    oneSentenceThesis: string | null;
    strongestBearCase: string | null;
    policyVersion: string | null;
    model: string | null;
  } | null;
  /** Current state — can deteriorate; never rewrites the call. */
  current: {
    operational: LiveCallOperationalStatus;
    latestMarketCap: number | null;
    latestLiquidity: number | null;
    marketAsOf: string | null;
    entryState: string | null;
    entryPolicyVersion: string | null;
    timingResolution: string | null;
    entryEvaluatedAt: string | null;
    entryEvaluationId: string | null;
    priceHistorySource: string | null;
    structuralStatus: string | null;
  };
}

export interface LiveCallsResult {
  count: number;
  calls: LiveCall[];
}

function assessOperational(input: {
  latestLiquidity: number | null;
  entryState: string | null;
  marketAsOf: string | null;
}): LiveCallOperationalStatus {
  if (input.latestLiquidity != null && input.latestLiquidity < INVALID_MARKET_LIQUIDITY_USD) {
    return {
      status: "BLOCKED",
      reason: `Current liquidity $${Math.round(input.latestLiquidity)} is below the $${INVALID_MARKET_LIQUIDITY_USD} valid-market floor.`,
    };
  }
  if (input.entryState === "BROKEN") {
    return {
      status: "BLOCKED",
      reason: "Latest Entry State evaluation is BROKEN (catastrophic market damage).",
    };
  }
  if (input.latestLiquidity == null && input.entryState == null) {
    return { status: "UNKNOWN", reason: "No current market or entry observation available." };
  }
  return {
    status: "OPERATIONAL",
    reason: "No current liquidity or entry blockers observed.",
  };
}

/** Loads every production Live Call. Read-only; never writes. */
export async function loadLiveCalls(): Promise<LiveCallsResult> {
  const { data: milestoneRows, error } = await supabaseAdmin
    .from("token_stage_milestones")
    .select(
      "id, token_id, contract_address, first_entered_at, market_cap_at_entry, liquidity_at_entry, setup_at_entry, policy_version, milestone_version, research_report_id",
    )
    .eq("stage", "THESIS_CALL")
    .order("first_entered_at", { ascending: false });
  if (error) throw new Error(error.message);

  const milestones = (milestoneRows as Row[]) ?? [];
  if (milestones.length === 0) return { count: 0, calls: [] };

  const tokenIds = [...new Set(milestones.map((r) => r["token_id"] as string))];
  const mints = [
    ...new Set(milestones.map((r) => r["contract_address"] as string).filter(Boolean)),
  ];

  const [tokensRes, thesisRes, entryRes, snapshotRes, structuralRes] = await Promise.all([
    supabaseAdmin
      .from("tokens")
      .select("id, contract_address, symbol, name, dex_pair_address")
      .in("id", tokenIds),
    mints.length
      ? supabaseAdmin
          .from("thesis_reports")
          .select(
            "id, mint, thesis_score, evidence_confidence, verdict, strongest_catalyst, one_sentence_thesis, strongest_bear_case, thesis_policy_version, model_provider, model_identifier, created_at",
          )
          .in("mint", mints)
          .eq("is_calibration", false)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Row[], error: null }),
    mints.length
      ? supabaseAdmin
          .from("entry_state_evaluations")
          .select("id, mint, state, entry_policy_version, timing_resolution, price_history_source, evaluated_at")
          .in("mint", mints)
          .eq("is_calibration", false)
          .order("evaluated_at", { ascending: false })
      : Promise.resolve({ data: [] as Row[], error: null }),
    supabaseAdmin
      .from("token_snapshots")
      .select("token_id, market_cap, liquidity_usd, captured_at")
      .in("token_id", tokenIds)
      .order("captured_at", { ascending: false }),
    mints.length
      ? supabaseAdmin
          .from("scan_candidates")
          .select("contract_address, structural_status, created_at")
          .in("contract_address", mints)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  for (const res of [tokensRes, thesisRes, entryRes, snapshotRes, structuralRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const tokenById = new Map<string, Row>();
  for (const t of (tokensRes.data as Row[]) ?? []) tokenById.set(t["id"] as string, t);

  const thesisByMint = new Map<string, Row>();
  for (const r of (thesisRes.data as Row[]) ?? []) {
    const mint = r["mint"] as string;
    if (!thesisByMint.has(mint)) thesisByMint.set(mint, r);
  }

  const entryByMint = new Map<string, Row>();
  for (const r of (entryRes.data as Row[]) ?? []) {
    const mint = r["mint"] as string;
    if (!entryByMint.has(mint)) entryByMint.set(mint, r);
  }

  const snapshotByTokenId = new Map<string, Row>();
  for (const r of (snapshotRes.data as Row[]) ?? []) {
    const id = r["token_id"] as string;
    if (!snapshotByTokenId.has(id)) snapshotByTokenId.set(id, r);
  }

  const structuralByMint = new Map<string, string | null>();
  for (const r of (structuralRes.data as Row[]) ?? []) {
    const mint = r["contract_address"] as string;
    if (!structuralByMint.has(mint)) {
      structuralByMint.set(mint, (r["structural_status"] as string | null) ?? null);
    }
  }

  const calls: LiveCall[] = milestones.map((m) => {
    const tokenId = m["token_id"] as string;
    const token = tokenById.get(tokenId);
    const mint = (m["contract_address"] as string) ?? (token?.["contract_address"] as string) ?? "";
    const thesis = thesisByMint.get(mint) ?? null;
    const entry = entryByMint.get(mint) ?? null;
    const snapshot = snapshotByTokenId.get(tokenId) ?? null;

    const latestLiquidity = snapshot ? num(snapshot, "liquidity_usd") : null;
    const latestMarketCap = snapshot ? num(snapshot, "market_cap") : null;
    const marketAsOf = (snapshot?.["captured_at"] as string) ?? null;
    const entryState = (entry?.["state"] as string) ?? null;

    const modelProvider = (thesis?.["model_provider"] as string) ?? null;
    const modelIdentifier = (thesis?.["model_identifier"] as string) ?? null;
    const model =
      modelProvider || modelIdentifier
        ? [modelProvider, modelIdentifier].filter(Boolean).join("/")
        : null;

    return {
      tokenId,
      mint,
      symbol: (token?.["symbol"] as string | null) ?? null,
      name: (token?.["name"] as string | null) ?? null,
      pairAddress: (token?.["dex_pair_address"] as string | null) ?? null,
      call: {
        milestoneId: m["id"] as string,
        calledAt: m["first_entered_at"] as string,
        marketCapAtCall: num(m, "market_cap_at_entry"),
        liquidityAtCall: num(m, "liquidity_at_entry"),
        setupAtCall: (m["setup_at_entry"] as string | null) ?? null,
        thesisPolicyVersion: (m["policy_version"] as string | null) ?? null,
        milestoneVersion: (m["milestone_version"] as string | null) ?? null,
      },
      thesis: thesis
        ? {
            reportId: (thesis["id"] as string) ?? null,
            thesisScore: num(thesis, "thesis_score"),
            evidenceConfidence: num(thesis, "evidence_confidence"),
            verdict: (thesis["verdict"] as string | null) ?? null,
            strongestCatalyst: (thesis["strongest_catalyst"] as string | null) ?? null,
            oneSentenceThesis: (thesis["one_sentence_thesis"] as string | null) ?? null,
            strongestBearCase: (thesis["strongest_bear_case"] as string | null) ?? null,
            policyVersion: (thesis["thesis_policy_version"] as string | null) ?? null,
            model,
          }
        : null,
      current: {
        operational: assessOperational({ latestLiquidity, entryState, marketAsOf }),
        latestMarketCap,
        latestLiquidity,
        marketAsOf,
        entryState,
        entryPolicyVersion: (entry?.["entry_policy_version"] as string | null) ?? null,
        timingResolution: (entry?.["timing_resolution"] as string | null) ?? null,
        entryEvaluatedAt: (entry?.["evaluated_at"] as string | null) ?? null,
        entryEvaluationId: (entry?.["id"] as string | null) ?? null,
        priceHistorySource: (entry?.["price_history_source"] as string | null) ?? null,
        structuralStatus: structuralByMint.get(mint) ?? null,
      },
    };
  });

  return { count: calls.length, calls };
}
