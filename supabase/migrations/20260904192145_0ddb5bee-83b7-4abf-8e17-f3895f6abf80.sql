CREATE TABLE public.token_stage_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id),
  contract_address text NOT NULL,
  chain text NOT NULL DEFAULT 'solana',
  stage text NOT NULL CHECK (stage IN ('SETUP_QUALIFIED','SURVIVOR','AI_SHORTLIST','THESIS_CALL')),
  first_entered_at timestamptz NOT NULL,
  source_scan_id uuid REFERENCES public.scan_runs(id),
  setup_at_entry text,
  first_setup text,
  first_base_at timestamptz,
  first_reaccel_at timestamptz,
  market_cap_at_entry numeric,
  price_at_entry numeric,
  liquidity_at_entry numeric,
  market_snapshot_id uuid REFERENCES public.token_snapshots(id),
  evidence_observation_id uuid REFERENCES public.evidence_observations(id),
  quantitative_priority_at_entry numeric,
  source_type text NOT NULL CHECK (source_type IN ('SCANNER','AI_TRIAGE','THESIS_SYNTHESIS','BACKFILL')),
  source_id uuid,
  source_ref text,
  research_packet_id uuid REFERENCES public.research_packets(id),
  research_packet_version text,
  research_run_id uuid,
  research_report_id uuid REFERENCES public.research_reports(id),
  policy_version text,
  milestone_version text NOT NULL DEFAULT 'stage_milestone/v1',
  baseline_complete boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_stage_milestones_unique_stage UNIQUE (token_id, stage)
);

CREATE INDEX token_stage_milestones_stage_entered_idx ON public.token_stage_milestones (stage, first_entered_at DESC);
CREATE INDEX token_stage_milestones_contract_idx ON public.token_stage_milestones (contract_address);
CREATE INDEX token_stage_milestones_scan_idx ON public.token_stage_milestones (source_scan_id);

GRANT SELECT ON public.token_stage_milestones TO anon;
GRANT SELECT ON public.token_stage_milestones TO authenticated;
GRANT ALL ON public.token_stage_milestones TO service_role;

ALTER TABLE public.token_stage_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stage milestones are publicly readable"
  ON public.token_stage_milestones FOR SELECT
  USING (true);