# App Review: demo vacation + screen recording

App Review (guideline 2.1, first submission) usually asks for: a screen recording from a physical device,
purpose / audience, test instructions, external services, regions, regulation. Points 2–6 are in
`../metadata/review_information/notes.txt`; `fastlane ios update_metadata` uploads them together with
the demo invite code and the recording from this folder.

> **TODO before the first submission:** the demo vacation below doesn't exist yet. Create it, put its code
> into `invite_code.txt` (until then `update_metadata` stops with "Missing … invite_code.txt") and the
> owner's recovery code into `demo_recovery_code.txt`, then fill in "Current" below.
> Also check the menu paths in `notes.txt` § 3 and in the shot list against the final app.

## 1. Demo vacation for the reviewer (once, renew before each submission)

The reviewer has one device, so they join a prepared vacation to test sharing, rating, reporting and blocking.

1. On a second device or the iOS simulator (a fresh install, **not** your own phone):
   create a vacation **Review trip** (e.g. destination "Baltic Sea", dates next summer), name yourself **Demo**.
2. Add 5–6 holiday homes by link (Airbnb, Booking.com, Vrbo, Novasol …), rate them, set a favourite and a
   veto, write 2–3 comments.
3. "Invite" → note the 6-character code.
4. Make the code last through review (codes normally expire after 14 days, max. 30 uses) –
   Supabase → SQL Editor:
   ```sql
   update public.vacation_invites
      set expires_at = now() + interval '180 days', max_uses = 1000
    where code = 'ABC123';   -- your code
   ```
5. Put the code into `invite_code.txt` in this folder (only the code, e.g. `ABC123`).
6. Settings → "New or lost phone?" → create the recovery code of the Demo account and save it in
   `demo_recovery_code.txt` (gitignored – it's a key to that account). With it the demo account can be
   taken over on another device if the simulator is reset.

Current: **TODO** – code ……, vacation "Review trip", owner "Demo" (device: ……).

Before every submission check that the review trip still has its houses (a reviewer may delete
some) and that the code still works. Reports from reviewers arrive like any other report.

## 2. Screen recording (physical iPhone, latest iOS)

Control Center → Screen Recording, 2–4 minutes, start on the home screen, iPhone language **English**,
Do Not Disturb on. Pause ~2 s on every new screen. Save as `screen-recording.mov` (or `.mp4`) in this
folder – it's gitignored, `update_metadata` attaches it. It has to match the promise in `notes.txt` § 1:

1. Tap the app icon (launch must be visible) → create a vacation (name, destination, dates).
2. "+" → paste a holiday-home link → the preview appears → enter a price → save. Rate it, set it as
   favourite, write a comment.
3. "Join a vacation" → demo code → accept the Terms of Use (open the link once) → "Review trip" opens with
   Demo's houses.
4. Rate a house, veto another one → ranking updates. Open the map.
5. Open a house or comment → "…" → **Report content** → reason → send (toast readable).
6. Members → tap **Demo** → **Report person**, then **Block** → confirm.
7. "Invite" (shows code + share sheet; cancel).
8. Settings → **Delete my data** → confirm → app starts fresh. Stop the recording.

Afterwards: trim only start and end in Photos (keep the app launch), AirDrop it to the Mac, save it here
and run `fastlane ios update_metadata`.
