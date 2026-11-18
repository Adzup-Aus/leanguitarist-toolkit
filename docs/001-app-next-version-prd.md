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
| F0 | Not started | | | | |
| F1 | Waiting on Supabase setup | | | | |
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
