CREATE TABLE public.ai_triage_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_scan_id uuid REFERENCES public.scan_runs(id),
  scanner_policy_version text,
  triage_policy_version text NOT NULL,
  model_provider text,
  model_identifier text,
  prompt_version text,
  is_calibration boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  packet_count integer NOT NULL DEFAULT 0,
  deep_research_count integer NOT NULL DEFAULT 0,
  watch_count integer NOT NULL DEFAULT 0,
  skip_count integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  error text,
  diagnostics jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_triage_runs_status_check CHECK (status IN ('running','completed','failed','failed_validation','no_eligible_current_scan'))
);

GRANT SELECT ON public.ai_triage_runs TO anon;
GRANT SELECT ON public.ai_triage_runs TO authenticated;
GRANT ALL ON public.ai_triage_runs TO service_role;

ALTER TABLE public.ai_triage_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_triage_runs_public_read"
  ON public.ai_triage_runs FOR SELECT
  USING (true);

CREATE INDEX ai_triage_runs_started_at_idx ON public.ai_triage_runs (started_at DESC);
CREATE INDEX ai_triage_runs_source_scan_idx ON public.ai_triage_runs (source_scan_id);

CREATE TABLE public.ai_triage_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_run_id uuid NOT NULL REFERENCES public.ai_triage_runs(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.tokens(id),
  mint text NOT NULL,
  research_packet_id uuid REFERENCES public.research_packets(id),
  research_packet_version text,
  candidate_source text,
  quant_priority numeric,
  quant_rank integer,
  triage_rank integer,
  rank_delta integer,
  decision text NOT NULL,
  confidence text,
  rationale text,
  strongest_positive text,
  strongest_concern text,
  unresolved_questions text[] NOT NULL DEFAULT '{}',
  requested_research_domains text[] NOT NULL DEFAULT '{}',
  setup text,
  price_structure text,
  participation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_triage_decisions_decision_check CHECK (decision IN ('DEEP_RESEARCH','WATCH','SKIP','BLOCKED_BEFORE_SHORTLIST')),
  CONSTRAINT ai_triage_decisions_confidence_check CHECK (confidence IS NULL OR confidence IN ('HIGH','MEDIUM','LOW')),
  CONSTRAINT ai_triage_decisions_unique_mint UNIQUE (triage_run_id, mint)
);

GRANT SELECT ON public.ai_triage_decisions TO anon;
GRANT SELECT ON public.ai_triage_decisions TO authenticated;
GRANT ALL ON public.ai_triage_decisions TO service_role;

ALTER TABLE public.ai_triage_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_triage_decisions_public_read"
  ON public.ai_triage_decisions FOR SELECT
  USING (true);

CREATE INDEX ai_triage_decisions_run_idx ON public.ai_triage_decisions (triage_run_id, triage_rank);
CREATE INDEX ai_triage_decisions_mint_idx ON public.ai_triage_decisions (mint);