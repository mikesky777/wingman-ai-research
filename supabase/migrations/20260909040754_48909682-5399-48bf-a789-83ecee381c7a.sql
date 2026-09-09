CREATE TABLE public.outcome_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schema_version TEXT NOT NULL DEFAULT 'outcome_enrollment/v1',
  token_id UUID REFERENCES public.tokens(id) ON DELETE SET NULL,
  contract_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  funnel_stage TEXT NOT NULL,
  decision_class TEXT,
  source_event_type TEXT,
  source_event_id TEXT,
  scan_run_id UUID,
  triage_run_id UUID,
  production_cycle_run_id UUID,
  cohort_ref TEXT,
  decision_at TIMESTAMP WITH TIME ZONE,
  baseline_at TIMESTAMP WITH TIME ZONE,
  baseline_market_cap_usd DOUBLE PRECISION,
  baseline_price_usd DOUBLE PRECISION,
  baseline_liquidity_usd DOUBLE PRECISION,
  baseline_validity TEXT NOT NULL DEFAULT 'UNKNOWN',
  enrollment_type TEXT NOT NULL,
  sampling_policy_version TEXT,
  sampling_stratum TEXT,
  eligible_population_n INTEGER,
  selected_k INTEGER,
  inclusion_probability DOUBLE PRECISION,
  selection_seed TEXT,
  selection_reason TEXT,
  selected_at TIMESTAMP WITH TIME ZONE,
  outcome_horizons TEXT[] NOT NULL DEFAULT ARRAY['1h','4h','12h','24h','3d','7d'],
  sampled_for_outcomes BOOLEAN NOT NULL DEFAULT false,
  stage_reached TEXT,
  rejection_reason TEXT,
  rejection_details JSONB,
  lane_rejections JSONB,
  scanner_policy_version TEXT,
  tracking_status TEXT NOT NULL DEFAULT 'ENROLLED',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT outcome_enrollments_type_check CHECK (
    enrollment_type IN ('EXHAUSTIVE','SAMPLED','LEGACY_TRACKING_PROVENANCE_UNAVAILABLE')
  ),
  CONSTRAINT outcome_enrollments_validity_check CHECK (
    baseline_validity IN ('VALID','UNKNOWN','NOT_EVALUABLE')
  ),
  CONSTRAINT outcome_enrollments_tracking_status_check CHECK (
    tracking_status IN ('ENROLLED','ENROLLMENT_FAILED','TRACKING_DELAYED','UNKNOWN')
  ),
  CONSTRAINT outcome_enrollments_stage_check CHECK (
    funnel_stage IN ('SCANNER_SETUP_QUALIFIED','SCANNER_SURVIVOR','SCANNER_REJECT','AI_TRIAGE')
  )
);

CREATE UNIQUE INDEX outcome_enrollments_event_key
  ON public.outcome_enrollments (
    contract_address,
    funnel_stage,
    COALESCE(decision_class, ''),
    COALESCE(source_event_id, ''),
    COALESCE(scan_run_id::text, ''),
    COALESCE(triage_run_id::text, '')
  );

CREATE INDEX outcome_enrollments_baseline_idx ON public.outcome_enrollments (baseline_at DESC);
CREATE INDEX outcome_enrollments_mint_idx ON public.outcome_enrollments (contract_address);

GRANT SELECT ON public.outcome_enrollments TO authenticated;
GRANT ALL ON public.outcome_enrollments TO service_role;
ALTER TABLE public.outcome_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read outcome enrollments"
  ON public.outcome_enrollments FOR SELECT TO authenticated USING (true);

CREATE TABLE public.outcome_enrollment_strata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_run_id UUID NOT NULL,
  sampling_policy_version TEXT NOT NULL,
  stratum TEXT NOT NULL,
  eligible_population_n INTEGER NOT NULL,
  selected_k INTEGER NOT NULL,
  inclusion_probability DOUBLE PRECISION NOT NULL,
  seed_material TEXT NOT NULL,
  selected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT outcome_enrollment_strata_key UNIQUE (scan_run_id, sampling_policy_version, stratum)
);

GRANT SELECT ON public.outcome_enrollment_strata TO authenticated;
GRANT ALL ON public.outcome_enrollment_strata TO service_role;
ALTER TABLE public.outcome_enrollment_strata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read enrollment strata"
  ON public.outcome_enrollment_strata FOR SELECT TO authenticated USING (true);