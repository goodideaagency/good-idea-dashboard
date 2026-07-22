-- Store each subscription's price so MRR can be computed without hitting
-- Stripe on every admin page load.
alter table public.subscriptions add column amount_cents integer;
alter table public.subscriptions add column interval text; -- 'day' | 'week' | 'month' | 'year'
