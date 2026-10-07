-- Manual credit grants can now be flagged as never-expiring (admin grants
-- only -- see grantManualCredits). "Never" is stored as an expires_at ~100
-- years out rather than a nullable column, so every existing
-- `expires_at > now()` check (balance, spend order, history) keeps working
-- unchanged, and FIFO spend naturally uses these credits last.
--
-- forfeit_agency_credits is called when an agency's LAST active subscription
-- ends. It must not wipe a never-expiring pack the agency paid for, so it now
-- only forfeits credits that were going to expire anyway (anything expiring
-- within 50 years -- i.e. every normal 60-day grant).
create or replace function public.forfeit_agency_credits(p_agency_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update credit_grants set remaining = 0
  where agency_id = p_agency_id
    and expires_at > now()
    and expires_at < now() + interval '50 years'
    and remaining > 0;
$$;
