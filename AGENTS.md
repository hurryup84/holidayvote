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

## Screenshot tests

### `tests/e2e/screenshots.spec.ts` ✅ **PASSING**
- Runs with: `SCREENSHOTS=./screenshots npm run screenshots`
- Generates **32 screenshots** in `./screenshots/` in ~52 seconds
- Scenes (8): 0-debug, 0-vacations, 1-vacations, 2-houses, 3-map, 4-people, 5-detail, 6-settings
- Themes: light & dark
- Locales: de-DE & en-US

### `ios/fastlane/screenshots/` ✅ **App Store Screenshots Copied**
- **de-DE/** — 12 files: German locale, light + dark mode, 6 key scenes
- **en-US/** — 12 files: English locale, light + dark mode, 6 key scenes
- Scenes: 0-vacations, 2-houses, 3-map, 4-people, 5-detail, 6-settings

### `tests/e2e/store-screenshots.spec.ts` ⚠️ **NEEDS DATA SETUP**
- Runs with: `STORE_SCREENSHOTS=1 npm run screenshots:store`
- Generates App Store / Play screenshots for iOS devices using real demo photos from `assets/demo-photos/`
- **Currently times out** — needs a vacation seeded before the screenshot loop
- **Fix**: add vacancy creation logic at test start, or reduce device count to 2 iPhones

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | App in the browser at http://localhost:5183 (database: sql.js, saved in IndexedDB) |
| `npm run screenshots` | SCREENSHOTS=./screenshots playwright test screenshots ✅ **Passing** — generates 32 screenshots in `./screenshots/` |
| `npm run screenshots:store` | STORE_SCREENSHOTS=1 playwright test store-screenshots --workers=2 ⚠️ **Needs data setup** |
| `npm run test:e2e` | End-to-end test in Chrome (Playwright, without Supabase) |

### App Store Screenshots Structure
- `ios/fastlane/screenshots/de-DE/` — 12 files (German, light + dark, 6 scenes)
- `ios/fastlane/screenshots/en-US/` — 12 files (English, light + dark, 6 scenes)

**Key scenes copied:** 0-vacations, 2-houses, 3-map, 4-people, 5-detail, 6-settings