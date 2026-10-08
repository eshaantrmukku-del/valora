# Valora — Find value before the market does

An AI-assisted UK property investment platform. Describe an investment goal in plain English; Valora turns it into a
structured Investment Brief, searches connected live listing sources, gathers evidence (sold prices, rents, planning
designations, EPCs), ranks properties against your strategy with transparent scoring, and produces analyses with
deterministic financials and clearly labelled assumptions.

- **Discover**: natural-language goal → editable brief (hard requirements, preferences, investigation criteria) →
  background search → ranked, explained results with save, compare, dismiss and report actions. Briefs can be
  monitored on a schedule.
- **Analyse**: from a provider listing, pasted listing text, an uploaded brochure (PDF or text) or manual entry. Each
  report covers one strategy and includes editable, source-labelled assumptions, scenarios, sensitivity, comparables,
  missing information and a due-diligence checklist.
- **Portfolio**: saved properties (status and notes) and owned properties with recorded valuations and transactions.
- **Compare**: two properties under the same brief and assumptions.
- **Area intel, Tools, Assistant, Settings**.

Without any API keys, Valora still runs: accounts, briefs (rule-based interpretation), manual and pasted-text
analysis, the finance tools, portfolio and comparisons. Live listings need a PropertyData key; AI features need an
Anthropic key. See [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Quick start (local)

Requirements: Node 22+, PostgreSQL 14+.

```bash
npm install
createdb valora                      # or use any Postgres URL
cp .env.example .env                 # set DATABASE_URL; add keys if you have them
npm run db:migrate
npm run dev                          # http://localhost:5173 (API on :3000)
```

To try Discover without a listing provider, set `ENABLE_FIXTURE_PROVIDER=true` (development only) and search for
"3 bed house in Testville under £500k". The results are clearly labelled synthetic test fixtures.

## Tests

```bash
npm run test:unit                    # 66 tests — finance, tax, ranking, parsing, provider mapping, HTTP safety
npm run test:integration             # 26 tests — real Postgres (TEST_DATABASE_URL, default valora_test; reset each run)
npm run build && npm run test:e2e    # 6 Playwright journeys (needs database valora_e2e)
npm run check                        # format + lint + typecheck + unit + integration + build
```

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Short version: Render blueprint (`render.yaml`) for API, worker and
Postgres; optionally Vercel (`vercel.json`) for the UI.

## Documentation

- [AGENTS.md](AGENTS.md) — architecture, conventions, security, commands
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — data providers and credentials
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — hosting
- [docs/HANDOVER.md](docs/HANDOVER.md) — audit, what was rebuilt, verification results, known limitations

Valora provides research support, not financial, legal or tax advice.
