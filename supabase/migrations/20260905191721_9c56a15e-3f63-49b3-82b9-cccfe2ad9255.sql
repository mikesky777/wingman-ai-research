CREATE TABLE public.thesis_synthesis_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thesis_report_id UUID NOT NULL UNIQUE REFERENCES public.thesis_reports(id) ON DELETE CASCADE,
  thesis_synthesis_run_id UUID REFERENCES public.thesis_synthesis_runs(id) ON DELETE SET NULL,
  token_id UUID REFERENCES public.tokens(id) ON DELETE SET NULL,
  mint TEXT NOT NULL,
  chain TEXT,
  synthesized_at TIMESTAMP WITH TIME ZONE NOT NULL,
  observed_at TIMESTAMP WITH TIME ZONE,
  market_cap NUMERIC,
  price_usd NUMERIC,
  liquidity_usd NUMERIC,
  volume_24h NUMERIC,
  market_source TEXT,
  source_pair_address TEXT,
  source_scan_id UUID,
  triage_run_id UUID,
  deep_research_run_id UUID,
  research_packet_id UUID,
  baseline_version TEXT NOT NULL DEFAULT 'thesis_baseline/v1',
  baseline_origin TEXT NOT NULL DEFAULT 'CAPTURED_AT_SYNTHESIS',
  is_calibration BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_thesis_synthesis_baselines_mint ON public.thesis_synthesis_baselines (mint);
CREATE INDEX idx_thesis_synthesis_baselines_synth_at ON public.thesis_synthesis_baselines (synthesized_at DESC);

GRANT SELECT ON public.thesis_synthesis_baselines TO anon;
GRANT SELECT ON public.thesis_synthesis_baselines TO authenticated;
GRANT ALL ON public.thesis_synthesis_baselines TO service_role;

ALTER TABLE public.thesis_synthesis_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thesis synthesis baselines are readable"
  ON public.thesis_synthesis_baselines FOR SELECT USING (true);