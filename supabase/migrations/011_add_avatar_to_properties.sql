-- Add avatar column to properties for user-selected house icons
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT NULL;
