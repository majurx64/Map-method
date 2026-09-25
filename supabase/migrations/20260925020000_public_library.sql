create table if not exists public.library_items (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.library_items enable row level security;

drop policy if exists "Public library is readable" on public.library_items;
create policy "Public library is readable"
on public.library_items for select
using (true);

drop policy if exists "Developer can add public library items" on public.library_items;
create policy "Developer can add public library items"
on public.library_items for insert
to authenticated
with check (
  auth.uid() = owner_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru'
);

drop policy if exists "Developer can update public library items" on public.library_items;
create policy "Developer can update public library items"
on public.library_items for update
to authenticated
using (
  auth.uid() = owner_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru'
)
with check (
  auth.uid() = owner_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru'
);

drop policy if exists "Developer can delete public library items" on public.library_items;
create policy "Developer can delete public library items"
on public.library_items for delete
to authenticated
using (
  auth.uid() = owner_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'majurx64@yandex.ru'
);

grant select on public.library_items to anon, authenticated;
grant insert, update, delete on public.library_items to authenticated;
