-- Favorites: users bookmark properties they like
CREATE TABLE public.favorites (
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, user_id)
);

-- RLS: Participants can view favorites for their vacation's properties
CREATE POLICY "Participants can view favorites"
  ON public.favorites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id
        AND public.is_vacation_participant(p.vacation_id, auth.uid())
    )
  );

-- RLS: Users can add their own favorites
CREATE POLICY "Participants can favorite"
  ON public.favorites FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id
        AND public.is_vacation_participant(p.vacation_id, auth.uid())
    )
  );

-- RLS: Users can remove their own favorites
CREATE POLICY "Users can delete own favorites"
  ON public.favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Enable RLS on favorites table
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
