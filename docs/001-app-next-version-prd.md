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

Before anything in F1, F2, F4, F9, F10 or F11 goes live, the `adzup-legal` skill checks what
players see or receive (sign-in emails, reminder emails, the privacy and consent wording, the
privacy policy section), and Cliff approves the emails.

## 6. Build tracker

Each session updates its own row when it ends.

| # | Status | Session | Pull request | Preview tested | Notes |
|---|---|---|---|---|---|
| F0 | Done, merged 18 Nov 2026 and live | F0 build session, 18 Nov 2026 | [#2](https://github.com/Adzup-Aus/leanguitarist-toolkit/pull/2) | Yes: deploy-preview-2--leanguitar.netlify.app beside app.leanguitarist.com, signed out, at 375 px and 1280 px. Same scripted walk-through on both gave identical results on every tab, and every element on every tab had the same position, size, font and colour. Ticks, checklist and setlist kept after a reload. Live app checked after merge: loads, no errors, old v6 cache replaced by v7 | Files: `css/app.css`; `js/ops.js`, `data.js`, `core.js`, one file per tab, `main.js` (start-up), loaded in that order. `sw.js` now fetches same-origin `.js` and `.css` fresh when online (cached copy offline), so a later deploy reaches returning players without a cache bump; add every new js/css file to `ASSETS` in `sw.js`. `js/ops.js` keeps the error log and running-cost log in memory and the console only (`LGOps.errors`, `LGOps.costSummary()`, `LGOps.copyLog()`); Supabase calls in `core.js` already log to it; F1 sends them on. Found, not fixed (same on live): the Songbook has no button to open "Add your own song", and saved own songs are not listed in the Songbook (`openAddSong` and `openMy` in `js/songbook.js` are never reached from the screen); a later session should add both. The chord pop-up shows a "moveable/barre shape" note, not a diagram, for chords with no stored shape (for example G# after a capo or transpose); F5 (chord library) can cover these |
| F1 | Tested on the preview; outside check running | F1 build session, 20 Nov 2026 | [#4](https://github.com/Adzup-Aus/leanguitarist-toolkit/pull/4) | Yes, on commit a01fa7b: deploy-preview-4--leanguitar.netlify.app as device A and the deploy's own address as device B (separate storage), at 800 px and 375 px. Signed out works and keeps ticks after a reload. Test buyer f1-test@leanguitarist.com signed in on both: each showed "We saved what was on this phone" with its own counts, then both showed the same 6 of 21 days, 3 campfire skills and setlist song; a tick on B reached A when A's tab came back into view. Reload keeps the session; sign-out on A left B signed in. f1-nonbuyer@leanguitarist.com got the buyer-list note, was signed out and saved nothing. A brand-new player inserted their own `progress` row, so no new policy was needed | Files: `js/account.js` (all sign-in and sync, moved out of `core.js`), sign-in screens in the `#loginGate` overlay, `sw.js` cache v8. The sign-in screen shows by itself once (`lg_signin_seen`). Found, not fixed: (1) `progress` row level security does not require an `access` row, so a non-buyer calling the API directly could still save their own progress row (their data only); a later session could add that check to the policy. (2) Any email that asks for a code gets a Supabase account, buyer or not; a cleanup job could remove accounts with no `access` row. (3) The Practice tab still says "Your progress saves right here on this device, no login needed". (4) Un-ticking or Reset on one device does not reach a device that still has the tick (the merge keeps both). (5) The error and cost logs (`js/ops.js`) are still in memory only; sending them to the internal side is not done yet |
| F2 | Not started | | | | |
| F3 | Not started | | | | |
| F4 | Not started | | | | |
| F5 | Not started | | | | |
| F6 | Not started | | | | |
| F7 | Not started | | | | |
| F8 | Not started | | | | |
| F9 | Not started | | | | |
| F10 | Not started | | | | |
| F11 | Waiting on the review price | | | | |
| F12 | Not started | | | | |

## 7. Setup outside the code (done by the coordinating session)

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
- **Tested, then merged.** It runs its "done means" test on the preview, records the result in
  the tracker, and merges once the test passes. A step players see or receive also needs the
  legal check and Cliff's yes first.
- **It stops when the feature is done.** Anything else it finds goes into the tracker's Notes
  for a later session. If a session gets long before its feature is done, it writes where it
  got to in the tracker and hands over to a fresh session.
- **One at a time.** The coordinating session starts the next feature only after the previous
  one is merged and checked on the live app, because the features share the same files.

## Needs confirmation

- The teacher review price: US$19 in the offer test plan, US$47 in the buyer record's delivery
  table (`Framework/Tracking/Buyer_Record.md` section 7b).
- Whether App Pro (offer 9, a US$19 pre-sale) comes out of the paid offer test now that the
  app is free this year.
