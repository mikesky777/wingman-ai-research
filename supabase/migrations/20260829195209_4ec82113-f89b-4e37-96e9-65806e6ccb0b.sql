-- 1. Token identity: primary pair / DEX provenance from live market data
ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS primary_dex_id text,
  ADD COLUMN IF NOT EXISTS primary_quote_token_address text,
  ADD COLUMN IF NOT EXISTS primary_quote_token_symbol text,
  ADD COLUMN IF NOT EXISTS pair_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_ingested_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata_source text;

-- 2. Snapshot provenance + promotional (paid) attention signals, kept separate
--    from organic market activity. NULL always means "unavailable", never zero.
ALTER TABLE public.token_snapshots
  ADD COLUMN IF NOT EXISTS source_pair_address text,
  ADD COLUMN IF NOT EXISTS source_dex_id text,
  ADD COLUMN IF NOT EXISTS source_pair_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingestion_version text,
  ADD COLUMN IF NOT EXISTS active_boost_count integer,
  ADD COLUMN IF NOT EXISTS total_boost_amount numeric,
  ADD COLUMN IF NOT EXISTS has_active_boost boolean,
  ADD COLUMN IF NOT EXISTS has_paid_profile boolean;

CREATE INDEX IF NOT EXISTS token_snapshots_source_idx
  ON public.token_snapshots (data_source, captured_at DESC);

-- 3. System-generated tables become read-only for browser clients.
--    Writes must go through trusted server-side Wingman functions
--    (service role). The watchlist keeps prototype browser writes for now.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.tokens,
     public.token_snapshots,
     public.scan_runs,
     public.scan_candidates,
     public.research_reports,
     public.opportunities,
     public.opportunity_outcomes
  FROM anon, authenticated;

GRANT SELECT ON public.tokens,
                public.token_snapshots,
                public.scan_runs,
                public.scan_candidates,
                public.research_reports,
                public.opportunities,
                public.opportunity_outcomes
  TO anon, authenticated;

GRANT ALL ON public.tokens,
             public.token_snapshots,
             public.scan_runs,
             public.scan_candidates,
             public.research_reports,
             public.opportunities,
             public.opportunity_outcomes,
             public.watchlist
  TO service_role;