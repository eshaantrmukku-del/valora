# Valora 2.0 — audit and handover

Date: 8 October 2026.

## 1. Audit of the previous implementation (preserved in `legacy/`)

| Area                  | Finding                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack                 | Vite 6 + React 19 client-only app; the API was Vite dev-server middleware (`vite preview` in production)                                           |
| Auth                  | "Accounts" stored in `localStorage` with an unsalted client-side SHA-256 hash: no real authentication or isolation                                 |
| Data                  | Everything in `localStorage`: briefs, portfolio, analyses, "monitoring" (a browser timer)                                                          |
| Listings              | Scraped Rightmove search pages via a third-party proxy (`r.jina.ai`) and fetched portal pages for "Analyse URL" — against portal terms and fragile |
| Area intel            | Hard-coded regional averages presented as area reports                                                                                             |
| Finance               | Deterministic, but England-only SDLT, with no provenance or dated rules                                                                            |
| AI                    | Optional photo-condition classification; no structured brief extraction or grounded narratives                                                     |
| Tests                 | Ad-hoc scripts; no test framework, CI, typecheck or lint                                                                                           |
| Database / migrations | None                                                                                                                                               |

Root causes: no backend, no persistence, data sourced by scraping, and no separation between facts, estimates and AI
output.

**Kept:** the entire UI (pages, components, styles, illustrations, logo), at the product owner's request. Only its
data layer was replaced. **Moved to `legacy/`:** the old client logic and static prototypes.

## 2. What was built

- Backend: Fastify 5, PostgreSQL, Drizzle migrations (29 tables), session auth, zod-validated APIs, a Postgres job
  queue and scheduler, and structured logging with redaction.
- Domain: versioned Investment Brief schema (hard/soft/investigation criteria, strategy weights); rule-based
  interpreter; strategy-aware ranking engine with explanations and confidence; deterministic finance engine
  (rental, renovate-and-resell, scenarios, sensitivity) with dated SDLT/LBTT/LTT rules.
- Providers: PropertyData (listings and rents), HM Land Registry, postcodes.io, planning.data.gov.uk, EPC, all behind an
  allowlisted HTTP client with retries, timeouts, size limits and a Postgres cache; test fixtures for automated
  tests.
- AI (Claude via the official SDK): brief extraction, analysis narratives with a numeric grounding check,
  quote-verified document extraction, and an assistant with read-only workspace tools. Includes cost caps,
  timeouts, retries and server-side refusal fallback. Every feature degrades to a clearly labelled non-AI mode.
- UI: the original Valora interface, rewired to the API, plus onboarding, password reset, an analysis assumptions
  editor, a brief editor, an owned portfolio, the assistant, a property page, alerts and integrations status.

## 3. Verification (run on 8 Oct 2026 in the build environment)

| Check                                   | Result                              |
| --------------------------------------- | ----------------------------------- |
| `npm run format:check`                  | pass                                |
| `npm run lint`                          | pass (0 problems)                   |
| `npm run typecheck`                     | pass                                |
| Unit tests                              | 66 passed                           |
| Integration tests (real Postgres 16)    | 26 passed                           |
| Playwright E2E (journeys A–F, Chromium) | 6 passed                            |
| Production build                        | pass (web ≈577 kB JS, gzip ≈164 kB) |
| Migrations on an empty database         | pass                                |
| Production boot                         | pass; test-only switches refused    |

Fixture-based tests prove the pipeline and UI work; they do **not** prove the live provider integrations. Outbound
access to the data providers' hosts was blocked in the build environment.

## 4. Status by feature

| Feature                                                                        | Status                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Accounts, sessions, password change, account deletion                          | Implemented and tested                                                                              |
| Password reset                                                                 | Implemented and tested; sending email needs Resend keys                                             |
| Onboarding and preferences                                                     | Implemented and tested                                                                              |
| Investment Briefs (interpret, edit, save, rename, duplicate, activate, delete) | Implemented and tested (rule-based interpreter); AI interpretation needs `ANTHROPIC_API_KEY`        |
| Discover live search                                                           | Pipeline implemented and tested with fixtures; **awaiting `PROPERTYDATA_API_KEY` and a live check** |
| Ranking, explanations, confidence                                              | Implemented and tested                                                                              |
| Analysis (manual, pasted text, brochure upload, provider listing)              | Implemented and tested; AI narrative needs the Anthropic key                                        |
| Evidence: sold prices, planning, geography                                     | Implemented; live calls not verified from the build environment                                     |
| Rental evidence                                                                | Implemented; needs the PropertyData key                                                             |
| EPC enrichment                                                                 | Implemented; needs EPC keys                                                                         |
| Finance engine and tax rules                                                   | Implemented and tested against hand-worked examples                                                 |
| Saved properties, owned portfolio, comparisons                                 | Implemented and tested                                                                              |
| Monitoring scheduler and alerts                                                | Implemented and tested (baseline, price change, schedule); email delivery needs Resend              |
| Assistant                                                                      | Implemented; needs the Anthropic key (the test stub only exercises plumbing)                        |
| Area intel                                                                     | Implemented with real sources; live calls not verified here                                         |

## 5. Environment variables

See `.env.example` (placeholders only) and [PROVIDERS.md](PROVIDERS.md).

## 6. Commands

Database: `npm run db:migrate` (dev) / `npm run db:migrate:prod` (after build). New migration: edit
`server/src/db/schema.ts`, then `npm run db:generate`.
Development: `npm run dev`. Tests: see README. Deployment: [DEPLOYMENT.md](DEPLOYMENT.md).

## 7. Known limitations

- **Live listing coverage** is limited to PropertyData sourcing lists. There is no licensed whole-market feed; Rightmove
  and Zoopla require commercial agreements.
- **Portal URLs** (Rightmove, Zoopla, OnTheMarket) can't be analysed directly. Users paste the text or upload the
  brochure instead.
- **Land Registry** comparables are sampled by district (latest 200 sales) and lack size and condition. Value
  comparisons are indicative.
- **Refurbishment ranges** are planning assumptions per m² (labelled), not quotes.
- **Tax rules** reviewed 8 Oct 2026; update `shared/finance/tax.ts` when rates change.
- **Planning application history** is not integrated (only designations).
- **Image-based condition analysis** from the old prototype was not carried over. Condition signals come from listing
  text, labelled as agent claims.
- **Postgres row-level security** is not enabled; isolation is enforced in the service layer and tested.
- **Web bundle** is a single 577 kB chunk; route-level code splitting would help first load.
- **Free Render instances sleep**, which pauses scheduled monitoring.

## 8. Prioritised next steps

1. Add `PROPERTYDATA_API_KEY`, run `npm run providers:check`, and adjust field mapping if the live schema differs.
2. Add `ANTHROPIC_API_KEY`; review a sample of AI briefs and narratives, and build a small evaluation set.
3. Configure Resend and test password-reset and alert emails end to end.
4. Add CI (GitHub Actions) running `npm run check` and the E2E suite with a Postgres service.
5. Integrate planning application history (e.g. PropertyData `/planning-applications`) and achieved-rent evidence.
6. Code-split the web bundle; add Postgres RLS as defence in depth.
