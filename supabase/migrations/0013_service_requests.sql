-- Maps a one-time service's internal ClickUp task back to the agency/account
-- that requested it and its starting credit cost. Needed by the Internal Ops
-- ClickUp webhook: when the team edits a task's "Credit Cost" field, the
-- webhook only gets a clickup_task_id, and has no other way to know which
-- agency to charge/refund (see reconcileTaskCost in lib/credits.ts).
create table public.service_requests (
  id                      uuid primary key default gen_random_uuid(),
  agency_id               uuid not null references public.agencies(id) on delete cascade,
  account_id              uuid references public.accounts(id) on delete set null,
  clickup_task_id         text not null unique,
  clickup_client_task_id  text,
  service_key             text not null,
  base_credit_cost        integer not null,
  created_at              timestamptz not null default now()
);

create index service_requests_task_idx on public.service_requests (clickup_task_id);

alter table public.service_requests enable row level security;

create policy "members can view their agency's service requests"
  on public.service_requests for select
  using ( agency_id in (select agency_id from public.agency_users where user_id = auth.uid()) );
-- No insert/update/delete policies -- written only via the service-role key
-- from submitServiceRequest.
