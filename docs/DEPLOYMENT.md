# Deploying Valora

Valora needs a long-running Node 22 server (API plus background worker) and PostgreSQL 14 or later. The built server
also serves the web UI, so one service is enough. Vercel can optionally host the UI in front of it.

## Database: Supabase

Valora uses Supabase only as its Postgres database, through a direct connection string. It does not use the
Supabase JS client, Supabase Auth or the publishable/anon keys: accounts, sessions and data access are handled by
Valora's own server.

1. Supabase dashboard → your project → **Connect** → **Session pooler** → copy the URI
   (`postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`).
   Use the session pooler, not the direct connection: the direct host is IPv6-only, which many hosts (including
   Render) can't reach. Don't use the transaction pooler (port 6543) for Valora's long-running server.
2. Replace `[YOUR-PASSWORD]` with the database password (Project Settings → Database → reset it if you don't know it).
   URL-encode special characters in the password.
3. Put the result in `DATABASE_URL` on your host. Never commit it or paste it into chat. TLS is enabled
   automatically for Supabase hosts. Keep `DATABASE_POOL_MAX=5` on the free tier.
4. Tables are created by `npm run db:migrate:prod`, which the Render start command runs on every deploy. You'll see
   them in Supabase's Table Editor afterwards.

Supabase's free tier pauses projects after a period of inactivity; resume the project from the dashboard if the
health check starts failing.

## Option 1 — everything on Render (simplest)

1. Render dashboard → **New → Blueprint** → select this repository and branch. `render.yaml` creates the
   `valora` web service (the database is Supabase — see above): build `npm ci && npm run build`, start `npm run db:migrate:prod && npm start`, health check
   `/api/health`, worker enabled.
2. Fill the secret variables Render asks for: `DATABASE_URL` (Supabase session pooler string, required),
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
