-- ClickUp sometimes delivers the same taskUpdated webhook event twice for a
-- single edit (confirmed live: two POSTs a couple seconds apart for one
-- Credit Cost change). Without a guard, the internal webhook handler
-- (src/app/api/clickup/webhook/internal/route.ts) reads the ledger's
-- current total, computes a delta, and charges it -- but two concurrent
-- deliveries both read the SAME pre-charge total and both charge the full
-- delta, silently double-charging the agency. Each history_items entry
-- carries its own stable id from ClickUp; recording it here before
-- reconciling lets a retried/duplicate delivery be skipped outright.
create table public.clickup_webhook_history_items (
  history_item_id text primary key,
  processed_at    timestamptz not null default now()
);

alter table public.clickup_webhook_history_items enable row level security;
-- No policies -- written and read only via the service-role key (the
-- webhook handler itself), never from an agency user's own session.
