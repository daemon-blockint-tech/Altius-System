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

# Nothing environment-specific is baked in. vite inlines VITE_* at build time,
# so anything set here would pin the image to one deployment; OIDC settings are
# written at container start by docker-entrypoint.sh and fetched by the app, and
# the API endpoint is a relative path this image's own nginx proxies.
RUN pnpm turbo build --filter=@altius/web...

# Runtime stage
FROM nginx:1.27-alpine

RUN apk upgrade --no-cache libcrypto3 libssl3

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"

COPY --from=builder /app/packages/web/dist/ /usr/share/nginx/html/
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY packages/web/docker-entrypoint.sh /docker-entrypoint.d/99-altius-config.sh
RUN chmod +x /docker-entrypoint.d/99-altius-config.sh

EXPOSE 8080

# nginx:alpine ships an entrypoint that needs root to bind and drop privileges;
# the worker processes themselves run as nginx.
CMD ["nginx", "-g", "daemon off;"]
