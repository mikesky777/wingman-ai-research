ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS selection_policy_version text,
  ADD COLUMN IF NOT EXISTS policy_epoch text;

ALTER TABLE public.token_stage_milestones
  ADD COLUMN IF NOT EXISTS policy_epoch text NOT NULL DEFAULT 'UNKNOWN_POLICY',
  ADD COLUMN IF NOT EXISTS selection_policy_version text,
  ADD COLUMN IF NOT EXISTS ai_policy_version text,
  ADD COLUMN IF NOT EXISTS research_model_version text,
  ADD COLUMN IF NOT EXISTS selected_at timestamptz;

CREATE INDEX IF NOT EXISTS token_stage_milestones_policy_epoch_idx
  ON public.token_stage_milestones (stage, policy_epoch);

CREATE INDEX IF NOT EXISTS scan_runs_policy_epoch_idx
  ON public.scan_runs (policy_epoch, completed_at DESC);