# syntax=docker/dockerfile:1
# Sync Engine — overlay mode, CDC, and connector management
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json tsconfig.build.json ./
# --parents preserves directory structure so `pnpm install` sees the full
# workspace and resolves against the lockfile before any source is copied —
# this layer then stays cached across source-only changes.
COPY --parents packages/*/package.json domain-packs/*/package.json tests/*/package.json tools/*/package.json ./

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

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

CMD ["node", "packages/sync/dist/server.js"]
