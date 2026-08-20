# syntax=docker/dockerfile:1
# Action Executor — CEL evaluation and action execution pipeline
#
# `deps-app` resolves to the shared install stage in Dockerfile.deps (see
# docker-bake.hcl) — build via `docker buildx bake actions` or
# `COMPOSE_BAKE=true docker compose build`, not a plain `docker build -f`.
FROM deps-app AS builder

COPY packages/ packages/
COPY domain-packs/ domain-packs/

RUN pnpm turbo build --filter=@altius/actions...

FROM node:20-alpine

RUN apk upgrade --no-cache libcrypto3 libssl3

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"

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

EXPOSE 4002

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD wget --quiet --tries=1 --spider http://localhost:4002/health || exit 1

CMD ["node", "packages/actions/dist/server.js"]
