# Security Service — OIDC auth, OpenFGA authorization, audit, consent
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy lockfile and workspace config first for dependency caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.json tsconfig.build.json ./

# Copy only package.json files and proto (excluded: .ts, .turbo, tests, tools sources)
COPY packages/*/package.json packages/
COPY domain-packs/*/package.json domain-packs/

RUN pnpm install --frozen-lockfile

# Copy source after dependencies resolve (source changes don't invalidate dep layer)
COPY packages/ packages/
COPY domain-packs/ domain-packs/

RUN pnpm turbo build --filter=@altius/security...

FROM node:20-alpine

RUN apk upgrade --no-cache libcrypto3 libssl3

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json /app/turbo.json ./
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/domain-packs/ domain-packs/

RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune && \
    rm -rf /root/.cache/node/corepack /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node

EXPOSE 4004

CMD ["node", "packages/security/dist/server.js"]
