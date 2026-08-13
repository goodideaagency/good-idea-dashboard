-- Fixes a real overspend race in spend_agency_credits: the original version
-- summed `available` credits with a plain, unlocked SELECT *before* taking
-- any row locks. Two concurrent spends for the same agency (e.g. two
-- service requests submitted seconds apart, or a double-click) could both
-- read the same stale total, both pass the "is there enough?" check, and
-- both succeed -- each inserting a full credit_charges row even though the
-- agency never had enough credit for both. Confirmed exploitable via code
-- review before Digitac/Pixan went live.
--
-- Fix: lock every candidate grant row up front (in a stable order) and sum
-- their *locked* remaining amounts before deciding whether to proceed. A
-- concurrent call for the same agency then blocks on those locks until the
-- first transaction commits, at which point it re-reads the already-updated
-- `remaining` values -- so two concurrent spends now correctly serialize
-- instead of both racing past the same balance.
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
  total_locked integer := 0;
begin
  -- Pass 1: lock every candidate grant and sum what's actually available
  -- under lock. No writes yet -- this is purely to make the balance check
  -- race-safe.
  for grant_row in
    select id, remaining from credit_grants
    where agency_id = p_agency_id and expires_at > now() and remaining > 0
    order by expires_at asc
    for update
  loop
    total_locked := total_locked + grant_row.remaining;
  end loop;

  if total_locked < p_amount then
    return false;
  end if;

  -- Pass 2: same rows, already locked by this transaction (so this re-scan
  -- is instant, not a second wait) -- apply the FIFO deduction for real.
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
