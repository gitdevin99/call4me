-- Server-owned financial records. No browser role has access to this schema.
create schema if not exists callapp;
revoke all on schema callapp from public, anon, authenticated;
create table if not exists callapp.wallets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 balance integer not null default 0,
 reserved integer not null default 0 check(reserved >= 0)
);
create table if not exists callapp.orders (
 id uuid primary key, user_id uuid not null references auth.users(id),
 cents integer not null check(cents in (500,1000,2000)),
 checkout_id text unique, payment_id text unique, credited integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists callapp.ledger (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 reference text unique not null, title text not null, cents integer not null,
 type text not null check(type in ('credit','call','refund')), created_at timestamptz not null default now()
);
create table if not exists callapp.calls (
 id uuid primary key, user_id uuid not null references auth.users(id),
 thread_id uuid not null, place_id text not null, destination text not null, caller text not null,
 plan jsonb not null, reserved integer not null, rate integer not null,
 sid text unique, status text not null default 'dispatching',
 duration integer, cost integer, summary text, transcript jsonb not null default '[]',
 created_at timestamptz not null default now(), ended_at timestamptz,
 unique(user_id,thread_id)
);
alter table callapp.wallets enable row level security;
alter table callapp.orders enable row level security;
alter table callapp.ledger enable row level security;
alter table callapp.calls enable row level security;
revoke all on all tables in schema callapp from public, anon, authenticated;

create table if not exists callapp.payment_jobs (
 event_id text primary key, payment_id text not null, created_at timestamptz not null default now(),
 completed_at timestamptz, attempts integer not null default 0,next_attempt timestamptz not null default now()
);
alter table callapp.payment_jobs enable row level security;
revoke all on callapp.payment_jobs from public,anon,authenticated;
