-- Daily 8:00 AM IST trigger for the seo-blog-autopublish Edge Function.
--
-- 8:00 AM IST (UTC+5:30) == 02:30 UTC. pg_cron schedules run in UTC, so use '30 2 * * *'.
-- Requires the pg_cron and pg_net extensions (available on Supabase).
--
-- Run in the Supabase SQL editor. Replace the two <...> placeholders first:
--   <SUPABASE_ANON_KEY>  - project anon key (satisfies the Edge Function gateway JWT check)
--   <CRON_SECRET>        - same value you set via:  supabase secrets set CRON_SECRET=...
--
-- The Edge Function itself authorizes on the x-cron-secret header, so the post
-- pipeline can only be triggered by this job (not by anyone hitting the URL).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop a previous schedule with the same name before re-creating.
select cron.unschedule('seo-blog-daily')
where exists (select 1 from cron.job where jobname = 'seo-blog-daily');

select cron.schedule(
  'seo-blog-daily',
  '30 2 * * *',  -- 02:30 UTC = 08:00 IST, every day
  $$
  select net.http_post(
    url     := 'https://pdjnpqyzayidthpfmvjk.supabase.co/functions/v1/seo-blog-autopublish',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Verify:    select jobname, schedule, active from cron.job where jobname = 'seo-blog-daily';
-- Run-log:   select * from cron.job_run_details where jobid =
--              (select jobid from cron.job where jobname = 'seo-blog-daily')
--            order by start_time desc limit 5;
-- Remove:    select cron.unschedule('seo-blog-daily');
