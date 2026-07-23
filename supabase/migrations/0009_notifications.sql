-- Notifications: ClickUp task changes (comments, status, due date, attachments)
-- get batched per task over a short fixed window, then fanned out to every
-- user in the owning agency as both an in-app notification and an email.
--
-- notification_batches: one open row per (task, category) accumulating raw
-- change items until its fires_at time, at which point a scheduled QStash
-- callback flushes it -- fanning out into one `notifications` row per
-- recipient -- and marks it sent. Category is separate for comments (short
-- window) vs field changes (status/due date/attachment, longer window) so a
-- comment doesn't wait behind a slower-moving bundle.
create table public.notification_batches (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  task_id      text not null,
  category     text not null check (category in ('comment', 'field_change')),
  items        jsonb not null default '[]'::jsonb,
  fires_at     timestamptz not null,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Only one open batch per task+category at a time.
create unique index notification_batches_open_idx
  on public.notification_batches (task_id, category)
  where sent_at is null;

-- notifications: the actual per-user, in-app + email record.
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  task_id    text,
  title      text not null,
  body       text,
  url        text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notification_batches enable row level security;
alter table public.notifications enable row level security;
-- notification_batches has no policies -- only the server-role key (webhook
-- + flush routes) ever touches it.

create policy "user can view own notifications"
  on public.notifications for select
  using ( user_id = auth.uid() );

create policy "user can mark own notifications read"
  on public.notifications for update
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );
