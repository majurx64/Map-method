-- Avoid speculative insertion and a second large TOAST write for an existing
-- map. Keep the account check and revision trigger for every accepted change.
create or replace function public.save_personal_map(map_id text, map_name text, map_data jsonb, expected_owner uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare input public.maps; saved public.maps; hashes jsonb;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if expected_owner is not null and expected_owner<>auth.uid() then raise exception 'account-changed'; end if;
  input=jsonb_populate_record(null::public.maps,jsonb_build_object('id',map_id));
  select * into saved from public.maps where id=input.id for update;
  if found then
    if saved.user_id is distinct from auth.uid() then raise exception 'not-owner'; end if;
    if saved.name is distinct from map_name or saved.data is distinct from map_data then
      update public.maps set name=map_name,data=map_data where id=input.id and user_id=auth.uid() returning * into saved;
    end if;
  else
    insert into public.maps(id,user_id,name,data) values(input.id,auth.uid(),map_name,map_data)
      on conflict(id) do update set name=excluded.name,data=excluded.data where public.maps.user_id=auth.uid()
      returning * into saved;
    if saved.id is null then raise exception 'not-owner'; end if;
  end if;
  -- The receipt needs hashes only, not the full changed-field payload. Hashes
  -- are byte-for-byte compatible with map_sync_fields, including version order.
  select coalesce(jsonb_object_agg(f.key,case
    when f.key='versions' and jsonb_typeof(f.value)='array' then
      (select coalesce(jsonb_agg(md5(v::text) order by n),'[]'::jsonb)
        from jsonb_array_elements(f.value) with ordinality as versions(v,n))
    else to_jsonb(md5(f.value::text)) end),'{}'::jsonb)
    into hashes from jsonb_each(saved.data) f;
  return jsonb_build_object('id',saved.id,'sync_revision',saved.sync_revision,'created_at',saved.created_at,'updated_at',saved.updated_at,'fields',hashes);
end; $$;
revoke all on function public.save_personal_map(text,text,jsonb,uuid) from public,anon;
grant execute on function public.save_personal_map(text,text,jsonb,uuid) to authenticated;
