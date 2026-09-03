CREATE TABLE public.token_scanner_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL UNIQUE REFERENCES public.tokens(id) ON DELETE CASCADE,
  contract_address text,

  first_seen_scan_id uuid REFERENCES public.scan_runs(id),
  first_seen_at timestamptz,
  first_seen_price_usd numeric,
  first_seen_market_cap_usd numeric,

  first_call_scan_id uuid REFERENCES public.scan_runs(id),
  first_call_at timestamptz,
  first_call_price_usd numeric,
  first_call_market_cap_usd numeric,

  current_price_usd numeric,
  current_market_cap_usd numeric,
  current_observed_at timestamptz,

  price_change_since_first_seen_pct numeric,
  market_cap_change_since_first_seen_pct numeric,
  max_price_since_first_seen numeric,
  max_market_cap_since_first_seen numeric,
  max_gain_since_first_seen_pct numeric,
  min_price_since_first_seen numeric,
  min_market_cap_since_first_seen numeric,
  max_adverse_change_since_first_seen_pct numeric,
  max_peak_to_trough_drawdown_since_first_seen_pct numeric,

  price_change_since_first_call_pct numeric,
  market_cap_change_since_first_call_pct numeric,
  max_price_since_first_call numeric,
  max_market_cap_since_first_call numeric,
  max_gain_since_first_call_pct numeric,
  min_price_since_first_call numeric,
  min_market_cap_since_first_call numeric,
  max_adverse_change_since_first_call_pct numeric,
  max_peak_to_trough_drawdown_since_first_call_pct numeric,

  elapsed_minutes_since_first_seen numeric,
  elapsed_minutes_since_first_call numeric,
  observation_count integer NOT NULL DEFAULT 0,

  horizons_since_first_seen jsonb,
  horizons_since_first_call jsonb,

  outcome_version text,
  last_evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.token_scanner_outcomes TO anon;
GRANT SELECT ON public.token_scanner_outcomes TO authenticated;
GRANT ALL ON public.token_scanner_outcomes TO service_role;

ALTER TABLE public.token_scanner_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY token_scanner_outcomes_public_read
  ON public.token_scanner_outcomes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX token_scanner_outcomes_first_call_at_idx
  ON public.token_scanner_outcomes (first_call_at DESC NULLS LAST);
CREATE INDEX token_scanner_outcomes_first_seen_at_idx
  ON public.token_scanner_outcomes (first_seen_at DESC NULLS LAST);

CREATE TRIGGER token_scanner_outcomes_updated_at
  BEFORE UPDATE ON public.token_scanner_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();