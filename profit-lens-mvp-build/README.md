# ProfitLens

Shopify embedded SaaS that detects hidden profit leaks for merchants: discount overuse, high-refund products, unprofitable orders, and free-shipping margin loss.

## Architecture

pnpm workspace with two apps:

- **`apps/api`** — Fastify + TypeScript backend
  - `src/config` — Zod-validated environment configuration
  - `src/container.ts` — composition root (manual dependency injection)
  - `src/http` — Fastify app, routes (health, OAuth, webhooks, JSON API), session-token auth
  - `src/repositories` — persistence only (Prisma)
  - `src/services` — business logic (auth, order sync, leak detection, dashboard)
  - `src/shopify` — minimal Shopify Admin REST client + HMAC verification
  - `src/queue` — BullMQ queues and workers
  - `src/server.ts` — HTTP server entrypoint
  - `src/worker.ts` — background worker entrypoint
- **`apps/web`** — React + Vite + Shopify Polaris + App Bridge embedded frontend

Infrastructure: PostgreSQL (Prisma), Redis (BullMQ), Docker Compose.

## Data flow

1. Merchant installs the app via OAuth (`/auth` → `/auth/callback`).
2. Install enqueues an initial 90-day order sync (BullMQ `order-sync` queue).
3. The worker syncs orders, then runs the leak detection engine (`leak-analysis` queue).
4. Shopify webhooks (`orders/create`, `orders/updated`, `app/uninstalled`) keep data fresh; order webhooks trigger a debounced re-analysis.
5. The embedded dashboard reads summaries and leaks via the authenticated JSON API (App Bridge session tokens).

## Local development

Prerequisites: Node 20+, pnpm, Docker.

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL + Redis
docker compose up -d postgres redis

# 3. Configure environment
cp .env.example .env   # fill in Shopify credentials

# 4. Create database schema + Prisma client
pnpm db:generate
pnpm db:migrate

# 5. Run the three processes (separate terminals)
pnpm dev:api      # Fastify API on :4000
pnpm dev:worker   # BullMQ worker
pnpm dev:web      # Vite frontend on :3000
```

For Shopify OAuth and webhooks, expose the API publicly (e.g. `cloudflared` or `ngrok`) and set `APP_URL` accordingly. In the Shopify Partner Dashboard set:

- App URL → your `WEB_URL`
- Allowed redirection URL → `{APP_URL}/auth/callback`

Environment variables for the frontend (Vite, build-time): `VITE_SHOPIFY_API_KEY`, `VITE_API_URL`.

## Production (Docker Compose)

```bash
cp .env.example .env   # production values
docker compose up -d --build
```

Services: `postgres`, `redis`, `api` (:4000), `worker`, `web` (:3000, nginx).

Run migrations against the production database before first boot:

```bash
DATABASE_URL=... pnpm db:deploy
```

## Testing & checks

```bash
pnpm test        # vitest unit tests
pnpm typecheck   # strict TypeScript across all packages
pnpm build       # production builds
```

## Health endpoints

- `GET /health` — liveness
- `GET /health/ready` — readiness (database + Redis checks)
