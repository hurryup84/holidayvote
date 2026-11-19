-- Per-device / per-vacation push notification settings.
-- Each phone can disable notifications in general (client-side, app_kv) and per vacation (this table).
-- push_due_house skips device-vacation combos where enabled = false.

create table public.push_notification_settings (
  device_id uuid not null references public.push_devices (id) on delete cascade,
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  enabled boolean not null default true,
  primary key (device_id, vacation_id)
);
alter table public.push_notification_settings enable row level security;

-- Only the device's owner may read / write that device's settings.
create policy push_notification_settings_select on public.push_notification_settings for select to authenticated
  using (exists (
    select 1 from public.push_devices d where d.id = device_id and d.user_id = auth.uid()
  ));
create policy push_notification_settings_insert on public.push_notification_settings for insert to authenticated
  with check (exists (
    select 1 from public.push_devices d where d.id = device_id and d.user_id = auth.uid()
  ));
create policy push_notification_settings_update on public.push_notification_settings for update to authenticated
  using (exists (
    select 1 from public.push_devices d where d.id = device_id and d.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.push_devices d where d.id = device_id and d.user_id = auth.uid()
  ));
create policy push_notification_settings_delete on public.push_notification_settings for delete to authenticated
  using (exists (
    select 1 from public.push_devices d where d.id = device_id and d.user_id = auth.uid()
  ));

grant select, insert, update, delete on public.push_notification_settings to authenticated;

-- register_push_device now also returns this phone's device id.
create or replace function public.register_push_device(
  p_platform text, p_token text, p_tz text, p_locale text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  v_device uuid;
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
      locale = excluded.locale, updated_at = now()
    returning id into v_device;
  else
    insert into public.push_devices (user_id, platform, secret_hash, fcm_token, tz, locale)
    values (auth.uid(), 'android', v_hash, p_token, p_tz, left(coalesce(p_locale, 'de'), 2))
    on conflict (secret_hash) do update set user_id = excluded.user_id, fcm_token = excluded.fcm_token,
      tz = excluded.tz, locale = excluded.locale, updated_at = now()
    returning id into v_device;
  end if;
  return jsonb_build_object('ok', true, 'device_id', v_device);
end $$;

-- Skip vacations this device has opted out of.
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

    -- Only during the day (08:00–21:00 local).
    if v_local::time < '08:00' or v_local::time >= '21:00' then
      continue;
    end if;

    -- Not sent to this device yet today.
    if exists (
      select 1 from public.push_sent s
      where s.device_id = d.id and s.kind = 'house' and s.local_date = v_local::date
    ) then
      continue;
    end if;

    -- New houses in this phone's vacations, added by someone else, not yet sent,
    -- and not disabled for this device + vacation.
    for e in select pe.*
              from public.push_events pe
              join public.properties p on p.id = pe.property_id
             where pe.vacation_id in (
               select m.vacation_id from public.vacation_members m
               where m.user_id = d.user_id
             )
               and pe.added_by is distinct from d.user_id
               and not exists (
                 select 1 from public.push_notification_settings s
                 where s.device_id = d.id
                   and s.vacation_id = pe.vacation_id
                   and s.enabled = false
               )
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

revoke all on function public.push_due_house(timestamptz) from public, anon, authenticated;
grant execute on function public.push_due_house(timestamptz) to service_role;

revoke all on function public.register_push_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;

-- This phone's registered push device id (null if not registered).
create or replace function public.push_device_id()
returns uuid language sql security definer set search_path = public as $$
  select id from public.push_devices where user_id = auth.uid() order by updated_at desc limit 1
$$;

-- Enable / disable notifications for one vacation on this device.
create or replace function public.set_push_notification_setting(
  p_device_id uuid, p_vacation_id uuid, p_enabled boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.push_devices d where d.id = p_device_id and d.user_id = auth.uid()
  ) then
    raise exception 'no_device' using errcode = '22023';
  end if;
  insert into public.push_notification_settings (device_id, vacation_id, enabled)
  values (p_device_id, p_vacation_id, p_enabled)
  on conflict (device_id, vacation_id) do update set enabled = p_enabled;
  return jsonb_build_object('ok', true);
end $$;

-- List this device's per-vacation settings.
create or replace function public.get_push_notification_settings(
  p_device_id uuid
) returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'vacation_id', vacation_id, 'enabled', enabled
  )), '[]'::jsonb)
  from public.push_notification_settings s
  where s.device_id = p_device_id
    and exists (
      select 1 from public.push_devices d where d.id = s.device_id and d.user_id = auth.uid()
    )
$$;

-- Unregister this phone (delete device + its settings).
create or replace function public.unregister_push_device(
  p_device_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.push_devices d where d.id = p_device_id and d.user_id = auth.uid()
  ) then
    raise exception 'no_device' using errcode = '22023';
  end if;
  delete from public.push_devices where id = p_device_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.push_device_id() from public, anon, authenticated;
grant execute on function public.push_device_id() to authenticated;
revoke all on function public.set_push_notification_setting(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_push_notification_setting(uuid, uuid, boolean) to authenticated;
revoke all on function public.get_push_notification_settings(uuid) from public, anon, authenticated;
grant execute on function public.get_push_notification_settings(uuid) to authenticated;
revoke all on function public.unregister_push_device(uuid) from public, anon, authenticated;
grant execute on function public.unregister_push_device(uuid) to authenticated;
