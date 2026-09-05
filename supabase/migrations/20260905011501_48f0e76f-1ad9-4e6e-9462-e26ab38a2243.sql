ALTER TABLE public.thesis_reports
  ADD COLUMN IF NOT EXISTS catalyst_kind TEXT,
  ADD COLUMN IF NOT EXISTS why_now_market_signal TEXT;