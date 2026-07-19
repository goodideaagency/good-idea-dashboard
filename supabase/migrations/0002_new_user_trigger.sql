-- When a new login is created, automatically create its agency record
-- and link the two together. Runs with elevated rights (security definer)
-- so it can write to tables that row-level security would otherwise block.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_agency_id uuid;
begin
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
