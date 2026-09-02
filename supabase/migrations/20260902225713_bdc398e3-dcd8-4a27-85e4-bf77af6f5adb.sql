CREATE TABLE public.scanner_strategy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  config jsonb NOT NULL,
  config_version text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scanner_strategy_settings TO anon;
GRANT SELECT ON public.scanner_strategy_settings TO authenticated;
GRANT ALL ON public.scanner_strategy_settings TO service_role;

ALTER TABLE public.scanner_strategy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY scanner_strategy_settings_public_read
  ON public.scanner_strategy_settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE UNIQUE INDEX scanner_strategy_settings_single_active
  ON public.scanner_strategy_settings (is_active)
  WHERE is_active;

CREATE TRIGGER scanner_strategy_settings_updated_at
  BEFORE UPDATE ON public.scanner_strategy_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS config_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS config_version text;