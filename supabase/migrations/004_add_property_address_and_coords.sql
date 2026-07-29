-- HolidayVote - Add address and coordinates to properties
-- For OpenStreetMap integration

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Index for spatial queries (optional, for future use)
CREATE INDEX IF NOT EXISTS properties_coords_idx
ON public.properties (lat, lng)
WHERE lat IS NOT NULL AND lng IS NOT NULL;