ALTER TABLE public.thesis_reports
  ADD COLUMN IF NOT EXISTS evidence_confidence_version text,
  ADD COLUMN IF NOT EXISTS evidence_confidence_raw_score integer,
  ADD COLUMN IF NOT EXISTS evidence_confidence_artifact jsonb;

COMMENT ON COLUMN public.thesis_reports.evidence_confidence_artifact IS
  'evidence_confidence/v1.1 artifact: pre-floor score, deductions with unresolved reasons, search health and calibration diagnostics. Historical v1 rows stay NULL and are never recomputed.';