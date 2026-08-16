# Operational web UI — static bundle served by nginx, /graphql proxied to the gateway.
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json tsconfig.build.json ./
COPY packages/ packages/
COPY domain-packs/ domain-packs/
COPY tests/ tests/
COPY tools/ tools/

RUN pnpm install --frozen-lockfile

# VITE_ vars are inlined at build time, so they are build args rather than
# runtime env. The endpoint deliberately is NOT one: it defaults to a relative
# /graphql that this image's own nginx proxies, which is what makes the same
# bundle promotable between environments.
ARG VITE_OIDC_ISSUER=""
ARG VITE_OIDC_CLIENT_ID="altius"
ARG VITE_OIDC_REDIRECT_URI=""
ENV VITE_OIDC_ISSUER="${VITE_OIDC_ISSUER}" \
    VITE_OIDC_CLIENT_ID="${VITE_OIDC_CLIENT_ID}" \
    VITE_OIDC_REDIRECT_URI="${VITE_OIDC_REDIRECT_URI}"

RUN pnpm turbo build --filter=@altius/web...

# Runtime stage
FROM nginx:1.27-alpine

RUN apk upgrade --no-cache libcrypto3 libssl3

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"

COPY --from=builder /app/packages/web/dist/ /usr/share/nginx/html/
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# nginx:alpine ships an entrypoint that needs root to bind and drop privileges;
# the worker processes themselves run as nginx.
CMD ["nginx", "-g", "daemon off;"]
