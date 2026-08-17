# syntax=docker/dockerfile:1
# Operational web UI — static bundle served by nginx, /graphql proxied to the gateway.
#
# `deps-full` resolves to the shared install stage in Dockerfile.deps (see
# docker-bake.hcl) — build via `docker buildx bake web` or
# `COMPOSE_BAKE=true docker compose build`, not a plain `docker build -f`.
FROM deps-full AS builder

COPY packages/ packages/
COPY domain-packs/ domain-packs/
COPY tests/ tests/
COPY tools/ tools/

# Nothing environment-specific is baked in. vite inlines VITE_* at build time,
# so anything set here would pin the image to one deployment; OIDC settings are
# written at container start by docker-entrypoint.sh and fetched by the app, and
# the API endpoint is a relative path this image's own nginx proxies.
RUN pnpm turbo build --filter=@altius/web...

# Runtime stage
FROM nginx:1.29-alpine

# Upgrade everything, not a hand-kept list. The list was libcrypto3 + libssl3
# and the base image then went stale on c-ares, curl, libexpat, libxml2 and
# nghttp2-libs — 9 HIGH findings whose fixes were already sitting in the alpine
# 3.23 index the image was built from. A named list has to be extended every
# time a different package lags; `apk upgrade` cannot fall behind that way.
# Same branch, so this takes patch updates only.
RUN apk upgrade --no-cache

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"

COPY --from=builder /app/packages/web/dist/ /usr/share/nginx/html/
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY packages/web/docker-entrypoint.sh /docker-entrypoint.d/99-altius-config.sh
RUN chmod +x /docker-entrypoint.d/99-altius-config.sh

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/index.html || exit 1

# nginx:alpine ships an entrypoint that needs root to bind and drop privileges;
# the worker processes themselves run as nginx.
CMD ["nginx", "-g", "daemon off;"]
