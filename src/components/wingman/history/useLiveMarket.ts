/**
 * History live market overlay hook.
 *
 * Display-only: values here never rewrite persisted outcomes or scan rows.
 * Polling is visibility-aware, overlap-protected and batched by the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { refreshHistoryLiveMarkets } from "@/lib/wingman/history.functions";
import {
  LIVE_REFRESH_INTERVAL_MS,
  createLiveRunner,
  emptyDiagnostics,
  mergeDiagnostics,
  mergeLiveValues,
  type LiveMarketValues,
  type LiveRefreshDiagnostics,
} from "@/lib/wingman/services/history/live-market";

export interface LiveMarketState {
  values: Record<string, LiveMarketValues>;
  lastRefreshedAt: string | null;
  isRefreshing: boolean;
  error: string | null;
  diagnostics: LiveRefreshDiagnostics;
  refreshNow: () => void;
}

export function useLiveMarket(addresses: string[], enabled: boolean): LiveMarketState {
  const call = useServerFn(refreshHistoryLiveMarkets);
  const [values, setValues] = useState<Record<string, LiveMarketValues>>({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<LiveRefreshDiagnostics>(emptyDiagnostics);

  const key = useMemo(() => [...new Set(addresses)].sort().join(","), [addresses]);
  const addressRef = useRef<string[]>([]);
  addressRef.current = key ? key.split(",") : [];

  const run = useCallback(async () => {
    if (addressRef.current.length === 0) return;
    setIsRefreshing(true);
    try {
      const result = await call({ data: { addresses: addressRef.current } });
      // Provider failure keeps whatever values the UI already has.
      setValues((prev) => mergeLiveValues(prev, result.values));
      setError(result.ok ? null : result.message);
      setLastRefreshedAt(result.observedAt);
      setDiagnostics((prev) => mergeDiagnostics(prev, result.diagnostics));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Live refresh failed — previous values kept.");
    } finally {
      setIsRefreshing(false);
    }
  }, [call]);

  const runner = useMemo(
    () =>
      createLiveRunner({
        isVisible: () => typeof document === "undefined" || !document.hidden,
        run,
        onSkippedHidden: () =>
          setDiagnostics((prev) => mergeDiagnostics(prev, { skippedHidden: 1 })),
      }),
    [run],
  );

  useEffect(() => {
    if (!enabled || !key) return;
    void runner.tick();
    const timer = window.setInterval(() => void runner.tick(), LIVE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, key, runner]);

  const refreshNow = useCallback(() => {
    void runner.manual();
  }, [runner]);

  return { values, lastRefreshedAt, isRefreshing, error, diagnostics, refreshNow };
}
