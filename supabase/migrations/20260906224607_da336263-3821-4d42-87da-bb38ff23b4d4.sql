ALTER TABLE public.calibration_experiment_results
  ADD COLUMN IF NOT EXISTS treatment_exposure text,
  ADD COLUMN IF NOT EXISTS masked_by_other_gates boolean,
  ADD COLUMN IF NOT EXISTS masking_gate_list text[],
  ADD COLUMN IF NOT EXISTS final_decision_difference boolean;

INSERT INTO public.calibration_experiments (
  name, hypothesis, experiment_version, experiment_type, status, source_stage,
  source_policy_filters, population_definition, population_semantics,
  control_policy, challenger_variants, evaluation_horizons, predeclared,
  shadow_start_at, promotion_state
)
SELECT
  'Thesis Score Gate Test v1 — 65 vs 70',
  'Do otherwise-qualified Thesis Synthesized decisions scoring 65–69 behave differently from production''s Thesis Score >=70 requirement? Calibration only — tests the score threshold and nothing else.',
  'calibration_experiment/v1',
  'PROSPECTIVE_SHADOW',
  'RUNNING',
  'THESIS_SYNTHESIZED',
  '{"thesisPolicyVersion":"ALL"}'::jsonb,
  '{"canonicalOnly":true,"excludes":["SAME_COHORT_RERUN","CALIBRATION_FIXTURE","SHADOW_ARTIFACT","LEGACY_MISSING_FROZEN_SEMANTICS"]}'::jsonb,
  'DECISIONS_AND_UNIQUE_TOKENS',
  '{"policy":"opportunity_gate/v1.1","label":"Production control","description":"Exact current production Opportunity policy: Thesis Score >=70, Evidence Confidence >=60, allowed verdict, bear severity <=MODERATE, distinct independent evidence origins >=2, operational eligibility."}'::jsonb,
  '[{"key":"CHALLENGER_A","label":"Thesis Score >=65","differsBy":"THESIS_SCORE_MIN_65","description":"Identical to production in every respect except the Thesis Score minimum, which is 65 instead of 70. Evidence Confidence, verdict, bear severity, distinct independent origins and operational eligibility are unchanged."}]'::jsonb,
  ARRAY['1h','4h','12h','24h','3d','7d'],
  true,
  now(),
  'NONE'
WHERE NOT EXISTS (
  SELECT 1 FROM public.calibration_experiments WHERE name = 'Thesis Score Gate Test v1 — 65 vs 70'
);