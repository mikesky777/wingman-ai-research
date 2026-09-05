ALTER TABLE public.deep_research_reports
  ADD COLUMN IF NOT EXISTS evidence_semantics_version text,
  ADD COLUMN IF NOT EXISTS token_identity_confidence text,
  ADD COLUMN IF NOT EXISTS project_attribution_confidence text,
  ADD COLUMN IF NOT EXISTS search_health text,
  ADD COLUMN IF NOT EXISTS search_failed_attempts integer,
  ADD COLUMN IF NOT EXISTS community_source_count integer,
  ADD COLUMN IF NOT EXISTS on_chain_mirror_count integer,
  ADD COLUMN IF NOT EXISTS distinct_evidence_origins integer;

ALTER TABLE public.deep_research_sources
  ADD COLUMN IF NOT EXISTS on_chain_mirror boolean,
  ADD COLUMN IF NOT EXISTS evidence_origin text;

CREATE INDEX IF NOT EXISTS deep_research_reports_search_health_idx
  ON public.deep_research_reports (search_health);
CREATE INDEX IF NOT EXISTS deep_research_reports_evidence_semantics_idx
  ON public.deep_research_reports (evidence_semantics_version);