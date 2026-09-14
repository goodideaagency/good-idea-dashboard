-- Captures a form's raw submitted answers server-side the moment they're
-- received, independent of whether the subsequent ClickUp write succeeds.
-- Written after a real incident: a client's full managed-service intake
-- (37 questions) was lost permanently because the app only ever persisted
-- answers by writing them into ClickUp, and a stale session (see the new
-- middleware.ts) bounced the submission to /login before any of that
-- happened, with nothing captured anywhere. Wired into the three flows
-- where losing the data is genuinely painful to redo: managed-service
-- intake, one-time service requests, and project comments -- see
-- src/app/dashboard/onboarding/[priceId]/actions.ts,
-- src/app/dashboard/request/[key]/actions.ts, and
-- src/app/dashboard/projects/actions.ts.
create table public.intake_submissions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  account_id   uuid references public.accounts(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  kind         text not null check (kind in ('managed_service_intake', 'service_request', 'project_comment')),
  -- Identifies which form/task this came from, e.g. { price_id } or
  -- { service_key } or { task_id } -- shape varies by kind.
  context      jsonb not null default '{}'::jsonb,
  -- { formEntries, readable } -- see the actions above for what each holds.
  raw_data     jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'synced', 'dismissed')),
  -- ClickUp task id(s) once the normal flow actually created them.
  external_ids jsonb
);

create index intake_submissions_status_idx on public.intake_submissions (status, created_at desc);

alter table public.intake_submissions enable row level security;
-- No policies -- written and read only via the service-role key (the
-- submitting server actions, and the admin recovery page), same pattern as
-- platform_comment_markers.
