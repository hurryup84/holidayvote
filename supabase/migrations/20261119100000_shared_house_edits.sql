-- Postgres checks INSERT RLS before resolving an upsert conflict. Allow the
-- original creator on an existing row. Lock it so a concurrent delete cannot
-- turn an authorized edit into an insert attributed to someone else.
alter policy properties_insert on public.properties
  with check (
    public.is_member(vacation_id) and (
      created_by = auth.uid() or exists (
        select 1 from public.properties existing
        where existing.id = properties.id
          and existing.vacation_id = properties.vacation_id
          and existing.created_by = properties.created_by
        for no key update
      )
    )
  );

create or replace function public.protect_property_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.trusted() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not public.is_owner(new.vacation_id) then new.status := 'active'; end if;
    -- Editing an existing house does not use a slot, even through an upsert.
    if not exists (select 1 from public.properties where id = new.id and vacation_id = new.vacation_id)
       and (select count(*) from public.properties where vacation_id = new.vacation_id)
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
