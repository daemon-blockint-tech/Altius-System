# Parity re-grade — 19 Aug 2026, HEAD `96e5b2a`

> **Historical measurement:** retained as reproducible evidence for the named commit. It is not the current parity dashboard; use [../altius-foundry-parity.md](../altius-foundry-parity.md) and the two canonical backlog files for current counts.

The grades in `ALTIUS-BACKLOG.md` are a snapshot from 17 Aug carried forward by hand.
This is a re-measurement against the current tree, taken from source with the external
audit's bar: **demote unless the code proves otherwise**, and a capability counts only
when a user can reach it through a real API against real Postgres.

Everything below is reproducible: `node tools/parity/reachability.mjs`.

## Headline

| Source | full | partial | absent | Basis |
|---|---:|---:|---:|---|
| `ALTIUS-BACKLOG.md` rows at this HEAD | 27 | 160 | **0** | carried-forward prose |
| External audit (`ebba280`) | 2 | 91 | 96 | read from source |
| **This pass — SPI-service capabilities only** | **8** | **9** | **33** | measured, this HEAD |

Two things to take from that.

**The tracker no longer grades anything `absent`.** Its own header still claims
"16 full, 164 partial, 7 absent", but the 187 rows underneath it read 27 `full` and
160 `partial`, and not one `absent`. In a tree where 33 of 50 SPI services are
reachable from nothing, a backlog with zero absent rows has stopped measuring.

**The upgrades came from adding in-memory stubs, not capability.** Phases 5–12 moved
~64 rows from `absent` to `partial`. Of the 50 SPI services those phases produced,
**33 are reachable from no API surface at all** — no REST route, no GraphQL resolver,
no MCP tool. They are exported from a barrel, covered by their own tests, and called
by nothing a user can hit.

## Method

For each SPI service interface, from source, with tests excluded (a test caller is
not a user):

- **inDegree** — non-test files referencing the service, minus its own declaration
  and barrel re-exports. `0` means dead.
- **surface** — which entry points reach it (`rest` / `graphql` / `fhir` / `mcp`),
  resolved transitively: `ObjectSetStore` is reached through `deps.objectSetManager`,
  not directly, and counting only direct reads would misgrade it. Propagation follows
  concrete implementation classes only — the SPI co-declares many services per file,
  and sharing a file is not a call relationship.
- **durable** — whether a Postgres-backed implementation exists. Detected by
  `implements` *and* by the repo's naming convention, because `PostgresAuditStore` is
  structurally typed with no `implements` clause. An in-memory implementation living
  outside `storage-memory` (`InMemoryAgentThreadStore` in `engine/`) is not durable.

Grade mapping: no implementation or no surface → `absent`; reachable but memory-only
→ `partial`; reachable and Postgres-backed → `full`.

**`full` here is necessary, not sufficient.** It says a user can reach a durable
implementation — not that the capability is complete. Rows still need hand-demotion
where behaviour is missing.

## The 8 that reach a durable implementation

`AuditStore` (fhir+graphql+mcp+rest) · `BlobStore` · `BranchStore` · `CommentStore` ·
`EmbeddingStore` · `NotificationStore` · `ObjectSetStore` · `TimeSeriesStore`

## The 9 reachable but memory-only

`AccessExplanationService`¹ · `AlertingService` · `DataFreshnessService` ·
`DatasetService` · `GeospatialMapService` · `JustificationStore` ·
`OntologySqlService` · `OntologyUsageMetricsService` · `ScopedSessionStore`

¹ `AccessExplanationService` is a false demotion by this method: it holds no state and
delegates to the live `AuthorizationService`, so it is real. The measurement has no
category for "stateless and correct", and it is recorded here rather than silently
corrected.

Until `fix/api-withhold-nondurable-services` lands, all of these except
`AccessExplanationService` are wired unconditionally, so on a Postgres deployment
their routes answer 200 and write to a process-local `Map` — lost on restart, never
shared across replicas, and the shipped Helm values run the gateway at
`minReplicas: 2`. Two of them (`JustificationStore`, `ScopedSessionStore`) back
security-governance routes.

## The 33 reachable from nothing

`AgentEvaluationService` · `AgentThreadStore` · `ApprovalWorkflowService` ·
`BatchTransformService` · `BusinessRulesService` · `ChangeProposalStore` ·
`CommandService` · `ConflictResolutionService` · `ConnectorCatalogService` ·
`DataExpectationsService` · `DatasetMetadataService` · `DatasetProjectionService` ·
`EmbeddedCopilotService` · `EmbeddingService` · `EventObjectService` ·
`GraphAnalysisService` · `KioskService` · `LayoutDeviceCaptureService` ·
`ModelChainService` · `ModelInferenceService` · `ModelRegistryService` ·
`ModelingObjectiveService` · `MultiOntologyGovernanceService` ·
`OntologyManagerService` · `PipelineBuildService` · `PlatformAssistantService` ·
`PlatformResourceService` · `ProcessMiningService` · `ScenarioService` ·
`SqlQueryService` · `VariableTransformService` · `WorkshopPlatformService` ·
`WorkshopUxService`

`ConflictResolutionService` is worth singling out because the backlog names it as the
sync-clobbers-edits risk. It is dead as an interface, but `sync-boot.ts:161` **refuses
to schedule** a datasource that declares `conflictResolution` when field provenance has
no producer. So reconciliation is absent, and it is absent *loudly* rather than
silently — the honest failure mode.

## What changed since the audit: the UI is no longer hypothetical

The audit recorded `find *.tsx` = 0 and graded the whole widget tier absent on
"headless-by-design". That is now stale. `packages/web` is a React 19 + Vite app:
**81 `.tsx` files, 11,161 LOC, 45 widget components, 254 passing tests**, with screens
calling the API through `@altius/sdk`.

But it is **served by `Orion/docker-compose.yaml` only — no Helm template references
`web` at all**. So the UI ships in compose and does not exist in a Kubernetes install.
The ~34 `widgets` and `workshop-ui` rows should move off "no UI exists" and onto a
per-widget grade against the surfaces each one needs, with the Helm gap recorded.

## A `full` row that was broken on the production provider

The strongest single argument for re-grading is `defect-fixes/full-text-search-index-backed`.
The backlog grades it **`full`** and records "**Gap: None**", citing "104 search conformance
tests + 3 weight tests + DDL generation tests all pass" and naming
`search.integration.test.ts` as evidence.

Run against a real PostgreSQL, that suite does not pass. It does not run at all: it
fails in `beforeAll`, because `createObject` fails outright for **every object type
carrying a FULLTEXT index**. The index adds `_fts_<field> … GENERATED ALWAYS AS (…)
STORED` to the object table only, the write path reads the row back with `RETURNING *`,
and the history insert copied that generated column into a history table that has no
such column — and could not accept it if it did, since Postgres refuses an explicit
value for a generated column.

So the capability graded "Gap: None" could not create a searchable object on the
production storage provider. The 104 passing tests were passing against the **memory
provider**, which issues no SQL. The integration suite that would have caught it is
skipped unless `PG_TEST_URL` is set, and CI does not set it for the unit job.

Two further Postgres-only defects surfaced the same way: any `"quoted phrase"` search
raised rather than returning (parameters supplied that no placeholder referenced), and
`CREATE EXTENSION IF NOT EXISTS vector` aborted **every** schema apply on a server
without pgvector — the official `postgres:17` image in `Orion/docker-compose.yaml`
included, which is why the Postgres CI job has been red. Against Postgres the
conformance suite reported **355 of 714 failing** and storage-postgres **22 of 309**;
both are green after the fixes in `fix/postgres-provider-blockers`.

The lesson generalises beyond these three rows: **a grade taken from tests that only
ever ran against the memory provider is not evidence about production.** Any row whose
evidence rests on conformance or unit tests should be re-checked with `PG_TEST_URL`
set before it is called `full`.

## Two risks the backlog overstates

Both were checked at this HEAD and are in better shape than recorded.

**Fail-open guards are closed.** The CEL client throws when its circuit breaker is open
and after exhausting retries — there is no allow-all dev stub. Subscription property
filters fail closed. The side-effect executor's failure logging is live: `server.ts`
passes a real logger with a comment naming the exact hazard ("a webhook that exhausts
its retries returns success:true with no trace anywhere in the running system").

**Sync does not clobber action edits — it refuses to run instead.** `ConflictResolutionService`
is dead as an interface, but `sync-boot.ts:161` *refuses to schedule* any datasource
declaring `conflictResolution`, logging an error, because both strategies decide by
comparing the existing value's writer and no production code writes field provenance
(`LineageRecorder` is never constructed). Reconciliation is absent, and absent loudly.
The residual limitation is unchanged: all three shipped connectors are `mode: OVERLAY`,
which the scheduler skips by design, and `SYNC_SCHEDULER_ENABLED` appears in Helm and
`.env.example` but in none of the four compose files — so nothing syncs out of the box.

## Scope and what this pass does not cover

This measures the **service-shaped** capabilities — the 50 SPI interfaces, which is
where Phases 5–12 concentrated and where the inflation is. It does **not** re-grade the
backlog's other themes row by row: `ontology-core`, `actions-*`, `links-graph`,
`security-consent`, `storage-conformance`, `sync-ingest-ops`, and the FHIR/CDM surface.
Those are the parts the audit rated strongest and they need the same treatment before a
whole-backlog number can be quoted.

**So do not read "8 / 9 / 33" as the replacement for "2 / 91 / 96".** It is the honest
count for the 50 services, and it says the direction of travel in the tracker is wrong:
the tracker moved 64 rows up while the code gained 33 unreachable interfaces.

## Recommended next measurements

1. ~~Run the SPI conformance suite against Postgres~~ — done; see the section above.
   Three Postgres-only defects, one of them in a row graded `full`. Worth making the
   Postgres run non-optional rather than gated on an env var nobody sets locally.
2. Re-grade `ontology-core`, `actions-*` and `security-*` from source to complete the
   count — and re-check any row whose evidence is "tests pass" against Postgres, not
   just memory.
3. Decide per widget row what surface it needs, now that a real UI exists to consume it.
