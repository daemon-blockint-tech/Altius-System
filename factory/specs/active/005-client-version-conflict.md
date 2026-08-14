---
id: "005"
title: "Client-facing optimistic concurrency (If-Match + GraphQL expectedVersion)"
agent: claude
risk: medium
verification:
  - "pnpm --filter @altius/api test"
  - "pnpm --filter @altius/actions test"
  - "pnpm -r typecheck"
  - "pnpm -r test"
grill: completed
---

# Context

`expectedVersion` exists in the SPI (`updateObject` signature), the engine
layer (`ObjectManager.update`), and the action executor (forwards
`expectedVersion` from the action context version chain). But no client-facing
API accepts a version to compare against. Concurrent client writes silently
last-write-wins.

The storage layer already raises `VERSION_CONFLICT` (Postgres: follow-up SELECT
distinguishes not-found vs version-mismatch; Memory: throws on mismatch).

**Product decision**: expose optimistic concurrency through both surfaces:
- **REST**: `If-Match: <version>` header on PUT/PATCH/DELETE; return
  `412 Precondition Failed` on conflict.
- **GraphQL**: optional `expectedVersion: Int` input field on update mutations;
  return `VERSION_CONFLICT` error code.

# Acceptance Criteria

1. **REST**: PUT/PATCH/DELETE endpoints for objects accept an `If-Match`
   header. The header value is the expected `_version` (integer). When
   present, it is forwarded as `expectedVersion` to `ObjectManager.update` /
   `ObjectManager.delete`.

2. **REST**: On `VERSION_CONFLICT`, return `412 Precondition Failed` with a
   `VERSION_CONFLICT` error code in the response body. On not-found (no
   `If-Match`), return `404` as before.

3. **GraphQL**: Update mutations (`updateFoo(input)`) accept an optional
   `expectedVersion: Int` field in the input. When present, it is forwarded
   to `ObjectManager.update`.

4. **GraphQL**: On `VERSION_CONFLICT`, return a GraphQL error with
   `code: VERSION_CONFLICT` in the extensions. The existing error mapper in
   `graphql/errors.ts` should handle this.

5. **Tests**:
   - REST: send `If-Match: 1` on a PUT when the object is at version 1 →
     succeeds (200). Send `If-Match: 1` when the object is at version 2 →
     returns 412 with `VERSION_CONFLICT`.
   - GraphQL: send `expectedVersion: 1` on an update mutation when at
     version 1 → succeeds. Send `expectedVersion: 1` when at version 2 →
     returns `VERSION_CONFLICT` error.

# Constraints

- `If-Match` header is optional. When absent, behavior is unchanged (no
  version check, last-write-wins — backward compatible).
- `expectedVersion` GraphQL field is optional. When absent, behavior is
  unchanged.
- Do NOT change the storage layer. It already supports `expectedVersion` and
  raises `VERSION_CONFLICT`.
- Do NOT add `expectedVersion` to action mutations — actions manage their own
  version chain internally.
- The DELETE endpoint should also support `If-Match` (forward to storage
  delete if the storage signature supports it, or fetch-then-check if not).

# Review Notes

- Check if `ObjectManager.delete` accepts `expectedVersion`. If not, either
  add it or do a get-then-compare in the REST handler.
- The REST error mapper in `rest/errors.ts` may already map
  `VERSION_CONFLICT` — verify the HTTP status it assigns.
- The GraphQL error mapper in `graphql/errors.ts` may already map
  `VERSION_CONFLICT` — verify the error code it exposes.
- The `If-Match` header value should be parsed as an integer. Invalid
  non-integer values should return `400 Bad Request`.
