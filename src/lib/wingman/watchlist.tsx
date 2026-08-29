import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { WatchlistEntry } from "./types";

/**
 * Local watchlist state. Persisted to localStorage in v0; swap the load/save
 * calls for Supabase reads/writes later without touching components.
 */

const STORAGE_KEY = "wingman.watchlist.v1";

const DEFAULT_ENTRIES: WatchlistEntry[] = [
  { tokenId: "opp-gta", addedAt: "2026-08-29T11:05:00.000Z", alert: "ON" },
  { tokenId: "opp-ledgerdog", addedAt: "2026-08-28T15:40:00.000Z", alert: "OFF" },
];

interface WatchlistContextValue {
  entries: WatchlistEntry[];
  isWatched: (tokenId: string) => boolean;
  add: (tokenId: string) => void;
  remove: (tokenId: string) => void;
  toggle: (tokenId: string) => void;
  toggleAlert: (tokenId: string) => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<WatchlistEntry[]>(DEFAULT_ENTRIES);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setEntries(JSON.parse(raw) as WatchlistEntry[]);
    } catch {
      /* ignore corrupted local state */
    }
  }, []);

  const persist = useCallback((next: WatchlistEntry[]) => {
    setEntries(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep in-memory state */
    }
  }, []);

  const value = useMemo<WatchlistContextValue>(() => {
    const isWatched = (tokenId: string) => entries.some((e) => e.tokenId === tokenId);
    return {
      entries,
      isWatched,
      add: (tokenId) => {
        if (isWatched(tokenId)) return;
        persist([...entries, { tokenId, addedAt: new Date().toISOString(), alert: "OFF" }]);
      },
      remove: (tokenId) => persist(entries.filter((e) => e.tokenId !== tokenId)),
      toggle: (tokenId) =>
        isWatched(tokenId)
          ? persist(entries.filter((e) => e.tokenId !== tokenId))
          : persist([...entries, { tokenId, addedAt: new Date().toISOString(), alert: "OFF" }]),
      toggleAlert: (tokenId) =>
        persist(
          entries.map((e) =>
            e.tokenId === tokenId ? { ...e, alert: e.alert === "ON" ? "OFF" : "ON" } : e,
          ),
        ),
    };
  }, [entries, persist]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within a WatchlistProvider");
  return ctx;
}
