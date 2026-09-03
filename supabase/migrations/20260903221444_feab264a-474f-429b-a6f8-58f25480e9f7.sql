CREATE TABLE IF NOT EXISTS public.structural_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id uuid REFERENCES public.tokens(id),
  scan_run_id uuid REFERENCES public.scan_runs(id),
  contract_address text NOT NULL,
  chain text NOT NULL DEFAULT 'solana',
  policy_version text NOT NULL,
  status text NOT NULL,
  evaluated_at timestamp with time zone NOT NULL DEFAULT now(),
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.structural_evaluations TO anon, authenticated;
GRANT ALL ON public.structural_evaluations TO service_role;

ALTER TABLE public.structural_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Structural evaluations are readable"
  ON public.structural_evaluations FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS structural_evaluations_run_idx
  ON public.structural_evaluations (scan_run_id);
CREATE INDEX IF NOT EXISTS structural_evaluations_address_idx
  ON public.structural_evaluations (contract_address, evaluated_at DESC);

ALTER TABLE public.scan_candidates
  ADD COLUMN IF NOT EXISTS structural_status text,
  ADD COLUMN IF NOT EXISTS structural_policy_version text,
  ADD COLUMN IF NOT EXISTS structural_detail jsonb;

ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS structural_diagnostics jsonb;

CREATE INDEX IF NOT EXISTS scan_candidates_structural_status_idx
  ON public.scan_candidates (structural_status);