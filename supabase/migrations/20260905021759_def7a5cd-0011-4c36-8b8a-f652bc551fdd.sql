ALTER TABLE public.thesis_synthesis_runs ADD COLUMN IF NOT EXISTS rubric_version text;
ALTER TABLE public.thesis_reports ADD COLUMN IF NOT EXISTS rubric_version text;
ALTER TABLE public.entry_state_evaluations ADD COLUMN IF NOT EXISTS price_history_source text;
ALTER TABLE public.entry_state_evaluations ADD COLUMN IF NOT EXISTS timing_resolution text;
UPDATE public.thesis_reports SET rubric_version = 'thesis_rubric/v1' WHERE rubric_version IS NULL;
UPDATE public.thesis_synthesis_runs SET rubric_version = 'thesis_rubric/v1' WHERE rubric_version IS NULL;