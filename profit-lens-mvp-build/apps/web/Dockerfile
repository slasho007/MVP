# Build context is the repository root (see docker-compose.yml).
FROM node:20-alpine AS build
RUN corepack enable pnpm
WORKDIR /repo

ARG VITE_SHOPIFY_API_KEY
ARG VITE_API_URL
ENV VITE_SHOPIFY_API_KEY=${VITE_SHOPIFY_API_KEY}
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @profitlens/web...

COPY apps/web apps/web
RUN pnpm --filter @profitlens/web build

# ---- Runtime: static file server ----
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
