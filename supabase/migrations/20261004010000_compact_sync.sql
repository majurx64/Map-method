begin;

-- Server-owned revisions also cover writes from older clients.
alter table public.maps add column if not exists sync_revision bigint not null default 0;
create or replace function public.bump_map_sync_revision()
returns trigger language plpgsql set search_path='' as $$
begin
  new.sync_revision = case when tg_op='INSERT' then 1 else old.sync_revision+1 end;
  return new;
end; $$;
drop trigger if exists map_sync_revision on public.maps;
create trigger map_sync_revision before insert or update on public.maps
for each row execute function public.bump_map_sync_revision();
alter table public.feedback_messages add column if not exists sync_revision bigint not null default 0;
drop trigger if exists feedback_sync_revision on public.feedback_messages;
create trigger feedback_sync_revision before insert or update on public.feedback_messages
for each row execute function public.bump_map_sync_revision();
alter table public.library_items add column if not exists sync_revision bigint not null default 0;
drop trigger if exists library_sync_revision on public.library_items;
create trigger library_sync_revision before insert or update of data,name on public.library_items
for each row execute function public.bump_map_sync_revision();

-- Hash individual fields so unchanged images, drawings and histories stay local.
create or replace function public.map_sync_fields(value jsonb, known jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare field record; hashes jsonb='{}'; changes jsonb='{}'; versions jsonb; items jsonb; digest text;
begin
  for field in select key,v from jsonb_each(value) as f(key,v) loop
    if field.key='versions' and jsonb_typeof(field.v)='array' then
      select coalesce(jsonb_agg(md5(v::text) order by n),'[]'),
        coalesce(jsonb_object_agg(md5(v::text),v) filter(where not coalesce(known->field.key ? md5(v::text),false)),'{}')
        into versions,items from jsonb_array_elements(field.v) with ordinality as a(v,n);
      hashes=jsonb_set(hashes,array[field.key],versions);
      if versions is distinct from known->field.key then changes=jsonb_set(changes,array[field.key],items); end if;
    else
      digest=md5(field.v::text);
      hashes=jsonb_set(hashes,array[field.key],to_jsonb(digest));
      if known->>field.key is distinct from digest then changes=jsonb_set(changes,array[field.key],field.v); end if;
    end if;
  end loop;
  return jsonb_build_object('fields',hashes,'data',changes);
end;
$$;
revoke all on function public.map_sync_fields(jsonb,jsonb) from public,anon,authenticated;

drop function if exists public.save_personal_map(text,text,jsonb);
create or replace function public.save_personal_map(map_id text, map_name text, map_data jsonb, expected_owner uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare input public.maps; saved public.maps;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if expected_owner is not null and expected_owner<>auth.uid() then raise exception 'account-changed'; end if;
  input=jsonb_populate_record(null::public.maps,jsonb_build_object('id',map_id));
  insert into public.maps(id,user_id,name,data) values(input.id,auth.uid(),map_name,map_data)
    on conflict(id) do update set name=excluded.name,data=excluded.data where public.maps.user_id=auth.uid()
    returning * into saved;
  if saved.id is null then raise exception 'not-owner'; end if;
  return jsonb_build_object('id',saved.id,'sync_revision',saved.sync_revision,'created_at',saved.created_at,'updated_at',saved.updated_at,
    'fields',public.map_sync_fields(saved.data,'{}')->'fields');
end; $$;
revoke all on function public.save_personal_map(text,text,jsonb,uuid) from public,anon;
grant execute on function public.save_personal_map(text,text,jsonb,uuid) to authenticated;

drop function if exists public.sync_map_bundle(jsonb,jsonb,uuid);
create or replace function public.sync_map_bundle(known_private jsonb default '{}', known_shared jsonb default '{}', history_team uuid default null, expected_owner uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare personal jsonb; teams jsonb;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if expected_owner is not null and expected_owner<>auth.uid() then raise exception 'account-changed'; end if;
  select jsonb_build_object('ids',coalesce(jsonb_agg(m.id order by m.created_at),'[]'),
    'changes',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'name',m.name,'created_at',m.created_at,'updated_at',m.updated_at,
      'sync_revision',m.sync_revision,'patch',public.map_sync_fields(m.data,known_private->m.id::text->'fields')))
      filter(where known_private->m.id::text->>'revision' is distinct from m.sync_revision::text),'[]'))
    into personal from public.maps m where m.user_id=auth.uid();
  select jsonb_build_object('ids',coalesce(jsonb_agg(m.id order by me.joined_at),'[]'),
    'changes',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'owner_id',m.owner_id,'revision',m.revision,'hidden',me.hidden,
      'invite_token',case when m.owner_id=auth.uid() and m.invites_enabled then m.invite_token else null end,
      'patch',public.map_sync_fields(m.map_data,known_shared->m.id::text->'fields'), 'claims',m.claims,
      'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by joined_at),'[]') from public.collaborative_members where map_id=m.id),
      'events',case when m.id=history_team then (select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from
        (select id,actor_id,changes,created_at,kind,version_hidden from public.collaborative_events where map_id=m.id order by id desc limit 1000)e) else null end))
      filter(where known_shared->m.id::text->>'revision' is distinct from m.revision::text
        or (m.id=history_team and known_shared->m.id::text->>'historyRevision' is distinct from m.revision::text)),'[]'))
    into teams from public.collaborative_maps m join public.collaborative_members me on me.map_id=m.id and me.user_id=auth.uid();
  return jsonb_build_object('personal',personal,'shared',teams);
end; $$;
revoke all on function public.sync_map_bundle(jsonb,jsonb,uuid,uuid) from public,anon;
grant execute on function public.sync_map_bundle(jsonb,jsonb,uuid,uuid) to authenticated;

-- Keep the existing concurrency/grid checks but do not send an unused full history.
create or replace function public.save_collaborative_cells(team_id uuid, cell_changes jsonb, expected_grid jsonb, expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.apply_collaborative_grid_changes(team_id,cell_changes,expected_grid,expected_revision);
end; $$;
revoke all on function public.save_collaborative_cells(uuid,jsonb,jsonb,bigint) from public,anon;
grant execute on function public.save_collaborative_cells(uuid,jsonb,jsonb,bigint) to authenticated;

-- Existing token-based read permissions, with an empty response if unchanged.
create or replace function public.poll_shared_map(share_token text, known_updated_at text default '')
returns jsonb language sql stable security definer set search_path='' as $$
  select case when updated_at::text=known_updated_at then jsonb_build_object('unchanged',true)
    else jsonb_build_object('id',id,'map_data',map_data,'settings',settings,'updated_at',updated_at::text) end
  from public.shared_maps where id=share_token limit 1;
$$;
revoke all on function public.poll_shared_map(text,text) from public;
grant execute on function public.poll_shared_map(text,text) to anon,authenticated;

-- A notification contains no map, history, member, or invitation data.
-- Each account already has its own invalidation channel; authorization remains in RPCs.
create or replace function public.notify_compact_map_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if tg_table_name='maps' then
    perform realtime.send('{}'::jsonb,'maps-changed','account-maps:'||coalesce(new.user_id,old.user_id)::text,false);
  else
    for recipient in select user_id from public.collaborative_members where map_id=new.id loop
      perform realtime.send('{}'::jsonb,'maps-changed','account-maps:'||recipient::text,false);
    end loop;
  end if;
  return null;
exception when others then
  -- A notification outage must not prevent saving; the revision check recovers it.
  raise warning 'Map notification unavailable';
  return null;
end; $$;
revoke all on function public.notify_compact_map_change() from public,anon,authenticated;
drop trigger if exists compact_personal_map_notification on public.maps;
create trigger compact_personal_map_notification after insert or update or delete on public.maps
for each row execute function public.notify_compact_map_change();
drop trigger if exists compact_shared_map_notification on public.collaborative_maps;
create trigger compact_shared_map_notification after insert or update on public.collaborative_maps
for each row execute function public.notify_compact_map_change();
notify pgrst, 'reload schema';
commit;
