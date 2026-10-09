begin;

-- Old clients must not silently replay pre-reset progress after fetching the
-- new revision. Keep their existing RPC working for accounts without a reset.
alter function public.save_personal_map_patch(text,text,jsonb,bigint,uuid) rename to save_personal_map_patch_internal;
revoke all on function public.save_personal_map_patch_internal(text,text,jsonb,bigint,uuid) from public,anon,authenticated;

create function public.save_personal_map_patch_v2(map_id text,map_name text,patch jsonb,expected_revision bigint,expected_owner uuid,expected_progress_reset text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current public.maps;
begin
  if auth.uid() is null or expected_owner is distinct from auth.uid() then raise exception 'account-changed'; end if;
  select * into current from public.maps where id::text=map_id and user_id=auth.uid() for update;
  if current.id is null or current.sync_revision is distinct from expected_revision then raise exception 'sync-conflict' using errcode='40001'; end if;
  if current.data->'statisticsReset'->>'at' is distinct from expected_progress_reset then raise exception 'progress-reset' using errcode='40001'; end if;
  if patch->'fields' ? 'statisticsReset' and patch->'fields'->'statisticsReset' is distinct from current.data->'statisticsReset'
    or patch->'removed' ? 'statisticsReset' then raise exception 'invalid-progress-reset'; end if;
  return public.save_personal_map_patch_internal(map_id,map_name,patch,expected_revision,expected_owner);
end; $$;
revoke all on function public.save_personal_map_patch_v2(text,text,jsonb,bigint,uuid,text) from public,anon;
grant execute on function public.save_personal_map_patch_v2(text,text,jsonb,bigint,uuid,text) to authenticated;

create function public.save_personal_map_patch(map_id text,map_name text,patch jsonb,expected_revision bigint,expected_owner uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select public.save_personal_map_patch_v2(map_id,map_name,patch,expected_revision,expected_owner,null);
$$;
revoke all on function public.save_personal_map_patch(text,text,jsonb,bigint,uuid) from public,anon;
grant execute on function public.save_personal_map_patch(text,text,jsonb,bigint,uuid) to authenticated;

create function public.save_collaborative_cells_v2(team_id uuid,cell_changes jsonb,expected_grid jsonb,expected_revision bigint,expected_progress_reset text)
returns void language plpgsql security definer set search_path='' as $$
declare current jsonb;
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  select map_data into current from public.collaborative_maps where id=team_id for update;
  if current->'statisticsReset'->>'at' is distinct from expected_progress_reset then raise exception 'progress-reset' using errcode='40001'; end if;
  perform public.apply_collaborative_grid_changes(team_id,cell_changes,expected_grid,expected_revision);
end; $$;
revoke all on function public.save_collaborative_cells_v2(uuid,jsonb,jsonb,bigint,text) from public,anon;
grant execute on function public.save_collaborative_cells_v2(uuid,jsonb,jsonb,bigint,text) to authenticated;

create or replace function public.save_collaborative_cells(team_id uuid,cell_changes jsonb,expected_grid jsonb,expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.save_collaborative_cells_v2(team_id,cell_changes,expected_grid,expected_revision,null);
end; $$;

commit;
