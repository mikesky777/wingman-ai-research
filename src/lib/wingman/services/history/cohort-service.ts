/**
 * History cohort reads (browser, read-only).
 *
 * A cohort is built from UNIQUE tokens that have a frozen First Wingman Call.
 * Setup membership comes from the persisted candidate row of that token's
 * First Call scan — the existing historical setup/call semantics — so nothing
 * is reclassified and no token is duplicated inside one cohort.
 */
import { supabase } from "../../data/supabase";
import type { CohortToken } from "./cohort";

type Row = Record<string, unknown>;

const num = (row: Row, key: string): number | null => {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const HistoryCohortService = {
  /** Every called token with its First Call setup, outcome and scan-time values. */
  async calledTokens(limit = 500): Promise<CohortToken[]> {
    const { data: outcomeRows, error } = await supabase
      .from("token_scanner_outcomes")
      .select(
        "token_id, contract_address, first_call_at, first_call_scan_id, first_call_market_cap_usd, first_call_price_usd, market_cap_change_since_first_call_pct, peak_market_cap_since_call_pct, max_adverse_since_call_pct, max_peak_to_trough_drawdown_since_call_pct, current_market_cap_usd, current_price_usd, current_observed_at, observation_count",
      )
      .not("first_call_at", "is", null)
      .order("first_call_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const outcomes = (outcomeRows ?? []) as unknown as Row[];
    if (outcomes.length === 0) return [];

    const tokenIds = [...new Set(outcomes.map((r) => r["token_id"] as string))];

    // The Data API caps any single response at 1000 rows, so candidate rows are
    // read in token chunks AND paginated. Without this, a growing scan history
    // silently truncates the join and whole cohorts disappear from the UI.
    const CHUNK = 25;
    const PAGE = 1000;
    const chunks: string[][] = [];
    for (let i = 0; i < tokenIds.length; i += CHUNK) chunks.push(tokenIds.slice(i, i + CHUNK));

    const [candidateChunks, { data: tokenRows }] = await Promise.all([
      Promise.all(
        chunks.map(async (ids) => {
          const rows: Row[] = [];
          for (let offset = 0; ; offset += PAGE) {
            const { data, error: candidateError } = await supabase
              .from("scan_candidates")
              .select(
                "token_id, scan_run_id, created_at, recurrence_state, discovery_lanes, contract_address, market_cap, liquidity_usd, volume_24h, price_integrity_status, structural_status, participation_status",
              )
              .in("token_id", ids)
              .order("created_at", { ascending: false })
              .range(offset, offset + PAGE - 1);
            if (candidateError) throw candidateError;
            const page = (data ?? []) as unknown as Row[];
            rows.push(...page);
            if (page.length < PAGE) break;
          }
          return rows;
        }),
      ),
      supabase.from("tokens").select("id, name, symbol, dex_pair_address").in("id", tokenIds),
    ]);
    const candidateRows = candidateChunks.flat();



    const candidatesByToken = new Map<string, Row[]>();
    for (const row of (candidateRows ?? []) as unknown as Row[]) {
      const id = row["token_id"] as string;
      const list = candidatesByToken.get(id) ?? [];
      list.push(row);
      candidatesByToken.set(id, list);
    }

    const tokensById = new Map<string, Row>();
    for (const row of (tokenRows ?? []) as unknown as Row[]) {
      tokensById.set(row["id"] as string, row);
    }

    return outcomes.map((o) => {
      const tokenId = o["token_id"] as string;
      const callScanId = (o["first_call_scan_id"] as string | null) ?? null;
      const candidates = candidatesByToken.get(tokenId) ?? [];
      // Prefer the exact First Call scan row; fall back to any persisted row.
      const call =
        candidates.find((c) => c["scan_run_id"] === callScanId) ?? candidates[0] ?? ({} as Row);
      // Most recent scanner observation of this token, by candidate created_at.
      const latest = [...candidates].sort((a, b) =>
        String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? "")),
      )[0];
      const token = tokensById.get(tokenId) ?? ({} as Row);


      return {
        tokenId,
        contractAddress:
          ((o["contract_address"] as string | null) ??
            (call["contract_address"] as string | null)) ||
          null,
        name: (token["name"] as string | null) ?? "Unknown token",
        symbol: (token["symbol"] as string | null) ?? "—",
        setups: (call["discovery_lanes"] as string[] | null) ?? [],
        firstCallAt: (o["first_call_at"] as string | null) ?? null,
        firstCallMarketCap: num(o, "first_call_market_cap_usd"),
        firstCallPriceUsd: num(o, "first_call_price_usd"),
        sinceCallPct: num(o, "market_cap_change_since_first_call_pct"),
        peakSinceCallPct: num(o, "peak_market_cap_since_call_pct"),
        maxAdverseSinceCallPct: num(o, "max_adverse_since_call_pct"),
        drawdownSinceCallPct: num(o, "max_peak_to_trough_drawdown_since_call_pct"),
        currentMarketCap: num(o, "current_market_cap_usd"),
        currentPriceUsd: num(o, "current_price_usd"),
        currentObservedAt: (o["current_observed_at"] as string | null) ?? null,
        scanMarketCap: num(call, "market_cap"),
        scanLiquidityUsd: num(call, "liquidity_usd"),
        scanVolume24h: num(call, "volume_24h"),
        priceIntegrityStatus: (call["price_integrity_status"] as string | null) ?? null,
        structuralStatus: (call["structural_status"] as string | null) ?? null,
        participationStatus: (call["participation_status"] as string | null) ?? null,
        dexPairAddress: (token["dex_pair_address"] as string | null) ?? null,
        observationCount: num(o, "observation_count") ?? 0,
      } satisfies CohortToken;
    });
  },
};
