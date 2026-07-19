-- Good Idea Billing — initial database schema
-- Purpose: group Stripe subscriptions under the right agency + the right account.
--
-- Mental model:
--   agencies      = your clients (the marketing agencies who log in)
--   agency_users  = which login (auth user) belongs to which agency
--   accounts      = each of an agency's OWN client accounts (name + website)
--   subscriptions = a Stripe subscription attached to one account

-- 1. AGENCIES ---------------------------------------------------------------
create table public.agencies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  stripe_customer_id text unique,                     -- ONE Stripe customer per agency
  created_at         timestamptz not null default now()
);

-- 2. AGENCY_USERS -----------------------------------------------------------
create table public.agency_users (
  user_id    uuid not null references auth.users(id) on delete cascade,
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, agency_id)
);

-- 3. ACCOUNTS ---------------------------------------------------------------
create table public.accounts (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  name       text not null,                           -- the client's business name
  website    text,                                    -- the client's website/domain
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- 4. SUBSCRIPTIONS ----------------------------------------------------------
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid references public.accounts(id) on delete set null,
  agency_id              uuid not null references public.agencies(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  stripe_price_id        text,
  product_name           text,
  status                 text,                         -- active, trialing, past_due, canceled...
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now()
);

-- ROW LEVEL SECURITY --------------------------------------------------------
-- Agencies only ever see their OWN data. Your admin side uses the service-role
-- key on the server, which bypasses these rules and can see everything.
alter table public.agencies      enable row level security;
alter table public.agency_users  enable row level security;
alter table public.accounts      enable row level security;
alter table public.subscriptions enable row level security;

create policy "user can view own membership"
  on public.agency_users for select
  using ( user_id = auth.uid() );

create policy "members can view their agency"
  on public.agencies for select
  using ( id in (select agency_id from public.agency_users where user_id = auth.uid()) );

create policy "members can view their accounts"
  on public.accounts for select
  using ( agency_id in (select agency_id from public.agency_users where user_id = auth.uid()) );

create policy "members can add accounts"
  on public.accounts for insert
  with check ( agency_id in (select agency_id from public.agency_users where user_id = auth.uid()) );

create policy "members can update their accounts"
  on public.accounts for update
  using ( agency_id in (select agency_id from public.agency_users where user_id = auth.uid()) );

create policy "members can view their subscriptions"
  on public.subscriptions for select
  using ( agency_id in (select agency_id from public.agency_users where user_id = auth.uid()) );
