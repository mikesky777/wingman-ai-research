ALTER TABLE public.scan_candidates
  ADD COLUMN IF NOT EXISTS universe_eligibility text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS universe_category text,
  ADD COLUMN IF NOT EXISTS universe_reason text,
  ADD COLUMN IF NOT EXISTS refresh_domains jsonb;

ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS universe_diagnostics jsonb,
  ADD COLUMN IF NOT EXISTS refresh_diagnostics jsonb;

CREATE INDEX IF NOT EXISTS scan_candidates_universe_eligibility_idx
  ON public.scan_candidates (universe_eligibility);