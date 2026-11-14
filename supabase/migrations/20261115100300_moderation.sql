-- User-generated content (App Store guideline 1.2 / Google Play UGC policy), as in Esstisch:
-- terms accepted before sharing (accept_terms / require_terms), reporting, blocking, operator ban.

-- Reports: members report content of their vacation; only the operator reads them.
-- reporter_id is nullable: reports stay for the operator after the reporter deletes their account.
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  target_type text not null check (target_type in ('property', 'comment', 'member')),
  target_id uuid not null,
  reason text not null check (reason in ('offensive', 'illegal', 'spam', 'other')),
  note text check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index content_reports_open_idx on public.content_reports (status, created_at);
alter table public.content_reports enable row level security;
create policy content_reports_insert on public.content_reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.is_member(vacation_id));
grant insert on public.content_reports to authenticated;

-- Blocking: blocked people can't share a vacation with the blocker again.
create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.user_blocks enable row level security;
create policy user_blocks_own on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
grant select on public.user_blocks to authenticated;

-- Block a member of my vacation: report + block; the owner removes the person, others leave.
create or replace function public.block_member(p_vacation uuid, p_user uuid, p_reason text default 'offensive')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_user = auth.uid() or not public.is_member(p_vacation) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  insert into public.content_reports (reporter_id, vacation_id, target_type, target_id, reason)
  values (auth.uid(), p_vacation, 'member', p_user, coalesce(p_reason, 'offensive'));
  if public.is_owner(p_vacation) then
    delete from public.vacation_members where vacation_id = p_vacation and user_id = p_user;
  else
    perform public.leave_vacation(p_vacation);
  end if;
end $$;
grant execute on function public.block_member(uuid, uuid, text) to authenticated;

-- ---------- operator tools (SQL editor / service role only) ----------

create or replace view public.moderation_queue as
  select r.id, r.created_at, r.reason, r.note, r.target_type, r.target_id, r.vacation_id, v.name as vacation_name,
         r.reporter_id,
         case r.target_type
           when 'property' then (select coalesce(title, url) from public.properties where id = r.target_id)
           when 'comment' then (select text from public.comments where id = r.target_id)
           when 'member' then (select display_name from public.profiles where id = r.target_id)
         end as target_label
  from public.content_reports r left join public.vacations v on v.id = r.vacation_id
  where r.status = 'open'
  order by r.created_at;
revoke all on public.moderation_queue from anon, authenticated;

create or replace function public.moderate_ban_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.trusted', 'on', true);
  update public.profiles set banned_at = now() where id = p_user;
  delete from public.vacation_members where user_id = p_user and role = 'member';
end $$;

-- Open reports with everything needed to decide (moderation page → Edge Function `moderation`).
create or replace function public.moderation_report_details()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(r order by (r ->> 'created_at')), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', c.id,
      'created_at', c.created_at,
      'reason', c.reason,
      'note', c.note,
      'target_type', c.target_type,
      'target_id', c.target_id,
      'vacation', jsonb_build_object('id', v.id, 'name', v.name,
                 'members', (select count(*) from public.vacation_members m where m.vacation_id = v.id)),
      'reporter', jsonb_build_object('id', c.reporter_id,
                 'name', coalesce((select display_name from public.vacation_members m where m.vacation_id = c.vacation_id and m.user_id = c.reporter_id),
                                  (select display_name from public.profiles where id = c.reporter_id))),
      'reports_on_target', (select count(*) from public.content_reports x where x.target_id = c.target_id),
      'target', case c.target_type
        when 'property' then (
          select jsonb_build_object('title', p.title, 'url', p.url, 'description', p.description, 'address', p.address,
                   'deleted', p.deleted_at is not null,
                   'author_id', p.created_by, 'author_name', (select display_name from public.profiles where id = p.created_by))
          from public.properties p where p.id = c.target_id)
        when 'comment' then (
          select jsonb_build_object('text', k.text, 'deleted', k.deleted_at is not null,
                   'property', (select coalesce(title, url) from public.properties where id = k.property_id),
                   'author_id', k.created_by, 'author_name', (select display_name from public.profiles where id = k.created_by))
          from public.comments k where k.id = c.target_id)
        when 'member' then (
          select jsonb_build_object('name', coalesce(m.display_name, p.display_name), 'role', m.role,
                   'still_member', m.user_id is not null, 'banned', p.banned_at is not null, 'author_id', p.id)
          from public.profiles p left join public.vacation_members m on m.user_id = p.id and m.vacation_id = c.vacation_id
          where p.id = c.target_id)
      end
    ) as r
    from public.content_reports c join public.vacations v on v.id = c.vacation_id
    where c.status = 'open'
  ) x;
$$;

-- Act on a report: dismiss | remove (soft delete → synced away from all phones; a reported person is
-- removed from that vacation) | ban (remove + ban its author).
create or replace function public.moderate_report(p_report uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.content_reports;
  v_author uuid;
begin
  select * into c from public.content_reports where id = p_report;
  if c.id is null then
    raise exception 'unknown_report' using errcode = 'P0002';
  end if;
  if p_action not in ('dismiss', 'remove', 'ban') then
    raise exception 'unknown_action' using errcode = '22023';
  end if;

  if p_action in ('remove', 'ban') then
    perform set_config('app.trusted', 'on', true);
    case c.target_type
      when 'property' then
        select created_by into v_author from public.properties where id = c.target_id;
        update public.properties set deleted_at = now() where id = c.target_id and deleted_at is null;
      when 'comment' then
        select created_by into v_author from public.comments where id = c.target_id;
        update public.comments set deleted_at = now() where id = c.target_id and deleted_at is null;
      when 'member' then
        v_author := c.target_id;
        delete from public.vacation_members where vacation_id = c.vacation_id and user_id = c.target_id and role = 'member';
    end case;
    if p_action = 'ban' and v_author is not null then
      perform public.moderate_ban_user(v_author);
    end if;
  end if;

  update public.content_reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'removed' end, handled_at = now()
   where status = 'open' and (id = p_report or (p_action <> 'dismiss' and target_id = c.target_id));

  return jsonb_build_object('status', case when p_action = 'dismiss' then 'dismissed' else 'removed' end);
end $$;

revoke all on function public.moderate_ban_user(uuid), public.moderation_report_details(), public.moderate_report(uuid, text)
  from public, anon, authenticated;
grant execute on function public.moderation_report_details(), public.moderate_report(uuid, text) to service_role;
