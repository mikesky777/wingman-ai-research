CREATE TABLE public.entry_state_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.tokens(id),
  mint text NOT NULL,
  chain text NOT NULL DEFAULT 'solana',
  symbol text,
  name text,
  thesis_report_id uuid REFERENCES public.thesis_reports(id),
  research_packet_id uuid REFERENCES public.research_packets(id),
  research_packet_version text,
  deep_research_report_id uuid REFERENCES public.deep_research_reports(id),
  source_scan_id uuid REFERENCES public.scan_runs(id),
  market_snapshot_id uuid REFERENCES public.token_snapshots(id),
  evaluated_at timestamp with time zone NOT NULL DEFAULT now(),
  market_evidence_at timestamp with time zone,
  entry_policy_version text NOT NULL,
  feature_version text NOT NULL,
  is_calibration boolean NOT NULL DEFAULT true,
  state text NOT NULL,
  previous_state text,
  state_changed_at timestamp with time zone,
  entry_score numeric,
  score_structure numeric,
  score_extension numeric,
  score_volume_flow numeric,
  score_risk_definition numeric,
  component_scores jsonb,
  timing_features jsonb,
  price_attention_divergence text NOT NULL DEFAULT 'UNKNOWN',
  divergence_detail jsonb,
  rationale text,
  strongest_positive_signal text,
  strongest_entry_risk text,
  what_would_improve_entry text[] NOT NULL DEFAULT '{}',
  what_would_break_entry text[] NOT NULL DEFAULT '{}',
  evidence_gaps text[] NOT NULL DEFAULT '{}',
  current_eligibility jsonb,
  narrative_timing_confidence text,
  thesis_score integer,
  evidence_confidence integer,
  thesis_verdict text,
  setups text[] NOT NULL DEFAULT '{}',
  price_usd numeric,
  market_cap numeric,
  liquidity_usd numeric,
  diagnostics jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX entry_state_evaluations_mint_idx ON public.entry_state_evaluations (mint, evaluated_at DESC);
CREATE INDEX entry_state_evaluations_thesis_idx ON public.entry_state_evaluations (thesis_report_id, evaluated_at DESC);

GRANT SELECT ON public.entry_state_evaluations TO anon;
GRANT SELECT ON public.entry_state_evaluations TO authenticated;
GRANT ALL ON public.entry_state_evaluations TO service_role;

ALTER TABLE public.entry_state_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entry state evaluations are publicly readable"
ON public.entry_state_evaluations FOR SELECT
USING (true);