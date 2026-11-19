-- Push notifications for new comments on a house.
-- When a comment is added, notify all other vacation members.
-- The per-vacation notification settings (push_notification_settings) apply to comment events too.

-- Distinguish house-added and comment-added events.
alter table public.push_events add column if not exists kind text not null default 'house';
alter table public.push_events add column if not exists comment_text text;

-- When a comment is added, create a push event for every other vacation member.
create or replace function public.note_comment_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_by uuid := coalesce(auth.uid(), new.created_by);
  v_name text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select display_name into v_name from public.profiles where id = v_by;

  insert into public.push_events (vacation_id, property_id, house_title, comment_text, added_by, added_by_name, kind)
  select new.vacation_id, new.property_id,
         coalesce((select title from public.properties where id = new.property_id), new.property_id::text),
         new.text,
         v_by, v_name,
         'comment'
    from public.vacation_members m
   where m.vacation_id = new.vacation_id
     and m.user_id is distinct from v_by
     and exists (select 1 from public.profiles p where p.id = m.user_id and p.banned_at is null);

  return new;
end $$;

create trigger comments_comment_added
  after insert on public.comments
  for each row execute function public.note_comment_added();

revoke all on function public.note_comment_added() from public, anon, authenticated;

-- Handle comment events in the due-push query: different title/body, separate kind key.
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

    -- New houses / comments in this phone's vacations, added by someone else, not yet sent,
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
                 where s.device_id = d.id and s.kind = coalesce(pe.kind, 'house') || ':' || pe.id
               )
              order by pe.created_at
    loop
      select * into v_vac from public.vacations where id = e.vacation_id;
      if coalesce(e.kind, 'house') = 'comment' then
        v_msg := jsonb_build_object(
          'title', case when d.locale = 'en' then 'New comment' else 'Neuer Kommentar' end,
          'body', case when d.locale = 'en'
            then coalesce(e.added_by_name, 'Someone') || ' commented on "' || coalesce(e.house_title, e.property_id::text) || '": "' || coalesce(e.comment_text, '') || '".'
            else coalesce(e.added_by_name, 'Jemand') || ' hat bei "' || coalesce(e.house_title, e.property_id::text) || '" kommentiert: "' || coalesce(e.comment_text, '') || '".'
          end
        );
      else
        v_msg := jsonb_build_object(
          'title', case when d.locale = 'en' then 'New holiday home' else 'Neues Ferienhaus' end,
          'body', case when d.locale = 'en'
            then coalesce(e.added_by_name, 'Someone') || ' added "' || coalesce(e.house_title, e.property_id::text) || '" to "' || v_vac.name || '".'
            else coalesce(e.added_by_name, 'Jemand') || ' hat "' || coalesce(e.house_title, e.property_id::text) || '" zu "' || v_vac.name || '" hinzugefügt.'
          end
        );
      end if;
      v_out := v_out || jsonb_build_object(
        'device_id', d.id, 'platform', d.platform,
        'token', case when d.platform = 'ios' then d.apns_token else d.fcm_token end,
        'environment', d.environment,
        'kind', coalesce(e.kind, 'house') || ':' || e.id,
        'local_date', v_local::date,
        'title', v_msg ->> 'title', 'body', v_msg ->> 'body',
        'route', '/vacations/' || e.vacation_id || '/houses/' || e.property_id
      );
    end loop;
  end loop;
  return v_out;
end $$;

revoke all on function public.push_due_house(timestamptz) from public, anon, authenticated;
grant execute on function public.push_due_house(timestamptz) to service_role;
