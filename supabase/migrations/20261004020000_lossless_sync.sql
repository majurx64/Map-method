begin;

-- Aggregate each field once instead of repeatedly copying an entire history object.
create or replace function public.map_sync_fields(value jsonb,known jsonb)
returns jsonb language sql immutable set search_path='' as $$
  with fields as materialized (
    select key,v,case when key='versions' and jsonb_typeof(v)='array'
      then (select coalesce(jsonb_agg(md5(item::text) order by n),'[]') from jsonb_array_elements(v) with ordinality a(item,n))
      else to_jsonb(md5(v::text)) end as hashes
    from jsonb_each(value) f(key,v)
  )
  select jsonb_build_object('fields',coalesce(jsonb_object_agg(key,hashes),'{}'),
    'data',coalesce(jsonb_object_agg(key,case when key='versions' and jsonb_typeof(v)='array'
      then (select coalesce(jsonb_object_agg(hashes->>((n-1)::integer),item) filter(where not coalesce(known->key ? (hashes->>((n-1)::integer)),false)),'{}') from jsonb_array_elements(v) with ordinality a(item,n))
      else v end) filter(where hashes is distinct from known->key),'{}')) from fields;
$$;
revoke all on function public.map_sync_fields(jsonb,jsonb) from public,anon,authenticated;

-- A transport dictionary removes repeated images/snapshots without changing stored data.
-- Tagged nodes make every JSON value unambiguous, including user-supplied arrays/keys.
create or replace function public.encode_sync_node(source jsonb,reference boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare encoded jsonb; plain jsonb; grouped jsonb; item record;
begin
  if reference and pg_column_size(source)>=256 then return jsonb_build_array('@',md5(source::text)); end if;
  case jsonb_typeof(source)
  when 'object' then
    select coalesce(jsonb_object_agg(key,case when jsonb_typeof(value) in ('object','array') or pg_column_size(value)>=256 then public.encode_sync_node(value,true) else value end),'{}') into encoded from jsonb_each(source);
    plain=jsonb_build_array('o',encoded);
    if (select count(*)>=8 and count(distinct value)*2<count(*) from jsonb_each(encoded))
      and not exists(select 1 from jsonb_each(encoded) where pg_column_size(to_jsonb(key))>=256) then
      select jsonb_build_array('g',jsonb_agg(jsonb_build_array(v,public.encode_sync_node(keys,false)))) into grouped
      from (select value as v,jsonb_agg(case when key~'^(0|[1-9][0-9]{0,8})$' then to_jsonb(key::bigint) else to_jsonb(key) end order by key) as keys from jsonb_each(encoded) group by value)g;
      if octet_length(grouped::text)<octet_length(plain::text) then plain=grouped; end if;
    end if;
    return plain;
  when 'array' then
    if jsonb_array_length(source)>3 and not exists(select 1 from jsonb_array_elements(source) v where jsonb_typeof(v)<>'number' or v::text!~'^-?[0-9]{1,9}$') then
      with entries as (select (v::text)::bigint as v,n from jsonb_array_elements(source) with ordinality a(v,n)),
        preceding as (select *,lag(v) over(order by n) as previous from entries),
        starts as (select v,n from preceding where n=1 or v<>previous+1),
        runs as (select v,n,lead(n,1,jsonb_array_length(source)::bigint+1) over(order by n)-n as count from starts)
      select jsonb_build_array('n',jsonb_agg(jsonb_build_array(v,count) order by n)) into encoded from runs;
      if octet_length(encoded::text)<octet_length(source::text) then return encoded; end if;
      -- Integer cell indices are distinct in normal maps: avoid a second run scan.
      if not exists(select 1 from jsonb_array_elements(source) v group by v having count(*)>1) then return jsonb_build_array('a',source); end if;
    end if;
    if not exists(select 1 from jsonb_array_elements(source) v where jsonb_typeof(v) in ('array','object') or pg_column_size(v)>=256) then
      with entries as (select v,n,lag(v) over(order by n) as previous from jsonb_array_elements(source) with ordinality a(v,n)),
        starts as (select v,n from entries where n=1 or v is distinct from previous),
        runs as (select v,n,lead(n,1,jsonb_array_length(source)::bigint+1) over(order by n)-n as count from starts)
      select jsonb_build_array('r',coalesce(jsonb_agg(jsonb_build_array(count,v) order by n),'[]')) into encoded from runs;
      plain=jsonb_build_array('a',source);
      if octet_length(plain::text)<=octet_length(encoded::text) then return plain; end if;
      return encoded;
    end if;
    select jsonb_build_array('a',coalesce(jsonb_agg(public.encode_sync_node(v,true) order by n),'[]')) into encoded from jsonb_array_elements(source) with ordinality a(v,n);
    return encoded;
  else return source;
  end case;
end; $$;
revoke all on function public.encode_sync_node(jsonb,boolean) from public,anon,authenticated;

-- Encode each unique large subtree once, independently of the other nodes. This avoids
-- repeatedly copying a growing dictionary while traversing thousands of history cells.
create or replace function public.pack_sync_node(source jsonb,known jsonb,objects jsonb default '{}')
returns jsonb language sql immutable set search_path='' as $$
  with recursive nodes(v,digest) as (
    select source,md5(source::text) where pg_column_size(source)<256 or case when known='{}'::jsonb then true else not coalesce(known ? md5(source::text),false) end
    union all
    select child.v,md5(child.v::text) from nodes n cross join lateral (
      select value as v from jsonb_each(case when jsonb_typeof(n.v)='object' then n.v else '{}'::jsonb end)
      union all
      select value as v from jsonb_array_elements(case when jsonb_typeof(n.v)='array' then n.v else '[]'::jsonb end)
    ) child where pg_column_size(child.v)>=256 and case when known='{}'::jsonb then true else not coalesce(known ? md5(child.v::text),false) end
  ), unique_nodes as materialized (select distinct on(digest) digest,v from nodes order by digest)
  select jsonb_build_object('value',public.encode_sync_node(source,true),
    'objects',coalesce(jsonb_object_agg(digest,public.encode_sync_node(v,false)),'{}')) from unique_nodes;
$$;
revoke all on function public.pack_sync_node(jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.pack_sync_response(source jsonb, known jsonb default '[]')
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('format','mm-wire-1')||public.pack_sync_node(source,
    (select coalesce(jsonb_object_agg(value#>>'{}',true),'{}') from jsonb_array_elements(known)));
$$;
revoke all on function public.pack_sync_response(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.sync_map_bundle_v2(known_private jsonb default '{}', known_shared jsonb default '{}', history_team uuid default null, expected_owner uuid default null, known_objects jsonb default '[]')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bundle jsonb; changes jsonb='[]'; item jsonb; events jsonb;
begin
  bundle=public.sync_map_bundle(known_private,known_shared,history_team,expected_owner);
  for item in select value from jsonb_array_elements(bundle->'shared'->'changes') loop
    if jsonb_typeof(item->'events')='array' then
      select jsonb_build_object('ids',coalesce(jsonb_agg(e->'id' order by n),'[]'),
        'hashes',coalesce(jsonb_object_agg(e->>'id',md5(e::text)),'{}'),
        'changes',coalesce(jsonb_agg(e order by n) filter(where known_shared->(item->>'id')->'eventHashes'->>(e->>'id') is distinct from md5(e::text)),'[]'))
      into events from jsonb_array_elements(item->'events') with ordinality a(e,n);
      item=jsonb_set(item,'{events}',events);
    end if;
    changes=changes||jsonb_build_array(item);
  end loop;
  bundle=jsonb_set(bundle,'{shared,changes}',changes);
  return public.pack_sync_response(bundle,known_objects);
end; $$;
revoke all on function public.sync_map_bundle_v2(jsonb,jsonb,uuid,uuid,jsonb) from public,anon;
grant execute on function public.sync_map_bundle_v2(jsonb,jsonb,uuid,uuid,jsonb) to authenticated;

-- The expected revision binds history indices to the snapshot used to make the patch.
create or replace function public.save_personal_map_patch(map_id text,map_name text,patch jsonb,expected_revision bigint,expected_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current public.maps; next_data jsonb; next_versions jsonb; item jsonb; selected jsonb; added jsonb; field jsonb;
begin
  if auth.uid() is null or expected_owner is distinct from auth.uid() then raise exception 'account-changed'; end if;
  select * into current from public.maps where id::text=map_id and user_id=auth.uid() for update;
  if current.id is null or current.sync_revision is distinct from expected_revision then raise exception 'sync-conflict' using errcode='40001'; end if;
  if jsonb_typeof(patch->'fields') is distinct from 'object' or jsonb_typeof(patch->'removed') is distinct from 'array' then raise exception 'invalid-map-patch'; end if;
  next_data=current.data||(patch->'fields');
  for item in select value from jsonb_array_elements(patch->'removed') loop next_data=next_data-(item#>>'{}'); end loop;
  if jsonb_typeof(patch->'versions')='object' then
    next_versions='[]';
    for item in select value from jsonb_array_elements(patch->'versions'->'order') loop
      if (item->>1)::integer<0 then raise exception 'invalid-version-index'; end if;
      case item->>0
        when 'old' then selected=current.data->'versions'->((item->>1)::integer);
        when 'new' then
          added=patch->'versions'->'added'->((item->>1)::integer);
          if added ? 'literal' then selected=added->'literal';
          else
            case added->'base'->>0
              when 'map' then selected=next_data;
              when 'old' then selected=current.data->'versions'->((added->'base'->>1)::integer);
              else raise exception 'invalid-version-base';
            end case;
            if jsonb_typeof(selected) is distinct from 'object' or jsonb_typeof(added->'fields') is distinct from 'object' then raise exception 'invalid-version-base'; end if;
            selected=selected||(added->'fields');
            for field in select value from jsonb_array_elements(added->'removed') loop selected=selected-(field#>>'{}'); end loop;
          end if;
        else raise exception 'invalid-version-index';
      end case;
      if selected is null then raise exception 'invalid-version-index'; end if;
      next_versions=next_versions||jsonb_build_array(selected);
    end loop;
    next_data=jsonb_set(next_data,'{versions}',next_versions);
  end if;
  if next_data=current.data and map_name=current.name then
    return jsonb_build_object('id',current.id,'sync_revision',current.sync_revision,'created_at',current.created_at,'updated_at',current.updated_at);
  end if;
  return public.save_personal_map(map_id,map_name,next_data,expected_owner);
end; $$;
revoke all on function public.save_personal_map_patch(text,text,jsonb,bigint,uuid) from public,anon;
grant execute on function public.save_personal_map_patch(text,text,jsonb,bigint,uuid) to authenticated;

create or replace function public.sync_public_map(share_token text,known_fields jsonb default '{}',known_updated_at text default '',known_objects jsonb default '[]')
returns jsonb language sql stable security definer set search_path='' as $$
  select public.pack_sync_response(case when updated_at::text=known_updated_at then jsonb_build_object('unchanged',true)
    else jsonb_build_object('id',id,'patch',public.map_sync_fields(map_data,known_fields),'settings',settings,'updated_at',updated_at::text) end,known_objects)
  from public.shared_maps where id=share_token limit 1;
$$;
revoke all on function public.sync_public_map(text,jsonb,text,jsonb) from public;
grant execute on function public.sync_public_map(text,jsonb,text,jsonb) to anon,authenticated;

create or replace function public.get_shared_map_settings(share_token text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'settings',settings,'updated_at',updated_at)
    from public.shared_maps where id=share_token limit 1;
$$;
revoke all on function public.get_shared_map_settings(text) from public;
grant execute on function public.get_shared_map_settings(text) to anon,authenticated;

create or replace function public.update_shared_map_if_changed(share_token text,visible_data jsonb,visibility jsonb,expected_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or expected_owner is distinct from auth.uid() then raise exception 'account-changed'; end if;
  update public.shared_maps set map_data=visible_data,settings=visibility,updated_at=now()
    where id=share_token and owner_id=auth.uid() and (map_data is distinct from visible_data or settings is distinct from visibility);
end; $$;
revoke all on function public.update_shared_map_if_changed(text,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.update_shared_map_if_changed(text,jsonb,jsonb,uuid) to authenticated;

create or replace function public.sync_public_library(known_revisions jsonb default '{}',known_objects jsonb default '[]')
returns jsonb language sql stable security definer set search_path='' as $$
  select public.pack_sync_response(jsonb_build_object('ids',coalesce(jsonb_agg(l.id order by l.created_at),'[]'),
    'usage',coalesce(jsonb_object_agg(l.id,l.use_count),'{}'),
    'changes',coalesce(jsonb_agg(to_jsonb(l) order by l.created_at) filter(where known_revisions->>l.id::text is distinct from l.sync_revision::text),'[]')),known_objects)
  from public.library_items l;
$$;
revoke all on function public.sync_public_library(jsonb,jsonb) from public;
grant execute on function public.sync_public_library(jsonb,jsonb) to anon,authenticated;

-- Explicit dispatch retains all existing membership, geometry, and revision checks.
create or replace function public.compact_collaborative_rpc(operation text,arguments jsonb,known_objects jsonb default '[]',expected_owner uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if expected_owner is not null and expected_owner<>auth.uid() then raise exception 'account-changed'; end if;
  case operation
    when 'get_collaborative_map' then result=public.get_collaborative_map((arguments->>'team_id')::uuid);
    when 'resize_collaborative_grid' then result=public.resize_collaborative_grid((arguments->>'team_id')::uuid,(arguments->>'expected_revision')::bigint,arguments->'layout',(arguments->>'restore_event')::bigint,coalesce((arguments->>'reverse')::boolean,false));
    when 'apply_collaborative_changes' then result=public.apply_collaborative_changes((arguments->>'team_id')::uuid,arguments->'cell_changes',coalesce((arguments->>'save_version')::boolean,false));
    when 'manage_collaborative_map' then result=public.manage_collaborative_map((arguments->>'team_id')::uuid,coalesce(arguments->'details','{}'),(arguments->>'hide')::boolean);
    when 'create_collaborative_map' then result=public.create_collaborative_map(arguments->>'source_id',arguments->>'participant_name');
    when 'join_collaborative_map' then result=public.join_collaborative_map((arguments->>'invitation')::uuid,arguments->>'participant_name');
    else raise exception 'unsupported-operation';
  end case;
  return public.pack_sync_response(result,known_objects);
end; $$;
revoke all on function public.compact_collaborative_rpc(text,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.compact_collaborative_rpc(text,jsonb,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
