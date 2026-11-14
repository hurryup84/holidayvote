-- Helpers, triggers and RPCs. SECURITY DEFINER functions set search_path explicitly.
-- Trusted RPCs set app.trusted = on for their transaction; protected columns can only change then.

create or replace function public.config_value(k text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.app_config where key = k;
$$;

-- Banned accounts lose access to everything.
create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and banned_at is not null);
$$;

-- Is the current user a member of vacation v?
create or replace function public.is_member(v uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_banned() and exists (
    select 1 from public.vacation_members where vacation_id = v and user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(v uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vacation_members where vacation_id = v and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.trusted()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.trusted', true), '') = 'on';
$$;

-- updated_at is always set by the server.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'vacations', 'vacation_members', 'properties', 'votes', 'vetoes', 'favorites', 'comments'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- created_by never changes after the insert ("suggested by …" stays right when others edit).
create or replace function public.keep_created_by()
returns trigger language plpgsql as $$
begin
  if not public.trusted() then
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['vacations', 'properties', 'votes', 'vetoes', 'favorites', 'comments'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.keep_created_by()', t || '_keep_created_by', t);
  end loop;
end $$;

-- Profile: terms / ban fields only via our RPCs or the operator.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if not public.trusted() and auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.terms_accepted_at := null;
      new.terms_version := null;
      new.banned_at := null;
    else
      new.terms_accepted_at := old.terms_accepted_at;
      new.terms_version := old.terms_version;
      new.banned_at := old.banned_at;
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Vacation: the owner only changes through our RPCs (leave / recovery).
create or replace function public.protect_vacation_columns()
returns trigger language plpgsql as $$
begin
  if not public.trusted() and tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
  end if;
  return new;
end $$;
create trigger vacations_protect before insert or update on public.vacations
  for each row execute function public.protect_vacation_columns();

-- Creating a vacation makes the creator its owner (clients can't insert memberships directly).
create or replace function public.add_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.vacations where owner_id = new.owner_id)
     > coalesce(public.config_value('max_vacations_per_owner')::text::int, 50) then
    raise exception 'limit_vacations' using errcode = '23514';
  end if;
  insert into public.vacation_members (vacation_id, user_id, role, display_name)
  select new.id, new.owner_id, 'owner', p.display_name
  from public.profiles p where p.id = new.owner_id
  on conflict (vacation_id, user_id) do nothing;
  return new;
end $$;
create trigger vacations_owner_membership after insert on public.vacations
  for each row execute function public.add_owner_membership();

-- Keep the member display name copy in sync.
create or replace function public.copy_display_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.vacation_members set display_name = new.display_name
  where user_id = new.id and display_name is distinct from new.display_name;
  return new;
end $$;
create trigger profiles_display_name after insert or update of display_name on public.profiles
  for each row execute function public.copy_display_name();

-- Votes, vetoes, favourites and comments must point to a house of the same vacation.
create or replace function public.check_same_vacation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.properties where id = new.property_id and vacation_id = new.vacation_id) then
    raise exception 'property % is not part of vacation %', new.property_id, new.vacation_id using errcode = '23514';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['votes', 'vetoes', 'favorites', 'comments'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.check_same_vacation()', t || '_same_vacation', t);
  end loop;
end $$;

-- Houses: only the owner books / eliminates; only the owner or the person who suggested it deletes it.
-- Silently kept instead of an error: the rest of the change (e.g. a new price) still goes through.
create or replace function public.protect_property_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.trusted() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not public.is_owner(new.vacation_id) then new.status := 'active'; end if;
    if (select count(*) from public.properties where vacation_id = new.vacation_id)
       >= coalesce(public.config_value('max_properties_per_vacation')::text::int, 300) then
      raise exception 'limit_properties' using errcode = '23514';
    end if;
    return new;
  end if;
  new.vacation_id := old.vacation_id;
  if new.status is distinct from old.status and not public.is_owner(old.vacation_id) then
    new.status := old.status;
  end if;
  if new.deleted_at is distinct from old.deleted_at
     and not (public.is_owner(old.vacation_id) or old.created_by = auth.uid()) then
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end $$;
create trigger properties_protect before insert or update on public.properties
  for each row execute function public.protect_property_columns();

create or replace function public.limit_comments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.comments where vacation_id = new.vacation_id)
     >= coalesce(public.config_value('max_comments_per_vacation')::text::int, 3000) then
    raise exception 'limit_comments' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger comments_limit before insert on public.comments
  for each row execute function public.limit_comments();

-- Someone leaves / is removed: their stars, veto and favourite at that vacation go too (comments stay).
-- Account recovery moves the membership to the new account (user_id old → new): they move along.
create or replace function public.picks_follow_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.votes where vacation_id = old.vacation_id and user_id = old.user_id;
    delete from public.vetoes where vacation_id = old.vacation_id and user_id = old.user_id;
    delete from public.favorites where vacation_id = old.vacation_id and user_id = old.user_id;
    return old;
  end if;
  if new.user_id is distinct from old.user_id then
    update public.votes set user_id = new.user_id where vacation_id = new.vacation_id and user_id = old.user_id;
    update public.vetoes set user_id = new.user_id where vacation_id = new.vacation_id and user_id = old.user_id;
    update public.favorites set user_id = new.user_id where vacation_id = new.vacation_id and user_id = old.user_id;
  end if;
  return new;
end $$;
create trigger vacation_members_picks after delete or update of user_id on public.vacation_members
  for each row execute function public.picks_follow_member();

-- ---------- terms of use (UGC rules) ----------

create or replace function public.accept_terms(p_version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  perform set_config('app.trusted', 'on', true);
  insert into public.profiles (id, terms_accepted_at, terms_version)
  values (auth.uid(), now(), p_version)
  on conflict (id) do update set terms_accepted_at = now(), terms_version = p_version;
end $$;

create or replace function public.require_terms()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_banned() then
    raise exception 'banned' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and terms_accepted_at is not null) then
    raise exception 'terms_required' using errcode = 'P0001';
  end if;
end $$;

-- ---------- invites ----------

-- Short codes without ambiguous characters (no 0/O, 1/I/L).
create or replace function public.random_invite_code()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

create or replace function public.create_invite(p_vacation uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_expires timestamptz;
begin
  if auth.uid() is null or not public.is_member(p_vacation) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  perform public.require_terms();
  loop
    v_code := public.random_invite_code();
    begin
      insert into public.vacation_invites (vacation_id, code, created_by)
      values (p_vacation, v_code, auth.uid())
      returning expires_at into v_expires;
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end $$;

-- Joining is refused without accepted terms or if a block exists in either direction.
create or replace function public.check_join_allowed(p_vacation uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_terms();
  if exists (
    select 1 from public.vacation_members m
    join public.user_blocks b
      on (b.blocker_id = auth.uid() and b.blocked_id = m.user_id)
      or (b.blocked_id = auth.uid() and b.blocker_id = m.user_id)
    where m.vacation_id = p_vacation
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.accept_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv public.vacation_invites;
  v_vac public.vacations;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select * into v_inv from public.vacation_invites
  where code = upper(trim(p_code)) and revoked_at is null and expires_at > now() and uses < max_uses
  for update;
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  select * into v_vac from public.vacations where id = v_inv.vacation_id and deleted_at is null;
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.vacation_members where vacation_id = v_vac.id and user_id = auth.uid()) then
    return jsonb_build_object('vacation_id', v_vac.id, 'vacation_name', v_vac.name, 'status', 'already_member');
  end if;

  perform public.check_join_allowed(v_vac.id);

  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.vacation_members (vacation_id, user_id, role, display_name)
  values (v_vac.id, auth.uid(), 'member', v_name);
  update public.vacation_invites set uses = uses + 1 where id = v_inv.id;

  return jsonb_build_object('vacation_id', v_vac.id, 'vacation_name', v_vac.name, 'status', 'joined');
end $$;

-- ---------- leaving, removing, deleting ----------

-- Leave a vacation. The owner hands over to the longest-standing member; the last one deletes it.
create or replace function public.leave_vacation(p_vacation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_next uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  perform set_config('app.trusted', 'on', true);
  if public.is_owner(p_vacation) then
    select user_id into v_next from public.vacation_members
    where vacation_id = p_vacation and user_id <> auth.uid()
    order by joined_at
    limit 1;
    if v_next is null then
      delete from public.vacations where id = p_vacation; -- cascades to all its data
      return;
    end if;
    update public.vacation_members set role = 'owner' where vacation_id = p_vacation and user_id = v_next;
    update public.vacations set owner_id = v_next where id = p_vacation;
  end if;
  delete from public.vacation_members where vacation_id = p_vacation and user_id = auth.uid();
end $$;

create or replace function public.remove_member(p_vacation uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_vacation) or p_user = auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.vacation_members where vacation_id = p_vacation and user_id = p_user;
end $$;

-- Owner deletes the vacation for everyone (everything in it goes, the phones remove it on the next sync).
create or replace function public.delete_vacation(p_vacation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_vacation) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.vacations where id = p_vacation;
end $$;

-- "Delete my data": leaves every vacation (handing over or deleting it), then deletes profile + account.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  for v in select vacation_id from public.vacation_members where user_id = auth.uid() loop
    perform public.leave_vacation(v);
  end loop;
  -- Vacations the user created but is no longer a member of (edge case): delete them.
  delete from public.vacations where owner_id = auth.uid();
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
