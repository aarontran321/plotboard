-- PlotBoard schema.
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  data jsonb not null
);

alter table public.plays enable row level security;

-- PlotBoard has no accounts: a play is readable by anyone holding its link, and
-- anyone can publish one. Both policies are intentionally open.
--
-- The trade-off to be aware of: `anon` insert means the table is world-writable
-- by anyone with the publishable key, which ships in the client bundle. That is
-- fine for a design tool with disposable data, but it is not a durable store.
-- Before this handles anything you care about, add auth and scope these to
-- `auth.uid()`.

drop policy if exists "plays are publicly readable" on public.plays;
create policy "plays are publicly readable"
  on public.plays
  for select
  to anon, authenticated
  using (true);

drop policy if exists "plays are publicly insertable" on public.plays;
create policy "plays are publicly insertable"
  on public.plays
  for insert
  to anon, authenticated
  with check (true);

-- No update or delete policy: once shared, a play link is immutable.

create index if not exists plays_created_at_idx on public.plays (created_at desc);
