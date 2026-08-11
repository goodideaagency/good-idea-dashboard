-- One-time-use tokens backing admin "impersonate agency user" sessions.
--
-- The impersonation cookie holds ONLY this random token, never the admin's
-- email directly -- an httpOnly cookie still isn't safe to trust as proof of
-- "this session was started by a real admin" (it can be edited via browser
-- devtools), so "return to admin" re-derives the admin's identity from this
-- server-side row instead of trusting anything client-supplied.
create table public.admin_impersonation_sessions (
  token       text primary key,
  admin_email text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

alter table public.admin_impersonation_sessions enable row level security;
-- No policies -- only ever read/written via the service-role key.
