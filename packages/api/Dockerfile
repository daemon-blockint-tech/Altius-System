# API Gateway — GraphQL + REST + FHIR
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.json tsconfig.build.json ./
COPY packages/*/package.json packages/
COPY domain-packs/*/package.json domain-packs/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY domain-packs/ domain-packs/

RUN pnpm turbo build --filter=@altius/api...

FROM node:20-alpine

RUN apk upgrade --no-cache libcrypto3 libssl3

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"
ENV GIT_REVISION="${GIT_REVISION}"

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json /app/turbo.json ./
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/domain-packs/ domain-packs/

RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune && \
    rm -rf /root/.cache/node/corepack /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node

EXPOSE 4000

CMD ["node", "packages/api/dist/server.js"]
