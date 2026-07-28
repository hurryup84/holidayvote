-- HolidayVote V3 - Add SECURITY DEFINER function for vacation creation
-- This bypasses RLS issues with Server Actions by using a trusted function

-- Helper: generate invite code in database
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code TEXT;
  chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  len INT := 8;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..len LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::INT, 1);
    END LOOP;

    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM public.vacations WHERE invite_code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- Function to create vacation with owner as participant
-- SECURITY DEFINER means it runs with the privileges of the function owner (postgres)
-- bypassing RLS, but we still validate ownership via auth.uid()
CREATE OR REPLACE FUNCTION public.create_vacation(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_destination TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  vacation_id UUID,
  name TEXT,
  description TEXT,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  invite_code TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite_code TEXT;
  v_vacation_id UUID;
BEGIN
  -- Ensure user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (id, email, name)
  SELECT v_user_id, auth.email(), NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id);

  -- Generate unique invite code
  v_invite_code := public.generate_invite_code();

  -- Insert vacation
  INSERT INTO public.vacations (name, description, destination, start_date, end_date, invite_code, owner_id)
  VALUES (p_name, p_description, p_destination, p_start_date, p_end_date, v_invite_code, v_user_id)
  RETURNING id INTO v_vacation_id;

  -- Insert owner as participant
  INSERT INTO public.participants (vacation_id, user_id, role)
  VALUES (v_vacation_id, v_user_id, 'owner');

  -- Return the created vacation
  RETURN QUERY
  SELECT v.id, v.name, v.description, v.destination, v.start_date, v.end_date, v.invite_code, v.owner_id, v.created_at
  FROM public.vacations v
  WHERE v.id = v_vacation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_vacation(TEXT, TEXT, TEXT, DATE, DATE) TO authenticated;

-- Function to update vacation (owner only)
CREATE OR REPLACE FUNCTION public.update_vacation(
  p_vacation_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_destination TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.vacations
  SET
    name = p_name,
    description = p_description,
    destination = p_destination,
    start_date = p_start_date,
    end_date = p_end_date
  WHERE id = p_vacation_id AND owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacation not found or not owner';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_vacation(UUID, TEXT, TEXT, TEXT, DATE, DATE) TO authenticated;

-- Function to delete vacation (owner only)
CREATE OR REPLACE FUNCTION public.delete_vacation(p_vacation_id UUID, p_invite_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.vacations
  WHERE id = p_vacation_id AND owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacation not found or not owner';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_vacation(UUID, TEXT) TO authenticated;