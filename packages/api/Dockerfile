# syntax=docker/dockerfile:1
# API Gateway — GraphQL + REST + FHIR
#
# `deps-app` resolves to the shared install stage in Dockerfile.deps (see
# docker-bake.hcl) — build via `docker buildx bake api` or
# `COMPOSE_BAKE=true docker compose build`, not a plain `docker build -f`.
FROM deps-app AS builder

COPY packages/ packages/
COPY domain-packs/ domain-packs/

RUN pnpm turbo build --filter=@altius/api...

FROM node:20-alpine

RUN apk upgrade --no-cache libcrypto3 libssl3

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"
ENV GIT_REVISION="${GIT_REVISION}"
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json /app/turbo.json ./
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/domain-packs/ domain-packs/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod && \
    rm -rf /root/.cache/node/corepack /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=10 \
    CMD wget --quiet --tries=1 --spider http://localhost:4000/.well-known/apollo/server-health || exit 1

CMD ["node", "packages/api/dist/server.js"]
