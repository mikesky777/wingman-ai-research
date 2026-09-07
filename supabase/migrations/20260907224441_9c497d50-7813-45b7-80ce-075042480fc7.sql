ALTER TABLE public.production_cycle_runs
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS worker_status TEXT NOT NULL DEFAULT 'UNCLAIMED',
  ADD COLUMN IF NOT EXISTS worker_heartbeat_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS claim_acquired_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS recovery_state TEXT,
  ADD COLUMN IF NOT EXISTS recovery_reason TEXT,
  ADD COLUMN IF NOT EXISTS worker_error TEXT;

ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS production_cycle_run_id UUID REFERENCES public.production_cycle_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_owner TEXT,
  ADD COLUMN IF NOT EXISTS execution_heartbeat_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS scan_runs_one_per_production_cycle_idx
  ON public.scan_runs (production_cycle_run_id)
  WHERE production_cycle_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS scan_runs_execution_heartbeat_idx
  ON public.scan_runs (execution_heartbeat_at DESC)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.production_cycle_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_cycle_run_id UUID NOT NULL REFERENCES public.production_cycle_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stage TEXT,
  worker_id TEXT,
  scan_run_id UUID,
  reason TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.production_cycle_events TO authenticated;
GRANT SELECT ON public.production_cycle_events TO anon;
GRANT ALL ON public.production_cycle_events TO service_role;

ALTER TABLE public.production_cycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Production cycle events are readable"
  ON public.production_cycle_events FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS production_cycle_events_cycle_idx
  ON public.production_cycle_events (production_cycle_run_id, occurred_at DESC);

UPDATE public.production_cycle_runs
SET accepted_at = COALESCE(accepted_at, started_at),
    requested_at = COALESCE(requested_at, started_at),
    last_progress_at = COALESCE(last_progress_at, last_tick_at, started_at);

UPDATE public.scan_runs
SET production_cycle_run_id = '1f808799-f95a-48b9-9000-133e3829dfa3'
WHERE id = 'c6ca17c3-ce46-4b8f-8bd4-2bc00febe3eb'
  AND production_cycle_run_id IS NULL;

UPDATE public.production_cycle_runs
SET scan_run_id = 'c6ca17c3-ce46-4b8f-8bd4-2bc00febe3eb'
WHERE id = '1f808799-f95a-48b9-9000-133e3829dfa3'
  AND scan_run_id IS NULL;