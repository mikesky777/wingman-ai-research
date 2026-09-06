CREATE UNIQUE INDEX IF NOT EXISTS research_packets_scan_mint_unique
  ON public.research_packets (scan_run_id, contract_address)
  WHERE contract_address IS NOT NULL;