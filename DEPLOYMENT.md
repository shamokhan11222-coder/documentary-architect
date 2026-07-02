# Deploying Stickmax Studio

Stickmax Studio is a standalone TanStack Start web app. Once deployed, open the URL and
use it normally — the Lovable editor is **not** required at runtime.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `LOVABLE_API_KEY` | Yes | Server-side key for all AI generation (auto-provisioned by Lovable Cloud). |
| `SESSION_SECRET` | Yes | Encrypts the private-access session cookie (auto-provisioned). |
| `SITE_PASSWORD` | Optional | If set, turns on the private password gate. If unset, the site is open. |

Set these on your host as server environment variables. Never expose them with
a `VITE_` prefix — they must stay server-only.

## Private access (optional)

- Leave `SITE_PASSWORD` unset → the app is open to anyone with the link.
- Set `SITE_PASSWORD=your-secret` → visitors are redirected to `/unlock` and
  must enter the password. The unlock lasts 30 days per browser. You can lock
  the current browser again from **Settings → Private access**.

## Data & persistence

Project data (topics, research, scripts, storyboards, images, voice, SEO,
ratings, settings) is stored in the browser via `localStorage`, so each device
keeps its own workspace. Use **Settings → Export All (backup)** to move data
between devices or browsers.

## Routing

All routes are file-based under `src/routes/`. Deep links and refresh work on
the deployed URL with no extra redirect config.
