create table if not exists public.portfolio_content (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.portfolio_content enable row level security;

drop policy if exists "Portfolio content is publicly readable" on public.portfolio_content;
create policy "Portfolio content is publicly readable"
on public.portfolio_content
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can insert portfolio content" on public.portfolio_content;
create policy "Authenticated admins can insert portfolio content"
on public.portfolio_content
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated admins can update portfolio content" on public.portfolio_content;
create policy "Authenticated admins can update portfolio content"
on public.portfolio_content
for update
to authenticated
using (true)
with check (true);

insert into public.portfolio_content (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
