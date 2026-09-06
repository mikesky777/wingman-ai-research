CREATE UNIQUE INDEX IF NOT EXISTS research_packets_scan_mint_key ON public.research_packets (scan_run_id, contract_address);
DROP INDEX IF EXISTS public.research_packets_scan_mint_unique;