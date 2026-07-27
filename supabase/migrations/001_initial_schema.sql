-- HolidayVote V1 Schema

-- Profiles (extends Supabase Auth users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vacations
CREATE TABLE public.vacations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  invite_code TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX vacations_invite_code_idx ON public.vacations(invite_code);
CREATE INDEX vacations_owner_id_idx ON public.vacations(owner_id);

-- Participants
CREATE TABLE public.participants (
  vacation_id UUID NOT NULL REFERENCES public.vacations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vacation_id, user_id)
);

-- Properties
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacation_id UUID NOT NULL REFERENCES public.vacations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  image_url TEXT,
  description TEXT,
  provider TEXT,
  price NUMERIC(10, 2),
  beds INTEGER,
  bedrooms INTEGER,
  bathrooms INTEGER,
  has_pool BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated', 'booked')),
  suggested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vacation_id, url)
);

CREATE INDEX properties_vacation_id_idx ON public.properties(vacation_id);

-- Votes
CREATE TABLE public.votes (
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, user_id)
);

-- Vetoes (max 1 per user per vacation enforced in app logic)
CREATE TABLE public.vetoes (
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, user_id)
);

CREATE INDEX vetoes_user_id_idx ON public.vetoes(user_id);

-- Comments
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  stars SMALLINT CHECK (stars IS NULL OR stars BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX comments_property_id_idx ON public.comments(property_id);

-- Auto-create profile on signup
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
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: ensure profile exists (used when trigger didn't fire or for manual sync)
CREATE OR REPLACE FUNCTION public.ensure_profile(p_user_id UUID, p_email TEXT, p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (p_user_id, p_email, p_name)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile(UUID, TEXT, TEXT) TO anon, authenticated;

-- Helper: get current auth.uid() for debugging RLS issues
CREATE OR REPLACE FUNCTION public.get_auth_uid()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_uid() TO anon, authenticated;

-- Updated_at trigger for properties
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public vacation info for invite landing (no auth required)
CREATE OR REPLACE FUNCTION public.get_vacation_public(p_invite_code TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  invite_code TEXT,
  property_count BIGINT,
  participant_count BIGINT,
  vote_count BIGINT
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
     WHERE pr.vacation_id = v.id)
  FROM public.vacations v
  WHERE v.invite_code = p_invite_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_vacation_public(TEXT) TO anon, authenticated;

-- Join vacation by invite code (bypasses RLS chicken-and-egg problem)
CREATE OR REPLACE FUNCTION public.join_vacation_by_invite(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vacation_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_vacation_id
  FROM public.vacations
  WHERE invite_code = p_invite_code;

  IF v_vacation_id IS NULL THEN
    RAISE EXCEPTION 'Vacation not found';
  END IF;

  INSERT INTO public.participants (vacation_id, user_id, role)
  VALUES (v_vacation_id, auth.uid(), 'member')
  ON CONFLICT (vacation_id, user_id) DO NOTHING;

  RETURN v_vacation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_vacation_by_invite(TEXT) TO authenticated;

-- Helper: check if user is participant
CREATE OR REPLACE FUNCTION public.is_vacation_participant(p_vacation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE vacation_id = p_vacation_id AND user_id = p_user_id
  );
$$;

-- Helper: get user role in vacation
CREATE OR REPLACE FUNCTION public.get_vacation_role(p_vacation_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.participants
  WHERE vacation_id = p_vacation_id AND user_id = p_user_id;
$$;

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vetoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view profiles of vacation co-participants"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p1
      JOIN public.participants p2 ON p1.vacation_id = p2.vacation_id
      WHERE p1.user_id = auth.uid() AND p2.user_id = profiles.id
    )
  );

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Vacations policies
CREATE POLICY "Participants can view vacations"
  ON public.vacations FOR SELECT
  USING (public.is_vacation_participant(id, auth.uid()));

CREATE POLICY "Authenticated users can create vacations"
  ON public.vacations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update vacations"
  ON public.vacations FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete vacations"
  ON public.vacations FOR DELETE
  USING (owner_id = auth.uid());

-- Participants policies
CREATE POLICY "Participants can view participants"
  ON public.participants FOR SELECT
  USING (public.is_vacation_participant(vacation_id, auth.uid()));

CREATE POLICY "Users can join as member"
  ON public.participants FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role = 'member');

CREATE POLICY "Owners are inserted on vacation create"
  ON public.participants FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND role = 'owner'
    AND EXISTS (SELECT 1 FROM public.vacations v WHERE v.id = vacation_id AND v.owner_id = auth.uid())
  );

-- Properties policies
CREATE POLICY "Participants can view properties"
  ON public.properties FOR SELECT
  USING (public.is_vacation_participant(vacation_id, auth.uid()));

CREATE POLICY "Participants can add properties"
  ON public.properties FOR INSERT
  WITH CHECK (
    public.is_vacation_participant(vacation_id, auth.uid())
    AND auth.uid() = suggested_by
  );

CREATE POLICY "Participants can update properties"
  ON public.properties FOR UPDATE
  USING (public.is_vacation_participant(vacation_id, auth.uid()));

CREATE POLICY "Owners or suggesters can delete properties"
  ON public.properties FOR DELETE
  USING (
    public.is_vacation_participant(vacation_id, auth.uid())
    AND (
      public.get_vacation_role(vacation_id, auth.uid()) = 'owner'
      OR suggested_by = auth.uid()
    )
  );

-- Votes policies
CREATE POLICY "Participants can view votes"
  ON public.votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id
        AND public.is_vacation_participant(p.vacation_id, auth.uid())
    )
  );

CREATE POLICY "Participants can vote"
  ON public.votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id
        AND public.is_vacation_participant(p.vacation_id, auth.uid())
    )
  );

CREATE POLICY "Users can update own votes"
  ON public.votes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON public.votes FOR DELETE
  USING (auth.uid() = user_id);

-- Vetoes policies
CREATE POLICY "Participants can view vetoes"
  ON public.vetoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id
        AND public.is_vacation_participant(p.vacation_id, auth.uid())
    )
  );

CREATE POLICY "Participants can veto"
  ON public.vetoes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id
        AND public.is_vacation_participant(p.vacation_id, auth.uid())
    )
  );

CREATE POLICY "Users can remove own vetoes"
  ON public.vetoes FOR DELETE
  USING (auth.uid() = user_id);

-- Comments policies
CREATE POLICY "Participants can view comments"
  ON public.comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id
        AND public.is_vacation_participant(p.vacation_id, auth.uid())
    )
  );

CREATE POLICY "Participants can comment"
  ON public.comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id
        AND public.is_vacation_participant(p.vacation_id, auth.uid())
    )
  );

CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);
