ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS research_packet_status text,
  ADD COLUMN IF NOT EXISTS research_packet_error text,
  ADD COLUMN IF NOT EXISTS research_packet_count integer,
  ADD COLUMN IF NOT EXISTS research_packet_generated_at timestamptz;