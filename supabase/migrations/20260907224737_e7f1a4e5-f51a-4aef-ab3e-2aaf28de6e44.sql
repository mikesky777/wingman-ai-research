CREATE OR REPLACE FUNCTION public.dispatch_production_cycle_stage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scheduler_token TEXT;
BEGIN
  SELECT token_value INTO scheduler_token
  FROM public.production_cycle_scheduler_credentials
  WHERE id = true;

  IF scheduler_token IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://project--501b33a7-29f7-47fc-9f0a-9610387aefc4-dev.lovable.app/api/public/production-cycle-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Production-Cycle-Scheduler', scheduler_token
    ),
    body := '{"mode":"STAGE"}'::jsonb,
    timeout_milliseconds := 600000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_production_cycle_stage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_production_cycle_stage() TO service_role;