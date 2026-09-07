-- lovable-cron-fallback-reviewed: 1440 runs/day; the user requires closed-tab recovery within one minute, and the watchdog exits immediately when no cycle is active
select cron.unschedule(jobid)
from cron.job
where jobname in ('production-cycle-tick-1min', 'production-cycle-watchdog-1min');

select cron.schedule(
  'production-cycle-watchdog-1min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--501b33a7-29f7-47fc-9f0a-9610387aefc4-dev.lovable.app/api/public/production-cycle-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 600000
  );
  $$
);