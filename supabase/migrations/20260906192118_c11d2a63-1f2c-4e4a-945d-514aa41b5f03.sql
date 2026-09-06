CREATE TABLE public.outcome_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_address text NOT NULL UNIQUE,
  chain text NOT NULL DEFAULT 'solana',
  token_id uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  tracking_version text NOT NULL DEFAULT 'outcome_sampler/v1',
  earliest_baseline_at timestamptz,
  latest_baseline_at timestamptz,
  baseline_event_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_observed_at timestamptz,
  next_eligible_at timestamptz NOT NULL DEFAULT now(),
  consecutive_failures integer NOT NULL DEFAULT 0,
  coverage_status text NOT NULL DEFAULT 'UNKNOWN',
  provider_health text NOT NULL DEFAULT 'UNKNOWN',
  last_error_code text,
  last_retry_after_seconds integer,
  last_run_id uuid,
  priority_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outcome_tracking_due_idx ON public.outcome_tracking (next_eligible_at);
CREATE INDEX outcome_tracking_baseline_idx ON public.outcome_tracking (latest_baseline_at);

CREATE TABLE public.outcome_sampler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sampler_version text NOT NULL DEFAULT 'outcome_sampler/v1',
  window_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'RUNNING',
  trigger_source text NOT NULL DEFAULT 'SCHEDULED',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  lease_expires_at timestamptz NOT NULL DEFAULT (now() + interval '4 minutes'),
  mints_tracked integer NOT NULL DEFAULT 0,
  mints_due integer NOT NULL DEFAULT 0,
  mints_refreshed integer NOT NULL DEFAULT 0,
  mints_delayed integer NOT NULL DEFAULT 0,
  batches_sent integer NOT NULL DEFAULT 0,
  rate_limited_count integer NOT NULL DEFAULT 0,
  provider_error_count integer NOT NULL DEFAULT 0,
  observations_persisted integer NOT NULL DEFAULT 0,
  oldest_stale_observation_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outcome_sampler_runs_started_idx ON public.outcome_sampler_runs (started_at DESC);

CREATE TABLE public.market_observation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.outcome_sampler_runs(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'dexscreener',
  batch_id text NOT NULL,
  batch_index integer NOT NULL DEFAULT 0,
  contract_addresses text[] NOT NULL DEFAULT '{}',
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  success boolean NOT NULL DEFAULT false,
  error_code text,
  retry_after_seconds integer,
  observation_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX market_observation_attempts_run_idx ON public.market_observation_attempts (run_id);

GRANT SELECT ON public.outcome_tracking TO authenticated;
GRANT ALL ON public.outcome_tracking TO service_role;
GRANT SELECT ON public.outcome_sampler_runs TO authenticated;
GRANT ALL ON public.outcome_sampler_runs TO service_role;
GRANT SELECT ON public.market_observation_attempts TO authenticated;
GRANT ALL ON public.market_observation_attempts TO service_role;

ALTER TABLE public.outcome_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcome_sampler_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_observation_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outcome_tracking_read" ON public.outcome_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "outcome_sampler_runs_read" ON public.outcome_sampler_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "market_observation_attempts_read" ON public.market_observation_attempts FOR SELECT TO authenticated USING (true);

CREATE TRIGGER outcome_tracking_updated_at BEFORE UPDATE ON public.outcome_tracking
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();