-- Push notifications for new houses added to a vacation.
-- All participants (except the person who added the house) get notified.
-- iPhone: the server sends via Apple's push service (Edge Function push-houses).
-- Android: not yet (phones poll or local only).
-- Registered via register_push_device(); iOS needs APNS_KEY_P8/APNS_KEY_ID/APNS_TEAM_ID secrets.

-- Devices that can receive pushes.
create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  apns_token text unique,            -- iOS: device token for Apple's push service
  secret_hash text unique,           -- Android: SHA-256 of the secret the phone asks with
  environment text check (environment in ('production', 'sandbox')),  -- iOS: learned on first send
  tz text not null,
  locale text not null default 'de',
  updated_at timestamptz not null default now(),
  check ((platform = 'ios') = (apns_token is not null) and (platform = 'android') = (secret_hash is not null))
);
alter table public.push_devices enable row level security;

-- Sent messages, so we never send twice.
create table public.push_sent (
  device_id uuid not null references public.push_devices (id) on delete cascade,
  kind text not null,
  local_date date not null,
  sent_at timestamptz not null default now(),
  primary key (device_id, kind, local_date)
);
alter table public.push_sent enable row level security;

-- One row per new house per vacation member who should be notified.
create table public.push_events (
  id uuid primary key default gen_random_uuid(),
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  house_title text not null,
  added_by uuid not null references public.profiles (id) on delete cascade,
  added_by_name text,
  created_at timestamptz not null default now()
);
alter table public.push_events enable row level security;

-- Register / update this phone. Called by the app at start and when settings change.
-- Returns {server: true} when the server now handles pushes for this phone.
create or replace function public.register_push_device(
  p_platform text, p_token text, p_tz text, p_locale text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_platform not in ('ios', 'android') or length(coalesce(p_token, '')) < 32 then
    raise exception 'bad_device' using errcode = '22023';
  end if;
  if p_platform = 'ios' then
    insert into public.push_devices (user_id, platform, apns_token, tz, locale)
    values (auth.uid(), 'ios', p_token, p_tz, left(coalesce(p_locale, 'de'), 2))
    on conflict (apns_token) do update set user_id = excluded.user_id, tz = excluded.tz,
      locale = excluded.locale, updated_at = now();
  else
    insert into public.push_devices (user_id, platform, secret_hash, tz, locale)
    values (auth.uid(), 'android', v_hash, p_tz, left(coalesce(p_locale, 'de'), 2))
    on conflict (secret_hash) do update set user_id = excluded.user_id, tz = excluded.tz,
      locale = excluded.locale, updated_at = now();
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- iPhone: house-addition notifications due now. Called by the Edge Function push-houses.
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
  for d in select * from public.push_devices where platform = 'ios' loop
    v_local := p_now at time zone d.tz;

    -- Only during the day (08:00–21:00 local).
    if v_local::time < '08:00' or v_local::time >= '21:00' then
      continue;
    end if;

    -- Not sent to this device yet.
    if exists (
      select 1 from public.push_sent s
      where s.device_id = d.id and s.kind = 'house' and s.local_date = v_local::date
    ) then
      continue;
    end if;

    -- New houses in this phone's vacations, added by someone else, not yet sent.
    for e in select pe.id, pe.property_id, pe.house_title, pe.added_by, pe.added_by_name, pe.created_at,
                     p.title, p.url, pe.vacation_id
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
        'show', true,
        'title', case when d.locale = 'en' then 'New holiday home' else 'Neues Ferienhaus' end,
        'body', case when d.locale = 'en'
          then coalesce(e.added_by_name, 'Someone') || ' added "' || coalesce(e.house_title, e.property_id::text) || '" to "' || v_vac.name || '".'
          else coalesce(e.added_by_name, 'Jemand') || ' hat "' || coalesce(e.house_title, e.property_id::text) || '" zu "' || v_vac.name || '" hinzugefügt.'
        end
      );
      v_out := v_out || jsonb_build_object(
        'device_id', d.id, 'token', d.apns_token, 'environment', d.environment,
        'kind', 'house:' || e.id, 'local_date', v_local::date,
        'title', v_msg ->> 'title', 'body', v_msg ->> 'body',
        'route', '/vacations/' || e.vacation_id
      );
    end loop;
  end loop;
  return v_out;
end $$;

revoke all on function public.register_push_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;
revoke all on function public.push_due_house(timestamptz) from public, anon, authenticated;
grant execute on function public.push_due_house(timestamptz) to service_role;

-- After sending: remember it (no second time today), learn the environment; or forget a dead token.
create or replace function public.push_mark_sent(p_device uuid, p_kind text, p_date date, p_environment text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_sent (device_id, kind, local_date) values (p_device, p_kind, p_date) on conflict do nothing;
  update public.push_devices set environment = coalesce(p_environment, environment) where id = p_device;
  delete from public.push_sent where sent_at < now() - interval '7 days';
$$;
create or replace function public.push_forget_device(p_device uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.push_devices where id = p_device;
$$;
revoke all on function public.push_mark_sent(uuid, text, date, text), public.push_forget_device(uuid) from public, anon, authenticated;
grant execute on function public.push_mark_sent(uuid, text, date, text), public.push_forget_device(uuid) to service_role;
