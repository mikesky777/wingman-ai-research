/**
 * TODO(auth): watchlist rows are currently global and browser-writable —
 * prototype behaviour for the single-user demo. Before any public
 * multi-user release this must become user-scoped (user_id + RLS on
 * auth.uid()) or move behind authenticated server functions.
 */
import { supabase } from "../data/supabase";
import type { WatchlistEntry } from "../types";

interface WatchlistRow {
  id: string;
  token_id: string;
  created_at: string;
  alerts_enabled: boolean;
}

/**
 * WatchlistService — persistent user watchlist.
 *
 * Alert delivery is not implemented; `alerts_enabled` only records intent.
 */
export const WatchlistService = {
  async list(): Promise<WatchlistEntry[]> {
    const { data, error } = await supabase
      .from("watchlist")
      .select("id, token_id, created_at, alerts_enabled")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as WatchlistRow[]).map((r) => ({
      tokenId: r.token_id,
      addedAt: r.created_at,
      alert: r.alerts_enabled ? "ON" : "OFF",
    }));
  },

  async add(tokenId: string): Promise<void> {
    const { error } = await supabase
      .from("watchlist")
      .upsert({ token_id: tokenId }, { onConflict: "token_id" });
    if (error) throw error;
  },

  async remove(tokenId: string): Promise<void> {
    const { error } = await supabase.from("watchlist").delete().eq("token_id", tokenId);
    if (error) throw error;
  },

  async setAlerts(tokenId: string, enabled: boolean): Promise<void> {
    const { error } = await supabase
      .from("watchlist")
      .update({ alerts_enabled: enabled })
      .eq("token_id", tokenId);
    if (error) throw error;
  },
};
