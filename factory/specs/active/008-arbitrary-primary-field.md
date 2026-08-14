---
id: "008"
title: "Full arbitrary @primary field name support"
agent: claude
risk: medium
verification:
  - "pnpm --filter @altius/odl test"
  - "pnpm --filter @altius/api test"
  - "pnpm --filter @altius/actions test"
  - "pnpm -r typecheck"
  - "pnpm -r test"
grill: completed
---

# Context

The ODL `@primary` directive marks a field as the object identity. The storage
layer stores this value in the system column `_id` (always generated as a UUID
by `genId()`). The `@primary` field is NOT a separate stored column — it is an
**alias** for `_id`.

The validator (Rule 1) currently rejects any `@primary` field not named `id`
with `INVALID_PRIMARY_NAME`. This was added as a guardrail because the API
shapers read `obj._${field.name}` for primary fields, which only resolves to
`obj._id` when the field is named `id`.

**Product decision**: support arbitrary primary field names (e.g. `mrn: ID!
@primary`). The primary field remains an alias for `_id` — it does NOT get its
own column. The field name is the user-facing label for the system identity.

# Acceptance Criteria

1. **Validator**: `@primary` may be applied to any field named anything, as
   long as it has type `ID!`. Remove the `INVALID_PRIMARY_NAME` check. Keep
   `MISSING_PRIMARY` and `MULTIPLE_PRIMARY`.

2. **API shapers**: For a primary field, read `obj._id` (the system identity)
   and expose it under the field's name. Both REST (`objectToRest`) and GraphQL
   (`objectToGraphQL`) must use `obj._id` — not `obj._${field.name}`.

3. **Identity extraction**: All consent-filtering and link-resolution code that
   extracts the primary ID from an object must read `item._id`, not
   `item[primaryField.name]`.

4. **Field permissions**: `deriveSensitiveFieldDefaults` and
   `validateFieldPermissions` in schema-loader must use the actual primary
   field name (not hardcoded `'id'`) when building the visible/stored field
   list.

5. **Action executor**: `addIdAlias` must alias `obj._id` to the actual primary
   field name from the schema, not hardcoded `'id'`. When schema is
   unavailable, fall back to `'id'`.

6. **Tests**: Add a test that defines an ObjectType with a non-`id` primary
   field (e.g. `mrn: ID! @primary`), creates an object, and verifies:
   - The field validates without error
   - The API response exposes `mrn` with the value of `_id`
   - Consent filtering works (uses `_id` for identity)
   - CEL expressions can reference `object.mrn`

# Constraints

- Do NOT add a separate stored column for the primary field. It remains an
  alias for `_id`.
- Do NOT change the storage layer (`createObject`, `updateObject`, etc.). The
  system `_id` generation stays as-is.
- Do NOT change LinkType validation (Rule 11 still requires `id: ID!`).
- Preserve backward compatibility: `id: ID! @primary` must continue to work
  exactly as before.

# Review Notes

- The `addIdAlias` function needs schema access. Check all call sites to ensure
  schema is available, or pass the primary field name as a parameter.
- The REST `objectToRest` and GraphQL `objectToGraphQL` share the same pattern
  (`obj[_${field.name}]`). Both need the same fix.
- There are ~6 identity-extraction sites in route-generator.ts and ~3 in
  resolver-generator.ts that read `item[primaryField?.name ?? 'id']`.
