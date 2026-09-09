ALTER TABLE public.evidence_observations
  ADD COLUMN IF NOT EXISTS affiliation TEXT,
  ADD COLUMN IF NOT EXISTS attribution_status TEXT NOT NULL DEFAULT 'RESOLVED_MINT',
  ADD COLUMN IF NOT EXISTS collection_health TEXT;

ALTER TABLE public.evidence_observations ALTER COLUMN token_id DROP NOT NULL;

ALTER TABLE public.evidence_observations
  ADD CONSTRAINT evidence_observations_attribution_status_check
  CHECK (attribution_status IN ('RESOLVED_MINT','UNRESOLVED_TOKEN_ATTRIBUTION'));

ALTER TABLE public.evidence_observations
  ADD CONSTRAINT evidence_observations_affiliation_check
  CHECK (affiliation IS NULL OR affiliation IN ('PROJECT','COMMUNITY','INDEPENDENT','MIRROR','UNKNOWN'));

ALTER TABLE public.evidence_observations
  ADD CONSTRAINT evidence_observations_collection_health_check
  CHECK (collection_health IS NULL OR collection_health IN ('HEALTHY','DEGRADED','RATE_LIMITED','UNAVAILABLE','NOT_CONFIGURED','PARTIAL','UNKNOWN'));

ALTER TABLE public.evidence_observations
  ADD CONSTRAINT evidence_observations_attribution_linkage_check
  CHECK (
    (attribution_status = 'RESOLVED_MINT' AND token_id IS NOT NULL)
    OR (attribution_status = 'UNRESOLVED_TOKEN_ATTRIBUTION')
  );