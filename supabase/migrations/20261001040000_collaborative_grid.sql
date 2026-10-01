begin;
create or replace function public.collaborative_grid_dimensions(data jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare total integer=(data->>'totalCells')::integer; cols integer; rows integer; ratio double precision;
begin
  if total is null or total<1 or total>10000 then raise exception 'invalid-grid'; end if;
  if data->>'gridMode'='manual' then
    cols=(data->>'manualCols')::integer; rows=(data->>'manualRows')::integer;
    if cols is null or rows is null or cols<1 or rows<1 or cols::bigint*rows>10000 then raise exception 'invalid-grid'; end if;
    total=least(total,cols*rows);
  elsif data->>'gridMode'='auto' then
    ratio=coalesce((data->>'imageRatio')::double precision,1);
    if ratio<=0 or ratio>10000 then raise exception 'invalid-grid'; end if;
    cols=least(total,greatest(1,floor(sqrt(total*ratio)+0.5)::integer));
    while ceil(total::numeric/cols)*cols>10000 loop cols=cols-1; end loop;
    rows=ceil(total::numeric/cols)::integer;
  else raise exception 'invalid-grid'; end if;
  return jsonb_build_object('cols',cols,'rows',rows,'actualTotal',total);
end; $$;

-- Reject edits made against an old coordinate system, rather than painting other cells.
create or replace function public.apply_collaborative_grid_changes(team_id uuid, cell_changes jsonb, expected_grid jsonb, expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb; changes jsonb=cell_changes; step record; next_changes jsonb; item jsonb;
  source_grid jsonb=expected_grid; target_grid jsonb; idx integer; x integer; y integer; dest integer;
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  select map_data into data from public.collaborative_maps where id=team_id for update;
  -- Rebase strokes from a participant whose browser has not received a resize yet.
  for step in select e.changes->0 as change from public.collaborative_events e
    where e.map_id=team_id and e.kind='grid' and (e.changes->0->>'revision')::bigint>expected_revision order by e.id loop
    if public.collaborative_grid_dimensions(step.change->'before') is distinct from source_grid then raise exception 'grid-changed'; end if;
    target_grid=public.collaborative_grid_dimensions(step.change->'after'); next_changes='[]';
    for item in select value from jsonb_array_elements(changes) loop
      idx=(item->>'index')::integer;
      if idx is null or idx<0 or idx>=(source_grid->>'actualTotal')::integer then raise exception 'invalid-cell'; end if;
      x=idx%(source_grid->>'cols')::integer+(step.change->>'dx')::integer;
      y=idx/(source_grid->>'cols')::integer+(step.change->>'dy')::integer; dest=y*(target_grid->>'cols')::integer+x;
      if x>=0 and y>=0 and x<(target_grid->>'cols')::integer and y<(target_grid->>'rows')::integer and dest<(target_grid->>'actualTotal')::integer then
        next_changes=next_changes||jsonb_build_array(jsonb_set(item,'{index}',to_jsonb(dest)));
      end if;
    end loop;
    changes=next_changes; source_grid=target_grid;
  end loop;
  if public.collaborative_grid_dimensions(data) is distinct from source_grid then raise exception 'grid-changed'; end if;
  return public.apply_collaborative_changes(team_id,changes,false);
end; $$;

create or replace function public.resize_collaborative_grid(team_id uuid, expected_revision bigint, layout jsonb default null, restore_event bigint default null, reverse boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare team public.collaborative_maps; before_data jsonb; next_data jsonb; before_grid jsonb; after_grid jsonb;
  next_claims jsonb='{}'; next_completed jsonb='[]'; next_colors jsonb; item record; idx integer; dest integer;
  x integer; y integer; dx integer=0; dy integer=0; saved jsonb; field text; previous_count integer; next_count integer;
  today text=to_char(now() at time zone 'Europe/Moscow','YYYY-MM-DD'); activity jsonb;
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  select * into team from public.collaborative_maps where id=team_id for update;
  if team.revision is distinct from expected_revision then raise exception 'map-changed'; end if;
  before_data=team.map_data||jsonb_build_object('claims',team.claims);
  if restore_event is not null then
    select changes->0 into saved
      from public.collaborative_events where map_id=team_id and id=restore_event and kind='grid';
    if saved is null then raise exception 'invalid-version'; end if;
    dx=(saved->>'dx')::integer*(case when reverse then -1 else 1 end);
    dy=(saved->>'dy')::integer*(case when reverse then -1 else 1 end);
    saved=saved->(case when reverse then 'before' else 'after' end);
    next_data=team.map_data;
    foreach field in array array['gridMode','totalCells','manualRows','manualCols','imageOffset','colors','completed','progressCompleted'] loop
      next_data=jsonb_set(next_data,array[field],coalesce(saved->field,'null'));
    end loop;
    perform public.collaborative_grid_dimensions(next_data);
    next_claims=saved->'claims';
  else
    if layout is null or jsonb_typeof(layout)<>'object' then raise exception 'invalid-grid'; end if;
    next_data=team.map_data||jsonb_build_object('gridMode',layout->'gridMode','totalCells',layout->'totalCells','manualRows',layout->'manualRows','manualCols',layout->'manualCols');
    before_grid=public.collaborative_grid_dimensions(team.map_data); after_grid=public.collaborative_grid_dimensions(next_data);
    if layout->>'rowSide'='top' then dy=(after_grid->>'rows')::integer-(before_grid->>'rows')::integer; end if;
    if layout->>'colSide'='left' then dx=(after_grid->>'cols')::integer-(before_grid->>'cols')::integer; end if;
    select jsonb_agg('null'::jsonb) into next_colors from generate_series(1,(after_grid->>'actualTotal')::integer);
    for idx in select generate_series(0,(before_grid->>'actualTotal')::integer-1) loop
      x=idx%(before_grid->>'cols')::integer+dx; y=idx/(before_grid->>'cols')::integer+dy;
      dest=y*(after_grid->>'cols')::integer+x;
      if x<0 or y<0 or x>=(after_grid->>'cols')::integer or y>=(after_grid->>'rows')::integer or dest>=(after_grid->>'actualTotal')::integer then continue; end if;
      next_colors=jsonb_set(next_colors,array[dest::text],coalesce(team.map_data->'colors'->idx,'null'));
      if team.claims ? idx::text then next_claims=jsonb_set(next_claims,array[dest::text],team.claims->idx::text); end if;
    end loop;
    for idx in select value::integer from jsonb_array_elements_text(team.map_data->'completed') loop
      x=idx%(before_grid->>'cols')::integer+dx; y=idx/(before_grid->>'cols')::integer+dy; dest=y*(after_grid->>'cols')::integer+x;
      if x>=0 and y>=0 and x<(after_grid->>'cols')::integer and y<(after_grid->>'rows')::integer and dest<(after_grid->>'actualTotal')::integer then next_completed=next_completed||to_jsonb(dest); end if;
    end loop;
    next_data=next_data||jsonb_build_object('completed',next_completed,'colors',next_colors,
      'progressCompleted',(select coalesce(jsonb_agg(key::integer order by key::integer),'[]') from jsonb_object_keys(next_claims) key));
    if next_data->>'mapType'='image' then next_data=jsonb_set(next_data,'{imageOffset}',coalesce(next_data->'imageOffset','{}')||jsonb_build_object('cellsEdited',true)); end if;
  end if;
  select count(*) into previous_count from jsonb_object_keys(team.claims);
  select count(*) into next_count from jsonb_object_keys(next_claims);
  select coalesce(jsonb_agg(case when value->>'date'=today then jsonb_set(value,'{cells}',to_jsonb(greatest(0,least(next_count,(value->>'cells')::integer+next_count-previous_count)))) else value end),'[]') into activity from jsonb_array_elements(coalesce(team.map_data->'activityLog','[]'));
  next_data=next_data||jsonb_build_object('activityLog',activity,'dailyPlanDoneOn','');
  if next_data=team.map_data and next_claims=team.claims then return public.get_collaborative_map(team_id); end if;
  insert into public.collaborative_events(map_id,actor_id,kind,changes) values(team_id,auth.uid(),'grid',jsonb_build_array(jsonb_build_object('mode','grid','revision',team.revision+1,'dx',dx,'dy',dy,'before',before_data,'after',next_data||jsonb_build_object('claims',next_claims))));
  update public.collaborative_maps set map_data=next_data,claims=next_claims,revision=revision+1,updated_at=now() where id=team_id;
  return public.get_collaborative_map(team_id);
end; $$;
revoke all on function public.collaborative_grid_dimensions(jsonb),public.apply_collaborative_grid_changes(uuid,jsonb,jsonb,bigint),public.resize_collaborative_grid(uuid,bigint,jsonb,bigint,boolean) from public,anon;
grant execute on function public.apply_collaborative_grid_changes(uuid,jsonb,jsonb,bigint),public.resize_collaborative_grid(uuid,bigint,jsonb,bigint,boolean) to authenticated;
commit;
