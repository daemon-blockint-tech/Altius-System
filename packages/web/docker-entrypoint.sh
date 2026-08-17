#!/bin/sh
# Write the runtime config the SPA fetches at startup.
#
# Dropped into /docker-entrypoint.d/, which the nginx:alpine image's own
# entrypoint runs before starting the server. It must NOT exec the command
# itself — that is the parent entrypoint's job.
#
# vite inlines VITE_* at build time, so anything baked in pins the image to one
# environment — one build per issuer, and a bundle that is not promotable from
# staging to production. Writing this file at container start keeps the image
# identical everywhere and moves the environment into deployment config, where
# it belongs.
#
# Only non-secret, client-visible settings go here. Anything in this file is
# served to every browser that loads the app.
set -eu

cat > /usr/share/nginx/html/config.json <<JSON
{
  "oidcIssuer": "${OIDC_ISSUER:-}",
  "oidcClientId": "${OIDC_CLIENT_ID:-altius}",
  "oidcRedirectUri": "${OIDC_REDIRECT_URI:-}"
}
JSON
