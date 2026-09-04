ALTER TABLE public.token_scanner_outcomes
  ADD COLUMN IF NOT EXISTS peak_since_call_pct numeric,
  ADD COLUMN IF NOT EXISTS peak_market_cap_since_call_pct numeric,
  ADD COLUMN IF NOT EXISTS peak_market_cap_since_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS peak_price_since_call_at timestamptz;