/**
 * Wingman application/service layer.
 *
 * UI components read data exclusively through these services (or the query
 * hooks in `src/lib/wingman/hooks.ts`). Services own all backend access;
 * external market/social adapters will plug in behind the same interfaces.
 */
export { TokenDataService } from "./token-data-service";
export { MarketDataService } from "./market-data-service";
export { ScannerService, type LatestScan } from "./scanner-service";
export { ResearchService } from "./research-service";
export { WatchlistService } from "./watchlist-service";
export { OutcomeService, type OutcomeStats, HIT_THRESHOLD_PCT } from "./outcome-service";
