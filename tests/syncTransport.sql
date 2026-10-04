-- Run after the lossless-sync migration, in the same transaction. Always roll back.
create temporary table mm_sync_results(metric text,value jsonb);
create temporary table mm_unpack_cache(id text primary key,data jsonb);
create or replace function pg_temp.unpack(node jsonb,objects jsonb)
returns jsonb language plpgsql as $$
declare result jsonb;
begin
  if jsonb_typeof(node)<>'array' then return node; end if;
  case node->>0
  when '@' then
    if not objects ? (node->>1) then raise exception 'missing object'; end if;
    select data into result from mm_unpack_cache where id=node->>1;
    if found then return result; end if;
    result=pg_temp.unpack(objects->(node->>1),objects);
    insert into mm_unpack_cache values(node->>1,result) on conflict do nothing;
    return result;
  when 'o' then
    select coalesce(jsonb_object_agg(key,pg_temp.unpack(value,objects)),'{}') into result from jsonb_each(node->1);
  when 'g' then
    select coalesce(jsonb_object_agg(key#>>'{}',pg_temp.unpack(item->0,objects)),'{}') into result
      from jsonb_array_elements(node->1) item cross join lateral jsonb_array_elements(pg_temp.unpack(item->1,objects)) key;
  when 'a' then
    select coalesce(jsonb_agg(pg_temp.unpack(value,objects) order by n),'[]') into result from jsonb_array_elements(node->1) with ordinality a(value,n);
  when 'r' then
    select coalesce(jsonb_agg(pg_temp.unpack(item->1,objects) order by n,i),'[]') into result
      from jsonb_array_elements(node->1) with ordinality a(item,n) cross join lateral generate_series(1,(item->>0)::integer)i;
  when 'n' then
    select coalesce(jsonb_agg((item->>0)::integer+i order by n,i),'[]') into result
      from jsonb_array_elements(node->1) with ordinality a(item,n) cross join lateral generate_series(0,(item->>1)::integer-1)i;
  else raise exception 'invalid node';
  end case;
  return result;
end; $$;

do $$
declare owner uuid; source jsonb; wire jsonb; decoded jsonb; old_bundle jsonb; next_bundle jsonb; known_private jsonb; known_shared jsonb;
  objects jsonb; known_objects jsonb; receipt jsonb; original public.maps; next_data jsonb; expected jsonb;
  share_id text=gen_random_uuid()::text; team uuid; team_revision bigint; team_data jsonb; outsider uuid=gen_random_uuid();
  started timestamptz; elapsed numeric;
begin
  select user_id into owner from public.maps group by user_id order by sum(pg_column_size(data)) desc limit 1;
  if owner is null then raise exception 'no maps'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
  source=jsonb_build_object('image',repeat('image-',300),'versions',jsonb_build_array(jsonb_build_object('image',repeat('image-',300))),
    'nulls',jsonb_build_array(null,null,null,null,null,null),'runs','[3,4,5,3,4,5,0,-1,0,1,2,3,3,4,5]'::jsonb,
    'literal','["@","literal"]'::jsonb,'unicode','Русский 🚀','reserved',jsonb_build_object('__proto__',jsonb_build_object('value',1)));
  wire=public.pack_sync_response(source);
  if pg_temp.unpack(wire->'value',wire->'objects') is distinct from source then raise exception 'codec roundtrip'; end if;
  select coalesce(jsonb_agg(key),'[]') into known_objects from jsonb_object_keys(wire->'objects') key;
  decoded=public.pack_sync_response(source,known_objects);
  if decoded->'objects'<>'{}'::jsonb or pg_temp.unpack(decoded->'value',wire->'objects') is distinct from source then raise exception 'cached roundtrip'; end if;
  source=(select jsonb_object_agg(n::text,to_jsonb(owner::text)) from generate_series(0,99)n);
  wire=public.pack_sync_response(source);
  if pg_temp.unpack(wire->'value',wire->'objects') is distinct from source then raise exception 'grouped object roundtrip'; end if;

  if to_regprocedure('pg_temp.previous_map_sync_fields(jsonb,jsonb)') is not null then
    for original in select * from public.maps where user_id=owner loop
      if public.map_sync_fields(original.data,'{}') is distinct from pg_temp.previous_map_sync_fields(original.data,'{}')
        or public.map_sync_fields(original.data,public.map_sync_fields(original.data,'{}')->'fields') is distinct from pg_temp.previous_map_sync_fields(original.data,public.map_sync_fields(original.data,'{}')->'fields')
        then raise exception 'field manifest differs from previous protocol'; end if;
    end loop;
  end if;
  source=(select jsonb_object_agg(repeat('long-key-',40)||n::text,true) from generate_series(1,10)n);
  wire=public.pack_sync_response(source);
  if pg_temp.unpack(wire->'value',wire->'objects') is distinct from source then raise exception 'long object keys'; end if;
  old_bundle=public.sync_map_bundle('{}','{}',null,owner);
  started=clock_timestamp();
  wire=public.sync_map_bundle_v2('{}','{}',null,owner);
  elapsed=extract(epoch from(clock_timestamp()-started))*1000;
  objects=wire->'objects';
  decoded=pg_temp.unpack(wire->'value',objects);
  if decoded is distinct from old_bundle then raise exception 'account roundtrip'; end if;
  insert into mm_sync_results values('previous_cold_bytes',to_jsonb(octet_length(old_bundle::text))),('optimized_cold_bytes',to_jsonb(octet_length(wire::text))),('cold_server_ms',to_jsonb(round(elapsed,1)));
  select coalesce(jsonb_object_agg(v->>'id',jsonb_build_object('revision',v->'sync_revision','fields',v->'patch'->'fields')),'{}') into known_private from jsonb_array_elements(old_bundle->'personal'->'changes')v;
  select coalesce(jsonb_object_agg(v->>'id',jsonb_build_object('revision',v->'revision','fields',v->'patch'->'fields')),'{}') into known_shared from jsonb_array_elements(old_bundle->'shared'->'changes')v;
  select coalesce(jsonb_agg(key),'[]') into known_objects from jsonb_object_keys(objects) key;
  wire=public.sync_map_bundle_v2(known_private,known_shared,null,owner,known_objects);
  decoded=pg_temp.unpack(wire->'value',objects||(wire->'objects'));
  if decoded->'personal'->'changes'<>'[]' or decoded->'shared'->'changes'<>'[]' then raise exception 'unchanged maps'; end if;
  insert into mm_sync_results values('optimized_unchanged_bytes',to_jsonb(octet_length(wire::text)));

  select * into original from public.maps where user_id=owner order by pg_column_size(data) desc limit 1;
  receipt=public.save_personal_map_patch(original.id::text,original.name,'{"fields":{},"removed":[]}',original.sync_revision,owner);
  if receipt ? 'fields' or (receipt->>'sync_revision')::bigint is distinct from original.sync_revision then raise exception 'no-op receipt'; end if;
  receipt=public.save_personal_map_patch(original.id::text,original.name,jsonb_build_object('fields',jsonb_build_object('_sync_probe',true),'removed','[]'::jsonb,'versions',null),original.sync_revision,owner);
  select data into next_data from public.maps where id=original.id;
  if next_data is distinct from original.data||jsonb_build_object('_sync_probe',true) then raise exception 'patch lost data'; end if;
  begin
    perform public.save_personal_map_patch(original.id::text,original.name,'{"fields":{},"removed":[]}',original.sync_revision,owner);
    raise exception 'stale patch accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_personal_map_patch(original.id::text,original.name,'{"fields":{},"removed":[]}',(receipt->>'sync_revision')::bigint,outsider);
    raise exception 'wrong account accepted';
  exception when raise_exception then if sqlerrm<>'account-changed' then raise; end if; end;
  receipt=public.save_personal_map_patch(original.id::text,original.name,'{"fields":{},"removed":["_sync_probe"],"versions":{"order":[["new",0]],"added":[{"literal":{"completed":[],"image":null,"id":"probe"}}]}}',(receipt->>'sync_revision')::bigint,owner);
  select data into next_data from public.maps where id=original.id;
  if next_data-'versions' is distinct from original.data-'versions' or next_data->'versions'<>'[{"completed":[],"image":null,"id":"probe"}]'::jsonb then raise exception 'history patch'; end if;
  receipt=public.save_personal_map_patch(original.id::text,original.name,'{"fields":{},"removed":[],"versions":{"order":[["new",0],["old",0],["new",1]],"added":[{"base":["old",0],"fields":{"id":"derived","progressCompleted":[0]},"removed":["image"]},{"literal":null}]}}',(receipt->>'sync_revision')::bigint,owner);
  select data into next_data from public.maps where id=original.id;
  if next_data->'versions'<>'[{"completed":[],"id":"derived","progressCompleted":[0]},{"completed":[],"image":null,"id":"probe"},null]'::jsonb then raise exception 'derived history'; end if;
  receipt=public.save_personal_map_patch(original.id::text,original.name,'{"fields":{},"removed":[],"versions":{"order":[["new",0]],"added":[{"base":["map"],"fields":{"id":"map-version"},"removed":["versions"]}]}}',(receipt->>'sync_revision')::bigint,owner);
  select data into next_data from public.maps where id=original.id;
  if next_data->'versions' is distinct from jsonb_build_array((original.data-'versions')||'{"id":"map-version"}'::jsonb) then raise exception 'map history base'; end if;

  insert into public.shared_maps(id,owner_id,map_id,map_data,settings)
    values(share_id,owner,original.id::text,'{"name":"probe","colors":["#ffffff","#ffffff"],"progressCompleted":[],"versions":[]}','{"showProgress":false,"showHistory":false,"mode":"live"}');
  wire=public.sync_public_map(share_id);
  decoded=pg_temp.unpack(wire->'value',wire->'objects');
  expected=decoded->'patch'->'fields';
  perform public.update_shared_map_if_changed(share_id,'{"name":"probe","colors":["#ffffff","#ffffff"],"progressCompleted":[]}','{"showProgress":false,"showHistory":false,"mode":"live"}',owner);
  wire=public.sync_public_map(share_id,expected,'',(select coalesce(jsonb_agg(key),'[]') from jsonb_object_keys(wire->'objects')key));
  decoded=pg_temp.unpack(wire->'value',wire->'objects');
  if decoded->'patch'->'fields' ? 'versions' or decoded->'patch'->'data' ? 'colors' then raise exception 'public visibility/delta'; end if;
  if public.sync_public_map(gen_random_uuid()::text) is not null then raise exception 'missing link'; end if;
  if public.get_shared_map_settings(share_id) ? 'map_data' then raise exception 'metadata sent body'; end if;

  select m.id,m.revision,m.map_data into team,team_revision,team_data from public.collaborative_maps m join public.collaborative_members c on c.map_id=m.id where c.user_id=owner limit 1;
  if team is not null then
    wire=public.compact_collaborative_rpc('get_collaborative_map',jsonb_build_object('team_id',team),'[]',owner);
    if pg_temp.unpack(wire->'value',wire->'objects') is distinct from public.get_collaborative_map(team) then raise exception 'team roundtrip'; end if;
    wire=public.sync_map_bundle_v2(known_private,known_shared,team,owner);
    decoded=pg_temp.unpack(wire->'value',wire->'objects');
    select v into expected from jsonb_array_elements(decoded->'shared'->'changes')v where v->>'id'=team::text;
    if jsonb_typeof(expected->'events') is distinct from 'object' then raise exception 'history delta missing'; end if;
    known_shared=jsonb_set(known_shared,array[team::text,'eventHashes'],expected->'events'->'hashes');
    wire=public.sync_map_bundle_v2(known_private,known_shared,team,owner);
    decoded=pg_temp.unpack(wire->'value',wire->'objects');
    select v into expected from jsonb_array_elements(decoded->'shared'->'changes')v where v->>'id'=team::text;
    if expected->'events'->'changes'<>'[]'::jsonb then raise exception 'history redownload'; end if;
    begin
      perform public.compact_collaborative_rpc('resize_collaborative_grid',jsonb_build_object('team_id',team,'expected_revision',team_revision-1,'layout',jsonb_build_object('gridMode',team_data->>'gridMode','totalCells',team_data->>'totalCells','manualRows',team_data->>'manualRows','manualCols',team_data->>'manualCols')),'[]',owner);
      raise exception 'stale grid accepted';
    exception when raise_exception then if sqlerrm<>'map-changed' then raise; end if; end;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
    begin
      perform public.compact_collaborative_rpc('get_collaborative_map',jsonb_build_object('team_id',team),'[]',outsider);
      raise exception 'outsider accepted';
    exception when raise_exception then if sqlerrm<>'not-a-member' then raise; end if; end;
  end if;
  if has_function_privilege('anon','public.sync_map_bundle_v2(jsonb,jsonb,uuid,uuid,jsonb)','execute') or has_function_privilege('authenticated','public.pack_sync_response(jsonb,jsonb)','execute') then raise exception 'access broadened'; end if;
  insert into mm_sync_results values('roundtrip_access_history_revision_checks','true');
end; $$;
select metric,value from mm_sync_results;
rollback;
