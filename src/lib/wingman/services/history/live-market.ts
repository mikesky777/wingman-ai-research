/**
 * Live market overlay — pure rules and configuration.
 *
 * The live overlay is a DISPLAY layer. It never mutates `scan_candidates`,
 * never changes selection, setups, priority or any baseline, and it does not
 * create a database row per poll. Historical persistence happens on a much
 * slower, configurable cadence.
 */

/** UI refresh cadence while a History cohort view is visible. */
export const LIVE_REFRESH_INTERVAL_MS = 30_000;

/**
 * Cadence at which a live reading is also persisted as an immutable market
 * observation, so Peak Call / MAE / drawdown keep improving over time.
 */
export const LIVE_HISTORY_PERSISTENCE_INTERVAL_MS = 5 * 60_000;

/** DexScreener batch endpoint limit (`/tokens/v1/solana/{addresses}`). */
export const LIVE_BATCH_SIZE = 30;

/** Live values for one mint. Every field may legitimately be unavailable. */
export interface LiveMarketValues {
  contractAddress: string;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairAddress: string | null;
  dexId: string | null;
  observedAt: string;
}

/** Efficiency diagnostics. A 30-token batch is ONE provider request. */
export interface LiveRefreshDiagnostics {
  batches: number;
  addressesRefreshed: number;
  providerRequests: number;
  skippedHidden: number;
  persistedObservations: number;
  persistenceSkippedRecent: number;
}

export function emptyDiagnostics(): LiveRefreshDiagnostics {
  return {
    batches: 0,
    addressesRefreshed: 0,
    providerRequests: 0,
    skippedHidden: 0,
    persistedObservations: 0,
    persistenceSkippedRecent: 0,
  };
}

export function mergeDiagnostics(
  a: LiveRefreshDiagnostics,
  b: Partial<LiveRefreshDiagnostics>,
): LiveRefreshDiagnostics {
  return {
    batches: a.batches + (b.batches ?? 0),
    addressesRefreshed: a.addressesRefreshed + (b.addressesRefreshed ?? 0),
    providerRequests: a.providerRequests + (b.providerRequests ?? 0),
    skippedHidden: a.skippedHidden + (b.skippedHidden ?? 0),
    persistedObservations: a.persistedObservations + (b.persistedObservations ?? 0),
    persistenceSkippedRecent: a.persistenceSkippedRecent + (b.persistenceSkippedRecent ?? 0),
  };
}

/** Split addresses into provider-sized batches; duplicates are collapsed. */
export function batchAddresses(addresses: string[], size = LIVE_BATCH_SIZE): string[][] {
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

/**
 * Historical sampling gate: persist only when no equivalent observation
 * already exists inside the configured window.
 */
export function shouldPersistObservation(
  lastObservedAtIso: string | null,
  nowIso: string,
  intervalMs = LIVE_HISTORY_PERSISTENCE_INTERVAL_MS,
): boolean {
  if (!lastObservedAtIso) return true;
  const last = Date.parse(lastObservedAtIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || Number.isNaN(now)) return true;
  return now - last >= intervalMs;
}

/**
 * Provider failure must never clear values the UI already has. Only mints
 * present in the new payload are replaced.
 */
export function mergeLiveValues(
  previous: Record<string, LiveMarketValues>,
  incoming: LiveMarketValues[],
): Record<string, LiveMarketValues> {
  const next = { ...previous };
  for (const value of incoming) next[value.contractAddress] = value;
  return next;
}

/**
 * Overlap-free, visibility-aware refresh runner.
 *
 * Pure control logic so polling behavior is testable without a browser:
 * a refresh is skipped while the document is hidden, and a second refresh can
 * never start while one is still in flight.
 */
export interface LiveRunnerOptions {
  isVisible: () => boolean;
  run: () => Promise<void>;
  onSkippedHidden?: () => void;
}

export interface LiveRunner {
  tick: () => Promise<"ran" | "hidden" | "busy">;
  /** Manual refresh: ignores visibility, still overlap-protected. */
  manual: () => Promise<"ran" | "busy">;
  isBusy: () => boolean;
}

export function createLiveRunner(options: LiveRunnerOptions): LiveRunner {
  let busy = false;

  const execute = async () => {
    busy = true;
    try {
      await options.run();
    } finally {
      busy = false;
    }
  };

  return {
    isBusy: () => busy,
    async tick() {
      if (busy) return "busy";
      if (!options.isVisible()) {
        options.onSkippedHidden?.();
        return "hidden";
      }
      await execute();
      return "ran";
    },
    async manual() {
      if (busy) return "busy";
      await execute();
      return "ran";
    },
  };
}

/** DexScreener embed URL for an already-resolved Solana pair. Visual only. */
export function dexScreenerEmbedUrl(pairAddress: string, theme: "dark" | "light" = "dark"): string {
  const params = new URLSearchParams({
    embed: "1",
    theme,
    trades: "0",
    info: "0",
  });
  return `https://dexscreener.com/solana/${pairAddress}?${params.toString()}`;
}

export function dexScreenerPairUrl(pairAddress: string): string {
  return `https://dexscreener.com/solana/${pairAddress}`;
}
