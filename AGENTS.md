# canvas-pro — working notes for agents

Local-only Canvas study app for the user's school (djusd.instructure.com).
Vanilla ES modules, no build step, no framework. Runs on the user's machine:

- `npm start` → `python3 server.py` (serves the app + `/api/canvas` proxy on
  ports 8000-8019). Python changes need a full server restart; JS changes just
  need a browser reload (cache-busted `?v=` URLs).

## BRANCH RULES (owner's explicit instructions — never break these)

- **ALWAYS work on the `beta` branch.** Every commit goes here.
- **NEVER push anything from `beta` to `main`** unless the user explicitly
  says to. `main` is the "I'm happy with this" stable snapshot.
- Keep `origin/beta` and `origin/main` up to date after commits when a remote
  is configured (push only the branch you committed to).

## Release / versioning convention

- Every user-facing change bumps the revision stamp and cache keys:
  - `index.html`: `window.__rev = "bNN"` (increment N each change)
  - `index.html`: bump `js/app.js?v=NNN` (css only if styles changed)
- Commit after each meaningful change with a message that starts `Beta: ...`.
- Check `version.json` matches the current channel when validating the badge.

## How to verify before committing

- `npm run check` — node --check on every JS file (syntax).
- `node /var/folders/01/q7pc70z520sf8t15f27kzg4w0000gp/T/opencode/smoke2.mjs`
  — runtime smoke test rendering every view with sample data. Both must pass.

## Architecture

- `index.html` + `css/styles.css` + `js/app.js` (entry, tab router, sync).
- `js/canvas.js` — Canvas REST via the local `/api/canvas` proxy (token never
  leaves the machine; never log or store the token in code).
- `js/data.js` — normalizes courses/tasks/todos from Canvas responses.
- `js/storage.js` — localStorage settings + per-device done-checklist + effort log.
- `js/utils.js` — esc/fmt/daysUntil/toast etc.
- `js/ui/*.js` — one view module per tab. Async views accept a third arg
  `isStale = () => false` (render token from `app.js`) and must bail out before
  writing to the DOM after an `await`.
- `js/schedule.js` — study-plan generator. Never schedules work that is
  submitted on Canvas OR marked done locally (checks `doneIds()` itself).
- `js/syllabus.js` + `js/ui/latelist.js` — syllabus parser + late work manager.
- `js/ui/ai.js` + `/api/ai` in `server.py` — AI chat; provider = opencode
  (local `opencode serve`, optional) | gemini | openai | openrouter | copilot.
- Net-new topics: try to keep the shape match what's already there.

## Security rules

- The Canvas token and AI keys live in localStorage only, sent only to the
  local server on this machine. Never echo them into code, logs, or commits.
- Never commit `.env`-style secrets, auth files, or the user's personal data.