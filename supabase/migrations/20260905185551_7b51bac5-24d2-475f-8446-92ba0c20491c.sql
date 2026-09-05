ALTER TABLE public.thesis_reports
  ADD COLUMN IF NOT EXISTS evidence_semantics_version text,
  ADD COLUMN IF NOT EXISTS evidence_polarity_counts jsonb,
  ADD COLUMN IF NOT EXISTS positive_evidence jsonb,
  ADD COLUMN IF NOT EXISTS negative_evidence jsonb,
  ADD COLUMN IF NOT EXISTS missing_evidence jsonb,
  ADD COLUMN IF NOT EXISTS ambiguous_evidence jsonb,
  ADD COLUMN IF NOT EXISTS catalyst_classification text,
  ADD COLUMN IF NOT EXISTS catalyst_verification_basis text,
  ADD COLUMN IF NOT EXISTS narrative_maturity text,
  ADD COLUMN IF NOT EXISTS narrative_maturity_reasons jsonb,
  ADD COLUMN IF NOT EXISTS source_mix jsonb,
  ADD COLUMN IF NOT EXISTS gate_diagnostics jsonb;

CREATE INDEX IF NOT EXISTS thesis_reports_narrative_maturity_idx
  ON public.thesis_reports (narrative_maturity);
CREATE INDEX IF NOT EXISTS thesis_reports_catalyst_classification_idx
  ON public.thesis_reports (catalyst_classification);