ALTER TABLE public.token_scanner_outcomes
  ADD COLUMN IF NOT EXISTS current_market_validity text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS market_validity_version text,
  ADD COLUMN IF NOT EXISTS last_valid_observation_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalid_observation_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS discovery_health text,
  ADD COLUMN IF NOT EXISTS discovery_health_detail jsonb;

CREATE INDEX IF NOT EXISTS token_scanner_outcomes_validity_idx
  ON public.token_scanner_outcomes (current_market_validity);