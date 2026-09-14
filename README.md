# Canvas Pro

A grade-aware, better Canvas web app. Built to run locally (no build step) and
deploy later to GitHub Pages / Vercel / Netlify for free.

- **Dashboard** — every class and your current grade up front, plus "do these first."
- **Assignments** — every assignment with type, weight, points, and due date.
- **To-Do** — your work ranked by urgency, weight, points at stake, and how far
  your grade is from its **GPA target** (regular = A, honors = B+, AP = B).
- **Grades** — current grades vs targets, GPA estimate.
- **Study Plan** — a nightly schedule that slots homework the day before it's due
  and ramps test prep over the 3 days before each exam, scaled by difficulty.
- **Curve Calc** — see what a curve does to your grade, and share curve history
  to the cloud so future users know how a class has curved before.

## Run locally

```bash
npm start        # serves on http://localhost:8000
```

No install, no build, no internet required beyond Canvas + (optional) Supabase.

## Connect

1. Open Canvas → Account → Settings → *New Access Token*.
2. Paste it in the app with your school's Canvas URL.
3. Your token is stored **only on this device** (your browser's localStorage) and
   is never uploaded anywhere.

> Access is Canvas-email only. The app reads the email from your Canvas profile
> and rejects schools' personal-mail aliases unless you allowlist a domain in
> Settings → Account access.

## Cloud storage (optional, free)

Curve data can sync to a Supabase project so other students later see your
class's curve history. Canvas tokens never go near the cloud.

1. Create a free project at https://supabase.com.
2. Run `supabase/schema.sql` in the SQL editor.
3. In the app: Settings → Cloud storage → paste your project URL + anon key.
4. Hit *Test connection*, then log curves from the Curve Calc tab.

Each logged curve stores: course, test, raw %, class average, curve applied,
target %, and your canvas email (the soft identity). Tokens stay local.

## Versioning

Two channels, controlled by `version.json`:

- `beta`  → tests new features here (badge: BETA).
- `main`  → stable channel (badge: STABLE).

Workflow: make changes on the `beta` branch, test locally, and merge to `main`
when told. Each channel can be deployed to its own sub-path later.

## Privacy summary

| Data | Where |
|------|-------|
| Canvas access token | This device only (localStorage) |
| Canvas profile, classes, grades | This device (cached locally) |
| Curve logs | This device + optional Supabase |
| Supabase URL / anon key | This device only |

## Structure

```
index.html          app shell + onboarding
css/styles.css      theme
js/app.js           bootstrap, tabs, sync
js/canvas.js        Canvas REST client (paged)
js/data.js          normalize courses/assignments/todos
js/storage.js       local settings + Supabase adapter
js/priorities.js    the "what to do first" ranking engine
js/schedule.js      7-day study plan generator
js/curve.js         curve math + history rendering
js/ui/*.js          one renderer per tab
supabase/schema.sql cloud schema (RLS on)
```