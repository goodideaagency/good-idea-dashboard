-- Approved admins for the /admin area. Agencies are unaffected by this.
-- Only the service-role key (server-side) can read/write this table.

create table public.admins (
  email      text primary key,
  role       text not null default 'admin' check (role in ('admin', 'superadmin')),
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- No policies on purpose: no logged-in user can read/write this directly.

-- Seed the master / superadmin.
insert into public.admins (email, role)
values ('hello@itsgoodidea.com', 'superadmin')
on conflict (email) do update set role = 'superadmin';
