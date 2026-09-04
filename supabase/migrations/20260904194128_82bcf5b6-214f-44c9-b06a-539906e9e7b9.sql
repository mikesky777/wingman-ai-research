ALTER TABLE public.token_stage_milestones
  ADD COLUMN setup_key text NOT NULL DEFAULT 'ALL';

UPDATE public.token_stage_milestones
  SET setup_key = COALESCE(first_setup, 'BASE')
  WHERE stage = 'SETUP_QUALIFIED';

ALTER TABLE public.token_stage_milestones
  ADD CONSTRAINT token_stage_milestones_setup_key_check
  CHECK (setup_key = ANY (ARRAY['ALL'::text, 'BASE'::text, 'REACCEL'::text]));

ALTER TABLE public.token_stage_milestones
  DROP CONSTRAINT token_stage_milestones_unique_stage;

ALTER TABLE public.token_stage_milestones
  ADD CONSTRAINT token_stage_milestones_unique_stage_setup
  UNIQUE (token_id, stage, setup_key);

CREATE INDEX IF NOT EXISTS token_stage_milestones_stage_setup_idx
  ON public.token_stage_milestones (stage, setup_key, first_entered_at DESC);