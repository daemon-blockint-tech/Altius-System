# Parity re-grade — 20 Aug 2026, HEAD `177b628`

> **Historical working log:** retained for the sequence of service-persistence measurements at the named commits. Repeated “Measured now” entries are chronology, not a current aggregate. Use [../altius-foundry-parity.md](../altius-foundry-parity.md) and the canonical backlog files for current counts.

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
| **Measured now (`BusinessRulesService` branch, 71 services)** | **19** | **52** | **0** | this tool |
| Measured 20 Aug (`ChangeProposalStore`, merged) | 18 | 53 | 0 | this tool |
| **Measured now (`VariableTransformService`, 71 services)** | **19** | **52** | **0** | this tool |
| **Measured now (`OntologyChangeHistoryService`, 71 services)** | **19** | **52** | **0** | this tool |
| **Measured now (`SqlQueryService`, 71 services)** | **19** | **52** | **0** | this tool |
| **Measured now (`ConflictResolutionService`, 71 services)** | **19** | **52** | **0** | this tool |

**Durability moved this time, and it was real.** The previous pass recorded reachability
improving while `full` stayed pinned at 8 — services were being wired to REST without
gaining a Postgres implementation. That changed: #18 added eight Postgres platform
stores and `full` doubled, 8 → 16. This is the first pass where the honest number went
up for the right reason.

`DatasetService` then took it to 17, `ChangeProposalStore` to 18 and
`BusinessRulesService` to 19, by the same route each time: a Postgres store, restart
survival proven, no new surface claimed. One service per pass is the expected rate —
the count is meant to move slowly and mean something, rather than quickly and not.
`VariableTransformService` to 19, by the same route each time: a Postgres store,
`OntologyChangeHistoryService` to 19, by the same route each time: a Postgres store,
`DatasetService` then took it to 17, `ChangeProposalStore` to 18 and `SqlQueryService`
to 19, by the same route each time: a Postgres store, restart survival proven, no new
surface claimed. One service per pass is the expected rate — the count is meant to move
slowly and mean something, rather than quickly and not.
`ConflictResolutionService` to 19, by the same route each time: a Postgres store,
restart survival proven, no new surface claimed. One service per pass is the expected
rate — the count is meant to move slowly and mean something, rather than quickly and
not.

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
**`BusinessRulesService`** · **`ChangeProposalStore`** · `CommentStore` · `DataFreshnessService` ·
**`ChangeProposalStore`** · `CommentStore` · **`ConflictResolutionService`** ·
`DataFreshnessService` ·
`DatasetMetadataService` · **`DatasetService`** · `EmbeddingStore` ·
`GeospatialMapService` · `JustificationStore` · `NotificationStore` · `ObjectSetStore` ·
**`OntologyChangeHistoryService`** · `OntologySqlService` ·
`OntologyUsageMetricsService` · `ScopedSessionStore` · `TimeSeriesStore`
`OntologySqlService` · `OntologyUsageMetricsService` · `ScopedSessionStore` ·
`TimeSeriesStore` · **`VariableTransformService`**
**`SqlQueryService`** · `TimeSeriesStore`

`full` here stays a **necessary, not sufficient** condition: it says a user can reach a
durable implementation, not that the capability is complete. Rows still need demoting
by hand where behaviour is missing.

## Work queue — reachable but memory-only (52)

Every one is already wired to REST, so the remaining work is persistence alone. These
are the honest `partial → full` candidates:

`AccessExplanationService`¹ · `AgentEvaluationService` · `AgentService` ·
`AgentThreadStore` · `ApprovalWorkflowService` · `BatchTransformService` ·
`BuildTriggerService` ·
`CommandExchangeService` · `CommandService` · `ConflictResolutionService` ·
`ConnectorCatalogService` · `CopilotService` · `DataExpectationsService` ·
`BuildTriggerService` · `BusinessRulesService` ·
`CommandExchangeService` · `CommandService` · `ConnectorCatalogService` · `CopilotService` · `DataExpectationsService` ·
`DatasetProjectionService` · `DatasourceService` ·
`DesignSystemService` · `EmbeddedCopilotService` · `EmbeddingService` · `EvalService` ·
`EventObjectService` · `GraphAnalysisService` · `GraphService` ·
`HumanInTheLoopService` · `KioskService` · `LayoutDeviceCaptureService` ·
`ModelCatalogService` · `ModelChainService` · `ModelInferenceService` ·
`ModelRegistryService` · `ModelingObjectiveService` · `MultiOntologyGovernanceService` ·
`ObjectSetFilterStore` · `OntologyManagerService` ·
`PipelineBuildService` · `PipelineService` · `PlatformAssistantService` ·
`PlatformResourceService` · `ProcessMiningService` · `SavedViewStore` ·
`ScenarioService` · `SqlAnalyticsService` · `SyncCdcService` ·
`TokenMeteringService` · `TransformExpressionService` · `UserDirectoryService` ·
`ValueFormattingService` · `VectorSearchService` ·
`WorkshopPlatformService` · `WorkshopUxService`

¹ `AccessExplanationService` is a standing false demotion: it holds no state and
delegates to the live `AuthorizationService`, so it is correct as-is. The method has no
category for "stateless and correct"; recorded rather than silently patched.

None of these loses data today — #14's gate withholds them under Postgres, so their
routes answer 404 rather than accepting a write they would drop. Making one durable is
what moves it from 404 to working.

## This pass — `CopilotService`: a shared store, and the flag it was bypassing

**No parity movement, and that is correct** — this is a defect fix, not a conversion.
Neither copilot service has a Postgres implementation, so both stay `partial`. Recorded
here because the defect is the same shape as the one `HumanInTheLoopService` had, and
because this one had teeth.

`CopilotService` (the view-facing suggest/apply half) constructed its own private
`InMemoryEmbeddedCopilotService`, while the API separately wired
`embeddedCopilotService` — the surface operators configure copilots through. Two stores,
one concept.

**The consequence was not just a visibility split.** Copilot ids are generated UUIDs and
`suggest` is called with an id the caller supplies, so `ensureCopilot`'s lookup in the
private store never matched. It fell through to creating a fresh copilot with
`canExecuteActions: true` — on every call.

And `getSuggestedActions` is the **one place** that flag is enforced:

```ts
if (!copilot || !copilot.canExecuteActions) return [];
```

while `createCopilot` defaults it to **false**. So a copilot deliberately configured not
to suggest actions was never the one consulted, and suggestions were served from a
fabricated copilot that could. The restriction was inert. Sharing the store makes the
configured copilot the one that answers, and a test asserts exactly that from both
directions — restricted copilot yields no actions, permitted one yields some.

Two things deliberately left alone. An unrecognised copilot id still auto-creates a
permissive copilot, which is the opposite of `createCopilot`'s own default; narrowing it
would change what `suggest` returns for unknown ids, so it is pinned as-is and raised
separately. And the leak it caused — a fresh copilot per call — is fixed only as a
consequence of the store being shared, not by adding cleanup.

The tests live in `storage-memory` rather than the conformance suite, because there is no
second provider: a conformance category with one provider is a unit test wearing a
costume. A source-level guard in `api` pins the wiring, the same way #37's does for the
proposal store.

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
## This pass — `VariableTransformService`

Named pipelines of declarative steps — upper, round, formatDate, pickFields, coalesce —
reduced over an input value.

**Losing a pipeline here is loud**, unlike most of what these passes have covered:
`execute` throws `Transform pipeline not found`. The reason to persist it anyway is that
a pipeline is user-authored configuration — someone composed those steps — and a restart
eating it is not something a caller recovers from by retrying.

**The drift risk is the real one, and it is the same shape as the conflict resolver's:
the output is data.** A pipeline runs to produce a value something downstream consumes,
so two providers disagreeing about what `round` or `dateDiff` means would produce
different values from the same input with neither erring. `applyStep` moved verbatim
into `@altius/spi` as `applyTransformStep`, and the in-memory service lost its copy.
Two of the five injections break that shared function and fail on **both** providers.

Three lenient behaviours are matched rather than tightened, and pinned by cases that say
so — tightening any of them would change what an existing pipeline produces:

- an unrecognised `kind` returns the input unchanged, so a typo in a step name is a
  silent no-op
- `upper` on `null` is the string `"NULL"`, because the string steps coerce with
  `String(input)`
- **`add` on a non-numeric input concatenates.** The `as number` cast is a TypeScript
  fiction; at runtime `+` sees two strings, so `'abc'` plus 1 is `'abc1'`. A pipeline
  meant to add can silently build a string. `multiply` on the same input does give NaN.

**A real divergence in the first version of the Postgres store, caught by conformance.**
The in-memory `update` writes the record back under the OLD map key, so changing a
pipeline's `name` renames the record without moving it: it stays reachable under the old
name while reporting the new one. My first table keyed on `(tenant_id, name)`, which
meant the UPDATE moved the row and the two providers disagreed. The fix is to model the
map key as its own column — `lookup_key` alongside `name` — which reproduces the quirk
faithfully. Ugly, and deliberately so: a single `name` column would have been tidier and
wrong. Pinned, and raised as a contract question rather than fixed, since fixing it
changes which name an existing caller has to use.

**Two of my own assertions were wrong, and the suite caught them before any injection.**
I asserted substring-then-trim on `'  hello  '` gives `''` (it gives `'h'`), and that
`add` on a non-numeric input gives NaN (it concatenates). Both were corrected against
what the code actually does rather than what I assumed — which is the whole point of
running the thing rather than reasoning about it.
## This pass — `OntologyChangeHistoryService`

The audit trail for schema change: who changed it, when, under which migration class,
and a full snapshot of what the ontology looked like at that point.

**Two of its six methods do not do what their names say, in both providers.** `restore`
reads a record, confirms it exists, and returns `restored: true` — no schema is rolled
back and no object type is touched. `applyChange` validates the record, bumps that
record's own `version` by one, restamps `appliedAt`, and returns `applied: true` — the
ontology is untouched. Both are reproduced exactly rather than repaired, per the rule
that a contract changes in both providers or neither.

Which makes the honest summary of this pass: **persisting these makes the claim durable,
not the effect.** A stored record saying a change was applied at a given time is evidence
that the method ran, and nothing more. That is worth saying loudly, because a persisted
audit trail is more convincing than a transient one, and this one is attesting to work
that did not happen. Conformance pins both as they stand and says so in the case names —
including the clearest evidence of all, that `restore` succeeds for an object type the
snapshot never mentioned.

**One behaviour deliberately narrowed, in both providers, and it could not be deferred.**
`saveChange` accepts either a new draft or a full record, and the record form carries a
`tenantId`. The in-memory service wrote it through, insulated only by keying its map on
`ctx.tenantId` — which left the field free to lie but harmless. In a table the tenant is
a *column*, so honouring it would be a genuine cross-tenant write. Matching the old
behaviour verbatim was therefore not an option: it meant either shipping that hole or
shipping a divergence. `tenantId` now comes from the request in both providers, and a
conformance case checks a record naming another tenant lands under the caller's. No
route can reach this today — the REST create path builds an input with no tenant field,
and the update path re-reads the record under `ctx` first — so this closes a latent
hazard in the SPI rather than a live one.

The Postgres table keys on `(tenant_id, id)` rather than `id`, unlike its neighbours in
the `governance` schema. Theirs hold UUIDs this code generates, so a global key is safe;
here `saveChange` accepts a caller-supplied id, and the in-memory service's per-tenant
map makes two tenants each holding a record called `v1` perfectly legal. A global key
would reject a write the other provider accepts.

Ordering needed care for a reason specific to this service: `listChanges` sorts by
version descending, and *every* record is created at version 1, so ties are the norm
rather than the edge case. The in-memory sort is stable, which means ties come back
oldest-first — `ORDER BY "version" DESC, "seq"` is how Postgres says the same thing.
Dropping that tie-break fails two cases.

Five injections, five caught — though the fourth only after being rewritten. The first
attempt at breaking the `objectType` snapshot guard replaced it with something that
happened to answer the same way for both inputs the case tests, so it passed and proved
nothing. Removing the guard outright is the regression it actually protects against, and
that fails with `Cannot read properties of undefined (reading 'some')`. Recorded because
a passing injection is not evidence of a vacuous test — it can equally be evidence of a
badly chosen injection, and the two need telling apart before either is believed.
## This pass — `SqlQueryService`

The one a lead prod-testing the headless API actually reaches for: send SQL, get rows
back. And unlike most of the queue, it does real work — the statement is parsed, the
WHERE, ORDER BY, LIMIT and column list are pushed down to the dataset service, and the
join is evaluated over what comes back. Datasets became durable in #24, so a query on
this provider now reads rows that survived a restart and writes a job record that does
the same.

**The risk here is not mainly storage.** A query service that stores its jobs perfectly
and *evaluates* differently on the two providers is the worse failure: the same
statement over the same rows would return different answers on dev and prod, and neither
deployment would look broken. So the parser moved from `storage-memory` into
`@altius/spi` alongside a new query engine, and both providers call them. The in-memory
service lost its copy of the execution path entirely; it is now a job store plus a call
to the shared engine, which is what the Postgres one is too.

The conformance category is weighted accordingly — twenty assertions per provider, most
of them about what a query *means* rather than about the record round-tripping: filter
pushdown, comparison operators, projection, ordering, which LIMIT wins when the
statement and the request both carry one, joins, and the surprising-but-shared rule that
`SELECT *` over an empty result reports no columns at all.

**Two limits matched rather than fixed**, both stated in the store header. `submit` is
"async" in name only: it writes the job `queued`, then `running`, then terminal, all
before returning, so a caller polling `get()` will never catch one in flight and a queue
that stopped draining is not a state this can represent. And the result rows are stored
on the job in a single JSONB value — which is what makes `results()` answerable after
the process that ran the query is gone, and also means a `SELECT` with no LIMIT writes
its entire result set into one row. For a query service that is a real ceiling.

Five regressions injected, five caught, each failing only its intended cases. The
strongest is the one that proves the query reads real data rather than inventing it:
pointing the Postgres service at a fresh in-memory dataset store fails thirteen cases.
Breaking the *shared* engine (dropping the column projection) fails the same case on
**both** providers, which is the property extracting it was for.

**And one of my own cases turned out to be vacuous, twice over.** The plain
"lists jobs newest first" assertion passes on a provider ordering by `submittedAt`
alone, because two round-trips to Postgres land in two different milliseconds. Freezing
the clock fixed it for the in-memory provider — but with only two colliding jobs the
Postgres tie still happened to come back in the right order, so the injection passed
anyway. Four colliding jobs catches it, deterministically across three runs. Worth
recording because the first fix looked like it worked: a collision case is only a proof
once the injection actually fails.
## This pass — `ConflictResolutionService`

A conflict is a datasource sync and a user edit disagreeing about one field. Two pieces
of state live behind this service, and **both fail silently when lost**:

- **unresolved conflicts** — the queue of disagreements waiting on a decision. Lose it
  and the discrepancy is never surfaced: no error, no alert, just two systems quietly
  holding different values for the same field.
- **the tenant's default strategy** — `getDefaultStrategy` falls back to
  `user_edits_win` when none is stored, so a tenant that chose `latest_value_wins` and
  lost it does not get an error after a restart. It gets the other answer, on every
  conflict, indefinitely. The durability injection reports exactly that:
  `expected 'user_edits_win' to be 'latest_value_wins'`.

**Choosing the winner moved into `@altius/spi`, and the reason is stronger here than in
any previous pass: the output of that function is data.** Two providers disagreeing
about `latest_value_wins` would write different values into the same field for the same
conflict, and neither would error — the divergence would surface much later, in the data
itself, with nothing to say which deployment produced it. So most of the conformance
cases are about *which value wins* rather than about the record round-tripping, and the
two injections that break the shared resolver fail on both providers.

Two things the Postgres store had to get right that the `Map` got for free.

**A stored `null` and an absent value are the same thing once they come back.**
`undefined` binds as SQL NULL, `null` binds as JSON null, and the driver parses both to
`null`. So every read also asks Postgres `IS NULL` per column, and that boolean decides
between them. It is not academic: resolving `manual` with no value stores nothing, a
conflict never resolved stores nothing, and a conflict whose user value genuinely *is*
null has to round-trip as null rather than vanish.

**The driver already parses JSONB.** The `typeof v === 'string' ? JSON.parse(v) : v`
idiom the other stores in this repo use is harmless there because those columns only
ever hold objects — here a column legitimately holds a bare string, and parsing it a
second time throws `Unexpected token 'C', "Cardiology" is not valid JSON`. Found by the
conformance suite on its first run, before any injection.

**And an injection taught me a case was weaker than it looked — again.** Dropping the
null guard from `merge` passed, because the case testing it used a null *datasource*
value, and spreading `null` in an object literal is a no-op: guard or no guard, the
answer is the same. The direction that makes the guard load-bearing is a null *user*
value — without the guard both sides look mergeable and the result is the datasource
object; with it, the user's null wins and the field is cleared. That case fails the
injection. Recorded because this is the second pass in a row where a passing injection
meant a badly aimed test rather than a badly aimed injection, and the two are only
distinguishable by looking.

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
routes before persistence is worth anything), then `EventObjectService` and
`AgentThreadStore`.

**Two candidates are blocked, and need a decision rather than a PR.**
routes before persistence is worth anything), then `VariableTransformService` and
`TransformExpressionService`.
routes before persistence is worth anything), then `DatasourceService` and
`VariableTransformService`, which are what remains of the dataset/pipeline data plane
once the open PRs land.
routes before persistence is worth anything), then `VariableTransformService` and
`EventObjectService`.

**Two candidates are deliberately blocked, and need a decision rather than a PR.**
`ConnectorCatalogService` and `DatasourceService` both hold credentials in the state
they would persist: `EnterpriseAuthScheme` carries `clientSecret`, `apiKey`, `password`,
`token` and `refreshToken` as plain fields, and `Datasource.connection` is an untyped
bag that in practice holds the same. There is **no encryption-at-rest machinery anywhere
in this repo** — no `createCipheriv`, no KMS client, no `pgcrypto` in the DDL (checked,
not assumed). Converting either as-is would move secrets from a `Map` that dies with the
process into a table that does not, which is a security decision and not one to take as
a side effect of a durability pass.

**One deliberately skipped for a different reason.** `BuildTriggerService` duplicates
what `PipelineBuildService` already does with action triggers, and its `trigger()`
fabricates a `succeeded` build into a `builds` map that **no method on the interface ever
reads**. Persisting write-only state that shadows another service is not worth a table;
the two should be reconciled first.
**Two more are skipped for reasons that are not about secrets.** `BuildTriggerService`
duplicates what `PipelineBuildService` already does with action triggers, and its
`trigger()` fabricates a `succeeded` build into a `builds` map that **no method on the
interface ever reads** — persisting write-only state that shadows another service is not
worth a table, and the two should be reconciled first. And `TransformExpressionService`
holds **no state at all**: it is `listFunctions()` plus a pure `evaluate()`, so it
belongs beside `AccessExplanationService` as a standing false demotion rather than in
the work queue.

Counts here are measured on **this branch's base**, `main`. Several durability PRs are
open and unmerged, each moving the same counters, so the headline row will need
re-measuring once they land rather than being added up.

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
