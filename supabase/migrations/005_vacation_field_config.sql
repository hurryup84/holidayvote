-- HolidayVote V5 - Vacation field configuration
-- Allows owners to enable/disable fields per vacation

-- Table to store which fields are enabled for each vacation
CREATE TABLE IF NOT EXISTS public.vacation_field_config (
  vacation_id UUID NOT NULL REFERENCES public.vacations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vacation_id, field_name)
);

-- Enable RLS
ALTER TABLE public.vacation_field_config ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Owners can manage field config"
  ON public.vacation_field_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vacations v
      WHERE v.id = vacation_field_config.vacation_id
      AND v.owner_id = auth.uid()
    )
  );

CREATE POLICY "Participants can view field config"
  ON public.vacation_field_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.vacation_id = vacation_field_config.vacation_id
      AND p.user_id = auth.uid()
    )
  );

-- Default field definitions (for reference in UI)
-- These are the available fields that can be toggled:
-- title (required, always shown)
-- address
-- description
-- price
-- bedrooms
-- beds
-- bathrooms
-- has_pool
-- image_url

-- Function to get field config for a vacation
CREATE OR REPLACE FUNCTION public.get_vacation_field_config(p_vacation_id UUID)
RETURNS TABLE (
  field_name TEXT,
  is_enabled BOOLEAN,
  display_order INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT field_name, is_enabled, display_order
  FROM public.vacation_field_config
  WHERE vacation_id = p_vacation_id
  ORDER BY display_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_vacation_field_config(UUID) TO authenticated;

-- Function to upsert field config
CREATE OR REPLACE FUNCTION public.upsert_vacation_field_config(
  p_vacation_id UUID,
  p_field_name TEXT,
  p_is_enabled BOOLEAN,
  p_display_order INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is owner
  IF NOT EXISTS (
    SELECT 1 FROM public.vacations
    WHERE id = p_vacation_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.vacation_field_config (vacation_id, field_name, is_enabled, display_order)
  VALUES (p_vacation_id, p_field_name, p_is_enabled, p_display_order)
  ON CONFLICT (vacation_id, field_name)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    display_order = EXCLUDED.display_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_vacation_field_config(UUID, TEXT, BOOLEAN, INTEGER) TO authenticated;

-- Function to initialize default field config for a new vacation
CREATE OR REPLACE FUNCTION public.init_vacation_field_config(p_vacation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is owner
  IF NOT EXISTS (
    SELECT 1 FROM public.vacations
    WHERE id = p_vacation_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Insert default config for all optional fields
  INSERT INTO public.vacation_field_config (vacation_id, field_name, is_enabled, display_order)
  VALUES
    (p_vacation_id, 'address', true, 10),
    (p_vacation_id, 'description', true, 20),
    (p_vacation_id, 'price', true, 30),
    (p_vacation_id, 'bedrooms', true, 40),
    (p_vacation_id, 'beds', true, 50),
    (p_vacation_id, 'bathrooms', true, 60),
    (p_vacation_id, 'has_pool', true, 70)
  ON CONFLICT (vacation_id, field_name) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.init_vacation_field_config(UUID) TO authenticated;