/**
 * Outcome persistence (server-only, service-role).
 *
 * Runs strictly AFTER candidate persistence and after every selection decision
 * has already been made. Nothing here is read back into the scanner pipeline:
 * priority, hard filters, setup classification, reservations and survivor
 * selection never see an outcome value.
 *
 * Baselines are insert-once. An existing First Seen or First Wingman Call is
 * never overwritten; only derived performance fields are refreshed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  OUTCOME_VERSION,
  buildObservationSeries,
  deriveMilestones,
  deriveOutcome,
  emptyOutcome,
  type CandidateAppearance,
  type Milestone,
  type OutcomeMetrics,
  type SnapshotObservation,
} from "./outcomes";

type Row = Record<string, unknown>;

const PAGE = 1000;

/**
 * PostgREST caps a response at 1000 rows, so every history read pages through
 * `.range()`. Truncated history would silently shift an immutable baseline.
 */
async function fetchAllPages(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

interface ExistingOutcome {
  firstSeen: Milestone | null;
  firstCall: Milestone | null;
}

async function loadExisting(tokenIds: string[]): Promise<Map<string, ExistingOutcome>> {
  const out = new Map<string, ExistingOutcome>();
  for (let i = 0; i < tokenIds.length; i += 200) {
    const chunk = tokenIds.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("token_scanner_outcomes")
      .select(
        "token_id, first_seen_scan_id, first_seen_at, first_seen_price_usd, first_seen_market_cap_usd, first_call_scan_id, first_call_at, first_call_price_usd, first_call_market_cap_usd",
      )
      .in("token_id", chunk);
    if (error) throw new Error(`Could not load outcomes: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      out.set(row["token_id"] as string, {
        firstSeen: milestoneFrom(row, "first_seen"),
        firstCall: milestoneFrom(row, "first_call"),
      });
    }
  }
  return out;
}

function milestoneFrom(row: Row, prefix: "first_seen" | "first_call"): Milestone | null {
  const at = row[`${prefix}_at`] as string | null;
  const scanRunId = row[`${prefix}_scan_id`] as string | null;
  if (!at || !scanRunId) return null;
  return {
    scanRunId,
    at,
    priceUsd: (row[`${prefix}_price_usd`] as number | null) ?? null,
    marketCap: (row[`${prefix}_market_cap_usd`] as number | null) ?? null,
  };
}

async function loadAppearances(tokenIds: string[]): Promise<Map<string, CandidateAppearance[]>> {
  const out = new Map<string, CandidateAppearance[]>();
  for (let i = 0; i < tokenIds.length; i += 100) {
    const chunk = tokenIds.slice(i, i + 100);
    const rows = await fetchAllPages((from, to) =>
      supabaseAdmin
        .from("scan_candidates")
        .select(
          "token_id, scan_run_id, price_usd, market_cap, selected_by_lane_reservation, selected_by_global_ranking, run:scan_runs!inner(id, status, completed_at)",
        )
        .in("token_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const row of rows) {
      const run = row["run"] as { status: string; completed_at: string | null } | null;
      if (!run || run.status !== "completed" || !run.completed_at) continue;
      const tokenId = row["token_id"] as string;
      const list = out.get(tokenId) ?? [];
      list.push({
        scanRunId: row["scan_run_id"] as string,
        completedAt: run.completed_at,
        priceUsd: (row["price_usd"] as number | null) ?? null,
        marketCap: (row["market_cap"] as number | null) ?? null,
        survivor:
          Boolean(row["selected_by_lane_reservation"]) || Boolean(row["selected_by_global_ranking"]),
      });
      out.set(tokenId, list);
    }
  }
  return out;
}

async function loadSnapshots(tokenIds: string[]): Promise<Map<string, SnapshotObservation[]>> {
  const out = new Map<string, SnapshotObservation[]>();
  for (let i = 0; i < tokenIds.length; i += 100) {
    const chunk = tokenIds.slice(i, i + 100);
    let rows: Row[] = [];
    try {
      rows = await fetchAllPages((from, to) =>
        supabaseAdmin
          .from("token_snapshots")
          .select("token_id, captured_at, price_usd, market_cap")
          .in("token_id", chunk)
          .order("captured_at", { ascending: true })
          .range(from, to),
      );
    } catch {
      continue; // Snapshot history is optional; candidate rows remain.
    }
    for (const row of rows) {
      const tokenId = row["token_id"] as string;
      const list = out.get(tokenId) ?? [];
      list.push({
        capturedAt: row["captured_at"] as string,
        priceUsd: (row["price_usd"] as number | null) ?? null,
        marketCap: (row["market_cap"] as number | null) ?? null,
      });
      out.set(tokenId, list);
    }
  }
  return out;
}

export interface OutcomeWriteResult {
  tokensEvaluated: number;
  firstSeenEstablished: number;
  firstCallEstablished: number;
}

/**
 * Recompute outcomes for the given tokens from already-persisted observations.
 * No provider calls are made anywhere in this path.
 */
export async function refreshOutcomes(
  tokenIds: string[],
  addressByTokenId: Map<string, string> = new Map(),
): Promise<OutcomeWriteResult> {
  const unique = [...new Set(tokenIds)].filter(Boolean);
  const result: OutcomeWriteResult = {
    tokensEvaluated: 0,
    firstSeenEstablished: 0,
    firstCallEstablished: 0,
  };
  if (unique.length === 0) return result;

  const [existing, appearances, snapshots] = await Promise.all([
    loadExisting(unique),
    loadAppearances(unique),
    loadSnapshots(unique),
  ]);

  const nowIso = new Date().toISOString();
  const rows: Row[] = [];

  for (const tokenId of unique) {
    const history = appearances.get(tokenId) ?? [];
    if (history.length === 0) continue;

    const derived = deriveMilestones(history);
    const prior = existing.get(tokenId);

    // Insert-once: an established baseline is reused verbatim, never replaced.
    const firstSeen = prior?.firstSeen ?? derived.firstSeen;
    const firstCall = prior?.firstCall ?? derived.firstCall;
    if (!firstSeen) continue;
    if (!prior?.firstSeen) result.firstSeenEstablished += 1;
    if (!prior?.firstCall && firstCall) result.firstCallEstablished += 1;

    const series = buildObservationSeries(history, snapshots.get(tokenId) ?? []);
    const seenOutcome = deriveOutcome({
      baselineAt: firstSeen.at,
      baselinePriceUsd: firstSeen.priceUsd,
      baselineMarketCap: firstSeen.marketCap,
      series,
      nowIso,
    });
    const callOutcome = firstCall
      ? deriveOutcome({
          baselineAt: firstCall.at,
          baselinePriceUsd: firstCall.priceUsd,
          baselineMarketCap: firstCall.marketCap,
          series,
          nowIso,
        })
      : emptyOutcome();

    rows.push(toRow(tokenId, addressByTokenId.get(tokenId) ?? null, firstSeen, firstCall, seenOutcome, callOutcome, nowIso));
    result.tokensEvaluated += 1;
  }

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("token_scanner_outcomes")
      .upsert(chunk as never, { onConflict: "token_id" });
    if (error) throw new Error(`Could not persist outcomes: ${error.message}`);
  }

  return result;
}

function toRow(
  tokenId: string,
  contractAddress: string | null,
  firstSeen: Milestone,
  firstCall: Milestone | null,
  seen: OutcomeMetrics,
  call: OutcomeMetrics,
  nowIso: string,
): Row {
  return {
    token_id: tokenId,
    contract_address: contractAddress,

    first_seen_scan_id: firstSeen.scanRunId,
    first_seen_at: firstSeen.at,
    first_seen_price_usd: firstSeen.priceUsd,
    first_seen_market_cap_usd: firstSeen.marketCap,

    first_call_scan_id: firstCall?.scanRunId ?? null,
    first_call_at: firstCall?.at ?? null,
    first_call_price_usd: firstCall?.priceUsd ?? null,
    first_call_market_cap_usd: firstCall?.marketCap ?? null,

    current_price_usd: seen.currentPriceUsd,
    current_market_cap_usd: seen.currentMarketCap,
    current_observed_at: seen.currentObservedAt,

    price_change_since_first_seen_pct: seen.priceChangePct,
    market_cap_change_since_first_seen_pct: seen.marketCapChangePct,
    max_price_since_first_seen: seen.maxPrice,
    max_market_cap_since_first_seen: seen.maxMarketCap,
    max_gain_since_first_seen_pct: seen.maxGainPct,
    min_price_since_first_seen: seen.minPrice,
    min_market_cap_since_first_seen: seen.minMarketCap,
    max_adverse_change_since_first_seen_pct: seen.maxAdverseChangePct,
    max_peak_to_trough_drawdown_since_first_seen_pct: seen.maxPeakToTroughDrawdownPct,

    price_change_since_first_call_pct: firstCall ? call.priceChangePct : null,
    market_cap_change_since_first_call_pct: firstCall ? call.marketCapChangePct : null,
    max_price_since_first_call: firstCall ? call.maxPrice : null,
    max_market_cap_since_first_call: firstCall ? call.maxMarketCap : null,
    max_gain_since_first_call_pct: firstCall ? call.maxGainPct : null,
    min_price_since_first_call: firstCall ? call.minPrice : null,
    min_market_cap_since_first_call: firstCall ? call.minMarketCap : null,
    max_adverse_change_since_first_call_pct: firstCall ? call.maxAdverseChangePct : null,
    max_peak_to_trough_drawdown_since_first_call_pct: firstCall
      ? call.maxPeakToTroughDrawdownPct
      : null,

    // Peak Since Call. Market-cap % is primary; price % is the fallback view.
    // Null without a First Call baseline — never silently backed by First Seen.
    peak_market_cap_since_call_pct: firstCall ? call.maxGainPct : null,
    peak_since_call_pct: firstCall ? call.maxPriceGainPct : null,
    peak_market_cap_since_call_at: firstCall ? call.maxMarketCapAt : null,
    peak_price_since_call_at: firstCall ? call.maxPriceAt : null,

    elapsed_minutes_since_first_seen: seen.elapsedMinutes,
    elapsed_minutes_since_first_call: firstCall ? call.elapsedMinutes : null,
    observation_count: seen.observationCount,

    horizons_since_first_seen: seen.horizons,
    horizons_since_first_call: firstCall ? call.horizons : null,

    outcome_version: OUTCOME_VERSION,
    last_evaluated_at: nowIso,
  };
}

/** One-time/manual backfill over every token the scanner has ever persisted. */
export async function backfillOutcomes(limit = 20000): Promise<OutcomeWriteResult> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("scan_candidates")
      .select("token_id, contract_address")
      .order("id", { ascending: true })
      .range(from, to),
  );

  const addresses = new Map<string, string>();
  for (const row of rows) {
    const tokenId = row["token_id"] as string;
    const address = (row["contract_address"] as string | null) ?? null;
    if (!addresses.get(tokenId) && address) addresses.set(tokenId, address);
    else if (!addresses.has(tokenId)) addresses.set(tokenId, "");
  }

  const tokenIds = [...addresses.keys()].slice(0, limit);
  return refreshOutcomes(
    tokenIds,
    new Map([...addresses].filter(([, value]) => value !== "")),
  );
}
