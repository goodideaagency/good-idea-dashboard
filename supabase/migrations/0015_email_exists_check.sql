-- Side-effect-free "does this email already have a login" check, used before
-- starting a signup Checkout Session -- see src/app/signup/actions.ts.
--
-- There's no clean way to ask Supabase Auth this via the JS admin API: the
-- ?email= filter on the list-users endpoint doesn't actually filter, and
-- generateLink (any type, including a plain existence probe) creates a new
-- unconfirmed user as a side effect for an email that doesn't exist yet --
-- confirmed live, which would have silently broken the FIRST-time signup
-- flow immediately after (provisionSignupAgency's own invite call would
-- then find that email "already exists" too). A direct read of auth.users
-- has no such side effect.
create or replace function public.email_has_account(p_email text)
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
$$;
