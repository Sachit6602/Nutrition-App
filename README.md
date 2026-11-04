# Nutrition App

A full‑stack nutrition tracker and meal planner:

- Track daily **food intake** (calories + optional macros) and **activity/steps**
- Compute personalized **BMR/TDEE + calorie & macro targets**
- Get **AI meal plans**, **recipe search**, and **recipe analysis** on your own AI key (OpenAI, Claude, Gemini, OpenRouter and more)
- View **monthly summaries**, **insights**, and an **AI coach** (observations + small suggestions)

## Tech stack

- **Frontend**: React + Vite + Tailwind CSS, three.js for the landing page's 3D fruit
- **Backend**: Express 5 running on **Cloudflare Workers** (`httpServerHandler` from `cloudflare:node`)
- **Database**: **Cloudflare D1** (SQLite), schema in `backend/migrations/`
- **Auth**: an HttpOnly session cookie backed by a D1 `sessions` table; passwords hashed with PBKDF2-SHA256 (Web Crypto)
- **AI**: bring-your-own key for OpenRouter, OpenAI, Anthropic, Gemini, Groq, Perplexity, xAI, Mistral or DeepSeek

In production one Worker serves both the API and the built frontend (static assets), so everything is on one origin.

## Repo structure

- `frontend/`: React app (Vite dev server on port 3000)
- `backend/`: the Worker (`server.js`, `wrangler.jsonc`, `migrations/`); `wrangler dev` runs it on port 3001

## Prerequisites

- Node.js 20+
- Nothing else for local development: `wrangler dev` runs the Worker and a local D1 database on your machine
- To deploy: a Cloudflare account (the free plan works for trying it out; see the CPU note under Deploy)

## Local secrets

Copy `backend/.dev.vars.example` to `backend/.dev.vars` and set:

- `API_KEY_ENCRYPTION_KEY`: 32-byte master key (base64 or hex) used to encrypt users' AI provider keys. Required for AI features. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

There is no database URL (D1 is a binding in `wrangler.jsonc`) and no shared AI key (each user brings their own, see below).

## Install

From the repo root:

```bash
npm run install:all
```

## Run locally (dev)

From the repo root:

```bash
npm run dev
```

This applies any new migrations to the local D1 database (stored under `backend/.wrangler/`), then starts the Worker and the Vite dev server.

- Frontend: `http://localhost:3000`
- Worker health: `http://localhost:3001/health`

The frontend dev server proxies `/api`, `/auth`, `/me`, `/ai` and `/health` to the Worker. Those prefixes must match `assets.run_worker_first` in `backend/wrangler.jsonc`.

To look at the local data: `cd backend && npx wrangler d1 execute nutrition-db --local --command "SELECT id, email FROM users"`.

## Deploy to Cloudflare

From `backend/`:

1. `npx wrangler login`
2. `npx wrangler d1 create nutrition-db`, then paste the printed `database_id` into `wrangler.jsonc`
3. `npx wrangler secret put API_KEY_ENCRYPTION_KEY` (paste a new key; keep it, since changing it later makes saved AI keys unreadable)
4. `npm run deploy`: builds the frontend, applies migrations to the remote D1 database, and deploys the Worker

The site is then live at the `*.workers.dev` URL Wrangler prints, with the API on the same origin.

**CPU note:** password hashing uses PBKDF2 at 100,000 iterations, the most Workers allows. That takes about 20-30 ms of CPU per sign-up or login. It fits the Workers Paid plan. On the Free plan's 10 ms per-request budget, logins can be cut off: either upgrade, or lower `PBKDF2_ITERATIONS` in `wrangler.jsonc` (for example to 20000), which makes stolen password hashes easier to crack.

**Free plan limits to know:** 50 D1 queries per request (the 90-day insights use 2) and 50 outbound requests per request (AI calls).

## Key API endpoints

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/status`

### Profile & targets

- `GET /me/profile` (auth)
- `PUT /me/profile` (auth)
- `GET /me/targets` (auth) – returns BMR/TDEE + calories/macros

### Intake & activity

- `POST /me/intake` (auth)
- `GET /me/intake?date=YYYY-MM-DD` (auth)
- `GET /me/intake/calendar?month=YYYY-MM` (auth)
- `GET /me/intake/frequent` (auth)
- `PUT /me/intake/:id` (auth)
- `DELETE /me/intake/:id` (auth)
- `GET /me/saved_foods` / `POST /me/saved_foods` / `DELETE /me/saved_foods/:id` (auth)
- `POST /me/activity` (auth)
- `GET /me/activity?date=YYYY-MM-DD` (auth)
- `GET /me/summary?month=YYYY-MM` (auth)

### AI features

All AI routes need a signed-in user with a saved AI provider key (see below).

- `POST /me/plan_meal` - generates 2 to 3 recipes aligned to profile + overrides
- `POST /me/analyze_recipe` - analyzes a recipe URL
- `POST /me/search_recipe` - searches web for recipe links
- `POST /me/intake/from_image` - estimates foods and macros from a photo
- `POST /me/coach`, `POST /me/coach_summary` - coaching from recent logs
- `GET /me/insights?days=7` (auth, no AI)

### Bring your own AI key (any supported provider)

Each user supplies their own API key once after signing in. The server never uses a shared key for user requests.

- Providers (`backend/ai_client.js` `PROVIDERS`): OpenRouter, OpenAI, Anthropic (Claude, via `@anthropic-ai/sdk`), Google Gemini, Groq, Perplexity, xAI, Mistral, DeepSeek. All but Anthropic use their OpenAI-compatible chat completions endpoint. The provider is detected from the key prefix (`sk-or-`, `sk-ant-`, `sk-proj-`, `AIza`/`AQ.`, `gsk_`, `pplx-`, `xai-`) or picked by the user (needed for Mistral and DeepSeek).
- Default models per provider are in `PROVIDERS`, each overridable by env var (for example `OPENAI_TEXT_MODEL`, `ANTHROPIC_MODEL`, `GEMINI_VISION_MODEL`). Recipe planning uses a web-search model where the provider has one (OpenRouter's Perplexity, Perplexity, OpenAI); elsewhere the model writes recipes itself and is told not to invent links. Photo logging needs a provider with a vision model (all except Perplexity here).
- Storage: the key is verified live with the provider (a free endpoint such as `GET /models`), then encrypted with AES-256-GCM (random 12-byte IV, auth tag, and the user id as additional authenticated data so a ciphertext cannot be moved to another account) and stored in `users.openrouter_key_enc`, with the provider in `users.api_key_provider` (the column names predate multi-provider support). Only the last 4 characters are ever sent back to the browser. It works on any device the user signs in from.
- Master key: `API_KEY_ENCRYPTION_KEY` (32 bytes, base64 or hex). If it is missing, key storage and AI features return `503 VAULT_NOT_CONFIGURED`. Rotating it makes saved keys unreadable, and users are asked to add theirs again.
- The columns are part of `backend/migrations/0001_init.sql`.

Endpoints:

- `GET /ai/providers` (public) -> `{ providers: [{ id, label, keyUrl, placeholder, prefix, vision, webSearch }] }`
- `GET /me/api_key` -> `{ has_key, last4, updated_at, provider, provider_label }`
- `PUT /me/api_key` with `{ "api_key": "...", "provider": "openai" }` (`provider` optional when the prefix is distinctive) -> same shape on success
- `DELETE /me/api_key` -> all fields null / false

Error codes (JSON `{ error, code }`):

| code | status | when |
| --- | --- | --- |
| `API_KEY_FORMAT` | 400 | key is not a 20 to 300 char printable string |
| `API_KEY_PROVIDER` | 400 | the provider can't be told from the key and none was picked |
| `API_KEY_INVALID` | 400 | the provider rejected the key (on save, or a saved key on an AI call) |
| `API_KEY_UNVERIFIED` | 502 | the provider could not be reached to check the key |
| `API_KEY_REQUIRED` | 400 | AI route called with no saved key (or it can no longer be decrypted) |
| `API_KEY_NO_CREDITS` | 402 | the user's provider account is out of credits or quota |
| `API_KEY_NO_VISION` | 400 | photo logging with a provider that has no vision model |
| `API_RATE_LIMITED` | 429 | the provider is rate-limiting the key |
| `AI_DECLINED` | 422 | the model declined the request |
| `VAULT_NOT_CONFIGURED` | 503 | `API_KEY_ENCRYPTION_KEY` is not set on the server |

Tests for the vault and provider client: `cd backend && npm test`.

## Hosting the frontend elsewhere

The default is one Worker for both. To keep the frontend on another host (for example Vercel), build it with `VITE_API_BASE_URL=https://<your-worker>.workers.dev`, and set `ALLOWED_ORIGINS=https://<your-frontend>` and `COOKIE_SAMESITE=none` on the Worker so the session cookie can cross sites.

