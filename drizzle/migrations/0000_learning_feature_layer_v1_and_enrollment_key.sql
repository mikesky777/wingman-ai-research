-- Fix: outcome_enrollments upsert targeted an expression index, which ON CONFLICT cannot match.
ALTER TABLE public.outcome_enrollments ADD COLUMN IF NOT EXISTS event_key TEXT GENERATED ALWAYS AS (
  contract_address || '|' || funnel_stage || '|' || COALESCE(decision_class, '') || '|' ||
  COALESCE(source_event_id, '') || '|' || COALESCE(scan_run_id::text, '') || '|' || COALESCE(triage_run_id::text, '')
) STORED;
ALTER TABLE public.outcome_enrollments ADD CONSTRAINT outcome_enrollments_event_key_unique UNIQUE (event_key);

CREATE TABLE public.learning_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version TEXT NOT NULL DEFAULT 'learning_decision_event/v1',
  source_event_id TEXT NOT NULL,
  source_artifact_type TEXT NOT NULL,
  source_artifact_version TEXT,
  funnel_stage TEXT NOT NULL CHECK (funnel_stage IN ('SCANNER_CANDIDATE','AI_TRIAGE','DEEP_RESEARCH','THESIS_SYNTHESIZED','ENTRY_EVALUATED')),
  token_id UUID,
  contract_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  attribution_status TEXT NOT NULL CHECK (attribution_status IN ('RESOLVED_MINT','UNRESOLVED_TOKEN_ATTRIBUTION')),
  decision_at TIMESTAMPTZ NOT NULL,
  scan_run_id UUID,
  triage_run_id UUID,
  deep_research_run_id UUID,
  thesis_report_id UUID,
  entry_evaluation_id UUID,
  production_cycle_run_id UUID,
  cohort_ref TEXT,
  production_policy_version TEXT,
  input_schema_version TEXT,
  population_class TEXT,
  outcome_enrollment_id UUID,
  enrollment_type TEXT,
  sampling_policy_version TEXT,
  sampling_stratum TEXT,
  inclusion_probability DOUBLE PRECISION,
  projection_version TEXT NOT NULL,
  projection_mode TEXT NOT NULL CHECK (projection_mode IN ('LIVE_DECISION_PROJECTION','HISTORICAL_FROZEN_ARTIFACT_PROJECTION')),
  projected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_decision_events_identity UNIQUE (source_artifact_type, source_event_id, funnel_stage, projection_version)
);
CREATE INDEX learning_decision_events_stage_time ON public.learning_decision_events (funnel_stage, decision_at DESC);
CREATE INDEX learning_decision_events_mint ON public.learning_decision_events (contract_address);
CREATE INDEX learning_decision_events_scan ON public.learning_decision_events (scan_run_id);

CREATE TABLE public.learning_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version TEXT NOT NULL DEFAULT 'learning_feature_snapshot/v1',
  learning_event_id UUID NOT NULL REFERENCES public.learning_decision_events(id) ON DELETE RESTRICT,
  source_event_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  token_id UUID,
  funnel_stage TEXT NOT NULL,
  decision_at TIMESTAMPTZ NOT NULL,
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*/v[0-9]+$'),
  feature_semantic_version INTEGER NOT NULL CHECK (feature_semantic_version >= 1),
  value_number DOUBLE PRECISION,
  value_text TEXT,
  value_boolean BOOLEAN,
  status TEXT NOT NULL CHECK (status IN ('OBSERVED','UNAVAILABLE','NOT_EVALUATED','NOT_APPLICABLE','UNRESOLVED')),
  observed_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  source TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  affiliation TEXT,
  collection_health TEXT,
  production_policy_version TEXT,
  projection_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_feature_value_status CHECK (
    status = 'OBSERVED' OR (value_number IS NULL AND value_text IS NULL AND value_boolean IS NULL)
  ),
  CONSTRAINT learning_feature_not_after_decision CHECK (observed_at IS NULL OR observed_at <= decision_at),
  CONSTRAINT learning_feature_identity UNIQUE (source_event_id, funnel_stage, feature_key, feature_semantic_version, projection_version)
);
CREATE INDEX learning_feature_snapshots_key ON public.learning_feature_snapshots (feature_key, funnel_stage, decision_at DESC);
CREATE INDEX learning_feature_snapshots_event ON public.learning_feature_snapshots (learning_event_id);
CREATE INDEX learning_feature_snapshots_mint ON public.learning_feature_snapshots (contract_address);

GRANT SELECT ON public.learning_decision_events TO authenticated, anon;
GRANT SELECT ON public.learning_feature_snapshots TO authenticated, anon;
GRANT ALL ON public.learning_decision_events TO service_role;
GRANT ALL ON public.learning_feature_snapshots TO service_role;
ALTER TABLE public.learning_decision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_feature_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learning events are readable" ON public.learning_decision_events FOR SELECT USING (true);
CREATE POLICY "Learning features are readable" ON public.learning_feature_snapshots FOR SELECT USING (true);