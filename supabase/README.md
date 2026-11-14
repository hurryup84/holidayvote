# Backend setup – Supabase

HolidayVote needs one hosted service: **Supabase** (Postgres database, anonymous accounts, realtime signal,
three small Edge Functions). This is a **new project `holidayvote`** – the old Next.js app's project is not used.
The sync between the phones and the database is part of the app (`src/data/sync/engine.ts` + `sync_pull` in
`migrations/*_changefeed.sql`), exactly as in Esstisch.

## 1. Bot check (Cloudflare Turnstile) – first

Accounts are created only after a Turnstile check (`src/native/captcha.ts` shows `website/captcha.html` in a
frame; the token goes with `signInAnonymously`). Cloudflare dashboard → **Turnstile → Add widget**:
- hostname `holidayvote.support-moidev.workers.dev`, mode **Managed**;
- **site key** → `SITE_KEY` in `website/captcha.html`, then `npx wrangler deploy`;
- **secret key** → asked for by `npm run supabase:setup` (or set `TURNSTILE_SECRET_KEY` before running it).
  It ends up in Supabase → Authentication → Attack Protection → CAPTCHA (`supabase/config.toml` `[auth.captcha]`).

## 2. Create the project (command line, ~5 minutes)

```sh
npm run supabase:setup            # creates project "holidayvote" in Frankfurt
npm run supabase:setup -- <ref>   # or: use an existing project (asks for its database password)
```

`scripts/setup-supabase.sh`: login → create project (eu-central-1, generated DB password – **save it**) → link →
`db push` (all migrations) → `config push` (anonymous sign-ins **on**, e-mail sign-in **off**, CAPTCHA Turnstile) →
writes `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` into `.env.local`.

In the dashboard: **Database → Extensions → pg_cron** must be enabled (the cron migration creates it if allowed).

Without the CLI: create the project in the dashboard, paste `supabase/setup_all.sql` (`npm run supabase:bundle`)
into the SQL editor, turn on *Allow anonymous sign-ins*, turn off the e-mail provider, set CAPTCHA (Turnstile +
secret), copy URL and anon key into `.env.local` (see `.env.example`).

## 3. Edge Functions

```sh
npx supabase functions deploy link-preview                    # link preview for the browser build only
npx supabase functions deploy moderation --no-verify-jwt      # moderation page backend (signed link)
npx supabase functions deploy report-digest --no-verify-jwt   # daily report e-mail
```

`link-preview` is used only by the browser build (CORS); phones fetch the holiday-home page themselves. It returns
the parsed title / text / picture URL and stores nothing. Then put the project URL into `SUPABASE_URL` in
`website/moderation.html` and deploy the website.

## 4. Report e-mail + moderation page (App Store 1.2 / Play UGC: reports handled within 24 h)

Same as Esstisch:
1. https://resend.com → API key.
2. ```sh
   SECRET=$(openssl rand -hex 24); echo $SECRET
   npx supabase secrets set REPORT_DIGEST_SECRET=$SECRET RESEND_API_KEY=re_… REPORT_EMAIL_TO=you@example.org
   ```
3. SQL editor:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<the SECRET>', 'report_digest_secret');
   ```
Daily at 07:00 UTC an e-mail comes **if new reports came in** (no content, only counts), with a 7-day link to
`https://holidayvote.support-moidev.workers.dev/moderation#t=…` (dismiss / remove / remove + ban).
By hand: `select * from moderation_queue;` and `select moderate_report('<report id>', 'remove');`.

## 5. Checks (SQL editor)

```sql
select * from app_config;                                   -- limits, sync_deletes_purged_xid
select jobname, schedule from cron.job;                     -- holidayvote-purge-sync-deletes, -prune-recovery-attempts, -prune-tombstones, -report-digest
select policyname from pg_policies where schemaname = 'realtime';   -- holidayvote_vacation_signal_receive
```

## How it works (short)

- **Accounts:** no login screen. The first "Invite" / "Join" / recovery on a phone runs the bot check and creates an
  anonymous account (`signInAnonymously`); the local placeholder user id becomes the account id and the phone's
  vacations upload. Until then everything stays on the phone.
- **Recovery code:** Settings → "New or lost phone?" shows a code once (`XXXX-XXXX-XXXX`, only its SHA-256 hash is
  stored). New phone: onboarding → "New phone? Restore vacations" → `recover_account(code)` moves memberships,
  owner role, votes, name and accepted terms to the new account and deletes the old one. Max. 10 wrong codes per
  account and hour.
- **Access:** every row has a `vacation_id`; row-level security allows members only. Memberships are created only
  by the server (owner trigger, `accept_invite`). Invites: 6-character codes, valid 14 days, 30 uses.
- **Rules enforced by the server:** only the owner books / eliminates a house or edits the vacation; a house is
  deleted only by the owner or whoever suggested it; votes / veto / favourite / comments are each person's own;
  one veto and one favourite per person and vacation; limits per vacation (`app_config`).
- **Sync:** each phone keeps a full SQLite copy; local changes go through PostgREST upserts (RLS applies);
  `sync_pull(cursors)` returns what changed (rows carry the writing transaction id); every change sends one empty
  Broadcast message to the private channel `vacation:<id>` (members only); the app pulls then, and every minute.
- **No pictures:** there is no storage bucket and no image / image-URL column. `properties.preview_title`,
  `preview_description`, `preview_site` keep the page's preview text (searchable). Each phone caches pictures itself.
- **Delete my data:** `delete_my_account()` leaves every vacation (owner role passes to the longest-standing member,
  the last member's vacation is deleted), then deletes the profile and the auth user.

Tests: `tests/sql/supabase.test.ts` (rules, RPCs, recovery) and `tests/sql/sync.test.ts` (two phones syncing through
the real migrations), both on Postgres via PGlite.
