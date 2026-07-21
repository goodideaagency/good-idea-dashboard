-- Agencies can be archived (hidden from the main admin list) instead of
-- deleted. Purely a visibility flag: nothing in Stripe or Supabase auth is
-- touched, and it can always be undone.
alter table public.agencies add column archived boolean not null default false;
