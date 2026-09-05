CREATE TABLE public.sizing_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sizing_policy_version TEXT NOT NULL,
  mint TEXT NOT NULL,
  thesis_call_id UUID REFERENCES public.token_stage_milestones(id) ON DELETE SET NULL,
  thesis_report_id UUID REFERENCES public.thesis_reports(id) ON DELETE SET NULL,
  entry_evaluation_id UUID REFERENCES public.entry_state_evaluations(id) ON DELETE SET NULL,
  thesis_score NUMERIC,
  evidence_confidence NUMERIC,
  conviction_band TEXT NOT NULL,
  conviction_band_label TEXT NOT NULL,
  raw_interpolated_max_pct NUMERIC NOT NULL,
  structural_risk TEXT NOT NULL,
  structural_modifier NUMERIC NOT NULL,
  evidence_cap_multiplier NUMERIC NOT NULL,
  effective_max_allocation_pct NUMERIC NOT NULL,
  entry_state TEXT NOT NULL,
  price_history_source TEXT,
  timing_resolution TEXT,
  deployment_fraction NUMERIC NOT NULL,
  deployment_label TEXT NOT NULL,
  deploy_now_pct NUMERIC NOT NULL,
  reserve_pct NUMERIC NOT NULL,
  operational_status TEXT NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  is_calibration BOOLEAN NOT NULL DEFAULT false,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sizing_recommendations_mint ON public.sizing_recommendations (mint, calculated_at DESC);
CREATE INDEX idx_sizing_recommendations_call ON public.sizing_recommendations (thesis_call_id, calculated_at DESC);
CREATE INDEX idx_sizing_recommendations_production ON public.sizing_recommendations (is_calibration, calculated_at DESC);

GRANT SELECT ON public.sizing_recommendations TO authenticated;
GRANT SELECT ON public.sizing_recommendations TO anon;
GRANT ALL ON public.sizing_recommendations TO service_role;

ALTER TABLE public.sizing_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sizing recommendations are readable"
  ON public.sizing_recommendations FOR SELECT
  USING (true);