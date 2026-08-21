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
| Measured 20 Aug (`ChangeProposalStore`) | 18 | 53 | 0 | this tool |
| Measured 20 Aug (`BusinessRulesService`) | 19 | 52 | 0 | this tool |
| **Measured now (`BatchTransformService` branch, 71 services)** | **20** | **51** | **0** | this tool |

**Durability moved this time, and it was real.** The previous pass recorded reachability
improving while `full` stayed pinned at 8 — services were being wired to REST without
gaining a Postgres implementation. That changed: #18 added eight Postgres platform
stores and `full` doubled, 8 → 16. This is the first pass where the honest number went
up for the right reason.

`DatasetService` then took it to 17, `ChangeProposalStore` to 18,
`BusinessRulesService` to 19 and `BatchTransformService` to 20, by the same route each
time: a Postgres store, restart survival proven, no new surface claimed. One service
per pass is the expected rate — the count is meant to move slowly and mean something,
rather than quickly and not.

The gap to the tracker is still large (20 vs ~77) but it is now a gap of *degree*
rather than *kind*: the remaining 51 are genuinely reachable, and each needs a Postgres
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

## The 20 that reach a durable implementation

`AlertingService` · `AuditStore` · **`BatchTransformService`** · `BlobStore` ·
`BranchStore` · **`BusinessRulesService`** · **`ChangeProposalStore`** · `CommentStore` · `DataFreshnessService` ·
`DatasetMetadataService` · **`DatasetService`** · `EmbeddingStore` ·
`GeospatialMapService` · `JustificationStore` · `NotificationStore` · `ObjectSetStore` ·
`OntologySqlService` · `OntologyUsageMetricsService` · `ScopedSessionStore` ·
`TimeSeriesStore`

`full` here stays a **necessary, not sufficient** condition: it says a user can reach a
durable implementation, not that the capability is complete. Rows still need demoting
by hand where behaviour is missing.

## Work queue — reachable but memory-only (51)

Every one is already wired to REST, so the remaining work is persistence alone. These
are the honest `partial → full` candidates:

`AccessExplanationService`¹ · `AgentEvaluationService` · `AgentService` ·
`AgentThreadStore` · `ApprovalWorkflowService` ·
`BuildTriggerService` ·
`CommandExchangeService` · `CommandService` · `ConflictResolutionService` ·
`ConnectorCatalogService` · `CopilotService` · `DataExpectationsService` ·
`DatasetProjectionService` · `DatasourceService` ·
`DesignSystemService` · `EmbeddedCopilotService` · `EmbeddingService` · `EvalService` ·
`EventObjectService` · `GraphAnalysisService` · `GraphService` ·
`HumanInTheLoopService` · `KioskService` · `LayoutDeviceCaptureService` ·
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

## This pass — `BatchTransformService`

Transforms, build history and schedules. The schedule matters most: a cron registration
that silently stops firing looks like nothing happening rather than like a failure — the
same shape as a rule losing its `active` state. Datasets became durable two passes ago,
so a build now reads and writes durable data on both sides.

**The conformance suite earned its keep on its first run**, before any regression was
injected: it caught a real ordering bug in the *in-memory* provider. `listBuilds`
promises newest-first and sorted on `startedAt` alone, which is not a total order — two
builds started in the same millisecond compare equal, the sort becomes a no-op for them,
and the pair comes back oldest-first. Postgres ordered by a sequence and was right.
Fixed in memory (insertion order breaks the tie) rather than weakening the assertion,
because the contract is what both providers owe.

The #19 check applies again and passes: `inputs` is a real `TEXT[]`, and binding it with
`JSON.stringify` fails every Postgres case with `malformed array literal: "["copy_in"]"`
while memory passes untouched.

**Known limitation, recorded as a test rather than only a comment.** `registerExecutor`
takes a live object with an `execute` method, so the executor registry is per-process in
*every* provider — a function cannot be written to a table. On a second replica a build
silently falls back to the built-in pass-through instead of failing. A durability case
asserts exactly that fallback, so nobody can later come to believe executors are
durable. Making it honest is a contract change (named executors resolved from a
registry, or transform `source` actually interpreted), not a storage one.

Two in-memory quirks matched rather than fixed, per the standing rule: `durationMs` is
hardcoded to 100 rather than measured, and a build that throws part-way leaves its row
in `running` forever with no failure path. The second is harmless in a Map that dies
with the process and considerably less so in a table — the more urgent of the two.

## Previous pass — `BusinessRulesService`

The second governance primitive, and a sharper case than the first. A rule is a DAG of
logic nodes that only applies once it has been proposed, approved and **activated**, so
`state` is not metadata — it decides whether the rule governs anything at all.

That makes the failure mode worse than ordinary data loss. A rule whose state is lost
silently reverts to draft and simply stops applying: nothing errors, nothing 500s, the
governance just quietly isn't there any more. Losing a row at least looks like losing a
row.

**The execution engine was extracted rather than reimplemented.** Running a rule is a
pure function of the rule and its input data, so the ~290-line DAG evaluator moved into
`@altius/spi` and both providers call it. Duplicating it would have been the larger
defect: two providers that stored the same rule and then disagreed about what it
*produced* would look completely healthy from the outside. The in-memory service lost
290 lines and gained a delegation; its own 15 tests still pass unchanged.

The state machine is pinned in a conformance category running against both providers —
each guard is a way an unreviewed rule could go live. Proven non-vacuous by dropping the
guard from the Postgres side: exactly 6 Postgres cases fail (5 guards plus durability's
closing guard assertion) while the memory side passes untouched.

One Postgres-only hardening, flagged because it is a real divergence in *mechanism*
rather than behaviour: the transition's guard is repeated in the `UPDATE ... WHERE
state = $expected` clause, not only checked beforehand. Two concurrent approvals against
one process would otherwise both read `proposed` and both write `approved`, recording
the second reviewer over the first. A `Map` cannot interleave that way, so the
in-memory service needs no equivalent.

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
routes before persistence is worth anything), then `BatchTransformService`,
`DatasetProjectionService` and `SqlQueryService`, which are the rest of the
dataset/pipeline data plane.

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
