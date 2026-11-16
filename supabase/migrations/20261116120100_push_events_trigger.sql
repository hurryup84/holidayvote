-- When a house is added, create a push event for every other vacation member.
create or replace function public.note_house_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_by uuid := coalesce(auth.uid(), new.created_by);
  v_name text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select display_name into v_name from public.profiles where id = v_by;

  insert into public.push_events (vacation_id, property_id, house_title, added_by, added_by_name)
  select new.vacation_id, new.id,
         coalesce(new.title, new.url),
         v_by, v_name
    from public.vacation_members m
   where m.vacation_id = new.vacation_id
     and m.user_id is distinct from v_by
     and exists (select 1 from public.profiles p where p.id = m.user_id and p.banned_at is null);

  return new;
end $$;

create trigger properties_house_added
  after insert on public.properties
  for each row execute function public.note_house_added();

revoke all on function public.note_house_added() from public, anon, authenticated;
