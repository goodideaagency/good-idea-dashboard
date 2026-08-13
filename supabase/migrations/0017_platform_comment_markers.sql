-- Every comment/attachment the platform posts to ClickUp goes through one
-- shared bot API token, so ClickUp's own webhook event can never tell us
-- WHICH agency user actually wrote it -- only "the bot did." That meant an
-- agency user posting a comment via the dashboard always got notified of
-- their own comment a couple minutes later, indistinguishable (from the
-- notification pipeline's point of view) from a genuine reply by the team.
--
-- Fix: the app drops a short-lived marker here right before posting, and
-- the webhook handler looks for a recent one on the same task to recover
-- the real author's user_id -- see src/app/dashboard/projects/actions.ts,
-- src/app/api/uploads/task-file/route.ts, and
-- src/app/api/clickup/webhook/route.ts. Nothing prunes old rows; volume is
-- tiny (one row per platform-originated comment) and harmless to keep.
create table public.platform_comment_markers (
  id         uuid primary key default gen_random_uuid(),
  task_id    text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index platform_comment_markers_task_idx on public.platform_comment_markers (task_id, created_at desc);

alter table public.platform_comment_markers enable row level security;
-- No policies -- written and read only via the service-role key (the
-- server action that posts the comment, and the webhook handler), never
-- from an agency user's own session.
