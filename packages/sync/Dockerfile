# syntax=docker/dockerfile:1
# Sync Engine — overlay mode, CDC, and connector management
#
# `deps-full` resolves to the shared install stage in Dockerfile.deps (see
# docker-bake.hcl) — build via `docker buildx bake sync` or
# `COMPOSE_BAKE=true docker compose build`, not a plain `docker build -f`.
FROM deps-full AS builder

COPY packages/ packages/
COPY domain-packs/ domain-packs/
COPY tests/ tests/
COPY tools/ tools/

RUN pnpm turbo build --filter=@altius/sync...

FROM node:20-alpine

# Apply OS security patches newer than the pinned base digest
# (openssl libcrypto3/libssl3 CVE-2026-45447, fixed in 3.5.7-r0).
RUN apk upgrade --no-cache libcrypto3 libssl3

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/domain-packs/ domain-packs/
COPY --from=builder /app/tests/ tests/
COPY --from=builder /app/tools/ tools/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod \
    && rm -rf /root/.cache/node/corepack \
              /usr/local/lib/node_modules/npm \
              /usr/local/bin/npm /usr/local/bin/npx

USER node

EXPOSE 4003

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD wget --quiet --tries=1 --spider http://localhost:4003/health || exit 1

CMD ["node", "packages/sync/dist/server.js"]
