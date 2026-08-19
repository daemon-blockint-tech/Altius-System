# Parity re-grade — 19 Aug 2026, HEAD `96e5b2a`

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

1. Run the SPI conformance suite against Postgres (`PG_TEST_URL`); CI runs memory only,
   which is the root of the provider divergence the backlog lists.
2. Re-grade `ontology-core`, `actions-*` and `security-*` from source to complete the
   count.
3. Decide per widget row what surface it needs, now that a real UI exists to consume it.
