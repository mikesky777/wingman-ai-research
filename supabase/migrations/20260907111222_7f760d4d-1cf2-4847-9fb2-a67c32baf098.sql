CREATE POLICY "Backend scheduler credential access"
ON public.production_cycle_scheduler_credentials
FOR SELECT
TO service_role
USING (true);