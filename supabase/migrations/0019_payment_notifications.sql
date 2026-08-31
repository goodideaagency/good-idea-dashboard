-- Payment-outcome notifications (Stripe invoice.paid / invoice.payment_failed
-- for a subscription, managed or credit-granting alike). `kind` lets the UI
-- style a failed payment as urgent, distinct from normal ClickUp activity.
-- `stripe_invoice_id` dedupes the fan-out insert against Stripe's
-- at-least-once webhook delivery, and against Stripe's own dunning retries
-- re-firing invoice.payment_failed for the same still-failing invoice --
-- without this, a single failure would spam a fresh notification on every
-- retry attempt instead of once per invoice per outcome.
alter table public.notifications
  add column kind text not null default 'activity'
    check (kind in ('activity', 'payment_failed', 'payment_succeeded')),
  add column stripe_invoice_id text;

create unique index notifications_invoice_dedup_idx
  on public.notifications (user_id, stripe_invoice_id, kind)
  where stripe_invoice_id is not null;
