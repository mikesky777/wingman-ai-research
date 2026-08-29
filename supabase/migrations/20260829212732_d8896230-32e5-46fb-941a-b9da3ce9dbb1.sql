
ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS tokens_discovered integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantitatively_ranked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enriched_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovery_config_version text,
  ADD COLUMN IF NOT EXISTS calibration_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_telemetry jsonb,
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.scan_candidates
  ADD COLUMN IF NOT EXISTS discovery_lanes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discovery_sources text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discovery_queries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discovery_ranks jsonb,
  ADD COLUMN IF NOT EXISTS contract_address text,
  ADD COLUMN IF NOT EXISTS chain text NOT NULL DEFAULT 'solana',
  ADD COLUMN IF NOT EXISTS token_age_minutes numeric,
  ADD COLUMN IF NOT EXISTS age_basis text,
  ADD COLUMN IF NOT EXISTS market_cap numeric,
  ADD COLUMN IF NOT EXISTS liquidity_usd numeric,
  ADD COLUMN IF NOT EXISTS volume_24h numeric,
  ADD COLUMN IF NOT EXISTS volume_1h numeric,
  ADD COLUMN IF NOT EXISTS volume_to_market_cap_24h numeric,
  ADD COLUMN IF NOT EXISTS volume_to_liquidity_24h numeric,
  ADD COLUMN IF NOT EXISTS minutes_since_last_trade numeric,
  ADD COLUMN IF NOT EXISTS activity_state text,
  ADD COLUMN IF NOT EXISTS persistence_signal text,
  ADD COLUMN IF NOT EXISTS reacceleration_signal text,
  ADD COLUMN IF NOT EXISTS extension_risk text,
  ADD COLUMN IF NOT EXISTS attention_price_divergence text,
  ADD COLUMN IF NOT EXISTS quantitative_priority numeric,
  ADD COLUMN IF NOT EXISTS priority_components jsonb,
  ADD COLUMN IF NOT EXISTS rejection_details jsonb,
  ADD COLUMN IF NOT EXISTS enriched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scanner_version text;

CREATE UNIQUE INDEX IF NOT EXISTS scan_runs_single_running_idx
  ON public.scan_runs ((status)) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS scan_candidates_run_priority_idx
  ON public.scan_candidates (scan_run_id, quantitative_priority DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS scan_candidates_lanes_idx
  ON public.scan_candidates USING gin (discovery_lanes);
