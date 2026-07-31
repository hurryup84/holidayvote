-- Add home location columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS home_lng DOUBLE PRECISION;

-- Add comment
COMMENT ON COLUMN public.profiles.home_lat IS 'User home latitude (for distance calculation)';
COMMENT ON COLUMN public.profiles.home_lng IS 'User home longitude (for distance calculation)';