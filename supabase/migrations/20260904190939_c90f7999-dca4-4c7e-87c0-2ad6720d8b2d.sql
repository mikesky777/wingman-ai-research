CREATE TABLE public.research_packets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id uuid NOT NULL REFERENCES public.tokens(id),
  scan_run_id uuid REFERENCES public.scan_runs(id),
  contract_address text,
  chain text NOT NULL DEFAULT 'solana',
  packet_version text NOT NULL,
  serialization_version text NOT NULL,
  candidate_source text NOT NULL,
  research_eligible_now boolean NOT NULL,
  exclusion_reasons text[] NOT NULL DEFAULT '{}',
  evidence_gaps text[] NOT NULL DEFAULT '{}',
  packet jsonb NOT NULL,
  compact jsonb NOT NULL,
  compact_bytes integer,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.research_packets TO anon;
GRANT SELECT ON public.research_packets TO authenticated;
GRANT ALL ON public.research_packets TO service_role;

ALTER TABLE public.research_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "research_packets_public_read"
ON public.research_packets
FOR SELECT
TO anon, authenticated
USING (true);

CREATE INDEX research_packets_scan_run_idx ON public.research_packets (scan_run_id, generated_at DESC);
CREATE INDEX research_packets_token_idx ON public.research_packets (token_id, generated_at DESC);
CREATE INDEX research_packets_address_idx ON public.research_packets (contract_address, generated_at DESC);