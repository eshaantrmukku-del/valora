# Deploying Valora

Valora needs a long-running Node 22 server (API plus background worker) and PostgreSQL 14 or later. The built server
also serves the web UI, so one service is enough. Vercel can optionally host the UI in front of it.

## Option 1 — everything on Render (simplest)

1. Render dashboard → **New → Blueprint** → select this repository and branch. `render.yaml` creates:
   - `valora-db` (Postgres)
   - `valora` web service: build `npm ci && npm run build`, start `npm run db:migrate:prod && npm start`, health check
     `/api/health`, worker enabled.
2. Fill the secret variables Render asks for (all optional except `APP_URL`):
   `APP_URL` (the public URL), `ANTHROPIC_API_KEY`, `PROPERTYDATA_API_KEY`, `EPC_API_EMAIL`, `EPC_API_KEY`,
   `RESEND_API_KEY`, `EMAIL_FROM`.
3. Open the service URL, create an account, then check **Settings → Integrations**.

Render's free web services sleep when idle, which pauses the scheduler. Use a paid instance for reliable monitoring,
or run a separate worker service with `npm run worker`.

## Option 2 — UI on Vercel, API on Render

1. Deploy Option 1 first and note the backend URL (e.g. `https://valora-abc.onrender.com`).
2. In `vercel.json`, replace `REPLACE-WITH-YOUR-BACKEND.onrender.com` with that host and commit.
3. Vercel → **Add New → Project** → import the repository. `vercel.json` sets the install command, build command
   (`npm run build:web`) and output directory (`dist/web`). Deploy.
4. Set `APP_URL` on Render to the Vercel URL (used in emails).

Vercel proxies `/api/*` to Render, so the browser treats the session cookie as same-site. No CORS is needed.

## Option 3 — Railway or any Docker/VM host

`railway.json` contains the same build and start commands. On any host:

```bash
npm ci && npm run build
DATABASE_URL=... npm run db:migrate:prod
DATABASE_URL=... NODE_ENV=production APP_URL=https://your.domain npm start
```

Set `DATABASE_SSL=true` if your managed Postgres requires TLS and doesn't use `sslmode` in the URL.

## After deploying

- `GET /api/health` should return `{"ok":true}`.
- With provider keys set, run `npm run providers:check "<a postcode>"` from a machine with the same env vars.
- Back up the database. It holds user accounts and uploaded documents.
