/**
 * History market overlay hook.
 *
 * Display-only, and now PROVIDER-FREE: the periodic refresh reads persisted
 * market observations collected by the independent scheduled sampler. Opening
 * or closing History no longer starts or stops data collection.
 *
 * "Refresh now" enqueues a prioritized sampler pass through the centralized
 * rate-limit controller instead of fanning out provider requests per row.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  readMarketObservations,
  requestOutcomeSample,
} from "@/lib/wingman/outcome-sampler.functions";
import {
  LIVE_REFRESH_INTERVAL_MS,
  createLiveRunner,
  emptyDiagnostics,
  mergeDiagnostics,
  mergeLiveValues,
  type LiveMarketValues,
  type LiveRefreshDiagnostics,
} from "@/lib/wingman/services/history/live-market";
import type { CoverageStatus } from "@/lib/wingman/services/outcomes/sampler";

export interface LiveMarketState {
  values: Record<string, LiveMarketValues>;
  /** Observation availability per exact mint. Never a market judgement. */
  coverage: Record<string, CoverageStatus>;
  lastRefreshedAt: string | null;
  isRefreshing: boolean;
  error: string | null;
  diagnostics: LiveRefreshDiagnostics;
  refreshNow: () => void;
}

export function useLiveMarket(addresses: string[], enabled: boolean): LiveMarketState {
  const read = useServerFn(readMarketObservations);
  const requestSample = useServerFn(requestOutcomeSample);
  const [values, setValues] = useState<Record<string, LiveMarketValues>>({});
  const [coverage, setCoverage] = useState<Record<string, CoverageStatus>>({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<LiveRefreshDiagnostics>(emptyDiagnostics);

  const key = useMemo(() => [...new Set(addresses)].sort().join(","), [addresses]);
  const addressRef = useRef<string[]>([]);
  addressRef.current = key ? key.split(",") : [];

  const load = useCallback(async () => {
    if (addressRef.current.length === 0) return;
    setIsRefreshing(true);
    try {
      const result = await read({ data: { addresses: addressRef.current } });
      // Persisted-only read: previous values are never cleared by a failure.
      setValues((prev) => mergeLiveValues(prev, result.values));
      setCoverage(result.coverage);
      setLastRefreshedAt(result.observedAt ?? result.readAt);
      setError(null);
      setDiagnostics((prev) =>
        mergeDiagnostics(prev, {
          batches: 0,
          providerRequests: 0,
          addressesRefreshed: result.values.length,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read stored observations.");
    } finally {
      setIsRefreshing(false);
    }
  }, [read]);

  const runner = useMemo(
    () =>
      createLiveRunner({
        isVisible: () => typeof document === "undefined" || !document.hidden,
        run: load,
        onSkippedHidden: () =>
          setDiagnostics((prev) => mergeDiagnostics(prev, { skippedHidden: 1 })),
      }),
    [load],
  );

  useEffect(() => {
    if (!enabled || !key) return;
    void runner.tick();
    const timer = window.setInterval(() => void runner.tick(), LIVE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, key, runner]);

  const refreshNow = useCallback(() => {
    void (async () => {
      setIsRefreshing(true);
      try {
        const result = await requestSample({ data: { addresses: addressRef.current } });
        setDiagnostics((prev) =>
          mergeDiagnostics(prev, {
            batches: result.run.batchesSent,
            providerRequests: result.run.batchesSent,
            persistedObservations: result.run.observationsPersisted,
            persistenceSkippedRecent: result.run.mintsDelayed,
          }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Refresh request failed — stored values kept.");
      } finally {
        setIsRefreshing(false);
      }
      await runner.manual();
    })();
  }, [requestSample, runner]);

  return { values, coverage, lastRefreshedAt, isRefreshing, error, diagnostics, refreshNow };
}
