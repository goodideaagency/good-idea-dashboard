-- Account Files: lets an agency attach brand assets/documents to a Client
-- Profile (logo uploads use accounts.logo_url directly; this table is for
-- everything else -- brand guides, other logo variants, misc documents).
--
-- Also gives each agency a single dedicated ClickUp List for "Client
-- Profile" resource tasks, separate from any client's own project List, so
-- profile creation never shows up as a project to work on (see
-- clients/actions.ts).
alter table public.agencies add column clickup_profiles_list_id text;

create table public.account_files (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  name         text not null,
  storage_path text not null,
  url          text not null,
  size_bytes   bigint,
  content_type text,
  created_at   timestamptz not null default now()
);

alter table public.account_files enable row level security;

create policy "members can view their account files"
  on public.account_files for select
  using (
    account_id in (
      select id from public.accounts
      where agency_id in (select agency_id from public.agency_users where user_id = auth.uid())
    )
  );

create policy "members can add their account files"
  on public.account_files for insert
  with check (
    account_id in (
      select id from public.accounts
      where agency_id in (select agency_id from public.agency_users where user_id = auth.uid())
    )
  );

create policy "members can delete their account files"
  on public.account_files for delete
  using (
    account_id in (
      select id from public.accounts
      where agency_id in (select agency_id from public.agency_users where user_id = auth.uid())
    )
  );
