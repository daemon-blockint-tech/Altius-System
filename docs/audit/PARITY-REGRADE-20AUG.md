# Parity re-grade — 20 Aug 2026, HEAD `177b628`

Third measured pass, same bar as the external audit: **demote unless the code proves
otherwise**, and a capability counts only when a user reaches it through a real API
against real Postgres. Reproduce with `node tools/parity/reachability.mjs`.

## Headline

| Source | full | partial | absent | Basis |
|---|---:|---:|---:|---|
| `ALTIUS-BACKLOG.md` (189 rows) | ~77 | ~110 | **0** | carried-forward prose |
| External audit (`ebba280`) | 2 | 91 | 96 | read from source |
| Measured 19 Aug (`f188339`, 58 services) | 8 | 35 | 15 | this tool |
| Measured 20 Aug (`177b628`, 71 services) | 16 | 55 | 0 | this tool |
| Measured 20 Aug (`DatasetService`, merged) | 17 | 54 | 0 | this tool |
| Measured 20 Aug (`ChangeProposalStore`, merged) | 18 | 53 | 0 | this tool |
| **Measured now (`HumanInTheLoopService`, 71 services)** | **19** | **52** | **0** | this tool |

**Durability moved this time, and it was real.** The previous pass recorded reachability
improving while `full` stayed pinned at 8 — services were being wired to REST without
gaining a Postgres implementation. That changed: #18 added eight Postgres platform
stores and `full` doubled, 8 → 16. This is the first pass where the honest number went
up for the right reason.

`DatasetService` then took it to 17 and `ChangeProposalStore` to 18, by the same route
each time: a Postgres store, restart survival proven, no new surface claimed. One
service per pass is the expected rate — the count is meant to move slowly and mean
something, rather than quickly and not.

`HumanInTheLoopService` takes it to 19 by a different route, and the exception is worth
naming: it gained no store at all. It holds no state, and it was already reachable — it
was simply pointed at the wrong store. So this pass is the one case where the number
moved because a defect was removed rather than because persistence was added.

The gap to the tracker is still large (19 vs ~77) but it is now a gap of *degree*
rather than *kind*: the remaining 52 are genuinely reachable, and each needs a Postgres
implementation rather than a rethink.

## Verified, not inferred

Spot-checks run for this pass, because "Postgres-backed" has twice turned out not to
mean "works":

- **Restart survival.** Wrote with one provider instance, closed it, read with a fresh
  one — the check that caught the #19 outage. `ScopedSessionStore`,
  `JustificationStore`, `AlertingService` and `DataFreshnessService` all **DURABLE**.
- **#19 bug class swept.** Every `JSON.stringify` in `postgres-platform-stores.ts`
  checked against its column type. `geospatial.saved_maps.tags` / `.shared_with` are
  `jsonb`, so `JSON.stringify` is correct there; the `TEXT[]` columns
  (`saved_queries.tags`, `scoped_session.allowed_markings`) are bound as arrays. **No
  new instances.**
- Two apparent defects investigated and dismissed as harness errors on my side
  (a wrong `create()` arg order, an omitted required `objectId`) rather than filed.
- **`DatasetService`, for its promotion to `full`.** 26 Postgres integration cases,
  including two restart-survival ones (write → `provider.close()` → read through a
  fresh provider): rows, transaction log, branches and a replayed `asOfTransactionId`
  snapshot all survive. Full suites re-run against real Postgres: storage-postgres
  342/342 (316 before), SPI conformance 746/746 unchanged.
- **Those tests proven non-vacuous.** The in-memory row key joins composite parts on a
  NUL byte, which Postgres cannot store in `TEXT` at all. Re-introducing that join
  makes exactly the two composite-key cases fail with `invalid byte sequence for
  encoding "UTF8": 0x00`, and nothing else — so the cases test what they claim to.

## The 19 that reach a durable implementation

`AlertingService` · `AuditStore` · `BlobStore` · `BranchStore` ·
**`ChangeProposalStore`** · `CommentStore` · `DataFreshnessService` ·
`DatasetMetadataService` · **`DatasetService`** · `EmbeddingStore` ·
`GeospatialMapService` · **`HumanInTheLoopService`** · `JustificationStore` ·
`NotificationStore` · `ObjectSetStore` · `OntologySqlService` ·
`OntologyUsageMetricsService` · `ScopedSessionStore` · `TimeSeriesStore`

`full` here stays a **necessary, not sufficient** condition: it says a user can reach a
durable implementation, not that the capability is complete. Rows still need demoting
by hand where behaviour is missing.

## Work queue — reachable but memory-only (52)

Every one is already wired to REST, so the remaining work is persistence alone. These
are the honest `partial → full` candidates:

`AccessExplanationService`¹ · `AgentEvaluationService` · `AgentService` ·
`AgentThreadStore` · `ApprovalWorkflowService` · `BatchTransformService` ·
`BuildTriggerService` · `BusinessRulesService` ·
`CommandExchangeService` · `CommandService` · `ConflictResolutionService` ·
`ConnectorCatalogService` · `CopilotService` · `DataExpectationsService` ·
`DatasetProjectionService` · `DatasourceService` ·
`DesignSystemService` · `EmbeddedCopilotService` · `EmbeddingService` · `EvalService` ·
`EventObjectService` · `GraphAnalysisService` · `GraphService` ·
`KioskService` · `LayoutDeviceCaptureService` ·
`ModelCatalogService` · `ModelChainService` · `ModelInferenceService` ·
`ModelRegistryService` · `ModelingObjectiveService` · `MultiOntologyGovernanceService` ·
`ObjectSetFilterStore` · `OntologyChangeHistoryService` · `OntologyManagerService` ·
`PipelineBuildService` · `PipelineService` · `PlatformAssistantService` ·
`PlatformResourceService` · `ProcessMiningService` · `SavedViewStore` ·
`ScenarioService` · `SqlAnalyticsService` · `SqlQueryService` · `SyncCdcService` ·
`TokenMeteringService` · `TransformExpressionService` · `UserDirectoryService` ·
`ValueFormattingService` · `VariableTransformService` · `VectorSearchService` ·
`WorkshopPlatformService` · `WorkshopUxService`

¹ `AccessExplanationService` is a standing false demotion: it holds no state and
delegates to the live `AuthorizationService`, so it is correct as-is. The method has no
category for "stateless and correct"; recorded rather than silently patched.

None of these loses data today — #14's gate withholds them under Postgres, so their
routes answer 404 rather than accepting a write they would drop. Making one durable is
what moves it from 404 to working.

## This pass — `HumanInTheLoopService`

The smallest diff of any pass so far, and the only one that fixed a defect rather than
adding a store. `HumanInTheLoopService` has no state: its five methods are a rename of
`ChangeProposalStore`'s with `RequestContext` unpacked. What it lacked was a store worth
reading.

**Two surfaces, two stores, one record.** The in-memory service constructed its own
private `InMemoryChangeProposalStore`, so on a Postgres deployment:

```
POST /api/v1/change-proposals          → PostgresChangeProposalStore   (a table)
POST /api/v1/ai-proposals/:id/approve  → a Map, dead on restart
```

Neither surface erred. Each answered correctly about a record the other had never heard
of, and the half that evaporated was the approval. For the record of who signed off on
an AI-proposed change, a missing approval and an approval you cannot see are the same
thing to the caller — which is why this ranked above the remaining data-plane stores
despite being a fraction of their size.

The adapter now lives once in `@altius/spi` and both providers extend it, so the
`(ctx) → (tenantId, actorId)` unpacking cannot drift. The API builds one store and hands
it to both slots.

Conformance runs 15 assertions against both providers, five of which are cross-surface:
a proposal created through one surface is visible through the other, an approval
recorded on one is visible on the other, and both count one record rather than two.
Restoring the old private-store behaviour fails exactly those five plus the three that
route through `store.submit`, on memory alone — Postgres shares by table rather than by
instance, so the same bug there is a different injection: drifting the tenant unpacking
in the shared adapter fails the cross-surface cases on **both** providers, which is what
that injection was for.

Two more injections, because the interesting failure is not in either provider: pointing
the post-restart half of the durability case at a fresh in-memory service fails it with
`expected null not to be null`, and reverting the API to hand the HITL surface its own
store fails a new source-level guard. That guard exists for the same reason #14's does —
the `deps` literal is not exported, both surfaces work perfectly in isolation, and the
defect only ever shows up as an approval nobody can find.

**One thing this does not fix, deliberately.** `approve` and `reject` refuse a proposal
in `draft`, in both providers, and the HITL surface has no submit transition — so a
proposal created there could never be approved there. That was true before and is
unchanged; it is only *reachable* now, because `/api/v1/change-proposals/:id/submit`
finally operates on the same record. Widening the interface to carry its own submit is a
contract change and belongs in its own change.

## Previous pass — `ChangeProposalStore`

The audit trail for AI-driven change: an agent proposes rather than executes, and a
human approves, rejects, or asks for revisions. Who decided what, and when. That record
lived in a `Map`, so #14's gate withheld the store under Postgres and the routes
answered 404 rather than accepting approvals they would drop.

Picked over the data-plane candidates because of what losing it costs. A dropped
dataset row is data loss; a dropped approval is a compliance failure, and the platform's
whole claim is that changes are governed.

**The state machine is what was actually ported.** Rows are the easy half — the guards
are the point: an unsubmitted draft cannot be approved, an unapproved proposal cannot be
applied, an applied or rejected one cannot be withdrawn, and a proposal under review
cannot be edited. Each is a way an approval could be manufactured or erased if the two
providers disagreed, so all of them are pinned in a conformance category that runs
against **both**, per the standing rule below.

Proven non-vacuous with the #19 defect itself: `tags` is a real `TEXT[]`, and binding it
with `JSON.stringify` — which is exactly what took out comments and notifications while
their suites stayed green — fails every Postgres case with `malformed array literal:
"["ontology","ai-proposed"]"` while the memory ones pass untouched. That asymmetry is
the signature of a provider-specific defect.

## Previous pass — `DatasetService`

`DatasetService` is **done and merged** — the one platform store #18 deliberately left in memory
("the DatasetService remains in-memory for row/transaction semantics"). It now has
`dataset.metadata` / `.rows` / `.transactions` / `.branches` behind it, and the routes
that answered 404 on a Postgres deployment work.

Two things that conversion surfaced, neither of them the dataset store's own bug:

- **`dataset.metadata` had no writer.** #18 shipped `PostgresDatasetMetadataService`
  reading a table nothing populated, so on every Postgres deployment it answered 200
  with an empty list and a `listTransactions` hardcoded to `[]`. Reachable-and-empty,
  graded `full`. It reads real rows now. The lesson generalises — **a store counts as
  durable only once something writes to it**, which the analyser cannot see, since it
  measures whether a service is reached, not whether its table is ever filled.

  **The other seven #18 stores were then checked for the same shape, and are clean.**
  The tell was that `upsert` — the only thing that writes `dataset.metadata` — is not
  on the `DatasetMetadataService` interface; it is a helper commented "internal", so no
  route could call it. It is the only such method in `postgres-platform-stores.ts`.
  Every other store's writes are interface methods with live call sites:
  `createRule`, `recordSync`, `createLayer` / `createSavedMap` / `createAnnotation`,
  `create` (justifications), `createSavedQuery` are each called from a REST route;
  `ScopedSessionStore.create` from `security-governance-routes.ts`; and
  `OntologyUsageMetricsService.record` via `recordRestUsage`, wired into the REST
  dispatcher in `server.ts`. So this was an isolated defect, not a systemic one —
  recorded because "we should check the others" is worth exactly nothing next to
  having checked them.
- **`pnpm test` at the root silently skips the Postgres suites** even with `PG_TEST_URL`
  and `REQUIRE_PG` exported, because turbo's strict env mode drops them before the task
  runs. CI is unaffected — it calls `pnpm --filter <pkg> test` directly, bypassing turbo
  (`ci.yml` already notes this for the compose job) — so #20's gate still holds where it
  matters. But a developer running the root command sees "342 passed" having exercised
  no Postgres. Adding `"env": ["PG_TEST_URL", "REQUIRE_PG"]` to the `test` task in
  `turbo.json` closes it; left out of the dataset change deliberately. **Fixed
  separately and merged** — with the env declared, the root command goes from 8 files
  and 136 tests silently skipped to 0, and conformance from 373 tests to 746.

## Next

Same pattern, in rough order of what losing it costs: `ApprovalWorkflowService` (the
other governance audit trail — but it is **not wired into the API at all**, so it needs
routes before persistence is worth anything), then `SqlQueryService` and the rest of the
dataset/pipeline data plane.

This pass's counts are measured on **this branch's base**, which is `main`. Four
durability PRs are open and unmerged (`BatchTransformService`, `DataExpectationsService`,
`PipelineBuildService`, and the analyser co-implementation fix); each moves the same
counters, so the headline row above will need re-measuring once they land rather than
being added up.

## Standing rule — a contract changes in every provider or in none

The dataset conversion also produced a rule, which matters more than the row it moved.

Porting a service to Postgres means meeting a contract that until then only one
implementation had ever expressed, and where that contract is odd there are two bad
options: copy the oddity, or quietly improve on it. Improving is worse. It makes the
same call mean different things depending on which provider is wired, so dev is green
and production is wrong, which is the defect class this whole line of work exists to
remove.

The concrete case: `create` on an existing dataset **replaced** it, dropping rows and
transaction log. Against a Map that is a developer annoyance. Against Postgres it is
irrecoverable data loss. Both providers now **refuse** instead, with a shared
`ALREADY_EXISTS` error that the REST layer answers as 409 — previously an uncoded
throw, which the transport categorised as `system` and returned as a 500 with the
message withheld, making a deliberate refusal indistinguishable from a crash.

What keeps it true is not the fix but the test: a `DatasetService` conformance category
that runs the same assertions against **both** providers, so the next divergence fails
in CI rather than in production. Proven non-vacuous — restoring the destructive
`create` fails exactly the three memory-side cases while the Postgres ones keep passing,
and that asymmetry is precisely the signature the suite exists to catch.

**Still open, recorded not fixed:** a write to any branch advances the *dataset-wide*
`latestTransactionId` that `get` and `read` report, rather than the written branch's.
Both providers agree, so nothing diverges and nothing is being hidden — but the shared
behaviour is arguably wrong, and per this rule it changes in both or neither.

## Standing caveat

The tracker's `0 absent` is now literally true by this method — every SPI service is
reachable from some surface — but it should not be read as "nothing is missing".
Reachable-and-empty is still the common case, and entire capability families the audit
listed as absent (federation runtime, markings, Spark/datasets, an LLM model runtime)
are absent in a sense this tool does not measure: it grades the services that exist, not
the ones that were never written. Phase 25 ships an "AIP/LLM Platform" surface; whether
a model runtime sits behind it is not something a reachability count can answer.
