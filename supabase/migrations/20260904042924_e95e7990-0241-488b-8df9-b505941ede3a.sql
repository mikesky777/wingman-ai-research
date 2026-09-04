ALTER TABLE public.scan_candidates
  ADD COLUMN IF NOT EXISTS participation_status text,
  ADD COLUMN IF NOT EXISTS participation_policy_version text,
  ADD COLUMN IF NOT EXISTS participation_detail jsonb;

ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS participation_diagnostics jsonb;

CREATE INDEX IF NOT EXISTS scan_candidates_participation_status_idx
  ON public.scan_candidates (scan_run_id, participation_status);

CREATE INDEX IF NOT EXISTS evidence_observations_participation_idx
  ON public.evidence_observations (token_id, domain, captured_at DESC);