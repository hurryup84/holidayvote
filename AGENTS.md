# HolidayVote – notes for coding agents

Capacitor 8 + Ionic React 9 + React 19 + TypeScript + Vite app (iOS + Android), local-first SQLite with an
own sync engine to Supabase – the same architecture as the sibling app Esstisch (`../dining_table`).
Read `README.md` (code map, rules) and `concept/README.md` before changing anything.

- Never put pictures of holiday homes (or picture URLs) into the database or upload them: the server keeps
  the link + preview TEXT (`properties.preview_*`). Pictures live only in each phone's own preview cache
  (`src/data/media/previewCache.ts`, local-only table `preview_cache` + files in `previews/`).
- Features never import `data/db` or Capacitor plugins directly; every write goes through a repository;
  only `data/sync/` talks to Supabase; colours only as tokens in `src/app/theme/tokens.css`; all texts in
  `src/i18n/de.json` + `en.json`.
- Schema changes: a new file in `supabase/migrations/` (never edit an applied one) + `src/data/db/schema.ts`
  + `sync_pull` if a synced table changes; run `npm test` (SQL + two-phone sync tests on PGlite).
- Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`.
