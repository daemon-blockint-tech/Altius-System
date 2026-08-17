# @altius/web

The operational web UI. This is the package the ~43 `widgets/*`, `workshop-ui/*`,
Vertex, Map, Scenario and Mobile backlog rows were blocked on — they were graded
`absent` because no frontend existed, not because the backend could not serve them.

## Decisions

**Vite + React, not Next.js.** There is no SSR or SEO requirement — every view is
behind authentication and reads a governed API. Next.js would add a server tier
that has to be deployed, authenticated and kept in sync with the gateway's
permission model, for no benefit here. A static bundle talking to the existing
API is one fewer thing that can hold a stale copy of an authorization decision.

**`packages/web`, not `apps/web`.** `pnpm-workspace.yaml` already globs
`packages/*`, so turbo picks the package up with no workspace change.

**All data access goes through `@altius/sdk`.** The SDK is generated from the
domain packs (`odl generate sdk`), so its types follow the ontology rather than
being hand-maintained. The UI adds no data access of its own: every read is the
same governed GraphQL surface that REST, MCP and FHIR use, which is what keeps
FGA filtering, field redaction and consent gating in one place server-side.

**Three reasons a value is absent, three renderings.** `consent withheld` when
`_consentRestricted` is set (the server nulls every non-primary field in that
case), `redacted` when the field is named in `_redactedFields`, and `—` when the
value genuinely was not recorded. Collapsing any of these into the others makes
a permission decision read as a statement about the data.

**Redacted ≠ empty.** The server nulls fields the caller may not see and names
them in `_redactedFields`. `ObjectTable` renders those as `redacted`, distinct
from `—` for a genuinely unset value. Rendering both blank would make "you are
not allowed to see this" read as "nobody recorded this" — in a clinical list
that invites someone to fill the gap in. This is pinned by a test.

## Auth

Authorization-code + PKCE against the shipped Keycloak, no dependency —
`crypto.subtle` covers all of it. Two constraints are load-bearing:

- The gateway is sent the **access** token, never the ID token. The realm's
  audience, `tenant_id` and roles mappers all set `id.token.claim: false`, so an
  ID token fails the gateway's audience and tenant checks.
- The SPA reuses client id **`altius`**. The audience mapper lives on that
  client and the gateway binds its expected audience to `OIDC_CLIENT_ID`, so a
  separate client would mint tokens with `aud: account` that get rejected.

Tokens are held in memory only, never `localStorage`. This app reads patient
data, and a persisted token is readable by any XSS and outlives the tab it was
stolen from. A page reload therefore re-runs the redirect — with the IdP session
cookie still valid that is a round trip, not a re-login. The PKCE verifier does
go in `sessionStorage` because it must survive the redirect, but it is
single-use, tab-scoped and worthless without the matching code.

`VITE_OIDC_ISSUER` unset means no OIDC, which is correct against the dev stack
(`NODE_ENV=development` accepts anonymous callers). Production is covered by the
gateway refusing them.

## Live updates

`ObjectTable` takes an optional `subscribe`, wired to the SDK's
`onAnyChange` — the type-level stream, not the per-id one, since a table cares
about rows arriving and leaving as much as about rows changing.

A change event is treated as a signal to **re-read**, not as data to merge. Which
rows belong on a page is decided by server-side filtering, authorization,
redaction and cursor position; patching a row from the event payload would drift
from what the server would actually return, including showing a row the caller
may no longer be allowed to see. Events are coalesced over 250ms so a bulk write
collapses into one refetch instead of a refresh loop.

## Not done yet
- **One view.** The patient worklist exercises the whole path end to end. Other
  object types are the same component with different columns.

## Running

The GraphQL endpoint defaults to a **relative** `/graphql`, so one bundle is
promotable across environments — whatever serves the bundle proxies to the
gateway. Override per environment only if that is not true:

```bash
VITE_OIDC_ISSUER=http://localhost:8180/auth/realms/altius pnpm --filter @altius/web dev
```

```bash
pnpm --filter @altius/web test
```

## Deployment

`packages/web/Dockerfile` builds the bundle and serves it from nginx on 8080,
proxying `/graphql` (including the graphql-ws upgrade) and `/api/` to the
gateway. The `web` service in `Orion/docker-compose.yaml` wires it up.

Serving the API from the **same origin** is the design, not a convenience:

- the bundle can use a relative `/graphql`, so one artifact is promotable
  between environments instead of one build per environment;
- the browser never makes a cross-origin request, so the gateway's
  `CORS_ALLOWED_ORIGINS` is not in the path for this client at all. That setting
  still matters for any browser client served from a different origin — in
  production an unset value denies every cross-origin caller, which the gateway
  warns about at boot.

**Nothing environment-specific is baked into the bundle.** vite inlines `VITE_*`
at build time, so anything set at build pins the image to one deployment — one
image per issuer, and no promotion from staging to production. Instead
`docker-entrypoint.sh` writes `/config.json` at container start from
`OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_REDIRECT_URI`, and the app fetches it
before the first render. Build-time `VITE_*` remain the fallback so `pnpm dev`
works with no container involved.

Only non-secret, client-visible settings belong in that file: it is served to
every browser that loads the app. The API endpoint is not in it at all — it is a
relative path this image's own nginx proxies.

nginx caches `/assets/` hard (vite content-hashes them) and marks `index.html`
`no-store` — otherwise a deploy leaves browsers holding the previous bundle's
asset names. Unknown paths fall through to `index.html` so the OIDC redirect
lands on the app rather than a 404.

