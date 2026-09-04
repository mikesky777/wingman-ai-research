/**
 * Raw Birdeye response shapes. These types exist ONLY inside this adapter —
 * they must never reach services, the evidence layer or the UI.
 */

export interface BeEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

/** GET /defi/v3/token/holder?mode=wallet — wallet-level top holders. */
export interface BeHolderDistributionData {
  holder?: number | null;
  top10_hold_percent?: number | null;
  items?: Array<{
    owner?: string;
    amount?: number | string | null;
    amount_usd?: number | null;
  }>;
}

/** GET /defi/v3/token/market-data — supply context for derived concentration. */
export interface BeMarketData {
  price?: number | null;
  liquidity?: number | null;
  total_supply?: number | null;
  circulating_supply?: number | null;
  fdv?: number | null;
  market_cap?: number | null;
  holder?: number | null;
}

export interface BeHolderTag {
  tag?: string;
  holder_count?: number | null;
  hold_amount?: string | number | null;
  percent_of_supply?: number | null;
  buy_volume?: string | number | null;
  sell_volume?: string | number | null;
  buy_volume_usd?: string | number | null;
  sell_volume_usd?: string | number | null;
  avg_buy_price?: string | number | null;
  pnl?: string | number | null;
}

/** GET /token/v1/holder-profile — cohort-level labeled-holder summary. */
export interface BeHolderProfileData {
  token?: {
    creation_time?: number | null;
    market_cap?: number | null;
    liquidity?: number | null;
    volume_1h_usd?: number | null;
    buy_volume_1h_usd?: number | null;
    sell_volume_1h_usd?: number | null;
    top10_holder?: {
      hold_amount?: string | number | null;
      percent_of_supply?: number | null;
    } | null;
  } | null;
  holder_summary?: {
    total_holder?: number | null;
    total_holding?: number | null;
    percent_of_supply?: number | null;
  } | null;
  tags?: BeHolderTag[] | null;
}

/**
 * GET /defi/v3/token/trade-data/single — per-window activity facts.
 *
 * The provider returns one flat object with `<metric>_<window>` keys for every
 * supported window (1m, 5m, 30m, 1h, 2h, 4h, 8h, 24h) plus `_history_`
 * counterparts and `_change_percent` values. Keys are read by name in the
 * normalizer, so the shape stays intentionally open.
 */
export interface BeTradeDataSingle {
  address?: string;
  holder?: number | null;
  market?: number | null;
  price?: number | null;
  last_trade_unix_time?: number | null;
  [key: string]: unknown;
}
