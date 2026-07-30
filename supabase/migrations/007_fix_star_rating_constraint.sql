-- Fix star rating constraint from 1-3 to 1-5 for votes and comments tables
-- The UI supports 5-star rating but database constraint was incorrectly set to 3

-- Fix votes table
ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS votes_stars_check,
  ADD CONSTRAINT votes_stars_check CHECK (stars BETWEEN 1 AND 5);

-- Fix comments table (stars column is nullable but should also allow 1-5 when provided)
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_stars_check,
  ADD CONSTRAINT comments_stars_check CHECK (stars IS NULL OR stars BETWEEN 1 AND 5);