-- Platform health checker (see src/lib/health.ts): remembers each check's last
-- result so a single problem emails once (plus a 24h reminder and a recovery
-- note) instead of every run. Also holds the 'heartbeat:frequent' row that the
-- daily run uses to notice if the 6-hourly checker stops running.
create table public.health_check_state (
  check_key       text primary key,
  status          text not null check (status in ('ok', 'failing')),
  detail          text,
  failing_since   timestamptz,
  last_alerted_at timestamptz,
  last_run_at     timestamptz not null default now()
);

alter table public.health_check_state enable row level security;
-- No policies on purpose: only the server-role key (the health route) touches this.
