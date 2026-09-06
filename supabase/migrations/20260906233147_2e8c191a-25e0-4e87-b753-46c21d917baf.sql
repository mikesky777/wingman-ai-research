CREATE TABLE public.research_tradability_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  policy_version text NOT NULL,
  is_calibration boolean NOT NULL DEFAULT false,
  scan_run_id uuid,
  triage_run_id uuid,
  triage_decision_id uuid,
  research_spend_decision_id uuid,
  deep_research_run_id uuid,
  token_id uuid,
  mint text NOT NULL,
  chain text NOT NULL DEFAULT 'solana',
  triage_decision text,
  spend_decision text,
  resolved_pair_address text,
  dex_id text,
  market_source text NOT NULL,
  liquidity_usd numeric,
  min_liquidity_usd numeric NOT NULL,
  result text NOT NULL,
  reason_code text NOT NULL,
  provider_error_code text,
  detail text,
  deep_research_executed boolean NOT NULL DEFAULT false
);

CREATE INDEX research_tradability_checks_mint_idx ON public.research_tradability_checks (mint, checked_at DESC);
CREATE INDEX research_tradability_checks_triage_idx ON public.research_tradability_checks (triage_run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_tradability_checks TO authenticated;
GRANT ALL ON public.research_tradability_checks TO service_role;

ALTER TABLE public.research_tradability_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tradability checks"
  ON public.research_tradability_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write tradability checks"
  ON public.research_tradability_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.research_spend_decisions
  ADD COLUMN IF NOT EXISTS tradability_result text,
  ADD COLUMN IF NOT EXISTS tradability_reason_code text,
  ADD COLUMN IF NOT EXISTS tradability_liquidity_usd numeric,
  ADD COLUMN IF NOT EXISTS tradability_pair_address text,
  ADD COLUMN IF NOT EXISTS tradability_market_source text,
  ADD COLUMN IF NOT EXISTS tradability_checked_at timestamptz;