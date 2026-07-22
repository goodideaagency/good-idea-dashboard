-- Links an account to its ClickUp List, so the dashboard can pull that
-- client's tasks (title, status, due date, comments, attachments) directly
-- from ClickUp. Null until an admin connects it.
alter table public.accounts add column clickup_list_id text;
