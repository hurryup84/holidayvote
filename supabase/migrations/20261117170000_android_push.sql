-- Push devices are server-only. Legacy Android hashes cannot be reversed; those phones
-- become eligible for delivery after registering again with their actual FCM token.
alter table public.push_devices add column fcm_token text unique;
alter table public.push_devices add constraint push_devices_fcm_platform
  check (fcm_token is null or platform = 'android');

create or replace function public.register_push_device(
  p_platform text, p_token text, p_tz text, p_locale text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') or length(coalesce(p_token, '')) < 32 then
    raise exception 'bad_device' using errcode = '22023';
  end if;
  if p_platform = 'ios' then
    insert into public.push_devices (user_id, platform, apns_token, tz, locale)
    values (auth.uid(), 'ios', p_token, p_tz, left(coalesce(p_locale, 'de'), 2))
    on conflict (apns_token) do update set user_id = excluded.user_id, tz = excluded.tz,
      locale = excluded.locale, updated_at = now();
  else
    insert into public.push_devices (user_id, platform, secret_hash, fcm_token, tz, locale)
    values (auth.uid(), 'android', v_hash, p_token, p_tz, left(coalesce(p_locale, 'de'), 2))
    on conflict (secret_hash) do update set user_id = excluded.user_id, fcm_token = excluded.fcm_token,
      tz = excluded.tz, locale = excluded.locale, updated_at = now();
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.push_due_house(p_now timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_out jsonb := '[]'::jsonb;
  d public.push_devices;
  e public.push_events;
  v_local timestamp;
  v_msg jsonb;
  v_vac public.vacations;
begin
  for d in select * from public.push_devices
    where platform = 'ios' or (platform = 'android' and fcm_token is not null)
  loop
    v_local := p_now at time zone d.tz;

    if v_local::time < '08:00' or v_local::time >= '21:00' then
      continue;
    end if;

    if exists (
      select 1 from public.push_sent s
      where s.device_id = d.id and s.kind = 'house' and s.local_date = v_local::date
    ) then
      continue;
    end if;

    for e in select pe.*
              from public.push_events pe
              join public.properties p on p.id = pe.property_id
             where pe.vacation_id in (
               select m.vacation_id from public.vacation_members m
               where m.user_id = d.user_id
             )
               and pe.added_by is distinct from d.user_id
               and not exists (
                 select 1 from public.push_sent s
                 where s.device_id = d.id and s.kind = 'house:' || pe.id
               )
              order by pe.created_at
    loop
      select * into v_vac from public.vacations where id = e.vacation_id;
      v_msg := jsonb_build_object(
        'title', case when d.locale = 'en' then 'New holiday home' else 'Neues Ferienhaus' end,
        'body', case when d.locale = 'en'
          then coalesce(e.added_by_name, 'Someone') || ' added "' || coalesce(e.house_title, e.property_id::text) || '" to "' || v_vac.name || '".'
          else coalesce(e.added_by_name, 'Jemand') || ' hat "' || coalesce(e.house_title, e.property_id::text) || '" zu "' || v_vac.name || '" hinzugefügt.'
        end
      );
      v_out := v_out || jsonb_build_object(
        'device_id', d.id, 'platform', d.platform,
        'token', case when d.platform = 'ios' then d.apns_token else d.fcm_token end,
        'environment', d.environment,
        'kind', 'house:' || e.id, 'local_date', v_local::date,
        'title', v_msg ->> 'title', 'body', v_msg ->> 'body',
        'route', '/vacations/' || e.vacation_id || '/houses/' || e.property_id
      );
    end loop;
  end loop;
  return v_out;
end $$;

revoke all on function public.register_push_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;
revoke all on function public.push_due_house(timestamptz) from public, anon, authenticated;
grant execute on function public.push_due_house(timestamptz) to service_role;
