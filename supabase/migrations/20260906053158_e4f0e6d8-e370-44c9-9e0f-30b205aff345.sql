CREATE TABLE public.research_spend_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_version TEXT NOT NULL,
  is_calibration BOOLEAN NOT NULL DEFAULT false,
  scan_run_id UUID REFERENCES public.scan_runs(id) ON DELETE SET NULL,
  triage_run_id UUID NOT NULL REFERENCES public.ai_triage_runs(id) ON DELETE CASCADE,
  triage_decision_id UUID REFERENCES public.ai_triage_decisions(id) ON DELETE SET NULL,
  research_packet_id UUID REFERENCES public.research_packets(id) ON DELETE SET NULL,
  token_id UUID REFERENCES public.tokens(id) ON DELETE SET NULL,
  mint TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  triage_rank INTEGER,
  quant_rank INTEGER,
  recurrence_state TEXT,
  recurrence_number INTEGER,
  spend_decision TEXT NOT NULL,
  spend_decision_reason TEXT NOT NULL,
  prior_research_report_id UUID REFERENCES public.deep_research_reports(id) ON DELETE SET NULL,
  prior_research_run_id UUID REFERENCES public.deep_research_runs(id) ON DELETE SET NULL,
  prior_scan_run_id UUID,
  prior_triage_run_id UUID,
  prior_research_at TIMESTAMP WITH TIME ZONE,
  prior_research_age_minutes INTEGER,
  prior_research_status TEXT,
  prior_research_version TEXT,
  prior_search_health TEXT,
  cooldown_minutes INTEGER,
  cooldown_remaining_minutes INTEGER,
  next_eligible_at TIMESTAMP WITH TIME ZONE,
  material_change_override BOOLEAN NOT NULL DEFAULT false,
  material_change_reason_codes TEXT[] NOT NULL DEFAULT '{}',
  budget_state TEXT,
  budget_scan_used INTEGER,
  budget_scan_limit INTEGER,
  budget_window_used INTEGER,
  budget_window_limit INTEGER,
  executed BOOLEAN NOT NULL DEFAULT false,
  deep_research_run_id UUID REFERENCES public.deep_research_runs(id) ON DELETE SET NULL,
  diagnostics JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_spend_decisions TO authenticated;
GRANT ALL ON public.research_spend_decisions TO service_role;

ALTER TABLE public.research_spend_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read research spend decisions"
ON public.research_spend_decisions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can write research spend decisions"
ON public.research_spend_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX research_spend_decisions_cohort_mint_policy_unique
ON public.research_spend_decisions (triage_run_id, mint, policy_version);

CREATE INDEX research_spend_decisions_mint_idx
ON public.research_spend_decisions (mint, created_at DESC);

CREATE INDEX research_spend_decisions_scan_idx
ON public.research_spend_decisions (scan_run_id);

CREATE TRIGGER research_spend_decisions_updated_at
BEFORE UPDATE ON public.research_spend_decisions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();