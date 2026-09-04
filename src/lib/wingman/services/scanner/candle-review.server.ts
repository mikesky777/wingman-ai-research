/**
 * Persisted candle read for human calibration review (server-only).
 *
 * READ-ONLY. This module never calls a provider: it returns exactly the
 * `token_price_candles` rows Price Integrity evaluated, so the human chart and
 * the machine classification look at the same dataset.
 */
import { loadStoredCandles } from "./price-history.server";

export interface ReviewCandle {
  t: string;
  interval: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volumeUsd: number | null;
}

export interface CandleReviewResult {
  contractAddress: string;
  candles: ReviewCandle[];
  intervals: string[];
  firstCandleAt: string | null;
  lastCandleAt: string | null;
  /** Always false — opening the drawer must never trigger a fetch. */
  fetched: boolean;
}

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function loadCandleReview(
  contractAddress: string,
  chain = "solana",
): Promise<CandleReviewResult> {
  const empty: CandleReviewResult = {
    contractAddress,
    candles: [],
    intervals: [],
    firstCandleAt: null,
    lastCandleAt: null,
    fetched: false,
  };
  if (!SOLANA_ADDRESS_RE.test(contractAddress)) return empty;

  const stored = await loadStoredCandles(contractAddress, chain);
  if (stored.length === 0) return empty;

  const candles: ReviewCandle[] = stored
    .map((c) => ({
      t: c.candleTime,
      interval: c.interval,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volumeUsd: c.volumeUsd,
    }))
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

  return {
    contractAddress,
    candles,
    intervals: [...new Set(candles.map((c) => c.interval))],
    firstCandleAt: candles[0]?.t ?? null,
    lastCandleAt: candles[candles.length - 1]?.t ?? null,
    fetched: false,
  };
}
