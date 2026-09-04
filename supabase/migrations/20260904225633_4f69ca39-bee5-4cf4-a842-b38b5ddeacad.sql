ALTER TABLE public.deep_research_sources
  ADD COLUMN IF NOT EXISTS independence text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS content_fetched boolean NOT NULL DEFAULT false;

ALTER TABLE public.deep_research_claims
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'INFERENCE';

ALTER TABLE public.deep_research_reports
  ADD COLUMN IF NOT EXISTS independent_source_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_owned_source_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_affiliated_source_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unknown_independence_source_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS independent_domains_covered text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS corroborated_claim_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_claim_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_version text;