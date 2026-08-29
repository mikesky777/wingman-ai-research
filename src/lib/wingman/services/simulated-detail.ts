import { OPPORTUNITIES } from "../mock-data";
import type {
  ChartAnalysis,
  DeveloperAnalysis,
  DistributionMetrics,
  LiquidityAnalysis,
  MindshareSnapshot,
  WalletSignal,
} from "../types";

/**
 * Simulated research detail.
 *
 * The database stores scores, classifications and written analysis. Structured
 * telemetry (holder breakdowns, wallet clusters, impact curves, chart series)
 * will arrive from external adapters (DexScreener / Birdeye / Helius) in a later
 * iteration. Until then this module supplies that detail so the UI stays
 * populated, keyed by token symbol.
 */

export interface SimulatedDetail {
  distribution: DistributionMetrics;
  walletSignals: WalletSignal[];
  developer: DeveloperAnalysis;
  liquidity: LiquidityAnalysis;
  mindshare: MindshareSnapshot;
  chart: ChartAnalysis;
  scoreChange: number;
}

const BY_SYMBOL = new Map<string, SimulatedDetail>(
  OPPORTUNITIES.map((o) => [
    o.token.ticker,
    {
      distribution: o.report.distribution,
      walletSignals: o.report.walletSignals,
      developer: o.report.developer,
      liquidity: o.report.liquidity,
      mindshare: o.report.mindshare,
      chart: o.report.chart,
      scoreChange: o.scoreChange,
    },
  ]),
);

const FALLBACK = BY_SYMBOL.get("GTA")!;

export function simulatedDetailFor(symbol: string): SimulatedDetail {
  return BY_SYMBOL.get(symbol) ?? FALLBACK;
}
