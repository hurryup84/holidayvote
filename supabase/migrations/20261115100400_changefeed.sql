-- Own sync, the same as Esstisch (concept/02_architecture.md § 5).
--
-- The phones keep a full SQLite copy of their vacations. They
--   * upload local changes with normal PostgREST upserts / deletes (row-level security applies), and
--   * download changes with ONE call: sync_pull(cursors).
--
-- Every synced row carries `sync_xid` = id of the transaction that last wrote it. sync_pull returns
-- the rows with sync_xid >= the client's cursor and a new cursor = xmin of the current snapshot, so no
-- change is skipped even if transactions commit out of order (some rows may come twice – ignored).
-- Hard deletes are recorded in sync_deletes. Realtime: one empty Broadcast message per transaction
-- and vacation on the private channel "vacation:<id>"; the app then pulls (and polls every minute).

-- 1. change stamp ------------------------------------------------------------------------------
create or replace function public.stamp_sync_xid()
returns trigger language plpgsql as $$
begin
  new.sync_xid := pg_current_xact_id()::text::bigint;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'vacations', 'vacation_members', 'properties', 'votes', 'vetoes', 'favorites', 'comments'] loop
    execute format('alter table public.%I add column if not exists sync_xid bigint not null default 0', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.stamp_sync_xid()',
                   t || '_sync_xid', t);
  end loop;
  foreach t in array array['properties', 'votes', 'vetoes', 'favorites', 'comments'] loop
    execute format('create index %I on public.%I (vacation_id, sync_xid)', t || '_sync_idx', t);
  end loop;
end $$;

-- 2. hard deletes ------------------------------------------------------------------------------
create table public.sync_deletes (
  id bigint generated always as identity primary key,
  vacation_id uuid not null,
  tbl text not null,
  row_id uuid not null,
  sync_xid bigint not null default pg_current_xact_id()::text::bigint,
  deleted_at timestamptz not null default now()
);
create index sync_deletes_vacation_idx on public.sync_deletes (vacation_id, sync_xid);
alter table public.sync_deletes enable row level security;
create policy sync_deletes_select on public.sync_deletes for select to authenticated using (public.is_member(vacation_id));
grant select on public.sync_deletes to authenticated;

create or replace function public.log_sync_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.sync_deletes (vacation_id, tbl, row_id)
  values (coalesce((to_jsonb(old) ->> 'vacation_id')::uuid, old.id), tg_table_name, old.id);
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['vacations', 'properties', 'votes', 'vetoes', 'favorites', 'comments'] loop
    execute format('create trigger %I after delete on public.%I for each row execute function public.log_sync_delete()',
                   t || '_sync_delete', t);
  end loop;
end $$;

-- Deletion records are kept 60 days (cron). A phone whose cursor is older gets a full copy instead.
insert into public.app_config (key, value) values ('sync_deletes_purged_xid', '0') on conflict (key) do nothing;

create or replace function public.purge_sync_deletes()
returns void language plpgsql security definer set search_path = public as $$
declare v_max bigint;
begin
  select max(sync_xid) into v_max from public.sync_deletes where deleted_at < now() - interval '60 days';
  if v_max is null then return; end if;
  delete from public.sync_deletes where sync_xid <= v_max;
  update public.app_config set value = to_jsonb(v_max + 1) where key = 'sync_deletes_purged_xid';
  delete from public.sync_ticks k where not exists (select 1 from public.vacations v where v.id = k.vacation_id);
end $$;
revoke all on function public.purge_sync_deletes() from public, anon, authenticated;

-- 3. realtime "something changed" signal (Broadcast from Database) -------------------------------
-- No foreign key on purpose: rows deleted by a cascading delete still bump it.
create table public.sync_ticks (
  vacation_id uuid primary key,
  at timestamptz not null default now(),
  xid bigint not null default 0
);
alter table public.sync_ticks enable row level security;

-- One message per transaction and vacation: the first row of a transaction stores its id; every further
-- row of it finds it there and sends nothing (importing 50 rows = 1 message).
create or replace function public.bump_sync_tick()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  v uuid := case when tg_table_name = 'vacations' then (r ->> 'id')::uuid else (r ->> 'vacation_id')::uuid end;
  x bigint := pg_current_xact_id()::text::bigint;
  n int;
begin
  if v is null then
    return null;
  end if;
  insert into public.sync_ticks as k (vacation_id, at, xid) values (v, now(), x)
  on conflict (vacation_id) do update set at = excluded.at, xid = excluded.xid where k.xid <> excluded.xid;
  get diagnostics n = row_count;
  if n > 0 then
    begin
      -- No content: the app only learns "something changed" and pulls with its own rights.
      perform realtime.send('{}'::jsonb, 'changed', 'vacation:' || v::text, true);
    exception when others then
      -- The signal is a nicety – a Realtime hiccup must never undo the user's change.
      raise warning 'realtime.send failed for vacation %: %', v, sqlerrm;
    end;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['vacations', 'vacation_members', 'properties', 'votes', 'vetoes', 'favorites', 'comments'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.bump_sync_tick()',
                   t || '_sync_tick', t);
  end loop;
end $$;

-- Who may listen: topic "vacation:<uuid>" → member of that vacation (not banned).
create or replace function public.can_listen_to_topic(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_topic ~ '^vacation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_member(substr(p_topic, 10)::uuid)
    else false
  end;
$$;
revoke all on function public.can_listen_to_topic(text) from public, anon;
grant execute on function public.can_listen_to_topic(text) to authenticated;

drop policy if exists holidayvote_vacation_signal_receive on realtime.messages;
create policy holidayvote_vacation_signal_receive on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_listen_to_topic((select realtime.topic())));
-- No insert policy: clients can't send on these channels, only the database does.

-- 4. download ----------------------------------------------------------------------------------
-- p_cursors: {"<vacation id>": <cursor>, …} as returned by the previous call (missing = everything).
-- Runs with the caller's rights: row-level security decides what is returned.
create or replace function public.sync_pull(p_cursors jsonb default '{}'::jsonb)
returns jsonb language plpgsql
set search_path = public
set timezone = 'UTC'
as $$
declare
  v_uid uuid := auth.uid();
  v_horizon bigint := pg_snapshot_xmin(pg_current_snapshot())::text::bigint;
  v_purged bigint := coalesce((select value::text::bigint from public.app_config where key = 'sync_deletes_purged_xid'), 0);
  v_out jsonb := '{}'::jsonb;
  v uuid;
  c bigint;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  for v in
    select m.vacation_id from public.vacation_members m
    where m.user_id = v_uid and public.is_member(m.vacation_id)
  loop
    c := coalesce((p_cursors ->> v::text)::bigint, 0);
    v_out := v_out || jsonb_build_object(v::text, jsonb_build_object(
      -- cursor older than the kept deletion records: the app replaces its copy of this vacation
      'full', c > 0 and c < v_purged,
      'rows', jsonb_build_object(
        'vacations', (select coalesce(jsonb_agg(to_jsonb(x) - 'sync_xid'), '[]') from public.vacations x
                      where x.id = v and (x.sync_xid >= c or c < v_purged)),
        'properties', (select coalesce(jsonb_agg(to_jsonb(x) - 'sync_xid'), '[]') from public.properties x
                      where x.vacation_id = v and (x.sync_xid >= c or c < v_purged)),
        'votes', (select coalesce(jsonb_agg(to_jsonb(x) - 'sync_xid'), '[]') from public.votes x
                      where x.vacation_id = v and (x.sync_xid >= c or c < v_purged)),
        'vetoes', (select coalesce(jsonb_agg(to_jsonb(x) - 'sync_xid'), '[]') from public.vetoes x
                      where x.vacation_id = v and (x.sync_xid >= c or c < v_purged)),
        'favorites', (select coalesce(jsonb_agg(to_jsonb(x) - 'sync_xid'), '[]') from public.favorites x
                      where x.vacation_id = v and (x.sync_xid >= c or c < v_purged)),
        'comments', (select coalesce(jsonb_agg(to_jsonb(x) - 'sync_xid'), '[]') from public.comments x
                      where x.vacation_id = v and (x.sync_xid >= c or c < v_purged))
      ),
      'deletes', case when c = 0 or c < v_purged then '[]'::jsonb else (
        select coalesce(jsonb_agg(jsonb_build_array(d.tbl, d.row_id)), '[]') from public.sync_deletes d
        where d.vacation_id = v and d.sync_xid >= c) end
    ));
  end loop;

  return jsonb_build_object(
    'cursor', v_horizon,
    'profile', (select to_jsonb(p) - 'sync_xid' - 'terms_accepted_at' - 'terms_version' - 'banned_at'
                from public.profiles p where p.id = v_uid),
    -- own memberships + the members of my vacations; small, always complete
    'members', (select coalesce(jsonb_agg(to_jsonb(m) - 'sync_xid'), '[]') from public.vacation_members m),
    'vacations', v_out
  );
end $$;

revoke all on function public.sync_pull(jsonb) from public, anon;
grant execute on function public.sync_pull(jsonb) to authenticated;
