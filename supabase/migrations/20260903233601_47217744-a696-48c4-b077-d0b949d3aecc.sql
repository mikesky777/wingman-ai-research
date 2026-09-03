ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS price_integrity_diagnostics jsonb,
  ADD COLUMN IF NOT EXISTS base_volume_floor_diagnostics jsonb;