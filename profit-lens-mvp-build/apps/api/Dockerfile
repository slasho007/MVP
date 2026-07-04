# Build context is the repository root (see docker-compose.yml).
FROM node:20-alpine AS base
RUN corepack enable pnpm
WORKDIR /repo

# ---- Install dependencies ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @profitlens/api...

# ---- Build ----
FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter @profitlens/api db:generate \
  && pnpm --filter @profitlens/api build

# ---- Runtime ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/node_modules /node_modules
COPY apps/api/package.json ./package.json

USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
