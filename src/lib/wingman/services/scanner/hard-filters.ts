/**
 * Hard filters — reject only for clear, mechanical reasons.
 *
 * Explicitly NOT grounds for rejection here: meme quality, narrative, social
 * presence, developer reputation, price being down, technical indicators, or a
 * token "looking stupid". Those are judgements and belong to later stages.
 *
 * Every rejection carries its reason and the values that caused it. Nothing is
 * ever dropped silently.
 */
import { ACTIVITY_FLOOR } from "./config";
import { isNum } from "./metrics";
import { WINGMAN_SUPPORTED_CHAINS } from "../external/chains";
import type { DiscoveredToken, HardFilterRejection, ScannerMetrics } from "./types";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function applyHardFilters(
  token: DiscoveredToken,
  m: ScannerMetrics,
): HardFilterRejection | null {
  if (!WINGMAN_SUPPORTED_CHAINS.includes(token.chain)) {
    return {
      reason: "UNSUPPORTED_CHAIN",
      detail: `Wingman v0 operates on Solana only; got "${token.chain}".`,
      values: { chain: token.chain },
    };
  }

  if (!SOLANA_ADDRESS_RE.test(token.contractAddress.trim())) {
    return {
      reason: "INVALID_CONTRACT",
      detail: "Contract address is not a valid Solana mint.",
      values: { contractAddress: token.contractAddress },
    };
  }

  // Malformed provider data: no usable market at all.
  if (!isNum(token.marketCap) && !isNum(token.liquidityUsd)) {
    return {
      reason: "MALFORMED_PROVIDER_DATA",
      detail: "Neither market cap nor liquidity was available.",
      values: { marketCap: null, liquidityUsd: null },
    };
  }

  if (isNum(token.liquidityUsd) && token.liquidityUsd < ACTIVITY_FLOOR.catastrophicLiquidityUsd) {
    return {
      reason: "CATASTROPHIC_LIQUIDITY",
      detail: `Liquidity below the $${ACTIVITY_FLOOR.catastrophicLiquidityUsd.toLocaleString()} floor cannot support meaningful trading.`,
      values: { liquidityUsd: token.liquidityUsd },
    };
  }

  if (isNum(token.trades24h) && token.trades24h < ACTIVITY_FLOOR.minTrades24h) {
    return {
      reason: "NO_RECENT_TRADING",
      detail: "No trades recorded over the last 24 hours.",
      values: { trades24h: token.trades24h },
    };
  }

  if (
    isNum(m.minutesSinceLastTrade) &&
    m.minutesSinceLastTrade > ACTIVITY_FLOOR.deadMinutesSinceLastTrade
  ) {
    return {
      reason: "STALE_ACTIVITY",
      detail: `Last trade was ${Math.round(m.minutesSinceLastTrade)} minutes ago.`,
      values: { minutesSinceLastTrade: Math.round(m.minutesSinceLastTrade) },
    };
  }

  // Age-aware activity floor. A 45-minute-old token is measured against its
  // own available window, never against a full 24h expectation.
  if (isNum(m.activityWindowVolume) && m.activityWindowVolume < m.activityFloorUsd) {
    const turnoverRescue =
      (isNum(m.volumeToMarketCap24h) && m.volumeToMarketCap24h >= 0.15) ||
      (isNum(m.volumeToLiquidity24h) && m.volumeToLiquidity24h >= 0.5);
    // Volume alone never decides: strong turnover on a small cap survives.
    if (!turnoverRescue) {
      return {
        reason: "BELOW_ACTIVITY_FLOOR",
        detail: `${m.activityWindowLabel} volume below the age-adjusted floor and turnover is not compensating.`,
        values: {
          window: m.activityWindowLabel,
          windowVolume: m.activityWindowVolume,
          floorUsd: Math.round(m.activityFloorUsd),
          volumeToMarketCap24h: m.volumeToMarketCap24h,
          volumeToLiquidity24h: m.volumeToLiquidity24h,
        },
      };
    }
  }

  return null;
}
