begin;
create table if not exists public.collaborative_maps (
  id uuid primary key default gen_random_uuid(),
  source_map_id text not null,
  owner_id uuid not null references auth.users(id),
  invite_token uuid not null unique default gen_random_uuid(),
  invites_enabled boolean not null default true,
  map_data jsonb not null,
  claims jsonb not null default '{}',
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique(owner_id,source_map_id)
);
create table if not exists public.collaborative_members (
  map_id uuid not null references public.collaborative_maps(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key(map_id,user_id)
);
create table if not exists public.collaborative_events (
  id bigint generated always as identity primary key,
  map_id uuid not null references public.collaborative_maps(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  changes jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists collaborative_events_map_time on public.collaborative_events(map_id,id);
alter table public.collaborative_maps enable row level security;
alter table public.collaborative_members enable row level security;
alter table public.collaborative_events enable row level security;

create or replace function public.is_collaborative_member(team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.collaborative_members where map_id=team_id and user_id=auth.uid());
$$;
revoke all on function public.is_collaborative_member(uuid) from public;
grant execute on function public.is_collaborative_member(uuid) to authenticated;
create policy "members read shared work" on public.collaborative_maps for select to authenticated using(public.is_collaborative_member(id));
create policy "members read participants" on public.collaborative_members for select to authenticated using(public.is_collaborative_member(map_id));
create policy "members read shared history" on public.collaborative_events for select to authenticated using(public.is_collaborative_member(map_id));
grant select on public.collaborative_maps,public.collaborative_members,public.collaborative_events to authenticated;

create or replace function public.get_collaborative_map(team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  return (select jsonb_build_object('id',m.id,'owner_id',m.owner_id,'map_data',m.map_data,'claims',m.claims,'revision',m.revision,
    'invite_token',case when m.owner_id=auth.uid() and m.invites_enabled then m.invite_token else null end,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by joined_at),'[]') from public.collaborative_members where map_id=m.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from (select id,actor_id,changes,created_at from public.collaborative_events where map_id=m.id order by id desc limit 1000)e))
    from public.collaborative_maps m where m.id=team_id);
end; $$;

create or replace function public.list_collaborative_maps()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.get_collaborative_map(map_id)),'[]') from public.collaborative_members where user_id=auth.uid();
$$;

create or replace function public.create_collaborative_map(source_id text, participant_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare source jsonb; team uuid; claims jsonb; member_name text;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  select data||jsonb_build_object('id',id,'name',name) into source from public.maps where id::text=source_id and user_id=auth.uid();
  if source is null then raise exception 'map-not-owned'; end if;
  if jsonb_array_length(coalesce(source->'completed','[]'))=0 and source->>'mapType'='free' then raise exception 'empty-template'; end if;
  select coalesce(jsonb_object_agg(value,auth.uid()::text),'{}') into claims from jsonb_array_elements_text(coalesce(source->'progressCompleted','[]'));
  insert into public.collaborative_maps(source_map_id,owner_id,map_data,claims)
    values(source_id,auth.uid(),source-'versions'-'shareId'-'shareUrl'-'shareSettings'||jsonb_build_object('isGameMode',true),claims)
    on conflict(owner_id,source_map_id) do nothing;
  select id into team from public.collaborative_maps where owner_id=auth.uid() and source_map_id=source_id;
  member_name=coalesce(nullif(left(trim(participant_name),60),''),'Участник');
  insert into public.collaborative_members(map_id,user_id,display_name) values(team,auth.uid(),member_name) on conflict do nothing;
  return public.get_collaborative_map(team);
end; $$;

create or replace function public.preview_collaborative_invite(invitation uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name',map_data->>'name','participants',(select count(*) from public.collaborative_members where map_id=m.id))
  from public.collaborative_maps m where invite_token=invitation and invites_enabled;
$$;

create or replace function public.join_collaborative_map(invitation uuid, participant_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare team uuid;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  select id into team from public.collaborative_maps where invite_token=invitation and invites_enabled for update;
  if team is null then raise exception 'invite-disabled'; end if;
  insert into public.collaborative_members(map_id,user_id,display_name) values(team,auth.uid(),coalesce(nullif(left(trim(participant_name),60),''),'Участник')) on conflict do nothing;
  if found then update public.collaborative_maps set revision=revision+1,updated_at=now() where id=team; end if;
  return public.get_collaborative_map(team);
end; $$;

-- Apply only touched cells, under a row lock. Other participants' changes are never
-- overwritten by a complete stale map snapshot; attribution comes from auth.uid().
create or replace function public.apply_collaborative_progress(team_id uuid, cell_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare team public.collaborative_maps; item jsonb; idx integer; capacity integer; accepted jsonb='[]'; next_claims jsonb; filled boolean;
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  if jsonb_typeof(cell_changes)<>'array' or jsonb_array_length(cell_changes)>10000 then raise exception 'invalid-changes'; end if;
  select * into team from public.collaborative_maps where id=team_id for update;
  capacity=(team.map_data->>'totalCells')::integer;
  if team.map_data->>'gridMode'='manual' then capacity=least(capacity,(team.map_data->>'manualRows')::integer*(team.map_data->>'manualCols')::integer); end if;
  next_claims=team.claims;
  for item in select value from jsonb_array_elements(cell_changes) loop
    idx=(item->>'index')::integer; filled=(item->>'filled')::boolean;
    if idx is null or idx<0 or idx>=least(capacity,10000) or filled is null then raise exception 'invalid-cell'; end if;
    if team.map_data->>'mapType'='free' and not (team.map_data->'completed' @> jsonb_build_array(idx)) then continue; end if;
    if filled and not (next_claims ? idx::text) then
      next_claims=jsonb_set(next_claims,array[idx::text],to_jsonb(auth.uid()::text));
      accepted=accepted||jsonb_build_array(jsonb_build_object('index',idx,'filled',true));
    elsif not filled and next_claims ? idx::text then
      next_claims=next_claims-idx::text;
      accepted=accepted||jsonb_build_array(jsonb_build_object('index',idx,'filled',false));
    end if;
  end loop;
  if jsonb_array_length(accepted)>0 then
    update public.collaborative_maps set claims=next_claims,
      map_data=jsonb_set(jsonb_set(team.map_data,'{progressCompleted}',(select coalesce(jsonb_agg(key::integer order by key::integer),'[]') from jsonb_object_keys(next_claims) key)),'{lastPaintedAt}',to_jsonb(now())),
      revision=revision+1,updated_at=now() where id=team_id;
    insert into public.collaborative_events(map_id,actor_id,changes) values(team_id,auth.uid(),accepted);
  end if;
  return public.get_collaborative_map(team_id);
end; $$;

revoke all on function public.get_collaborative_map(uuid),public.list_collaborative_maps(),public.create_collaborative_map(text,text),public.join_collaborative_map(uuid,text),public.apply_collaborative_progress(uuid,jsonb),public.preview_collaborative_invite(uuid) from public;
grant execute on function public.get_collaborative_map(uuid),public.list_collaborative_maps(),public.create_collaborative_map(text,text),public.join_collaborative_map(uuid,text),public.apply_collaborative_progress(uuid,jsonb) to authenticated;
grant execute on function public.preview_collaborative_invite(uuid) to anon,authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='collaborative_maps') then
    alter publication supabase_realtime add table public.collaborative_maps;
  end if;
end $$;
commit;
