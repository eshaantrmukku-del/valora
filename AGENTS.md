# Valora — engineering guide

Read this before changing code. It records the architecture, conventions, commands and the decisions that keep
Valora trustworthy.

## Product rules that the code enforces

1. **No fabricated data.** Unknown values stay `null` and are shown as unknown. Nothing invents listings, rents,
   valuations, refurbishment quotes or planning outcomes. If no live listing provider is configured, Discover says
   so and returns nothing.
2. **The language model never does arithmetic.** All money, yields, tax and scenarios come from
   `shared/finance/*` (deterministic, unit-tested). The AI writes prose from supplied data. A grounding check flags
   numbers in AI prose that don't appear in the source data.
3. **Provenance everywhere.** Property facts carry `factOrigins`. Financial inputs carry provenance (`user`,
   `source`, `default`). Evidence keeps its source, scope and retrieval time.
4. **Strategy-aware, explainable ranking.** Hard constraints exclude. Soft preferences and investigation criteria
   only affect scores. Unknown components score below neutral (`UNKNOWN_COMPONENT_SCORE = 40`), so missing data never
   helps a property. Confidence measures how much of the weighted brief could be assessed.
5. **Snapshots.** Analyses and search results store facts, evidence and criteria as they were, so old reports never
   change silently.
6. **No scraping.** Valora never fetches property-portal pages or arbitrary user URLs. Outbound HTTP is limited to an
   allowlist of provider hosts (`server/src/lib/http.ts`).
7. **Test-only switches are refused in production:** `ENABLE_FIXTURE_PROVIDER`, `ENABLE_FAKE_AI` and
   `DISABLE_RATE_LIMIT`.

## Architecture

```
web/            React 19 + React Router (the original Valora UI, rewired to the API) — Vite build → dist/web
server/src/     Fastify 5 API + background worker — esbuild → dist/server
  app.ts        plugins, CSRF header check, session resolution, error mapping, route registration, static UI
  config.ts     every environment variable, validated with zod
  db/           Drizzle schema (schema.ts), client, migrate.ts — migrations in /drizzle
  auth/         scrypt password hashing, DB-backed sessions (only token hashes stored)
  routes/       one file per domain (auth, preferences, briefs, discover, properties, analyses, saved,
                comparisons, portfolio, notifications, documents, assistant, dashboard, area, system)
  services/     discover pipeline, evidence gathering, analysis, monitoring, notifications, documents, email
  domain/       pure logic: ranking, signals, comparables, rule-based brief interpreter
  providers/    PropertyData, HM Land Registry, postcodes.io, EPC, planning.data.gov.uk, fixtures, cache
  ai/           Anthropic client, brief extraction, narrative, document extraction, assistant (read-only tools)
  jobs/         Postgres job queue (FOR UPDATE SKIP LOCKED) and worker/scheduler
shared/         zod schemas and pure modules used by server and web: brief, property, ranking types, finance
tests/          unit (vitest), integration (vitest + real Postgres), e2e (Playwright)
legacy/         the previous client-only prototypes, kept for reference only; not built or deployed
```

The web app talks only to `/api/*`. The server owns secrets, provider access and all calculations.

### Background work

Searches, AI narratives, document extraction and email delivery run as jobs in the `jobs` table. A worker starts
inside the web process when `RUN_WORKER=true`, or runs separately with `npm run worker`. The scheduler, part of the
worker, enqueues due brief monitors every minute and records `last_run_at` / `next_run_at` / `last_status`.

### Data ownership

Every user-owned table has `user_id … on delete cascade`, and route handlers always filter by the signed-in user.
`properties.owner_user_id` is `NULL` for provider listings (public listing data shared across users) and set for
private records a user entered or uploaded. `getAccessibleProperty` / `getOwnedProperty` enforce this. Postgres
row-level security is not enabled; isolation is enforced in the service layer and covered by integration and E2E
tests.

## Commands

```bash
npm install
cp .env.example .env              # then edit
npm run db:migrate                # apply migrations (dev, from source)
npm run dev                       # API on :3000 (tsx watch) + Vite on :5173 with /api proxy
npm run build                     # dist/web + dist/server
npm run db:migrate:prod && npm start   # production

npm run format:check && npm run lint && npm run typecheck
npm run test:unit                 # pure logic, no DB
npm run test:integration          # needs Postgres: TEST_DATABASE_URL (default valora_test) — DB is reset
npm run build && npm run test:e2e # Playwright; needs Postgres valora_e2e (reset) — uses fixtures, no keys
npm run check                     # format, lint, typecheck, unit+integration, build
npm run providers:check M20 2AB   # live smoke test of configured providers (spends PropertyData credits)
npm run db:generate               # after editing server/src/db/schema.ts — commit the generated SQL
```

## Conventions

- TypeScript strict on the server and shared code. The web app is the original JSX UI. New web code may use JSX, but
  shared logic belongs in `shared/` (typed) and is imported from there.
- Validate every request with zod (`parse()` in `lib/validate.ts`). Throw `AppError` for expected failures. Clients
  receive `{ error: { code, message, details } }`.
- Validate external responses at runtime (zod `safeParse`). Drop invalid records rather than guessing.
- Business logic stays out of routes and React components. Put it in `domain/`, `services/` or `shared/`.
- Every state-changing request from the browser must send `X-Valora-Client: 1` (the `api()` helper does this).
- Prompts are versioned constants (`*_PROMPT_VERSION`) and stored with the outputs they produce.
- Tax rules live in `shared/finance/tax.ts` as dated rule sets with `lastReviewed`. Update them when rates change and
  add tests with independently checked figures.
- Don't log secrets, cookies, tokens or prompt contents. `ai_usage` stores counts only.

## Security notes

- Sessions: random 256-bit tokens in httpOnly, SameSite=Lax cookies (Secure in production). The DB stores SHA-256
  hashes. Password reset tokens are single-use, last one hour, and revoke all sessions when used.
- Passwords: scrypt (N=16384, r=8, p=1), minimum 10 characters, with timing equalisation on unknown accounts.
- CSRF: custom-header requirement on all non-GET API requests, plus SameSite cookies. No CORS is enabled.
- Rate limits: global 300/min/IP, with tighter limits on auth, interpretation, search, analysis and uploads.
- Uploads: PDF/plain text only, detected by magic bytes. Size-limited (`MAX_UPLOAD_MB`), stored in Postgres, parsed
  without executing content.
- AI: untrusted listing and document text is wrapped in tags and marked as data. Assistant tools are read-only,
  scoped to the user and validated with zod. Daily per-user AI call cap (`AI_DAILY_CALL_LIMIT`).
- CSP via helmet. Images may load from https sources; scripts only from self.

## Key decisions

| Decision                                        | Why                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Fastify + Postgres + Drizzle, single deployable | Long-running searches and schedulers need a real server, not serverless functions                                |
| Own session auth instead of a hosted provider   | No external dependency or keys needed to run; standard, auditable implementation                                 |
| PropertyData as the listing provider            | One of the few UK APIs that licenses current-listing data; Rightmove/Zoopla have no open API and forbid scraping |
| Rule-based fallback interpreter                 | Valora stays usable without an AI key; the UI labels which interpreter was used                                  |
| Claude (`claude-opus-5-5`) via the official SDK | Structured outputs validated with zod; server-side refusal fallback enabled                                      |
| Keep the original UI                            | Product owner's requirement; only the data layer was replaced                                                    |
