# Data providers — setup guide

A provider counts as **configured** only when its credentials are present. Settings → Integrations shows the live
status. Run `npm run providers:check <postcode>` after adding keys: it makes real calls and prints what came back.

> Verification status: the build environment's network blocked these hosts. The adapters are written against the
> providers' published documentation and covered by fixture-based tests, but **none has been verified against the
> live service yet**. Run `providers:check` once in your deployment before relying on the results.

## PropertyData — live listings and asking rents (required for Discover)

|           |                                                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplies  | Current listings on PropertyData "sourcing lists" (`/sourced-properties`) with price, beds, type, location and listing link where provided; asking-rent statistics (`/rents`)                             |
| Docs      | https://propertydata.co.uk/api/documentation/sourced-properties · https://propertydata.co.uk/api/documentation/rents                                                                                      |
| Account   | Paid API plan from https://propertydata.co.uk/api/pricing (calls consume credits)                                                                                                                         |
| Env vars  | `PROPERTYDATA_API_KEY` (required), `PROPERTYDATA_LISTS` (comma-separated list IDs, e.g. `unmodernised-properties,reduced-properties`), `PROPERTYDATA_BASE_URL` (default `https://api.propertydata.co.uk`) |
| Licensing | Check PropertyData's terms for displaying and storing data in your app. Valora stores listing records it retrieves, with provenance and retrieval time.                                                   |
| Limits    | Only properties on the chosen sourcing lists are returned, not the whole market. Rents are asking rents, not achieved rents.                                                                              |
| Test      | `npm run providers:check "M20 2AB"` should report listings and a rent average. Then run a Discover search for that area.                                                                                  |

If a field in your plan's response uses a different name, update `SourcedPropertySchema` / `mapSourcedProperty`
in `server/src/providers/propertyData.ts` and the tests in `tests/unit/http-providers.test.ts`.

## HM Land Registry Price Paid Data — sold prices (open data, no key)

|          |                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Supplies | Registered residential sales in England and Wales (price, date, address, type, new-build, tenure)                            |
| Docs     | https://landregistry.data.gov.uk/app/doc/ppd                                                                                 |
| Licence  | Open Government Licence v3.0 — attribution: "Contains HM Land Registry data © Crown copyright and database right"            |
| Env vars | `ENABLE_LAND_REGISTRY` (default true)                                                                                        |
| Limits   | No floor area or condition; 2–8 weeks behind; queried by local authority district (latest 200 sales, same-outcode preferred) |

## postcodes.io — geocoding (open data, no key)

|          |                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------- |
| Supplies | Postcode/outcode/place lookup: coordinates, local authority, nation (used for tax jurisdiction) |
| Docs     | https://postcodes.io/docs                                                                       |
| Env vars | `ENABLE_POSTCODES_IO` (default true)                                                            |

## planning.data.gov.uk — planning designations (open data, no key)

|          |                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Supplies | Conservation areas, listed buildings, Article 4 directions, tree preservation zones, green belt, flood risk zones at a point |
| Docs     | https://www.planning.data.gov.uk/docs                                                                                        |
| Env vars | `ENABLE_PLANNING_DATA` (default true)                                                                                        |
| Limits   | England only; coverage varies by council. Planning application history is **not** included.                                  |

## EPC register — energy ratings and floor areas (free key)

|          |                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Supplies | Domestic EPCs: rating and total floor area, matched to a property by postcode and address                                        |
| Docs     | https://epc.opendatacommunities.org/docs/api/domestic                                                                            |
| Account  | Free registration at https://epc.opendatacommunities.org                                                                         |
| Env vars | `EPC_API_EMAIL`, `EPC_API_KEY`                                                                                                   |
| Note     | MHCLG has announced a replacement EPC data service. If the endpoint changes, update `EPC_BASE` in `server/src/providers/epc.ts`. |

## Anthropic Claude — AI features

|            |                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Supplies   | Brief interpretation, analysis narratives, document extraction, assistant                                                        |
| Docs       | https://platform.claude.com/docs                                                                                                 |
| Account    | API key from https://console.anthropic.com                                                                                       |
| Env vars   | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `AI_DAILY_CALL_LIMIT`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`     |
| Without it | Briefs use the rule-based parser (labelled in the UI); analyses show all figures without a narrative; the assistant is disabled. |

## Resend — email (alerts, password reset)

|            |                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs       | https://resend.com/docs/api-reference/emails/send-email                                                                                                   |
| Env vars   | `RESEND_API_KEY`, `EMAIL_FROM` (an address on a domain verified in Resend)                                                                                |
| Without it | Alerts are in-app only; password-reset requests tell the user email isn't enabled. Valora never reports an email as sent unless the provider accepted it. |

## Test fixtures (development and tests only)

`ENABLE_FIXTURE_PROVIDER=true` adds eight synthetic properties in the fictional town "Testville" (postcode area
`ZZ99`). They are labelled "Test fixtures (not real listings)" everywhere and have no listing links. Production
refuses this setting.
