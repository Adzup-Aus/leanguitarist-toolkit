# Requirements: the next version of the Lean Guitarist app

Approved by Cliff on 18 November 2026. The approved user experience is the clickable mock-up at
https://claude.ai/artifact/CSHYpJRggKWt74wA7aaXMv (version 3). Built under the `adzup-app-build`
skill (`Adzup-Aus/adzup-framework`, `Framework/App_Build/Feature_Into_Existing_App.md`) and the
App Build Principles (`Apps/App_Build_Principles_and_Execution.md` in the same repo).

**This document is the memory of the build.** Every build session starts from this file, not
from any chat. Each session updates the build tracker (section 6) before it ends.

## 1. What the app becomes

A free web app for every Lean Guitarist buyer this year, on the phone or the computer (no
iPhone or Android app). It works like a guitar coach: it listens while the player plays, reacts
on the beat, and leaves a short coach note after every exercise. There is no AI page and no AI
switch. Progress is saved to the player's account and is the same on every device.

Cliff's decisions, 18 November 2026:
- Free for everyone this year. No paywall in the app.
- Supabase on its free plan, kept awake by a daily n8n job.
- Reminders by email only, sent through Resend from leanguitarist.com and logged on the
  buyer's GHL contact. No text messages.
- AI built into the experience, during and after every exercise and drill.
- Microphone now. The camera comes later, as its own opt-in, after a privacy and legal check.
- Added: guitar and bass tuner, metronome, chord library with finger numbers, play-along
  backing track, record and listen back, a paid teacher review bought inside the app.
- The campfire-ready score and the streak stay. No levels, no points, no leaderboards.

## 2. What is there now (main, commit dd24661)

- One static file, `index.html` (about 1,000 lines), plus `sw.js`, `manifest.webmanifest` and
  icons, published by Netlify from `main` on every push.
- Tabs: Chords, Songs (105), Songbook, Strum, Practice (21-day tracker), Fingers (sore-finger
  timer), Ready (campfire checklist).
- Progress in the device's local storage: `ccf_practice`, `ccf_campfire`, `ccf_setlist`,
  `ccf_mysongs`.
- Emailed 6-digit code sign-in (Supabase `signInWithOtp` and `verifyOtp`) and a `progress`
  table sync with a merge on sign-in are written but switched off (`GATE_ON = false`, since
  1 September 2026). Supabase project `leanguitar` (`xoyatbnihfnbovnstewu`).
- supabase-js pinned to 2.112.4 (the `sb_publishable_` key needs 2.111.0 or newer).

## 3. The stack stays as it is

A static web app with no build step: HTML, CSS and plain JavaScript files, Supabase for
accounts and data, n8n for every timed job and every call to GHL, Resend, Baserow or an AI
model (principle 9: engine in n8n, app as the shell). New code goes into separate files
(`js/<feature>.js`, `css/app.css`) loaded by `index.html`, so a session reads only the files
its feature touches.

## 4. Data

Tables in the `leanguitar` Supabase project, each with row level security so a player reads
and writes only their own rows:

| Table | Holds | Written by |
|---|---|---|
| `progress` (exists) | Tracker, checklist, setlist, own songs, as JSON per user | The app |
| `access` | One row per buyer email, with what they own | n8n, from Baserow Buyers (table 857) every 30 minutes |
| `practice_log` | One row per exercise: date, kind, minutes, routine day | The app |
| `measurements` | One row per measured exercise: kind (strum, drill, tuning, chord check, take), the numbers (timing %, changes a minute, gaps, muted strings), tempo | The app |
| `reminders` | Time, days, time zone, skip-if-practised, on or off | The app; read by n8n |
| `coach_notes` | The note written after an exercise | n8n |

No sound is stored in Supabase. Takes the player keeps stay on their device.

## 5. Features, one session each

Each row is one build session, done in order, one at a time. A session builds only its row.

| # | Feature | Done means (tested on the Netlify preview of its pull request) |
|---|---|---|
| F0 | Groundwork: move the CSS and each tab's script out of `index.html` into files, with no change in behaviour. Add the error log on the internal side and the running-cost log (principles 5 and 7) | Every tab works exactly as on the live app, on a phone and a computer, signed out |
| F1 | Sign-in switched on: buyer check against `access`, the "we saved what was on this phone" screen, progress synced. Needs the Supabase setup done first (section 7) | A test buyer signs in on two devices and sees the same ticks; a non-buyer email gets the friendly note; signed out still works |
| F2 | Email reminders: the settings screen, the `reminders` table, the n8n job (every 15 minutes, skips anyone who practised that day), sent through Resend, logged on the GHL contact | A test reminder arrives at the chosen time; one is skipped after practice; off switch works |
| F3 | Practice log, streak (2 rest days a week allowed), campfire-ready score, the new home screen | Minutes add up from the timers; streak and score match the example rules |
| F4 | Microphone permission screen, privacy settings, guitar and bass tuner | Tunes each string on a real guitar; "Not now" leaves tap mode working |
| F5 | Metronome (with tap tempo) and the chord library with finger numbers | Click stays on time at 40 to 200 beats a minute; every diagram shows finger numbers |
| F6 | The 10-minute routine from the 21-day plan, and the 1-minute chord-change drill with its graph | A full routine runs step by step; drill scores save and graph |
| F7 | Play-along: the app's own drum and bass loop under a song's chords, with a speed slider | Plays any library song's chords in time; no recording, melody or lyrics used |
| F8 | The live coach: strum timing on the beat line, cheers during play | Timing matches a click track within a few hundredths of a second |
| F9 | Coach notes after every exercise (numbers from the phone, words from an AI model through n8n and Kie), and "what your coach has seen improve" | A note appears within a few seconds; only numbers are sent |
| F10 | Record and listen back, takes kept on the device | Record, play back, keep, delete; nothing uploaded |
| F11 | Teacher review: "Send this take to a teacher" opens the GHL checkout; after payment and a yes, n8n sends the take to the teacher | Test purchase in GHL test mode; the take reaches the teacher; the purchase is logged for delivery. Waits on the price |
| F12 | String-by-string chord check, and the drill counting changes by ear (beta) | Finds a muted string on a real guitar |
| Later | Camera, as its own opt-in | After a privacy and legal check |

While the app is free, features go live without the legal check (Cliff, 20 November 2026: no
one is paying for it, keep building). The check runs before the app is charged for, and before
any paid feature (F11) goes live.

## 6. Build tracker

Each session updates its own row when it ends.

| # | Status | Session | Pull request | Preview tested | Notes |
|---|---|---|---|---|---|
| F0 | Done, merged 18 Nov 2026 and live | F0 build session, 18 Nov 2026 | [#2](https://github.com/Adzup-Aus/leanguitarist-toolkit/pull/2) | Yes: deploy-preview-2--leanguitar.netlify.app beside app.leanguitarist.com, signed out, at 375 px and 1280 px. Same scripted walk-through on both gave identical results on every tab, and every element on every tab had the same position, size, font and colour. Ticks, checklist and setlist kept after a reload. Live app checked after merge: loads, no errors, old v6 cache replaced by v7 | Files: `css/app.css`; `js/ops.js`, `data.js`, `core.js`, one file per tab, `main.js` (start-up), loaded in that order. `sw.js` now fetches same-origin `.js` and `.css` fresh when online (cached copy offline), so a later deploy reaches returning players without a cache bump; add every new js/css file to `ASSETS` in `sw.js`. `js/ops.js` keeps the error log and running-cost log in memory and the console only (`LGOps.errors`, `LGOps.costSummary()`, `LGOps.copyLog()`); Supabase calls in `core.js` already log to it; F1 sends them on. Found, not fixed (same on live): the Songbook has no button to open "Add your own song", and saved own songs are not listed in the Songbook (`openAddSong` and `openMy` in `js/songbook.js` are never reached from the screen); a later session should add both. The chord pop-up shows a "moveable/barre shape" note, not a diagram, for chords with no stored shape (for example G# after a capo or transpose); F5 (chord library) can cover these |
| F1 | Done, merged 20 Nov 2026 and live. No legal checks while the app is free (Cliff, 20 Nov 2026) | F1 build session, 20 Nov 2026 | [#4](https://github.com/Adzup-Aus/leanguitarist-toolkit/pull/4) | Yes, on commit a01fa7b: deploy-preview-4--leanguitar.netlify.app as device A and the deploy's own address as device B (separate storage), at 800 px and 375 px. Signed out works and keeps ticks after a reload. Test buyer f1-test@leanguitarist.com signed in on both: each showed "We saved what was on this phone" with its own counts, then both showed the same 6 of 21 days, 3 campfire skills and setlist song; a tick on B reached A when A's tab came back into view. Reload keeps the session; sign-out on A left B signed in. f1-nonbuyer@leanguitarist.com got the buyer-list note, was signed out and saved nothing. A brand-new player inserted their own `progress` row, so no new policy was needed. Round 2, commit dbfe968 (after round 1 of the outside check): a clean device shows the saved screen with zero counts; ticks saved at the same time on both devices both reach the account, including a forced write clash; an un-tick and a tick made just before sign-out reach the other device; a failed sign-out says so and stays signed in; the non-buyer note again. Round 3, commit 9600194: with sign-out failing, the non-buyer note and the purchase-check error screen still let the player carry on signed out, and the next start finishes the sign-out. After round 3, commit e17d336: two tabs on one address keep each other's ticks; a background session refresh after choosing to stay signed out does not turn syncing back on; two-device ticks, un-tick, sign-out and the non-buyer note all pass again. Commit 4f9c49c adds Cliff's wording (20 Nov 2026): the privacy line under the email box linking to leanguitarist.com/privacy-policy, and the recent-purchase and info@leanguitarist.com line on the non-buyer note; re-tested on the preview at 375 px and 800 px (two devices, un-tick, sign-out, non-buyer). Live app checked after merge (merge commit 9e14086): loads with no errors, every tab renders, service worker on cache v8 (old caches gone), the sign-in screen with the privacy line shows once, and a test buyer signed in on app.leanguitarist.com, saw "We saved what was on this phone", synced and signed out. Test users, rows and the temporary n8n workflow deleted | Files: `js/account.js` (all sign-in and sync, moved out of `core.js`), sign-in screens in the `#loginGate` overlay, `sw.js` cache v8. The sign-in screen shows by itself once (`lg_signin_seen`). Saving is a three-way merge with a compare-and-set on `updated_at`, so devices never overwrite each other and un-ticks carry across (the last agreed copy is kept per user in `lg_sync_base:<user id>`). Outside check round 1 (Adzup-Aus/leanguitarist-toolkit#4-F1-r1-246da10, US$0.38): Grok passed, GPT-6.2 blocking on 5 items; 4 fixed, 1 answered (test codes came from the admin endpoint, as the brief set). Round 2 (…-r2-b5f457a, US$0.12): Grok passed, GPT-6.2 blocking on 3; 2 fixed (failed sign-out handling), 1 answered (a deliberate un-tick carries to the other device, or no signed-in player could ever un-tick or Reset). Round 3 (…-r3-f1ba4a1, US$0.39): Grok passed, GPT-6.2 blocking on 2 (two open tabs could erase a tick; a session refresh could restart syncing after a failed sign-out); both fixed and tested after the round in e17d336, not yet re-checked because the 3 rounds are used. Round 4 (…-r4-b267f11, covering those fixes and Cliff's wording) was refused by the check job's 3-round cap, which hands the decision to Cliff; Cliff had already said to keep building and put F1 live without coming back to him (20 Nov 2026), so F1 was merged on the session's own tests. Total check cost US$0.89. Test evidence and answers: the shared notes folder, `F1-evidence.md`. Fixed after F1 went live (pull request #6, 20 Nov 2026): (1) `progress` insert and update now also need the player's email on the buyer list (`public.is_buyer()`); tested on the preview: a signed-in non-buyer calling the table directly is refused (42501), a buyer still saves. (2) The daily n8n job "LEA112 | App - remove non-buyer accounts (daily)" (`8ORmvGr3C0IJV5E0`, 3:20am Brisbane) deletes accounts older than a day with no buyer-list row and no saved progress (database function `public.non_buyer_accounts()`, service role only; returns nothing if the buyer list has under 500 rows; the job stops if more than 100 are listed) and deletes app errors older than 60 days. (3) The Practice tab now says "Your progress saves on this device, and on every device you sign in on." (4) Every logged error is also sent to the Supabase table `public.app_errors` (insert only; batched, at most 20 per page load, each once); tested on the preview. Costs stay in the browser because every call is on Supabase's free plan; send them on when a paid call (F9 coach notes) arrives. Still open: 4 accounts made in July and August are not on the buyer list but have saved progress (one is Joakim's test account; three may be buyers who used another email), so the app now tells them their email isn't on the buyer list; the cleanup job leaves accounts with saved progress alone |
| F2 | Built, tested and outside-checked; waiting for Cliff's review on the preview before merging (section 8). No legal checks while the app is free (Cliff, 20 Nov 2026) | F2 build session, 20 Nov 2026 | [#7](https://github.com/Adzup-Aus/leanguitarist-toolkit/pull/7) | Yes, on deploy-preview-7--leanguitar.netlify.app at 375 px, Brisbane time, with the n8n job live on its 15-minute timer. Test buyers on Resend's test inbox (delivered@resend.dev, delivered+f2b@, delivered+f2c@) in `access` as "Sam", and a GHL test contact. First commit: a reminder saved for 6:28 am was sent by the 6:30 run ("10 minutes today, Sam?" from Lean Guitarist <practice@leanguitarist.com>, delivered in Resend, row "sent", note on the GHL contact); after ticking practice day 1, one for 6:36 am was skipped; with the switch off, one for 6:50 am was not sent. Fixed head after round 2 (ef68f36), all in the app and on the normal 7:45 run: a fresh buyer's reminder saved for 7:43 am was delivered; a buyer whose practice tick failed to save had it saved on the device, sent on the next start with its own time, and was skipped; a reminder switched off was not sent. Also tested: a late-night reminder (11:58 pm Moscow) sent after midnight for the right day; a reminder keeps its saved time zone and offers the device's; controls lock while saving; a player not on the buyer list cannot read or write a reminder; one email a day even when the day mark is cleared (Resend refuses the repeat). After round 3 (abf0782): a failed practice save is retried while the app is open; a late older practice is kept as the previous day's. Evidence: shared notes folder, `F2-evidence.md` | Files: `js/reminders.js` (screen in the `#loginGate` overlay, opened from the account screen and a new card on the Practice tab; `notePractised()` on a practice tick, a campfire tick and the practice timer start, saved on the device until the server has it), CSS at the end of `css/app.css`, `sw.js` cache v9, one line in `js/account.js` each for the account-screen button and sending a saved practice time on session start. Database: `docs/sql/002-f2-reminders.sql`, applied 20 Nov 2026: `reminders` (one row per player; row level security for players on the buyer list only; players write only the settings, `saved` and the practised time; a trigger keeps the practised time within the last 24 hours, keeps the previous day's in `prev_practised_at`, stamps the settings time and refuses unknown time zones), `claim_due_reminders()` (reminders due in each player's own zone in the last 45 minutes, today or a late-night one from yesterday, buyers only; marks the local day handled so none goes twice; a time saved after it has passed starts the next chosen day) and `finish_reminder()`, both server key only. n8n: `LEA112 | App - practice reminders (every 15 min)` (`bTwOmNM9O7cJr8ro`, tag LEA112), listed in adzup-framework's Workflow_Inventory.md ([adzup-framework#420](https://github.com/Adzup-Aus/adzup-framework/pull/420)). The subject says "tonight" from 4 pm and "today" before. Outside check: round 1 (Adzup-Aus/leanguitarist-toolkit#7-F2-r1-78cbbfc, US$0.45) Grok passed, GPT-6.2 blocking on 6: 5 fixed, 1 answered (the brief names Resend's test address for delivery proof). Round 2 (…-r2-36c3383, US$0.17) Grok passed, GPT-6.2 blocking on 5, all fixed. Round 3 (…-r3-ef68f36, US$0.18) Grok passed, GPT-6.2 blocking on 2, both fixed and tested after the round in abf0782, not re-checked because the 3 rounds are used. Total check cost US$0.80. Resend: n8n has no LEA112 Resend login (the LEA112 key in Resend is Supabase's sign-in mailer), so the job sends with `INS71 | Resend | send email`, the shared login the Buyers jobs already use for Lean Guitarist; a dedicated `LEA112 | Resend | app reminders` login needs Cliff to paste a new key. Found, not fixed: the email footer says how to switch reminders off in the app but has no one-click unsubscribe link; a failed send is recorded "failed" and not retried that day; GHL marks its contact notes endpoint as deprecated (still works); the n8n description field on the job is empty (setting it needs "Available in MCP" or the n8n screen) |
| F3 | Not started | | | | |
| F4 | Not started | | | | |
| F5 | Not started | | | | |
| F6 | Not started | | | | |
| F7 | Not started | | | | |
| F8 | Not started | | | | |
| F9 | Not started | | | | |
| F10 | Not started | | | | |
| F11 | Not started | | | | |
| F12 | Not started | | | | |

## 7. Setup outside the code (each job in a session of its own, started by the main session)

1. Resume the `leanguitar` Supabase project. Supabase's free plan allows only 2 active
   projects per owner, so the Insight Emails project was moved into our own Postgres server
   on 18 November 2026 to free the slot.
2. Custom email (SMTP) through Resend from leanguitarist.com, the 6-digit code in the email
   template, the site address and the redirect list. Cliff pastes the Resend key.
3. The n8n jobs: `access` list from Baserow every 30 minutes, the daily keep-alive. Cliff
   pastes the Supabase server key into n8n as `LEA112 | Supabase | app accounts`.

## 8. How each session works, so none runs long

- **One feature per session.** A session is started with a short brief: "Build F<n> from
  `docs/001-app-next-version-prd.md`". It reads this file, the files its feature touches and
  nothing else. It does not read old chats.
- **Its own branch and preview.** Branch `f<n>-<short-name>-impl` off `main`. Netlify builds a
  preview for the pull request; the session tests there, never on the live app.
- **Small steps, saved as it goes.** It commits after each working step, so nothing depends
  on a long conversation.
- **Tested, checked, reviewed, then merged.** It runs its "done means" test on the preview and
  records the result in the tracker, then the outside check by two other models (playbook
  section 7a), then Cliff's review on the preview. It merges only after all three.
- **Every report ends with a preview link and Cliff's review** (Cliff, 20 November 2026). Each
  stage session (F0, F1, ...) ends every report with the preview link for its change (the pull
  request's deploy preview), the live link once merged, and a short list of steps to try. Cliff
  reviews the user experience on the preview before the stage is merged and goes live, and his
  feedback is acted on before the merge. The session stays open, without the (F) title mark,
  until he has reviewed.
- **Issues found at the end of a stage go to a connected session** (Cliff, 20 November 2026).
  A new issue with the stage's feature, from its tests, the outside check's notes or Cliff's
  review, is fixed in a session the stage session starts as its own linked session, which
  reports back to the stage session. It is not fixed inside the stage session, and not parked
  in the tracker's Notes for a later stage.
- **It stops when the feature is done.** Anything unrelated it finds goes into the tracker's
  Notes for a later session. If a session gets long before its feature is done, it writes where
  it got to in the tracker and hands over to a fresh session.
- **One at a time.** The main session starts the next feature only after the previous one is
  merged and checked on the live app, because the features share the same files.
- **Every session reports up the chain** (Cliff, 20 November 2026). A fix session reports to
  its stage session; each stage session reports to the build's main session. Cliff watches
  only the main session.
- **The main session only orchestrates** (Cliff, 20 November 2026). It starts sessions, checks
  what they report (pull request, preview, live app), brings Cliff decisions and keeps the plan
  page current. It does no build or setup work itself: Supabase, n8n, GHL, Resend and legal
  checks each go to a session of their own.

## Settled questions

Nothing needs confirmation. Settled:
- The teacher review price is US$47 a review (Cliff set it on 12 Nov 2026; row 451 in the
  Baserow Offers list; the US$19 and US$39-a-month prices were dropped that day). F11 uses the
  offer's checkout as it stands.
- App Pro is out of the paid offer test (dropped 12 Nov 2026; its page is gone). The app is free
  this year. Later it may be charged as an add-on, around US$5 a month (Cliff, 20 Nov 2026);
  that decision comes after launch.
