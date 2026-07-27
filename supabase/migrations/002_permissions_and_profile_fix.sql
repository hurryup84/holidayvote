-- HolidayVote V1 – Fixes: owner-only status changes, veto integrity,
-- profile name prompt on first visit

-- 1) Only owners may change a property's status (booked/eliminated/active).
--    RLS UPDATE policies cannot compare OLD vs NEW, so enforce via trigger.
CREATE OR REPLACE FUNCTION public.enforce_property_status_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF public.get_vacation_role(NEW.vacation_id, auth.uid()) IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Nur der Owner kann den Status ändern';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_status_owner_check ON public.properties;
CREATE TRIGGER properties_status_owner_check
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_property_status_owner();

-- 2) Enforce "max 1 veto per user per vacation" at the DB level.
--    Inserting a new veto moves the user's existing veto (matches app logic,
--    eliminates the race window and direct-API bypass).
CREATE OR REPLACE FUNCTION public.enforce_single_veto_per_vacation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vacation_id UUID;
BEGIN
  SELECT vacation_id INTO v_vacation_id
  FROM public.properties
  WHERE id = NEW.property_id;

  DELETE FROM public.vetoes vt
  USING public.properties p
  WHERE vt.property_id = p.id
    AND p.vacation_id = v_vacation_id
    AND vt.user_id = NEW.user_id
    AND vt.property_id <> NEW.property_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vetoes_single_per_vacation ON public.vetoes;
CREATE TRIGGER vetoes_single_per_vacation
  BEFORE INSERT ON public.vetoes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_veto_per_vacation();

-- 3) Do not backfill profile name with the email prefix – leave it NULL so
--    the app asks for the name on first visit (plan: "Name wird beim ersten
--    Besuch abgefragt").
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'name', '')), '')
  );
  RETURN NEW;
END;
$$;

-- Reset names that were auto-backfilled with the email prefix, so those
-- users get the name prompt instead of showing up as "max.mustermann".
UPDATE public.profiles
SET name = NULL
WHERE name = split_part(email, '@', 1);

-- 4) Invite-link share preview: expose the top house's image so WhatsApp/
--    Signal previews show a picture (plan: "Bild: Vorschaubild des
--    Top-Hauses oder generisches HolidayVote-Bild").
DROP FUNCTION IF EXISTS public.get_vacation_public(TEXT);

CREATE FUNCTION public.get_vacation_public(p_invite_code TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  invite_code TEXT,
  property_count BIGINT,
  participant_count BIGINT,
  vote_count BIGINT,
  top_image_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    v.id,
    v.name,
    v.destination,
    v.start_date,
    v.end_date,
    v.invite_code,
    (SELECT COUNT(*) FROM public.properties p WHERE p.vacation_id = v.id),
    (SELECT COUNT(*) FROM public.participants pt WHERE pt.vacation_id = v.id),
    (SELECT COUNT(DISTINCT vo.user_id)
     FROM public.votes vo
     JOIN public.properties pr ON pr.id = vo.property_id
     WHERE pr.vacation_id = v.id),
    (SELECT p.image_url
     FROM public.properties p
     LEFT JOIN public.votes vo ON vo.property_id = p.id
     WHERE p.vacation_id = v.id
       AND p.image_url IS NOT NULL
       AND p.status <> 'eliminated'
     GROUP BY p.id
     ORDER BY COALESCE(SUM(vo.stars), 0) DESC, p.created_at ASC
     LIMIT 1)
  FROM public.vacations v
  WHERE v.invite_code = p_invite_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_vacation_public(TEXT) TO anon, authenticated;
