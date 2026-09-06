CREATE TABLE public.calibration_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  experiment_version TEXT NOT NULL DEFAULT 'calibration_experiment/v1',
  experiment_type TEXT NOT NULL CHECK (experiment_type IN ('RETROSPECTIVE_BACKTEST','PROSPECTIVE_SHADOW')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RUNNING','COMPLETE','ARCHIVED')),
  source_stage TEXT NOT NULL,
  source_policy_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  population_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  population_semantics TEXT NOT NULL DEFAULT 'DECISIONS_AND_UNIQUE_TOKENS',
  control_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  challenger_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluation_horizons TEXT[] NOT NULL DEFAULT ARRAY['1h','4h','12h','24h','3d','7d'],
  predeclared BOOLEAN NOT NULL DEFAULT true,
  shadow_start_at TIMESTAMPTZ,
  promotion_state TEXT NOT NULL DEFAULT 'NONE' CHECK (promotion_state IN ('NONE','CANDIDATE_FOR_PROSPECTIVE_SHADOW','PROPOSED_FOR_REVIEW')),
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.calibration_experiments TO authenticated;
GRANT ALL ON public.calibration_experiments TO service_role;
ALTER TABLE public.calibration_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calibration_experiments_read" ON public.calibration_experiments FOR SELECT TO authenticated USING (true);

CREATE TRIGGER calibration_experiments_updated_at BEFORE UPDATE ON public.calibration_experiments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.calibration_experiment_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.calibration_experiments(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL,
  source_stage TEXT NOT NULL,
  event_key TEXT NOT NULL,
  mint TEXT NOT NULL,
  cohort_id TEXT,
  decision_at TIMESTAMPTZ,
  production_decision TEXT NOT NULL,
  challenger_decision TEXT NOT NULL,
  differs BOOLEAN NOT NULL DEFAULT false,
  differing_rule TEXT,
  failed_gates TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  frozen_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_contract_version TEXT NOT NULL DEFAULT 'experiment_input/v1_allowlist_no_outcomes',
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX calibration_experiment_results_key ON public.calibration_experiment_results (experiment_id, variant_key, event_key);
CREATE INDEX calibration_experiment_results_mint ON public.calibration_experiment_results (experiment_id, mint);

GRANT SELECT ON public.calibration_experiment_results TO authenticated;
GRANT ALL ON public.calibration_experiment_results TO service_role;
ALTER TABLE public.calibration_experiment_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calibration_experiment_results_read" ON public.calibration_experiment_results FOR SELECT TO authenticated USING (true);

CREATE TRIGGER calibration_experiment_results_updated_at BEFORE UPDATE ON public.calibration_experiment_results FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.calibration_experiments (
  name, hypothesis, experiment_type, status, source_stage,
  source_policy_filters, population_definition, control_policy, challenger_variants
) VALUES (
  'Independent Evidence Gate Test v1',
  'The hard requirement of >=2 distinct independent evidence origins may reject otherwise strong early theses already sufficiently penalized by Evidence Confidence.',
  'RETROSPECTIVE_BACKTEST',
  'DRAFT',
  'THESIS_SYNTHESIZED',
  '{"thesisPolicyVersion":"ALL","opportunityGateVersion":"opportunity_gate/v1.1"}'::jsonb,
  '{"population":"CANONICAL_THESIS_DECISIONS","excludes":["SAME_COHORT_RERUN"],"requires":["CANONICAL_WITHIN_COHORT_MINT"]}'::jsonb,
  '{"key":"CONTROL","label":"Production Opportunity gate","policy":"opportunity_gate/v1.1","description":"Exactly what the production Opportunity gate did at decision time."}'::jsonb,
  '[{"key":"CHALLENGER_A","label":"No hard origins gate","differsBy":"INDEPENDENT_ORIGIN_GATE_REMOVED","description":"Removes only the hard distinct-independent-origin gate. Score, Evidence Confidence, verdict and bear gates identical."},{"key":"CHALLENGER_B","label":"Hybrid independence rule","differsBy":"INDEPENDENT_ORIGIN_GATE_HYBRID","description":"Independence passes when origins >= 2, OR origins >= 1 with affirmative verified primary-source evidence and Evidence Confidence >= 60. Everything else identical."}]'::jsonb
);