# API Specification Artifacts

> **Document role (renewed 21 Aug 2026):** operational guide for generating and validating API artifacts. It is not a parity score or proof that every generated field has a reachable implementation.

Altius publishes three machine-readable API contracts. After the packages are built, the explicit `spec:all` task generates them from the merged schema; the tag-triggered release workflow attaches them to the corresponding GitHub release.

## Artifacts

| File | Format | Covers |
|------|--------|--------|
| `openapi.yaml` | OpenAPI 3.0.3 | REST endpoints — CRUD, actions, filters, pagination |
| `schema.graphql` | GraphQL SDL | Full GraphQL API — queries, mutations, subscriptions |
| `asyncapi.yaml` | AsyncAPI 2.6.0 | WebSocket subscription channels and event payloads |

## Where to Find Them

- **Release assets** — attached to every `v*` tagged release on GitHub
- **Local generation** — `pnpm --filter @altius/api spec:all` writes all three to `packages/api/spec/`
- **Live endpoint** — `GET /api/v1/openapi.json` returns the OpenAPI spec from the running server

## Generating Specs Locally

```bash
# Build first (CLIs run from dist/)
pnpm run build

# Generate all three
pnpm --filter @altius/api spec:all

# Or individually
pnpm --filter @altius/api spec:openapi spec/openapi.yaml
pnpm --filter @altius/api spec:graphql spec/schema.graphql
pnpm --filter @altius/api spec:asyncapi spec/asyncapi.yaml
```

The specs reflect whichever domain packs are configured via `DOMAIN_PACKS_DIR`,
`DOMAIN_PACKS`, and `DOMAIN_PACKS_EXTRA_DIRS`. To generate for a specific pack
combination:

```bash
DOMAIN_PACKS=core,nhs-acute pnpm --filter @altius/api spec:all
```

## Pack Composition

The generated specs cover **all loaded packs**. If you load packs `core` +
`nhs-acute` + `my-custom-pack`, the OpenAPI spec will contain routes for every
object type and action across all three.

To generate a spec for a subset of packs, set `DOMAIN_PACKS` before running the
dump CLI.

## Consuming from Other Languages

### Python (openapi-generator)

```bash
openapi-generator-cli generate \
  -i openapi.yaml \
  -g python \
  -o ./generated/python \
  --additional-properties=packageName=altius
```

### Rust (progenitor / openapi-generator)

```bash
# Using openapi-generator
openapi-generator-cli generate \
  -i openapi.yaml \
  -g rust \
  -o ./generated/rust

# Or using progenitor (Oxide's Rust-native generator)
# Add to build.rs — see Phase 1 of the SDK plan
```

### TypeScript (graphql-codegen)

```bash
npx graphql-codegen \
  --schema schema.graphql \
  --generates ./generated/types.ts
```

### AsyncAPI (any language)

```bash
npx @asyncapi/generator asyncapi.yaml @asyncapi/typescript-template -o ./generated/events
```

## Versioning

Spec artifacts are intended to follow their own semver track, independent of the platform version. The previously referenced `.avril/plan/plan-sdk.md` is not present in this repository, so it is not a maintained source of policy.

**Target compatibility contract:** SDK `1.x` works against any spec `1.x` deployment; a spec major bump requires an SDK upgrade. Until this is backed by a maintained compatibility policy and cross-version tests, verify the SDK against the generated artifacts for the release being consumed.

## Validation

The spec round-trip test (`src/__tests__/spec-roundtrip.test.ts`) validates:

- All OpenAPI `$ref` pointers resolve to defined component schemas
- Every path operation has at least one response defined
- GraphQL SDL parses without errors and contains Query, Mutation, Subscription roots
- AsyncAPI channels have valid payloads with required ChangeEvent fields
- All three specs cover the same set of object types (cross-spec consistency)

Run the validation:

```bash
pnpm --filter @altius/api test spec-roundtrip
```

## CI Release Workflow

The `.github/workflows/release.yml` workflow runs on every `v*` tag push:

1. Install dependencies and build
2. Run tests
3. Generate spec artifacts via `spec:all`
4. Upload `openapi.yaml`, `schema.graphql`, and `asyncapi.yaml` to the GitHub release
