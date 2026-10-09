begin;

-- Keep the wire format, but hash each history entry only once. In particular,
-- do not repeatedly index a JSON array of hashes while copying large snapshots.
create or replace function public.map_sync_fields(value jsonb, known jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare hashes jsonb; changes jsonb; history_hashes jsonb; history_items jsonb;
  history jsonb=value->'versions'; known_history jsonb=coalesce(known->'versions','[]');
begin
  with fields as materialized (
    select key,v,md5(v::text) as digest
    from jsonb_each(case when jsonb_typeof(history)='array' then value-'versions' else value end) f(key,v)
  )
  select coalesce(jsonb_object_agg(key,digest),'{}'),
    coalesce(jsonb_object_agg(key,v) filter(where known->>key is distinct from digest),'{}')
  into hashes,changes from fields;
  if jsonb_typeof(history)='array' then
    with entries as materialized (
      select item,n,md5(item::text) as digest from jsonb_array_elements(history) with ordinality a(item,n)
    )
    select coalesce(jsonb_agg(digest order by n),'[]'),
      coalesce(jsonb_object_agg(digest,item) filter(where not (known_history ? digest)),'{}')
    into history_hashes,history_items from entries;
    hashes=jsonb_set(hashes,'{versions}',history_hashes);
    if history_hashes is distinct from known->'versions' then
      changes=jsonb_set(changes,'{versions}',history_items);
    end if;
  end if;
  return jsonb_build_object('fields',hashes,'data',changes);
end; $$;
revoke all on function public.map_sync_fields(jsonb,jsonb) from public,anon,authenticated;

-- A participant's card position belongs to their account, not the shared drawing.
alter table public.collaborative_members add column card_order integer;
alter table public.collaborative_members add column preference_revision bigint not null default 0;

create or replace function public.save_collaborative_card_order(team_id uuid, card_position integer, expected_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member public.collaborative_members;
begin
  if auth.uid() is null or expected_owner is distinct from auth.uid() then raise exception 'account-changed'; end if;
  if card_position is null then raise exception 'invalid-card-position'; end if;
  select * into member from public.collaborative_members where map_id=team_id and user_id=auth.uid() for update;
  if member.user_id is null then raise exception 'not-a-member'; end if;
  if member.card_order is distinct from card_position then
    update public.collaborative_members set card_order=card_position,preference_revision=preference_revision+1
      where map_id=team_id and user_id=auth.uid() returning * into member;
    begin
      perform realtime.send('{}'::jsonb,'maps-changed','account-maps:'||auth.uid()::text,false);
    exception when others then raise warning 'Map notification unavailable'; end;
  end if;
  return jsonb_build_object('card_order',member.card_order,'member_revision',member.preference_revision);
end; $$;
revoke all on function public.save_collaborative_card_order(uuid,integer,uuid) from public,anon;
grant execute on function public.save_collaborative_card_order(uuid,integer,uuid) to authenticated;

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
      'card_order',me.card_order,'member_revision',me.preference_revision,
      'invite_token',case when m.owner_id=auth.uid() and m.invites_enabled then m.invite_token else null end,
      'patch',public.map_sync_fields(m.map_data,known_shared->m.id::text->'fields'), 'claims',m.claims,
      'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by joined_at),'[]') from public.collaborative_members where map_id=m.id),
      'events',case when m.id=history_team then (select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from
        (select id,actor_id,changes,created_at,kind,version_hidden from public.collaborative_events where map_id=m.id order by id desc limit 1000)e) else null end))
      filter(where known_shared->m.id::text->>'revision' is distinct from m.revision::text
        or known_shared->m.id::text->>'memberRevision' is distinct from me.preference_revision::text
        or (m.id=history_team and known_shared->m.id::text->>'historyRevision' is distinct from m.revision::text)),'[]'))
    into teams from public.collaborative_maps m join public.collaborative_members me on me.map_id=m.id and me.user_id=auth.uid();
  return jsonb_build_object('personal',personal,'shared',teams);
end; $$;

create or replace function public.get_collaborative_map(team_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_collaborative_member(team_id) then raise exception 'not-a-member'; end if;
  return (select jsonb_build_object('id',m.id,'owner_id',m.owner_id,'map_data',m.map_data,'claims',m.claims,'revision',m.revision,
    'hidden',me.hidden,'card_order',me.card_order,'member_revision',me.preference_revision,
    'invite_token',case when m.owner_id=auth.uid() and m.invites_enabled then m.invite_token else null end,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by joined_at),'[]') from public.collaborative_members where map_id=m.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from (select id,actor_id,changes,created_at,kind,version_hidden from public.collaborative_events where map_id=m.id order by id desc limit 1000)e))
    from public.collaborative_maps m join public.collaborative_members me on me.map_id=m.id and me.user_id=auth.uid() where m.id=team_id);
end; $$;

commit;
