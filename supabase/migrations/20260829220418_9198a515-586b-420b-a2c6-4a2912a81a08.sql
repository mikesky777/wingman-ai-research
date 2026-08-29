
ALTER TABLE public.scan_candidates
  ADD COLUMN IF NOT EXISTS global_rank integer,
  ADD COLUMN IF NOT EXISTS lane_ranks jsonb,
  ADD COLUMN IF NOT EXISTS selected_by_lane_reservation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selected_by_global_ranking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS extension_reasons jsonb,
  ADD COLUMN IF NOT EXISTS structural_safety text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS token_security text NOT NULL DEFAULT 'NOT_CHECKED',
  ADD COLUMN IF NOT EXISTS price_usd numeric,
  ADD COLUMN IF NOT EXISTS price_change_1h numeric,
  ADD COLUMN IF NOT EXISTS price_change_6h numeric,
  ADD COLUMN IF NOT EXISTS price_change_24h numeric,
  ADD COLUMN IF NOT EXISTS volume_5m numeric,
  ADD COLUMN IF NOT EXISTS volume_6h numeric,
  ADD COLUMN IF NOT EXISTS trades_5m numeric,
  ADD COLUMN IF NOT EXISTS trades_1h numeric,
  ADD COLUMN IF NOT EXISTS trades_24h numeric,
  ADD COLUMN IF NOT EXISTS buys_24h numeric,
  ADD COLUMN IF NOT EXISTS sells_24h numeric,
  ADD COLUMN IF NOT EXISTS holder_count numeric,
  ADD COLUMN IF NOT EXISTS market_cap_bucket text,
  ADD COLUMN IF NOT EXISTS history_snapshot_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metrics_detail jsonb;

DO $$ BEGIN
  ALTER TABLE public.scan_candidates
    ADD CONSTRAINT scan_candidates_structural_safety_check
    CHECK (structural_safety IN ('UNKNOWN','PASS','CONCERN','FAIL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.scan_candidates
    ADD CONSTRAINT scan_candidates_token_security_check
    CHECK (token_security IN ('NOT_CHECKED','PASS','CONCERN','FAIL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS scan_candidates_bucket_idx
  ON public.scan_candidates (scan_run_id, market_cap_bucket);

ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS bucket_diagnostics jsonb,
  ADD COLUMN IF NOT EXISTS lane_diagnostics jsonb,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS survivor_limit integer;

CREATE TABLE IF NOT EXISTS public.scanner_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  scan_run_id uuid REFERENCES public.scan_runs(id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT 'UNREVIEWED' CHECK (label IN ('UNREVIEWED','INTERESTING','RESEARCH','JUNK')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_id, scan_run_id)
);

GRANT SELECT ON public.scanner_labels TO anon;
GRANT SELECT ON public.scanner_labels TO authenticated;
GRANT ALL ON public.scanner_labels TO service_role;

ALTER TABLE public.scanner_labels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Calibration labels are readable" ON public.scanner_labels
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS scanner_labels_token_idx ON public.scanner_labels (token_id, updated_at DESC);

DROP TRIGGER IF EXISTS scanner_labels_updated_at ON public.scanner_labels;
CREATE TRIGGER scanner_labels_updated_at
  BEFORE UPDATE ON public.scanner_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
