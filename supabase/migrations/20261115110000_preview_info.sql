-- What the listing page says (OpenGraph title / description / site name), stored with the link so houses
-- can be searched. TEXT ONLY: pictures (and picture URLs) are never stored on the server – every phone keeps
-- its own preview cache (src/data/media/previewCache.ts). sync_pull returns the new columns automatically.
alter table public.properties
  add column preview_title text check (char_length(preview_title) <= 300),
  add column preview_description text check (char_length(preview_description) <= 2000),
  add column preview_site text check (char_length(preview_site) <= 100);
