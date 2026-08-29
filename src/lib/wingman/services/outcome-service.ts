import { supabase } from "../data/supabase";
import type { TradeOutcome } from "../types";

interface OutcomeRow {
  id: string;
  discovery_at: string;
  discovery_market_cap: number | null;
  discovery_thesis_score: number | null;
  discovery_entry_score: number | null;
  peak_market_cap: number | null;
  maximum_gain_pct: number | null;
  maximum_drawdown_pct: number | null;
  status: TradeOutcome["status"];
  token: { id: string; name: string; symbol: string };
}

export interface OutcomeStats {
  count: number;
  averageThesisScore: number | null;
  averageMaxReturnPct: number | null;
  hitRate80Plus: { hits: number; total: number } | null;
  hitRate70to79: { hits: number; total: number } | null;
}

/** A "hit" is a peak market cap at least 100% above discovery. */
export const HIT_THRESHOLD_PCT = 100;

/** OutcomeService — did Wingman's recommendations actually work? */
export const OutcomeService = {
  async list(): Promise<TradeOutcome[]> {
    const { data, error } = await supabase
      .from("opportunity_outcomes")
      .select(
        "id, discovery_at, discovery_market_cap, discovery_thesis_score, discovery_entry_score, peak_market_cap, maximum_gain_pct, maximum_drawdown_pct, status, token:tokens!inner(id, name, symbol)",
      )
      .order("discovery_at", { ascending: true });
    if (error) throw error;

    return (data as unknown as OutcomeRow[]).map((r) => ({
      id: r.id,
      token: { id: r.token.id, name: r.token.name, ticker: r.token.symbol },
      thesisScoreAtDiscovery: Number(r.discovery_thesis_score ?? 0),
      entryScoreAtDiscovery: Number(r.discovery_entry_score ?? 0),
      marketCapAtDiscoveryUsd: Number(r.discovery_market_cap ?? 0),
      peakMarketCapUsd: Number(r.peak_market_cap ?? 0),
      maxGainPct: Number(r.maximum_gain_pct ?? 0),
      maxDrawdownPct: Number(r.maximum_drawdown_pct ?? 0),
      status: r.status,
      discoveredAt: r.discovery_at,
    }));
  },

  /** Derived statistics — never hard-coded in the UI. */
  stats(outcomes: TradeOutcome[]): OutcomeStats {
    if (outcomes.length === 0) {
      return {
        count: 0,
        averageThesisScore: null,
        averageMaxReturnPct: null,
        hitRate80Plus: null,
        hitRate70to79: null,
      };
    }
    const band = (min: number, max: number) => {
      const set = outcomes.filter(
        (o) => o.thesisScoreAtDiscovery >= min && o.thesisScoreAtDiscovery <= max,
      );
      if (set.length === 0) return null;
      return { hits: set.filter((o) => o.maxGainPct >= HIT_THRESHOLD_PCT).length, total: set.length };
    };
    return {
      count: outcomes.length,
      averageThesisScore: Math.round(
        outcomes.reduce((s, o) => s + o.thesisScoreAtDiscovery, 0) / outcomes.length,
      ),
      averageMaxReturnPct: Math.round(
        outcomes.reduce((s, o) => s + o.maxGainPct, 0) / outcomes.length,
      ),
      hitRate80Plus: band(80, 100),
      hitRate70to79: band(70, 79),
    };
  },
};
