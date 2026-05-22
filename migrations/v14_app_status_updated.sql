-- v14: track when an application status was last changed by employer
alter table applications
  add column if not exists status_updated_at timestamptz;
