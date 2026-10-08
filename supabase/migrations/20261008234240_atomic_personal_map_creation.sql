-- Creating from an offline cache must never overwrite an existing map. A racing
-- creation is retried by fetching the canonical row and replaying local edits.
create or replace function public.create_personal_map(map_id text, map_name text, map_data jsonb, expected_owner uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.maps; target public.maps;
begin
  if auth.uid() is null or expected_owner is distinct from auth.uid() then raise exception 'account-changed'; end if;
  target := jsonb_populate_record(null::public.maps, jsonb_build_object('id', map_id));
  insert into public.maps(id, user_id, name, data) values(target.id, auth.uid(), map_name, map_data)
    on conflict(id) do nothing returning * into saved;
  if saved.id is null then raise exception 'sync-conflict' using errcode = '40001'; end if;
  return public.save_personal_map(map_id, map_name, map_data, expected_owner);
end;
$$;
revoke all on function public.create_personal_map(text,text,jsonb,uuid) from public,anon;
grant execute on function public.create_personal_map(text,text,jsonb,uuid) to authenticated;
