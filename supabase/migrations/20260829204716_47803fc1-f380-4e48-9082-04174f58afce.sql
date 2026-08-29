CREATE TABLE public.evidence_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  scan_run_id uuid REFERENCES public.scan_runs(id) ON DELETE SET NULL,
  research_report_id uuid REFERENCES public.research_reports(id) ON DELETE SET NULL,
  domain text NOT NULL,
  key text NOT NULL,
  value_json jsonb,
  unit text,
  source text NOT NULL,
  source_reference text,
  observed_at timestamptz,
  captured_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('observed','unavailable')),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  metadata jsonb,
  schema_version text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_status_value_consistent
    CHECK ((status = 'unavailable' AND (value_json IS NULL OR value_json = 'null'::jsonb))
        OR (status = 'observed'))
);

GRANT SELECT ON public.evidence_observations TO anon, authenticated;
GRANT ALL ON public.evidence_observations TO service_role;

ALTER TABLE public.evidence_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Evidence observations are readable"
  ON public.evidence_observations FOR SELECT
  USING (true);

CREATE INDEX idx_evidence_token_captured
  ON public.evidence_observations (token_id, captured_at DESC);
CREATE INDEX idx_evidence_token_domain_key_captured
  ON public.evidence_observations (token_id, domain, key, captured_at DESC);
CREATE INDEX idx_evidence_source_captured
  ON public.evidence_observations (source, captured_at DESC);