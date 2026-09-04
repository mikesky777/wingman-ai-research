ALTER TABLE public.token_scanner_outcomes
  ADD COLUMN IF NOT EXISTS max_adverse_since_call_pct numeric,
  ADD COLUMN IF NOT EXISTS max_adverse_since_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_adverse_market_cap_since_call numeric,
  ADD COLUMN IF NOT EXISTS max_peak_to_trough_drawdown_since_call_pct numeric,
  ADD COLUMN IF NOT EXISTS drawdown_peak_market_cap_since_call numeric,
  ADD COLUMN IF NOT EXISTS drawdown_peak_since_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS drawdown_trough_market_cap_since_call numeric,
  ADD COLUMN IF NOT EXISTS drawdown_trough_since_call_at timestamptz;