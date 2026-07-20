-- Let admins create a login that attaches to an EXISTING agency (for onboarding
-- your current clients), instead of the trigger always spawning a new agency.
--
-- If the new user carries an `agency_id` in their metadata (admin-created),
-- we link them to that agency. Otherwise (normal self-signup) we create a
-- fresh agency exactly as before.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_agency_id uuid;
  provided_agency uuid;
begin
  begin
    provided_agency := nullif(new.raw_user_meta_data->>'agency_id', '')::uuid;
  exception when others then
    provided_agency := null;
  end;

  if provided_agency is not null then
    -- Admin-created: attach to the specified agency.
    insert into public.agency_users (user_id, agency_id, role)
    values (new.id, provided_agency, 'owner')
    on conflict do nothing;
    return new;
  end if;

  -- Self-signup: create a fresh agency (unchanged behavior).
  insert into public.agencies (name)
  values (
    coalesce(
      nullif(new.raw_user_meta_data->>'agency_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  returning id into new_agency_id;

  insert into public.agency_users (user_id, agency_id, role)
  values (new.id, new_agency_id, 'owner');

  return new;
end;
$$;
