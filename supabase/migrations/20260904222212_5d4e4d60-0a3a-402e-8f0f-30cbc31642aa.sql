CREATE TABLE public.deep_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_run_id uuid REFERENCES public.ai_triage_runs(id),
  triage_decision_id uuid REFERENCES public.ai_triage_decisions(id),
  shortlist_milestone_id uuid REFERENCES public.token_stage_milestones(id),
  token_id uuid REFERENCES public.tokens(id),
  mint text NOT NULL,
  chain text NOT NULL DEFAULT 'solana',
  research_packet_id uuid REFERENCES public.research_packets(id),
  research_packet_version text,
  research_policy_version text NOT NULL,
  prompt_version text NOT NULL,
  model_provider text,
  model_identifier text,
  is_calibration boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  status text NOT NULL,
  stop_reason text,
  query_count integer NOT NULL DEFAULT 0,
  fetched_source_count integer NOT NULL DEFAULT 0,
  model_pass_count integer NOT NULL DEFAULT 0,
  budget jsonb,
  eligibility_before jsonb,
  eligibility_after jsonb,
  diagnostics jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deep_research_runs_mint_idx ON public.deep_research_runs (mint, created_at DESC);
CREATE INDEX deep_research_runs_triage_idx ON public.deep_research_runs (triage_run_id);
CREATE INDEX deep_research_runs_created_idx ON public.deep_research_runs (created_at DESC);
GRANT SELECT ON public.deep_research_runs TO anon, authenticated;
GRANT ALL ON public.deep_research_runs TO service_role;
ALTER TABLE public.deep_research_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deep_research_runs_read" ON public.deep_research_runs FOR SELECT USING (true);

CREATE TABLE public.deep_research_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deep_research_run_id uuid NOT NULL REFERENCES public.deep_research_runs(id),
  token_id uuid REFERENCES public.tokens(id),
  mint text NOT NULL,
  chain text NOT NULL DEFAULT 'solana',
  dossier_version text NOT NULL,
  research_policy_version text NOT NULL,
  is_calibration boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  one_sentence_narrative text,
  narrative_resolved boolean NOT NULL DEFAULT false,
  identity_attribution_confidence text NOT NULL DEFAULT 'UNRESOLVED',
  evidence_coverage_pct numeric,
  covered_domains text[] NOT NULL DEFAULT '{}',
  unresolved_domains text[] NOT NULL DEFAULT '{}',
  source_count integer NOT NULL DEFAULT 0,
  primary_source_count integer NOT NULL DEFAULT 0,
  source_domain_diversity integer NOT NULL DEFAULT 0,
  conflicting_claim_count integer NOT NULL DEFAULT 0,
  unresolved_gap_count integer NOT NULL DEFAULT 0,
  dossier jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deep_research_reports_run_idx ON public.deep_research_reports (deep_research_run_id);
CREATE INDEX deep_research_reports_mint_idx ON public.deep_research_reports (mint, created_at DESC);
GRANT SELECT ON public.deep_research_reports TO anon, authenticated;
GRANT ALL ON public.deep_research_reports TO service_role;
ALTER TABLE public.deep_research_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deep_research_reports_read" ON public.deep_research_reports FOR SELECT USING (true);

CREATE TABLE public.deep_research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deep_research_run_id uuid NOT NULL REFERENCES public.deep_research_runs(id),
  report_id uuid REFERENCES public.deep_research_reports(id),
  source_ref text NOT NULL,
  url text,
  title text,
  account text,
  source_type text NOT NULL,
  reliability_class text NOT NULL,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL,
  relevance text,
  mint_verified boolean NOT NULL DEFAULT false,
  attribution_confidence text NOT NULL DEFAULT 'UNRESOLVED',
  query text,
  excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deep_research_sources_run_idx ON public.deep_research_sources (deep_research_run_id);
GRANT SELECT ON public.deep_research_sources TO anon, authenticated;
GRANT ALL ON public.deep_research_sources TO service_role;
ALTER TABLE public.deep_research_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deep_research_sources_read" ON public.deep_research_sources FOR SELECT USING (true);

CREATE TABLE public.deep_research_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deep_research_run_id uuid NOT NULL REFERENCES public.deep_research_runs(id),
  report_id uuid REFERENCES public.deep_research_reports(id),
  domain text NOT NULL,
  claim text NOT NULL,
  claim_type text NOT NULL,
  status text NOT NULL,
  confidence text NOT NULL,
  supporting_source_refs text[] NOT NULL DEFAULT '{}',
  contradicting_source_refs text[] NOT NULL DEFAULT '{}',
  observed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deep_research_claims_run_idx ON public.deep_research_claims (deep_research_run_id);
CREATE INDEX deep_research_claims_report_idx ON public.deep_research_claims (report_id);
GRANT SELECT ON public.deep_research_claims TO anon, authenticated;
GRANT ALL ON public.deep_research_claims TO service_role;
ALTER TABLE public.deep_research_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deep_research_claims_read" ON public.deep_research_claims FOR SELECT USING (true);