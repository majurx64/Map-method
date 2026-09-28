-- Links grant read access by token, never permission to list every published map.
drop policy if exists "shared maps are readable" on public.shared_maps;
create policy "owners read shared maps" on public.shared_maps
  for select to authenticated using (auth.uid() = owner_id);
revoke select on public.shared_maps from anon;

-- Remove private fields from snapshots produced by the first implementation.
update public.shared_maps s set map_data = (
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(s.map_data)
  where key in ('name','description','mapType','gridMode','totalCells','manualRows','manualCols','imageRatio','completed','colors')
) || jsonb_build_object(
  'progressCompleted', case when settings->>'showProgress' = 'true' then coalesce(map_data->'progressCompleted', '[]'::jsonb) else '[]'::jsonb end,
  'lastPaintedAt', case when settings->>'showActivity' = 'true' then coalesce(map_data->'lastPaintedAt', '""'::jsonb) else '""'::jsonb end
);

create or replace function public.get_shared_map(share_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('id', id, 'map_data', map_data, 'settings', settings, 'updated_at', updated_at)
  from public.shared_maps where id = share_token limit 1;
$$;
revoke all on function public.get_shared_map(text) from public;
grant execute on function public.get_shared_map(text) to anon, authenticated;
