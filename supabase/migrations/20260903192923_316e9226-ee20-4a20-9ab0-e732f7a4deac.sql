ALTER TABLE public.scan_candidates
  ADD COLUMN IF NOT EXISTS recurrence_state text NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS first_seen_scan_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_seen_scan_at timestamptz,
  ADD COLUMN IF NOT EXISTS scans_seen_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS consecutive_scans_seen integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_quantitative_priority numeric,
  ADD COLUMN IF NOT EXISTS priority_delta numeric,
  ADD COLUMN IF NOT EXISTS previous_setups text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS setup_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_selected_as_survivor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_selected_as_survivor_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_detail jsonb;

CREATE INDEX IF NOT EXISTS scan_candidates_contract_run_idx
  ON public.scan_candidates (contract_address, scan_run_id);
CREATE INDEX IF NOT EXISTS scan_candidates_recurrence_state_idx
  ON public.scan_candidates (scan_run_id, recurrence_state);