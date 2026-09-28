alter table public.library_items
  add column if not exists use_count bigint not null default 0;

create or replace function public.increment_library_item_use(item_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.library_items
  set use_count = use_count + 1
  where id = item_id;
$$;

grant execute on function public.increment_library_item_use(text) to anon, authenticated;

create table if not exists public.shared_maps (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  map_id text not null,
  map_data jsonb not null,
  settings jsonb not null default '{"showProgress":true,"showActivity":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shared_maps enable row level security;

drop policy if exists "shared maps are readable" on public.shared_maps;
create policy "shared maps are readable" on public.shared_maps for select using (true);

drop policy if exists "owners insert shared maps" on public.shared_maps;
create policy "owners insert shared maps" on public.shared_maps for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists "owners update shared maps" on public.shared_maps;
create policy "owners update shared maps" on public.shared_maps for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "owners delete shared maps" on public.shared_maps;
create policy "owners delete shared maps" on public.shared_maps for delete to authenticated using (auth.uid() = owner_id);

grant select on public.shared_maps to anon, authenticated;
grant insert, update, delete on public.shared_maps to authenticated;

create index if not exists shared_maps_owner_map_idx on public.shared_maps(owner_id, map_id);
