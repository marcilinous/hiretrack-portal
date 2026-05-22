-- v13: job alerts opt-in column on candidates
-- Defaults to true so existing candidates receive alerts (they can opt out via /job-alerts.html)

alter table candidates
  add column if not exists job_alerts_enabled boolean not null default true;
