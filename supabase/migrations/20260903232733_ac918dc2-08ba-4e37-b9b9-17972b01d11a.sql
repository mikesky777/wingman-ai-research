CREATE TABLE public.token_price_candles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL DEFAULT 'solana',
  contract_address text NOT NULL,
  pair_address text,
  interval text NOT NULL,
  candle_time timestamptz NOT NULL,
  provider_unix_time bigint,
  open_price double precision,
  high_price double precision,
  low_price double precision,
  close_price double precision,
  volume_base double precision,
  volume_usd double precision,
  source text NOT NULL DEFAULT 'birdeye',
  source_reference text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_price_candles_unique UNIQUE (chain, contract_address, interval, candle_time)
);

CREATE INDEX idx_token_price_candles_lookup ON public.token_price_candles (contract_address, interval, candle_time);

GRANT SELECT ON public.token_price_candles TO anon;
GRANT SELECT ON public.token_price_candles TO authenticated;
GRANT ALL ON public.token_price_candles TO service_role;

ALTER TABLE public.token_price_candles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Historical candles are publicly readable"
  ON public.token_price_candles FOR SELECT
  USING (true);

ALTER TABLE public.scan_candidates
  ADD COLUMN IF NOT EXISTS price_integrity_status text,
  ADD COLUMN IF NOT EXISTS price_integrity_policy_version text,
  ADD COLUMN IF NOT EXISTS price_integrity_detail jsonb;