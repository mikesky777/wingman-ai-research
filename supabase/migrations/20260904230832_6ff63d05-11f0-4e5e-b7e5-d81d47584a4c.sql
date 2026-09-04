CREATE TABLE public.thesis_synthesis_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_scan_id uuid REFERENCES public.scan_runs(id),
  triage_run_id uuid REFERENCES public.ai_triage_runs(id),
  thesis_policy_version text NOT NULL,
  prompt_version text NOT NULL,
  input_policy_version text NOT NULL,
  model_provider text,
  model_identifier text,
  is_calibration boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  code text,
  requested_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  insufficient_count integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  opportunity_count integer NOT NULL DEFAULT 0,
  thesis_call_count integer NOT NULL DEFAULT 0,
  diagnostics jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.thesis_synthesis_runs TO anon, authenticated;
GRANT ALL ON public.thesis_synthesis_runs TO service_role;
ALTER TABLE public.thesis_synthesis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Thesis synthesis runs are readable" ON public.thesis_synthesis_runs FOR SELECT USING (true);

CREATE TABLE public.thesis_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thesis_synthesis_run_id uuid NOT NULL REFERENCES public.thesis_synthesis_runs(id),
  token_id uuid REFERENCES public.tokens(id),
  mint text NOT NULL,
  chain text NOT NULL DEFAULT 'solana',
  symbol text,
  name text,
  is_calibration boolean NOT NULL DEFAULT true,
  status text NOT NULL,
  blocked_reasons text[] NOT NULL DEFAULT '{}',
  thesis_score integer,
  evidence_confidence integer,
  verdict text,
  bear_case_severity text,
  score_meme_quality numeric,
  score_catalyst_narrative numeric,
  score_distribution numeric,
  score_liquidity numeric,
  score_dev_integrity numeric,
  score_chart_context numeric,
  score_mindshare numeric,
  score_valuation numeric,
  component_scores jsonb,
  evidence_confidence_components jsonb,
  one_sentence_thesis text,
  narrative_thesis text,
  strongest_bull_case text,
  strongest_bear_case text,
  strongest_catalyst text,
  strongest_concern text,
  sections jsonb,
  catalysts text[] NOT NULL DEFAULT '{}',
  invalidation text[] NOT NULL DEFAULT '{}',
  evidence_gaps text[] NOT NULL DEFAULT '{}',
  supporting_claim_refs text[] NOT NULL DEFAULT '{}',
  supporting_source_refs text[] NOT NULL DEFAULT '{}',
  current_eligibility jsonb,
  setups text[] NOT NULL DEFAULT '{}',
  market_cap_at_synthesis numeric,
  price_at_synthesis numeric,
  liquidity_at_synthesis numeric,
  research_packet_id uuid REFERENCES public.research_packets(id),
  research_packet_version text,
  triage_run_id uuid REFERENCES public.ai_triage_runs(id),
  triage_decision_id uuid REFERENCES public.ai_triage_decisions(id),
  deep_research_run_id uuid REFERENCES public.deep_research_runs(id),
  deep_research_report_id uuid REFERENCES public.deep_research_reports(id),
  shortlist_milestone_id uuid REFERENCES public.token_stage_milestones(id),
  thesis_call_milestone_id uuid REFERENCES public.token_stage_milestones(id),
  qualified_as_opportunity boolean NOT NULL DEFAULT false,
  thesis_policy_version text NOT NULL,
  prompt_version text NOT NULL,
  input_policy_version text NOT NULL,
  model_provider text,
  model_identifier text,
  diagnostics jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.thesis_reports TO anon, authenticated;
GRANT ALL ON public.thesis_reports TO service_role;
ALTER TABLE public.thesis_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Thesis reports are readable" ON public.thesis_reports FOR SELECT USING (true);

CREATE INDEX thesis_reports_run_idx ON public.thesis_reports(thesis_synthesis_run_id);
CREATE INDEX thesis_reports_mint_idx ON public.thesis_reports(mint, created_at DESC);
CREATE INDEX thesis_reports_created_idx ON public.thesis_reports(created_at DESC);