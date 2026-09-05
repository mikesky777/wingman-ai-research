-- One canonical production thesis artifact per (triage cohort, mint, deep research report).
ALTER TABLE public.thesis_reports
  ADD COLUMN IF NOT EXISTS production_idempotency_key text;

COMMENT ON COLUMN public.thesis_reports.production_idempotency_key IS
  'thesis_idempotency/v1 — set only for new production artifacts: <triage_run_id>:<mint>:<deep_research_report_id>. NULL on historical rows, which are preserved untouched.';

CREATE UNIQUE INDEX IF NOT EXISTS thesis_reports_production_idempotency_key_uidx
  ON public.thesis_reports (production_idempotency_key)
  WHERE production_idempotency_key IS NOT NULL;

-- At most one in-flight production thesis batch per cohort (triage run).
CREATE UNIQUE INDEX IF NOT EXISTS thesis_synthesis_runs_one_inflight_production_uidx
  ON public.thesis_synthesis_runs (triage_run_id)
  WHERE is_calibration = false AND status = 'running';