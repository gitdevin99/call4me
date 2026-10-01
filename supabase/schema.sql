-- Run in your Supabase SQL editor. Only disposable preview state is client-writable.
-- This is deliberately NOT a real-money wallet or telephone billing ledger.
create table if not exists public.preview_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint state_size check (octet_length(state::text) < 1000000)
);
alter table public.preview_states enable row level security;
revoke all on public.preview_states from anon;
grant select, insert, update, delete on public.preview_states to authenticated;
create policy "Users read their own preview" on public.preview_states for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own preview" on public.preview_states for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own preview" on public.preview_states for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own preview" on public.preview_states for delete to authenticated using ((select auth.uid()) = user_id);
