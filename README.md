# Valora — Property Investment Intelligence

UK property investment app: live Discover search, listing Analyse, portfolio, and area intel.

## Stack

- React 19 · React Router 7 · Vite 6
- Live listings via Rightmove typeahead + search (server middleware)
- HM Land Registry sold comps · deterministic finance / condition / score engines

## Run locally

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173**

Optional vision keys (condition from photos): copy `.env.example` → `.env`.

## Production / hosting

Discover and Analyse need the Vite API middleware (`/api/search`, `/api/listing`, `/api/vision`).  
Static GitHub Pages alone is **not** enough.

```bash
npm run build
npm start          # serves dist + APIs on PORT (default 4173)
```

### Deploy live (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/eshaantrmukku-del/valora)

Or connect the repo in [Railway](https://railway.com/new) — it auto-detects `npm run build` / `npm start`.

- Build: `npm ci && npm run build`
- Start: `npm start`
- Env (optional): `OPENAI_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY` for LLM photo analysis

## Tests

```bash
npm run test:intent
npm run test:condition
```

## Routes

| Path | Page |
|------|------|
| `/` | Landing |
| `/analyse` | Paste a listing URL |
| `/analyse/:id` | Investment report |
| `/discover` | Investment briefs → live opportunities |
| `/dashboard` | Overview |
| `/portfolio` | Saved properties |
| `/area-intel` | Postcode area reports |
| `/settings` | Profile & preferences |

## Note

Yields, scores, and works estimates are modelled from live listing text, Land Registry, and rules — verify on the listing and with a survey before offering.
