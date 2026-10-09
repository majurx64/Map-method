begin;

-- Fetch the small account index first, then only changed maps. Large histories
-- must not force every device through one database statement/encoding timeout.
create or replace function public.sync_map_manifest(known_private jsonb default '{}', known_shared jsonb default '{}', history_team uuid default null, expected_owner uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare personal jsonb; shared jsonb;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if expected_owner is distinct from auth.uid() then raise exception 'account-changed'; end if;
  select jsonb_build_object('ids',coalesce(jsonb_agg(m.id order by m.created_at),'[]'),
    'changed',coalesce(jsonb_agg(m.id) filter(where known_private->m.id::text->>'revision' is distinct from m.sync_revision::text),'[]'))
  into personal from public.maps m where m.user_id=auth.uid();
  select jsonb_build_object('ids',coalesce(jsonb_agg(m.id order by me.joined_at),'[]'),
    'changed',coalesce(jsonb_agg(m.id) filter(where known_shared->m.id::text->>'revision' is distinct from m.revision::text
      or known_shared->m.id::text->>'memberRevision' is distinct from me.preference_revision::text
      or (m.id=history_team and known_shared->m.id::text->>'historyRevision' is distinct from m.revision::text)),'[]'))
  into shared from public.collaborative_maps m join public.collaborative_members me on me.map_id=m.id and me.user_id=auth.uid();
  return jsonb_build_object('personal',personal,'shared',shared);
end; $$;
revoke all on function public.sync_map_manifest(jsonb,jsonb,uuid,uuid) from public,anon;
grant execute on function public.sync_map_manifest(jsonb,jsonb,uuid,uuid) to authenticated;

create or replace function public.sync_map_page(private_id uuid default null, shared_id uuid default null, known_fields jsonb default '{}', history_team uuid default null, expected_owner uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare personal public.maps; team public.collaborative_maps; member public.collaborative_members; patch jsonb; members jsonb; events jsonb;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if expected_owner is distinct from auth.uid() then raise exception 'account-changed'; end if;
  if (private_id is null)=(shared_id is null) then raise exception 'invalid-map-page'; end if;
  if private_id is not null then
    select * into personal from public.maps where id=private_id and user_id=auth.uid();
    if personal.id is null then return null; end if;
    patch=public.map_sync_fields(personal.data,known_fields);
    return jsonb_build_object('id',personal.id,'user_id',personal.user_id,'name',personal.name,'created_at',personal.created_at,
      'updated_at',personal.updated_at,'sync_revision',personal.sync_revision,'patch',patch);
  end if;
  select * into member from public.collaborative_members where map_id=shared_id and user_id=auth.uid();
  if member.user_id is null then return null; end if;
  select * into team from public.collaborative_maps where id=shared_id;
  if team.id is null then return null; end if;
  patch=public.map_sync_fields(team.map_data,known_fields);
  select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by joined_at),'[]') into members
    from public.collaborative_members where map_id=shared_id;
  if shared_id=history_team then
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into events from
      (select id,actor_id,changes,created_at,kind,version_hidden from public.collaborative_events where map_id=shared_id order by id desc limit 1000)e;
  end if;
  return jsonb_build_object('id',team.id,'owner_id',team.owner_id,'revision',team.revision,'hidden',member.hidden,
    'card_order',member.card_order,'member_revision',member.preference_revision,
    'invite_token',case when team.owner_id=auth.uid() and team.invites_enabled then team.invite_token else null end,
    'patch',patch,'claims',team.claims,'members',members,'events',events);
end; $$;
revoke all on function public.sync_map_page(uuid,uuid,jsonb,uuid,uuid) from public,anon;
grant execute on function public.sync_map_page(uuid,uuid,jsonb,uuid,uuid) to authenticated;

commit;
