-- Files now live as attachments on the account's "Client Profile" task in
-- ClickUp (so your team sees them there directly) instead of a separate
-- Supabase table + Storage bucket -- consistent with how comments/task
-- attachments already work everywhere else in the app (ClickUp is the
-- source of truth, never duplicated locally).
alter table public.accounts add column clickup_profile_task_id text;

drop table public.account_files;
