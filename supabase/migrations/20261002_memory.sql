create table if not exists callapp.memory_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 generation integer not null default 0
);
create table if not exists callapp.memory_events (
 id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 generation integer not null default 0,
 content text not null,
 user_text text not null default '',
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 attempts integer not null default 0,
 retry_at timestamptz not null default now()
);
create index if not exists memory_events_user on callapp.memory_events(user_id,generation,created_at desc);
create table if not exists callapp.memory_cleanup (tag text primary key);
alter table callapp.memory_settings enable row level security;
alter table callapp.memory_events enable row level security;
alter table callapp.memory_cleanup enable row level security;
revoke all on callapp.memory_settings,callapp.memory_events,callapp.memory_cleanup from anon,authenticated;

grant select,insert,update,delete on callapp.memory_settings,callapp.memory_events,callapp.memory_cleanup to canyoucall_runtime;
drop policy if exists memory_settings_runtime on callapp.memory_settings;
create policy memory_settings_runtime on callapp.memory_settings for all to canyoucall_runtime using(true) with check(true);
drop policy if exists memory_events_runtime on callapp.memory_events;
create policy memory_events_runtime on callapp.memory_events for all to canyoucall_runtime using(true) with check(true);
drop policy if exists memory_cleanup_runtime on callapp.memory_cleanup;
create policy memory_cleanup_runtime on callapp.memory_cleanup for all to canyoucall_runtime using(true) with check(true);
