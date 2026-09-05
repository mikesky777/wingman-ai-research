CREATE TABLE public.thesis_call_monitoring (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_call_milestone_id uuid NOT NULL UNIQUE REFERENCES public.token_stage_milestones(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  mint text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESEARCH_DUE','INACTIVE','INVALIDATED')),
  status_reason_code text,
  status_reason text,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  requires_fresh_entry_after timestamptz,
  last_reconciled_at timestamptz,
  policy_version text NOT NULL DEFAULT 'live_lifecycle/v2',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.thesis_call_monitoring TO anon;
GRANT SELECT ON public.thesis_call_monitoring TO authenticated;
GRANT ALL ON public.thesis_call_monitoring TO service_role;

ALTER TABLE public.thesis_call_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Monitoring is publicly readable"
  ON public.thesis_call_monitoring FOR SELECT USING (true);

CREATE TRIGGER thesis_call_monitoring_updated_at
  BEFORE UPDATE ON public.thesis_call_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX thesis_call_monitoring_mint_idx ON public.thesis_call_monitoring (mint);
CREATE INDEX thesis_call_monitoring_status_idx ON public.thesis_call_monitoring (status);

CREATE TABLE public.live_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('LIVE_ACTIVATED','LIVE_DEACTIVATED','MONITORING_STATUS_CHANGED')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  thesis_call_milestone_id uuid NOT NULL REFERENCES public.token_stage_milestones(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  mint text NOT NULL,
  episode_number integer,
  thesis_report_id uuid REFERENCES public.thesis_reports(id) ON DELETE SET NULL,
  entry_evaluation_id uuid REFERENCES public.entry_state_evaluations(id) ON DELETE SET NULL,
  entry_state text,
  entry_evaluated_at timestamptz,
  timing_resolution text,
  price_history_source text,
  market_cap_at_event numeric,
  liquidity_at_event numeric,
  price_usd_at_event numeric,
  market_observed_at timestamptz,
  monitoring_status text,
  reason_code text,
  reason text,
  policy_version text NOT NULL DEFAULT 'live_lifecycle/v2',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.live_call_events TO anon;
GRANT SELECT ON public.live_call_events TO authenticated;
GRANT ALL ON public.live_call_events TO service_role;

ALTER TABLE public.live_call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live call events are publicly readable"
  ON public.live_call_events FOR SELECT USING (true);

CREATE INDEX live_call_events_mint_idx ON public.live_call_events (mint, occurred_at DESC);
CREATE INDEX live_call_events_call_idx ON public.live_call_events (thesis_call_milestone_id, occurred_at DESC);
CREATE INDEX live_call_events_type_idx ON public.live_call_events (event_type, occurred_at DESC);