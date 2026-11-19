# HolidayVote — Concept

> **"Which holiday home do we take?"** One shared list of links, everyone rates, the best one wins.

Rewritten in November 2026 from the Next.js web app (magic-link login) into a native app on the architecture of
**Esstisch** (`../../dining_table/concept/02_architecture.md`) – read that document for the details of the
layers, the local-first sync and the account mechanism; this file lists what is specific to HolidayVote.

## Product

| Feature | Notes |
|---|---|
| Vacations | Name, destination, dates (nights), description. Several per person. Created on the phone; on the server once someone is invited |
| Houses | Any vacation member can edit a house's link, title, provider, total price (→ price per person), bedrooms, beds, bathrooms, pool, address (→ map, distance from home), notes and icon. The owner switches optional fields on / off per vacation |
| Preview | Title / text / picture from the page's OpenGraph data (phones: native HTTP; browser: Edge Function `link-preview`). The **text is stored with the link** (synced, searchable); the **picture only in each phone's own cache** (downscaled file). Refresh per house or clear the whole cache in Settings. Fallback: the chosen icon |
| Search | Houses of a vacation by title, provider, notes, address, link and the stored preview text (accents / ß / ø ignored) |
| Rating | 1–5 stars per person and house; one favourite and one veto per person and vacation (they move); comments, optionally with stars |
| Ranking | booked → active → eliminated; then average stars, number of votes, fewer vetoes, more favourites, lower price |
| Status | Only the owner ("organiser") marks a house as booked (one at a time) or eliminated |
| Map | OpenStreetMap tiles (Leaflet), emoji markers; **Check address** replaces the typed text with the matched address. Save stores the match and its coordinates, looking them up if needed. If no match is found or the lookup times out after five seconds, Save keeps the typed address without a map pin. |
| Sharing | Invite code / link (`/join?c=CODE`), join, leave, remove, delete the vacation (owner) |
| UGC rules | Terms accepted before the first invite / join; report house / comment / person; block; moderation page + daily report e-mail |
| Account | Anonymous (no e-mail, no password), bot check (Turnstile) before it is created, recovery code for a new phone, "Delete my data" |

Not now: Premium / purchases, push notifications, share extension ("share a link from Airbnb into the app"),
House-vs-listing de-duplication across providers, exports.

## Decisions

| # | Decision | Why |
|---|---|---|
| H1 | **Same stack and layers as Esstisch** (Capacitor 8, Ionic React 9, local SQLite + own sync engine, Supabase, fastlane, Cloudflare website) | One way of building apps in the portfolio; proven code (sync, accounts, captcha, recovery, release) reused |
| H2 | **Vacation = Esstisch's "table"** (`vacation_id` on every row, `vacation_members`, invites, `sync_pull` per vacation, realtime channel `vacation:<id>`) | Sharing works exactly like Esstisch |
| H3 | **No pictures in the database or on the server** – no image (URL) column, no storage bucket. Each phone keeps its own preview cache (`preview_cache` local-only table + files), so the app doesn't refetch every page on every start | Copyright of the providers' photos, data minimisation, no storage cost; fast app start |
| H8 | **Preview text is stored with the link** (`preview_title`, `preview_description`, `preview_site`); the user's title is separate and editable | Searchable later, even when the listing is gone |
| H4 | **Veto and favourite: one row per person and vacation**, `property_id` moves | Two devices can't create competing rows; "one per vacation" is a unique key on the server |
| H5 | **Status changes by non-owners are silently ignored by the server** (trigger), not rejected | The rest of an edit (e.g. a new price) still syncs |
| H6 | **Home location stays on the phone** (`app_kv`) | Only needed for "distance from home"; nobody else needs it |
| H7 | **Comments stay when their author leaves** (shown as "former member"); stars, veto, favourite go | The discussion stays readable; the ranking reflects the current group |

## Data model (server = local, plus sync columns)

```
profiles          id (= auth user), display_name, terms_*, banned_at
vacations         id, name, description, destination, start_date, end_date, owner_id, settings (JSON: fields)
vacation_members  vacation_id, user_id, role (owner|member), display_name (copy)      ← server-maintained
vacation_invites  vacation_id, code, expires_at, max_uses, uses                        ← server only
properties        id, vacation_id, url, title, description, provider, price, beds, bedrooms, bathrooms,
                  has_pool, address, lat, lng, avatar, status (active|eliminated|booked),
                  preview_title, preview_description, preview_site                    ← text only, no picture
votes             id, vacation_id, property_id, user_id, value 1–5        unique (property_id, user_id)
vetoes            id, vacation_id, user_id, property_id                    unique (vacation_id, user_id)
favorites         id, vacation_id, user_id, property_id                    unique (vacation_id, user_id)
comments          id, vacation_id, property_id, text, stars
content_reports, user_blocks, account_recovery, recovery_attempts          ← server only
preview_cache     url, title, description, site_name, image_url, image_file, status ← phone only, never synced
```
Every synced row: `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` (soft delete), and on the
server `sync_xid`. Migrations: `supabase/migrations/`; local schema: `src/data/db/schema.ts`.
