import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WatchlistService } from "./services";
import { wingmanKeys } from "./hooks";
import type { WatchlistEntry } from "./types";

/**
 * Watchlist state, persisted in the backend `watchlist` table through
 * WatchlistService. Components keep the same API as before.
 */

interface WatchlistContextValue {
  entries: WatchlistEntry[];
  isLoading: boolean;
  isWatched: (tokenId: string) => boolean;
  add: (tokenId: string) => void;
  remove: (tokenId: string) => void;
  toggle: (tokenId: string) => void;
  toggleAlert: (tokenId: string) => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: wingmanKeys.watchlist,
    queryFn: () => WatchlistService.list(),
  });
  const entries = useMemo(() => data ?? [], [data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: wingmanKeys.watchlist });
  };

  const addMutation = useMutation({
    mutationFn: (tokenId: string) => WatchlistService.add(tokenId),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (tokenId: string) => WatchlistService.remove(tokenId),
    onSuccess: invalidate,
  });
  const alertMutation = useMutation({
    mutationFn: (vars: { tokenId: string; enabled: boolean }) =>
      WatchlistService.setAlerts(vars.tokenId, vars.enabled),
    onSuccess: invalidate,
  });

  const value = useMemo<WatchlistContextValue>(() => {
    const isWatched = (tokenId: string) => entries.some((e) => e.tokenId === tokenId);
    return {
      entries,
      isLoading,
      isWatched,
      add: (tokenId) => addMutation.mutate(tokenId),
      remove: (tokenId) => removeMutation.mutate(tokenId),
      toggle: (tokenId) =>
        isWatched(tokenId) ? removeMutation.mutate(tokenId) : addMutation.mutate(tokenId),
      toggleAlert: (tokenId) => {
        const current = entries.find((e) => e.tokenId === tokenId);
        alertMutation.mutate({ tokenId, enabled: current?.alert !== "ON" });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, isLoading]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within a WatchlistProvider");
  return ctx;
}
