begin;
alter table public.collaborative_events add column if not exists kind text not null default 'progress';
alter table public.collaborative_events add column if not exists version_hidden boolean not null default false;

create or replace function public.get_collaborative_map(team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  return (select jsonb_build_object('id',m.id,'owner_id',m.owner_id,'map_data',m.map_data,'claims',m.claims,'revision',m.revision,
    'hidden',(select hidden from public.collaborative_members where map_id=m.id and user_id=auth.uid()),
    'invite_token',case when m.owner_id=auth.uid() and m.invites_enabled then m.invite_token else null end,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by joined_at),'[]') from public.collaborative_members where map_id=m.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from (select id,actor_id,changes,created_at,kind,version_hidden from public.collaborative_events where map_id=m.id order by id desc limit 1000)e))
    from public.collaborative_maps m where m.id=team_id);
end; $$;

create or replace function public.apply_collaborative_changes(team_id uuid, cell_changes jsonb, save_version boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare team public.collaborative_maps; item jsonb; idx integer; capacity integer; accepted jsonb='[]'; next_claims jsonb;
  template jsonb; next_colors jsonb; filled boolean; was_filled boolean; color text; previous_color jsonb; previous_progress boolean;
  next_data jsonb; progress_count integer; previous_count integer; activity jsonb; today text; today_cells integer; change_kind text='progress';
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  if cell_changes is null or jsonb_typeof(cell_changes)<>'array' or jsonb_array_length(cell_changes)>20000 then raise exception 'invalid-changes'; end if;
  select * into team from public.collaborative_maps where id=team_id for update;
  capacity=(team.map_data->>'totalCells')::integer;
  if team.map_data->>'gridMode'='manual' then capacity=least(capacity,(team.map_data->>'manualRows')::integer*(team.map_data->>'manualCols')::integer); end if;
  next_claims=team.claims;
  select count(*) into previous_count from jsonb_object_keys(next_claims);
  select coalesce(jsonb_object_agg(value,'true'::jsonb),'{}') into template from jsonb_array_elements_text(coalesce(team.map_data->'completed','[]'));
  next_colors=coalesce(team.map_data->'colors','[]');
  if jsonb_array_length(next_colors)<capacity then
    next_colors=next_colors||(select jsonb_agg('null'::jsonb) from generate_series(jsonb_array_length(next_colors)+1,capacity));
  end if;
  for item in select value from jsonb_array_elements(cell_changes) loop
    idx=(item->>'index')::integer; filled=(item->>'filled')::boolean;
    if idx is null or idx<0 or idx>=least(capacity,10000) or filled is null then raise exception 'invalid-cell'; end if;
    if item->>'mode'='drawing' then
      change_kind='drawing'; was_filled=template ? idx::text;
      color=coalesce(item->>'color','#111111');
      if color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid-color'; end if;
      previous_color=next_colors->idx; previous_progress=next_claims ? idx::text;
      if was_filled=filled and (not filled or previous_color=to_jsonb(color)) then continue; end if;
      if filled then template=jsonb_set(template,array[idx::text],'true'); else template=template-idx::text; next_claims=next_claims-idx::text; end if;
      next_colors=jsonb_set(next_colors,array[idx::text],case when filled then to_jsonb(color) else 'null'::jsonb end);
      accepted=accepted||jsonb_build_array(jsonb_build_object('index',idx,'mode','drawing','filled',filled,'color',color,'previous_filled',was_filled,'previous_color',previous_color,'previous_progress',previous_progress));
    else
      if team.map_data->>'mapType'='free' and not (template ? idx::text) then continue; end if;
      was_filled=next_claims ? idx::text;
      if was_filled=filled then continue; end if;
      if filled then next_claims=jsonb_set(next_claims,array[idx::text],to_jsonb(auth.uid()::text)); else next_claims=next_claims-idx::text; end if;
      accepted=accepted||jsonb_build_array(jsonb_build_object('index',idx,'filled',filled,'previous_filled',was_filled));
    end if;
  end loop;
  if jsonb_array_length(accepted)>0 or save_version then
    select count(*) into progress_count from jsonb_object_keys(next_claims);
    today=to_char(now() at time zone 'Europe/Moscow','YYYY-MM-DD');
    select coalesce(sum((value->>'cells')::integer),0) into today_cells from jsonb_array_elements(coalesce(team.map_data->'activityLog','[]')) where value->>'date'=today;
    today_cells=greatest(0,least(progress_count,today_cells+progress_count-previous_count));
    select coalesce(jsonb_agg(value),'[]') into activity from jsonb_array_elements(coalesce(team.map_data->'activityLog','[]')) where value->>'date'<>today;
    if today_cells>0 then activity=activity||jsonb_build_array(jsonb_build_object('date',today,'cells',today_cells)); end if;
    next_data=team.map_data||jsonb_build_object('colors',next_colors,'completed',(select coalesce(jsonb_agg(key::integer order by key::integer),'[]') from jsonb_object_keys(template) key),
      'progressCompleted',(select coalesce(jsonb_agg(key::integer order by key::integer),'[]') from jsonb_object_keys(next_claims) key),'activityLog',activity,'dailyPlanDoneOn','', 'lastPaintedAt',now());
    update public.collaborative_maps set claims=next_claims,map_data=next_data,revision=revision+1,updated_at=now() where id=team_id;
    insert into public.collaborative_events(map_id,actor_id,changes,kind) values(team_id,auth.uid(),accepted,case when save_version and jsonb_array_length(accepted)=0 then 'version' else change_kind end);
  end if;
  return public.get_collaborative_map(team_id);
end; $$;

create or replace function public.apply_collaborative_progress(team_id uuid, cell_changes jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select public.apply_collaborative_changes(team_id,cell_changes,false); $$;

create or replace function public.set_collaborative_version_visibility(team_id uuid, event_id bigint, hide boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  update public.collaborative_events set version_hidden=hide where id=event_id and map_id=team_id;
  update public.collaborative_maps set revision=revision+1,updated_at=now() where id=team_id;
end; $$;
revoke all on function public.apply_collaborative_changes(uuid,jsonb,boolean),public.set_collaborative_version_visibility(uuid,bigint,boolean) from public,anon;
grant execute on function public.apply_collaborative_changes(uuid,jsonb,boolean),public.set_collaborative_version_visibility(uuid,bigint,boolean) to authenticated;

-- Repair an old daily count that exceeds the progress remaining on the map.
update public.collaborative_maps m set map_data=jsonb_set(jsonb_set(map_data,'{activityLog}',
  (select coalesce(jsonb_agg(case when value->>'date'=to_char(now() at time zone 'Europe/Moscow','YYYY-MM-DD') then jsonb_set(value,'{cells}',to_jsonb(least((value->>'cells')::integer,(select count(*)::integer from jsonb_object_keys(m.claims))))) else value end),'[]') from jsonb_array_elements(coalesce(map_data->'activityLog','[]')))),
  '{dailyPlanDoneOn}','""'),revision=revision+1,updated_at=now();
commit;
