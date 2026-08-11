-- Agency-scoped credit system for one-time services.
--
-- Credits are tracked as a LEDGER of grants (batches), not a single balance
-- column -- each grant expires independently 60 days after it was added
-- (the "rolls over 30 days, expires at 60" rule just falls out of using the
-- oldest-expiring-first spend order below; there's no separate "rollover"
-- state to track). Balance is always derived: sum of `remaining` across
-- grants that haven't expired yet.
create table public.credit_grants (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  amount          integer not null check (amount > 0),
  remaining       integer not null check (remaining >= 0),
  source          text not null check (
    source in ('subscription_initial', 'subscription_renewal', 'topup', 'manual', 'task_cost_decrease')
  ),
  stripe_event_id text unique, -- idempotency: a retried webhook never double-grants
  clickup_task_id text,        -- set on task_cost_decrease grants (a refund)
  note            text,
  created_by      text,        -- admin email, for manual grants
  granted_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

create index credit_grants_agency_idx on public.credit_grants (agency_id, expires_at);

-- Audit trail of spends -- also used to compute "how much has already been
-- charged for this task" so a Credit Cost field edit in ClickUp only charges
-- the difference (see spend_agency_credits / the ClickUp webhook handler).
create table public.credit_charges (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  account_id      uuid references public.accounts(id) on delete set null,
  clickup_task_id text,
  amount          integer not null check (amount > 0),
  reason          text not null check (reason in ('service_request', 'task_cost_increase', 'manual')),
  created_by      text,
  note            text,
  created_at      timestamptz not null default now()
);

create index credit_charges_task_idx on public.credit_charges (clickup_task_id);

alter table public.credit_grants enable row level security;
alter table public.credit_charges enable row level security;

create policy "members can view their agency's credit grants"
  on public.credit_grants for select
  using ( agency_id in (select agency_id from public.agency_users where user_id = auth.uid()) );

create policy "members can view their agency's credit charges"
  on public.credit_charges for select
  using ( agency_id in (select agency_id from public.agency_users where user_id = auth.uid()) );
-- No insert/update/delete policies on purpose -- every write goes through
-- the functions below (via the service-role key), never directly from an
-- agency user's own session.

-- Grants credits, idempotent on stripe_event_id -- safe to call twice for
-- the same Stripe event (e.g. a webhook retry) without double-granting.
create or replace function public.grant_agency_credits(
  p_agency_id uuid,
  p_amount integer,
  p_source text,
  p_stripe_event_id text default null,
  p_note text default null,
  p_created_by text default null,
  p_clickup_task_id text default null,
  p_expires_in_days integer default 60
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  result_id uuid;
begin
  if p_stripe_event_id is not null then
    select id into result_id from credit_grants where stripe_event_id = p_stripe_event_id;
    if result_id is not null then
      return result_id;
    end if;
  end if;

  insert into credit_grants (agency_id, amount, remaining, source, stripe_event_id, note, created_by, clickup_task_id, expires_at)
  values (
    p_agency_id, p_amount, p_amount, p_source, p_stripe_event_id, p_note, p_created_by, p_clickup_task_id,
    now() + (p_expires_in_days || ' days')::interval
  )
  returning id into result_id;

  return result_id;
end;
$$;

-- Spends credits FIFO across the agency's non-expired grants, oldest
-- (soonest-to-expire) first. Row-locks the grants it touches so concurrent
-- spends can't both succeed past the real balance. All-or-nothing: if the
-- balance is insufficient, nothing is deducted and it returns false.
create or replace function public.spend_agency_credits(
  p_agency_id uuid,
  p_amount integer,
  p_reason text,
  p_account_id uuid default null,
  p_clickup_task_id text default null,
  p_created_by text default null,
  p_note text default null
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  remaining_to_take integer := p_amount;
  grant_row record;
  take_amount integer;
  available integer;
begin
  select coalesce(sum(remaining), 0) into available
  from credit_grants
  where agency_id = p_agency_id and expires_at > now();

  if available < p_amount then
    return false;
  end if;

  for grant_row in
    select id, remaining from credit_grants
    where agency_id = p_agency_id and expires_at > now() and remaining > 0
    order by expires_at asc
    for update
  loop
    exit when remaining_to_take <= 0;
    take_amount := least(grant_row.remaining, remaining_to_take);
    update credit_grants set remaining = remaining - take_amount where id = grant_row.id;
    remaining_to_take := remaining_to_take - take_amount;
  end loop;

  insert into credit_charges (agency_id, account_id, clickup_task_id, amount, reason, created_by, note)
  values (p_agency_id, p_account_id, p_clickup_task_id, p_amount, p_reason, p_created_by, p_note);

  return true;
end;
$$;

-- Forfeits all remaining credits for an agency (their whole plan cancelled --
-- see credits.ts for when this is called). Sets remaining to 0 rather than
-- deleting, so the grant history stays intact for the audit trail.
create or replace function public.forfeit_agency_credits(p_agency_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update credit_grants set remaining = 0
  where agency_id = p_agency_id and expires_at > now() and remaining > 0;
$$;
