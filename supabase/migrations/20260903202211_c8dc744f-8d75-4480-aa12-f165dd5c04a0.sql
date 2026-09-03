ALTER TABLE public.scan_candidates
  ADD COLUMN IF NOT EXISTS refresh_state text NOT NULL DEFAULT 'REFRESH_REQUIRED',
  ADD COLUMN IF NOT EXISTS evidence_carried_forward boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS evidence_age_minutes numeric;

ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS recurrence_diagnostics jsonb;

CREATE INDEX IF NOT EXISTS scan_candidates_refresh_state_idx
  ON public.scan_candidates (scan_run_id, refresh_state);