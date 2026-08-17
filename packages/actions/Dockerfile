# syntax=docker/dockerfile:1
# Action Executor — CEL evaluation and action execution pipeline
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.json tsconfig.build.json ./
# --parents preserves the packages/<name>/ and domain-packs/<name>/ directory
# structure for each matched package.json (plain wildcard COPY collapses every
# match into a single flat file, silently breaking the workspace).
COPY --parents packages/*/package.json domain-packs/*/package.json ./

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

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
    pnpm store prune && \
    rm -rf /root/.cache/node/corepack /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node

EXPOSE 4002

CMD ["node", "packages/actions/dist/server.js"]
