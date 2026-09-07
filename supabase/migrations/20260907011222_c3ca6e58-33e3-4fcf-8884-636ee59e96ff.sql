CREATE TABLE public.production_cycle_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orchestrator_version TEXT NOT NULL DEFAULT 'production_cycle/v1',
  status TEXT NOT NULL DEFAULT 'STARTING',
  stage TEXT NOT NULL DEFAULT 'STARTING',
  trigger TEXT NOT NULL DEFAULT 'MANUAL',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  scan_run_id UUID,
  scanner_policy_version TEXT,
  packet_count INTEGER NOT NULL DEFAULT 0,
  triage_run_id UUID,
  triage_deep_count INTEGER NOT NULL DEFAULT 0,
  triage_watch_count INTEGER NOT NULL DEFAULT 0,
  triage_skip_count INTEGER NOT NULL DEFAULT 0,
  deep_research_executed INTEGER NOT NULL DEFAULT 0,
  deep_research_deferred INTEGER NOT NULL DEFAULT 0,
  deep_research_blocked INTEGER NOT NULL DEFAULT 0,
  deep_research_failed INTEGER NOT NULL DEFAULT 0,
  thesis_synthesized_count INTEGER NOT NULL DEFAULT 0,
  thesis_failed_count INTEGER NOT NULL DEFAULT 0,
  thesis_call_count INTEGER NOT NULL DEFAULT 0,
  entry_eligible_count INTEGER NOT NULL DEFAULT 0,
  entry_evaluated_count INTEGER NOT NULL DEFAULT 0,
  completion_code TEXT,
  failure_stage TEXT,
  failure_reason TEXT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMP WITH TIME ZONE,
  last_tick_at TIMESTAMP WITH TIME ZONE,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.production_cycle_runs TO authenticated;
GRANT SELECT ON public.production_cycle_runs TO anon;
GRANT ALL ON public.production_cycle_runs TO service_role;

ALTER TABLE public.production_cycle_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Production cycle runs are readable"
  ON public.production_cycle_runs FOR SELECT
  USING (true);

CREATE UNIQUE INDEX one_active_production_cycle
  ON public.production_cycle_runs (orchestrator_version)
  WHERE status NOT IN ('COMPLETE', 'FAILED');

CREATE INDEX production_cycle_runs_started_at_idx
  ON public.production_cycle_runs (started_at DESC);

CREATE TRIGGER production_cycle_runs_updated_at
  BEFORE UPDATE ON public.production_cycle_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();