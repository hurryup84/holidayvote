# HolidayVote

Choose the holiday home together. A group collects **links** to holiday homes (Airbnb, Booking.com, FeWo-direkt,
Novasol, …), everyone rates them with 1–5 stars, has **one favourite** and **one veto** per vacation, comments,
and the ranked list shows the group's top picks. The organiser marks the house that was booked.
Concept, architecture and data model: [concept/](concept/README.md).

**No pictures of holiday homes in the database.** A house is stored with its link, what people type in (title is
editable) and the link-preview **text** the page offers (title, description, site – searchable). Pictures go into
each phone's **own preview cache** (`src/data/media/previewCache.ts`): fetched once from the provider's page,
downscaled, kept on the phone, never uploaded. Refresh: house menu "…" → "Reload preview", or Settings →
"Preview pictures" → "Clear cache".

Same architecture, login and release setup as **Esstisch** (`../dining_table`): Capacitor + Ionic React, local
SQLite + own sync engine, Supabase with **anonymous accounts** (no sign-up, no e-mail, no password), a
**Cloudflare Turnstile bot check** before an account is created, and **recovery codes** for a new phone.
No Premium / in-app purchases (for now).

## Getting started

Use Node 22 (`.nvmrc`):

```sh
nvm use 22
npm install
npm run dev       # → http://localhost:5182
```

Without `.env.local` the app runs fully local (no sharing). Supabase setup: [supabase/README.md](supabase/README.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | App in the browser at http://localhost:5182 (database: sql.js, saved in IndexedDB) |
| `npm run sync` | Build and copy to iOS and Android (`cap sync`) |
| `npm test` | Unit tests + SQL tests against the real migrations (PGlite) incl. two simulated phones syncing |
| `npm run test:e2e` | End-to-end test in Chrome (Playwright, without Supabase); `SCREENSHOTS=dir` saves screenshots |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint |
| `npm run ios` / `npm run android` | Build, `cap sync`, run on a device / simulator |
| `npm run android:install` | Dev build → install on the connected Android phone (`-- prod` for a production build) |
| `npm run assets:icons` | Render icon / splash (`assets/src/`) and generate the native icons and splash screens |
| `npm run supabase:setup` | One-time: create the Supabase project, migrations, auth config, `.env.local` |
| `npm run supabase:bundle` | Refresh `supabase/setup_all.sql` (all migrations in one file) |
| `npm run release:test` | Test release: iOS → TestFlight and Android → internal testing |

## Test release (both stores, one command)

```sh
npm run release:test
```

Runs lint and tests, then for **iOS** a production build with build number = latest TestFlight build + 1 →
**TestFlight**, and for **Android** a production build with versionCode = highest on Google Play + 1 →
**internal testing**. Both copy the current web app into the native project first (`cap sync`).
Takes ~10–15 min; afterwards commit the new build numbers (`git commit -am "Test release …"`).

| Variant | |
|---|---|
| `npm run release:test -- ios` / `-- android` | Only one platform |
| `npm run release:test -- --draft` | Android release as draft (while the app isn't published on Google Play yet) |
| `npm run release:test -- --skip-tests` | Without lint and tests |

Needs the signing / API keys described in "iOS release" and "Android release" below. Version name: `package.json`
`version` (must match Xcode `MARKETING_VERSION`).

## iOS release (fastlane)

Run from `ios/` (`cd ios && fastlane ios beta`). The App Store Connect API key
(`ios/fastlane/AuthKey_YS2GQ53D2P.p8`, shared moidev key, same as Esstisch) is gitignored.

| Command | What it does |
|---|---|
| `fastlane ios build` | Production web build + `cap sync` + simulator compile (no signing, offline) |
| `fastlane ios archive` | Signed App Store IPA in `ios/fastlane/build/` – nothing uploaded |
| `fastlane ios beta` | Signed build → TestFlight (build number = latest TestFlight build + 1, automatically) |
| `fastlane ios bump` | Only set the build number to latest TestFlight build + 1 |
| `fastlane ios update_metadata` | Store texts, URLs, categories, age rating, review notes (no binary); texts in `ios/fastlane/metadata/` |
| `fastlane ios upload_screenshots` | Only the screenshots from `ios/fastlane/screenshots/<locale>/`, replaces the old ones |

App Review: `update_metadata` inserts the demo invite code from `ios/fastlane/review/invite_code.txt` into the
review notes and attaches `ios/fastlane/review/screen-recording.mov` – how to set up the demo vacation and
the recording: `ios/fastlane/review/README.md`.

Version: `package.json` `version` and Xcode `MARKETING_VERSION` must match (the lanes check this).
Store builds never contain the Debug page; `npm run build:dev` builds do.

## Android release (fastlane)

Run from `android/` (`cd android && fastlane android internal`). Secrets stay **outside** the repo in
`<apps>/android_signing/`: the keystore (`key.jks`, shared upload key, or an own one) + `keystore.properties.holidayvote`
(template: `android/keystore.properties.example`; override with `HOLIDAYVOTE_KEYSTORE_PROPERTIES=/path`)
and `play-api-key.json` (Play Console → Setup → API access → service account with release rights for HolidayVote).

| Command | What it does |
|---|---|
| `fastlane android check` | Tests the Play API key, lists the version codes per track |
| `fastlane android build` | Production web build + `cap sync` + signed release bundle (AAB) – nothing uploaded |
| `fastlane android internal` | versionCode = highest on Play + 1, build, upload to internal testing (`status:draft` while the app isn't published) |
| `fastlane android promote` | Latest internal release → production |
| `fastlane android update_metadata` | Texts, icon, feature graphic, screenshots from `android/fastlane/metadata/android/` (no bundle; needs one uploaded build) |
| `fastlane android bump` | Only set versionCode (Play + 1) and versionName (`package.json`) |

## Website

`website/` (landing page, `/join?c=CODE` invite page, `/captcha` bot check, `/datenschutz`, `/nutzungsbedingungen`,
`/support`, `/konto-loeschen`, `/moderation`) is a Cloudflare Worker with static assets (`wrangler.toml`) →
https://holidayvote.support-moidev.workers.dev

```sh
npx wrangler login     # once
npx wrangler deploy
```

## Code map

```
src/
  app/          Root (boot, session, account, invite links), App (tabs + routes), AppContext, theme tokens
  core/         clock, dates, format, ids (uuid v7), config, inviteLink, ogParse (link preview parser)
  data/db/      schema.ts, Db interface, drivers (capacitorDb = phones, webDb/sqljsDb = browser/tests), useLiveQuery
  data/sync/    engine.ts (upload queue + sync_pull), supabase.ts (backend), account.ts (accounts, invites, recovery)
  data/         repositories/ (vacations, properties, votes/vetoes/favourites, comments, kv), demo.ts
  data/media/   previewCache.ts (this phone's link previews + picture files, never synced)
  domain/       models.ts, services/ (ranking, provider, geo)
  native/       captcha, linkPreview (page + picture fetch), files, geocode, browser, share, platform
  features/     onboarding, vacations (list), vacation (houses / map / people), property (detail),
                sharing (account setup, invite), settings (recovery code), debug
  i18n/         de.json, en.json
supabase/       migrations/, functions/ (link-preview, moderation, report-digest), README.md
tests/          unit/, sql/ (PGlite: RLS, RPCs, recovery, two-phone sync), e2e/ (Playwright)
website/        static site (Cloudflare Worker)
```

Rules (as in Esstisch): features never import `data/db` or Capacitor plugins directly; only `data/sync/` talks
to Supabase; every write goes through a repository (stamps `vacation_id`, `created_by`, timestamps); colours only
as tokens in `src/app/theme/tokens.css`; no hard-coded texts.

## Share a holiday-home link into the app

In a browser's Share menu, choose **HolidayVote**. Android opens the app directly.
On iPhone/iPad the share extension saves the link locally; tap Done, then open the app.
After onboarding (or once a vacation exists), pick the vacation the house is added to; the house form opens with the
link prefilled and the title suggested from the page's OpenGraph data. Save creates the house; Cancel discards the
share. Multiple shares wait in a local inbox and are reviewed one at a time.

Website photos are never imported. The form explains that they cannot be copied and encourages taking your own photo.
Only the page HTML is requested for the title; image files are never requested.

iOS signing needs the App Group **group.com.moidev.holidayvote** enabled for both
**com.moidev.holidayvote** and the new extension **com.moidev.holidayvote.share**. Enable/register these
in the Apple Developer account and refresh provisioning profiles before a device/store build.
The extension is embedded automatically by the App target. Native changes require rebuilding
and reinstalling the app (`npm run ios` / `npm run android`), not just refreshing the web app.

## iOS push notifications

The App target enables Push Notifications and uses `App/App.entitlements` for both Debug and Release.
Enable Push Notifications for **com.moidev.holidayvote** in the Apple Developer account and refresh
provisioning profiles before a device/store build. `AppDelegate.swift` forwards APNs registration
success and failure callbacks to Capacitor; keep both callbacks when changing the app lifecycle.

After rebuilding and reinstalling on a device with an account, successful token registration logs
`[push] token registered on server` and creates or updates the iOS row in `public.push_devices`.
Registration failures are reported through the `registrationError` listener.

## Android push notifications

Add Firebase's `google-services.json` for `com.moidev.holidayvote` to `android/app/` (gitignored).
The app requests notification permission and registers its FCM token after an account is available.
Server-side delivery uses a private Firebase service-account key and short-lived OAuth tokens, not
a legacy server key. Migration, secrets, deployment and verification: [backend push setup](supabase/README.md#5-push-notifications).

Tapping a new-house notification opens the house detail page, including when the app was closed.
The tap waits for the app router to start and requests a sync so new houses can arrive on the device.
While the house loads, a loading screen is shown; unavailable houses offer retry and a way back to vacations.
Older notifications linking only to a vacation still open that vacation.

The previous Next.js web version of this app (magic-link login, Vercel) is in the git history before this rewrite.
