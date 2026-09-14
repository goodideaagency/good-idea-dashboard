-- Autosaved drafts of the two long, ClickUp-field-driven intake forms
-- (managed-service onboarding, one-time/credit-based service requests) --
-- protects against losing everything typed if someone gets interrupted
-- BEFORE they submit (closes the tab, session dies, steps away). The
-- separate intake_submissions table only ever captured a submission at the
-- moment Submit was clicked; this is the piece for before that.
create table public.form_drafts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  account_id   uuid references public.accounts(id) on delete cascade,
  kind         text not null check (kind in ('managed_service_intake', 'service_request')),
  -- Stringified JSON, e.g. '{"price_id":"..."}' or '{"service_key":"..."}' --
  -- identifies which form this is. Plain text rather than jsonb since this
  -- is only ever exact-matched (never queried by field), and an exact
  -- string match is unambiguous in a way relying on PostgREST's jsonb
  -- equality filter isn't worth risking for something this narrow.
  context      text not null,
  -- Same shape as intake_submissions.raw_data.formEntries.
  form_entries jsonb not null,
  updated_at   timestamptz not null default now(),
  -- One draft per user per form -- deliberately not scoped to a specific
  -- client account (a user filling out the same form twice for two
  -- different clients at once is an edge case not worth the complexity;
  -- account_id below is stored for reference only). Makes autosave a plain
  -- upsert.
  unique (user_id, kind, context)
);

alter table public.form_drafts enable row level security;
-- No policies -- written and read only via the service-role key, same
-- pattern as intake_submissions.
