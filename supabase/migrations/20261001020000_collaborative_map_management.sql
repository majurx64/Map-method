begin;
alter table public.collaborative_members add column if not exists hidden boolean not null default false;

create or replace function public.get_collaborative_map(team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  return (select jsonb_build_object('id',m.id,'owner_id',m.owner_id,'map_data',m.map_data,'claims',m.claims,'revision',m.revision,
    'hidden',(select hidden from public.collaborative_members where map_id=m.id and user_id=auth.uid()),
    'invite_token',case when m.owner_id=auth.uid() and m.invites_enabled then m.invite_token else null end,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by joined_at),'[]') from public.collaborative_members where map_id=m.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from (select id,actor_id,changes,created_at from public.collaborative_events where map_id=m.id order by id desc limit 1000)e))
    from public.collaborative_maps m where m.id=team_id);
end; $$;

-- Removing a shared card is personal and reversible; the shared work stays intact.
create or replace function public.join_collaborative_map(invitation uuid, participant_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare team uuid;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  select id into team from public.collaborative_maps where invite_token=invitation and invites_enabled for update;
  if team is null then raise exception 'invite-disabled'; end if;
  insert into public.collaborative_members(map_id,user_id,display_name) values(team,auth.uid(),coalesce(nullif(left(trim(participant_name),60),''),'Участник'))
    on conflict(map_id,user_id) do update set hidden=false;
  update public.collaborative_maps set revision=revision+1,updated_at=now() where id=team;
  return public.get_collaborative_map(team);
end; $$;

create or replace function public.manage_collaborative_map(team_id uuid, details jsonb default '{}', hide boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_data jsonb; next_data jsonb; field text; field_value text; changed boolean=false;
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  select map_data into current_data from public.collaborative_maps where id=team_id for update;
  next_data=current_data;
  if details is null or jsonb_typeof(details)<>'object' then raise exception 'invalid-details'; end if;
  foreach field in array array['name','description','category','deadline','planMode','planPausedUntil'] loop
    if details ? field then
      if jsonb_typeof(details->field)<>'string' then raise exception 'invalid-details'; end if;
      field_value=details->>field;
      if length(field_value)>3000 or (field='name' and length(trim(field_value))=0) then raise exception 'invalid-details'; end if;
      next_data=jsonb_set(next_data,array[field],to_jsonb(field_value));
    end if;
  end loop;
  if hide is not null then
    update public.collaborative_members set hidden=hide where map_id=team_id and user_id=auth.uid() and hidden is distinct from hide;
    changed=found;
  end if;
  if changed or next_data is distinct from current_data then
    update public.collaborative_maps set map_data=next_data,revision=revision+1,updated_at=now() where id=team_id;
  end if;
  return public.get_collaborative_map(team_id);
end; $$;
revoke all on function public.manage_collaborative_map(uuid,jsonb,boolean) from public,anon;
grant execute on function public.manage_collaborative_map(uuid,jsonb,boolean) to authenticated;
commit;
