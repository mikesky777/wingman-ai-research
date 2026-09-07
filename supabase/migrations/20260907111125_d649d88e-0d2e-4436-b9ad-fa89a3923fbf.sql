-- lovable-cron-fallback-reviewed: 1440 runs/day; closed-tab production cycles must recover within one minute, and the user explicitly accepted the recurring-cost trade-off
CREATE TABLE public.production_cycle_scheduler_credentials (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  token_hash text NOT NULL,
  token_value text NOT NULL,
  rotated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.production_cycle_scheduler_credentials TO service_role;
GRANT ALL ON public.production_cycle_scheduler_credentials TO service_role;

ALTER TABLE public.production_cycle_scheduler_credentials ENABLE ROW LEVEL SECURITY;

INSERT INTO public.production_cycle_scheduler_credentials (id, token_hash, token_value)
SELECT true, encode(digest(token, 'sha256'), 'hex'), token
FROM (SELECT encode(gen_random_bytes(32), 'hex') AS token) generated;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('production-cycle-tick-1min', 'production-cycle-watchdog-1min');

SELECT cron.schedule(
  'production-cycle-watchdog-1min',
  '* * * * *',
  $schedule$
  SELECT net.http_post(
    url := 'https://project--501b33a7-29f7-47fc-9f0a-9610387aefc4-dev.lovable.app/api/public/production-cycle-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Production-Cycle-Scheduler', (
        SELECT token_value
        FROM public.production_cycle_scheduler_credentials
        WHERE id = true
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 600000
  );
  $schedule$
);