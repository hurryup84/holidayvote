-- Row-level security: every row is visible / writable only for members of its vacation.

alter table public.profiles enable row level security;
alter table public.vacations enable row level security;
alter table public.vacation_members enable row level security;
alter table public.vacation_invites enable row level security;
alter table public.properties enable row level security;
alter table public.votes enable row level security;
alter table public.vetoes enable row level security;
alter table public.favorites enable row level security;
alter table public.comments enable row level security;
alter table public.app_config enable row level security;

-- profiles: own profile only; names of others come via vacation_members.display_name.
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- vacations: members read; the creator inserts (owner = self); only the owner edits / deletes.
create policy vacations_select on public.vacations for select to authenticated
  using (public.is_member(id) or owner_id = auth.uid());
create policy vacations_insert on public.vacations for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_banned());
create policy vacations_update on public.vacations for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
create policy vacations_delete on public.vacations for delete to authenticated
  using (public.is_owner(id));

-- vacation_members: read own memberships + members of my vacations; changes only via RPCs.
create policy vacation_members_select on public.vacation_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(vacation_id));

-- vacation_invites: only via RPCs; members may list and revoke.
create policy vacation_invites_select on public.vacation_invites for select to authenticated
  using (public.is_member(vacation_id));
create policy vacation_invites_update on public.vacation_invites for update to authenticated
  using (public.is_member(vacation_id)) with check (public.is_member(vacation_id));

-- properties: members add and edit; status / delete rules in protect_property_columns().
create policy properties_select on public.properties for select to authenticated using (public.is_member(vacation_id));
create policy properties_insert on public.properties for insert to authenticated
  with check (public.is_member(vacation_id) and created_by = auth.uid());
create policy properties_update on public.properties for update to authenticated
  using (public.is_member(vacation_id)) with check (public.is_member(vacation_id));
create policy properties_delete on public.properties for delete to authenticated
  using (public.is_owner(vacation_id) or (public.is_member(vacation_id) and created_by = auth.uid()));

-- votes / vetoes / favorites: everyone at the vacation sees them; each person writes only their own.
do $$
declare t text;
begin
  foreach t in array array['votes', 'vetoes', 'favorites'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(vacation_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid() and public.is_member(vacation_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid() and public.is_member(vacation_id)) with check (user_id = auth.uid() and public.is_member(vacation_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid() and public.is_member(vacation_id))', t || '_delete', t);
  end loop;
end $$;

-- comments: everyone reads; each person writes and deletes only their own.
create policy comments_select on public.comments for select to authenticated using (public.is_member(vacation_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (created_by = auth.uid() and public.is_member(vacation_id));
create policy comments_update on public.comments for update to authenticated
  using (created_by = auth.uid() and public.is_member(vacation_id)) with check (created_by = auth.uid() and public.is_member(vacation_id));
create policy comments_delete on public.comments for delete to authenticated
  using (created_by = auth.uid() and public.is_member(vacation_id));

-- app_config: readable, never writable by clients.
create policy app_config_select on public.app_config for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.vacations, public.properties, public.votes,
  public.vetoes, public.favorites, public.comments to authenticated;
grant select, update on public.vacation_invites to authenticated;
grant select on public.vacation_members, public.app_config to authenticated;

revoke all on function public.random_invite_code(), public.check_join_allowed(uuid), public.require_terms()
  from public, anon;
grant execute on function public.create_invite(uuid), public.accept_invite(text), public.leave_vacation(uuid),
  public.remove_member(uuid, uuid), public.delete_vacation(uuid), public.delete_my_account(),
  public.accept_terms(text) to authenticated;
