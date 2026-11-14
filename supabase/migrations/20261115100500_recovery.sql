-- Recovery code: get your vacations back on a new phone without any login (same as Esstisch).
-- The code is shown once in the app (Settings → "New or lost phone?"); only its SHA-256 hash is stored.
-- recover_account(code), called by the new phone's (anonymous) account, moves memberships, ownership,
-- votes, name and terms over to it and deletes the old account – so a lost phone loses access at once.

create table public.account_recovery (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.account_recovery enable row level security; -- no policies: only via the functions below

-- Failed attempts, for rate limiting (per account and overall).
create table public.recovery_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index recovery_attempts_time_idx on public.recovery_attempts (attempted_at);
alter table public.recovery_attempts enable row level security;

create or replace function public.recovery_hash(p_code text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;

-- 12 characters from 31 unambiguous ones (no 0/O, 1/I/L) ≈ 59 bits, from gen_random_uuid()
-- (cryptographically strong). Formatted as XXXX-XXXX-XXXX.
create or replace function public.random_recovery_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  code text := '';
  i int;
begin
  for i in 0..11 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, i) % 31), 1);
  end loop;
  return substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4);
end $$;

-- New code for the current account (replaces an older one). Returns the code – the only time it's visible.
create or replace function public.create_recovery_code()
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  loop
    v_code := public.random_recovery_code();
    begin
      insert into public.account_recovery (user_id, code_hash) values (auth.uid(), public.recovery_hash(v_code))
      on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = now();
      exit;
    exception when unique_violation then
      -- same code as someone else's (practically impossible): try another one
    end;
  end loop;
  return v_code;
end $$;

-- When the current account's code was created (null = none).
create or replace function public.recovery_code_created_at()
returns timestamptz language sql stable security definer set search_path = public as $$
  select created_at from public.account_recovery where user_id = auth.uid();
$$;

-- Take over the account that owns `p_code`. Returns {display_name, vacations} or {error: 'invalid_code'}.
create or replace function public.recover_account(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_new uuid := auth.uid();
  v_old uuid;
  v_old_profile public.profiles;
  v_count int;
begin
  if v_new is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if (select count(*) from public.recovery_attempts where user_id = v_new and attempted_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.recovery_attempts where attempted_at > now() - interval '1 hour') >= 1000 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  select user_id into v_old from public.account_recovery where code_hash = public.recovery_hash(p_code);
  if v_old is null then
    -- Returned, not raised: an exception would roll back the recorded attempt (and the rate limit).
    insert into public.recovery_attempts (user_id) values (v_new);
    return jsonb_build_object('error', 'invalid_code');
  end if;
  if v_old = v_new then
    return jsonb_build_object('display_name', (select display_name from public.profiles where id = v_new), 'vacations', 0);
  end if;
  select * into v_old_profile from public.profiles where id = v_old;
  if v_old_profile.banned_at is not null then
    raise exception 'blocked' using errcode = '42501';
  end if;

  perform set_config('app.trusted', 'on', true);
  insert into public.profiles (id) values (v_new) on conflict (id) do nothing;

  -- Memberships (a vacation both accounts are in keeps the new one). Votes, vetoes and favourites follow
  -- the membership (trigger picks_follow_member).
  delete from public.vacation_members m
   where m.user_id = v_old and exists (select 1 from public.vacation_members x where x.vacation_id = m.vacation_id and x.user_id = v_new);
  update public.vacation_members set user_id = v_new where user_id = v_old;
  get diagnostics v_count = row_count;

  update public.vacations set owner_id = v_new where owner_id = v_old;
  -- "suggested by …" / authorship stays correct.
  update public.vacations set created_by = v_new where created_by = v_old;
  update public.vacations set updated_by = v_new where updated_by = v_old;
  update public.properties set created_by = v_new where created_by = v_old;
  update public.properties set updated_by = v_new where updated_by = v_old;
  update public.comments set created_by = v_new where created_by = v_old;
  update public.comments set updated_by = v_new where updated_by = v_old;
  update public.votes set created_by = v_new, updated_by = v_new where user_id = v_new;
  update public.vetoes set created_by = v_new, updated_by = v_new where user_id = v_new;
  update public.favorites set created_by = v_new, updated_by = v_new where user_id = v_new;
  update public.vacation_invites set created_by = v_new where created_by = v_old;
  update public.content_reports set reporter_id = v_new where reporter_id = v_old;
  insert into public.user_blocks (blocker_id, blocked_id, created_at)
    select v_new, blocked_id, created_at from public.user_blocks where blocker_id = v_old and blocked_id <> v_new
    on conflict do nothing;
  insert into public.user_blocks (blocker_id, blocked_id, created_at)
    select blocker_id, v_new, created_at from public.user_blocks where blocked_id = v_old and blocker_id <> v_new
    on conflict do nothing;

  update public.profiles set
    display_name = coalesce(v_old_profile.display_name, display_name),
    terms_accepted_at = coalesce(v_old_profile.terms_accepted_at, terms_accepted_at),
    terms_version = coalesce(v_old_profile.terms_version, terms_version)
  where id = v_new;

  -- The same code keeps working for the new phone.
  delete from public.account_recovery where user_id = v_new;
  update public.account_recovery set user_id = v_new where user_id = v_old;

  -- The old phone loses access: its account is deleted (cascades to what's left of it).
  delete from public.profiles where id = v_old;
  delete from auth.users where id = v_old;

  return jsonb_build_object('display_name', v_old_profile.display_name, 'vacations', v_count);
end $$;

revoke all on function public.create_recovery_code(), public.recovery_code_created_at(), public.recover_account(text)
  from public, anon;
grant execute on function public.create_recovery_code(), public.recovery_code_created_at(), public.recover_account(text)
  to authenticated;
revoke all on function public.random_recovery_code(), public.recovery_hash(text) from public, anon, authenticated;

-- Old failed attempts are only needed for the hourly limit.
create or replace function public.prune_recovery_attempts()
returns void language sql security definer set search_path = public as $$
  delete from public.recovery_attempts where attempted_at < now() - interval '1 day';
$$;
revoke all on function public.prune_recovery_attempts() from public, anon, authenticated;

-- Tombstones (soft-deleted rows) older than 30 days are removed for good (logged in sync_deletes).
create or replace function public.prune_tombstones()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.comments where deleted_at < now() - interval '30 days';
  delete from public.votes where deleted_at < now() - interval '30 days';
  delete from public.properties where deleted_at < now() - interval '30 days';
  delete from public.vacations where deleted_at < now() - interval '30 days';
  delete from public.vacation_invites where expires_at < now() - interval '30 days';
end $$;
revoke all on function public.prune_tombstones() from public, anon, authenticated;
