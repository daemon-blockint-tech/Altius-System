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

**Redacted ≠ empty.** The server nulls fields the caller may not see and names
them in `_redactedFields`. `ObjectTable` renders those as `redacted`, distinct
from `—` for a genuinely unset value. Rendering both blank would make "you are
not allowed to see this" read as "nobody recorded this" — in a clinical list
that invites someone to fill the gap in. This is pinned by a test.

## Not done yet

- **Auth is an injected token** (`VITE_ALTIUS_TOKEN`). The real OIDC
  authorization-code flow belongs here next; the client surface does not change
  when it lands. The config deliberately throws when `VITE_ALTIUS_ENDPOINT` is
  missing rather than defaulting, so a misbuilt bundle fails by name instead of
  with an opaque 401 on first query.
- **No live updates yet.** The SDK exposes `onChange` subscriptions and the
  gateway now supports property-level filters; wiring them into `ObjectTable` is
  the next increment.
- **One view.** The patient worklist exercises the whole path end to end. Other
  object types are the same component with different columns.

## Running

```bash
VITE_ALTIUS_ENDPOINT=http://localhost:4000/graphql pnpm --filter @altius/web dev
```

```bash
pnpm --filter @altius/web test
```
