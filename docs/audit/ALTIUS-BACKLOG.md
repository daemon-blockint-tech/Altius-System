# Altius capability backlog

Generated from code-verification passes, most recently 16 Aug 2026. **189** capabilities graded: **9 full, 86 partial, 94 absent**.

The 187 rows below are the work items. Seven of them now read `full` and are kept here with their evidence rather than silently removed: the graph-traversal capability (which appears under three theme groupings), action types, link change events, link types, and transactional writeback with version consistency. The two capabilities that were already `full` (Ontology core semantic model, Audit immutability) are not listed as work items.

## How to work an item

1. **Claim one item** by its ID. One agent per item — do not batch.
2. **Re-verify before you build.** These gradings are a snapshot; concurrent sessions move fast. Read the cited files first; if the gap is already closed, say so and stop.
3. **Bar for `full`:** a competent user gets the whole capability *without writing platform code*. Anything short of that stays `partial`.
4. **Prove it.** Write a test that FAILS without your change and passes with it — show both runs. `pnpm turbo build typecheck test --filter=<pkg>` must be green before you call it done.
5. **Smallest correct change.** No refactors, no unrelated files, no new dependencies without saying why.
6. **Never overwrite in-flight work.** If the build is red because another session references a symbol that does not exist yet, report and stop — do not guess their intent. A *committed* broken state (HEAD == working tree) is safe to fix.
7. **DDL is additive only.** Never generate `DROP COLUMN` or a type change.
8. **Stop and ask** when an item needs a product or contract decision rather than an implementation. Those are marked below.

## Already landed — check before you claim

These 34 changes landed AFTER the gradings below were taken, so the evidence on the rows they touch is stale. They are changes, not re-measurements — a row listed here has **not** been re-graded, only invalidated. Re-doing landed work is the most expensive mistake available here, so read the change before you start.

- **`mcp-auth-bypass`** (`a065ac1`) — MCP served an unauthenticated ~9-role admin identity on every non-production deployment (the gate was NODE_ENV !== "production"). Now requires an explicit opt-in flag that cannot be true in production; fails closed by default.
- **`mcp-filter-guard`** (`a065ac1`) — The MCP search tool passed agent-supplied filter fields straight to storage, letting an agent filter on a field it cannot read and recover the value from the result count. Now guarded like the GraphQL path.
- **`subscription-filter`** (`a065ac1`) — foosChanged(filter:{...}) failed OPEN — any property key was un-evaluable from the {id,_type} payload and therefore matched, delivering every event of the type. Now fails closed. Property-level subscription filtering remains unimplemented.
- **`version-conflict-code`** (`a065ac1`) — A storage VERSION_CONFLICT was re-wrapped as EFFECT_EXECUTION_ERROR crossing the transaction boundary, so the 409/412 mapping that already existed was unreachable and clients could not retry on conflict.
- **`version-exposed`** (`a065ac1`) — No read surface returned _version, so If-Match and _expectedVersion asked clients for a value nothing would give them. Now exposed on REST and GraphQL.
- **`aggregate-parity`** (`a065ac1`) — Memory and Postgres returned different min/max for non-numeric columns, so the same chart differed by backend.
- **`consent-primary-id`** (`a065ac1`) — Consent read the object id off the already-shaped GraphQL result, so a type whose @primary field is not named `id` default-denied every row.
- **`function-authz`** (`34f540f`) — Any authenticated caller could invoke any FunctionType, making the action pipeline's controls bypassable by shipping logic as a function. Now role-gated and fail-closed on empty requiredRoles.
- **`function-audit`** (`6f94194`) — Function invocation wrote no audit record at all. Success, denial and throw are now audited best-effort.
- **`function-sandbox`** (`81e0361`) — Pack code ran in-process in the gateway, which holds the Postgres URL, OIDC secret and OpenFGA token. Now forked into an isolated process with an empty env, a heap cap and a wall-clock timeout.
- **`function-rest`** (`8fc01fc`) — FunctionType was GraphQL-mutation-only. REST invocation routes added.
- **`fga-per-tenant`** (`379e5be, 6e8b4ba, 36b5b6d`) — SEVERITY 1: one OpenFGA store served every tenant and tuples carried no tenant qualifier, while object ids are unique only per tenant — so a grant in tenant A authorised the same id in tenant B. Each tenant now has its own store; unknown tenant fails closed.
- **`computed-in-lists`** (`6e8b4ba`) — Derived properties resolved only on single-object get(); they were null in every list, search and export. Now resolved on query() and search() too.
- **`effect-value-types`** (`97f468f`) — Action effects coerced every value to a string, so a manifest saying `quantity: 5` wrote "5". Param validation was presence-only. Both fixed.
- **`primary-field-filter`** (`f8146df`) — Filtering or sorting on the @primary field emitted a column that does not exist — a raised error on Postgres, a silent empty result in memory. Now mapped onto the storage _id.
- **`interfaces-polymorphic`** (`44f5951`) — Interfaces parsed and emitted but no interface-typed query existed, so __resolveType was unreachable and polymorphic querying impossible. Interface-typed queries added.
- **`rest-connector`** (`4bed9d3`) — The REST connector was a stub whose extract methods yielded nothing, so a configured REST datasource silently synced zero records. Implemented.
- **`update-delete-mutations`** (`11a6510`) — Update/delete mutations with optimistic concurrency, plus link aggregates.
- **`age-write-loss`** (`c86e3f7`) — An Apache AGE failure inside a transaction was swallowed, silently discarding the write.
- **`pg-conformance-ci`** (`e2a86b1`) — The SPI conformance suite ran only against the memory provider in CI, so any behaviour differing between providers was structurally undetectable. Postgres half now runs.
- **`cdc-shutdown`** (`6d701a8`) — The wait on a CDC stream was unbounded, so shutdown could deadlock.
- **`audit-tenant`** (`ce7ae32`) — Audit records carried no tenant column at all, so per-tenant audit delegation was unsafe and a DPO could not be scoped to their own organisation. Tenant now recorded on every record.
- **`function-ontology-access`** (`2deda98, a64911f, d5ce1c1`) — FunctionRuntimeContext carried no storage handle, so "functions on objects" could not read or query objects at all. A function can now read an object and an object set scoped as its caller, and a test pins that function-driven edits still go through the action pipeline rather than around it.
- **`param-forgery`** (`c34a3cd`) — SECURITY: the action param type-check EXEMPTED object-typed params, and its comment wrongly claimed step 4 resolved and existence-checked them — step 4 only loads from storage when the value is a STRING. A caller could send an object literal instead of an id, so CEL preconditions were evaluated against FABRICATED data. Reachable over REST (untyped body) and MCP. Object params must now be id strings.
- **`subscription-tenant-isolation`** (`c34a3cd`) — SECURITY: subscription delivery is one topic per object type shared by every tenant (one Kafka topic deployment-wide in production), and the CloudEvent carried no tenant because the emitter took RequestContext as an unused _ctx. The only discriminator was an FGA check run against the SUBSCRIBER's own store, which approves another tenant's event whenever an object id collides — delivering previousValues across the boundary. tenantid is now a required CloudEvents extension attribute and both subscribe helpers drop on mismatch or absence before the FGA check.
- **`search-around-rest`** (`7ace314`) — Multi-hop traversal was implemented in both storage providers, conformance-tested and wrapped by LinkManager.traverse — with zero callers outside the test harness. Now exposed as POST /api/v1/{plural}/:id/traverse. Mixed-type nodes are authorized, redacted and consent-gated per node against their own type; edges to dropped nodes are removed and totalCount is post-authorization, because both otherwise disclose objects the caller may not see.
- **`self-link-support`** (`7ace314`) — Self-referential link types (a reply pointing at its parent comment, a task at its parent task) were never exercised by any fixture, and the OpenFGA generator derives permissions through a type's outbound link — exactly the shape that could emit a cycle. Proven to parse, validate and generate usable GraphQL and OpenFGA output, and pinned so threading stays available to packs.

- **`fga-deployment-config`** (`7ace314`) — BLOCKER: nothing shipped could express the per-tenant store map — `OPENFGA_STORE_IDS` appeared nowhere in `Orion/`, `secrets.yaml` demanded `storeId` unconditionally so multi-tenant was impossible, single-tenant crashed on the chart defaults, and prod-test never set `OIDC_DEFAULT_TENANT` (why the SECURITY_E2E stack stopped booting). CI was linting a configuration that could not boot. A store id without a default tenant is now refused at helm-template time, with the reason.
- **`sync-conflict-refusal`** (`7ace314`) — A datasource declaring `sync.conflictResolution` was scheduled and the strategy silently ignored, so an operator believed user edits were protected while every poll overwrote them. Both declarable strategies decide by comparing the existing value's writer, and nothing wrote field provenance. Such a datasource is now refused rather than synced unprotected.
- **`provenance-producer`** (`45dfc0d`) — `lineage.field_provenance` was created by the DDL, indexed three ways, and stayed permanently empty: `LineageRecorder` is its only producer and the sole `LineageStore` implementation was in-memory. A Postgres store was added and the recorder wired into the production ObjectManager (Postgres only — a recorder writing nowhere would make conflict strategies look enforced). Lineage queries were also made tenant-scoped.
- **`action-precondition-status`** (`45dfc0d`) — The action route accepted `If-Match`, detected the conflict, kept the VERSION_CONFLICT code and had a 412 mapping — then answered 200 with the failure in the body, so a client acting on the status recorded a refused write as applied. Precondition and conflict failures now answer with their real status.
- **`aggregate-field-validation`** (`9504d9c`) — Aggregate field names were never checked against the schema, so the two providers answered the same request differently: Postgres built `SUM("no_such_column")` and raised, while the memory provider returned a null group — a silent wrong answer that looks like data. Unknown and `@computed` fields are now refused before storage is touched.
- **`traversal-maxdepth-refused`** (`9504d9c`) — `TraversalStep.maxDepth` is in the SPI contract and was honoured by NEITHER provider: a caller asking for 2 hops got 1, with no error. Unlike an ignored filter (which returns more, and looks wrong), an ignored depth returns less and looks like real data. Both providers now refuse it, pinned in the shared conformance suite.
- **`memory-snapshot-isolation`** (`9504d9c`) — The in-memory provider claimed `supportsTransactions: true` while applying writes immediately and undoing them from a journal — atomicity without isolation, so a conformance suite passing against it could rely on a dirty read Postgres would never serve. An isolation capability was declared and pinned to observed behaviour; the provider then gained real snapshot-on-begin transactions and the flag moved with it.

## Re-verification, 15 Aug 2026

Two passes ran. Nine agents re-read the 41 rows whose evidence landed work had
invalidated, replacing status, evidence and gap from source. Five rows judged
closest to `full` were hand-checked separately.

**Result: 3 rows reach `full`, all three the same capability** — multi-hop
filtered graph traversal, which appears under `storage-conformance`,
`links-graph` and `ontology-core`. It is reachable on REST, GraphQL and MCP,
implemented by both storage providers with matching semantics, and covered by
the shared conformance suite.

**Correction to the hand-checked pass.** It first graded the two duplicate
traversal rows `partial` on the grounds that the generated SDK throws, so a
consumer must hand-write HTTP. That reading was wrong: *platform code* means
code inside Altius, and calling a documented REST or GraphQL endpoint is using
the platform, not writing it. Under the stricter reading every row in this
inventory would be `partial` forever, since no capability has a working SDK —
which makes the bar meaningless. The agent pass applied it correctly and the
three rows are graded together.

The hand-checked pass also annotated rows without replacing their evidence,
leaving four rows asserting `RE-VERIFIED` directly above a `STALE` marker and
the old text. Those four now carry current evidence in the same format as the
41.

What the agent pass surfaced is worth more than the grade movement: several
rows gained NEW defects introduced by the landed work itself — a lost-update
on storage-memory reproduced by running the provider, GraphQL audit paging
that truncates at 1000 where REST does not, and an aggregate field-validation
guard that now rejects ordering groups by their own measure.

The remaining 141 rows have never been re-read since the original pass. Treat
their evidence as dated, not wrong.


## Blocker review, 15 Aug 2026 (20:43)

Three cross-cutting blockers were reviewed against source. All three are real.
Two open questions from that review were closed by verification below; the
third rests on an external spec this pass did **not** confirm.

**B1 — published SDK package exports nothing; its generator is unreachable.**
RESOLVED (16 Aug 2026, commit 0b263e6). The SDK is now functional end to end:
`@altius/sdk` (packages/sdk-typescript) ships a 1349-line generated client with
per-type get/list/onChange accessors, per-action methods, enums, filter types,
and security-aware types. Runtime transport uses `fetch` for query/mutate and
`WebSocket` for subscribe — no "Not implemented" throws remain. CLI generation
is wired at `packages/odl/src/cli/index.ts:257` (`odl generate sdk <paths...>`),
accepts multiple schema directories and merges them. Prebuild/pretypecheck/
pretest scripts generate from all four domain packs (core, nhs-acute, aml,
supply-chain), so the SDK matches the server's multi-pack schema. S1 is also
resolved: 9 runtime tests in `packages/sdk-typescript/__tests__/sdk-runtime.test.ts`
cover construction, query, list, mutation, error handling, and subscriptions.
All pass. Remaining gap: no React bindings (zero .tsx files, no react dependency).

**B2 — generated link fields truncate at 1000 rows with no signal.** RESOLVED
(16 Aug 2026, commit 0b263e6). List link fields now accept `first`/`after`
arguments in the SDL (packages/odl/src/codegen/index.ts:138 emits
`${field.name}(first: Int, after: String): ${field.type.name}Connection!`).
The resolver (resolver-generator.ts:319-350) decodes the cursor, computes the
offset, caps at MAX_LINK_QUERY_LIMIT, and returns a Relay Connection with
edges/pageInfo/totalCount/hasNextPage. Test:
packages/api/src/__tests__/link-field-pagination.test.ts verifies SDL arguments,
Connection shape, cursor decoding, hasNextPage, and single-valued field behavior.

**S1 — SDK package has no test surface.** RESOLVED (16 Aug 2026).
`packages/sdk-typescript/__tests__/sdk-runtime.test.ts` (318 lines, 9 tests)
covers construction, query, list, mutation, error handling, and subscriptions
with mocked fetch/WebSocket. All 9 tests pass.

**B3 — MCP server is one protocol era behind.** The local facts are verified:
`MCP_PROTOCOL_VERSION = '2025-03-26'`; implemented methods are `initialize`,
`tools/list`, `tools/call` only; advertised capabilities `{ tools: {} }`; no
`bin` declared, so stdio-only IDE clients cannot connect. The claims that make
this a *blocker* rather than a roadmap item — that the 2026-07-28 revision
removes the handshake, that modern-client/legacy-server fails outright, and
that servers must implement `server/discover` — come from an external spec
that this pass did not independently confirm. **Confirm before gating work on
it.** Either way this needs a product decision (dual-era vs full migrate) that
should not be resolved unilaterally.


## Verification state, 15 Aug 2026

**46 of 187 rows now carry evidence read from source on 15 Aug** — the 41
whose evidence landed work had invalidated, plus 5 hand-checked earlier. Their
status, evidence and gap below are what the code says today, not what an
earlier pass inferred.

Outcome of the 41-row pass: **1 full, 33 partial, 7 absent**, and only 2 rows
changed status. Landed work improved the evidence far more than it moved the
grades — which is the honest result, not a disappointing one.

The row that reached `full` is `storage-conformance/graph-traversal-query-primitive`:
REST, GraphQL and MCP all accept a TraversalPath with no platform code required.

The remaining rows have never been re-read since the original pass. Treat their
evidence as dated, not wrong.


## Repo orientation

| Package | Role |
| --- | --- |
| `packages/odl` | ODL compiler — parser, validator, diff/registry, GraphQL + OpenFGA + SDK codegen |
| `packages/engine` | Object/link managers, computed fields, functions runtime, lineage |
| `packages/spi` | Storage contract (types only) |
| `packages/storage-postgres`, `storage-memory` | The two providers — they must agree; `tests/spi-conformance` holds them to it |
| `packages/api` | Gateway: REST + GraphQL + FHIR + CDM + MCP mount, authz/consent/redaction pipeline |
| `packages/actions` | 8-stage governed action pipeline (+ Go CEL sidecar in `packages/cel-evaluator`) |
| `packages/security` | OIDC, OpenFGA ReBAC, consent, audit |
| `packages/sync` | Connectors, mapping DSL, CDC consumer, scheduler |
| `packages/mcp-server` | MCP endpoint over governed actions |
| `domain-packs/*` | Pack content: ODL schema, action manifests, `.fga` overrides, connectors |

Use the indexed code graph before grepping: `search_graph`, `query_graph`. On a `Function` node, `in_degree = 0` on an exported symbol means **nothing calls it** — that is how generated-but-dead code is caught.


## Workshop widgets

### `widgets/action-triggering-widgets-button-group-custo` — Action-triggering widgets (Button Group, custom right-click row actions, action-backed forms, Stepper-driven workflows, Media Uploader action trigger)

**Status:** `partial`

**Evidence (read 15 Aug):** The action substrate is the strongest part of this theme. Execution: POST /api/v1/actions/{Name} (packages/api/src/rest/route-generator.ts:1260-1336) and generated GraphQL mutations (resolver-generator.ts:1272-1300), both running the full ActionExecutor pipeline with consent-subject derivation and If-Match optimistic concurrency, returning `affectedObjects[{typeName,id,changeType}]` for post-action refresh. Form generation is real: ToolDescriptor carries `parameters: JsonSchema` and `returnType` (packages/actions/src/tools/types.ts:16-33), built from @param fields, and is served to any authenticated caller via `availableTools(filter: ToolFilter)` (codegen/index.ts:776, resolver-generator.ts:1384-1420). Actions are also exposed as MCP tools (packages/mcp-server/src/tools.ts:46-90). DEMOTIONS: (1) `dryRunSupported` is hardcoded false on the HTTP surface (resolver-generator.ts:1400 with the comment that neither REST nor GraphQL action routes accept a dryRun flag), so a Stepper cannot preview a step; (2) no per-object action applicability — resolver-generator.ts:1373-1380 states discovery returns every action to every caller because 'requiredPermissions is advisory metadata' and enforcement only happens at execute time, so right-click row menus cannot be filtered without trial execution; (3) no upload path at all — packages/api/package.json has no multer/graphql-upload, server.ts:884 mounts only `express.json({limit:'1mb'})`, and repo-wide grep for multipart/upload returns nothing, so Media Uploader cannot exist.

**Gap:** No dry-run over HTTP (blocks Stepper previews and confirmation UIs), no way to ask which actions apply to a given row without executing, and no file-upload transport for upload-triggered actions.

### `widgets/aggregation-chart-widgets-chart-xy-pie-vega-` — Aggregation chart widgets (Chart XY, Pie, Vega, Pivot Table, Metric Card, Waterfall, Observability Chart)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Bucketing LANDED on both providers: spi/ontology.ts:282-291 (BucketInterval/DateBucket), storage-postgres/src/objects/aggregate.ts:66-80 (date_trunc with ALLOWED_BUCKET_INTERVALS), :127-131 (GROUP BY), :180-184 (keys); storage-memory/src/memory-storage-provider.ts:56-72 (bucketDate), :768-773 (same allowlist), :796-802. Min/max divergence CLOSED but by refusal on both sides: aggregate.ts:204-211 throws when MIN/MAX returns a non-number, memory-storage-provider.ts:854-858 throws on any non-numeric value — so a Metric Card showing a latest timestamp (MAX on DateTime) is now rejected on BOTH providers, not divergent. Still only 5 functions (ontology.ts:280 count|sum|avg|min|max) — no percentile/median/approx-distinct. NEW per-surface divergence: REST /aggregate validates field names and refuses @computed/@link fields (rest/route-generator.ts:1285-1312) and forwards orderBy/limit/offset (:1362-1364); the GraphQL fooAggregate resolver does neither (graphql/resolver-generator.ts:1100-1190 — no validation) and the SDL exposes no orderBy/limit/offset at all (odl/src/codegen/index.ts:918). Engine is a pass-through (engine/src/objects/object-manager.ts:357-369), so a GraphQL aggregate on an unknown or computed field raises in Postgres and returns a null group in memory. Bucket key type also differs: pg returns a JS Date (aggregate.ts:179-184), memory an ISO string (:56-72). No UI layer exists in the repo (packages/ has no frontend package); observability metrics remain pod-direct only (api/src/server.ts:984 podDirectOnly) with Prometheus scrape via Orion/helm/altius/templates/servicemonitor.yaml + prometheusrule.yaml.

**Gap:** GraphQL aggregate has no field validation and no orderBy/limit/offset, so charting over GraphQL is unsortable/unpaged and silently provider-dependent on a bad field name. No percentile/median aggregate, so p95/box widgets are impossible. MAX/MIN over a DateTime is refused by both providers, so a latest-timestamp Metric Card cannot be expressed at all. Bucket key serialization (Date vs ISO string) still differs between providers.

### `widgets/aip-llm-widgets-aip-chatbot-aip-generated-co` — AIP/LLM widgets (AIP Chatbot, AIP Generated Content)

**Status:** `partial`

**Evidence (read 15 Aug):** The agent-facing data half is real; the generative half does not exist. MCP is production-wired behind a pack capability gate: packages/api/src/server.ts:1192-1229 mounts POST/DELETE /mcp via createMcpServer with schema, actionExecutor, authorizationService, authenticator, storage, manifestRegistry and consentSubjectTypes; packages/mcp-server/src/tools.ts:46-60 builds one tool per ActionType plus a search_<Type> per ObjectType, with JSON-Schema inputs derived from @param fields (:64-90), OIDC-authenticated and running the same governed action pipeline with consent defaults (:18-24). DEMOTIONS: (1) there is NO LLM client in the repo — grep for openai/anthropic/completion/embedding/vector across packages returns only incidental matches (packages/actions/src/tools/types.ts:81-93 documents an audit *convention* for a future `llm.call` operation that no code emits, and packages/api/src/governance/rate-limiter.ts:68 mentions token budgets in a comment); (2) no prompt or generation endpoint exists on REST or GraphQL — the generated Query/Mutation fields (packages/odl/src/codegen/index.ts:740-830) contain no prompt/generate/complete field; (3) no vector or embedding storage — StorageCapabilities (packages/spi/src/ontology.ts:233) has no vector flag and no pgvector appears in the DDL; (4) MCP is a server, not a client: Altius exposes tools to an external model host and never calls a model itself.

**Gap:** Altius can be a tool provider to someone else's chatbot but cannot host one: no model client, no prompt/generation endpoint, no embeddings or vector search, and no chat/message persistence. AIP Generated Content has no path at all.

### `widgets/audit-and-edit-history-widgets-action-log-ti` — Audit and edit-history widgets (Action Log Timeline, Edit History)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Read API LANDED both surfaces: REST GET /api/v1/audit (api/src/rest/audit-routes.ts:43-95, wired at server.ts:1107), role-gated (:52-65) and store-paged with a separate count (:76-79). GraphQL auditRecords wired (resolver-generator.ts:634 -> :1911-1995; SDL odl/src/codegen/index.ts:573-626, :950). Prior 'no actor field' gap is CLOSED: _actorId in the SPI (spi/src/ontology.ts:20-21), written by Postgres on create/update/soft-delete (storage-postgres/src/objects/object-crud.ts:141-142, :241-243, :315-317) with DDL + migration for object and *_history tables (schema/ddl-objects.ts:23, :45-61), written by memory (memory-storage-provider.ts:497, :531, :550), surfaced on GraphQL (resolver-generator.ts:247; SDL codegen/index.ts:137) and REST get/list/history (route-generator.ts:99, :1180, :1226); both transports set actorId=user.id (graphql/server.ts:90-103, reused by REST via buildResolverContext at server.ts:1136). NEW defect on the GraphQL mirror: resolver-generator.ts:1973 calls deps.auditStore.query(filter) with NO paging options, then computes totalCount from the returned array (:1974) and slices in JS (:1985). PostgresAuditStore.query defaults to LIMIT 1000 (storage-postgres/src/audit/postgres-audit-store.ts:95, :120-122), so on Postgres GraphQL totalCount pins at 1000, hasMore goes false with records unread, and offset>=1000 returns empty — the exact bug commit d1bd011 fixed for REST. MemoryAuditStore.query with no options returns everything (security/src/audit/memory-audit-store.ts:38-40), so the two providers also disagree. All of this is uncommitted working-tree code (resolver-generator.ts is 'M' and was being edited concurrently during this check).

**Gap:** GraphQL auditRecords is unpaged at the store: on Postgres an Action Log Timeline cannot scroll past 1000 records and reports a wrong total, while the same query on memory storage returns everything — REST is correct, GraphQL is not. Edit History still ships no field-level diff (clients diff whole snapshots themselves), and none of this is committed.

### `widgets/filtering-and-search-widgets-filter-list-his` — Filtering and search widgets (Filter List histograms, Object Dropdown/Selector, date/text/numeric inputs, Exploration Filter Pills/Search Bar, Prominent Terms, User Select)

**Status:** `partial`

**Evidence (read 15 Aug):** GraphQL filtering is genuinely complete: packages/odl/src/codegen/index.ts:180-201 generates per-type Filter inputs with AND/OR/NOT, :51-58 getFilterOps assigns numeric ops to Int/Float/Date/DateTime/Duration and string ops elsewhere, :214-226 generates OrderBy; packages/api/src/graphql/resolver-generator.ts:130-145 mapFilterOp translates eq/ne/gt/gte/lt/lte/in/contains/startsWith/exists to SPI operators (SPI set at packages/spi/src/ontology.ts:45-65). Full-text search exists end to end: SPI searchObjects (storage-provider.ts:47), Postgres ILIKE + pg_trgm GIN (packages/storage-postgres/src/objects/search.ts:1-12), memory term-scan (packages/storage-memory/src/memory-storage-provider.ts:709-770), exposed as GET /{plural}/search (route-generator.ts:1119) and searchXs (codegen/index.ts:752). DEMOTIONS: (1) REST filtering is equality-only — packages/api/src/rest/route-generator.ts:93-125 parseQueryFilter hardcodes `operator: 'eq'` for every filter[field] param, so no REST date-range, numeric-range, contains or in filters exist at all; (2) no bucketing anywhere — packages/spi/src/ontology.ts:259-266 AggregateQuery has only fields/groupBy/filter/orderBy/limit/offset, and packages/storage-postgres/src/objects/aggregate.ts:92-97 emits a bare GROUP BY on raw columns with no date_trunc/width_bucket, so a Filter List histogram over a date or numeric property is impossible; (3) no term-frequency/facet API for Prominent Terms — SearchResult (ontology.ts:296-300) returns hits/totalCount/hasNextPage only; (4) grep for listUsers, /users, userDirectory, principals across packages/api/src and packages/security/src returns nothing, so User Select has no substrate.

**Gap:** Histograms, facets/prominent terms and user pickers have no backing API. REST clients get equality filters only — the rich operator set is GraphQL-exclusive, so half the platform's own surface cannot drive a date or numeric filter widget.

### `widgets/function-backed-widget-data-function-backed-` — Function-backed widget data (function-backed columns, function aggregation layers, prompt functions, derived display properties)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** computed-in-lists LANDED: engine/src/objects/object-manager.ts:349 (query) and :387 (search) both call withComputed (:415-434, bounded waves), so @computed columns now render in tables and search hits, not just single gets. function-rest LANDED: one shared entry point api/src/functions/invoke-function.ts:343, called by GraphQL (resolver-generator.ts:1464) and REST (route-generator.ts:1727), with deny-by-default requiredRoles authz (:370-385) and audit on denied/error/success (:49-70). function-ontology-access LANDED: ontologyReaderFor (:152-336) exposes getObject/getLinkedObjects/queryObjects/applyAction under ReBAC + field redaction + consent. BUT the computed-field bridge does NOT use any of it: engine/src/computed/computed-field-evaluator.ts:281 calls this.functionExecutor.execute(fn, inputs) with no opts, and api/src/server.ts never sets FunctionExecutor's constructor-level `ontology` (grep 'ontology:' in server.ts returns nothing; see function-executor.ts:264, :345). A function-backed column therefore receives only the directive args plus `this: {_type,_id}` (computed-field-evaluator.ts:280) and cannot read one field of the object it is computing for. That path also skips the requiredRoles gate and the audit write that invoke-function.ts:370-396 enforces. Function aggregation layers: REST /aggregate explicitly refuses @computed fields (route-generator.ts:1292-1312); GraphQL does not refuse but no column exists, so Postgres raises and memory returns a null group (object-manager.ts:357-369). Prompt functions: NoOpLLMClient is the only LLMClient in the repo (engine/src/llm/noop-llm-client.ts:23, throws on every method) and server.ts:832 hardcodes `llmClient: new NoOpLLMClient()`; LLM_PROVIDER appears only inside 7 error strings (llm-routes.ts:30,86; resolver-generator.ts:1839,1877; noop-llm-client.ts:33,41,49) and is read by no code. Only two function runtimes are registered, node-isolated and CEL (server.ts:353-356) — no prompt/llm runtime exists.

**Gap:** Function-backed columns execute blind: the @computed bridge passes no FunctionOntologyAccess and no server wiring supplies a default, so the function can see neither the row nor the ontology; it also bypasses requiredRoles and audit that direct invocation enforces. Function aggregation layers are impossible — REST refuses computed fields and GraphQL fails provider-dependently. Prompt functions have no model: NoOpLLMClient is hardcoded and LLM_PROVIDER is named only in error text, so configuring a provider requires editing server.ts.

### `widgets/geospatial-widgets-map-map-legacy-current-lo` — Geospatial widgets (Map, Map [Legacy], Current Location Manager)

**Status:** `partial`

**Evidence (read 15 Aug):** Coordinates can be stored and read, and nothing more. GeoPoint is a first-class ODL scalar: packages/odl/src/validator/index.ts:23 allowlists it, packages/odl/src/codegen/index.ts:29,:37 emit it as a custom GraphQL scalar, packages/storage-postgres/src/schema/type-mapping.ts:25 maps it to JSONB, packages/odl/src/codegen/sdk.ts:33 types it `{ lat: number; lng: number }`, and packs use it (domain-packs/core/schema/core.odl:31 `location: GeoPoint`, domain-packs/supply-chain/schema/facility.odl:12, domain-packs/nhs-acute/schema/ward.odl:14). DEMOTIONS: (1) both storage providers explicitly declare `supportsGeoQueries: false` — packages/storage-postgres/src/postgres-storage-provider.ts:658 and packages/storage-memory/src/memory-storage-provider.ts:1035 — and the integration test asserts it (packages/storage-postgres/src/__tests__/provider-lifecycle.integration.test.ts:141); (2) the SPI operator set has no spatial predicate (packages/spi/src/ontology.ts:45-65: eq/neq/gt/gte/lt/lte/in/contains/startsWith/exists), so no bbox, radius or within filter exists; (3) repo-wide grep for postgis/PostGIS/ST_Distance/geoshape/geohash returns zero hits — no spatial index, no geometry type; (4) validation is vacuous — packages/engine/src/objects/validation.ts:81 accepts any non-null object as a GeoPoint, so `{}` or `{foo:1}` stores fine; (5) type divergence — packages/mcp-server/src/tools.ts:36 declares GeoPoint as JSON-Schema `'string'` while the SDK declares `{lat,lng}`; (6) no GraphQL scalar resolvers are registered (packages/api/src/graphql/server.ts:47-56 passes only generated resolvers to makeExecutableSchema), so GeoPoint/DateTime coerce as unvalidated pass-throughs.

**Gap:** A JSONB blob with no shape validation, no spatial index and no spatial predicate. Markers can be plotted by fetching whole rows, but viewport/bbox filtering, radius search and clustering are impossible, and nothing stops a malformed point from being written.

### `widgets/live-updating-widgets-and-event-driven-inter` — Live-updating widgets and event-driven interactivity (auto-refreshing tables/charts, Workshop events, variable propagation)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** subscription-filter LANDED and now fails CLOSED: api/src/subscriptions/subscription-manager.ts:399-413 drops any event whose filter key is not present on the payload's object. subscription-tenant-isolation LANDED: both resolvers reject cross-tenant events before the FGA check (:312 and :373), with tenantId carried on the payload (:27, :78, :121). The fix converts a leak into a dead feature, though: the payload carries only object:{id,_type} (:79, :122), so the only filter keys that can ever match are changeType, id and _type — a filter on any real property (status, riskLevel) silently yields zero events, and the SDL types the argument as bare JSON (odl/src/codegen/index.ts:1009) so nothing signals which keys work. Worse, the SDL declares `object: ${typeName}!` on the change event (codegen/index.ts:317-326) while the runtime supplies two keys and no ${name}ChangeEvent field resolver exists to hydrate it (generateSubscriptionResolvers, resolver-generator.ts:1473-1486, registers only the two Subscription fields). For a real pack type such as AML Customer (domain-packs/aml/schema/customer.odl:9-18, externalId/name/type/riskLevel all non-null) selecting anything but the @primary id nulls a non-null field and errors the whole non-null subscription payload, so every event forces a refetch. Wiring itself is real (server.ts:858-893 SubscriptionManager + graphql-ws useServer; Redpanda or in-memory bus at :289-304). No cross-component event/variable bus exists — there is no UI layer in the repo and packages/api/src/events is CloudEvents transport only.

**Gap:** Property-level subscription filtering still does not work — it now silently delivers nothing instead of flooding, and the SDL's `filter: JSON` documents none of that. The change payload contains only id and _type while the SDL promises a full non-null object, so any field selection on `object` errors the payload and every widget must refetch per event. No Workshop-style event or variable bus exists at all.

### `widgets/object-display-widgets-object-table-object-l` — Object display widgets (Object Table, Object List, Object View, Property List, Links, Object Set Title)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** version-exposed LANDED on both surfaces: _version in objectToRest (api/src/rest/route-generator.ts:95) and objectToGraphQL (graphql/resolver-generator.ts:244) with `_version: Int` in the SDL (odl/src/codegen/index.ts:132), so the If-Match optimistic-concurrency check (route-generator.ts:1000-1004) is now completable from a read. REST sort LANDED (commit 8d98340): parseOrderBy reads ?sort/&order and validates against queryableFields (route-generator.ts:234-266, :137-143), applied at :580 and :600; full operator map at :114-125. Still ABSENT: any display metadata — ObjectTypeDirective is `{ kind: 'objectType' }` with no arguments (odl/src/parser/types.ts:109-111) and the FieldDirective/TypeDirective unions (:23-105, :154+) contain no title/icon/label/display kind; grep for titleProperty/@display/singular/plural across packages/odl/src returns nothing. Timestamps still hidden on the primary read shapes: objectToRest (:75-104) and objectToGraphQL (:235-251) emit only _id/_version/_actorId/_redactedFields/_consentRestricted, and generateObjectType (codegen/index.ts:120-148) adds no _createdAt/_updatedAt; they appear only on the history route (:1179, :1225) and in the CSV export column list (:693). REST sort is single-key (parseOrderBy returns a one-element array) though the SPI accepts an array. Links diverge by surface: REST /{plural}/:id/links/:linkType returns LINK RECORDS redacted against the link type, not the linked objects, despite its own doc comment (route-generator.ts:1026, :1062-1077); the GraphQL link field does return target objects but is hardcoded to limit 1000 with a sequential per-target FGA check + get (resolver-generator.ts:329-405) and link fields carry no pagination arguments in the SDL (codegen/index.ts:125-128).

**Gap:** No display metadata anywhere in ODL (no title property, icon, or singular/plural label), so Object Set Title and Object View headers still have no substrate. _createdAt/_updatedAt are absent from every normal read on both REST and GraphQL, so a Property List cannot show 'last modified'. REST Links returns edge records rather than linked objects (client-side N+1), while GraphQL returns objects but caps at 1000 with no pagination args and a sequential per-target read. REST sort is single-key only.

### `widgets/saved-views-and-per-user-state-state-saving-` — Saved views and per-user state (state saving, variable-backed column config, reusable object-set variables as widget inputs)

**Status:** `partial`

**Evidence (read 15 Aug):** Object sets are the strongest substrate in this theme and are genuinely per-user. Full REST CRUD plus execution: packages/api/src/rest/route-generator.ts:1359-1720 gives GET/POST/PUT/DELETE /api/v1/object-sets, GET /:id/execute (with FGA scoping, field-redaction rejection on saved filter/orderBy at :1554-1573, consent pagination, and ?format=ndjson at :1638-1648) and GET /:id/aggregate (:1673-1720); GraphQL mirrors it (packages/odl/src/codegen/index.ts:777-778, resolver-generator.ts:1470-1520). Persistence is real on both backends and selected at boot: packages/api/src/server.ts:708-712 picks PostgresObjectSetStore when storage is Postgres, InMemoryObjectSetStore otherwise. Per-user visibility is enforced identically on both — packages/storage-postgres/src/object-sets/postgres-object-set-store.ts:232-233 scopes list/get to `("is_public" = TRUE OR "created_by" = $n)` and :221 restricts update/delete to the creator (fail-closed when actorId is absent), matching packages/engine/src/object-sets/in-memory-object-set-store.ts:80-81,:112-113,:127-133. DEMOTIONS: (1) ObjectSetDefinition (packages/spi/src/object-set.ts:12-26) is id/name/objectType/filter/orderBy/limit/aggregation only — no column list, no widget or view config, so 'variable-backed column config' has nowhere to live; (2) no set algebra or composition — a set cannot reference another set as its base, and there is no union/intersect/subtract in the store interface (:29-36) or the REST update allowlist (route-generator.ts:1462); (3) no general per-user preference store exists — object sets are the only user-scoped persistence in the repo.

**Gap:** Saved queries only. No column/view configuration to persist, no composable object-set variables (no set algebra, no set-of-set reference), and no per-user state store for anything that is not a filter+sort+aggregation.

### `widgets/time-series-widgets-time-series-columns-in-o` — Time series widgets (time series columns in Object Table, Metric Card sparklines, Time Series Analysis widget)

**Status:** `partial`

**Evidence (read 15 Aug):** There is a per-object property-over-time substrate, but only that. Temporal reads are in the SPI (packages/spi/src/storage-provider.ts:62-63 getObjectAtVersion/getObjectAtTime) and implemented on both providers (packages/storage-memory/src/memory-storage-provider.ts:980-1005; packages/storage-postgres/src/temporal/temporal-queries.ts via postgres-storage-provider.ts:63-66). GET /api/v1/{plural}/:id/history (packages/api/src/rest/route-generator.ts:923-1012) returns every version snapshot and manually re-attaches _version and _updatedAt at :983-984 — that is a genuine, if crude, value-vs-time series for one object. DEMOTIONS: (1) the history route loops `for (let v = 1; v <= currentVersion; v++)` issuing one storage read per version (:960-971) — N+1 with no pagination, limit or time-range filter; (2) it is REST-only — the generated Query type (packages/odl/src/codegen/index.ts:740-792) has no history field, so GraphQL clients cannot reach it at all; (3) no series can appear in a list or aggregate — objectToRest strips timestamps and ObjectManager.query is a bare pass-through (packages/engine/src/objects/object-manager.ts:292-305); (4) no date bucketing in AggregateQuery (packages/spi/src/ontology.ts:259-266) and no date_trunc in the Postgres builder (packages/storage-postgres/src/objects/aggregate.ts:92-97), so no downsampling or multi-object series; (5) grep for timeseries/TimeSeries/time_series across packages returns nothing — there is no time-series property type.

**Gap:** One object's version history is all you get, via an unpaginated N+1 REST call absent from GraphQL. No time-series property type, no bucketing/downsampling, no series in list or aggregate responses — so time-series table columns and sparklines have nothing to bind to.

### `widgets/comments-collaboration-widget-threads-on-obj` — Comments / collaboration widget (threads on objects, @-references, notifications, action-log mirroring)

**Status:** `absent`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** No comment/thread/mention/notification entity exists. Repo-wide grep for comment|thread|mention|notif across packages/**/*.ts and domain-packs/**/*.odl returns only (a) MCP JSON-RPC plumbing (packages/mcp-server/src/protocol.ts:162-166, server.ts:208-213 handleNotification — a no-op for notifications/initialized) and (b) the landed self-link work, which is a TEST ONLY: packages/odl/src/__tests__/self-link.test.ts:21-42 defines a Comment/CommentOn/ReplyTo fixture and asserts a self-referential @link parses, validates, generates GraphQL and generates an OpenFGA model (ran it: 4 tests pass). Nothing named Comment/Thread exists outside that fixture — no domain pack declares one (domain-packs/*/schema/*.odl: aip has ChatMessage/Conversation only, domain-packs/aip/schema/chat-message.odl:7-21 + links.odl:7, which is LLM chat linked ONLY to a Conversation, not to an arbitrary ontology object). No @-mention parsing, no user-resolution, no notification transport (the only outbound transports are action webhooks, packages/actions/src/sideeffects/side-effect-executor.ts, and CloudEvents). Audit/action-log exists (packages/api/src/rest/audit-routes.ts) but there is no comment entity to mirror into it.

**Gap:** Everything: no comment/thread object type, no mention resolution, no notification transport, no collaboration surface on any API. The landed work only pins that a pack COULD model self-referential threading in ODL; the runtime, mentions, and notifications behind it do not exist.

### `widgets/data-freshness-widget-last-indexed-timestamp` — Data Freshness widget (last-indexed timestamps per object type/datasource)

**Status:** `absent`

**Evidence (read 15 Aug):** No freshness API exists. Repo-wide grep for freshness / lastIndexed / last_indexed / lastSync / watermark across packages returns nothing. The only last-processed signal is a Prometheus gauge: packages/api/src/metrics.ts:197-217 startSyncMetricsGauge polls scheduler.stats() every 15s and sets syncLastProcessedTimestamp{datasource}. It is unusable as widget data on four counts: (a) it is Prometheus text at GET /metrics, gated by podDirectOnly (packages/api/src/server.ts:914; the guard at packages/api/src/metrics.ts:145-153 returns 404 for any request bearing x-forwarded-for, i.e. anything through an ingress); (b) it only exists when SYNC_SCHEDULER_ENABLED === 'true' (server.ts:732-741) — otherwise syncBoot.scheduler is null and startSyncMetricsGauge is never called (server.ts:742); (c) stats are in-process per pod and reset on restart; (d) it is per-datasource with no per-object-type breakdown. The obvious fallback is also closed: objectToRest (packages/api/src/rest/route-generator.ts:70-87) drops _updatedAt from every REST response and generateObjectType (packages/odl/src/codegen/index.ts:120-136) omits it from GraphQL types, so no client can read a record's last-modified time; a max(_updatedAt) aggregate is reachable only when no field-redaction policy is configured, since the aggregate route rejects any field absent from getVisibleFields (route-generator.ts:1050-1068).

**Gap:** No queryable per-type or per-datasource freshness. The only timestamp is an ingress-blocked, opt-in, per-pod, in-memory Prometheus gauge, and record-level _updatedAt is stripped from both API surfaces.

### `widgets/embedding-and-cross-app-widgets-iframe-embed` — Embedding and cross-app widgets (Iframe, Embed Foundry apps: Quiver/Notepad/Vertex/embedded Workshop modules, App Pairing, Commands)

**Status:** `absent`

**Evidence (read 15 Aug):** Nothing to embed and no embedding mechanism. Repo-wide grep for iframe across packages returns zero hits. There is no application registry, no app-identity model and no deep-link scheme — grep for workshop/module builder/dashboard/app pairing across packages/api/src, packages/spi/src, packages/engine/src, packages/odl/src returns nothing. The only sibling-app surface is /admin/packs (packages/api/src/server.ts:953-977), which returns pack name/version/namespace and type counts and is itself gated by podDirectOnly (metrics.ts:145-153, 404 behind any ingress). Embedding is also actively blocked at the transport: server.ts:870 applies helmet with default CSP in non-dev, and CORS defaults to `origin: false` when no allowlist is set (:877).

**Gap:** No peer applications exist to embed, no app registry or pairing model, no command palette surface, and the production security headers are configured to prevent framing rather than support it.

### `widgets/layout-navigation-and-device-capture-widgets` — Layout, navigation, and device-capture widgets (Tabs, Stepper, Markdown, Mobile Navbar, Header, QR Code Reader, camera capture, geolocation prompt)

**Status:** `absent`

**Evidence (read 15 Aug):** Layout and navigation are pure UI concerns and no UI exists (see capability 1: no *.tsx/*.jsx/*.vue/*.svelte anywhere, no widget/layout/module concept in packages/*). The two capabilities here that would need a data substrate also lack one: (a) camera/QR capture requires a binary ingest path — packages/api/package.json has no multer/graphql-upload and packages/api/src/server.ts:884 mounts only `express.json({limit:'1mb'})`, so no image or scan payload can be posted; (b) geolocation capture requires a place to write a point — the GeoPoint scalar is validated as merely 'any non-null object' (packages/engine/src/objects/validation.ts:81), stored as opaque JSONB (packages/storage-postgres/src/schema/type-mapping.ts:25), and both providers report supportsGeoQueries:false (postgres-storage-provider.ts:658, memory-storage-provider.ts:1035).

**Gap:** No rendering layer, and neither device-capture path has a receiving substrate: no multipart ingest for camera/QR frames and no validated geospatial write target for a location prompt.

### `widgets/media-and-document-widgets-media-preview-med` — Media and document widgets (Media Preview, Media Uploader, PDF Viewer, Image Annotation, Spreadsheet Display, Video/Audio preview)

**Status:** `absent`

**Evidence (read 15 Aug):** There is no binary storage and no upload transport. Repo-wide grep for Attachment / MediaReference / blob / Blob / s3 / S3 / minio across packages/api/src, packages/spi/src, packages/engine/src and packages/odl/src returns zero hits; every 'attachment' match is a Content-Disposition header on CSV/NDJSON exports (packages/api/src/rest/route-generator.ts:516,:528,:1647; packages/api/src/cdm/router.ts:344,:356). The ODL scalar allowlist is Date, DateTime, Duration, GeoPoint, JSON, URI (packages/odl/src/validator/index.ts:23) — no attachment or media type. packages/api/package.json declares no multer or graphql-upload, and packages/api/src/server.ts:884 mounts only `express.json({ limit: '1mb' })`, so no multipart request can even be parsed. The nearest adjacent capability is tabular export (NDJSON/CSV at route-generator.ts:469), which is not a spreadsheet widget substrate.

**Gap:** No blob store, no attachment property type, no multipart parsing, no content-type/thumbnail metadata. Every media widget is unimplementable end to end.

### `widgets/no-code-widget-library-app-building-ui-layer` — No-code widget library / app-building UI layer (~50 configurable widgets in a module builder)

**Status:** `absent`

**Evidence (read 15 Aug):** Altius is headless, verified today. pnpm-workspace.yaml lists only packages/*, domain-packs/*, tests/*, tools/*; the 13 packages (odl, engine, spi, api, actions, security, sync, mcp-server, cel-evaluator, observability, sdk-typescript, storage-postgres, storage-memory) contain no frontend. A repo-wide find for *.tsx/*.jsx/*.vue/*.svelte returned zero files; the only *.html are docs/audit/closed-loop-position.html and docs/audit/foundry-parity-audit.html (audit reports). Case-insensitive grep for 'widget', 'workshop', 'dashboard', 'module builder' across packages/api/src, packages/spi/src, packages/engine/src, packages/odl/src returns nothing. Even the client story is a stub: packages/sdk-typescript/src/index.ts is 7 lines exporting `export {}` ('will be populated by the SDK generator'), and the generator's own client at packages/odl/src/codegen/sdk.ts:377-393 emits query/mutate/subscribe bodies that `throw new Error("Not implemented: provide runtime transport")`.

**Gap:** No UI package, no module/layout/widget config model, no persistence for app definitions. The generated TypeScript SDK now has working transport (B1 resolved), but no React bindings exist. Everything a widget would bind to must be hand-wired against REST/GraphQL by the consumer.

### `widgets/platform-resource-widgets-resource-list-link` — Platform-resource widgets (Resource List, Linked Compass Resources — browse files/projects, link files to objects, upload-and-link)

**Status:** `absent`

**Evidence (read 15 Aug):** There is no resource/file catalogue. Repo-wide grep across packages for blob/Blob/s3/S3/minio and for upload/multipart returns zero hits; the ODL scalar allowlist (packages/odl/src/validator/index.ts:23) has no file or resource type, so nothing can be linked to an object. The only resource-ish endpoint is GET /admin/packs (packages/api/src/server.ts:953-977), which enumerates loaded domain packs (name, version, namespace, type counts) — build-time artifacts, not user-browsable project files — and it is gated by podDirectOnly (packages/api/src/metrics.ts:145-153) so it 404s behind any ingress. Upload-and-link is doubly blocked: no store to upload to, and server.ts:884 parses JSON only.

**Gap:** No file/resource entity, no storage backend, no upload transport, and no browsable project hierarchy. The only introspection surface is pod-internal pack metadata.

### `widgets/scenario-widgets-scenario-manager-scenario-s` — Scenario widgets (Scenario Manager, Scenario Selector, Scenario Summary, scenario-compare columns in tables/charts/Gantt)

**Status:** `absent`

**Evidence (read 15 Aug):** No scenario or branching model exists. Repo-wide grep for scenario/Scenario across packages/ matches only test prose in packages/security/src/consent/consent-service.test.ts:540-576 ('MVP spec scenarios', 'Scenario 1: direct care exemption…'). Grep for branch/Branch across packages/api/src, packages/spi/src, packages/engine/src and packages/odl/src returns nothing. The write path is single-timeline: StorageProvider (packages/spi/src/storage-provider.ts:35-73) offers no branch/scenario parameter, RequestContext (packages/spi/src/ontology.ts:106-108) carries only tenantId/actorId/traceId, and QueryOptions (:92-99) offers asOfVersion/asOfTime — time travel, not what-if. Object sets (packages/spi/src/object-set.ts:12-26) are filter definitions with no overlay or edit layer.

**Gap:** No branch/scenario dimension in RequestContext, storage, or queries; no uncommitted-edit overlay. Nothing to select, summarize, or compare.


## Mixed III

### `misc-3/action-parameters-and-form-configuration-typ` — Action parameters and form configuration (typed inputs, hidden/read-only params, dropdown filtering, overrides, submission criteria wiring)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Typed-input enforcement is now real and I verified it live against the built packages (node probe driving ActionExecutor over MemoryStorageProvider): a String param given 42 returns success:false code INVALID_PARAM_TYPE 'Parameter "title" has invalid type. Expected String, got number'; an absent required param returns MISSING_REQUIRED_PARAM. Implementation: packages/actions/src/executor/action-executor.ts:66-153 (PARAM_TYPE_CHECKS + enum membership + object-param-must-be-id-string at :140-145) called from validateParams at :640-704, i.e. step 1 for every surface (REST route-generator.ts:1595, GraphQL, MCP tools.ts:242). Effect values also keep their YAML types now (resolveExpression returns non-strings untouched, action-executor.ts:1247-1251; parser/index.ts no longer String()-coerces). The declarative FORM layer is still entirely missing: the ODL field-directive set is closed at packages/odl/src/parser/index.ts:304-363 (primary, unique, indexed, readonly, sensitive, param, link, computed, constraint, default, deprecated, terminology, searchable, immutable) — there is no hidden, no read-only param, no dropdown/value-source, no allowedValues, no cross-parameter option filtering, no override directive; grep for form|dropdown|allowedValues|valueSource|prefill across odl/actions/api finds nothing. Param metadata for rendering exists on ONE surface only: GraphQL availableTools (packages/api/src/graphql/resolver-generator.ts:1509-1519 delegating to ToolRegistry.buildParametersSchema, packages/actions/src/tools/tool-registry.ts:234-254) and MCP tools/list (packages/mcp-server/src/tools.ts:67-88); REST GET /api/v1/actions returns bare action names only (packages/api/src/rest/route-generator.ts:1688-1701). @default on a param/field is never materialized (packages/api/src/schema-loader.ts:803-806 never sets PropertyDefinition.defaultValue). Preconditions gate submission (action-executor.ts:380-388) but cannot drive rendering. A rejected action still answers HTTP 200 with success:false unless the code maps to precondition/conflict (route-generator.ts:1611-1632; MISSING_REQUIRED_PARAM/INVALID_PARAM_TYPE map to 'system' per rest/errors.ts:126-147).

**Gap:** No form-configuration layer at all: no hidden/read-only params, no dropdown value sources, no cross-parameter option filtering, no overrides. Param metadata (types+required) is reachable on GraphQL/MCP but not REST. @default is declarable and dropped. Validation failures answer 200.

### `misc-3/dataset-table-read-export-api-readtable-arro` — Dataset table read/export API (readTable: Arrow/CSV export addressed by branch and transaction, column projection, row limits)

**Status:** `partial`

**Evidence (read 15 Aug):** An export route exists: GET /api/v1/{plural}/export?format=ndjson|csv&limit= (packages/api/src/rest/route-generator.ts:462-536), reusing collectRawRecords for FGA scoping, field redaction and consent filtering, and emitting X-Export-Truncated / X-Export-Limit headers. Arrow is explicitly NOT implemented — the doc comment states Arrow IPC is deliberately deferred because it would require apache-arrow (route-generator.ts:458-459), and no package.json in the repo depends on apache-arrow (verified across the full dependency list). 'readTable' appears only in two comments (route-generator.ts:459, 1638), never as a symbol. No branch addressing: grepping all *.ts for 'branch' yields only unrelated control-flow comments (packages/actions/src/executor/action-executor.ts:384, packages/api/src/__tests__/cdm.test.ts:246, version.test.ts:23) — no branch concept exists. No transaction addressing on the read path. No column projection: the only query params parsed are format and limit (route-generator.ts:474-487); CSV columns are auto-derived from the type's non-link non-computed fields (route-generator.ts:508-514).

**Gap:** Two of the four addressing/shaping dimensions in the row are missing outright (branch, transaction) and a third (column projection) has no parameter. Arrow is unimplemented by design. Rows are hard-capped at REST_EXPORT_LIMIT = 10_000 (route-generator.ts:449) with no pagination or streaming, so any type with more than 10k rows cannot be fully exported through this API.

### `misc-3/mcp-agent-integration-ontology-mcp-exposing-` — MCP/agent integration (Ontology MCP exposing object-type SQL, action tools, and query functions to external agents; agents-as-tools composition)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Tool list today = one tool per ActionType + search_<Type> + traverse_<Type> per ObjectType (packages/mcp-server/src/tools.ts:46-61; buildTraverseTool at :443 and invokeTraverseTool at :482 are UNCOMMITTED working-tree additions — git status shows tools.ts/protocol.ts/server.ts/types.ts modified). Of the three named families: action tools yes; object-type SQL does NOT exist anywhere in the product (no SQL/query endpoint in packages/api/src/rest, packages/api/src/graphql or packages/mcp-server — grep for sql/executeSql/rawSql outside storage internals returns nothing); query functions are still invisible to MCP — buildToolList iterates only deps.schema.actionTypes and objectTypes, never schema.functionTypes, even though @function types ARE exposed on REST (POST /api/v1/functions/{Name}, packages/api/src/rest/route-generator.ts:1712-1725) and GraphQL (resolver-generator.ts:604-606). Agents-as-tools composition: still nothing — ToolRegistry.executeForAgent (packages/actions/src/tools/tool-registry.ts:137) has in_degree 0 in production, referenced only by packages/actions/src/tools/__tests__/tool-registry.test.ts; no agent can be registered as a tool for another agent. Dry-run is now reachable on REST (?dryRun=true, route-generator.ts:1601 → action-executor.ts:401-412) but MCP's invokeActionTool never passes it (tools.ts:242-248), so agents still cannot dry-run. What the mcp-auth-bypass commit did fix: every method authenticates before dispatch (server.ts:96) and the dev fallback now requires ALTIUS_MCP_DEV_AUTH_BYPASS=true AND NODE_ENV!=production, failing closed when unset (auth.ts:38-47). The server is still mounted only when a loaded pack declares capability 'mcp' (server.ts:603, 1282) — pack YAML, not platform code.

**Gap:** Two of three tool families missing: no object-type SQL anywhere in the product, and @function query functions are not exposed as MCP tools though REST/GraphQL expose them. No agents-as-tools composition (executeForAgent unreferenced outside tests). Dry-run unreachable from MCP.

### `misc-3/ontology-change-history-review-and-restore-p` — Ontology change history, review, and restore (per-resource edit history, unsaved-changes review, restore object type to prior version)

**Status:** `partial`

**Evidence (read 15 Aug):** The write side is real: SchemaVersion stores an immutable snapshot plus diff and MigrationClass (packages/odl/src/registry/types.ts:14-25), with two implementations — InMemorySchemaRegistry (packages/odl/src/registry/index.ts:98) and PostgresSchemaRegistry (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:136). Production records a version at boot via recordSchemaVersion (packages/api/src/server.ts:236-240). The READ side is dead: getSchemaHistory() has zero production callers — grepping all of packages for it returns only the two implementations, the interface (packages/odl/src/registry/types.ts:69), and three test files. No REST/GraphQL endpoint exposes ontology history (grepped server.ts and route-generator.ts for schema/history: nothing). Restore does not exist: the ODL CLI 'rollback' command (packages/odl/src/cli/index.ts:255-300) only PRINTS a reverse diff to stdout, requires the operator to pass --old-path and --new-path itself, never reads the registry, and never applies anything. Grepped packages/odl and the schema-registry for restore|revert: only SPI whole-provider backup restore (packages/spi/src/backup.ts:19), which is unrelated.

**Gap:** History is written but unreadable by any user — no API surface. No restore of an object type to a prior version (rollback is a diff report, not an operation). No per-resource edit history and no unsaved-changes review, both of which presuppose an editing UI that does not exist.

### `misc-3/outbound-rest-integration-rest-api-sources-w` — Outbound REST integration (REST API sources with managed auth, action-triggered webhooks, code-based external transforms for REST sync/export)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** REST ingestion is no longer a stub and is genuinely wired end to end: packages/sync/src/connectors/rest-connector.ts:107-397 implements offset/page/cursor pagination (paginate :232-283), bearer/basic/oauth2-client-credentials auth with a cached token (authHeaders :318-331, oauthToken :347-377), recordsPath extraction (:86-105), per-row checkpoints (:305-316); registered by default (packages/sync/src/connectors/default-registry.ts:14-19) and selectable from pack YAML — extra keys under connection: are funnelled into ConnectorConfig.properties (packages/sync/src/mapping/mapping-parser.ts:174-181) and passed to the connector (packages/sync/src/scheduler/sync-scheduler.ts:175); the scheduler really polls (setTimeout + exponential backoff, sync-scheduler.ts:203-257) and applies through ObjectManager (packages/api/src/sync-boot.ts:94-98). 19/19 rest-connector tests pass. Remaining thirds still missing. (1) Managed auth is a misnomer: packages/api/src/sync-boot.ts:171 expands ${ENV} placeholders in connection.url ONLY — resolveEnvPlaceholders has exactly that one production call site — so a bearer token or OAuth clientSecret under connection.auth is either committed plaintext in the pack or sent verbatim as the literal string '${VAR}'; no rotation, no secret store, no per-source credential lifecycle. (2) No REST export/writeback: Connector.write is optional (packages/sync/src/connectors/connector.ts:155) and no connector implements it (no 'async write(' in packages/sync/src); sync.writeback is parsed (mapping-parser.ts:262) and read by nothing. (3) Code-based external transforms: registerCustomTransform (packages/sync/src/mapping/transforms.ts:24) has no production caller — only mapping.test.ts — so custom('fn') throws 'Custom transform function not registered' unless an operator writes and injects platform code. (4) The connector marks every row INSERT (rest-connector.ts:305-316), so source DELETEs never propagate. Webhooks — the working third — are wired in production (packages/api/src/server.ts:734-766) with ${VAR} URL expansion (side-effect-executor.ts:222-240) and parse-time url validation.

**Gap:** Managed auth is unmanaged: credentials are literal pack-YAML strings with no env expansion, no rotation, no secret lifecycle. No REST export/writeback path (Connector.write unimplemented; sync.writeback config read by nothing). Code-based transforms require platform code (registerCustomTransform has no production caller). Source deletes invisible.

### `misc-3/required-property-enforcement-non-null-valid` — Required property enforcement (non-null validation at data-load time and at action apply time)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Verified live with a node probe against the built packages (ActionExecutor + MemoryStorageProvider). The silent-write bug is fixed: an action whose createObject effect omits a required property now returns success:false with code EFFECT_EXECUTION_ERROR, message "Required property 'status' is missing on Note", and zero objects stored — packages/storage-memory/src/memory-storage-provider.ts:403-421 (_enforceObjectConstraints), called from _doCreateObject:487, _doUpdateObject:521 and hence the transaction path (Transaction.createObject:228). Still not full: (a) the error is EFFECT_EXECUTION_ERROR, not a structured VALIDATION_ERROR, and the action path never runs the engine validator — the executor calls txn.createObject directly (packages/actions/src/executor/action-executor.ts:1088); (b) providers still disagree on the error, because storage-postgres translates only 42P01/42703 (packages/storage-postgres/src/objects/object-crud.ts:206-213) and has no 23502 mapping, while the executor copies any string err.code straight into the ActionError (action-executor.ts:471-476) — so the same manifest yields EFFECT_EXECUTION_ERROR on memory and a raw SQLSTATE '23502' on Postgres; (c) neither maps to a validation HTTP status — rest/errors.ts:126-147 has no entry for either, so both fall to 'system', and the action route answers 200 anyway for non-precondition failures (route-generator.ts:1611-1632); (d) the @default hole is real and confirmed by the probe: packages/api/src/schema-loader.ts:803-806 never populates PropertyDefinition.defaultValue, so packages/storage-postgres/src/schema/ddl-objects.ts:96-98 emits NOT NULL with no DEFAULT, memory's guard trips on defaultValue===undefined (:418), and a field declared `String! @default(value: "DRAFT")` that an effect omits fails on both providers — while the engine validator deliberately SKIPS its required check for exactly those fields (packages/engine/src/objects/validation.ts:203-212). Data-load time is the good path: ObjectManager.create validates before storage and throws a structured validationError (packages/engine/src/objects/object-manager.ts:130-133), and sync/ingest go through it (packages/api/src/sync-boot.ts:94-98).

**Gap:** Action-apply enforcement is storage-level, not engine-level: no structured VALIDATION_ERROR, no validation HTTP status (200 with success:false), and different error codes per provider (EFFECT_EXECUTION_ERROR on memory vs raw '23502' on Postgres). @default is never materialized, so a required field with a declared default is rejected on both providers instead of defaulted.

### `misc-3/rich-property-type-system-struct-array-vecto` — Rich property type system (struct, array, vector/embedding, media reference, time series, attachment, geoshape, marking, cipher; title/primary-key rules)

**Status:** `partial`

**Evidence (read 15 Aug):** Supported types are scalar-only: String, Int, Float, Boolean, ID, DateTime, Date, Time, Duration, JSON, GeoPoint, plus TEXT-backed aliases NHSNumber/ODS/SNOMED/Email/Phone/URL/Markdown (packages/storage-postgres/src/schema/type-mapping.ts:5-35), with matching runtime checks in SCALAR_TYPE_CHECKS (packages/engine/src/objects/validation.ts:72-84). Arrays exist via FieldTypeRef.isList (packages/odl/src/parser/types.ts:154-163) and are validated element-wise for both enums and scalars (validation.ts:224-272). ABSENT, each searched across all *.ts/*.odl/*.yaml/*.json: struct (no directive or AST node), vector/embedding (only 'tsvector' in DDL comments at packages/storage-postgres/src/schema/type-mapping.ts:80 and an unrelated 'embeddings' comment at packages/api/src/graphql/resolver-generator.ts:1382), mediaReference (0), timeseries/TimeSeries (0), attachment (only Content-Disposition HTTP headers), geoshape/GeoShape (0), marking/Marking (0 as a type), cipher (0). Primary-key rules ARE enforced: validator Rule 1 requires exactly one @primary field of type ID! per ObjectType (packages/odl/src/validator/index.ts:215-250) and Rule 11 the same for LinkType (lines 255-276). No title/display-name concept: grepped packages/odl/src/validator/index.ts and the parser AST for title|displayName — nothing.

**Gap:** Eight of the nine named rich types do not exist (only array does). GeoPoint is the sole structured type and is validated merely as 'typeof value === object' (validation.ts:81), stored as opaque JSONB. No title/display property, so no type has a human-readable label rule. Any struct-shaped data must be smuggled through the untyped JSON scalar, which bypasses all type checking (JSON check is `(_v) => true`, validation.ts:82).

### `misc-3/transform-expression-library-schema-driven-f` — Transform expression library (schema-driven functions like Parse JSON as schema, usable across batch and streaming pipelines with error-mode outputs)

**Status:** `partial`

**Evidence (read 15 Aug):** A real, production-wired transform library exists: 14 built-ins dispatched by parseTransformExpression — concat, prefix, suffix, parseDate, parseDateTime, parseInt, parseFloat, toUpper, toLower, trim, ifPresent, coalesce, map, custom (packages/sync/src/mapping/transforms.ts:41-232) — plus registerCustomTransform for user-supplied functions (transforms.ts:24). It is consumed by RecordMapper (packages/sync/src/mapping/record-mapper.ts:2, 37) which sits on the live ingest path: the API ingest handler constructs one per request (packages/api/src/ingest-handler.ts:85) and the same parseMappingObject -> RecordMapper -> createEngineChangeApplier pipeline is wired at packages/api/src/server.ts:1236, reachable from both the scheduled poll loop and CDC. NOT schema-driven: there is no function that takes a target schema — grepped for 'Parse JSON as schema' and any schema parameter in transforms.ts: nothing; the only JSON handling is the untyped JSON scalar. NO error-mode outputs: every failure path throws (transforms.ts:176, 196, 234, 334, 438); grepped for errorMode|onError|permissive in transforms.ts: zero.

**Gap:** Two of the row's three qualifiers are missing. No schema-driven function exists, so parsing a JSON column into typed properties is impossible without writing a custom transform in TypeScript and registering it — i.e. platform code, which fails the grading bar. No error-mode output means a single bad value throws and, per the sync design, the record is logged, counted and skipped with the checkpoint advancing past it (documented as silent data loss in Orion/helm/altius/templates/prometheusrule.yaml) rather than being routed to an error output.

### `misc-3/batch-pipeline-build-orchestration-and-maint` — Batch pipeline build orchestration and maintenance (schedules with retries/targets/abort-on-failure, force/connecting builds, event-based triggers, validation-dataset gating, health checks)

**Status:** `absent`

**Evidence (read 15 Aug):** There is no build or dataset concept in the repo, so there is nothing to orchestrate. The only scheduler is SyncScheduler (packages/sync/src/scheduler/sync-scheduler.ts), which its own header describes as a per-datasource poll loop: checkpoint -> connector.incrementalExtract -> CdcConsumer.consume -> ChangeApplier -> checkpoint save, on a fixed interval, non-overlapping, bounded by maxRecordsPerTick/maxTickMs, with exponential backoff capped at 10x the interval (sync-scheduler.ts:249-250). It is data ingestion, not a build DAG. Searched all *.ts/*.yaml for buildSchedule, buildOrchestrat, 'force build', 'connecting build', 'abort on failure', 'validation dataset', 'schedule build': 0 hits each. No build targets, no build graph, no event-based build triggers.

**Gap:** The entire capability is missing because its substrate (datasets and builds) does not exist — the platform models objects and links, not derived datasets, so there is no transitive build to force or connect. Separately, even the ingest scheduler that exists is not production-durable: its checkpoint store is InMemoryCheckpointStore (packages/sync/src/scheduler/sync-scheduler.ts:~78), so a restart re-polls from the initial checkpoint.

### `misc-3/geospatial-map-workspace-object-selection-sh` — Geospatial map workspace (object selection, shape drawing/buffer/modify, spatial intersect search, geospatial actions, layer management)

**Status:** `absent`

**Evidence (read 15 Aug):** No map UI and no spatial query engine. No mapping dependency exists in any package.json (searched mapbox-gl, leaflet, deck.gl across all packages/*/package.json: zero). Searched all source for spatial (0 hits), geoshape/GeoShape (0), intersect (1 unrelated hit), PostGIS (0). The only geo primitive is the GeoPoint scalar, stored as opaque JSONB (packages/storage-postgres/src/schema/type-mapping.ts:22-25) and validated only as 'typeof value === object && v !== null' (packages/engine/src/objects/validation.ts:81). The SPI/GraphQL filter operator set is non-spatial by construction: eq, ne, in, contains, startsWith for strings and eq, ne, in, gt, gte, lt, lte for numerics (packages/odl/src/codegen/index.ts:43-46), and GeoPoint is excluded from ORDERABLE_TYPES (codegen/index.ts:49).

**Gap:** No geometry type beyond a point, no spatial index (the DDL index methods are btree/hash/gin/gist chosen by IndexType name only, packages/storage-postgres/src/schema/type-mapping.ts:69-84, with no geometry column to attach GiST to), no spatial predicates in the filter grammar, and no drawing/buffer/layer surface. A spatial intersect search is not expressible even via the raw API.

### `misc-3/governed-llm-gateway-openai-compatible-chat-` — Governed LLM gateway (OpenAI-compatible chat-completions proxy with model catalog RIDs, usage attribution, rate limiting, ZDR/geo governance)

**Status:** `absent`

**Evidence (read 15 Aug):** Nothing in the repo calls or proxies a model. Searched all *.ts/*.yaml/*.json for chat/completions, chatCompletions, llmGateway, modelCatalog, modelRid, ZDR, 'usage attribution': 0 hits each. No LLM SDK is a dependency (full cross-package dependency list contains no openai, @anthropic-ai, or equivalent). The three LLM-adjacent hits are all non-gateway: (1) doc comments naming Claude Code/Cursor as MCP *clients* of this server (packages/mcp-server/src/index.ts:5, packages/mcp-server/src/server.ts:7); (2) toAnthropicTools() and toOpenAiTools() (packages/actions/src/tools/tool-registry.ts:411, 430), which only reformat local tool *descriptors* into those vendors' JSON shapes and never issue a request; (3) an aspirational audit CONVENTION described in a comment block — 'when an agent invokes an LLM ... set operation.type = llm.call and record promptTokens/completionTokens' (packages/actions/src/tools/types.ts:81-93) — describing what some future caller should record. Grepped for any emitter of operation.type 'llm.call': none exists.

**Gap:** Every element is missing: no proxy endpoint, no model catalog or RIDs, no token accounting, no per-model rate limiting, no ZDR or geo routing policy. The rate limiters that do exist (packages/api/src/governance/rate-limiter.ts, redis-rate-limiter.ts) key on tenant/principal for HTTP traffic and have no model dimension.

### `misc-3/multi-ontology-governance-org-scoped-and-cro` — Multi-ontology governance (org-scoped and cross-org shared ontologies mapped 1:1 to spaces/markings)

**Status:** `absent`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Searched for `ontologyId|ontology_id|ontologyRid|OntologyEntity|spaceId|space_id` across packages/*/src — zero hits. Searched case-insensitively for `marking` across packages/ — one hit, an unrelated comment about a const-value field prefix at packages/api/src/cdm/mappers.ts:18. No classification/clearance/sensitivity symbols in packages/security/src or packages/spi/src; packages/security/src contains only audit/auth/authz/consent. Schema is still one process-global merged ParsedSchema built at boot from env vars (packages/api/src/schema-loader.ts:8-14 doc block, DOMAIN_PACKS_DIR/DOMAIN_PACKS), handed to createServer once. SchemaRegistry is version-scoped only — `getSchema(version?: number)` at packages/odl/src/registry/types.ts:50, SchemaVersion at :13-25 has no ontology/space identity. ODL does parse `@namespace(name, version)` (packages/odl/src/parser/index.ts:97-105, NamespaceMetadata at packages/odl/src/parser/types.ts:283-286), but nothing in api/engine/security/storage-postgres reads `schema.namespace`; the only `.namespace` reads are pack-manifest bookkeeping (packages/api/src/schema-loader.ts:549, packages/api/src/server.ts:276 and :1046). The work that landed (7ace314) is tenant->OpenFGA-store mapping: packages/api/src/config.ts:73-142 parses OPENFGA_STORE_IDS='tenant=storeId,...' and :165-169 resolves a client per tenantId. That scopes authorization tuples per tenant (rows), not types — no ontology entity, no space, no marking.

**Gap:** Everything: no first-class ontology/space entity, no per-request ontology resolution (schema is a boot-time singleton), no marking model, and nothing in the authz layer to attach one to.

### `misc-3/ontology-usage-metrics-and-change-impact-obs` — Ontology usage metrics and change-impact observability (per-type reads/writes/active users over 30 days, per-action and per-function usage with monitoring rules)

**Status:** `absent`

**Evidence (read 15 Aug):** The instruments for this exist and are DEAD. AltiusMetrics defines engineOperations, engineLatency, actionExecutions, actionDuration, securityChecks, securityCheckLatency, computedEvaluations (packages/observability/src/metrics.ts:35-52, created at 69-120), but grepping every *.ts outside packages/observability/src/metrics.ts for engineOperations|actionExecutions|getMetrics()|initMetrics returns hits ONLY in packages/observability/src/metrics.test.ts — including the single use of a per-type label, altiusMetrics.engineOperations.add(1, {'object.type':'Patient'}) at metrics.test.ts:104-105. No engine, action, or API code emits them. What actually reaches Prometheus is infrastructure-only: http_requests_total, http_request_duration_seconds, altius_storage_healthy, altius_pack_loaded, altius_sync_records_processed/failed/last_processed_timestamp/consecutive_failures (packages/api/src/metrics.ts:26-72). Monitoring rules exist but are not ontology-scoped — HighErrorRate (5xx ratio), HighLatency (p99), PodRestarting, StorageUnhealthy, SyncRecordsFailing, SyncStale (Orion/helm/altius/templates/prometheusrule.yaml:19-75). Searched all source for activeUser|active_user|usage_|usageMetric|last30|'30 day'|readCount|writeCount: zero hits.

**Gap:** Textbook generated-but-dead: the metric definitions exist, carry the right dimensions, and nothing increments them, so every gauge would read zero in production. No per-type read/write counts, no active-user tracking, no 30-day windowing, no per-action or per-function usage, and no ontology-scoped alerting rules. AuditQuery could answer per-type and per-action usage from audit records but is never instantiated in production and has no API endpoint (see evidence in row 16).

### `misc-3/process-mining-derive-process-models-from-hi` — Process mining (derive process models from historical state/log data with noise filtering, overlay against defined process)

**Status:** `absent`

**Evidence (read 15 Aug):** Nothing in the repo derives a process model. Searched all *.ts/*.yaml/*.json for processMining, process-mining, processModel, 'conformance check', 'noise filter', 'process discovery': 0 hits each. The plausible inputs exist and have no consumer: object history tables (packages/storage-postgres/src/schema/ddl-objects.ts:49), temporal queries (packages/storage-postgres/src/temporal/temporal-queries.ts), and audit records with actionType/objectType/timestamp dimensions (packages/security/src/audit/types.ts:11-52). The one component that could aggregate audit data into process statistics, AuditQuery (packages/security/src/audit/audit-query.ts:25), is exported (packages/security/src/index.ts:33) but never instantiated outside its own test — grepping all of packages for 'new AuditQuery' yields only packages/security/src/audit/audit.test.ts:46. Note: 'overlay' in this repo means OverlayEngine, a read-through cache for OVERLAY-mode datasources (packages/sync/src/overlay/overlay-engine.ts), not process overlay.

**Gap:** The entire capability. No event-log abstraction, no discovery algorithm, no noise filtering, no defined-process model to compare against, and no conformance-checking output. Even the raw aggregation layer over audit history is dead code with no API surface.

### `misc-3/time-aware-graph-exploration-and-versioned-s` — Time-aware graph exploration and versioned saved analyses (Vertex: timeline view/filter/playback, comparative time selection, graph save/share/duplicate with version history and revert)

**Status:** `absent`

**Evidence (read 15 Aug):** No exploration UI exists (no frontend package). Searched all source for timeline (0 hits), playback (0), 'saved analysis' (0), revert (0), duplicate-as-graph-operation (0). The 'vertex' hits are Apache AGE graph vertices in the Postgres storage layer, not the Palantir product — e.g. createAgeVertex at packages/storage-postgres/src/objects/object-crud.ts:163. Substrate that could feed this exists but is not the capability: per-object history tables with _history_created_at (packages/storage-postgres/src/schema/ddl-objects.ts:49), temporal queries (packages/storage-postgres/src/temporal/temporal-queries.ts), and graph traversal (packages/storage-postgres/src/links/traversal.ts). Saved analyses are absent: ObjectSetDefinition (packages/spi/src/object-set.ts:12-27) has no version, owner, share, or duplicate field — grepped that file for version|share|duplicate|owner|revert: zero hits.

**Gap:** No exploration surface at all, and no saved-analysis entity with lifecycle. ObjectSets are the only persistable selection and they are unversioned, unshared, and unduplicatable, so even the backend half of 'versioned saved analyses' does not exist. Temporal data is queryable per object but nothing composes it into a timeline or comparative time selection over a graph.

### `misc-3/visual-ontology-management-application-ontol` — Visual ontology management application (Ontology Manager: discover, edit types/properties/links/actions, function/action observability tabs)

**Status:** `absent`

**Evidence (read 15 Aug):** No frontend or UI layer exists anywhere in the repo. Grepped every packages/*/package.json for react|vue|svelte|next|@tanstack/react: zero matches; the complete dependency set across all packages is @apollo/server, @graphql-tools/schema, @grpc/*, @openfga/sdk, @opentelemetry/*, commander, cors, express, graphql, graphql-subscriptions, graphql-ws, helmet, ioredis, jose, kafkajs, pg, pino, prom-client, ws, yaml. Searched all source for 'ontology-manager' and 'OntologyManager': 0 files. Orion/docker-compose.yaml declares only backend services (postgresql, redpanda, openfga, keycloak, debezium, redis, otel-collector, cel-evaluator, api-gateway, ontology-engine, action-executor, sync-engine, security-service) — no web/UI service.

**Gap:** Everything. Schema authoring is file-based ODL compiled by CLI (packages/odl/src/cli/index.ts); there is no editing surface, no discovery browser, and no observability tabs. A user must write ODL text and redeploy.

### `misc-3/workshop-application-ux-platform-features-st` — Workshop application UX platform features (state saving/sharing, redact mode, performance profiler, translations/i18n incl. AIP auto-translate)

**Status:** `absent`

**Evidence (read 15 Aug):** No application/UI layer exists to carry these features — no frontend package, and no UI dependency in any packages/*/package.json (full dependency list is server-side only: express, @apollo/server, graphql, pg, ioredis, kafkajs, jose, prom-client, etc.). Searched all *.ts/*.yaml/*.json for workshop|Workshop (0 files), 'redact mode' (0), i18n (0), AIP (0), playback (0), profiler (0). The 'translation' hits are the CDM/FHIR terminology mapper (packages/api/src/cdm/terminology.ts), which maps clinical code systems, not UI strings. redactFieldsBatch (packages/mcp-server/src/tools.ts:304, from packages/security authz) is server-side field-level authorization redaction applied to query results — unrelated to a user-facing redact mode.

**Gap:** Everything. There is no app-building surface, therefore no app state to save or share, no redact toggle, no client profiler, and no i18n pipeline. ObjectSets (packages/spi/src/object-set.ts:12) are the closest saveable artifact and they carry no sharing, versioning, or presentation state.


## Workshop app building

### `workshop-ui/application-packaging-distribution-marketpla` — Application packaging & distribution (Marketplace products: packaging linter, install parameters, embedded-module customization points)

**Status:** `partial`

**Evidence (read 15 Aug):** A real, wired, tested packaging mechanism exists — for ontology content, not applications. PackManifest fields name/version/namespace/dependencies/schema/actions/connectors/permissions/seed/capabilities (packages/api/src/schema-loader.ts:34-52); loadDomainPacks discovers packs from a primary dir plus external dirs with conflict logging (schema-loader.ts:832-857); semver dependency constraints are actually validated across loaded packs (schema-loader.ts:497-520, satisfiesConstraint at 486); `capabilities:` gates whether the FHIR/CDM/MCP surfaces mount (schema-loader.ts:45-51, domain-packs/nhs-acute/pack.yaml:14-18). Four packs ship (domain-packs/core, nhs-acute, aml, supply-chain) plus an external-pack CI fixture (packages/api/src/__tests__/fixtures/external-pack/pack.yaml). Adversarial finding: the `provides:` block in domain-packs/nhs-acute/pack.yaml:19-27 (objectTypes/linkTypes/widgets/qualityRules counts) is absent from PackManifest — config read by nothing.

**Gap:** None of the three named sub-features exist: no packaging linter, no install parameters/prompts, no customization points. Distribution is filesystem-only — packs are discovered and loaded at boot, with no registry, no runtime install/uninstall, and no versioned upgrade path. And there are no applications to package.

### `workshop-ui/auto-generated-action-forms-governed-writeba` — Auto-generated action forms & governed writeback from apps (Actions in Workshop, button-triggered/inline actions, rule-editor style parameter forms)

**Status:** `partial`

**Evidence (read 15 Aug):** The writeback half is real and governed: ActionManifest with preconditions (CEL + error message), sequential effects in one transaction, sideEffects, rollback policy and undo config (packages/actions/src/parser/types.ts:122-139); executed via POST /api/v1/actions/{ActionName} (packages/api/src/rest/route-generator.ts:1260). Form metadata exists but is thin: actionInputSchema emits a JSON Schema of param name + type + required from the ODL @actionType fields (packages/api/src/rest/openapi.ts:82-93). Adversarial finding — enum params are lost: odlTypeToJsonSchema falls through to `{ type: 'string' }` for 'enum values, custom scalars' (packages/api/src/rest/openapi.ts:39), and the enum components generated at openapi.ts:396-399 are never $ref'd from any action or object property, so a generated form cannot render a dropdown for an enum parameter.

**Gap:** No form renderer, and the descriptor is too poor to drive a good one: no labels, descriptions, field ordering, prefill from a selected object, conditional visibility, or client-side constraints; enum options are erased. No dry-run/preview before submit. Preconditions are server-side only — validation feedback arrives as a rejected request, not as form state.

### `workshop-ui/events-interactivity-system-widget-events-la` — Events & interactivity system (widget events, layout events, set-variable events, on-load triggers, auto-refresh)

**Status:** `partial`

**Evidence (read 15 Aug):** The push substrate is real and production-wired. EventBus with a Redpanda implementation selected at boot, in-memory fallback otherwise (packages/api/src/server.ts:278-293, packages/api/src/events/redpanda-event-bus.ts), fed by EngineEventEmitter (server.ts:293). GraphQL subscriptions run over graphql-ws with per-connection authentication (packages/api/src/server.ts:782-854; SubscriptionManager at packages/api/src/subscriptions/subscription-manager.ts, CloudEvent→ChangeEvent mapping with CREATED/UPDATED/DELETED, previousValues, causedBy action attribution, and filter-based routing, lines 20-48). Lifecycle is handled (subscriptionManager.start()/stop() at server.ts:854,1282).

**Gap:** Only the transport exists. Every interactivity concept in the capability — widget events, layout events, set-variable events, on-load triggers, auto-refresh intervals — is client-side and there is no client. No declarative event/trigger model is persisted anywhere; subscriptions are a raw change feed a consumer must wire itself.

### `workshop-ui/interactive-ontology-change-management-save-` — Interactive ontology change management (save/review edits, error/warning linting, merge-conflict resolution, discard/restore)

**Status:** `partial`

**Evidence (read 15 Aug):** The classification core is real: ValidationIssue carries severity where 'errors prevent schema application, warnings are advisory' (packages/odl/src/validator/types.ts:8-26) across 30+ lint codes (packages/odl/src/validator/index.ts:131-613); diff+classify flags breaking modifications and additions (packages/odl/src/diff/index.ts:86-95,437-469); the registry rejects BREAKING applies without a MigrationPlan (packages/odl/src/registry/types.ts:28-44, registry/index.ts:28-32); boot records versions with SCHEMA_BREAKING_POLICY=block|warn (packages/api/src/schema-registry-boot.ts:8-49, packages/api/src/server.ts:236-242), backed by PostgresSchemaRegistry or in-memory (server.ts:236). Two adversarial demotions: (a) `odl apply` constructs a FRESH InMemorySchemaRegistry on every invocation (packages/odl/src/cli/index.ts:175) then applies to it — it never touches the Postgres registry, never persists, and always prints 'version 1'; (b) `odl rollback` restores nothing — it requires both schema files already on disk, ignores --from-version/--to-version except in the printed header, and only writes a reverse diff to stdout (packages/odl/src/cli/index.ts:258-320). No runtime edit path exists: no POST/PUT/PATCH schema route in packages/api/src/rest/route-generator.ts.

**Gap:** No interactivity. No runtime ontology-edit API, so no save/review of pending edits and no discard. No branching and no merge-conflict resolution (grep for branch/proposal/conflict across packages/odl/src and packages/api/src finds only optimistic-locking VERSION_CONFLICT). `odl apply` and `odl rollback` are reporting commands mislabelled as operations. The only real persistence path is boot-time recording from files on disk.

### `workshop-ui/object-set-filter-state-substrate-object-set` — Object set & filter-state substrate (object set variables, object set filter variables, saved/shareable sets)

**Status:** `partial`

**Evidence (read 15 Aug):** Genuinely real and the strongest row here. ObjectSetDefinition (filter, orderBy, limit, aggregation, isPublic, tenantId) at packages/spi/src/object-set.ts:11-27; ObjectSetManager with execute() and executeAggregate() (filter merged into the aggregation, packages/engine/src/object-sets/object-set-manager.ts:56-131). BOTH storage providers implemented with matching semantics: InMemoryObjectSetStore (packages/engine/src/object-sets/in-memory-object-set-store.ts) and PostgresObjectSetStore (packages/storage-postgres/src/object-sets/postgres-object-set-store.ts:42), selected at packages/api/src/server.ts:709-712. Sharing is enforced, not decorative: visibility is `isPublic OR createdBy == actor` (in-memory:131-133; postgres:232-233) and update/delete are owner-only (in-memory:81,113; postgres:221). Exposed as REST CRUD + /execute + /aggregate at /api/v1/object-sets (packages/api/src/rest/route-generator.ts:1362-1700) and GraphQL query/mutations (packages/api/src/graphql/resolver-generator.ts:1426-1539).

**Gap:** Saved-set persistence only. No filter-state runtime: no object-set *variables*, no client-side set algebra (ObjectSetManager exposes no union/intersect/subtract — only execute and executeAggregate), no incremental filter refinement, and no UI to drive any of it.

### `workshop-ui/read-only-dashboard-delivery-org-app-access-` — Read-only dashboard delivery (org/app-access scoping, kiosk mode, read-only enforcement)

**Status:** `partial`

**Evidence (read 15 Aug):** The enforcement half is real and fails closed. The generated OpenFGA model gives every object type `viewer` and `editor` relations — direct [user] assignment when the type has no outbound links, otherwise derived through a link relation (packages/odl/src/codegen/openfga.ts:190-199), plus can_* relations per ActionType (openfga.ts:13). Reads are authz-filtered before returning, short-circuiting to empty when nothing is authorized (packages/api/src/rest/route-generator.ts:328; packages/api/src/graphql/resolver-generator.ts:658). Identity feeds it via OIDC with claim→role mapping (packages/security/src/auth/role-mapping.ts:36-57) and every object carries _tenantId (packages/spi/src/ontology.ts:13,25).

**Gap:** There is nothing to deliver. No dashboard or app entity exists to scope access to, so 'app-access scoping' has no subject; no kiosk mode, no full-screen/auto-cycle presentation mode, no share-link. Read-only here is an object-graph permission, not a delivery mode.

### `workshop-ui/cross-application-interactivity-drag-and-dro` — Cross-application interactivity (drag-and-drop media types, App Pairing shared-state sync, commands between apps)

**Status:** `absent`

**Evidence (read 15 Aug):** There is no application entity to pair, and no inter-app protocol. Grep across packages/*/src finds no drag/drop, media-type, pairing, or cross-app command concept. The only 'media' hits repo-wide are HTTP Content-Disposition headers (packages/api/src/rest/route-generator.ts:516,528,1647). Media drag-and-drop is additionally blocked by the absence of any attachment/blob store (see row 2).

**Gap:** Everything: an app identity model, a shared-state sync channel between app instances, a typed command bus, and drag-payload media types. Meaningless until more than zero first-party frontends exist.

### `workshop-ui/design-system-theming-unified-component-desi` — Design system & theming (unified component design, saved module color palettes, light/dark mode, typography controls)

**Status:** `absent`

**Evidence (read 15 Aug):** Case-insensitive grep for theme|palette|dark mode across packages/*/src (excluding tests) returns zero hits. No CSS file exists anywhere in the repo (find for *.css across packages/, Orion/, factory/, tools/ returns nothing). No component library exists to theme.

**Gap:** Entirely greenfield and entirely frontend — there are no backend hooks needed or present. Only a per-module palette persistence field would ever touch the backend.

### `workshop-ui/interactive-graph-visualization-embedding-ve` — Interactive graph visualization & embedding (Vertex graph widget: layouts, layer styling, grouping, saved selections, time panels)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** The data half landed on all three surfaces. REST: POST /api/v1/{plural}/:id/traverse generated per ObjectType at packages/api/src/rest/traverse-route.ts:144-281, registered in packages/api/src/server.ts:1105-1112 (`...generateTraverseRoutes(deps)`), import at :64. It authorizes the start object (:173-187), then re-checks/redacts/consent-gates every returned node against its OWN type (:197-247) and drops edges whose endpoints are not both visible (:252-254). GraphQL: `traverse<Type>` resolver at packages/api/src/graphql/resolver-generator.ts:2063-2117 with SDL (LinkDirection, TraversalStepInput, TraversalNode) emitted at packages/odl/src/codegen/index.ts:848-880. MCP: `traverse_<Type>` tool built at packages/mcp-server/src/tools.ts:437-531, dispatched at :186. (GraphQL and MCP pieces are in the working tree, uncommitted per git status; the REST route is committed in 7ace314.) Both providers implement the primitive — packages/storage-memory/src/memory-storage-provider.ts:1095 and packages/storage-postgres/src/postgres-storage-provider.ts:510 -> packages/storage-postgres/src/links/traversal.ts — and they agree on limits and on refusing `maxDepth` with the same named error (memory-storage-provider.ts:1103-1110, traversal.ts:116-123), so no provider divergence. The visualization half does not exist: no .tsx file anywhere in the repo, no react/d3/cytoscape/sigma/vis-network dependency in any package.json, no frontend package (packages/ is odl, engine, spi, storage-*, api, actions, security, sync, mcp-server, observability, cel-evaluator, sdk-typescript). ObjectSetManager saves typed row sets (packages/api/src/rest/route-generator.ts:1755-1830), which is not graph selection state.

**Gap:** The entire renderer and embed: no layouts, no layer styling, no grouping, no saved graph selections, no time panels, no embeddable widget. A user gets an authorized multi-hop subgraph as JSON and must build every pixel themselves.

### `workshop-ui/low-code-application-builder-workshop-module` — Low-code application builder (Workshop module model: pages, sections, layouts, header, overlays, templates, example apps)

**Status:** `absent`

**Evidence (read 15 Aug):** No app/page/module/layout concept exists. Repo-wide `find` for *.tsx/*.html/*.css/vite.config/next.config across packages/, Orion/, factory/, tools/ returns zero results; no package named workshop/app/ui exists (packages/ = actions, api, cel-evaluator, engine, mcp-server, observability, odl, sdk-typescript, security, spi, storage-memory, storage-postgres, sync). Orion/ is compose+helm+keycloak+openfga only. Case-insensitive grep for 'workshop' across the repo hits nothing outside .claude worktrees. packages/api/src/server.ts serves only GraphQL/REST/FHIR/CDM/MCP JSON.

**Gap:** The entire authoring-and-rendering product: editor, page/section/overlay model, layout engine, template gallery, and persistence of app definitions. Nothing backend-side points at it — there is no ApplicationDefinition type anywhere in packages/spi/src.

### `workshop-ui/mobile-application-support-mobile-app-launch` — Mobile application support (mobile app launcher, mobile design mode, nav bar/QR/location widgets, browser-history navigation)

**Status:** `absent`

**Evidence (read 15 Aug):** Case-insensitive grep for 'mobile' across packages/*/src (excluding tests) returns zero hits. No client of any kind exists (row 1), so there is no design mode, launcher, nav bar, QR, or history navigation. No geospatial/location type exists in packages/spi/src/scalars.ts or ontology.ts.

**Gap:** Everything, and it is downstream of the missing web app layer — a mobile mode presupposes a responsive renderer and a module model, neither of which exist.

### `workshop-ui/modular-composition-reuse-embedded-modules-l` — Modular composition & reuse (embedded modules, loop layouts, module interface as app API, URL/deep-link initialization)

**Status:** `absent`

**Evidence (read 15 Aug):** Presupposes the module model from row 1, which does not exist. No module, embed, or loop-layout concept anywhere in packages/*/src; no route or type accepts app state from a URL (packages/api/src/rest/route-generator.ts exposes only object, link, action, object-set, and relationships paths). No ApplicationDefinition or ModuleInterface symbol exists in the repo.

**Gap:** Entire composition layer: embedded-module instancing, loop layouts, a declared module input/output interface, and URL-parameter initialization. Nothing backend-side is required first — this is downstream of building the app layer.

### `workshop-ui/reactive-variables-data-binding-system-typed` — Reactive variables & data-binding system (typed variables from static/function/aggregation/object-property/object-set sources, transformations, struct variables, lazy recompute, lineage graph)

**Status:** `absent`

**Evidence (read 15 Aug):** No variable system exists: grep -riE 'reactive|data-binding|VariableSource|struct variable' across packages/*/src returns zero non-test hits. The two nearest artifacts are not it and one is dead. (a) ComputedFieldEvaluator (packages/engine/src/computed/computed-field-evaluator.ts:1-12) is server-side per-object field recompute, LAZY-only by design, with a fixed six-function registry (countLinks, lookupField, sum/avg/min/maxLinks, lines 41-48) — it is wired (packages/api/src/server.ts:333,344) but recomputes object fields, not user-defined variables, and takes no transformations. (b) LineageRecorder (packages/engine/src/lineage/lineage-recorder.ts:125) records field-level write provenance, not a variable dependency graph, and is DEAD in production: `new LineageRecorder` appears only at packages/engine/src/__tests__/computed-and-lineage.test.ts:144, and the production ObjectManager config at packages/api/src/server.ts:339-345 omits `lineageRecorder` entirely. Data sources a variable system would bind to do exist (aggregate routes at route-generator.ts:1018-1028, object-set execute, GraphQL function resolver at resolver-generator.ts:1331-1341).

**Gap:** The whole binding layer: no typed variable declaration, no source adapters, no transformation chain, no struct variables, no dependency/lineage graph, no recompute scheduler. The provenance code that superficially resembles a lineage graph is unwired dead code.

### `workshop-ui/typed-sdk-for-custom-react-application-build` — Typed SDK for custom (React) application building (OSDK + dnd-osdk-react)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Re-verified against commit 0b263e6 (working tree clean). Blocker B1 is resolved — the SDK is now functional end to end. (1) The published package is populated: packages/sdk-typescript/src/index.ts is 1349 lines with per-type accessors (get/list/onChange), per-action methods, enums, filter types, and security-aware types (@sensitive fields typed as `T | Redacted`). (2) The generator is wired into the CLI: `odl generate sdk <paths...>` at packages/odl/src/cli/index.ts:257 accepts multiple schema directories, merges them, and writes the generated source. (3) Runtime transport is implemented: query/mutate use `fetch` (sdk.ts:411, 433), subscribe uses `WebSocket` (sdk.ts:448-511) — no more "Not implemented" throws (grep confirms zero hits). (4) Prebuild/pretypecheck/pretest scripts generate from all four domain packs (core, nhs-acute, aml, supply-chain), so the SDK matches the server's multi-pack schema. (5) Test surface exists: packages/sdk-typescript/__tests__/sdk-runtime.test.ts (318 lines, 9 tests) covers construction, query, list, mutation, error handling, and subscriptions with mocked fetch/WebSocket. All 9 tests pass. STILL ABSENT: No React bindings — zero .tsx files, no react dependency in any package.json, no dnd-osdk-react equivalent. The SDK is a typed HTTP/WebSocket client, not a React component library.

**Gap:** No React bindings (zero .tsx files, no react dependency). The SDK is a functional typed client with real transport, CLI generation, and tests — a custom app author can use it to call the API, but there are no React components or hooks.

### `workshop-ui/widget-library-60-widgets-object-tables-list` — Widget library (~60 widgets: object tables/lists/views, charts, maps, Gantt, pivot, filters, inputs, buttons, media, comments, AIP chat) plus per-widget display optimization

**Status:** `absent`

**Evidence (read 15 Aug):** No rendering layer of any kind (see row 1: zero .tsx/.html/.css). Backing stores for whole widget families are also missing: grep for attachment|blob|upload|multipart|media across packages/api/src, packages/spi/src, packages/engine/src returns only HTTP `Content-Disposition: attachment` export headers (packages/api/src/rest/route-generator.ts:516,528,1647; packages/api/src/cdm/router.ts:344,356) — no object storage, so no media/image/PDF widgets are even possible. No comment entity exists in packages/spi/src/ontology.ts. domain-packs/nhs-acute/pack.yaml:26 declares `widgets: 0` under a `provides:` block that is not a field of PackManifest (packages/api/src/schema-loader.ts:34-52) — that counter is read by nothing.

**Gap:** Every widget. Read-side widget classes (table, filter, chart) could in principle be built on the generated REST/GraphQL surface, but media, comments, and AIP-chat widgets have no backend at all: no blob storage, no comment model, no LLM binding.


## Mixed II

### `misc-2/environment-portable-configuration-for-packa` — Environment-portable configuration for packaged logic (custom aliases: named config values decoupled from code, installer-configurable via Marketplace)

**Status:** `partial`

**Evidence (read 15 Aug):** Two working ${ENV_VAR} substitution points, both in production wiring. (1) Connector connection strings: resolveEnvPlaceholders (packages/api/src/sync-boot.ts:27-42) applied at sync-boot.ts:152; used by domain-packs/aml/connectors/tms-jdbc.yaml (`url: "${TMS_DB_URL}"`). (2) Action webhook URLs: expandUrl (packages/actions/src/sideeffects/side-effect-executor.ts:231-243) called at :151, with env injected from process.env at packages/api/src/server.ts:689-693; used by domain-packs/aml/actions/freeze-account.yaml (`url: "${COREBANKING_WEBHOOK_URL}"`). Both throw loudly on an unset variable. DEMOTING FACTS: PackManifest has no config/alias section — its fields are name, version, namespace, description, dependencies, schema, actions, connectors, permissions, seed, capabilities (packages/api/src/schema-loader.ts:34-52). No named-alias registry, no per-install config surface, no marketplace/installer (grep for marketplace/installer: zero hits). And the sibling template mechanism is inert: SideEffectExecutor.resolveBody returns the body unchanged (packages/actions/src/sideeffects/side-effect-executor.ts:217-219), so webhook body values like "account.accountNumber" are POSTed as literal strings.

**Gap:** Only two hardcoded string fields (connector URL, webhook URL) are environment-parameterizable, and only via raw process env names. No first-class named alias, no typed/defaulted config values, no install-time configuration prompt, no marketplace.

### `misc-2/ontology-metadata-catalog-with-search-search` — Ontology metadata catalog with search (searchable index of object/link/action types, shared properties, interfaces, functions; visibility/status/indexing-issue filters)

**Status:** `partial`

**Evidence (read 15 Aug):** One static machine-readable catalog is served publicly: GET /api/v1/openapi.json (packages/api/src/server.ts:1083-1085) generated from the parsed schema — but it covers only objectTypes and actionTypes (packages/api/src/rest/openapi.ts:380-383), omitting linkTypes, functionTypes and interfaces. DEMOTING FACTS: GET /admin/packs (packages/api/src/server.ts:953-976) returns per-pack COUNTS only (objectTypes/linkTypes/actionTypes/functionTypes as integers), never type names, and is gated pod-internal by podDirectOnly. GraphQL introspection — the only surface that enumerates links/interfaces/functions — is disabled outside dev: `introspection: isDev` (packages/api/src/graphql/server.ts:64). There is no catalog search endpoint (no /metadata, /types or /catalog route in the route-generator pattern list) and no visibility/status/indexing-issue metadata exists in the schema model at all (full directive set at packages/odl/src/parser/types.ts:23-88).

**Gap:** No search over metadata, no filters of any kind, no shared-property or interface catalog, no link/function types in the production catalog. In prod the only usable surface is a static OpenAPI document covering objects and actions.

### `misc-2/published-query-execution-api-post-api-v2-on` — Published query execution API (POST /api/v2/ontologies/{o}/queries/{q}/execute with parameters, version pinning, branches, ontology transactions, scenario context, rich value-type wire format)

**Status:** `partial`

**Evidence (read 15 Aug):** Two partial equivalents exist and work. (1) Named-parameter execution of a published function via GraphQL: `<name>Function(input: <Name>FunctionInput!)` generated at packages/odl/src/codegen/index.ts:803-805 and executed at packages/api/src/graphql/resolver-generator.ts:1341 with required-param validation at packages/engine/src/functions/function-executor.ts:236-243. (2) Saved-query execution over REST: GET /api/v1/object-sets/:id/execute (packages/api/src/rest/route-generator.ts:1503-1505). DEMOTING FACTS: no POST .../queries/{q}/execute route exists — the full REST pattern list (route-generator.ts:308,469,575,681,767,849,923,1028,1119,1260,1365-1674) contains no query/function endpoint. Object sets take NO parameters — ObjectSetDefinition is id/name/description/objectType/filter/orderBy/limit/aggregation/createdBy/createdAt/updatedAt/isPublic/tenantId (packages/spi/src/object-set.ts:12-26). No version pinning, no branches, no scenario context: grep for branch/scenario across packages/spi/src, packages/engine/src, packages/api/src returns only unrelated prose in test comments. packages/spi/src/transaction.ts:11-20 is a DB-level ACID handle (createObject/…/commit/rollback), not a referenceable ontology transaction. No rich value-type wire format — GeoPoint/Duration/URI have no GraphQL scalar resolvers (none in packages/api/src/graphql/).

**Gap:** No REST query-execute endpoint; parameters only on the GraphQL function path, never on saved object sets; no version pinning, branches, ontology transactions or scenario context anywhere in the codebase; no typed value-type envelope.

### `misc-2/runtime-derived-properties-linked-property-p` — Runtime derived properties (linked property passthrough, linked aggregations across links, column math between properties)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** 6e8b4ba closed the list/search hole. ObjectManager.query and .search now merge LAZY computed fields via withComputed (packages/engine/src/objects/object-manager.ts:349, :387, implementation :415-433, bounded waves). REST list/search and GraphQL list/search route through ObjectManager (packages/api/src/rest/route-generator.ts:579,597,1491,1506; packages/api/src/graphql/resolver-generator.ts:816,836,1311,1326), and objectToRest/objectToGraphQL copy every declared field including @computed ones (route-generator.ts:72-83; resolver-generator.ts:219-230). NDJSON export inherits it via collectRawRecords -> deps.objectManager.query (packages/api/src/cdm/router.ts:261-266), as does object-set materialization (route-generator.ts:2007,2024). Still no column math: the built-in registry is countLinks/lookupField/sumLinks/avgLinks/minLinks/maxLinks (packages/engine/src/computed/computed-field-evaluator.ts:42-49), all of which traverse links; the @computed directive carries only `fn`/`args`/`cache`/`ttl` (packages/odl/src/parser/types.ts:53-59) with no expression form, and the FunctionType escape hatch passes only `{args..., this:{_type,_id}}` — never the object's property values (computed-field-evaluator.ts:273-284). Still no EAGER/TTL: getComputedFields filters to `!computed.cache || computed.cache === 'LAZY'` (computed-field-evaluator.ts:308-315), so `cache: EAGER` or a `ttl` is parsed, stored on the directive, and then silently makes the field never evaluate and never appear — config read by nothing. Surface asymmetry remains: MCP search_<Type> calls deps.storage.queryObjects directly (packages/mcp-server/src/tools.ts:331), bypassing ObjectManager, so agents see no computed fields; the traverse route/resolver/MCP tool go through linkManager.traverse -> storage.traverse, so traversal nodes carry none; and CSV export explicitly excludes computed columns (route-generator.ts:692, `!f.directives.some(d => d.kind === 'computed')`).

**Gap:** No cross-property column math (every built-in is a link traversal; @computed has no expression form and the function bridge never receives property values). EAGER/TTL parsed but unimplemented — declaring them silently deletes the field from every response. Computed values cannot be filtered or sorted on, since they are merged after the storage query. MCP search, all traversal responses, and CSV export still omit them.

### `misc-2/user-authored-serverless-functions-typescrip` — User-authored serverless functions (TypeScript v2/Python code repositories, ontology edits from functions, unit testing, publish/deploy)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Four of the prior six gaps closed. Per-function authz: packages/api/src/functions/invoke-function.ts:370-385 requires role membership and denies when requiredRoles is empty; roles parsed from @function at packages/odl/src/parser/index.ts:187-192. Every invocation is audited success/denied/error (invoke-function.ts:49-70, 377, 393, 396). Sandbox: IsolatedNodeFunctionRuntime forks with `env: {}`, --max-old-space-size and a wall-clock SIGKILL (packages/engine/src/functions/isolated-node-runtime.ts:70-78), and is registered under the name 'node' so packs get it without opting in (packages/api/src/server.ts:346-357). REST: POST /api/v1/functions/{Name} at packages/api/src/rest/route-generator.ts:1721-1733, registered at :411, sharing invokeFunction with GraphQL. Ontology access: getObject/getLinkedObjects/queryObjects/applyAction at invoke-function.ts:152-336, each re-running ReBAC check + field redaction + consent as the caller, with filter-field leakage blocked (:233-240) and writes forced through ActionExecutor (:284-334); bridged over IPC (isolated-node-runtime.ts:141-161, packages/engine/function-worker.js:74). Remaining: no Python — runtimes are node / node-isolated / cel only (packages/engine/src/functions/function-executor.ts:124-228; server.ts:352-356). Isolation is explicitly not a security boundary — 'the child can still open sockets and read files the OS lets it read' (isolated-node-runtime.ts:15-18). No repository/test/publish-deploy lifecycle: the ODL CLI offers validate/diff/apply/generate graphql/generate openfga/rollback only (packages/odl/src/cli/index.ts:56,94,154,204,208,232,258); deployment is still redeploying the pack. No MCP surface — tools.ts builds action, search and traverse tools only (packages/mcp-server/src/tools.ts:54,205,259,482), so an agent cannot invoke a FunctionType. Authz is coarse role membership, not per-object ReBAC. And `grep -rn '@function' domain-packs/` returns nothing: no shipped pack declares a FunctionType, so the whole path is exercised only by tests.

**Gap:** No Python runtime. Process isolation is not a security sandbox (child keeps network and filesystem access). No code repository, no unit-test harness, no publish/deploy lifecycle — shipping a function means redeploying the pack. FunctionTypes are absent from MCP. Authorization is role membership only.

### `misc-2/ai-fde-agentic-platform-assistant-mode-scope` — AI FDE agentic platform assistant (mode-scoped agent that performs platform work: data integration, ontology editing, functions, governance audit, ML, OSDK React; capabilities incl. plan generation, clarification, executing actions)

**Status:** `absent`

**Evidence (read 15 Aug):** No LLM client and no agent exist. Root package.json declares only turbo + typescript as devDependencies; no anthropic/openai/langchain dependency in any package. Grep across packages/*/src for anthropic|openai|llm|completion|embedding returns only two format-exporters — ToolRegistry.toAnthropicTools (packages/actions/src/tools/tool-registry.ts:404-411) and toOpenAiTools (:424-430) — plus an audit *convention* comment for a hypothetical `llm.call` operation with no producer (packages/actions/src/tools/types.ts:81-93). Grep for `class .*Agent` or 'agentic' across packages/*/src: zero hits. The MCP server exposes one tool per ActionType and one search_<Type> per ObjectType (packages/mcp-server/src/tools.ts:45-59) — an interface FOR an external agent, not an agent.

**Gap:** Everything: no model client, no planner, no clarification loop, no modes, no self-directed platform work. Altius provides tool surfaces (MCP, Anthropic/OpenAI tool-schema exporters) that a third-party agent could drive.

### `misc-2/datasource-vs-user-edit-conflict-resolution-` — Datasource-vs-user-edit conflict resolution (user-edits-win vs latest-value-wins strategies when synced source rows and action edits touch the same object/properties)

**Status:** `absent`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** The provenance producer landed but the consumer was never rewired. Producer: packages/api/src/server.ts:383-384 constructs `new LineageRecorder({ store: new PostgresLineageStore(storage.pool) })` — but only `storage instanceof PostgresStorageProvider`, so storage-memory deployments still have no provenance at all. ObjectManager writes it on create (packages/engine/src/objects/object-manager.ts:139-149) and on update (:249-256). Consumer unchanged: packages/api/src/sync-boot.ts:161-168 still does `if (config.sync.conflictResolution) { logger.error(...); continue; }` — any datasource that declares a strategy is refused and never scheduled. Its justification comment at :157-159 ('LineageRecorder is never constructed') is now factually stale, but the `continue` is unconditional and live. So configuring the feature turns sync OFF; not configuring it leaves sync writing straight through objectManager.update under a `sync:<source>` actor with no resolution (sync-boot.ts:8-14, 93-94). ConflictResolver remains dead code: exported at packages/sync/src/index.ts:125, and `new ConflictResolver(` appears only in packages/sync/src/conflict/conflict-resolver.test.ts:58 — in_degree 0 in production. No conflict handling in the CDC consumer or scheduler either (grep for 'conflict' in packages/sync/src/cdc/*.ts and packages/sync/src/scheduler/*.ts, excluding tests: zero hits). Vocabularies also do not line up: the manifest parser accepts only 'SOURCE_PRIORITY'|'ACTION_PRIORITY' as a single top-level string (packages/sync/src/mapping/mapping-parser.ts:17, :28), while ConflictResolver wants defaultStrategy + per-field rules and additionally implements LAST_WRITE_WINS (packages/sync/src/conflict/conflict-resolver.ts:14, :27-33) — so 'latest-value-wins' is not declarable at all, and no adapter exists between the two shapes.

**Gap:** sync-boot still refuses any datasource declaring conflictResolution, so no configuration reaches the resolver; ConflictResolver is called by nothing outside its own test; provenance exists on Postgres only, so behaviour would diverge between the two providers even once wired; and the manifest schema cannot express either per-field rules or latest-value-wins.

### `misc-2/interactive-geospatial-map-application-layer` — Interactive geospatial Map application (layers/base layers, find/geocode, histogram property faceting+filtering, selection, time selection, draw/measure/annotate shapes, search-around, capture, saved maps)

**Status:** `absent`

**Evidence (read 15 Aug):** No frontend package exists — packages/ contains only actions, api, cel-evaluator, engine, mcp-server, observability, odl, sdk-typescript, security, spi, storage-memory, storage-postgres, sync. Grepped repo-wide for geocode/basemap/mapbox/leaflet/geohash/histogram-facet/searchAround: zero hits outside docs/audit/foundry-parity-audit.html. Geo support at the data layer is nominal only: GeoPoint is a declared custom scalar (packages/odl/src/validator/index.ts:23, packages/odl/src/codegen/index.ts:29,37) with NO GraphQL scalar resolver anywhere in packages/api/src/graphql (grep for GraphQLScalarType returns nothing), stored as opaque JSONB (packages/storage-postgres/src/schema/type-mapping.ts:25). FilterExpression operators are exactly eq/neq/gt/gte/lt/lte/in/contains/startsWith/exists (packages/spi/src/ontology.ts:45-59) — no geo predicate. No PostGIS in any DDL file (packages/storage-postgres/src/schema/) or in Orion/docker-compose*.yaml.

**Gap:** Everything. No map UI, no geo query operators, no spatial index, no geocoding, no shape/annotation storage, no saved maps. GeoPoint is an unvalidated pass-through blob.

### `misc-2/kiosk-mode-long-lived-read-only-permission-s` — Kiosk mode (long-lived, read-only, permission-scoped display sessions with admin allowlisting and session launch history)

**Status:** `absent`

**Evidence (read 15 Aug):** Grepped repo-wide for 'kiosk': zero hits outside docs/audit/foundry-parity-audit.html. No session concept at all — packages/security/src/auth/ holds only oidc-authenticator.ts, role-mapping.ts, types.ts; grep for scope/session/read_only in packages/security/src/auth/*.ts matches only unrelated `readonly` TS modifiers at packages/security/src/auth/types.ts:57-58. Auth is per-request OIDC bearer validation; there are no service accounts, no long-lived tokens, no scope model, no allowlist, and no launch-history store (no such table in packages/storage-postgres/src/schema/).

**Gap:** Everything: no display-session lifecycle, no read-only principal type, no admin allowlist, no launch history.

### `misc-2/mobile-application-delivery-workshop-mobile-` — Mobile application delivery (Workshop mobile modules, mobile-optimized widgets, dedicated mobile app launcher, MDM/VPN/network-access and SSO guidance)

**Status:** `absent`

**Evidence (read 15 Aug):** No client of any kind ships. Grepped packages/*/src and Orion for react / react-native / expo / next.js / mdm: only hits are 'vitest' imports in test files. packages/sdk-typescript is a codegen'd typed API client (packages/odl/src/codegen/sdk.ts), not an application. SSO exists generically — OIDC bearer validation at packages/security/src/auth/oidc-authenticator.ts, Keycloak in Orion/keycloak — but packages/security/src/auth contains only oidc-authenticator.ts, role-mapping.ts and types.ts: no device/MDM/network-access concept.

**Gap:** Everything mobile-specific. Altius is headless; the OIDC/GraphQL/REST surface is transport-agnostic but no mobile module system, widget set, launcher, or MDM/VPN guidance exists.

### `misc-2/model-integration-and-productionization-impo` — Model integration and productionization (import models from in-platform training, uploaded files, containers, or external hosts; model adapters; Modeling Objectives lifecycle)

**Status:** `absent`

**Evidence (read 15 Aug):** Grepped packages/*/src and Orion for onnx, sagemaker, mlflow, torch, training, inference, predict: the only matches are unrelated prose — 'inference attacks' in packages/api/src/fhir/router.ts:189 and 'unpredictable IDs' in packages/engine/src/links/uuidv7.ts:35. Grep for 'model adapter' and 'modeling objective': zero hits. No model registry table in packages/storage-postgres/src/schema/, no model type in the ODL type system (packages/odl/src/parser/types.ts declares objectType, linkType, actionType, functionType, enum, interface, scalar only), no container/artifact upload path (no multipart or blob handling anywhere — grep for upload/blob/s3/minio/multipart yields only Content-Disposition export headers).

**Gap:** Everything: no model artifact storage, no adapter interface, no import paths, no Modeling Objectives lifecycle, no inference endpoint.

### `misc-2/no-code-business-rules-engine-foundry-rules-` — No-code business rules engine (Foundry Rules: window/aggregation/join/expression/select/union logic boards, time series boards, Contour import, deployable rule pipelines)

**Status:** `absent`

**Evidence (read 15 Aug):** Grepped repo-wide for 'rules engine' / ruleset / 'logic board': zero hits. The nearest constructs are hand-authored CEL expressions inside YAML action manifests (preconditions in domain-packs/aml/actions/freeze-account.yaml) and the @constraint field/type directive (packages/odl/src/parser/types.ts:62,140) — both are code-managed text in pack files, not a visual board, and neither composes windows/joins/unions. No pipeline concept: the only scheduled machinery is SyncScheduler for connector polling (packages/sync/src/scheduler/sync-scheduler.ts), and no time-series property type exists (scalar list at packages/odl/src/validator/index.ts:23).

**Gap:** Everything: no board authoring surface, no window/join/union/select operators, no time series boards, no Contour import, no deployable rule pipeline artifact.

### `misc-2/prebuilt-enterprise-source-connector-catalog` — Prebuilt enterprise source-connector catalog (Palantir-provided drivers, e.g. Microsoft Dynamics 365 Business Central: OAuth/AzureAD auth schemes, managed egress policies, agent proxy for on-prem)

**Status:** `absent`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** The catalog is still three generic protocol drivers, not vendor drivers: packages/sync/src/connectors/default-registry.ts:14-20 registers jdbcPlugin, restPlugin, kafkaCdcPlugin and nothing else. `4bed9d3` made the REST driver real (packages/sync/src/connectors/rest-connector.ts:104-397 — offset/page/cursor pagination, incremental extract, discoverSchema) and added an auth model (rest-connector.ts:48-52: RestAuth = none|bearer|basic|oauth2 client-credentials), so two clauses of the prior gap are dead: the REST connector no longer returns nothing, and connector config is no longer authentication-free. Neither clause was the capability. Searched packages/, domain-packs/, Orion/ for dynamics|salesforce|workday|snowflake|azure|sap|egress|on-prem|agent.?proxy: zero connector hits — the only match is Orion/helm/altius/templates/network-policy.yaml:17,31, a Kubernetes NetworkPolicy, not a managed connector egress policy. AzureAD/OAuth-AzureAD as a named scheme does not exist; oauth2 here is bare RFC-6749 client-credentials (rest-connector.ts:52). All three shipped pack connectors are jdbc (domain-packs/aml/connectors/tms-jdbc.yaml, domain-packs/nhs-acute/connectors/pas-jdbc.yaml, domain-packs/supply-chain/connectors/erp-jdbc.yaml). Config does reach the driver — mapping-parser.ts:179 folds extra `connection` keys into `properties`, sync-scheduler.ts:173-175 forwards them, connector-registry.ts:93-101 instantiates via plugin.factory — but packages/api/src/sync-boot.ts:171 resolves ${ENV} placeholders only on config.connection.url, so an OAuth clientSecret or bearer token declared under connection.properties.auth reaches the connector as a literal. A user configuring an authenticated enterprise source today must commit the secret to the pack YAML.

**Gap:** No vendor-specific driver of any kind (Dynamics 365 BC or otherwise); no AzureAD auth scheme; no managed egress policy; no on-prem agent proxy; and connector secrets have no env-indirection path (sync-boot.ts:171 covers only connection.url), so credentialed sources cannot be configured without committing plaintext secrets.

### `misc-2/value-and-conditional-formatting-metadata-di` — Value and conditional formatting metadata (display-friendly rendering rules for values, numbers, sparklines)

**Status:** `absent`

**Evidence (read 15 Aug):** The complete ODL field-directive set is primary, unique, indexed, readonly, sensitive, param, link, computed, constraint, default, deprecated, terminology, searchable, immutable (packages/odl/src/parser/types.ts:23-88, dispatched at packages/odl/src/parser/index.ts:299-352). Type-level directives are objectType, linkType, actionType, function, deprecated, constraint (packages/odl/src/parser/types.ts:109-148); ObjectTypeDirective carries no fields at all (:109-111) — no titleProperty, no displayName. Grepped repo-wide for sparkline / renderHint / displayHint / valueFormat / numberFormat / 'conditional format': zero hits.

**Gap:** Everything. No display or formatting metadata anywhere in the schema language, storage, or API. @terminology maps code systems, not rendering.

### `misc-2/vertex-digital-twin-visualization-and-simula` — Vertex digital-twin visualization and simulation (object-backed process/system diagrams, what-if simulation over connected models, media layers and image annotations on maps/images)

**Status:** `absent`

**Evidence (read 15 Aug):** Grepped repo-wide for 'digital twin', simulation, what-if: zero code hits — the only 'digital twin' occurrence is the marketing description in package.json:5. All 'vertex' matches are Apache AGE graph vertices in the storage layer (packages/storage-postgres/src/objects/object-crud.ts:7,121,162-163). No media/binary storage exists: grep for attachment/blob/upload/s3/minio/multipart across packages/*/src matches only Content-Disposition headers on CSV/NDJSON exports (packages/api/src/rest/route-generator.ts:516,528,1647; packages/api/src/cdm/router.ts:344,356). No image, annotation, diagram or scenario-branch concept anywhere (no branch/scenario symbols in packages/spi/src, packages/engine/src, packages/api/src).

**Gap:** Everything: no diagram model, no simulation/what-if engine, no scenario branching, no media/blob storage, no image annotation layer. Altius stores objects and links only.


## Mixed I

### `misc-1/live-data-push-auto-refresh` — Live data push / auto-refresh

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** The two landed commits hardened the existing push path; neither widened it. Surface is unchanged: packages/odl/src/codegen/index.ts:1006-1010 emits exactly two subscription fields per object type — `fooChanged(id: ID!)` and `foosChanged(filter: JSON)` — and packages/api/src/graphql/resolver-generator.ts:1473-1486 registers exactly those two. Aggregates are still request/response only (resolver-generator.ts:1112+, packages/api/src/rest/route-generator.ts) and object-set results have no subscription at all, so the derived results dashboards need still have no push or refresh contract. `c34a3cd` added tenant isolation (subscription-manager.ts:312 and :373 drop events whose event.tenantId != subscriber tenant, before the FGA check, because one topic per object type is shared across tenants). `a065ac1` made the filter fail closed — and that is a new narrowing, not a widening: subscription-manager.ts:399-412 matches only `changeType` and keys present on event.object, which carries just {id,_type} (subscription-manager.ts:75-84), so any filter naming a real object property (`foosChanged(filter:{status:"DISCHARGED"})`) matches nothing and delivers zero events. Transport is still graphql-ws only (server.ts WebSocketServer, path '/graphql'); grep of packages/api/src for text/event-stream|EventSource|server-sent returned nothing. The only webhook in the API is INBOUND ingest (packages/api/src/ingest-handler.ts:2-7, mounted server.ts:1324-1352), not outbound push.

**Gap:** Push still covers object/link row changes only. No subscription or refresh path for aggregates or object-set results; property-level subscription filters are now silently empty by design (subscription-manager.ts:408-410) so the filter arg is usable only for changeType/id/_type; graphql-ws remains the sole transport (no SSE, no outbound webhook, no polling/ETag refresh contract).

### `misc-1/ontology-lifecycle-governance-cleanup-queue-` — Ontology lifecycle governance (cleanup queue, deprecation, usage-flag-driven safe deletion)

**Status:** `partial`

**Evidence (read 15 Aug):** A real deletion guardrail exists: any removal in a schema diff classifies the change BREAKING (packages/odl/src/diff/index.ts:81-83), and the production Postgres registry refuses to apply a BREAKING version without a migration plan and refuses again if that plan is not approved (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:97-115), with the classification persisted per version (:121-123). A reverse-diff rollback command exists (packages/odl/src/cli/index.ts:258). Deprecation, however, is dead: the @deprecated directive is parsed into DeprecatedDirective for both fields and types (packages/odl/src/parser/types.ts:71-72,103,149; packages/odl/src/parser/index.ts:336-341,388-393) but has zero consumers — grep for DeprecatedDirective/'deprecated' outside packages/odl/src/parser finds only the re-export in packages/odl/src/index.ts:77 and one parser test; packages/odl/src/codegen/*.ts never emits a GraphQL @deprecated, and packages/api, packages/engine, packages/storage-postgres never read it.

**Gap:** No cleanup queue, no usage tracking or usage flags to drive safe deletion (deletion is gated by a human-approved migration plan, not by evidence of non-use), and @deprecated is parse-only with no runtime, codegen, or API effect.

### `misc-1/operational-no-code-rules-engine-foundry-rul` — Operational no-code rules engine (Foundry Rules: business-user-authored rules executed as pipelines with proposal review)

**Status:** `partial`

**Evidence (read 15 Aug):** Declarative rules authored outside platform code do execute. @constraint CEL expressions are evaluated during writes — evaluateConstraints runs in the validation pipeline for field- and type-level constraints (packages/engine/src/objects/validation.ts:137-151,288) with the CEL evaluator injected into ObjectManager (packages/engine/src/objects/object-manager.ts:52,77,361). Action manifests are business-readable YAML with CEL preconditions, effects, side effects and rollback policy, shipped per pack (domain-packs/aml/actions/assign-alert-to-case.yaml; parser at packages/actions/src/parser/index.ts). Evaluation is the canonical Go CEL sidecar over gRPC (packages/actions/src/cel/client.ts:1-9; wired at packages/api/src/server.ts:302-306).

**Gap:** No rules engine as such: rules are only evaluated inline on a user-triggered write, never as a scheduled or event-triggered pipeline over a dataset, and there is no proposal/review queue — effects commit directly. Grep for rule/trigger/automation finds no rule registry or trigger dispatcher. Authoring is YAML-in-a-pack requiring redeploy, not a business-user editor. In dev mode without CEL_EVALUATOR_URL the evaluator is replaced by an allow-all stub, so every rule passes (packages/api/src/server.ts:308-310).

### `misc-1/packaged-product-distribution-and-install-ma` — Packaged product distribution and install (Marketplace, bulk install/upgrade)

**Status:** `partial`

**Evidence (read 15 Aug):** Packaging and local install genuinely work. Packs carry a manifest with name/version/namespace/dependencies plus schema, actions, connectors, permissions, seed and capability lists (domain-packs/aml/pack.yaml; parsed by PackManifest at packages/api/src/schema-loader.ts:34-52). Packs are discovered from DOMAIN_PACKS_DIR, selected by DOMAIN_PACKS, and extended from arbitrary external directories via DOMAIN_PACKS_EXTRA_DIRS (packages/api/src/schema-loader.ts:9-11,134-181), loaded at boot (packages/api/src/server.ts:185), with semver dependency constraints validated across loaded packs and a hard error on violation (packages/api/src/schema-loader.ts:467-520). Declared capabilities gate API surfaces so installing a pack turns on FHIR/CDM/MCP (packages/api/src/server.ts:544-545,1192). Installing a pack provisions storage: generateDDL plus planAdditiveMigration run under an advisory lock at provider init (packages/storage-postgres/src/postgres-storage-provider.ts:224,243,285-333). An external-pack test fixture proves the out-of-tree path (packages/api/src/__tests__/fixtures/external-pack/).

**Gap:** No marketplace: grep for 'marketplace' across the repo returns zero hits, and there is no catalog, registry, publish/fetch channel, or signing/provenance for packs. No bulk install or upgrade — install is copy-a-directory plus set env plus restart, upgrade is additive DDL only (no column removal or data migration), there is no per-install version pinning or rollback, and dependency constraint support is limited to `>=X.Y.Z` or exact match (packages/api/src/schema-loader.ts:483-493).

### `misc-1/ad-hoc-sql-analytics-over-the-ontology-sql-s` — Ad-hoc SQL analytics over the ontology (SQL Studio / Ontology SQL)

**Status:** `absent`

**Evidence (read 15 Aug):** No SQL surface is exposed to users. The REST route inventory in packages/api/src/server.ts (:914-1253) plus the generated routes in packages/api/src/rest/route-generator.ts contain no /sql or query-execution endpoint; grep for sqlQuery/executeSql/rawSql/'sql studio'/'ontology sql'/'query editor' across packages/ and docs/ returns zero hits. SQL exists only as internal, structured generation — packages/storage-postgres/src/objects/filter-to-sql.ts translating FilterExpression, and DDL builders under packages/storage-postgres/src/schema/. The nearest analytics surface is the typed aggregate query: fooAggregate in GraphQL (packages/api/src/graphql/resolver-generator.ts:1001) and POST /api/v1/{plural}/aggregate (packages/api/src/rest/route-generator.ts:1018-1095).

**Gap:** No SQL dialect over the ontology, no interactive query surface or saved queries, and no joins across object types — aggregate is single-object-type with groupBy only, and is capped by a consent scan limit that hard-errors past CONSENT_SCAN_LIMIT (packages/api/src/rest/route-generator.ts:204-210).

### `misc-1/autonomous-platform-engineering-agent-and-ev` — Autonomous platform engineering agent and evaluation harness (AI FDE, AIP Evals, Model Evaluations)

**Status:** `absent`

**Evidence (read 15 Aug):** Grep across packages/ and domain-packs/ for 'evaluation harness', 'eval suite', 'golden set', scorer, and judge returns zero hits; every 'evaluat*' match in the repo is CEL expression evaluation (packages/actions/src/cel/*, packages/cel-evaluator/evaluator/evaluator.go) or the computed-field evaluator (packages/engine/src/computed/computed-field-evaluator.ts). There is no dataset-of-cases construct, no scoring or comparison runner, and no agent that authors ontology or platform artifacts — the only agent-facing surface is read/execute tool exposure via MCP (packages/mcp-server/src/tools.ts:42-97), which cannot create ObjectTypes, actions, or pipelines.

**Gap:** No autonomous build agent, no eval datasets, graders, or scoring runs, no model comparison or regression tracking.

### `misc-1/classification-based-access-controls-hierarc` — Classification-based access controls (hierarchical markings, disjunctive releasability, inherited data classification)

**Status:** `absent`

**Evidence (read 15 Aug):** The security package has audit/, auth/, authz/, consent/ only. Authorization is ReBAC via OpenFGA with PermissionLevel = schema|object|action|field (packages/security/src/authz/types.ts:9-13) and field visibility driven by relation→field lists (FieldPermissionConfig, packages/security/src/authz/types.ts:31-46). Grep across packages/, Orion/, domain-packs/ for marking, releasability, clearance, portion-mark, handling-caveat returns zero hits (the single 'marking' hit, packages/api/src/cdm/mappers.ts:18, is a comment about a constant-field name prefix). The OpenFGA model (Orion/openfga-model.json) declares only ordinary object types and relations. The nearest primitive is the @sensitive directive, which derives a deny-by-default field-permission config (packages/api/src/schema-loader.ts:548-560) — a per-field visibility flag, not a marking.

**Gap:** No marking objects, no hierarchy or dominance evaluation, no disjunctive (OR-of-markings) releasability, and no propagation of classification from source data to derived objects. @sensitive is boolean and per-field, resolved by role relation, and does not inherit.

### `misc-1/cross-application-commands-declared-client-s` — Cross-application commands (declared client-side operations, command chains, commands-as-chatbot-tools)

**Status:** `absent`

**Evidence (read 15 Aug):** No Command construct exists: grep for command across packages/ hits only CLI plumbing (commander `.command(` in packages/odl/src/cli/index.ts:56-258) and Docker/helm `command:` keys. There is no declaration format, no chaining, and no client to run client-side operations. The nearest analogue is action exposure to agents: MCP is mounted at /mcp when a pack declares the mcp capability (packages/api/src/server.ts:1187-1231) building one tool per ActionType plus search_<Type> read tools (packages/mcp-server/src/tools.ts:42-97), and ToolRegistry can emit Anthropic/OpenAI tool formats (packages/actions/src/tools/tool-registry.ts:411,430) — though those two exporters have no caller outside their own package and tests.

**Gap:** No declared-command concept, no command chains, no client-side operation binding, no cross-application invocation. Agent tool exposure is per-action MCP, which is a different mechanism and offers no composition.

### `misc-1/interactive-geospatial-mapping-map-app-layer` — Interactive geospatial mapping (Map app: layers/overlays, geo search, search-around, annotations)

**Status:** `absent`

**Evidence (read 15 Aug):** Only a GeoPoint scalar name exists, with no geo semantics anywhere. Declared as an allowed scalar in packages/odl/src/validator/index.ts:23 and packages/odl/src/codegen/index.ts:29,37; persisted as opaque JSONB in packages/storage-postgres/src/schema/type-mapping.ts:25; runtime validation is `GeoPoint: (v) => typeof v === 'object' && v !== null` (packages/engine/src/objects/validation.ts:81) — no lat/lon check. The only query predicate set, FieldPredicate.operator in packages/spi/src/ontology.ts:45-58, is eq/neq/gt/gte/lt/lte/in/contains/startsWith/exists — no within/radius/intersects/bbox. packages/mcp-server/src/tools.ts:36 even maps GeoPoint to 'string' for tool schemas, contradicting the JSONB object shape. Repo-wide grep over packages/, domain-packs/, Orion/ for geohash, PostGIS, bbox, leaflet, mapbox, tile, search-around, annotation returns zero code hits (only docs/audit/*.html prose). No package.json in packages/* declares any map or frontend dependency.

**Gap:** Everything: no map surface, no layer/overlay model, no geo indexing or geo predicates, no geo search, no search-around, no annotations. GeoPoint is a name on an unvalidated JSONB blob.

### `misc-1/llm-application-platform-aip-multi-model-cat` — LLM application platform (AIP: multi-model catalog, prompt engineering, AIP Logic block orchestration, token/rate governance)

**Status:** `absent`

**Evidence (read 15 Aug):** No LLM is ever invoked. No package.json across packages/* declares an LLM SDK (full dependency set is Apollo/GraphQL, grpc, OpenFGA, OTel, express, jose, kafkajs, pg, pino, prom-client, ioredis, ws, yaml, commander). Grep for openai/anthropic finds only doc comments naming agent clients (packages/mcp-server/src/index.ts:5, packages/mcp-server/src/server.ts:7) and two format exporters, toAnthropicTools/toOpenAiTools (packages/actions/src/tools/tool-registry.ts:411,430), which have no caller outside their own package and tests. Grep for 'model catalog', prompt, and 'token budget' finds no implementation (the sole 'prompt' hit is a comment in packages/actions/src/tools/types.ts). Rate limiting exists (packages/api/src/governance/rate-limiter.ts, redis-rate-limiter.ts) but is HTTP request rate limiting, with no token accounting.

**Gap:** No model catalog or provider abstraction, no prompt authoring/versioning/testing, no logic-block orchestration, and no token metering, budgets, or per-model governance. Altius is the tool-provider side (MCP), never the LLM caller.

### `misc-1/no-code-operational-app-building-workshop-wi` — No-code operational app building (Workshop widgets, layouts, variables; Object Views)

**Status:** `absent`

**Evidence (read 15 Aug):** Grep for workshop, widget, objectView/object-view, layout, variable-binding, dashboard across packages/ finds no implementation — the only 'widget' hits are the literal word inside test fixtures (packages/api/src/__tests__/fixtures/external-pack/actions/activate-widget.yaml) and the two 'layout' hits in packages/api/src/schema-loader.ts:151,157 are comments about Docker directory layout. The ODL directive vocabulary (packages/odl/src/parser/types.ts:23-88 and the dispatch in packages/odl/src/parser/index.ts:299-352) is primary/unique/indexed/readonly/sensitive/param/link/computed/constraint/default/deprecated/terminology/searchable/immutable — no display, view, or render directive. Notably every pack manifest declares a `provides:` block including `widgets: 0` (domain-packs/aml/pack.yaml), but the PackManifest interface that actually parses pack.yaml (packages/api/src/schema-loader.ts:34-52) has no `provides` field at all — that config is read by nothing.

**Gap:** No app-building tier of any kind: no widgets, layouts, variables, object views, or app runtime. There is no frontend package in the monorepo and no frontend dependency in any package.json.

### `misc-1/platform-wide-branching-proposals-and-merge-` — Platform-wide branching, proposals, and merge (Global Branching; Workshop branch/rebase; branch-aware tooling)

**Status:** `absent`

**Evidence (read 15 Aug):** The schema registry is strictly linear: SchemaVersion carries a monotonic integer `version` and SchemaRegistry exposes only getSchema(version)/applySchema/getSchemaHistory/getCurrentVersion (packages/odl/src/registry/types.ts:14-24,46-74), implemented over a single _schema_registry table keyed by version (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:48,121-123). Repo-wide grep for branchId, branch_id, or BRANCH across packages/, Orion/, and domain-packs/ returns zero hits; grep for 'proposal' and 'rebase' returns zero hits anywhere in the repo. The word 'branch' appears only as git/control-flow prose in packages/actions/src/executor/action-executor.ts and test files. No storage provider (postgres or memory) carries a branch column or branch-scoped read path.

**Gap:** No branches, no proposals, no merge or rebase, no branch-aware reads/writes or tooling. The only lifecycle primitive is linear versioning with a rollback diff generator (packages/odl/src/cli/index.ts:258).

### `misc-1/third-party-application-platform-developer-c` — Third-party application platform (Developer Console: OAuth clients, scoped tokens, service users, OSDK)

**Status:** `absent`

**Evidence (read 15 Aug):** None of the four named pieces exist. Auth is bearer-JWT verification only: OidcAuthenticator validates signature/expiry/issuer against a single configured audience (packages/security/src/auth/oidc-authenticator.ts:42-88) — there is no scope claim handling anywhere, and a repo-wide grep for scopes, apiKey, client_secret, or registerClient across packages/ (excluding tests) returns zero hits. The shipped identity realm defines one public client with no service accounts and no client scopes (Orion/keycloak/altius-realm.json: clientId 'altius', publicClient true, serviceAccountsEnabled unset). MCP treats an agent as an ordinary OIDC principal with no separate identity (packages/mcp-server/src/auth.ts:1-9). The OSDK analogue is dead code: generateSdk exists (packages/odl/src/codegen/sdk.ts:416) but its only callers are packages/odl/src/__tests__/sdk-codegen.test.ts — the CLI exposes only `generate graphql` and `generate openfga` (packages/odl/src/cli/index.ts:204-252), and the shipped package is a stub: packages/sdk-typescript/src/index.ts:1-7 is a comment plus `export {}`.

**Gap:** No developer console or self-service client registration, no OAuth client/secret management, no scoped tokens or consent screens, no service-user identities, and no published/generated SDK. Third parties get only an OpenAPI document (packages/api/src/server.ts:1083) and a hand-provisioned Keycloak user token.

### `misc-1/time-series-and-process-monitoring-applicati` — Time-series and process monitoring applications (Vertex thresholds, Machinery process mining)

**Status:** `absent`

**Evidence (read 15 Aug):** Grep across packages/ and domain-packs/ for time-series/timeseries/time_series, 'process mining', anomaly, sensor, and telemetry returns zero hits. The only 'threshold' hits are an unrelated business property in domain-packs/aml/schema/customer.odl and gRPC deadline settings in packages/actions/src/cel/client.ts. There is no series storage type (packages/storage-postgres/src/schema/type-mapping.ts has no interval/series mapping), no windowing or downsampling in the query path (packages/spi/src/ontology.ts filters and packages/storage-postgres/src/objects/aggregate.ts group-by only), and no alerting on data. Prometheus metrics exist (packages/observability/src/metrics.ts, Orion/helm/altius/templates/prometheusrule.yaml) but monitor the platform itself, not ontology data.

**Gap:** No time-series data type or store, no threshold/alert definitions on data, no monitoring app, no process/event-log mining or conformance analysis.


## Data pipelines

### `pipelines-data/no-code-pipeline-authoring-with-configurable` — No-code pipeline authoring with configurable dataset outputs (Pipeline Builder: output schema mapping, write modes, file formats)

**Status:** `partial`

**Evidence (read 15 Aug):** A declarative (YAML) ingest-pipeline authoring surface is real and production-wired: manifests are parsed by parseMappingObject (packages/sync/src/mapping/mapping-parser.ts:160-163 validates datasource/connector/connection/mapping/sync), field-level transforms are configurable expressions (packages/sync/src/mapping/transforms.ts parseTransformExpression: concat/prefix/suffix/parseDate/parseDateTime/parseInt/parseFloat/toUpper/toLower/trim/ifPresent/coalesce/map/custom), and SyncScheduler runs them on a bounded poll loop (packages/sync/src/scheduler/sync-scheduler.ts:245-266 tick, 268-284 extractIterable) against a real Postgres JDBC connector (packages/sync/src/connectors/jdbc-connector.ts:165,203). Boot wiring: packages/api/src/sync-boot.ts:118-160 startSyncScheduler, called from packages/api/src/server.ts:732-739. BUT the output side of the graded capability does not exist: output is always ontology-object upsert by natural key (packages/api/src/sync-boot.ts:52-100 createEngineChangeApplier) — no dataset target, no write mode, no file format, no output schema mapping. Also gated off by default (SYNC_SCHEDULER_ENABLED === 'true', server.ts:732), all three shipped manifests are sync.mode OVERLAY so the scheduler schedules nothing out of the box (domain-packs/aml/connectors/tms-jdbc.yaml:31, domain-packs/nhs-acute/connectors/pas-jdbc.yaml:21, domain-packs/supply-chain/connectors/erp-jdbc.yaml:28), and link mappings are silently not applied (sync-boot.ts:97-101 'Sync link mappings are not applied yet').

**Gap:** All three named output features (output schema mapping, write modes, file formats) are missing — output is fixed ontology upsert. No authoring UI exists (there is no frontend package in packages/). Disabled by default; zero shipped manifests are schedulable; link ingestion unimplemented.

### `pipelines-data/ontology-materializations-and-governed-bulk-` — Ontology materializations and governed bulk export (latest object state incl. user edits exported to datasets/restricted views)

**Status:** `partial`

**Evidence (read 15 Aug):** Governed bulk export is real and wired. GET /api/v1/{plural}/export?format=ndjson|csv (packages/api/src/rest/route-generator.ts:462-536) is pushed into every object type's route list at route-generator.ts:286, and reuses collectRawRecords so it inherits FGA scoping, field-level redaction and consent filtering (route-generator.ts:454-457,491-496). CDM export: packages/api/src/cdm/router.ts:133,139 → handleObjectExport (cdm/router.ts:314-364), same auth/redaction/consent/projection pipeline. Saved object sets export as NDJSON (route-generator.ts:1637-1650). Exports read live objects via objectManager.query, so user edits are included. Gaps: hard 10,000-row cap on both paths (route-generator.ts:449 REST_EXPORT_LIMIT, cdm/router.ts:52 EXPORT_LIMIT) with only a truncation header; whole body is built in memory (records.map(...).join('\n')), no streaming or paging. 'materialization' and 'restricted view' appear only in AGENT.md and docs/audit/foundry-parity-audit.html — no scheduled materialization, no dataset/view destination, no Arrow/parquet (route-generator.ts:459 defers Arrow explicitly).

**Gap:** Export is a synchronous, in-memory, 10k-row-capped HTTP pull. No materialization to a persisted dataset, no scheduling/incrementality, no restricted views, no columnar formats.

### `pipelines-data/schema-and-data-version-time-travel-schema-a` — Schema and data version time-travel (schema at any version; reads as of version/time; historical snapshots)

**Status:** `partial`

**Evidence (read 15 Aug):** What works: per-object version history over HTTP — GET /api/v1/{plural}/:id/history (packages/api/src/rest/route-generator.ts:913-923, wired at :293), backed by storage.getObjectAtVersion (route-generator.ts:962), implemented by BOTH providers (packages/storage-postgres/src/postgres-storage-provider.ts:533-535 → packages/storage-postgres/src/temporal/temporal-queries.ts getObjectAtVersion; packages/storage-memory/src/memory-storage-provider.ts:979-986, history populated at :359,388,405). What does not: getObjectAtTime is implemented on both providers (postgres-storage-provider.ts:537-539, memory-storage-provider.ts:988-1002) but has ZERO production callers — grep across packages/engine, packages/api, packages/sdk-typescript, packages/mcp-server finds it only in test files and in packages/storage-postgres/src/__tests__. QueryOptions.asOfVersion and asOfTime (packages/spi/src/ontology.ts:97-98) are declared and referenced by NOTHING anywhere in the repo — a whole-repo grep returns only those two definition lines, so as-of reads on lists/queries do not exist. Schema-at-version: PostgresSchemaRegistry.getSchema(version) works (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:54-75) but is unreachable — the registry is only used for boot-time recordSchemaVersion (packages/api/src/server.ts:236-240) and is never placed in ApiDependencies, so no API returns a historical schema. The history route also refetches every version in a sequential loop (route-generator.ts:960-970).

**Gap:** Only single-object version history is reachable. No as-of-time read path (dead provider method), no as-of on queries/lists (asOfVersion/asOfTime are dead SPI config), no exposed schema-at-version, N+1 history retrieval.

### `pipelines-data/code-based-batch-transform-framework-transfo` — Code-based batch transform framework (transforms-python / Java transforms on Spark, incremental transforms)

**Status:** `absent`

**Evidence (read 15 Aug):** 'spark', 'transforms-python' and 'incremental transform' appear nowhere in source — only in AGENT.md and docs/audit/foundry-parity-audit.html (whole-repo grep excluding node_modules/dist/.git). The FunctionType runtime (packages/engine/src/functions/function-executor.ts:1-20) executes a single pure function per invocation over named params returning JSON, via 'node' and 'cel' runtime adapters; it has no dataset input/output, no partitioning, no incremental state. The only batch mechanism is SyncScheduler mode BATCH (packages/sync/src/scheduler/sync-scheduler.ts:281-283), a periodic full re-extract from a source table piped into ontology upserts — declaratively configured, not user code.

**Gap:** No transform authoring model, no dataset inputs/outputs, no distributed execution, no incremental/APPEND semantics, no build graph.

### `pipelines-data/data-expectations-quality-checks-that-gate-b` — Data expectations / quality checks that gate builds

**Status:** `absent`

**Evidence (read 15 Aug):** 'expectation' does not appear in any source file — whole-repo grep hits only AGENT.md, docs/altius-spec-v2.md and docs/audit/foundry-parity-audit.html. No quality-check DSL, no threshold, no build to gate. In the ingest path a failing record is merely counted and logged, never quarantined and never blocking the batch: packages/sync/src/cdc/cdc-consumer.ts:128-133 catches per-record errors and calls logger.error. The only related enforcement is per-record @constraint CEL validation on object write (packages/engine/src/objects/validation.ts:288-340, invoked from packages/engine/src/objects/object-manager.ts:96,203) — row-level, not pipeline-level, and it degrades open: without a CEL sidecar an inline evaluator handles only simple comparisons and records unenforced constraints as warnings (validation.ts:50-56), and in dev mode with no CEL_EVALUATOR_URL the evaluator is an explicit allow-all stub (packages/api/src/server.ts:304-310).

**Gap:** No expectations concept, no per-dataset quality report, no aggregate thresholds, no build/job to gate, no quarantine or DLQ. Row-level constraint validation is a different mechanism and fails open in two configurations.

### `pipelines-data/dataset-projections-query-acceleration-filte` — Dataset projections / query acceleration (filter- and join-optimized projections, incremental compaction, transparent planner use)

**Status:** `absent`

**Evidence (read 15 Aug):** The word 'projection' in source means the CDM/FDP read projection, not query acceleration (packages/odl/src/codegen/index.ts:612,779-780). No materialized views exist — grep 'materialized view' over packages/storage-postgres/src returns nothing. The only acceleration is ordinary DDL indexing: PostgresStorageProvider.ensureIndex issues CREATE INDEX IF NOT EXISTS ... USING <method> (packages/storage-postgres/src/postgres-storage-provider.ts:543-558) plus fixed gin_trgm indexes (packages/storage-postgres/src/schema/ddl-objects.ts:109). Provider divergence: the memory provider's ensureIndex is an explicit no-op (packages/storage-memory/src/memory-storage-provider.ts:1008-1010). Saved object sets are re-executed live against the store on every read, nothing precomputed (packages/engine/src/object-sets/object-set-manager.ts:59 execute, :93 executeAggregate).

**Gap:** No projection entity, no precomputed filter/join structures, no compaction, no planner that selects a projection. Plain B-tree/GIN indexes are not the graded capability, and they do not exist at all on the memory provider.

### `pipelines-data/dataset-rest-api-metadata-schema-retrieval-a` — Dataset REST API (metadata + schema retrieval addressed by branch / transaction / schema version)

**Status:** `absent`

**Evidence (read 15 Aug):** No dataset routes exist. The nearest surfaces return ROWS, not dataset metadata: GET /api/v1/{plural}/export (packages/api/src/rest/route-generator.ts:462, wired at :286) and GET /api/v1/cdm/{SourceType}/export (packages/api/src/cdm/router.ts:133,314). Neither accepts a branch, transaction rid, or schema version. A schema-at-version reader DOES exist — PostgresSchemaRegistry.getSchema(version) (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:54-75) — but it is never exposed: the `schemaRegistry` built at packages/api/src/server.ts:236 is used only by recordSchemaVersion at boot (server.ts:240) and never enters ApiDependencies (grep 'schemaRegistry' in server.ts returns only lines 236 and 240).

**Gap:** No dataset entity to address. Schema-registry read path is dead code behind boot-time write-only usage; no HTTP surface returns it.

### `pipelines-data/foundry-rules-no-code-batch-rules-engine-ove` — Foundry Rules: no-code batch rules engine over the ontology (rule authoring + governed rule outputs + generated rules pipeline)

**Status:** `absent`

**Evidence (read 15 Aug):** Grepped packages/*/src for 'rulesEngine', 'foundryRules', 'ruleSet', 'batchRule' — zero hits. Every source occurrence of 'rule' is either ODL validator rule numbering (packages/odl/src/validator/index.ts:65-215, 'Rule 1' … 'Rule 15') or prose in comments (e.g. packages/actions/src/executor/action-executor.ts:67). There is no rule authoring model, no rule evaluation runtime, no rule output, and no generated pipeline.

**Gap:** Entirely absent. The closest adjacent runtime, ActionType preconditions and @constraint CEL, is per-object and synchronous, not a batch rules engine, and produces no rule-hit output.

### `pipelines-data/interactive-sql-query-service-spark-sql-rest` — Interactive SQL query service (Spark SQL REST API with async job lifecycle)

**Status:** `absent`

**Evidence (read 15 Aug):** Grepped packages/*/src for 'sparkSQL', '/sql', 'queryService', 'executeSql', 'rawSql' — zero hits. No SQL route is registered anywhere in packages/api/src. The only SQL execution reachable from the API process is internal boot DDL/health (packages/api/src/server.ts:261 storage.pool.query) and the storage provider's own generated statements. No job submission, no job id, no polling/cancel lifecycle. Orion/ compose and helm define only api-gateway, ontology-engine, action-executor, security-service, sync-engine, cel-evaluator and postgres — no query engine (Orion/helm/altius/templates/*).

**Gap:** Nothing exists: no SQL endpoint, no engine, no async job lifecycle.

### `pipelines-data/no-code-client-side-variable-transformations` — No-code client-side variable transformations (Workshop derived values: string/math/date/object-set/geospatial/array operations)

**Status:** `absent`

**Evidence (read 15 Aug):** There is no client/UI package in the repo at all — packages/ contains only actions, api, cel-evaluator, engine, mcp-server, observability, odl, sdk-typescript, security, spi, storage-memory, storage-postgres, sync. The two server-side analogues are not client-side and cover only a fraction of the operation set: ingest-time mapping transforms (packages/sync/src/mapping/transforms.ts — concat, prefix, suffix, parseDate, parseDateTime, parseInt, parseFloat, toUpper, toLower, trim, ifPresent, coalesce, map, custom) applied during record mapping, and read-time @computed fields whose built-ins are exactly countLinks, lookupField, sumLinks, avgLinks, minLinks, maxLinks (packages/engine/src/computed/computed-field-evaluator.ts:41-48), wired in production at packages/api/src/server.ts:333. No geospatial and no array operations exist in either registry.

**Gap:** No client at all, so no client-side derived values. Server-side substitutes are fixed built-in registries requiring ODL/YAML schema edits and redeploy, with no geospatial, no array, and no object-set operations.

### `pipelines-data/programmatic-tabular-read-write-sdk-foundry-` — Programmatic tabular read/write SDK (foundry.transforms.Dataset: pandas/polars/arrow IO with filter pushdown, schema inference, file upload)

**Status:** `absent`

**Evidence (read 15 Aug):** packages/sdk-typescript/src/index.ts is 7 lines and its entire body is `export {};` with the comment 'This package will be populated by the SDK generator.' — it is the only file in the package (find packages/sdk-typescript/src). 'polars' and 'parquet' appear only in AGENT.md and docs/audit/foundry-parity-audit.html; 'arrow' in source appears only as an unrelated identifier in tests. packages/api/src/rest/route-generator.ts:459 states Arrow IPC is 'deliberately deferred (would require apache-arrow)'.

**Gap:** No SDK at all — the package is an empty placeholder. No dataframe IO, no filter pushdown, no schema inference, no file upload.

### `pipelines-data/versioned-transactional-dataset-primitive-da` — Versioned transactional dataset primitive (datasets as branchable, transaction-log-backed tabular resources)

**Status:** `absent`

**Evidence (read 15 Aug):** ParsedSchema declares only objectTypes/linkTypes/actionTypes/functionTypes/enums/interfaces/scalars — no dataset node (packages/odl/src/parser/types.ts:272-281). SPI Transaction is a per-request object/link CRUD transaction with commit/rollback, not a dataset transaction log (packages/spi/src/transaction.ts:11-20). Grepped the whole repo (excl. node_modules/dist/.git) for 'branch': the only source hit is an unrelated code-flow comment at packages/actions/src/executor/action-executor.ts:384 — no branching primitive exists. Versioning that does exist is per-ROW: a *_history snapshot table per object type (packages/storage-postgres/src/schema/ddl-objects.ts:55) written on every create/update/delete (packages/storage-postgres/src/objects/object-crud.ts:159,286,317).

**Gap:** Everything: no dataset resource, no tabular files, no transaction log over a dataset, no branches, no commits/merges. Row-level object history is the only versioning.


## Security & governance

### `security-gov/access-decision-audit-trail-dpo-auditability` — Access-decision audit trail (DPO auditability)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Retrieval is now self-serve and tenant-safe — that half of the prior gap is closed. REST GET /api/v1/audit exists (packages/api/src/rest/audit-routes.ts:47-92) and is mounted (server.ts:1107); GraphQL `auditRecords` mirrors it (resolver-generator.ts:1911-1995, wired at :634, SDL at packages/odl/src/codegen/index.ts:950). Both force filter.tenantId from the caller's token and never read it from the request (audit-routes.ts:103-104, resolver-generator.ts:1957-1959), both role-gate on DEFAULT_AUDIT_READER_ROLES=['admin'] with empty-set meaning nobody (audit-routes.ts:35,53-64), and `ce7ae32` made AuditRecord.tenantId required rather than optional (packages/spi/src/audit.ts:14-19), so untenanted records can no longer be served. What remains is the DPO's actual question. Reads are not audited at all: the complete set of AuditWriter.write callers is consent/router.ts:123,137,145; relationships/router.ts:155,179,192; action-executor.ts:582,1282; functions/invoke-function.ts:60 — writing operation.type 'action', 'link'/'unlink', consent, and 'function'. Nothing anywhere writes type 'read' or 'query', despite audit-writer.ts:10 documenting 'Called by query layer for read auditing' — that caller does not exist. So 'who read this record' still returns nothing, and read denials are invisible. Two surfaces also disagree: audit-routes.ts:76-78 pages in the store (query(filter,{limit,offset}) + count()), while resolver-generator.ts:1974-1987 calls query(filter) with NO options and slices in JS. On Postgres that caps at DEFAULT_QUERY_LIMIT=1000 (postgres-audit-store.ts:95,117-119) so GraphQL totalCount pins at 1000 and offset>=1000 returns empty; on memory, query() with no options returns the whole matched set (memory-audit-store.ts:37-40), an unbounded fetch. Same query, different answer per surface and per provider. Minor type drift: packages/security/src/audit/types.ts:24-33 omits 'function' from the operationType union that invoke-function.ts:64 writes and postgres-audit-store.ts:30-32 accepts.

**Gap:** No read auditing anywhere — no producer ever writes operation.type 'read' or 'query', so a DPO cannot answer 'who read this record' or see any denied read. Additionally the GraphQL surface is not paged in the store (resolver-generator.ts:1974), so on Postgres it silently truncates the trail at 1000 records while REST does not.

### `security-gov/ai-agent-write-governance-human-approved-non` — AI/agent write governance (human-approved, non-destructive agent access)

**Status:** `partial`

**Evidence (read 15 Aug):** The production MCP server (mounted at /mcp only when a pack declares the `mcp` capability, packages/api/src/server.ts:1192-1231) advertises EVERY ActionType as a callable write tool plus a search_<Type> read tool, with no filtering by the caller's permissions (packages/mcp-server/src/tools.ts:46-60). Writes do run the full governed pipeline — authz, consent, preconditions, audit — under the caller's OIDC identity (tools.ts:232-238; packages/mcp-server/src/auth.ts:53-82), and reads are FGA-scoped then field-redacted (tools.ts:263-309). But nothing is agent-specific: no approval hold, no dry-run (the MCP action tool schema exposes only @param fields, tools.ts:66-87), no risk classification, no read-only mode, and the agent is audited as actor.type 'user' (tools.ts:212-216) because AuditActor admits only user|system|connector (packages/spi/src/audit.ts:16-21). The dry-run/PolicyGuard/RiskLevel machinery in packages/actions/src/tools is unwired (see cap 7). MCP search reads are unaudited — createMcpServer is given no auditWriter (server.ts:1194-1203).

**Gap:** Agent writes inherit human-grade controls but get no agent-grade ones: no human-in-the-loop hold, no non-destructive/dry-run mode over MCP, no per-agent scoping of the tool list, and no way to distinguish agent activity in the audit trail.

### `security-gov/layered-permission-separation-app-module-vs-` — Layered permission separation (app/module vs data vs action vs function)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** `34f540f` closed the function hole for real. @function now carries requiredRoles (packages/odl/src/parser/types.ts:143-145, parsed at packages/odl/src/parser/index.ts:189-201 into FunctionType.requiredRoles: string[] at types.ts:246), and invokeFunction enforces it deny-by-default before execute(): packages/api/src/functions/invoke-function.ts:370-384 — an empty requiredRoles denies with a message naming the remedy, and the refusal is audited (invoke-function.ts:60-66) before throwing. Both surfaces route through that one entry point (graphql/resolver-generator.ts:1464; rest/route-generator.ts:1727), and MCP is not a bypass — packages/mcp-server/src/tools.ts:46-66 builds only action/search/traverse tools and exposes no FunctionType. So functions are no longer an unauthenticated escape hatch, and the prior gap's central claim is dead. Two of the prior gap's clauses survive verbatim. Object-less actions still fall through to allow at the ReBAC layer: packages/api/src/config.ts:220-228 returns `{ allowed: true }` for any action with no ObjectType @param, backstopped only by assertActionAuthzCoverage (config.ts:246-290, called at server.ts:676), which is still a substring heuristic — it greps preconditions for the literal 'actor.hasRole(' and downgrades to a warning whenever preconditions exist but none match. And there is no app/module tier at all: grep across packages for app.?permission|module.?permission|appRole|workspace.?permission returns zero hits. Two caveats on the new layer: the validator requires @function runtime and entry (odl/src/validator/index.ts:588,596) but not requiredRoles, so omitting it is a runtime 403 rather than a build failure; and grep of domain-packs/ for @function returns zero, so no shipped pack exercises the layer.

**Gap:** Three of four layers. No user-facing app/module permission tier exists at all. Object-less actions still default to allow at the ReBAC layer (config.ts:220-228), gated only by a boot-time substring scan for 'actor.hasRole(' that warns rather than fails when preconditions exist but check no role.

### `security-gov/organization-tenant-boundary-isolation` — Organization/tenant boundary isolation

**Status:** `partial`

**Evidence (read 15 Aug):** The data plane isolates on both providers: Postgres object tables are PRIMARY KEY (_tenant_id,_id) with tenant predicates on every query (packages/storage-postgres/src/schema/ddl-objects.ts:16,40; packages/storage-postgres/src/links/link-crud.ts:172-181), and the memory provider filters every read/write by ctx.tenantId (packages/storage-memory/src/memory-storage-provider.ts:283,366,547,868). Tenant identity fails closed at authentication (packages/security/src/auth/oidc-authenticator.ts:122-131, MISSING_TENANT unless OIDC_DEFAULT_TENANT is set). The authorization plane does NOT isolate: one OPENFGA_STORE_ID serves the whole deployment (packages/api/src/server.ts:461-465), tuples are written as `user:<id>` / `<type>:<id>` with no tenant prefix (packages/security/src/authz/authorization-service.ts:192-204), and the grant API never receives a tenantId nor checks that the target object belongs to the caller's tenant — applyRelationshipChange takes only (deps, allowlist, action, body, actor, traceId) (packages/api/src/relationships/router.ts:120-193), while its REST adapter has ctx.requestContext.tenantId available and passes only traceId (router.ts:205-208). docs/altius-spec-v2.md:2072 requires per-tenant FGA isolation. Audit records carry no tenant at all (cap 10), and Postgres RLS is explicitly deferred post-MVP (packages/storage-postgres/src/schema/ddl-consent.ts:11).

**Gap:** Isolation is enforced in one plane only. Because object ids are unique per tenant, not globally, a granter role in tenant A can mint a tuple (e.g. patient:123 clinician) that authorizes the same id in tenant B, where storage will happily serve it to that tenant's user. Needs tenant-prefixed tuples or per-tenant FGA stores, a tenant check in the grant path, tenant on audit records, and RLS as defence in depth.

### `security-gov/project-hierarchy-permission-inheritance-and` — Project-hierarchy permission inheritance and ontology-resource governance

**Status:** `partial`

**Evidence (read 15 Aug):** Container inheritance genuinely works: the generated model derives viewer/editor through an outbound link (packages/odl/src/codegen/openfga.ts:189-200) and packs rely on it — domain-packs/nhs-acute/permissions/nhs-roles.fga:15-17 gives patient `viewer: viewer from admitted_to`, bed inherits from ward (lines 27-30). But there is no project/folder/space/organization resource: the deployed model's types are user, ward, patient, bed, consultant, discharge_record (Orion/openfga-model.json), and no pack .fga declares an org/project type (domain-packs/{aml,nhs-acute,supply-chain}/permissions/*.fga). Inheritance is bound to the arbitrarily chosen FIRST outbound link (openfga.ts:192 "primary link" convention). Ontology resources are ungoverned: packs are read from disk at boot, there is no runtime ontology-mutation API, the only ontology introspection route is /admin/packs behind the X-Forwarded-For heuristic (server.ts:953; metrics.ts:145-153), and a pack override REPLACES the whole generated type block (openfga.ts:362-375).

**Gap:** Inheritance is data-containment only, not a governable project/folder hierarchy, and it is auto-derived from one link with no way to choose the parent. No per-resource permissions on ontology artifacts (object types, actions, functions) and no in-platform ontology editing to govern.

### `security-gov/approval-proposal-workflows-with-attribute-b` — Approval/proposal workflows with attribute-based submission criteria

**Status:** `absent`

**Evidence (read 15 Aug):** There is no proposal/pending state anywhere: no draft or proposal store, no submit/approve endpoints (route inventory, packages/api/src/server.ts:914-1253), and the action pipeline commits in one pass (packages/actions/src/executor/action-executor.ts:190-450, stages VALIDATE→AUTHORISE→CONSENT→PRECONDITIONS→EXECUTE→SIDE-EFFECTS→AUDIT→EMIT — no hold stage). The only approval construct is the PolicyGuard interface with holdId (packages/actions/src/tools/types.ts:97-113,119-128) consumed by ToolRegistry.executeForAgent (packages/actions/src/tools/tool-registry.ts:153-178) — dead code: repo-wide, `new ToolRegistry` occurs only in packages/actions/src/tools/__tests__/tool-registry.test.ts:157,310,336,362, and no class implements PolicyGuard outside that test (line 383). Nearest live primitive is CEL preconditions in action manifests (action-executor.ts:243; CEL sidecar wired at server.ts:301-306), which gate submission on caller/object attributes but commit immediately with no second party.

**Gap:** Demoted from partial: the defining half — a proposal object, an approver role, and a review/approve transition — does not exist even in skeleton form, and the one interface that hints at it is unreferenced by production wiring. CEL preconditions are already counted as the action-authorization layer (cap 4), not an approval workflow.

### `security-gov/checkpoints-justification-capture-for-sensit` — Checkpoints: justification capture for sensitive actions

**Status:** `absent`

**Evidence (read 15 Aug):** Repo-wide grep for justification / reason_code / reasonCode / break-glass / breakGlass / purposeOfUse across packages returns nothing (the only `checkpoint` hits are sync incremental-extract offsets, e.g. packages/sync/src/connectors/connector.ts:39,43). No action parameter, REST body field, GraphQL argument, or header carries a user-supplied reason. AuditDetail records denialReason only for system-generated denials (packages/actions/src/executor/action-executor.ts:1111-1115). The nearest artifact is the free-text `evidence` string on a recorded consent decision (packages/api/src/consent/router.ts:113,135,138) — an attribute of the consent record, not an at-use justification prompt, and it never gates execution.

**Gap:** Needs a per-action/per-field "requires justification" declaration, a prompt-and-capture contract on every surface (GraphQL/REST/FHIR/MCP), and the captured text persisted into the audit record. None of the three parts exists.

### `security-gov/marking-propagation-along-data-lineage-inher` — Marking propagation along data lineage (inheritance, simulation, stop_propagating)

**Status:** `absent`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Half the prior gap closed; the half that defines the capability did not. `45dfc0d` gave provenance a producer: packages/api/src/server.ts:383-384 constructs `new LineageRecorder({ store: new PostgresLineageStore(storage.pool) })` and passes it to ObjectManager (server.ts:393), which now writes on create (packages/engine/src/objects/object-manager.ts:139-149) and on update for changed fields only (object-manager.ts:249-262). Postgres only — server.ts:383 yields `undefined` for the memory provider, so lineage is a provider-divergent capability by design. The other half is untouched: there is still no label to propagate. Grep across packages/ and domain-packs/ for marking|securityLabel|stop_propagat|@marking returns zero — every 'classification' hit is schema-migration SAFE/COMPATIBLE/BREAKING (packages/odl/src/diff/types.ts:134, storage-postgres/src/schema-registry/postgres-schema-registry.ts:48). `stop_propagating` does not exist in the repo. Nor is what landed a lineage graph: FieldProvenance (packages/spi/src/provenance.ts:7-19) is a per-field 'who last wrote this value' row — tenantId, objectType, objectId, field, valueHash, producedAt, source — with the only upstream edge being `inputRefs` on the FUNCTION source variant. There is no object-to-object or dataset-to-dataset derivation edge to inherit along. The records are also unreadable: grep of packages/api/src for getLineage|getObjectLineage returns no callers, so no REST, GraphQL, or MCP surface exposes provenance. And the one intended consumer is still hard-disabled — packages/api/src/sync-boot.ts:154-168 unconditionally refuses any datasource declaring conflictResolution, on a now-stale comment asserting 'LineageRecorder is never constructed'.

**Gap:** No marking/label primitive exists at any layer, so inheritance, simulation, and stop_propagating have nothing to operate on. Provenance is now written (Postgres only) but is a flat per-field writer stamp with no derivation edges between objects, has no read API on any surface, and its sole consumer (sync conflict resolution) is still unconditionally refused at sync-boot.ts:161-168.

### `security-gov/markings-mandatory-access-control-labels-wit` — Markings: mandatory access-control labels with centralized administration

**Status:** `absent`

**Evidence (read 15 Aug):** No marking/classification/label construct exists. Repo-wide grep for "marking" hits only prose (AGENT.md:159,294) and an unrelated comment (packages/api/src/cdm/mappers.ts:18). The ODL directive vocabulary (packages/odl/src/parser/types.ts:23-88) has no marking/classification/clearance directive — the only sensitivity primitive is @sensitive (types.ts:39), a per-field boolean whose enforcement is discretionary role→field mapping from permissions/field-permissions.yaml (packages/api/src/schema-loader.ts:309-316; deny-by-default fallback at 550-602) applied by AuthorizationService.redactFields (packages/security/src/authz/authorization-service.ts:281-315). No marking registry, no user marking-membership, no conjunctive category evaluation. The only governance write APIs in the platform are relationship grants (packages/api/src/relationships/router.ts:196) and consent records (packages/api/src/consent/router.ts:154) — there is no marking administration surface.

**Gap:** Entire mandatory-control layer is greenfield: label model, per-user marking membership, conjunctive check at read/write, and a central admin API. The one shared authenticate→FGA check→redact→consent read pipeline (resolver-generator.ts:353-382, route-generator.ts:583-613) is a clean single insertion point.

### `security-gov/permission-checking-access-explanation-tooli` — Permission checking / access-explanation tooling

**Status:** `absent`

**Evidence (read 15 Aug):** No check or explain surface exists. The ODL CLI offers only validate/diff/apply/generate graphql/generate openfga/rollback (packages/odl/src/cli/index.ts:56-259). The API mounts no permission endpoint (route inventory in packages/api/src/server.ts:914-1253: /metrics, /health, /admin/packs, /graphql, /api/v1/*, /fhir/*, /mcp, /api/v1/ingest). AuthorizationService exposes only check/listObjects/write/deleteRelationship and redaction (packages/security/src/authz/authorization-service.ts:130-330) — no expand, no ListRelations, no contextual/what-if evaluation. The nearest thing is post-hoc response metadata _redactedFields/_consentRestricted (packages/odl/src/codegen/index.ts:131-132; resolver-generator.ts:371,382), which reports what was hidden on the caller's own request without saying why and cannot be run on behalf of another user.

**Gap:** No "can user X do Y on Z, and why" API, no simulation for another principal, no denial-reason surfacing on reads. Denial reasons are captured only for actions, and only into audit (action-executor.ts:1111-1115), not returned to a tool.

### `security-gov/scoped-sessions-session-restricted-marking-s` — Scoped sessions (session-restricted marking subsets)

**Status:** `absent`

**Evidence (read 15 Aug):** AuthenticatedUser carries only id/name/email/roles/groups/tenantId (packages/security/src/auth/types.ts:9-22); the OIDC authenticator reads no scope or session claim (packages/security/src/auth/oidc-authenticator.ts — grep for scope/session returns nothing) and OidcConfig exposes only issuer/clientId/jwksUri/tenantClaim/defaultTenantId/roleMapping (types.ts:32-45). The MCP surface is explicitly stateless with no session storage (packages/api/src/server.ts:1191). The only sessionId in the repo is on AgentContext (packages/actions/src/tools/types.ts:74), which is dead code (see cap 7).

**Gap:** Needs both a marking layer (cap 1) and a session-scoping claim honored by the shared authz pipeline. Nothing to build on today.


## Platform ops

### `platform-ops/continuous-delivery-upgrade-orchestration-ap` — Continuous delivery & upgrade orchestration (Apollo)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** CD side is still empty. .github/workflows/release.yml:1-60 (tag-triggered) installs, builds, tests, runs `pnpm --filter @altius/api spec:all`, then `gh release create` + `gh release upload` of openapi.yaml/schema.graphql/asyncapi.yaml — no image build, no push, no deploy. Repo-wide grep for `docker push|ghcr.io|docker/build-push|docker login` outside node_modules/dist returns zero hits; the only `registry` matches are Orion/helm/altius/values.yaml:6 (`registry: altius`) and unrelated 'pack registry' SQL in Orion/init-services.sh. ci.yml builds compose images only to run integration tests (ci.yml:116-140, :175-188) and to feed the trivy scan (ci.yml:205-218); no job targets an environment. Orion/helm/altius/values.yaml:7-8 pins `tag: "0.2"` for altius/api|engine|actions|sync|security|cel images (values.yaml:177-292) that nothing publishes, so `helm install` requires the operator to build and host them. The one real upgrade mechanism: Orion/helm/altius/templates/init-job.yaml:9 `helm.sh/hook: post-install,post-upgrade` (hook-weight -5, delete-policy hook-succeeded) runs the init job on every upgrade, and packages/storage-postgres/src/schema/ddl-migrate.ts:1-28 plans additive ALTER TABLE ... ADD COLUMN against the live DB, reporting type changes and NOT NULL-without-default as `blocked` rather than applying them. The work that landed (7ace314, fga-deployment-config) touched Orion compose/helm configmap+secrets+values and one ci.yml line — OpenFGA store mapping, nothing about delivery.

**Gap:** No pipeline publishes a container image anywhere, so nothing can be delivered; no environments, promotion, release channels, canary, or automated rollback exist in any workflow or chart. Upgrade orchestration is limited to a post-upgrade Helm hook plus additive-only column reconciliation — destructive/type-changing schema evolution is detected and refused with no approved-migration path implemented.

### `platform-ops/declarative-action-logic-ontology-edit-rules` — Declarative action logic (ontology-edit rules)

**Status:** `partial`

**Evidence (read 15 Aug):** Genuinely wired end to end. ActionManifest (packages/actions/src/parser/types.ts:122-139) carries CEL preconditions and six effect kinds — updateObject/createLink/deleteLink/createObject/deleteObject/recordConsent (parser/types.ts:74-80) — dispatched at packages/actions/src/executor/action-executor.ts:700-716 with per-effect `condition` gating, inside a single SPI transaction with a compensating transaction on failure (action-executor.ts:374-428). Production wiring at packages/api/src/server.ts:695-704 injects storage, security, CEL client, audit writer, event publisher, consent manager, side-effect handler and ReBAC relationship writer. Reachable as POST /api/v1/actions/{Name} (packages/api/src/rest/route-generator.ts:1251-1311), GraphQL mutations (packages/api/src/graphql/resolver-generator.ts:1215-1274) and MCP tools (server.ts:1192-1231). Params are typed in ODL @actionType (domain-packs/nhs-acute/schema/actions.odl:8-14) and behaviour in YAML (domain-packs/nhs-acute/actions/admit-patient.yaml).

**Gap:** Declared-but-dead undo surface: UndoConfig/`reversible` are parsed and validated (packages/actions/src/parser/index.ts:73,88,711-721), emitted into the GraphQL SDL (packages/odl/src/codegen/index.ts:397 `reversible: Boolean!`) and into MCP tool metadata (packages/actions/src/tools/tool-registry.ts:228), but no executor implements undo — action-executor.ts has no undo method and neither route-generator.ts nor resolver-generator.ts exposes an undo endpoint (grep 'undo' returns nothing in either). All 15 shipped manifests are `reversible: false`. Effects also cannot invoke a FunctionType or emit a notification; rule logic is limited to CRUD-on-ontology plus recordConsent.

### `platform-ops/event-driven-automation-condition-triggered-` — Event-driven automation / condition-triggered logic (Automate, successor to Object Monitors)

**Status:** `partial`

**Evidence (read 15 Aug):** The event substrate is real: CloudEvents 1.0 are emitted for every object and link mutation by packages/engine/src/events/event-emitter.ts:54-90 (altius.object.created/updated/deleted, altius.link.*) carrying causedBy actionType/actionId and a field-level ChangeSet. The bus is Redpanda/Kafka-backed when REDPANDA_BROKERS is set and in-memory otherwise (packages/api/src/server.ts:278-292). Filtered fan-out to clients works via GraphQL WS subscriptions with id- and filter-based routing (packages/api/src/subscriptions/subscription-manager.ts:60-130, 197).

**Gap:** There is no in-platform automation: no monitor, trigger, or rule object that says 'when condition C holds, do A'. subscription-manager.ts:197 is the only eventBus.subscribe caller in the repo (the other two subscribe calls are Kafka consumer plumbing at packages/api/src/events/redpanda-event-bus.ts:78 and packages/sync/src/cdc/kafka-cdc-source.ts:84), and it only republishes to WebSocket clients — nothing consumes an event to invoke an action, so every reaction must be an external service the customer writes and hosts themselves. grep for 'Automate' across packages/*/src and domain-packs returns zero.

### `platform-ops/marketplace-product-packaging-managed-instal` — Marketplace product packaging & managed installation

**Status:** `partial`

**Evidence (read 15 Aug):** Packaging format is real: domain-packs/aml/pack.yaml declares schema/actions/connectors/permissions; packages/api/src/schema-loader.ts:832-984 (loadDomainPacks) discovers packs, parses ODL, loads action manifests (loadPackActions:282-305), .fga permission overrides (349-367), connectors (373-399), seeds (405-460) and field permissions (311-342). Semver dependency constraints are checked at schema-loader.ts:501-525 but only warn. External packs load from DOMAIN_PACKS_EXTRA_DIRS (schema-loader.ts:180-232); Helm renders DOMAIN_PACKS as JSON (Orion/helm/altius/templates/configmap.yaml:41) parsed by packages/api/src/server.ts:97-117. Introspection exists read-only: GET /admin/packs (server.ts:953-976, pod-internal via podDirectOnly) plus altius_pack_loaded gauge (packages/api/src/metrics.ts:44-48, set at server.ts:944-949) and _domain_packs upsert (server.ts:257-273).

**Gap:** No marketplace, catalog, registry, or managed install/upgrade/uninstall — grep for install|uninstall|marketplace across packages/ returns zero hits; packs must already exist on the pod filesystem at boot and only a process restart picks up a change. The `provides:` block every pack.yaml ships (domain-packs/aml/pack.yaml:11-19, declaring widgets/qualityRules counts) is read by nothing: the PackManifest interface (schema-loader.ts:34-52) has no `provides` field. Dependency violations only log a warning (schema-loader.ts:513-522), so an unsatisfied pack still boots. The install-time DDL creates _object_types and _link_types (Orion/helm/altius/templates/init-job.yaml:66-76) that no code in packages/ ever writes to.

### `platform-ops/versioned-change-management-with-diff-classi` — Versioned change management with diff, classification, and rollback

**Status:** `partial`

**Evidence (read 15 Aug):** Diff and classification are implemented and persisted. packages/odl/src/diff/index.ts (559 lines) produces typed change items (packages/odl/src/diff/types.ts:107-136: field/type additions, removals, modifications, enum values, link and function modifications) and classify() yields SAFE|COMPATIBLE|BREAKING (diff/types.ts:136). Versions are stored durably in _schema_registry with diff and classification columns under a pg advisory lock (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:42-134), and recorded at every boot when the canonical schema key changes (packages/api/src/schema-registry-boot.ts:64-91, wired at packages/api/src/server.ts:236-255). BREAKING can be made a boot gate via SCHEMA_BREAKING_POLICY=block.

**Gap:** Rollback does not exist as a runtime operation. `odl rollback` (packages/odl/src/cli/index.ts:257-311) only prints a reverse diff to stdout, requires the operator to supply both schemas via --old-path/--new-path, and never touches the registry — --from-version/--to-version are echoed as text labels (cli/index.ts:283-286). The SchemaRegistry interface exposes only getSchema/applySchema/getSchemaHistory/getCurrentVersion (packages/odl/src/registry/index.ts:34-105); there is no revert. The approval gate is self-defeating in the default path: recordSchemaVersion always passes `{ description: 'Recorded at server boot', approved: true }` (schema-registry-boot.ts:86-89), so under the default SCHEMA_BREAKING_POLICY=warn a breaking pack change auto-approves itself. The registry version is also decoupled from actual DDL: packages/api/src/schema-loader.ts:811 hardcodes `version: 1` on every OntologySchema, so PostgresStorageProvider.applySchema permanently re-enters the checksum-drift branch (packages/storage-postgres/src/postgres-storage-provider.ts:246-315) which reconciles additive changes only and hard-refuses destructive ones — no diff-driven migration and no data backfill.

### `platform-ops/action-side-effect-notifications-in-platform` — Action side effect: notifications (in-platform push + email with user preferences)

**Status:** `absent`

**Evidence (read 15 Aug):** packages/actions/src/sideeffects/side-effect-executor.ts:112-118 accepts exactly two side-effect types — 'webhook' and 'event' — and throws `Unknown side-effect type` for anything else; the config types (packages/actions/src/sideeffects/types.ts:14-38) define only WebhookConfig and CloudEventConfig. grep -rniE 'notification|smtp|nodemailer|sendgrid|push notif' across packages/, domain-packs/ and Orion/ produces only JSON-RPC notification handling in packages/mcp-server/src/protocol.ts:155-158 and OIDC `email` claim extraction in packages/security/src/auth/oidc-authenticator.ts:141. Manifest entries that look like notifications are plain webhooks (domain-packs/aml/actions/submit-report.yaml:34 notifyRegulatorySystem, freeze-account.yaml:28 notifyCorebanking).

**Gap:** No in-platform notification store or inbox, no email transport, no push channel, and no per-user notification preference model anywhere in the repo. A pack author can only POST a webhook and hope an external system notifies someone.

### `platform-ops/action-triggered-scheduled-builds-schedule-r` — Action-triggered scheduled builds (Schedule rule)

**Status:** `absent`

**Evidence (read 15 Aug):** No cron of any kind: grep -rli 'cron' across packages/*/src and domain-packs returns zero files. The only scheduler is SyncScheduler (packages/sync/src/scheduler/sync-scheduler.ts:1-16), a fixed-interval datasource poll loop whose intervals come from connector manifests (parseInterval, sync-scheduler.ts:38-67). It is registered only at boot from pack connector manifests (packages/api/src/sync-boot.ts:118-167) and only when SYNC_SCHEDULER_ENABLED=true (packages/api/src/server.ts:732). Actions cannot reach it: side effects are limited to webhook/event (side-effect-executor.ts:112-118), and nothing in packages/actions imports @altius/sync. There is no build/dataset-pipeline concept in the repo at all.

**Gap:** An action cannot schedule, trigger, or gate any downstream job. Even the one scheduler that exists is inert out of the box: all three shipped connectors declare `mode: OVERLAY` (domain-packs/aml/connectors/tms-jdbc.yaml:31, nhs-acute/connectors/pas-jdbc.yaml:21, supply-chain/connectors/erp-jdbc.yaml:28) and sync-boot.ts:146 skips OVERLAY, so zero datasources are ever scheduled with the shipped packs.

### `platform-ops/no-code-end-user-rule-authoring-with-proposa` — No-code end-user rule authoring with proposal/approval workflow and generated execution pipeline (Foundry Rules)

**Status:** `absent`

**Evidence (read 15 Aug):** No rule-authoring surface of any kind: grep -rli 'proposal' over packages/*/src and domain-packs returns zero files, and the repo has no UI package at all (packages/ = actions, api, cel-evaluator, engine, mcp-server, observability, odl, sdk-typescript, security, spi, storage-memory, storage-postgres, sync). The only approval-shaped construct is PolicyGuard (packages/actions/src/tools/types.ts:106-113), an interface with zero implementations in the repo; the sole production ToolRegistry construction is packages/api/src/graphql/resolver-generator.ts:1393 `new ToolRegistry({ schema, manifests })`, passing neither executor nor policyGuard, so the hold-for-approval branch at packages/actions/src/tools/tool-registry.ts:153-176 is unreachable. Schema migration plans carry an `approved` flag but boot auto-sets it (packages/api/src/schema-registry-boot.ts:86-89).

**Gap:** Everything: rules are hand-written YAML/ODL committed to a pack directory by a developer, there is no authoring UI, no draft/propose/review/approve state machine, and no pipeline generation from an end-user-authored rule.

### `platform-ops/process-monitoring-process-mining-machinery` — Process monitoring & process mining (Machinery)

**Status:** `absent`

**Evidence (read 15 Aug):** grep -rniE 'process min|process model|conformance check|bpmn|petri|case duration|bottleneck' across packages/ and docs/ yields one unrelated hit (docs/altius-spec-v2.md:503, referring to SPI conformance tests). There is no process, case, activity-log, or variant model in the ontology or the engine. The audit trail that a mining feature would consume is written (packages/security/src/audit/audit-writer.ts:52, wired at packages/api/src/server.ts:618-623) and a Postgres store can query it (packages/storage-postgres/src/audit/postgres-audit-store.ts:80), but the AuditQuery class (packages/security/src/audit/audit-query.ts:25) is exported from the barrel (packages/security/src/index.ts:33) and never instantiated anywhere outside its own tests — exported dead code.

**Gap:** Everything: no process discovery, no conformance checking against a reference model, no variant/throughput/bottleneck analytics, no cycle-time or SLA monitoring, and no API or UI to inspect a process at all.

### `platform-ops/temporal-events-and-time-series-with-thresho` — Temporal events and time-series with thresholds (Vertex events)

**Status:** `absent`

**Evidence (read 15 Aug):** None of the three named features exists. No time-series or event-series type: the complete ODL field-directive set is primary/unique/indexed/readonly/sensitive/param/link/computed/constraint/default/deprecated/terminology/searchable/immutable (packages/odl/src/parser/types.ts:23-88) — there is no @timeseries, @series or @event directive, and grep for 'timeseries|time_series|threshold' across packages/ returns zero non-test hits. No threshold or alert-on-data mechanism exists anywhere (the only alert thresholds are infra PromQL in Orion/helm/altius/templates/prometheusrule.yaml, over HTTP/storage/sync metrics, not ontology data). What does exist is ordinary per-object version history: packages/storage-postgres/src/temporal/temporal-queries.ts:75-133 (getObjectAtVersion, getObjectAtTime) with a memory equivalent at packages/storage-memory/src/memory-storage-provider.ts:980-995, surfaced only as GET /api/v1/{plural}/:id/history (packages/api/src/rest/route-generator.ts:913-990).

**Gap:** Even the adjacent temporal read path is half-dead: getObjectAtTime has no production caller — its own code comment says so (temporal-queries.ts:127) — and the /history route only loops getObjectAtVersion from 1..currentVersion (route-generator.ts:959-970), an N+1 with no as-of-time query. The SPI query options declare asOfVersion and asOfTime (packages/spi/src/ontology.ts:97-98) and nothing in the repo reads either field. There is no series storage, no windowing/downsampling, no threshold definition, and no event generated when a value crosses one.

### `platform-ops/workshop-application-ui-runtime-features-wid` — Workshop application UI runtime features (widget event system, URL routing/shareable state, module changelog & rebase)

**Status:** `absent`

**Evidence (read 15 Aug):** The repo ships no user-facing application runtime. packages/ contains only backend/compiler/SDK packages (actions, api, cel-evaluator, engine, mcp-server, observability, odl, sdk-typescript, security, spi, storage-memory, storage-postgres, sync) — sdk-typescript is a generated typed HTTP client (packages/odl/src/codegen/sdk.ts:4), not a UI. grep -rli 'workshop' over packages/*/src and domain-packs returns zero files; every 'widget' hit is a test-fixture object type (e.g. packages/api/src/__tests__/ingest-handler.test.ts:16 `type Widget @objectType`). No layout/module/changelog/rebase construct exists.

**Gap:** Nothing to grade — no widget model, no widget event bus, no URL-encoded shareable application state, no module versioning/changelog/rebase. pack.yaml even advertises `widgets: 0` (domain-packs/aml/pack.yaml:17) inside a `provides:` block the loader never reads (PackManifest, packages/api/src/schema-loader.ts:34-52).


## Analytics & time series

### `analytics-ts/object-filtering-and-full-text-search-explor` — Object filtering and full-text search exploration layer

**Status:** `partial`

**Evidence (read 15 Aug):** A real governed query surface exists on both API protocols. Filtering: packages/spi/src/ontology.ts:43-65 FilterExpression = FieldPredicate (eq/neq/gt/gte/lt/lte/in/contains/startsWith/exists) | LogicalPredicate (and/or/not), compiled to SQL at packages/storage-postgres/src/objects/filter-to-sql.ts and interpreted in memory at memory-storage-provider.ts. Aggregation: REST `POST /api/v1/{plural}/aggregate` (route-generator.ts:1018-1095) and GraphQL `{type}Aggregate` (resolver-generator.ts:1001-1070), both gating redacted fields (route-generator.ts:1063, resolver-generator.ts:1033) and constraining to consented records (route-generator.ts:1076-1095, resolver-generator.ts:1043-1057). Search: REST `GET /api/v1/{plural}/search` (route-generator.ts:1109-1222) and GraphQL `search{Type}s` (resolver-generator.ts:1088), both restricting search fields to visible ones when redaction is active (route-generator.ts:1170-1174, resolver-generator.ts:1141-1145). MCP surfaces a per-type `search_<Type>` filter tool (packages/mcp-server/src/tools.ts:97-121).

**Gap:** Not full on three counts. (1) 'Full-text' is substring matching, not FTS: packages/storage-postgres/src/objects/search.ts:96-97 wraps the whole query in `%...%` and :131 issues `col ILIKE $n` per field, with score = count of fields containing the substring (:132); DDL deliberately emits trigram GIN and not tsvector (packages/storage-postgres/src/schema/ddl-objects.ts:105-106, asserted by ddl-generation.test.ts:196 `expect(allDDL).not.toContain('to_tsvector')`). No stemming, no ranking, no phrase or boolean syntax. (2) The two providers disagree on the same SPI call: Postgres matches the query as one literal substring, while memory splits on whitespace and matches ANY term, summing occurrence counts as the score (memory-storage-provider.ts:716, :743-751) — so `search('acme corp')` returns different result sets per provider. (3) Exploration depth is capped: FieldPredicate targets a single flat field with no link-scoped or nested filters, traverse is implemented but exposed on no API surface (see row 7), aggregate groupBy takes raw columns only with no time/numeric bucketing (aggregate.ts:94-97), and packages/sdk-typescript/src/index.ts is an empty `export {}` placeholder, so every consumer hand-rolls HTTP.

### `analytics-ts/saved-and-shareable-exploration-artifacts-sa` — Saved and shareable exploration artifacts (saved analyses, saved explorations, object sets as resources)

**Status:** `partial`

**Evidence (read 15 Aug):** Object sets are real and governed. packages/spi/src/object-set.ts:12-26 defines ObjectSetDefinition (filter, orderBy, limit, aggregation, createdBy, isPublic, tenantId) and :29-36 the ObjectSetStore contract. Both providers implement it: packages/storage-postgres/src/object-sets/postgres-object-set-store.ts:64-67 (created_by, is_public columns), :221 mutation ownership check `if (!ctx.actorId || def.createdBy !== ctx.actorId) forbiddenError(...)`, :232-233 read visibility `("is_public" = TRUE OR "created_by" = $n)` and public-only when unauthenticated; packages/engine/src/object-sets/in-memory-object-set-store.ts:80-81, :112-113, :131-133 mirror the same fail-closed rules. Wired in production at packages/api/src/server.ts:710-712 and :754. REST exposes the full lifecycle plus execution: route-generator.ts:1365/1382/1414/1451/1482 (list/get/create/update/delete), :1505 `GET /object-sets/:id/execute` and :1674 `GET /object-sets/:id/aggregate`, with FGA id-scoping (:1546 resolveAllowedIds), field redaction, consent filtering (:1603-1626) and an NDJSON export branch (:1640-1650).

**Gap:** Only the object-set third of the capability exists. There are no saved analyses or saved explorations, because no exploration surface exists to produce them (rows 4, 5, 7). Sharing is a single boolean `isPublic` — owner-or-everyone; there is no per-user/per-group grant and object sets are not FGA resources themselves (the FGA check at route-generator.ts:1546 scopes the underlying objects, not the set). GraphQL is CRUD-only: resolver-generator.ts:1427-1539 registers objectSet/objectSets/create/update/delete with no execute resolver, so saved sets can only be run over REST. And ObjectSetManager.execute (packages/engine/src/object-sets/object-set-manager.ts:59) and .executeAggregate (:93) have zero production callers — grep of all objectSetManager call sites shows REST re-implements execution inline via deps.objectManager.query, so the exported manager methods are dead code.

### `analytics-ts/event-objects-and-timeline-analytics-events-` — Event objects and timeline analytics (events with start/end, badges, thresholds, time selection/scrubbing)

**Status:** `absent`

**Evidence (read 15 Aug):** No event object kind and no interval semantics in the ontology. packages/spi/src/ontology.ts:167-185 OntologySchema carries only objectTypes and linkTypes — there is no event type, and PropertyDefinition (:187-193) has no start/end or interval concept. The ODL scalar allowlist (packages/odl/src/validator/index.ts:20-24) has Date/DateTime/Duration but nothing that pairs them into an interval. The only `Event` symbol in SPI is packages/spi/src/events.ts:8 `CloudEvent<T>`, a CDC change-notification envelope re-exported at packages/spi/src/index.ts:61; packages/engine/src/events/ contains only event-bus.ts and event-emitter.ts (ObjectEventData/LinkEventData at event-emitter.ts:22/:31 — create/update/delete notifications). Nothing computes overlaps, durations, or timeline occupancy.

**Gap:** Both halves missing: no first-class event/interval object kind in ODL+SPI+storage, and no timeline query surface (no time-window selection in QueryOptions at ontology.ts:92-99, no interval predicates in FilterExpression at :45-59, whose operators are eq/neq/gt/gte/lt/lte/in/contains/startsWith/exists on a single flat field).

### `analytics-ts/exploratory-analysis-workbench-quiver-canvas` — Exploratory analysis workbench (Quiver canvas/graph mode, Workshop Free-form Analysis widget)

**Status:** `absent`

**Evidence (read 15 Aug):** Same zero-UI finding: no .tsx files anywhere in the repo, no view/charting dependency in any package.json. packages/sdk-typescript/src/index.ts is 7 lines and its body is literally `export {};` with the comment 'This package will be populated by the SDK generator' — even the programmatic client an analysis surface would build on is an empty placeholder. The query surface that exists is server-side only: REST routes at packages/api/src/rest/route-generator.ts and GraphQL resolvers at packages/api/src/graphql/resolver-generator.ts.

**Gap:** No canvas, no free-form analysis artifact, no notebook. The headless query substrate (list/filter/aggregate/search) exists but there is nothing an analyst drives it from without writing their own client.

### `analytics-ts/interactive-graph-visualization-and-explorat` — Interactive graph visualization and exploration (Vertex): styling, histogram filtering, templates, URL-generated graphs, embedding

**Status:** `absent`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** There is no visualization layer of any kind: `find packages -name '*.tsx' -o -name '*.html'` (excluding node_modules) returns nothing, and no package.json in packages/* depends on react, d3, cytoscape, vis-network or sigma. packages/ contains only actions, api, cel-evaluator, engine, mcp-server, observability, odl, sdk-typescript, security, spi, storage-memory, storage-postgres, sync — no web/ui/frontend/workshop package exists. What did change is the prerequisite: multi-hop traversal is now reachable outside the test harness. packages/api/src/rest/traverse-route.ts (281 lines, committed) exposes POST search-around with per-node mixed-type authz, redaction and consent (AUTHZ_CONCURRENCY=16, MAX_STEPS=10) and is registered in packages/api/src/server.ts:1108 via generateTraverseRoutes. GraphQL `traverse<Type>(startId, steps, limit): TraversalResult!` (packages/api/src/graphql/resolver-generator.ts:2054-2117, SDL emitted at packages/odl/src/codegen/index.ts:869-924) and the MCP traverse tool (packages/mcp-server/src/tools.ts:443,482) exist only as uncommitted working-tree changes (git diff --stat), and the MCP tool calls deps.storage.traverse directly (tools.ts:531) rather than LinkManager.

**Gap:** Everything the row names is unimplemented: no rendering surface, no styling rules, no histogram filtering, no saved templates, no URL-generated graphs, no embedding. Traversal is now an API primitive (REST committed; GraphQL/MCP still uncommitted), which removes the prerequisite excuse but adds nothing to the capability itself.

### `analytics-ts/interactive-time-series-analysis-workbench-w` — Interactive time series analysis workbench (Workshop Time Series Analysis widget / Quiver TS workflows)

**Status:** `absent`

**Evidence (read 15 Aug):** There is no UI layer of any kind in the repo: `find . -name '*.tsx' -not -path '*/node_modules/*' -not -path '*/.claude/*'` returns zero files, and grep for `"react"|"vue"|d3|echarts|plotly` across the root package.json and all packages/*/package.json returns nothing. Grep for `Quiver` (case-insensitive) across the repo hits only the prior audit's prose in AGENT.md and docs/audit/*.html. The would-be backing datatype also does not exist (see row 1).

**Gap:** No frontend package exists and no series backend exists to drive one. Both halves are greenfield.

### `analytics-ts/process-modeling-and-process-mining-machiner` — Process modeling and process mining (Machinery)

**Status:** `absent`

**Evidence (read 15 Aug):** Nothing exists. Case-insensitive grep for `bpmn|process model|process mining|petri|state machine|workflow` across packages/**/*.ts (excluding dist/node_modules) returns exactly one hit — packages/actions/src/tools/types.ts:126, a comment on an action approval hold ID. Grep for `Machinery` repo-wide hits only the prior audit's prose in AGENT.md and docs/audit/*.html. There is no process definition model, no conformance-checking code, no variant/bottleneck analysis, and no event log abstraction to mine (see row 8).

**Gap:** Entire capability greenfield, and it is gated on prerequisites that are themselves absent: event objects with intervals (row 8) and a case/trace abstraction. Nothing in the repo is a partial step toward it.

### `analytics-ts/time-series-properties-first-class-timestamp` — Time series properties (first-class timestamped-value history on ontology objects)

**Status:** `absent`

**Evidence (read 15 Aug):** No TS property kind exists. ODL's scalar allowlist is packages/odl/src/validator/index.ts:20-24 — `BUILTIN_SCALARS = {ID, String, Int, Float, Boolean, Date, DateTime, Duration, GeoPoint, JSON, URI}`; no TimeSeries/Series entry. packages/spi/src/scalars.ts (9 lines total) defines only DateTime and Duration aliases. packages/spi/src/ontology.ts:187-193 PropertyDefinition is `{name, type: string, required, defaultValue, description}` — no series metadata. Repo-wide grep for `timeseries|time_series|time-series` across *.ts/*.go/*.sql/*.yaml returns zero hits outside the prior audit's own prose in AGENT.md and docs/audit/*.html. Grep for `series|downsample|resample|rollup` in packages/**/*.ts hits only rate-limiter `buckets` and odl/diff `bucket` — unrelated. The nearest neighbour is whole-object version history: packages/storage-postgres/src/temporal/temporal-queries.ts:75 getObjectAtVersion / :102 getObjectAtTime against `<type>_history` tables, surfaced at packages/api/src/rest/route-generator.ts:923 `GET /api/v1/{plural}/:id/history`, which loops `for (let v = 1; v <= currentVersion; v++)` (route-generator.ts:960-968) issuing one query per version, with no time-range filter and no pagination. temporal-queries.ts:127 carries the comment that getObjectAtTime "has no production caller" — and grep confirms no `asOfTime`/`asOfVersion` anywhere in packages/api/src, so the as-of read path is unreachable from REST/GraphQL.

**Gap:** The property kind does not exist in ODL, SPI, or either storage provider — greenfield across three packages. There is no series ingestion path, no per-series query API, no interpolation/resampling, and no time-range read. The only workaround is modelling readings as a separate object type, but aggregate groupBy maps to a raw column (packages/storage-postgres/src/objects/aggregate.ts:94-97 `groupCols = query.groupBy.map(f => fieldCol(f))`) with no date_trunc/bucketing, so even an hourly average requires a precomputed bucket column written by the user.

### `analytics-ts/time-series-rules-interval-detection-and-ale` — Time series rules / interval detection and alerting (Foundry Rules TS boards, TS alerting automations)

**Status:** `absent`

**Evidence (read 15 Aug):** No rules engine and no interval detection. Grep for `rule|alert|threshold` across packages/engine/src and packages/actions/src (non-test) matches only packages/actions/src/executor/action-executor.ts and packages/actions/src/cel/{types,client}.ts — CEL precondition evaluation for actions, evaluated per action invocation, not standing rules over a signal. packages/engine/src/events/ holds only event-bus.ts and event-emitter.ts; packages/spi/src/events.ts:8 `CloudEvent<T>` is a CDC change envelope, not a detected interval. The only scheduler in the repo is packages/sync/src/scheduler/sync-scheduler.ts, which drives sync connector runs — grep shows no rule/threshold evaluation attached to it.

**Gap:** No standing-rule definition model, no interval/anomaly detector, no alert artifact, no binding from a detection to an action. Depends on rows 1 and 2 existing first.

### `analytics-ts/time-series-transform-and-summarizer-engine` — Time series transform and summarizer engine

**Status:** `absent`

**Evidence (read 15 Aug):** No transform or summarizer surface exists for series data. The entire aggregation vocabulary is packages/spi/src/ontology.ts:251 `AggregateFunction = 'count'|'sum'|'avg'|'min'|'max'`, enforced by an identical allowlist in both providers (packages/storage-postgres/src/objects/aggregate.ts:56 `ALLOWED_FNS`, packages/storage-memory/src/memory-storage-provider.ts:589). No window functions, no rolling/lag/lead, no interpolation, no unit conversion, no series arithmetic anywhere: grep for `downsample|resample|rollup|window function` in packages/**/*.ts returns nothing relevant. packages/engine/src/functions/ contains only function-executor.ts and isolated-node-runtime.ts (generic user-function execution), not a series transform library.

**Gap:** Whole subsystem missing. Would need a series datatype first (see row 1), then a transform DAG/expression layer and a summarizer over it. Existing aggregate is per-row SQL GROUP BY with five functions and no time bucketing.


## Scenarios & simulation

### `scenarios-sim/business-logic-as-ontology-bound-functions-f` — Business logic as ontology-bound functions (Functions on models published as function-backed Actions, the recommended scenario logic path)

**Status:** `partial`

**Evidence (read 15 Aug):** The Function half is real and production-wired: packages/odl/src/parser/types.ts:219-232 defines FunctionType (runtime, entry); packages/odl/src/parser/index.ts:124-131 routes `@function` types into schema.functionTypes; packages/engine/src/functions/function-executor.ts:190-250 implements FunctionExecutor with pluggable runtimes plus node and cel adapters and packages/engine/src/functions/isolated-node-runtime.ts; packages/api/src/server.ts:319-323 constructs it in the real boot path and :755 passes it into the GraphQL deps; packages/odl/src/codegen/index.ts:803-806 emits a `${lowerFirst(name)}Function` mutation per FunctionType and packages/api/src/graphql/resolver-generator.ts:1307-1350 backs it with a real resolver. Now the demoting facts. (1) Function-backed Actions do NOT exist: packages/odl/src/parser/index.ts:118-126 routes any type carrying `@actionType` to extractActionType and returns before the `@function` directive is ever inspected, ActionType (packages/odl/src/parser/types.ts:200-208) carries no runtime/entry field, and packages/actions/src/executor/action-executor.ts contains no function dispatch at all (grep for FunctionType/functionExecutor there returns zero hits) — the source comment at parser/index.ts:124-126 calling this "function-backed action for back-compat" describes behaviour that is not implemented. (2) No authorization: packages/api/src/graphql/resolver-generator.ts:1301-1305 states "Per-function authorization ... is a future concern ... for now any authenticated user may invoke any declared function." (3) GraphQL only — no REST route (packages/api/src/rest/route-generator.ts has no function handling) and no MCP tool (packages/mcp-server/src/tools.ts has none). (4) Not actually exercised: grep for `@function` across domain-packs/**/*.odl returns nothing, no pack ships a function entry module, and every pack.yaml declares `functions: 0` (e.g. domain-packs/aml/pack.yaml:14).

**Gap:** Functions cannot be published as Actions — the ActionExecutor has no function path, so the transactional/permissioned Action pipeline is unreachable from function logic. Functions have no per-function permissioning (any authenticated caller can invoke any function), are GraphQL-only, are not bound to object sets or object instances beyond scalar inputs, and no shipped pack uses one.

### `scenarios-sim/packaging-and-distribution-of-reusable-artif` — Packaging and distribution of reusable artifacts (Vertex graph templates in Marketplace products via DevOps)

**Status:** `partial`

**Evidence (read 15 Aug):** Packaging is real. domain-packs/aml/pack.yaml:1-42 shows the format — name, version, namespace, `dependencies: {altius.core: ">=1.0.0"}`, and explicit schema/actions/connectors/permissions file lists. packages/api/src/schema-loader.ts:832-900 implements loadDomainPacks: it discovers packs from a primary dir plus extra dirs (:838-861, external packs logged at :857), forces `core` first (:876-880), and reads each pack.yaml (:895-900). Dependency constraints are genuinely enforced — compareSemver at :467, satisfiesConstraint at :486-493, and the validation loop at :497-520 that errors with "Pack 'X' requires 'Y' >=Z but loaded version is W". Distribution is what is missing. There is no registry, publish, or install path: the ODL CLI (packages/odl/src/cli/index.ts:56-258) offers only validate, diff, apply, generate graphql, generate openfga, and rollback. Packs are located purely by filesystem discovery, so shipping one means mounting a directory (Orion/empty-packs/.keep exists for exactly that). The manifest's `provides:` block (domain-packs/aml/pack.yaml:10-17, including `widgets: 0` and `functions: 0`) is read by nothing — grep for `provides` in packages/api/src/schema-loader.ts returns zero hits. And there is no graph-template artifact to package: grep for marketplace/Marketplace/workshop across the repo returns nothing.

**Gap:** No distribution channel — no registry, no publish/install command, no signed or versioned artifact transport; packs must be placed on the filesystem by hand or by mount. The `provides` metadata block is decorative (unread by the loader). Graph templates and any Marketplace-product concept do not exist as artifact kinds.

### `scenarios-sim/scenario-staging-and-transactional-apply-hol` — Scenario staging and transactional apply (hold a set of Actions un-applied, then apply all-or-nothing to the Ontology, gated by an apply-Action's permissions)

**Status:** `partial`

**Evidence (read 15 Aug):** The single-Action half is real and wired: packages/actions/src/executor/action-executor.ts:200 calls `security.checkPermission` before mutating, then :327 `beginTransaction`, :342 `commit`, :344 `rollback`, backed by the SPI contract in packages/spi/src/transaction.ts:11-20 ("A single Action execution maps to a single transaction"). The staging half does not exist: grep for staged/pending/draft/deferred-apply across packages/actions/src and packages/engine/src returns only an unrelated comment at packages/engine/src/functions/isolated-node-runtime.ts:92. The multi-Action all-or-nothing surface is generated-but-dead SDL: packages/odl/src/codegen/index.ts:478-484 emits `input BulkActionInput { actionType, items, idempotencyKey, allOrNothing, dryRun }` and :486-521 emits BulkJobStatus/BulkProgress/BulkSummary/BulkActionJob, but the mutation-field list at :798-815 never references them (only per-action mutations, function mutations, object-set CRUD, grant/revokeRelationship, recordConsent) and grep for bulkAction/BulkActionInput across packages/api/src/graphql and packages/api/src/rest returns nothing — no resolver, no route. The SPI `bulkMutate` (packages/spi/src/storage-provider.ts:19-20, implemented at packages/storage-postgres/src/postgres-storage-provider.ts:412 and packages/storage-memory/src/memory-storage-provider.ts:789) has zero production callers — every reference outside the two providers is a test. Manifest undo is likewise parsed but dead: packages/actions/src/parser/types.ts:109-138 defines UndoConfig/undoEffect/reversible and packages/actions/src/parser/index.ts:87-102 parses them, but grep for `.undo`/`undoEffect`/`reversible` across packages/actions/src/executor, packages/api/src and packages/mcp-server/src matches only test fixtures — the executor never reads them (its only rollback path is the side-effect compensating transaction at action-executor.ts:374-425).

**Gap:** No staging: Actions cannot be held un-applied and there is no scenario/edit-set container. Atomicity is per-Action only — the bulk/all-or-nothing GraphQL types are dead SDL with no resolver, and the SPI bulkMutate they would sit on is unreachable from the API. Declared `reversible`/`undo` manifest config is never executed.

### `scenarios-sim/chained-model-orchestration-auto-propagate-o` — Chained model orchestration (auto-propagate one model's outputs as the next model's inputs across a multi-model case study)

**Status:** `absent`

**Evidence (read 15 Aug):** Depends on capabilities 4 and 5, both of which are absent (see their evidence — no model, adapter, or inference construct exists anywhere in packages/, domain-packs/, or Orion/). The only chaining machinery in the repo is per-object computed-field dispatch: packages/engine/src/computed/computed-field-evaluator.ts:269 dispatches a `@computed` field's `fn` to the FunctionExecutor when the name matches a declared FunctionType. That resolves one field on one object read; there is no multi-step graph, no output→input wiring between units, and no case-study container.

**Gap:** Entirely missing. There are no models to chain and no orchestration/DAG primitive that would propagate outputs to the next step.

### `scenarios-sim/ml-model-asset-registry-and-lifecycle-model-` — ML model asset registry and lifecycle (model artifacts + adapters, version history, permissioning, lineage, Modeling Objectives review/release)

**Status:** `absent`

**Evidence (read 15 Aug):** No ML surface of any kind. Case-insensitive grep for predict/train/onnx/sagemaker/mlflow/embedding across packages/, Orion/ and domain-packs/ returns only three false positives: packages/api/src/graphql/resolver-generator.ts:1382 and :1399 ("library/agent embeddings" of the tool registry) and packages/engine/src/links/uuidv7.ts:35 ("unpredictable IDs"). Grep for modelAsset / ModelObjective / modeling / ml_model returns nothing. The word `model` in non-schema source appears only as "error model" (packages/spi/src/errors.ts:2, packages/spi/src/index.ts:12) and as an LLM model name string on the agent tool descriptor (packages/actions/src/tools/types.ts:77,90). The Postgres DDL creates only audit.audit_records, consent.consent_records, consent.opt_outs, lineage.field_provenance, and per-ObjectType tables plus their `_history` twins (packages/storage-postgres/src/schema/ddl-audit.ts, ddl-consent.ts, ddl-lineage.ts, ddl-objects.ts) — no model, artifact, or objective table. Lineage exists but is field provenance for synced/computed values (packages/engine/src/lineage/lineage-recorder.ts), not model lineage.

**Gap:** Entirely missing: no model artifact storage, no adapters, no model versioning, no model-scoped permissions, no Modeling Objective review/release workflow.

### `scenarios-sim/model-inference-execution-no-code-live-deplo` — Model inference execution (no-code live deployments, batch inference, inference history)

**Status:** `absent`

**Evidence (read 15 Aug):** The only occurrence of the substring "inference" in the entire repo is inside packages/api/src/fhir/router.ts, where it is the ordinary English word, not a feature. There is no inference route in packages/api/src/rest/route-generator.ts (its only `Function`-ish hits at :20 and :1072 are the aggregate `AggregateFunction` enum), no inference mutation in the generated SDL (mutation list at packages/odl/src/codegen/index.ts:798-815), and no inference tool in packages/mcp-server/src/tools.ts (grep for Function/functionTypes there returns nothing). No deployment, serving, batch-scoring or inference-history construct exists in packages/engine/src or packages/spi/src.

**Gap:** Entirely missing: no live deployment, no batch inference job, no inference history/audit of predictions.

### `scenarios-sim/scenario-and-graph-ui-tooling-vertex-canvas-` — Scenario and graph UI tooling (Vertex canvas, scenario pane, Workshop scenario widgets/variables/buttons, Control Panel admin settings)

**Status:** `absent`

**Evidence (read 15 Aug):** There is no user interface in this repository at all. No package.json under packages/, domain-packs/ or tools/ depends on react, vue or svelte (grep -rl over --include=package.json returns nothing), and the package list is entirely backend: actions, api, cel-evaluator, engine, mcp-server, observability, odl, sdk-typescript, security, spi, storage-memory, storage-postgres, sync. Grep for workshop/Workshop/marketplace/Marketplace across all source returns zero hits; the only vertex/Vertex hits are the graph vertex table in packages/storage-postgres/src/objects/object-crud.ts. Pack manifests advertise a widget count — domain-packs/aml/pack.yaml:16 `widgets: 0` — but the loader never reads it: grep for `widgets` in packages/api/src/schema-loader.ts returns nothing, so the field is decorative. Orion/ is deployment only (docker-compose.yaml, helm/altius/templates/* for api-gateway, ontology-engine, action-executor, sync-engine, security-service, cel-evaluator) with no UI service.

**Gap:** Entirely missing: no canvas, no scenario pane, no widget/variable/button model, no admin Control Panel. The `widgets` key in pack.yaml is unparsed decoration.

### `scenarios-sim/scenario-persistence-and-sharing-as-ontology` — Scenario persistence and sharing as Ontology objects (scenario trait, typeclasses, save/load via Actions and object sets)

**Status:** `absent`

**Evidence (read 15 Aug):** No scenario trait or typeclass exists. ODL supports interfaces (packages/odl/src/parser/types.ts:248 InterfaceDefinition) but nothing named scenario anywhere in the repo — see the scenario grep evidence above (only two test files, both prose). The adjacent primitive that does exist is saved object sets: packages/spi/src/object-set.ts:12-26 defines ObjectSetDefinition (name, objectType, filter, orderBy, aggregation, createdBy, `isPublic`, tenantId) with a full ObjectSetStore CRUD contract at :29-36, exposed as GraphQL mutations createObjectSet/updateObjectSet/deleteObjectSet (packages/odl/src/codegen/index.ts:808-810, resolvers at packages/api/src/graphql/resolver-generator.ts:1470-1490) and persisted in packages/storage-postgres/src/object-sets/postgres-object-set-store.ts. But an ObjectSet is a saved query definition, not a scenario: it holds no overrides, no held Actions, and no baseline reference.

**Gap:** There is no scenario object type, no scenario trait/typeclass, and no save/load Actions for one. Saved+shareable object sets exist but persist a filter, not a what-if state, so they cannot stand in for scenario persistence.

### `scenarios-sim/time-series-as-simulation-inputs-outputs-tim` — Time series as simulation inputs/outputs (time window selection, smoothing, live polling, historic vs predicted comparison)

**Status:** `absent`

**Evidence (read 15 Aug):** No time-series type exists: packages/spi/src/scalars.ts declares only `DateTime` (:6) and `Duration` (:9), and grep for timeseries / time_series / TimeSeries / timeSeries across packages/, domain-packs/, Orion/ and tools/ returns zero hits. What exists is bitemporal object history, and even that is largely unreachable. packages/spi/src/ontology.ts:97-98 declares `QueryOptions.asOfVersion` and `asOfTime` — and a repo-wide grep shows those two identifiers appear at exactly those two lines and nowhere else, so both are config read by nothing. `getObjectAtTime` (packages/spi/src/storage-provider.ts:63) is implemented in both providers (packages/storage-postgres/src/postgres-storage-provider.ts:537 → packages/storage-postgres/src/temporal/temporal-queries.ts:102; packages/storage-memory/src/memory-storage-provider.ts:988) but has no production caller — the repo says so itself at packages/storage-postgres/src/temporal/temporal-queries.ts:127 ("getObjectAtTime has no production caller to have exercised it"). Only `getObjectAtVersion` reaches an API surface, via one REST route at packages/api/src/rest/route-generator.ts:962. There is no windowing, no smoothing/resampling, and no predicted-vs-actual anywhere. GraphQL subscriptions do exist (packages/api/src/subscriptions/subscription-manager.ts:179 SubscriptionManager, :270/:319 filtered subscription helpers) but they stream object change events, not time-series points.

**Gap:** No time-series data type, no window/interval selection, no smoothing or aggregation over time, no polling of a series, and no historic-vs-predicted comparison. Point-in-time object history is implemented in storage but dead: asOfTime/asOfVersion query options are unused and getObjectAtTime has no caller; only as-of-version single-object reads are exposed.

### `scenarios-sim/what-if-scenario-simulation-create-scenario-` — What-if scenario simulation (create scenario, override model inputs, run, compare against auto-run baseline)

**Status:** `absent`

**Evidence (read 15 Aug):** Searched the whole repo for a scenario primitive and found none. `grep -ril scenario` over packages/ domain-packs/ Orion/ tools/ factory/ (excluding node_modules and dist) returns exactly two source files, both of which use the word only in test prose: packages/security/src/consent/consent-service.test.ts and packages/api/src/__tests__/fhir.test.ts. The ODL type system has no scenario kind — packages/odl/src/parser/types.ts declares only ObjectType (:176), LinkType (:187), ActionType (:200), FunctionType (:219), EnumDefinition (:239), InterfaceDefinition (:248), ScalarDefinition (:257), and the parser router packages/odl/src/parser/index.ts:109-135 dispatches only to those. No override, baseline, or comparison concept exists in packages/spi/src/ontology.ts (interfaces at :12-296) or packages/engine/src. The nearest thing is validation-only "dry run" in packages/actions/src/tools/tool-registry.ts:316-366, and packages/api/src/graphql/resolver-generator.ts:1397-1400 explicitly disables even that on the HTTP surface (`dryRunSupported: false` with the comment "The HTTP surface accepts no dryRun flag (REST/GraphQL action routes)").

**Gap:** Everything. There is no scenario object, no input-override layer, no simulated-run execution, and no baseline/compare. A user cannot create a what-if branch of the ontology at all.


## Ontology core

### `ontology-core/derived-properties-query-time-values-compute` — Derived properties (query-time values computed from linked objects)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Computed values now reach list and search on the main surfaces. ObjectManager.query merges them at packages/engine/src/objects/object-manager.ts:349 and search at :387, both via withComputed (:415-433, bounded waves, no truncation); the evaluator is constructed and injected in production at packages/api/src/server.ts:367,392. Values survive to the wire because objectToRest (packages/api/src/rest/route-generator.ts:72-83) and objectToGraphQL (packages/api/src/graphql/resolver-generator.ts:219-230) copy every declared field, and @computed fields are declared fields. Export NDJSON, CDM and FHIR inherit it through objectManager.query (packages/api/src/cdm/router.ts:261, fhir/router.ts:227). Demoters found today: (1) aggregate is still a raw pass-through — object-manager.ts:357-367 calls storage.aggregateObjects with no computed step, so no derived value can be counted, summed or grouped on; (2) filtering/sorting is refused by construction — packages/api/src/rest/route-generator.ts:137-140 queryableFields excludes link and @computed fields, and packages/odl/src/codegen/index.ts:83-86 getScalarFields excludes them from generated GraphQL filter inputs; (3) surface asymmetry — CSV export drops computed columns (route-generator.ts:692 filters `d.kind === 'computed'`) while NDJSON from the same route keeps them, and the MCP search tool bypasses ObjectManager entirely (packages/mcp-server/src/tools.ts:331 `deps.storage.queryObjects`), so no MCP client ever sees a derived property; (4) no caching and N+1 persists — computed-field-evaluator.ts:1-11 states LAZY-only with recompute on every read, evaluateAll (:322-339) loops fields sequentially with at least one storage round trip each, and aggregateLinks fetches every linked object per row; (5) config parsed and read by nothing: `cache: EAGER|TTL` is parsed (packages/odl/src/parser/index.ts:330) but getComputedFields keeps only `!cache || cache === 'LAZY'` (computed-field-evaluator.ts:314), so an EAGER-declared property silently never resolves, with no validation error. All three shipped packs use the LAZY countLinks form (domain-packs/{aml/schema/case.odl:18, supply-chain/schema/facility.odl:16, nhs-acute/schema/ward.odl:12}).

**Gap:** Derived values still cannot be filtered, sorted, aggregated, or seen over MCP; CSV export omits them; nothing is cached (per-row, per-field storage round trips, N+1 inside the link aggregates); EAGER/TTL cache strategies are parsed and then silently discarded, making the field disappear; lookupField still reads only the first linked object (no multi-value lookup).

### `ontology-core/functions-user-authored-code-logic-on-object` — Functions: user-authored code logic on objects (FOO, function-backed actions, custom aggregations)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** The four landed pieces are real and wired. One chokepoint, packages/api/src/functions/invoke-function.ts, is called by both transports — GraphQL at packages/api/src/graphql/resolver-generator.ts:1464 and REST via generateFunctionRoute (packages/api/src/rest/route-generator.ts:410). Authorization is fail-closed role matching (invoke-function.ts:365-388: empty requiredRoles ⇒ denied); audit writes success/denied/error records best-effort (:48-68); ontology access is host-performed under the caller's identity with FGA check + field redaction + consent per object (readOne :84-130), plus queryObjects with batch redaction and consent-drop (:250-280), getLinkedObjects, and applyAction routed through ActionExecutor with consent-subject derivation and _expectedVersion (:282-330). Sandbox: server.ts:346-357 constructs FunctionExecutor with IsolatedNodeFunctionRuntime — fork with `env: {}`, --max-old-space-size, wall-clock SIGKILL (packages/engine/src/functions/isolated-node-runtime.ts:1-80), and the child bridges ontology calls back over IPC (packages/engine/function-worker.js:16,66,109). Demoters found today: (1) function-backed actions do not exist — the ActionEffect union (packages/actions/src/parser/types.ts:82-88) is updateObject|createLink|deleteLink|createObject|deleteObject|recordConsent, with no function effect; only function→action exists, never action→function; (2) custom aggregations do not exist — AggregateFunction is the closed enum 'count'|'sum'|'avg'|'min'|'max' (packages/spi/src/ontology.ts:280) and nothing registers a user-authored one; (3) functions are absent from MCP — buildToolList emits action, search and traverse tools only (packages/mcp-server/src/tools.ts:46,67,96,443); (4) a runtime-name trap: production registers the isolated runtime under the name 'node' and `runtimes` REPLACES the defaults (server.ts:353-356; function-executor.ts:278-280), while the repo's own function fixture declares runtime: "node-isolated" (packages/api/src/__tests__/fixtures/packs/demofn/schema/demofn.odl) and the sole end-to-end test registers it under that name (packages/api/src/__tests__/function-pack-end-to-end.test.ts:60,73) — so the production registration is never exercised end to end, and the validator accepts any runtime string (packages/odl/src/validator/index.ts:577-588), leaving the mismatch to surface only at invoke time as 'no runtime registered for "node-isolated"' (function-executor.ts:328-331); (5) zero shipped domain pack declares @function — grep over domain-packs/**/*.odl returns only @computed lines.

**Gap:** Function-backed actions and user-defined aggregations remain entirely absent, and functions are unreachable over MCP. The isolated runtime is process-level isolation only (its own header: not a security sandbox — the child can still open sockets and read files), production registers it under a different name than the repo's only function fixture and only e2e test use, and no shipped pack declares a function, so the whole chain is unexercised in any real pack.

### `ontology-core/graph-exploration-and-search-around-multi-ho` — Graph exploration and Search Around (multi-hop link traversal with filters)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Re-verified 15 Aug. The prior gap's central claim — 'implemented in the engine/SPI and dead-ends there' — is now false. Multi-hop traversal with per-step filters is reachable on REST, GraphQL and MCP (see `storage-conformance/graph-traversal-query-primitive` for the full file:line evidence), each authorizing MIXED-type nodes against their own type and withholding orphan edges, the provider's node count, and the neighbourhood of an unreadable start object.

**Gap:** None blocking for multi-hop filtered traversal. No variable-length paths (`maxDepth` refused on both providers), and no result-as-object-set composition.

### `ontology-core/foundry-rules-end-user-rule-authoring-with-p` — Foundry Rules (end-user rule authoring with proposal/approval change management)

**Status:** `absent`

**Evidence (read 15 Aug):** No rule entity, authoring surface, or approval workflow exists. Grep for `rule`/`rules` across packages/actions/src, packages/api/src/governance and domain-packs yields only code comments (packages/actions/src/executor/action-executor.ts:67, :494) and domain-packs/nhs-acute/permissions/field-permissions.yaml:3, a developer-edited static YAML of role→field visibility with no authoring API and no approval state. The only user-authorable logic artifacts are ODL @constraint CEL expressions (packages/odl/src/parser/types.ts:61-64, :139-142) and action-manifest preconditions/effects (packages/actions/src/parser/types.ts:85-136) — both committed as source, deployed by developers. There is no proposal/approval machinery anywhere: the schema registry's only approval token is a caller-set boolean (packages/odl/src/registry/types.ts:30-35), and its Postgres table has no proposal or status column (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:42-51).

**Gap:** Everything: no rule model, no end-user authoring endpoint or UI-facing API, no versioned rule store, no propose/review/approve/publish lifecycle.

### `ontology-core/geospatial-and-geotime-geo-property-types-ge` — Geospatial and geotime (geo property types, geo queries, time series)

**Status:** `absent`

**Evidence (read 15 Aug):** GeoPoint exists as a name and nothing else. It is declared as a custom scalar (packages/odl/src/validator/index.ts:23, packages/odl/src/codegen/index.ts:29,:37), typed `{lat:number; lng:number}` in the generated SDK (packages/odl/src/codegen/sdk.ts:33), and stored as an opaque JSONB column (packages/storage-postgres/src/schema/type-mapping.ts:25) — with no PostGIS extension or geometry/geography column anywhere in packages/storage-postgres/src/schema/. Runtime validation is `GeoPoint: (v) => typeof v === 'object' && v !== null` at packages/engine/src/objects/validation.ts:81, so `{}`, `[1,2]` or any object passes — lat/lng are never checked. No geo query operator exists: FieldPredicate.operator at packages/spi/src/ontology.ts:45-60 is the closed set eq/neq/gt/gte/lt/lte/in/contains/startsWith/exists (no within/near/bbox/intersects), and both providers self-report supportsGeoQueries: false (packages/storage-postgres/src/postgres-storage-provider.ts:658, packages/storage-memory/src/memory-storage-provider.ts:1036, asserted at packages/storage-postgres/src/__tests__/provider-lifecycle.integration.test.ts:141). Grep for timeseries/time_series/timeSeries across packages and domain-packs returns zero hits; packages/storage-postgres/src/temporal/temporal-queries.ts is object version history (as-of-version / as-of-time), not a time-series property type.

**Gap:** GeoPoint is functionally an alias for an unvalidated JSON blob: no coordinate validation, no spatial index, no geo predicates or distance/containment queries, no geohashing, no geotime tracks, and no time-series property type or series API at all.

### `ontology-core/media-and-attachment-properties` — Media and attachment properties

**Status:** `absent`

**Evidence (read 15 Aug):** The complete custom-scalar set is Date, DateTime, Duration, GeoPoint, JSON, URI — packages/odl/src/validator/index.ts:23 and CUSTOM_SCALARS at packages/odl/src/codegen/index.ts:37 (asserted in packages/odl/src/__tests__/parser.test.ts:613 and domain-packs/core/src/__tests__/core-pack.test.ts:43). No Attachment, MediaReference, MediaSet, File, or Blob type exists in the AST, SDK type map (packages/odl/src/codegen/sdk.ts), or Postgres mapping (packages/storage-postgres/src/schema/type-mapping.ts:5-33 — no BYTEA/large-object entry). Searched all of packages/, domain-packs/, Orion/ for multer, multipart, s3, blob, upload, presigned: the only hits are `Content-Disposition: attachment` on CSV/NDJSON export responses (packages/api/src/rest/route-generator.ts:516,:528,:1647; packages/api/src/cdm/router.ts:344,:356) — download headers, not media properties.

**Gap:** No media property type, no upload/download endpoints, no blob storage backend or SPI method, no thumbnail/preview/metadata handling. A user can only store a `URI` string pointing outside the platform.

### `ontology-core/ontology-branching-proposals-and-review-merg` — Ontology branching, proposals, and review/merge workflow

**Status:** `absent`

**Evidence (read 15 Aug):** The registry contract at packages/odl/src/registry/types.ts:48-76 is single-track: getSchema(version?), applySchema, getSchemaHistory, getCurrentVersion; SchemaVersion at :14-25 is keyed by a monotonic integer with no branch/parent field. MigrationPlan at :30-35 is just `{description: string, approved: boolean}` — a flag the caller sets itself, with no proposal record, reviewer identity, or state machine. The Postgres table created at packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:42-51 is `_schema_registry(version PK, schema, applied_at, diff, classification)` — no branch, proposal, author, or status column. RequestContext at packages/spi/src/ontology.ts:106-110 is {tenantId, actorId?, traceId?}, so no read or write can even be addressed to a branch. Grep for `branch`/`proposal` across odl/spi/engine/api/storage-postgres src returns only unrelated `merge*` helpers (mergeOpenFGAOverrides, mergeSchemas, mergeProperties).

**Gap:** Everything: no branch namespace, no proposal entity, no review/approve transitions, no merge/conflict logic, and no branch dimension in the storage or request context.

### `ontology-core/property-type-display-metadata-icons-statuse` — Property/type display metadata (icons, statuses, visibility, groups, value & conditional formatting, render hints, type classes)

**Status:** `absent`

**Evidence (read 15 Aug):** The complete ODL directive vocabulary is the FieldDirective union at packages/odl/src/parser/types.ts:91-105 (primary, unique, indexed, readonly, immutable, sensitive, param, link, computed, constraint, default, deprecated, terminology, searchable) and the TypeDirective union at :144-150 (objectType, linkType, actionType, function, deprecated, constraint). The parser switches at packages/odl/src/parser/index.ts:298-353 and :360-395 have no other cases and no default branch, so any `@display`/`@icon`/`@format` a user writes is silently dropped. SDL emission generateObjectType at packages/odl/src/codegen/index.ts:119-134 writes only `name: Type` per field plus `_redactedFields`/`_consentRestricted` — no metadata block. Searched odl/spi/engine/api/domain-packs for icon, displayName, renderHint, valueFormat, conditionalFormat, typeClass, titleProperty, statusProperty, propertyGroup: zero hits (the only 'visibility' hits are object-set public/private at packages/engine/src/object-sets/in-memory-object-set-store.ts:126 and a role→field YAML at domain-packs/nhs-acute/permissions/field-permissions.yaml:3).

**Gap:** No display metadata exists at any layer — not in the ODL AST, not in generated SDL, not in any runtime API. Nothing to demote from; the whole capability would have to be built (directive → AST → registry → a metadata read endpoint).

### `ontology-core/structs-shared-properties-and-property-reduc` — Structs, shared properties, and property reducers

**Status:** `absent`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Nothing named struct, reducer, or shared property exists in the ODL surface: grep -E 'struct|reducer|sharedProperty' over packages/odl/src (excluding tests) matches only prose ('structured ParsedSchema', 'Reconstruct the DSL', 'structuredClone') — no type, no parser branch, no directive. The only related kind is `kind: 'interface'` (packages/odl/src/parser/types.ts:267). 44f5951 (interfaces-polymorphic) added one Query field per implemented interface that delegates to each implementor's existing plural resolver — a polymorphic query surface, not property reuse. Interfaces still require redeclaration rather than sharing: validateInterfaceConformance (packages/odl/src/validator/index.ts:646-684) raises INTERFACE_FIELD_MISSING unless the implementing ObjectType carries every interface field itself, and INTERFACE_FIELD_TYPE_MISMATCH unless type name and nonNull match — i.e. the property is written twice and merely checked for agreement. No nested/struct property type exists in the field type model, and no reducer concept appears anywhere in odl, engine, spi, or either storage provider.

**Gap:** All three sub-capabilities are unimplemented: no struct (nested) property type, no reusable property definition shared across object types (interfaces enforce redeclaration, they do not supply the field), and no reducer/property-aggregation concept anywhere in the codebase.


## AIP / agents

### `aip-agents/no-code-business-rules-over-data-foundry-rul` — No-code business rules over data (Foundry Rules logic)

**Status:** `partial`

**Evidence (read 15 Aug):** Real and production-wired, but text-authored and quietly fail-open in places. Rules are declared in YAML manifests (preconditions: blocks in domain-packs/nhs-acute/actions/*.yaml — admit-patient.yaml:6, clean-bed.yaml:15, register-patient.yaml:13, transfer-ward.yaml:6, discharge-patient.yaml:6) and as @constraint CEL directives in ODL (packages/odl/src/parser/types.ts:62,140). Both are evaluated at runtime: packages/actions/src/executor/action-executor.ts:279 evaluates preconditions, and lines 735, 765, 822, 942 evaluate per-effect CEL conditions; packages/engine/src/objects/validation.ts:142 and 151-156 evaluate field-level then type-level constraints, with only non-warning failures blocking the write (validation.ts:175-176). The evaluator is a real Go CEL gRPC sidecar (packages/cel-evaluator/main.go, Dockerfile) wired at packages/api/src/server.ts:301-306 and shared by both the validation pipeline and the action executor.

**Gap:** Not no-code: rules live in ODL/YAML files inside a domain pack and need a redeploy to change — there is no rule-authoring UI, no rule versioning, no test/simulate surface, and no rule set editable independently of the schema. Two fail-open holes: server.ts:307-310 substitutes an allow-all stub (`async evaluate() { return { value: true } }`) whenever isDev is set and CEL_EVALUATOR_URL is unset, so every precondition and constraint silently passes in dev; and validation.ts:53-54,297 downgrade any constraint the evaluator cannot handle to a warning that is explicitly NOT enforced. No rule-hit metrics beyond the generic COMPUTED_EVALUATIONS counter.

### `aip-agents/ontology-derived-llm-tool-registry-tool-fact` — Ontology-derived LLM tool registry (tool factory)

**Status:** `partial`

**Evidence (read 15 Aug):** Two overlapping implementations; one is genuinely production-wired, one is dead. LIVE: packages/mcp-server is mounted at POST/DELETE /mcp in packages/api/src/server.ts:1192-1231, gated on packCapabilities.has('mcp') (server.ts:544). buildToolList (packages/mcp-server/src/tools.ts:46-60) derives one tool per ActionType plus one search_<Type> per ObjectType directly from the parsed ODL schema, with JSON Schema built from @param fields (tools.ts:66-87). Invocation is real and governed: action tools run the full ActionExecutor pipeline with consent subject derivation (tools.ts:204-243), and search tools go through authorizationService.listObjects FGA scoping, fail-closed on empty (tools.ts:263-285), plus redactFieldsBatch (tools.ts:304-309). Auth is the same OidcAuthenticator as REST/GraphQL (packages/mcp-server/src/auth.ts:70-72). DEAD: ToolRegistry.toAnthropicTools and toOpenAiTools (packages/actions/src/tools/tool-registry.ts:411,430) and executeForAgent (tool-registry.ts:137) have ZERO production callers — grep across packages/ excluding tests and their own definition file returns only a comment reference at packages/api/src/graphql/resolver-generator.ts:1399. Only ToolRegistry.availableTools() is wired, into the GraphQL availableTools query (resolver-generator.ts:1393-1395, SDL at packages/odl/src/codegen/index.ts:776).

**Gap:** Reach: only 1 of 4 packs enables it — domain-packs/nhs-acute/pack.yaml:17 is the sole "- mcp" declaration; aml, supply-chain and core packs expose no tools. Protocol: tools-only, initialize/tools/list/tools/call at packages/mcp-server/src/server.ts:152-166 with capabilities {tools:{}} (protocol.ts:69) — no resources, prompts, or sampling. Coverage: schema.functionTypes are never turned into tools (buildToolList, tools.ts:46-60, iterates only actionTypes and objectTypes), so declared @function logic is invisible to agents. Provider-native export is dead code. Dry-run is a facade: executeDryRun (tool-registry.ts:319-377) checks required-param presence only and self-documents that authorization and preconditions are NOT evaluated (tool-registry.ts:365-375), and the GraphQL surface hard-codes dryRunSupported:false (resolver-generator.ts:1404). No per-tool enablement, annotations, or description overrides.

### `aip-agents/agent-construction-and-orchestration-chatbot` — Agent construction and orchestration (Chatbot Studio, AIP Logic, Threads)

**Status:** `absent`

**Evidence (read 15 Aug):** Nothing in the repo constructs or runs an agent; packages/mcp-server serves an agent that lives elsewhere. The MCP handler is explicitly stateless — packages/api/src/server.ts:1191 comments "Stateless: no session storage" — and the DELETE /mcp branch (packages/mcp-server/src/server.ts:78) is a no-op session terminate. No thread, conversation, message, or session persistence exists: grep over packages/spi/src, packages/storage-postgres/src/schema and packages/engine/src for branch|proposal|review_|pending_ returns nothing, and there is no thread/conversation table in the DDL. The only agent-shaped types — AgentContext, AgentExecutionResult (packages/actions/src/tools/types.ts:120-127) — are consumed solely by ToolRegistry.executeForAgent (tool-registry.ts:137), which no production code calls. There is no orchestration loop, no prompt template store, no tool-choice/step controller, and no LLM to drive one (capability 1).

**Gap:** A user cannot build an agent on this platform at all. Missing: agent/prompt definition surface, conversation and thread persistence, a reasoning loop that selects and sequences tools, and the model access every one of those depends on. Altius is the tool provider for someone else's agent, not an agent builder.

### `aip-agents/agent-evaluation-framework-aip-evals` — Agent evaluation framework (AIP Evals)

**Status:** `absent`

**Evidence (read 15 Aug):** Grepped packages/ and domain-packs/ for eval(uation)?[-_]?(suite|set|run|harness|dataset)|scorer|golden|benchmark|judge across *.ts and *.yaml. Every hit is coincidental substring noise from a sample function named ScoreRisk in ODL tests (packages/odl/src/__tests__/codegen.test.ts:330-356, packages/odl/src/__tests__/function-type.test.ts:55-92) — a @function(runtime:"node") fixture, unrelated to evaluation. No eval dataset storage, no test-case registry, no scoring or grading code, no run/comparison records, and no metrics for them (packages/observability/src/metrics.ts:69-131 registers only engine, action, security, sync and computed-field instruments).

**Gap:** Entirely absent, and blocked upstream: with no agent runtime (capability 4) and no model access (capability 1) there is nothing to evaluate. Would need eval datasets, per-case scorers/graders, run persistence, and regression comparison.

### `aip-agents/embedded-ai-copilots-across-platform-applica` — Embedded AI copilots across platform applications

**Status:** `absent`

**Evidence (read 15 Aug):** There are no platform applications to embed a copilot in. `find . -name "*.tsx" -not -path "*/node_modules/*"` returns nothing, and the repo root contains only AGENT.md, LICENSE, Orion, README.md, docs, domain-packs, factory, package.json, packages, pnpm-*, tests, tools, tsconfig*, turbo.json — no web/app/ui directory and no index.html. Every workspace package (odl, engine, spi, storage-postgres, storage-memory, api, actions, cel-evaluator, security, sync, mcp-server, observability, sdk-typescript) is a headless library or server. Altius is backend-only: the AI-facing surface it does ship is the outbound MCP endpoint (packages/api/src/server.ts:1192-1231) that lets an *external* client such as Claude Code act as the copilot. Combined with the absence of any model client (capability 1), there is neither a host UI nor an inference path.

**Gap:** No user-facing application layer exists at all, so 'embedded copilot' has no host. Would require a frontend, an in-app assistant surface, context passing from the current view, and model access — none present.

### `aip-agents/embedding-vector-services-and-semantic-retri` — Embedding / vector services and semantic retrieval

**Status:** `absent`

**Evidence (read 15 Aug):** Searched packages/odl/src, packages/spi/src, packages/engine/src, packages/storage-postgres/src for vector|embedding|similarity|knn|cosine|ivfflat|hnsw|pgvector. The only hits are unrelated Postgres full-text terms: packages/storage-postgres/src/schema/ddl-objects.ts:105 ("Trigram GIN, not tsvector") and type-mapping.ts:80 ("GIN with tsvector"), plus packages/storage-postgres/src/__tests__/ddl-generation.test.ts:196 asserting the DDL does NOT contain to_tsvector. ODL has no vector scalar — the directive/type kinds in packages/odl/src/parser/types.ts:23-88 are primary/unique/indexed/readonly/sensitive/param/link/computed/constraint/default/deprecated/terminology/searchable/immutable, and the MCP scalar map (packages/mcp-server/src/tools.ts:27-39) tops out at JSON/URI/GeoPoint. Search is lexical only: the MCP search_<Type> tool (tools.ts:95-128) offers eq/ne/in/contains/startsWith/gt/lt/gte/lte and no semantic operator. No pgvector extension in any DDL and no embedding model dependency (see capability 1).

**Gap:** No vector column type, no index type (ivfflat/hnsw), no embedding generation, no nearest-neighbour query operator, and no storage-provider support in either storage-postgres or storage-memory. Semantic retrieval is unreachable end to end.

### `aip-agents/human-in-the-loop-change-proposals-for-ai-dr` — Human-in-the-loop change proposals for AI-driven modifications

**Status:** `absent`

**Evidence (read 15 Aug):** Demoted from partial: the only HITL machinery is an interface plus an unreachable branch. PolicyGuard is declared at packages/actions/src/tools/types.ts:107-112 with PolicyGuardResult carrying holdId (types.ts:100-102), and tool-registry.ts:155-177 returns a POLICY_HOLD error with holdId when riskLevel==='high'. But (a) the repo contains ZERO implementations of PolicyGuard — grep for "implements PolicyGuard|: PolicyGuard" across packages/ excluding dist yields only the two optional field declarations (tool-registry.ts:90,99) and two test mocks (tool-registry.test.ts:383,417); (b) the only method that consults the guard, executeForAgent (tool-registry.ts:137-207), has no production caller — the sole non-test reference repo-wide is a comment at packages/api/src/graphql/resolver-generator.ts:1399; (c) riskLevels defaults to an empty Map (tool-registry.ts:107), so every action is 'low' and the guard branch is skipped even if one were supplied; (d) nothing persists a proposal — grep over packages/spi/src, packages/storage-postgres/src/schema and packages/engine/src for branch|proposal|review_|pending_ returns no matches, so there is no hold record, no approve/reject endpoint, and no queue to list. The live MCP path (packages/mcp-server/src/tools.ts:232) calls actionExecutor.execute directly and never touches ToolRegistry or PolicyGuard — an agent's writes commit immediately.

**Gap:** A holdId is minted and thrown away; there is no storage for a pending change, no API to enumerate or approve one, no notification, and no branch/merge substrate to stage AI edits against. Nothing observable to a user exists. Reaching partial needs: proposal persistence, an approval endpoint, and the MCP invocation path routed through the guard rather than straight to the executor.

### `aip-agents/llm-compute-token-metering-and-attribution` — LLM compute/token metering and attribution

**Status:** `absent`

**Evidence (read 15 Aug):** packages/observability/src/metrics.ts:69-131 enumerates the complete instrument set: ENGINE_OPERATIONS counter, ENGINE_LATENCY histogram, ACTION_EXECUTIONS counter, ACTION_DURATION histogram, SECURITY_CHECKS counter and latency histogram, SYNC_RECORDS_PROCESSED, SYNC_LAG_SECONDS, SYNC_CONFLICTS, COMPUTED_EVALUATIONS, plus one observable gauge (metrics.ts:131). No token, prompt, completion, model, or cost metric exists. There is no LLM call to meter in the first place (capability 1). MCP tool calls are not separately metered either — packages/mcp-server/src/tools.ts contains no metrics import, so agent traffic is only visible as generic action/storage counters with no agent or session attribution. packages/api/src/governance/rate-limiter.ts limits requests, not tokens or compute.

**Gap:** No token accounting, no per-model or per-tenant cost attribution, no budget or quota enforcement, and no agent-session dimension on the metrics that do exist. Requires an LLM call site to instrument before any of this is meaningful.

### `aip-agents/managed-multi-provider-llm-gateway-model-acc` — Managed multi-provider LLM gateway (model access, enablement, capacity)

**Status:** `absent`

**Evidence (read 15 Aug):** No LLM provider dependency exists in any workspace package. Grepped every packages/*/package.json for "openai", "@anthropic-ai/*", "ai", "langchain", "@langchain/*", "cohere", "@mistralai", "ollama", "tiktoken" — zero matches. Repo-wide grep over packages/ and Orion/ for llm|LLM|openai|anthropic|completion returns only doc-comment prose (packages/mcp-server/src/index.ts:5 "AI agents (Claude Code, Cursor, Anthropic SDK, OpenAI SDK)", server.ts:7,16) plus OIDC bearer-token code — no client, no model registry, no provider abstraction, no capacity or enablement config. packages/actions/src/tools/tool-registry.ts:411,430 emit Anthropic/OpenAI *tool-definition JSON*, which is a schema shape, not a model call. No model-related env var appears in the packages/api/src/server.ts env block (server.ts:23 documents CEL_EVALUATOR_URL and peers; nothing LLM).

**Gap:** Everything. There is no code path in the repo that calls a language model. A gateway would need at minimum a provider client, a model catalog with per-tenant enablement, credential handling, and rate/quota enforcement — none of the four exist.


## Schema, interfaces & agents

### `schema-interfaces-agents/actions-and-ontology-surfaced-as-ai-agent-to` — Actions and ontology surfaced as AI-agent tools

**Status:** `partial`

**Evidence (read 15 Aug):** GraphQL exposes `availableTools(filter: ToolFilter): [ToolDescriptor!]!` (packages/odl/src/codegen/index.ts:755, type at :389-405), resolved at packages/api/src/graphql/resolver-generator.ts:471 and 1341-1376, delegating to ToolRegistry (packages/actions/src/tools/tool-registry.ts:113-126). Descriptors are real (name/kind/description/parameters/requiredPermissions/reversible) and MCP re-exposes the same actions as callable tools (packages/mcp-server/src/tools.ts:46-60, 232-238). Demotions: ToolRegistry.availableTools iterates only `schema.actionTypes` (tool-registry.ts:116) — the SDL declares `enum ToolKind { ACTION FUNCTION }` (codegen/index.ts:384-387) but no FunctionType descriptor is ever produced, so the FUNCTION arm is SDL with nothing behind it. `dryRunSupported` is hard-coded false and `tags` hard-coded [] (resolver-generator.ts:1356-1361), which makes ToolFilter.tags a filter that can never match. ToolRegistry.executeForAgent — the dry-run + PolicyGuard + risk-level path (tool-registry.ts:137-160) — has no production caller: grep across packages for `executeForAgent` outside tests returns only its definition and the package export (packages/actions/src/index.ts:83). No REST tool-discovery endpoint exists (no /tools route in packages/api/src/rest/route-generator.ts, none in the server's route list). Agents get no ontology description: the MCP search tool's `field` argument is a free-form string with no enumeration of the type's actual fields (packages/mcp-server/src/tools.ts:108), and tool arguments are never validated against the advertised inputSchema (tools.ts:202/232; the executor only checks required-presence, packages/actions/src/executor/action-executor.ts:523-547 — the REST action route does no param validation either, packages/api/src/rest/route-generator.ts:1259-1316).

**Gap:** Only ActionTypes become tools — FunctionTypes are declared in the ToolKind enum but never emitted. Agent-mode execution (dry-run, policy guard, risk gating) is implemented but unreachable from any server path. Tool discovery is GraphQL/MCP only (no REST), descriptor tags/dryRun are stubbed constants, and no tool describes the ontology's fields, so an agent must guess field names. Advertised inputSchemas are never enforced.

### `schema-interfaces-agents/interfaces-shared-abstractions-implemented-b` — Interfaces (shared abstractions implemented by multiple object types)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Polymorphic query now exists and works, but only on GraphQL and only as an unfiltered list. Verified by building the SDL from the real packs (core+nhs-acute+supply-chain+aml+aip, 21 object types) through packages/odl/dist and graphql buildSchema: emits `identifiables/auditables/locatables/temporals/codeableConcepts(first: Int): [X!]!` and BUILD OK. Codegen at packages/odl/src/codegen/index.ts:932-941 (skips a field whose name collides with an ObjectType plural); resolver at packages/api/src/graphql/resolver-generator.ts:556-586 fans out to each implementor's plural resolver (so authz/redaction/consent are inherited) and slices to `first`; __resolveType at :541-545 reads the __typename stamped at :235. Four tests in packages/api/src/__tests__/interface-queries.test.ts, but they call the resolver map directly on a hand-written ODL — no executable-schema or real-pack test. DEMOTION EVIDENCE, all reproduced today with scratch scripts against packages/odl/dist: (1) an interface used as an ObjectType FIELD still crashes schema build — packages/odl/src/codegen/index.ts:205-206 emits `${typeName}Filter` for any non-builtin, non-list field type, so `where: Locatable` produces a dangling `LocatableFilter` and buildSchema throws `Unknown type "LocatableFilter"`; (2) an interface cannot be a link target — validateSchema returns INVALID_LINKTYPE_TO for `@linkType(to: "Locatable")`; (3) zero interface support outside GraphQL — `grep -ni interface packages/api/src/rest/route-generator.ts` returns nothing, and packages/mcp-server/src/tools.ts builds tools per ObjectType only (buildSearchTool :96, buildActionTool :67); (4) the conformance validator still never runs at boot — validateInterfaceConformance (packages/odl/src/validator/index.ts:646, called from :176) is reachable only from packages/odl/src/cli/index.ts:62,164; packages/api/src/schema-loader.ts calls parseOdl (:953) but never validateSchema, and .github/workflows/ci.yml has no `odl validate` step.

**Gap:** GraphQL-only, list-only: no filter, no orderBy, no cursor (`first` is applied after fanning out one query per implementor, so it is biased to the first types and cannot be paged past). Interface-typed object fields still hard-fail schema build via the dangling `<Interface>Filter` input (codegen/index.ts:205-206). Interfaces cannot be link targets, so no polymorphic traversal. No REST/MCP/FHIR/CDM interface surface. Interface conformance validation still never runs at boot or in CI.

### `schema-interfaces-agents/mcp-server-for-external-ai-ides-and-agents` — MCP server for external AI IDEs and agents

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Both named sub-gaps are genuinely closed. Auth: packages/mcp-server/src/auth.ts:43-48 gates the dev-user fallback on `ALTIUS_MCP_DEV_AUTH_BYPASS === 'true' && NODE_ENV !== 'production'`, fail-closed when unset, consumed at :76 — staging/UAT no longer serve an unauthenticated admin. Filter guard: packages/mcp-server/src/tools.ts:274-281 calls getVisibleFields and refuses filters on non-visible fields, with filterFields collected in parseSearchArgs (:390,403), mirroring the GraphQL rule. Protocol handling also improved since grading: packages/mcp-server/src/server.ts:163-169 now rejects a mismatched protocolVersion with UNSUPPORTED_PROTOCOL_VERSION. REMAINING (all verified today): transport is HTTP-only — packages/mcp-server/package.json has no `bin` and there is no StdioServerTransport anywhere in packages/mcp-server/src, so no IDE can spawn it as a stdio server; capabilities advertised are `{ tools: {} }` (server.ts:173) and dispatchMethod (server.ts:152-204) handles only initialize/tools/list/tools/call — `resources/*` and `prompts/*` fall to METHOD_NOT_FOUND; MCP_PROTOCOL_VERSION is pinned to '2025-03-26' (packages/mcp-server/src/protocol.ts:13) and the check at server.ts:164 is strict equality, so a current IDE client that requests a newer revision is hard-refused rather than downgraded; the endpoint mounts only when a loaded pack declares the `mcp` capability (packages/api/src/server.ts:603, 1282-1309) and `grep capabilities domain-packs/*/pack.yaml` shows only nhs-acute declares it.

**Gap:** No stdio transport and no package `bin`, so external IDEs cannot launch it the normal way — HTTP + OIDC only. Tools-only: no resources, no prompts. Protocol pinned to 2025-03-26 with strict-equality rejection, so newer IDE clients are refused outright. Surface still exists only in deployments that load nhs-acute.

### `schema-interfaces-agents/object-type-schema-definition-typed-entities` — Object type schema definition (typed entities, primary key, enums, API names)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** f8146df fixed exactly one of three read paths. packages/engine/src/objects/object-manager.ts:59-67 (rewritePrimaryField) + :338-346 rewrite the declared @primary name to `_id` for filter and orderBy — but ONLY inside query(). aggregate() at :357-368 and search() at :376-393 are bare pass-throughs to storage with no rewrite, while both accept a caller filter: AggregateQuery.filter and SearchQuery.filter (packages/spi/src/ontology.ts:304, :327) are exposed as `search<Type>s(..., filter: <Type>Filter, ...)` and `<type>Aggregate(filter: <Type>Filter, groupBy: [String!], ...)` (packages/odl/src/codegen/index.ts:916, :918) and forwarded verbatim by the resolvers (packages/api/src/graphql/resolver-generator.ts:1186, :1311, :1326). The @primary field is still not a stored column — packages/api/src/schema-loader.ts:797 skips it in convertObjectType — so filtering search/aggregate on `id`, or `groupBy: ["id"]`, reproduces the original defect: SQL error on Postgres, silent empty match on memory. @primary is still unwritable: no generated create/update GraphQL input carries it, storage mints `_id`, and addIdAlias (packages/actions/src/executor/action-executor.ts:202-213) only back-fills it from `_id`. ODL validation still never executes outside the CLI (packages/odl/src/cli/index.ts:62,164; schema-loader.ts never calls validateSchema; ci.yml has no validate step). The enum/type sub-gap IS now fixed on the action path: checkParamType handles enums (action-executor.ts:124-131) and object-typed params (:141-145), invoked by validateParams (:659-703). Manifest EFFECT properties are still unvalidated — executeCreateObject resolves expressions and calls txn.createObject directly (action-executor.ts:1088) with no ObjectManager.validate, and crossReferenceManifests emits severity 'warning' only (schema-loader.ts:493-503). NEW surface asymmetry found: `update<Type>`/`delete<Type>` resolvers are registered at resolver-generator.ts:976 and :1044 but codegen emits no matching Mutation field — I dumped the real Mutation type for core+nhs-acute and it contains only the five action mutations plus objectSet/relationship/consent/generate/embed. Those two resolvers are dead code; generic update/delete exists on REST only (PUT and DELETE /api/v1/{plural}/:id, packages/api/src/rest/route-generator.ts:865, :952).

**Gap:** @primary is filterable/sortable only through the list-query path; the same filter on search<Type>s or <type>Aggregate (and groupBy on it) still 500s on Postgres and silently returns nothing on memory. @primary remains unwritable by a caller. ODL's own validation rules still never run at boot or in CI. Manifest effect properties bypass object validation entirely. Generic update/delete is reachable on REST but absent from the GraphQL SDL while its resolvers are still generated.

### `schema-interfaces-agents/ontology-as-code-export-edit-import` — Ontology-as-code export/edit/import

**Status:** `partial`

**Evidence (read 15 Aug):** Edit+import half is real: .odl files under domain-packs/*/schema are discovered, parsed and merged at boot (packages/api/src/schema-loader.ts:837-870), recorded as a new registry version when changed (packages/api/src/schema-registry-boot.ts:64-91), backed by PostgresSchemaRegistry when storage is Postgres (packages/api/src/server.ts:236-240), with SCHEMA_BREAKING_POLICY=block able to fail boot on a BREAKING diff, and additive DDL applied on drift while destructive changes are refused (packages/storage-postgres/src/postgres-storage-provider.ts:288-305). CLI exists and is a real bin (packages/odl/package.json:20-22 → `odl`): validate/diff/apply/generate graphql|openfga/rollback (packages/odl/src/cli/index.ts). But `odl apply` constructs `new InMemorySchemaRegistry()` per invocation (packages/odl/src/cli/index.ts:175) — it writes into a registry that dies with the process; there is no client to a running server's registry and no import endpoint (the only admin route is GET /admin/packs, packages/api/src/server.ts:953-975, which returns type counts, not schema). Export does not exist: there is no ODL serializer anywhere (no toOdl/printOdl/serializeOdl symbol in packages/odl/src), so the versioned ParsedSchema in the registry can never be turned back into editable ODL. generateSdk exists (packages/odl/src/codegen/sdk.ts:416, re-exported at packages/odl/src/index.ts:21) but has no CLI command and no caller in the repo, and packages/sdk-typescript/src/index.ts is a 7-line `export {}` placeholder. Validation is not enforced on the import path (schema-loader.ts:21 imports only parseOdl).

**Gap:** No export: nothing can emit ODL (or any editable form) from the live ontology. 'Import' means editing pack files on disk and restarting the process — `odl apply` writes to a throwaway in-memory registry, and no API accepts a schema. The generated-SDK path is exported code with no CLI command, no caller, and an empty placeholder package.


## Storage & conformance

### `storage-conformance/graph-traversal-query-primitive` — Graph traversal query primitive

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** The prior gap's central claim is now false: three independent surfaces accept a TraversalPath, with no platform code required. REST — packages/api/src/rest/traverse-route.ts:153 defines `POST /api/v1/{plural}/:id/traverse` taking {steps:[{linkType,direction,filter}], limit, offset}, generated for every ObjectType (:274-278) and wired into the route list at packages/api/src/server.ts:1108. GraphQL — packages/odl/src/codegen/index.ts:919 emits `traverse<Type>(startId: ID!, steps: [TraversalStepInput!]!, limit: Int): TraversalResult!` with TraversalStepInput/TraversalNode/TraversalEdge/TraversalResult at :868-900; resolver at packages/api/src/graphql/resolver-generator.ts:2073-2166. MCP — `traverse_<Type>` dispatched at packages/mcp-server/src/tools.ts:174-180, implemented at :482-570. All three validate steps against the ontology's link types before executing (so a caller cannot probe for link names), gate entry on `viewer` of the start object, then re-check authorization, redaction and consent per node against that node's OWN type, and drop any edge whose endpoint was withheld. Both providers implement the primitive with matching semantics (packages/storage-memory/src/memory-storage-provider.ts:1095-1190; packages/storage-postgres/src/links/traversal.ts:107+, SQL JOINs on the link tables), and the shared conformance suite covers it — tests/spi-conformance/src/categories/links.ts:425-476 exercise no-filter, step filter, edge-drop-on-filter and soft-delete exclusion; I ran the suite locally: 319 memory tests pass. Residuals that do not block the capability: TraversalStep.maxDepth is declared in the SPI but implemented by neither provider and both throw loudly rather than silently truncating (memory :1105-1112, postgres :117-125), so each step is exactly one hop and only the final step's nodes are returned; the REST route is absent from packages/api/src/rest/openapi.ts; GraphQL exposes limit but not offset while REST exposes both. The AGE half of the prior gap is partly unchanged — packages/storage-postgres/src/schema/ddl-graph.ts:24-27 still emits CREATE EXTENSION age + create_graph, generateDDL defaults includeGraph=true, and ddl.all is executed with no per-statement tolerance (postgres-storage-provider.ts:336-338), so AGE is still a hard boot requirement, and object-crud.ts/link-crud.ts still mirror every write into a graph nothing reads (documented at postgres-storage-provider.ts:612-620) — but health no longer fails on its absence, and traversal never needed it.

**Gap:** None blocking. Residual shape limits: no variable-length paths (maxDepth throws unimplemented on both providers), only the terminal step's nodes are returned, the REST route is missing from the OpenAPI document, GraphQL lacks the offset REST has, a step filter on the declared @primary field hits the unrelated `_id` aliasing defect, and the Apache AGE graph is still mandatory at DDL time and written on every mutation while never being read.

### `storage-conformance/link-types-bidirectional-cardinality-self-li` — Link types (bidirectional, cardinality, self-links, traversal)

**Status:** `partial`

> ⚠️ **PARTIALLY RE-VERIFIED, 16 Aug 2026.** The three provider divergences below are CLOSED; the rest of the evidence is 15 Aug and unrechecked.

**Update (16 Aug):** All three divergences this row called unreconciled are now closed. (a) Link delete semantics agree — memory `_doDeleteLink` (memory-storage-provider.ts:723-737) sets `_deletedAt` and bumps `_version` rather than hard-deleting, matching Postgres, so `includeDeleted: true` returns the link on both. (b) Referential integrity agrees — memory now has `_assertEndpointLive` (memory-storage-provider.ts:494-503), refusing a link whose endpoint is missing or soft-deleted, as Postgres always did. (c) Pagination agrees — both providers import `MAX_LINK_QUERY_LIMIT`/`DEFAULT_LINK_QUERY_LIMIT` from the SPI and refuse an over-large page rather than shrinking it (memory-storage-provider.ts:1184-1191; link-crud.ts:513-520). Also closed: MANY_TO_ONE had zero test coverage in either provider despite being the cardinality the shipped packs use most (AdmittedTo, UnderCareOf, BedInWard, AlertCase, OrderedFrom) — a `CaredForBy` fixture (tests/spi-conformance/src/fixtures.ts) and three conformance cases (categories/links.ts: multiple inbound allowed, second outbound refused, re-link after delete) now exercise it. Memory passes all three; the suite is 322 tests, up from 319. **The Postgres half was NOT run** — `PG_TEST_URL` is unset locally and the repository still has zero CI workflow runs, so MANY_TO_ONE enforcement on Postgres rests on reading link-crud.ts, not on a passing test.

**Evidence (read 15 Aug):** Contract: LinkTypeDefinition{fromType,toType,cardinality} at packages/spi/src/ontology.ts:179-185; ODL parses @linkType(from,to,cardinality) — domain-packs/nhs-acute/schema/links.odl:7-33 — and schema-loader converts it at packages/api/src/schema-loader.ts:790-800. Bidirectional reads are real and user-reachable: @link(direction: INBOUND|OUTBOUND) fields resolve through LinkManager.getLinks in packages/api/src/graphql/resolver-generator.ts:293-322 (per-target authz at :353-360, history:true → includeDeleted at :305), plus REST packages/api/src/rest/route-generator.ts:875, FHIR packages/api/src/fhir/router.ts:322, CDM packages/api/src/cdm/router.ts:420. Cardinality is enforced at runtime in BOTH providers (packages/storage-postgres/src/links/link-crud.ts:139-190; packages/storage-memory/src/memory-storage-provider.ts:309-341) and backstopped by partial unique indexes in DDL (packages/storage-postgres/src/schema/ddl-links.ts:56-72). Providers still disagree in three places: (a) memory deleteLink HARD-deletes while Postgres soft-deletes — the divergence is acknowledged in a live TODO at packages/storage-memory/src/memory-storage-provider.ts:484-495, so getLinks/traverse with includeDeleted:true return the link in Postgres and nothing in memory; (b) Postgres createLink requires both endpoints to exist and be undeleted (link-crud.ts:199-232) while memory _doCreateLink (memory-storage-provider.ts:422-453) does no such check — a link to a non-existent object silently succeeds in memory; (c) getLinks default page size is 100/max 1000 in Postgres (link-crud.ts:483-484) but unbounded (items.length) in memory (memory-storage-provider.ts:877), so totalCount/hasNextPage diverge past 100 links. Self-links exist only as an unexercised fixture: LinkType TeamLead CareTeam→CareTeam at tests/spi-conformance/src/fixtures.ts:105-111 is referenced once, by a name assertion in tests/spi-conformance/src/categories/schema.ts:120, and no shipped pack declares a self-link. MANY_TO_ONE — the cardinality shipped packs use most (AdmittedTo, UnderCareOf, BedInWard, AlertCase, OrderedFrom) — has zero test coverage: grep for MANY_TO_ONE in tests/spi-conformance/src and packages/storage-*/src/__tests__ returns nothing.

**Gap (as of 16 Aug):** Self-links are covered at the compiler level (packages/odl/src/__tests__/self-link.test.ts) but still have no SPI conformance case exercising create/get/traverse on a `from == to` link at the storage layer. MANY_TO_ONE is now covered on memory but unproven on Postgres, because the Postgres conformance half has never executed. Multi-hop traversal IS now reachable through REST, GraphQL and MCP — that clause of the 15 Aug gap is stale (see the traversal capability, graded `full`).

### `storage-conformance/object-edit-history-and-temporal-queries` — Object edit history and temporal queries

**Status:** `partial`

**Evidence (read 15 Aug):** Edit history is real and reachable. Postgres writes a full snapshot to <type>_history on create, update and soft-delete (packages/storage-postgres/src/objects/object-crud.ts:160, :265, :296; table + lookup index at schema/ddl-objects.ts:45-56), memory keeps a version array (memory-storage-provider.ts:294-301, :359, :388, :405), and GET /api/v1/{plural}/:id/history is a generated production route that authorizes, walks versions 1..currentVersion through storage.getObjectAtVersion, then field-redacts and consent-filters (packages/api/src/rest/route-generator.ts:913-1000, call at :962). Point-in-time is where it stops. ebba280 did fix real breakage — getObjectAtTime now compares the object's own _updated_at instead of _history_created_at (packages/storage-postgres/src/temporal/temporal-queries.ts:114-129), which is what the memory provider always did (memory-storage-provider.ts:988-1004) — but the same comment concedes at :127 that 'getObjectAtTime has no production caller', and grep confirms it: outside the two providers and tests, the only hits are the SPI declaration (packages/spi/src/storage-provider.ts:63) and mocks. QueryOptions.asOfVersion / asOfTime (packages/spi/src/ontology.ts:97-98) are read by NOTHING: neither pgQueryObjects (packages/storage-postgres/src/objects/object-crud.ts:336-400 never mentions them) nor memory queryObjects (memory-storage-provider.ts:545-581) — as-of querying is declared config with no implementation. The history route is also O(versions) sequential round-trips, and hard delete purges history entirely (object-crud.ts:315-318).

**Gap:** No point-in-time read path for users: getObjectAtTime is unreachable from REST/GraphQL/MCP/SDK, and asOfVersion/asOfTime on QueryOptions are honoured by neither provider. History is per-object version listing only — no as-of collection query, no link history API.

### `storage-conformance/property-system-base-types-required-unique-c` — Property system: base types, required/unique constraints

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** One of four sub-gaps is closed. Memory now enforces both constraints at the storage layer: packages/storage-memory/src/memory-storage-provider.ts:403-436 (_enforceObjectConstraints) rejects a missing or explicitly-null required property and a duplicate value on a unique IndexDefinition, with NULLs exempted from uniqueness and soft-deleted rows still occupying the index; :1243-1252 refuses to build a unique index over existing duplicates. A Constraints category now exists in the shared suite (tests/spi-conformance/src/categories/constraints.ts, registered at tests/spi-conformance/src/suite.ts:40) and I ran the suite: 319 memory tests pass, postgres half skipped without PG_TEST_URL. STILL OPEN: (1) custom scalars get no runtime format validation — packages/engine/src/objects/validation.ts:72-84 checks Date/DateTime/Duration/URI as nothing more than `typeof === 'string'` and GeoPoint as any non-null object, while Postgres maps them to TIMESTAMPTZ/DATE/INTERVAL (packages/storage-postgres/src/schema/type-mapping.ts:13-16), so a malformed date string is accepted by memory and rejected by Postgres. (2) list-typed scalar properties still lose their list-ness — packages/api/src/schema-loader.ts:803-807 builds the PropertyDefinition from `field.type.name` and `field.type.nonNull` and drops `field.type.isList`; PropertyDefinition (packages/spi/src/ontology.ts:200-206) has no list flag; pgType (type-mapping.ts:62-64) has no array mapping, so `tags: [String!]` becomes a scalar TEXT column on Postgres while memory stores a JS array. Nothing detects it: no shipped pack declares a list-typed scalar (the only `[...]` fields in domain-packs are @link virtuals, which are skipped at schema-loader.ts:801) and tests/spi-conformance/src/fixtures.ts:20-70 has no list property either. (3) the two-provider run is still not exercised in CI in practice — .github/workflows/ci.yml:85-88 now adds the `SPI conformance against Postgres` step with PG_TEST_URL, but `gh api repos/daemon-blockint-tech/Altius-System/actions/runs --jq .total_count` returns 0: no workflow has ever executed in this repository, so no CI gate of any kind has run.

**Gap:** Custom scalars (Date, DateTime, Duration, GeoPoint, URI) are still validated only as string/object, leaving a live memory-vs-Postgres divergence on malformed values. List-typed scalar properties are silently flattened to a scalar column on Postgres — the isList flag never crosses the SPI boundary — and neither the shipped packs nor the conformance fixture contain one, so the suite cannot catch it. The Postgres conformance step is declared in ci.yml but has never run, since the repository has zero workflow runs.

### `storage-conformance/schema-evolution-with-breaking-change-detect` — Schema evolution with breaking-change detection and migration gating

**Status:** `partial`

**Evidence (read 15 Aug):** Detection and gating are genuinely wired now. diff()/classify() (packages/odl/src/diff/index.ts:34-100, breaking rules at :435-475) run inside PostgresSchemaRegistry.applySchema, which stores the diff and classification per version and refuses BREAKING without an approved plan (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:99-124), and boot calls it: server.ts:236-256 builds PostgresSchemaRegistry (or InMemorySchemaRegistry) and calls recordSchemaVersion (packages/api/src/schema-registry-boot.ts:64-91), with SCHEMA_BREAKING_POLICY=block turning a BREAKING pack change into a boot failure (config.ts:221-228, rethrow at server.ts:250-252). A deployed ontology can now evolve additively: applySchema detects DDL drift on an already-applied version, plans ALTER TABLE ... ADD COLUMN against information_schema and refuses destructive changes (packages/storage-postgres/src/schema/ddl-migrate.ts:77-150), wired under the advisory lock at packages/storage-postgres/src/postgres-storage-provider.ts:288-309, which also re-runs ddl.all so newly declared tables/indexes appear. Limits: production always presents version 1 — toOntologySchema hard-codes `version: 1` (packages/api/src/schema-loader.ts:809-815) — so every real evolution takes the checksum-drift branch, never the version-bump branch the conformance suite exercises (tests/spi-conformance/src/categories/schema.ts:247-326). Anything non-additive (type change, new required property without @default) throws out of applySchema (postgres-storage-provider.ts:289-295) and boot dies with no in-product remedy: MigrationPlan is {description, approved} metadata only (packages/odl/src/registry/types.ts:29-34) — there is no migration executor, no backfill, no DDL plan attached to it. Default policy is 'warn', which auto-approves BREAKING changes with a log line (schema-registry-boot.ts:86-88, server.ts:242). Ordering is wrong for gating: storage.applySchema runs at server.ts:211, before the breaking-change check at :240. planAdditiveMigration is unit-tested against canned information_schema rows only (packages/storage-postgres/src/__tests__/ddl-migrate.test.ts:1-6, 12-22) — no test runs a real ALTER TABLE. Registry versions and storage _schema_migrations versions are independent counters, and getSchema serves only the in-process map (postgres-storage-provider.ts:365-372), so older versions are unreadable after a restart.

**Gap:** No executable migration for non-additive changes — detection blocks, nothing unblocks; the default policy auto-approves BREAKING; storage DDL is applied before the breaking gate; SPI schema version is a constant so version-based migration is dead; live ALTER TABLE is untested.


## Sync, ingest & ops

### `sync-ingest-ops/backing-datasources-and-property-to-column-m` — Backing datasources and property-to-column mapping

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** REST connector is now real (packages/sync/src/connectors/rest-connector.ts, 397 lines: offset/page/cursor pagination, bearer/basic/OAuth2-client-credentials, incremental checkpoint param) and registered at packages/sync/src/connectors/default-registry.ts:16 — so a REST-backed datasource can extract, which it could not before 4bed9d3. Everything else the prior gap named is unchanged. OVERLAY still has NO runtime: OverlayEngine is constructed only in packages/sync/src/overlay/overlay-engine.test.ts:108,152,232; its only non-test references repo-wide are the barrel re-export packages/sync/src/index.ts:99 and an error string at packages/sync/src/scheduler/sync-scheduler.ts:165. Boot explicitly skips it (packages/api/src/sync-boot.ts:152 'if (config.sync.mode === OVERLAY) continue'). All three shipped manifests are OVERLAY (domain-packs/nhs-acute/connectors/pas-jdbc.yaml:21, domain-packs/aml/connectors/tms-jdbc.yaml:31, domain-packs/supply-chain/connectors/erp-jdbc.yaml:28), as is the external-pack fixture (packages/api/src/__tests__/fixtures/external-pack/connectors/widget-rest.yaml:18) — so object reads never touch a source system in any shipped configuration. No schema validation of the mapping: parseMappingObject still takes no schema (packages/sync/src/mapping/mapping-parser.ts:155-157) and buildConfig only checks field presence (:160-163); loadPackConnectors (packages/api/src/schema-loader.ts:386-411) parses YAML and stores it raw; RecordMapper copies target property names verbatim (packages/sync/src/mapping/record-mapper.ts:69,86-96). A typo'd mapping.objectType or property still surfaces only as a per-record runtime failure. sync.writeback is parsed (mapping-parser.ts:262) and read by nothing; Connector.write is optional (packages/sync/src/connectors/connector.ts:155) and implemented by no connector (jdbc/rest/kafka-cdc).

**Gap:** OVERLAY (read-through backing datasource) has no production caller — OverlayEngine in_degree 0 outside its own test — and it is the mode every shipped pack declares, so a property-to-column mapping only ever materializes objects on the ingest path, never backs a read. Nothing validates mapping.objectType or property targets against the ODL schema at boot. sync.writeback is dead config.

### `sync-ingest-ops/live-data-push-auto-refresh-change-subscript` — Live data push / auto-refresh (change subscriptions)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** The SDL/runtime mismatch the prior gap named is still exactly true. SDL promises a full object: packages/odl/src/codegen/index.ts:319 emits 'object: ${typeName}!' inside ${typeName}ChangeEvent, and packages/odl/src/codegen/index.ts:1008-1009 emits '<foo>Changed(id: ID!): FooChangeEvent!' / '<foo>sChanged(filter: JSON): FooChangeEvent!' — both non-null. The runtime payload carries only {id,_type}: packages/api/src/subscriptions/subscription-manager.ts:28 (interface), :79 (mapObjectEvent) and :122 (mapLinkEvent). No ChangeEvent field resolver exists — grep for 'ChangeEvent' across packages/api/src/graphql/*.ts returns nothing, and generateSubscriptionResolvers (packages/api/src/graphql/resolver-generator.ts:1473-1486) registers only createIdFilteredSubscription/createFilteredSubscription, which resolve the whole payload verbatim (subscription-manager.ts:290,347). Concrete failure: 'subscription { patientChanged(id:"p-1") { object { name } } }' — name is String! in the shipped packs (domain-packs/nhs-acute/schema/staff.odl:13 pattern) — resolves undefined, non-null propagation nulls object, then ChangeEvent, then the non-null subscription field, erroring the whole delivery. The landed work fixed authorization, not the payload: tenant scoping at subscription-manager.ts:312 and :373, and matchesFilter now fails closed (:399-413) — any filter key not in {changeType,id,_type} drops the event. That closes a leak but creates a second functional hole: 'patientsChanged(filter:{status:"ACTIVE"})' is accepted by the advertised 'filter: JSON' argument and silently delivers zero events forever. Tests still only assert object.id/_type (packages/api/src/__tests__/subscriptions.test.ts:211-212,281,392,524) — no test executes a subscription against the generated schema with an object subselection.

**Gap:** ChangeEvent.object is a two-field stub behind a non-null full-object SDL type, so any client selecting a real property errors the payload; and property-based subscription filters now silently match nothing. Both require platform code (an object field resolver + a hydrating store read) to fix.

### `sync-ingest-ops/platform-health-checks-operational-monitorin` — Platform health checks & operational monitoring

**Status:** `partial`

**Evidence (read 15 Aug):** Liveness/readiness are real and probe-wired: packages/api/src/server.ts:919-932 (/health returns 503 when storage.healthCheck() is unhealthy), :935-937 (/healthz), matched by Orion/helm/altius/templates/api-gateway-deployment.yaml:77-88. Prometheus is real: packages/api/src/metrics.ts:26-75 registers http_requests_total, http_request_duration_seconds, altius_storage_healthy, altius_pack_loaded and four altius_sync_* gauges; mounted at packages/api/src/server.ts:911-915 with podDirectOnly (metrics.ts:145-153); scraped by Orion/helm/altius/templates/servicemonitor.yaml; seven alerts in Orion/helm/altius/templates/prometheusrule.yaml including the new SyncRecordsDropped (delta(altius_sync_records_failed[15m])>0) which closes a genuine silent-data-loss hole (CdcConsumer counts and skips a failed record at packages/sync/src/cdc/cdc-consumer.ts:126-134 while the checkpoint advances). The rename trap is now guarded: packages/api/src/__tests__/prometheus-rule-metrics.test.ts:44-66 asserts every altius_/http_ series named in the chart is registered, and fails if the chart moves. Gauge mirroring is verified at packages/api/src/__tests__/sync-metrics.test.ts:33-60.

**Gap:** /health inspects only storage — storage.healthCheck() is the sole health call in the whole api package (two call sites: server.ts:921, metrics.ts:180); OpenFGA, the CEL sidecar, Redpanda and Redis are never probed, so a pod stays Ready with authorization or CEL down. The four altius_sync_* gauges are only registered-with-values when a scheduler exists (server.ts:741 startSyncMetricsGauge only when syncBoot.scheduler is non-null), which no shipped deployment can achieve, so SyncStale, SyncRecordsFailing and the new SyncRecordsDropped alert on series that are never produced. monitoring.serviceMonitor.enabled and monitoring.prometheusRules.enabled both default false (Orion/helm/altius/values.yaml:299-305). The sync-engine pod's own probe hits a stub that returns ok unconditionally (packages/sync/src/server.ts:15-19) — permanently green while doing nothing. No sync/scheduler status endpoint: SyncScheduler.stats() (sync-scheduler.ts:227-239) is consumed only by the metrics gauge.

### `sync-ingest-ops/source-system-sync-cdc-ingestion-with-edit-v` — Source-system sync / CDC ingestion with edit-vs-source reconciliation

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Reconciliation is still absent — 7ace314 converted the silent clobber into a refusal, not into resolution. packages/api/src/sync-boot.ts:161-168 logs an error and skips any datasource that declares conflictResolution, on the stated grounds that no production code writes field provenance. ConflictResolver still has zero production callers: the only non-test references are the type re-export at packages/sync/src/index.ts:116 and the explanatory comment at packages/api/src/sync-boot.ts:11-14. For datasources that DO get scheduled, the applier still blind-overwrites every mapped property (packages/api/src/sync-boot.ts:94 objectManager.update with mapped.properties, no comparison to the existing writer). The scheduler remains unreachable in either shipped deployment: SYNC_SCHEDULER_ENABLED appears nowhere in Orion/helm/altius/templates/configmap.yaml (whole 89-line file read — INGEST_SECRET is at :50, no sync key), the api-gateway pod takes env only from that configmap plus a fixed literal block with no extraEnv escape hatch (Orion/helm/altius/templates/api-gateway-deployment.yaml:55-76), and Orion/docker-compose.yaml declares no env_file and no SYNC_SCHEDULER_ENABLED interpolation (the only hit repo-wide is the commented Orion/.env.example:75). The push path IS reachable — INGEST_SECRET is wired in both (Orion/docker-compose.yaml:236, configmap.yaml:50), handler at packages/api/src/ingest-handler.ts:56-121, mounted at packages/api/src/server.ts:1344 — but it 500s for every shipped manifest because all three set primaryKey.target: "id", rejected at ingest-handler.ts:80-82 and at sync-boot.ts:63-68. KafkaCdcSource does map deletes correctly (packages/sync/src/cdc/kafka-cdc-source.ts:139-145, c/u/d/r -> INSERT/UPDATE/DELETE), but JDBC incremental extract still hardcodes 'WHERE updated_at > $1' and yields only UPDATE (packages/sync/src/connectors/jdbc-connector.ts:216-217,227), and the new REST connector emits INSERT only.

**Gap:** Zero edit-vs-source reconciliation: the only two declarable strategies are refused at boot because their input (field provenance) has no producer, so a scheduled datasource still overwrites user edits. The poll/CDC loop cannot be enabled in any shipped compose or Helm deployment without editing those files, and every shipped manifest is unusable on both the poll and webhook paths.

### `sync-ingest-ops/operational-automation-scheduled-event-drive` — Operational automation (scheduled + event-driven)

**Status:** `absent`

**Evidence (read 15 Aug):** No trigger/automation/cron construct exists in the ODL: grep -niE 'trigger|automation|cron' over packages/odl/src returns nothing (checked ast/parser/codegen/validator). Repo-wide, the only scheduler is the sync poll loop (packages/sync/src/scheduler/sync-scheduler.ts) — a grep for cron|trigger|automation|schedule across packages/**/*.ts hits only that file plus unrelated matches (ddl-audit trigger SQL, CEL client retry, subscription-manager). The nearest thing is action sideEffects (packages/actions/src/sideeffects/side-effect-executor.ts, parsed at packages/actions/src/parser/index.ts:82,587-647), which fire webhooks/CloudEvents only after a user explicitly invokes an action, plus CloudEvents on Kafka (packages/api/src/events/redpanda-event-bus.ts) that some external consumer would have to act on.

**Gap:** There is no way for a platform user to declare 'run this action on a schedule' or 'run this action when objects matching X change' — no job/trigger registry, no cron parser outside the sync interval parser, no scheduled-action executor, no persistence for scheduled work. Any automation requires writing an external consumer against the Kafka topic.


## Actions & concurrency

### `actions-concurrency/action-side-effect-webhooks-to-external-syst` — Action side effect: webhooks to external systems

**Status:** `partial`

**Evidence (read 15 Aug):** All four WebhookConfig fields are read by production code. url: ${VAR} placeholders are expanded from an injected env, throwing a named error when unset (side-effect-executor.ts:231-242), with process.env supplied at wiring time (packages/api/src/server.ts:689-693). headers: merged into the real fetch call (server.ts:672-677). body: each top-level string is resolved against the action context before the POST, so `body: {reason: "params.reason"}` sends the value not the literal (action-executor.ts:1069-1081, called from resolveSideEffectConfig at 1043-1057 and applied at 362-369). timeoutMs: enforced with AbortController, default 10s (server.ts:669-670, side-effect-executor.ts:156). retries:0 now performs exactly one attempt instead of zero (getMaxRetries, side-effect-executor.ts:193-203). Manifests that declare a non-POST method are rejected at load time rather than silently POSTed (parser/index.ts:641-652). The handler is wired into the production ActionExecutor (server.ts:689-704) and two bundled packs exercise it (domain-packs/aml/actions/submit-report.yaml, domain-packs/supply-chain/actions/receive-shipment.yaml).

**Gap:** (1) Delivery failure is completely silent under the default LOG_AND_CONTINUE policy: neither the executor (action-executor.ts:370-438 — the non-ROLLBACK_ALL branch is a bare comment at :437) nor SideEffectExecutor (no logger imported in side-effect-executor.ts) logs anything, no metric exists (no webhook/side-effect counter in packages/api/src/metrics.ts), and the audit record carries only before/after states (action-executor.ts:449-471). A webhook that 500s five times returns success:true with zero trace — and both bundled packs use LOG_AND_CONTINUE. (2) Delivery is inline and in-memory only — no queue, no DLQ, no persistence; a crash after commit loses the call permanently, and RETRY_INDEFINITELY blocks the client request for up to 100 attempts with a 30s backoff cap (side-effect-executor.ts:33, 205-211). (3) Only top-level body strings are interpolated — nested objects/arrays pass through as literal expression text (action-executor.ts:1076-1080). (4) ${VAR} expansion applies to url only, not headers, so an Authorization/HMAC secret would have to be plaintext in pack YAML; there is no payload signing. (5) config.url is never validated at parse time — a webhook missing url throws a TypeError inside expandUrl on every attempt and is then swallowed by the same silent path.

### `actions-concurrency/action-types-declarative-create-modify-delet` — Action types: declarative create/modify/delete/link rules with parameters, submission criteria, permissions, side effects

**Status:** `full`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Re-verified against commit 0b263e6 + restoreObject SPI op (working tree clean). All prior gaps are CLOSED: (1) Manifest cross-reference is fatal at boot — schema-loader.ts:499-506 preserves the original severity from crossReferenceManifest (no longer demoting errors to warnings), and schema-loader.ts:1017-1037 filters for severity==='error' and throws, refusing to start with UNKNOWN_LINK_TYPE/UNKNOWN_OBJECT_TYPE/UNKNOWN_ACTION_TYPE. (2) `updateLink` effect exists — parser/index.ts:247 VALID_EFFECT_TYPES includes 'updateLink', parser/index.ts:301-305 dispatches to parseUpdateLinkEffect, parser/index.ts:514-578 builds the UpdateLinkEffect (linkType, filter, set). Test: packages/actions/src/parser/__tests__/update-link-effect.test.ts. (3) ROLLBACK_ALL now restores deleted objects — the `restoreObject` SPI op (spi/src/transaction.ts:15, spi/src/storage-provider.ts:45) is implemented in both providers (memory: _doRestoreObject at memory-storage-provider.ts:597-615; postgres: restoreObject at object-crud.ts:327-355) and wired into the compensating transaction (action-executor.ts:541-546). Test: action-executor.test.ts "restores a soft-deleted object during ROLLBACK_ALL compensation". (4) The declarative surface is real end to end: all seven effect kinds parse and dispatch (action-executor.ts:856-871); params are type-checked against the ODL declaration (action-executor.ts:686-701); permissions come from @actionType(permission:) and are enforced (action-executor.ts:294-309); side effects run with retry/backoff (action-executor.ts:484-497); both surfaces expose dryRun (resolver-generator.ts:1406, route-generator.ts:1601).

**Gap:** None — all prior gaps (manifest fatality, updateLink, ROLLBACK_ALL delete restoration) are closed. A competent user can declare create/modify/delete/link rules with parameters, submission criteria, permissions, and side effects without writing platform code.

### `actions-concurrency/governed-object-link-editing-with-writeback` — Governed object/link editing with writeback

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Re-verified against commit 0b263e6 + restoreObject SPI op (working tree clean). Three prior gaps are now CLOSED: (1) `updateLink` effect exists — parser/index.ts:247 VALID_EFFECT_TYPES includes 'updateLink', parser/index.ts:301-305 dispatches to parseUpdateLinkEffect, parser/index.ts:514-578 builds the UpdateLinkEffect (linkType, filter, set). Test: packages/actions/src/parser/__tests__/update-link-effect.test.ts. (2) Write-side field permissions exist on both REST and GraphQL update mutations — REST PUT checks writableFields (route-generator.ts:908-931, blocks fields not in getVisibleFields with 403 FORBIDDEN "Cannot write redacted fields"), GraphQL updateFoo does the same (resolver-generator.ts:1086-1104). Test: packages/api/src/__tests__/write-side-field-permissions.test.ts. (3) ROLLBACK_ALL now restores deleted objects — the `restoreObject` SPI op is implemented in both providers and wired into the compensating transaction (action-executor.ts:541-546). Test: action-executor.test.ts "restores a soft-deleted object during ROLLBACK_ALL compensation". The direct update/delete mutations still exist on GraphQL (resolver-generator.ts:976, :1044) and REST (PUT/DELETE /api/v1/{plural}/:id at route-generator.ts:864-865, :951-952) with expectedVersion / If-Match optimistic concurrency, governed by FGA 'editor' check. STILL OPEN: (a) Source-system writeback is entirely unimplemented — no writeback effect or side-effect type exists. (b) Generic link mutation outside the action path remains absent — REST/GraphQL expose links read-only; link editing is action-only via createLink/updateLink/deleteLink effects. (c) Direct update/delete mutations run no consent check and write no audit record (consentService and auditWriter are not invoked on the update/delete paths in resolver-generator.ts or route-generator.ts).

**Gap:** Source-system writeback is entirely unimplemented; generic link mutation outside the action path remains absent; direct update/delete mutations run no consent check and write no audit record. updateLink, write-side field permissions, and ROLLBACK_ALL delete restoration are now closed.

### `actions-concurrency/transactional-object-writeback-with-version-` — Transactional object writeback with version consistency

**Status:** `full`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** The provider-divergence blocker recorded on 15 Aug is CLOSED. MemoryTransaction now records the snapshot version of every object it touches (`_objectBaseVersions`, memory-storage-provider.ts:207-209) and re-checks each against committed state before flushing, throwing a `VERSION_CONFLICT`-coded error and marking itself rolled back when they diverge (memory-storage-provider.ts:300-322). The 15 Aug lost-update probe now raises instead of silently discarding T1's write. Fixed on 16 Aug: the check covered `updateObject` only, so `deleteObject` (both modes) and `restoreObject` — all three of which bump `_version` (memory-storage-provider.ts:585-624) and were added to the flush set — could still erase a concurrently committed update without conflict. Base-version capture is now a shared `captureBaseVersion` helper called from update, delete and restore alike, so every version-bumping write in the transaction participates in the commit-time check. Tests: packages/storage-memory/src/__tests__/transaction-isolation.test.ts, 4 added cases (soft-delete, hard-delete and restore contention, plus an uncontended delete guarding against over-strict rejection); 106 memory-provider tests pass, full workspace suite 34/34 packages green.

**Gap:** None. Postgres enforces version in the UPDATE `WHERE` clause, memory enforces it at commit; both raise `VERSION_CONFLICT` and REST maps it to 412 via mapCodeToCategory. GraphQL surfaces the code in-band only, which is idiomatic for GraphQL.

<details><summary>Prior evidence (15 Aug)</summary>

**Evidence (read 15 Aug):** The prior gap is FIXED: action-executor.ts:463-478 now re-uses a storage-assigned `code` and only falls back to EFFECT_EXECUTION_ERROR when the throw carries none; rest/route-generator.ts:1605-1613 turns an in-band precondition/conflict refusal into a real status via mapCodeToCategory (rest/errors.ts:134 VERSION_CONFLICT->precondition, :32 precondition->412); a regression test exists at packages/actions/src/executor/__tests__/version-conflict-code.test.ts:82. Writeback is genuinely transactional (action-executor.ts:437-479 caps check, beginTransaction/commit/rollback) and the update effect passes the context version as expectedVersion, advancing it per effect (action-executor.ts:961-966). NEW BLOCKER, provider divergence: postgres enforces the version in the UPDATE's WHERE clause against committed rows and raises VERSION_CONFLICT (storage-postgres/src/objects/object-crud.ts:258-284), but storage-memory checks expectedVersion against the TRANSACTION SNAPSHOT (memory-storage-provider.ts:516-520, snapshot taken at construction :203-211) and commit blindly flushes changed keys with no re-check (memory-storage-provider.ts:274-302). I ran it against the built provider (dist is current with src): two transactions both opened at v1, T1 wrote+committed v2, T2 wrote v2 with expectedVersion=1 and committed with NO error — final state was T2's value at _version 2, T1's write silently gone (probe: /private/tmp/claude-501/-Users-macbook-Developer-Altius-System/5fb4b4e1-1b52-4980-8ee0-2fb8c31b06d9/scratchpad/lost-update.mjs, output `FINAL: { name: 'B-wins', version: 2, err: null }`). GraphQL returns the code in-band only (resolver-generator.ts:1400-1416), no status mapping, which is acceptable for GraphQL.

**Gap:** storage-memory gives no write-write conflict detection: concurrent transactions on the same object silently lose an update (memory-storage-provider.ts:274-302 has no version re-check at commit), so 'version consistency' holds on postgres and not on memory. Same ODL + same action = different concurrency guarantees per provider.

</details>

## Security & consent

### `security-consent/access-decision-audit-trail` — Access-decision audit trail

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Re-verified 15 Aug. Retrieval landed and is tenant-safe: REST GET /api/v1/audit (rest/audit-routes.ts:47-92, mounted server.ts:1107) and GraphQL `auditRecords` both force filter.tenantId from the caller's token and role-gate on admin; `ce7ae32` made AuditRecord.tenantId required. The defining gap is untouched: `grep -c auditWriter` returns 0 in BOTH read paths (rest/route-generator.ts, graphql/resolver-generator.ts). Nothing writes operation.type 'read' or 'query', despite audit-writer.ts:10 documenting that caller.

**Gap:** No read auditing anywhere, so a DPO still cannot answer 'who read this record' and no denied read is visible. Additionally the GraphQL surface pages in JS rather than in the store (resolver-generator.ts:1974), so on Postgres it silently truncates the trail at 1000 records while REST does not.

### `security-consent/consent-management-consent-gated-reads` — Consent management / consent-gated reads

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Consent is enforced on REST list/get/search/aggregate (rest/route-generator.ts:362, 808, 1183, 1235, and the fail-loud aggregate scan cap at :335-367), GraphQL object/connection/search (resolver-generator.ts:387, 477, 697, 909), FHIR (fhir/router.ts:146, 246, 356), CDM (cdm/router.ts:175, 279, 440), functions (functions/invoke-function.ts:123, 272) and the REST traverse route (rest/traverse-route.ts:231). Recording and revoking are reachable and governed: POST /api/v1/consent (consent/router.ts:169, mounted server.ts:1110) accepts decision GRANT|DENY, role-gated (:121-128) and audited (:135-141); a later DENY wins on read because checkConsent takes the last matching record (consent-service.ts:86-100) and both stores preserve insertion order (memory-consent-store.ts:30, postgres-consent-store.ts:70 ORDER BY seq ASC). STILL UNGATED — GraphQL subscriptions: subscription-manager.ts contains zero consent references, is production-wired (server.ts:858, 924) and the delivered payload carries actual field values, not just ids (`previousValues: data.changes` — subscription-manager.ts:29, 80), FGA-checked only (:293-330, :350-390). ConsentService.revokeConsent (consent-service.ts:161-177) has NO production caller (only the SPI declaration spi/src/consent.ts:64 and three test stubs) and hardcodes `activeSessions: 0, subscriptionsTerminated: 0`, so nothing tears down a live stream on revocation. MCP: consent gating for search/query tools now exists (mcp-server/src/tools.ts:344-361, 556, consentAllows :591-608) and server.ts:1293 passes consentService — but this is UNCOMMITTED working-tree work: `git show HEAD:packages/mcp-server/src/tools.ts | grep -c consentService` returns 0 at HEAD 57cb52c, so at every committed revision the production-mounted /mcp read tools (server.ts:1282-1308) are still consent-free.

**Gap:** GraphQL subscriptions deliver changed field values with no consent check and no redaction; revocation does not terminate live subscriptions (revokeConsent is dead code returning hardcoded zeros). MCP consent exists only as uncommitted working-tree changes.

### `security-consent/object-and-property-security-policies-row-co` — Object and property security policies (row-, column-, cell-level security)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Re-verified against commit 0b263e6 (working tree clean). Row-level: real per-object FGA checks plus listObjects scoping, with fail-closed per-tenant store mapping and no fallback store (authorization-service.ts:39-49; server.ts:623). Column-level: FieldPermissionConfig is loaded from packs and wired (schema-loader.ts:933-1038, server.ts:644), redaction is applied on every read surface (rest/route-generator.ts:553, 797, 915; resolver-generator.ts:342, 377, 460, 686, 791, 1014, 1289; cdm/router.ts:170, 272; functions/invoke-function.ts:108), and the filter/sort oracle is closed on REST list (route-generator.ts:519-537), GraphQL (resolver-generator.ts:197-210, 745, 1134-1142, 1242-1271), FHIR (fhir/router.ts:191-194) and MCP (mcp-server/src/tools.ts:274-277). Two prior gaps are now CLOSED: (1) Write-side field permissions exist on both REST and GraphQL update mutations — REST PUT checks writableFields (route-generator.ts:908-931, blocks fields not in getVisibleFields with 403 "Cannot write redacted fields"), GraphQL updateFoo does the same (resolver-generator.ts:1086-1104). Test: packages/api/src/__tests__/write-side-field-permissions.test.ts. (2) Subscription previous-value redaction — subscription-manager.ts:324-333, 396-403 calls redactPreviousValues which uses getVisibleFields to mask previousValues on delivered subscription events. STILL ABSENT — cell-level: getVisibleFields(userId, roles, objectType) has no row/object parameter and computes a union of role->field sets (authorization-service.ts:315-343), so field visibility cannot vary per row.

**Gap:** No cell-level (per-row) field visibility — getVisibleFields (authorization-service.ts:315-343) has no object/row ID parameter and computes type-level field visibility only. Write-side field permissions and subscription payload redaction are now closed.

### `security-consent/sensitive-data-pii-protection-controls` — Sensitive-data (PII) protection controls

**Status:** `partial`

**Evidence (read 15 Aug):** @sensitive now has a real runtime consumer: api/src/schema-loader.ts:560-606 deriveSensitiveFieldDefaults synthesises a deny-by-default FieldPermissionConfig (alwaysVisible = all non-sensitive stored fields, fieldsByRelation:{}) for any ObjectType that declares @sensitive but ships no permissions/field-permissions.yaml; called at schema-loader.ts:963 after merge. Because getVisibleFields returns undefined (= no redaction) for an unconfigured type (authorization-service.ts:240-243), this is the piece that makes the directive enforceable. Verified against the shipped packs: only domain-packs/nhs-acute ships permissions/field-permissions.yaml, so aml Customer.name/dateOfBirth/taxId (domain-packs/aml/schema/customer.odl:11,17,18), aml Account.accountNumber (account.odl:11) and supply-chain Supplier.contactEmail (supplier.odl:14) are now redacted for every caller. schema-loader.ts:539-547 universallyVisibleSensitive warns when an explicit config re-exposes a sensitive field via alwaysVisible or `viewer`.

**Gap:** Protection is redaction-on-read only, and not on every read path. (1) GraphQL subscriptions ship raw sensitive values: ChangeEvent.previousValues = data.changes (subscription-manager.ts:73) is delivered after an object-level FGA check with no redactFields and no consent (subscription-manager.ts:285-357). (2) MCP search_<Type> redacts (mcp-server/src/tools.ts:304) but McpServerDependencies has no consentService (mcp-server/src/types.ts:22-31). (3) Sensitive values are written unmasked into the audit trail (actions/src/executor/action-executor.ts:449-470 detail.before/after) and into CloudEvents; grep for redact|mask|pii across packages/observability/src, packages/sync/src and packages/engine/src returns zero hits, so nothing masks them in logs or sync. (4) No PII discovery/classification, no tokenization, no encryption or masking at rest, no format-preserving transforms — the only other @sensitive reader is odl/src/codegen/sdk.ts:61,89-91 which merely widens the TS type to `T | Redacted`. (5) The one shipped reference config re-exposes sensitive fields: domain-packs/nhs-acute/permissions/field-permissions.yaml grants @sensitive name/family/given to `viewer`, which only produces a boot warning.


## defect-fixes

### `defect-fixes/derived-computed-properties` — Derived/computed properties

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Re-verified against commit 0b263e6 (working tree clean). Three prior gaps are now CLOSED: (1) ODL validator whitelist updated — BUILTIN_COMPUTE_FNS now includes countLinks, lookupField, sumLinks, avgLinks, minLinks, maxLinks (odl/src/validator/index.ts:495-502), so `odl validate` and `odl apply` no longer reject schemas using the runtime's builtins. (2) EAGER computed fields are evaluated on reads — getComputedFields (computed-field-evaluator.ts:310-324) now includes EAGER alongside LAZY, so a field declared cache: EAGER is evaluated at read time rather than silently null. EAGER is treated the same as LAZY (read-time evaluation) until a write-time cache pipeline exists. Test: packages/engine/src/__tests__/computed-eager.test.ts. (3) MCP reads now use ObjectManager when injected — mcp-server/src/tools.ts:340-349 calls deps.objectManager.query(...) when available, falling back to direct storage only when no manager is injected. API wiring passes objectManager at server.ts:1294-1297. Still present from before: computed fields are resolved on list paths via withComputed (object-manager.ts:349, 387, 415-434), REST and GraphQL list/search go through ObjectManager, the evaluator's builtin registry has all six builtins with FunctionType dispatch (:273-284). STILL OPEN: (a) Computed fields are not available for filtering, ordering, or aggregate operations — aggregate validation intentionally excludes computed fields (route-generator.ts:1334, resolver-generator.ts:1285). (b) MCP fallback mode bypasses ObjectManager if no manager is injected, although production wiring provides one. (c) EAGER is read-time evaluation, not true write-time materialization — the source comments describe this as MVP-compatible.

**Gap:** Computed fields cannot be used in filter, orderBy, or aggregate operations (intentionally excluded from aggregatable sets); EAGER is read-time evaluation rather than write-time materialization. The validator whitelist, EAGER evaluation, and MCP ObjectManager routing are now closed.

### `defect-fixes/full-text-search-index-backed` — Full-text search (index-backed)

**Status:** `partial`

**Evidence (read 14 Aug):** The DDL/runtime mismatch IS fixed: packages/storage-postgres/src/schema/ddl-objects.ts:104-109 now emits `CREATE INDEX ... USING gin (col gin_trgm_ops)` for FULLTEXT IndexDefinitions (no tsvector anywhere), and packages/storage-postgres/src/schema/index.ts:90-97 emits `CREATE EXTENSION IF NOT EXISTS pg_trgm` when any FULLTEXT index exists; both run in production wiring via generateDDL → applySchema (postgres-storage-provider.ts:213, :301-302), itself called at boot (packages/api/src/server.ts:209). FULLTEXT indexes come from @searchable (packages/api/src/schema-loader.ts:695-698). Runtime is unchanged ILIKE (packages/storage-postgres/src/objects/search.ts:96-135). Conditions on index use: search.ts:127-135 ORs `col ILIKE $n` across EVERY requested field, so Postgres can only use indexes if all branches are trgm-indexed; with no explicit fields, search.ts:110-120 searches every text column, most of which have no index. The API's default is worse than 'unindexed': packages/api/src/graphql/resolver-generator.ts:886-888 and packages/api/src/rest/route-generator.ts:919-921 default `fields` to ALL visible fields from the column policy, which for the reference pack (domain-packs/nhs-acute/permissions/field-permissions.yaml:11-21) includes `id` and `dateOfBirth`; search.ts:130 maps them via fieldCol → `"id"` (no such column — @primary is dropped at schema-loader.ts:672-673 and stored as _id) and `"date_of_birth"` (DATE per type-mapping.ts:15) → `ILIKE` on a DATE/nonexistent column is a SQL error, not a slow scan. Also `@searchable(weight:)` is parsed (packages/odl/src/parser/types.ts:83) and dropped — it never reaches IndexDefinition or the CASE-WHEN scoring. The integration proof (packages/storage-postgres/src/__tests__/search.integration.test.ts:113-130) EXPLAINs a hand-written `"title" ILIKE '%summar%'`, not the SQL searchObjects actually generates (no ESCAPE, no parameter, no tenant/deleted predicates, no OR).

**Gap:** Index-backed only on the field-restricted path over @searchable columns; the default (fields omitted) path is a scan when no column policy exists and raises a Postgres error (undefined column "id" / no ILIKE operator for DATE) when one does. No ranking (weight ignored), no stemming/tsquery, no relevance beyond match-count. Upgrading an existing deployment trips the DDL checksum guard (postgres-storage-provider.ts:239-247) until schema.version is bumped, because FULLTEXT DDL text changed.

### `defect-fixes/link-change-events-to-type-level-subscribers` — Link change events to type-level subscribers

**Status:** `full`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** The link-change-events gap is fully closed end-to-end. The engine emitter carries optional `fromType`/`toType` fields (packages/engine/src/events/event-emitter.ts:119-137, :169-189) and LinkManager passes `linkDef.from`/`linkDef.to` on create/update/delete (packages/engine/src/links/link-manager.ts:101-110, :174-185, :224-234). The action-event-publisher bridge (packages/api/src/events/action-event-publisher.ts:48-75) looks up endpoint types from the schema's link types and passes them to `emitLinkCreated`/`emitLinkDeleted`, so action-driven link changes now reach the same type-level `${lowerFirst(type)}Changed` topics that engine-driven changes do. The subscription manager (subscription-manager.ts:99-125) routes each endpoint to the type-level topic when types are present, falling back to per-ID only when absent. Tests: packages/api/src/__tests__/action-event-publisher.test.ts (4 tests covering created/deleted/unknown-link-type/routing) and packages/api/src/__tests__/subscriptions.test.ts:269-292 (both branches).

**Gap:** None — type-level delivery works for both engine-driven and action-driven link changes. The minimal {id,_type} payload shape and single-pod in-memory bus are platform-wide constraints, not specific to this row.


## links-graph

### `links-graph/graph-traversal-query-primitive-search-aroun` — Graph traversal query primitive — search-around equivalent, data layer (report line 241)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Re-verified 15 Aug. Same capability as `storage-conformance/graph-traversal-query-primitive`, which the 41-row pass graded `full` on replaced evidence: REST (packages/api/src/rest/traverse-route.ts:153, mounted server.ts:1108), GraphQL (`traverse<Type>`, odl/codegen/index.ts:919, resolver-generator.ts:2073), MCP (`traverse_<Type>`, mcp-server/src/tools.ts:482) all accept a TraversalPath. Both providers implement it with matching semantics and the shared conformance suite covers filter, edge-drop and soft-delete (tests/spi-conformance/src/categories/links.ts:425-476; 319 memory tests pass). Step filters honoured on both; default limits aligned.

**Gap:** None blocking. Residual shape limits, same as the storage-conformance row: `maxDepth` throws unimplemented on both providers so there are no variable-length paths, only the terminal step's nodes return, the REST route is absent from the OpenAPI document, and GraphQL lacks the offset REST exposes.

### `links-graph/link-types-bidirectional-relationships-cardi` — Link types — bidirectional relationships, cardinality, self-links, traversal (report line 118)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Both remaining sub-gaps are CLOSED. (a) Self-links: a fixture now proves `@linkType(from: "Comment", to: "Comment")` parses, validates clean, and generates a buildable GraphQL schema and a usable OpenFGA model (packages/odl/src/__tests__/self-link.test.ts). Fixing the fixture exposed a real defect the previous fixture could not reach — its self-link field was declared INBOUND, so `getOutboundLinks` returned nothing and the derivation path was never entered. With an OUTBOUND self-link the generator emitted `viewer: viewer from reply_to` on type `comment`: legal OpenFGA (the canonical recursive-folder shape) but with no base case, so no tuple can satisfy it and every check on a Comment fails closed and silently. codegen/openfga.ts:170-186 now excludes self-links from the derivation basis while still emitting the relation itself, so self-link tuples stay storable and traversable and the type falls through to direct `assigned: [user]` grounding. The test asserts the generated shape and fails against the pre-fix generator. (b) GraphQL traverse is committed as of HEAD: `traverse<Type>(startId, steps, limit): TraversalResult!` in odl/codegen/index.ts:955 with the resolver in graphql/resolver-generator.ts, so filtered multi-hop traversal is reachable from GraphQL as well as REST. Unchanged and still verified: cardinality enforced three deep with both providers agreeing, link-field Relay pagination, per-target FGA on link reads.

**Gap:** None for this row. Variable-depth (`maxDepth`) traversal remains unimplemented on both providers and per-side display names remain absent, but both are platform-wide traversal limits tracked on the graph-traversal rows, not link-type gaps — and neither is named by this capability.

<details><summary>Prior evidence (14–16 Aug)</summary>

**Evidence (read 14 Aug):** CONFIRMED halves: ODL `@linkType(from,to,cardinality)` parsed and validated (packages/odl/src/validator/index.ts:75-89 endpoint rule, :366-374 cardinality-enum rule); both sides of a relationship are declarative, no platform code — domain-packs/nhs-acute/schema/ward.odl:16-17 (`patients: [Patient!]! @link(type:"AdmittedTo", direction: INBOUND)`) against patient.odl:30-33 (OUTBOUND). Cardinality is enforced three deep and both providers agree: engine advisory check packages/engine/src/links/link-manager.ts:328-392, Postgres storage check packages/storage-postgres/src/links/link-crud.ts:264 plus partial unique indexes packages/storage-postgres/src/schema/ddl-links.ts:57-72, memory storage check packages/storage-memory/src/memory-storage-provider.ts:429. Reads are exposed and authz-checked: GraphQL link-field resolvers with a per-target FGA `viewer` check packages/api/src/graphql/resolver-generator.ts:346-354, REST GET /api/v1/{plural}/:id/links/:linkType packages/api/src/rest/route-generator.ts:602-660. Link events now carry endpoint types end-to-end: link-manager.ts:101-111 -> packages/engine/src/events/event-emitter.ts:119-140 (fromType/toType) -> packages/api/src/subscriptions/subscription-manager.ts:110-111 (type-level topic `${lowerFirst(type)}Changed`) with per-event FGA at :299-304, and production fan-out is real (RedpandaEventBus implements SubscribableEventBus, packages/api/src/events/redpanda-event-bus.ts:43, wired at packages/api/src/server.ts:279-288).
UPDATE (16 Aug): B2 is CLOSED — list link fields now accept `first`/`after` arguments (odl/codegen/index.ts:138) and the resolver paginates with cursor decoding (resolver-generator.ts:319-350), returning a Relay Connection with edges/pageInfo/totalCount/hasNextPage. Test: packages/api/src/__tests__/link-field-pagination.test.ts. The SDK now has link field accessors (e.g. `client.ward.list()` returns patient IDs, `client.patient.list()` returns admission IDs). STILL OPEN: (a) Self-links: no `@linkType` in any of the four domain packs has from == to, and there is no self-link test anywhere; packages/odl/src/codegen/openfga.ts:170 comments that self-links are excluded from permission derivation but the loop at :172-186 does not exclude them, so a self-referential link type would emit `viewer: viewer from <its own relation>` on its own type. (b) Multi-hop 'traversal' — see the traverse row; the SPI primitive is reachable from REST but GraphQL traverse is uncommitted.

**Gap:** Missing to reach full: at least one self-link fixture proving @linkType(from: X, to: X) parses, migrates, and produces a valid OpenFGA model; GraphQL traverse resolver is uncommitted. Link field pagination (B2) is now closed. Per-side display names remain absent as the report says, but that is cosmetic.

</details>

### `links-graph/system-graph-substrate-the-object-link-graph` — System graph substrate — the object/link graph scenarios are configured against (report line 283)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Half the prior gap is CLOSED: a filtered multi-hop query is now reachable by an API user without platform code. POST /api/v1/{plural}/:id/traverse is generated for every ObjectType (rest/traverse-route.ts:144-160, 277-281; mounted server.ts:1108), takes an array of steps each with direction and its own filter expression (:103-107), FGA-checks the start object and every returned node, and applies consent (:231). Postgres implements it with SQL JOINs plus per-step filterToSql (storage-postgres/src/links/traversal.ts:24, 213-217); memory applies the step filter in evaluateFilter (memory-storage-provider.ts:1157-1158). The age-write-loss defect is fixed: ageQuery now wraps the Cypher in SAVEPOINT age_op and rolls back only itself, so a broken AGE install no longer poisons the caller's transaction and turns COMMIT into a silent ROLLBACK (object-crud.ts:482-526), and the failure is logged at error level outside tests (:518-524). NOT closed: AGE remains a write-only mirror nothing reads — updateAgeVertex writes `SET v.updated = true` with no property sync (object-crud.ts:552-556), read traversal goes through SQL JOINs, and healthCheck explicitly reports-but-never-requires AGE (postgres-storage-provider.ts:605-630). Yet the dependency is still load-bearing at deploy time: generateGraphSetupDDL emits `CREATE EXTENSION IF NOT EXISTS age` / create_graph / per-type create_vlabel+create_elabel (schema/ddl-graph.ts:22-68), includeGraph defaults true with no override anywhere (schema/index.ts:74, 110-112), and graph DDL is concatenated into ddl.all (:133-141) which applySchema executes inside the migration transaction (postgres-storage-provider.ts:336-338) — so schema application fails on a Postgres without the AGE binary, for a graph no query touches. Variable-depth traversal is unimplemented in BOTH providers: TraversalStep.maxDepth throws 'not implemented' (storage-postgres/src/links/traversal.ts:119-133; memory-storage-provider.ts:1102-1110), so only fixed-length paths are expressible. GraphQL traverse<Type> (resolver-generator.ts:2073-2154) exists only as uncommitted working-tree work — 0 hits at HEAD 57cb52c — so today the filtered traversal is REST-only.

**Gap:** AGE is still a decorative write-only mirror (v.updated = true, no property sync, nothing reads it) while its extension is still mandatory in the applied DDL; no variable-depth (maxDepth) traversal on either provider; filtered traversal is reachable on REST only — the GraphQL resolver is uncommitted.


## ai-agent-surface

### `ai-agent-surface/external-ai-ide-access-via-mcp-external-agen` — External AI/IDE access via MCP (external agents read data+metadata under user-token permissions, admin-enabled per user/group in Control Panel)

**Status:** `partial`

**Evidence (read 14 Aug):** One of three sub-gaps closed. Closed: the protocol server exists and reads run under the caller's token — packages/mcp-server/src/tools.ts:263-267 scopes every search to authorizationService.listObjects(`user:${user.id}`, 'viewer', ...), fails closed to an empty page when nothing is authorized (tools.ts:280-285), and redacts per-role fields (tools.ts:304-309). Still open: (a) admin gating is per-PACK, not per-user/group — packages/api/src/server.ts:542 (`packCapabilities.has('mcp')`) and domain-packs/nhs-acute/pack.yaml:14-17 are the only switch; there is no per-user or per-group enablement anywhere; (b) tool discovery is not permission-scoped — packages/mcp-server/src/server.ts:74 builds the list once at server construction and server.ts:161-164 returns every action and every search tool to every authenticated caller, so an agent for a read-only user still sees every mutating action tool (execution is denied later at ActionExecutor step 2, but discovery leaks the full action catalogue and its parameter schemas); (c) no packaged IDE integration — no .mcp.json/manifest, no OAuth discovery endpoint (repo-wide grep: no /.well-known/oauth-protected-resource), so IDE setup is manual bearer-token configuration.

**Gap:** MCP access is enabled per-pack, never per-user or per-group; tools/list returns the full action catalogue to every authenticated caller; no IDE package or OAuth discovery, so setup is manual token pasting.

### `ai-agent-surface/llm-agent-tool-access-to-platform-ontology-m` — LLM/agent tool access to platform (Ontology MCP, Palantir MCP, OAuth grant types)

**Status:** `partial`

**Evidence (read 14 Aug):** Half the stated gap closed, half confirmed. Closed: the MCP protocol server exists and is mounted (packages/mcp-server/src/server.ts:72-136; packages/api/src/server.ts:1199-1238), and the surface is no longer actions-only — search_<Type> read tools now exist (tools.ts:95-128, 249-324). Confirmed still open: the builder-side "Palantir MCP" half is entirely absent — grep across packages/mcp-server/src shows no schema-editing, SQL, ODL-CLI, or platform-ops tool; buildToolList (tools.ts:46-59) can only emit action and search tools. OAuth is bearer-validation only: packages/mcp-server/src/auth.ts:70-77 calls authenticator.authenticate(token) against the shared OidcAuthenticator (packages/security/src/auth/oidc-authenticator.ts:38-56, real jose createRemoteJWKSet/jwtVerify) — there is no authorization_code or client_credentials grant handling, no dynamic client registration, no client management surface anywhere in the repo. And auth.ts:16-33/59-67 grants an unauthenticated caller the DEV_USER identity carrying admin + 8 other roles whenever isDev — which packages/api/src/server.ts:118 defines as `process.env['NODE_ENV'] !== 'production'`, i.e. every non-production deployment leaves /mcp open with full-role identity.

**Gap:** No builder/ops tool surface (schema editing, SQL, platform ops); OAuth is token-validation only with no grant types or client management; dev-mode fallback (NODE_ENV != production) admits unauthenticated callers as a 9-role admin.

### `ai-agent-surface/uniform-governance-of-ai-actors-agents-under` — Uniform governance of AI actors (agents under same security/audit as humans)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Re-verified against commit 0b263e6 (working tree clean). An MCP action call runs the identical 8-stage pipeline — packages/mcp-server/src/tools.ts:232-238 calls deps.actionExecutor.execute, the same executor instance GraphQL and REST receive (server.ts:1204). Three prior non-uniformities are now CLOSED: (1) Per-principal rate limiting is wired on /mcp — server.ts:110-131 calls deps.rateLimiter.check({tenantId, principalId}) and returns JSON-RPC error with HTTP 429 when disallowed. API wiring passes rateLimiter at server.ts:1294. Note: the implementation fails open if the limiter throws (server.ts:128-130). (2) Consent purpose is configurable — mcp-server/src/types.ts:54-60 adds consentPurpose to McpServerDependencies, tools.ts:20-29 resolveConsentPurpose reads deps.consentPurpose falling back to DIRECT_CARE. API wiring passes consentPurpose at server.ts:1295. (3) Agent actor stamping — tools.ts:233 stamps `type: 'agent'` on the ActionActor, so audit records distinguish agent from human. ActionActor includes 'agent' (actions/src/executor/types.ts). Test: packages/mcp-server/src/__tests__/mcp-server.test.ts:673. STILL OPEN: The agent-specific PolicyGuard/human-approval and dry-run path remain an unwired library interface — packages/actions/src/tools/tool-registry.ts:89-90, 153-178 defines ToolRegistry.executeForAgent with dry-run and PolicyGuard high-risk approval hold, but PolicyGuard has no implementation in the repo, and the only production `new ToolRegistry` (resolver-generator.ts:1133) is constructed without executor or policyGuard arguments.

**Gap:** The agent-specific PolicyGuard (human-approval hold for high-risk actions) and dry-run path exist only as an unwired library interface with zero implementations (tool-registry.ts:89-90, 153-178). Per-principal rate limiting, configurable consent purpose, and agent actor audit stamping are now closed.


## data-ops

### `data-ops/grouped-aggregation-pivot-backend-over-objec` — Grouped aggregation / pivot backend over object sets (report line 232)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Re-verified against commit 0b263e6 (working tree clean). Four prior gaps are now CLOSED: (1) REST aggregate alias ordering — route-generator.ts:1337-1358 builds aliasNames from field/bucket aliases and excludes them from the unknown-field check, so "top N groups by the measure" (orderBy on an aggregate alias) now works over REST. Test: packages/api/src/__tests__/aggregate-orderBy-alias.test.ts:89-109. (2) GraphQL aggregate now exposes orderBy, limit, offset — SDL includes `orderBy: [AggregateOrderByInput!], limit: Int, offset: Int` (odl/codegen/index.ts:949), and the resolver threads them through (resolver-generator.ts:1263-1265, 1373-1375). Test: aggregate-orderBy-alias.test.ts:161-176. (3) GraphQL aggregate field validation — resolver-generator.ts:1278-1314 builds aggregatable from schema fields minus @link/@computed and throws VALIDATION_ERROR for unknown names. Test: packages/api/src/__tests__/aggregate-field-validation.test.ts:77-94. (4) Object-set aggregate field validation and consent gate — route-generator.ts:2176-2215 now checks visibleFields (field-level auth) and calls resolveConsentedIds (consent gate) on the object-set aggregate route. Test coverage in aggregate-orderBy-alias.test.ts:189-275. Still present from before: bucket interval is allowlisted in both providers (aggregate.ts:66-72, memory:771-776), MIN/MAX-on-non-numeric throws in both, consent is applied on per-type aggregate on both surfaces. STILL OPEN: (a) No distinct, percentile, median, standard deviation, HAVING, or running totals — ALLOWED_FNS = count|sum|avg|min|max in both providers. (b) No MCP aggregate tool — tools are search_* and traverse_* only. (c) Aggregation over a traversal-derived set is impossible — ObjectSetDefinition is one objectType + filter + orderBy + limit + one aggregation, no traversal source, no union/intersect. (d) Object-set aggregate route has field-level auth and consent but no aggregatable field-name validation (only the per-type REST and GraphQL routes have that).

**Gap:** No distinct/percentile/median/stddev/HAVING/running-total (ALLOWED_FNS is count|sum|avg|min|max only); no MCP aggregate tool; no aggregation over traversal-derived or composed sets; object-set aggregate route lacks aggregatable field-name validation (has field-level auth and consent but not the unknown-field check). REST alias ordering, GraphQL orderBy/limit/offset, GraphQL field validation, and object-set consent are now closed.

### `data-ops/object-sets-saved-shareable-executable-objec` — Object sets — saved, shareable, executable object collections with aggregations (report line 151)

**Status:** `partial`

> **RE-VERIFIED 15 Aug 2026 — still partial — unchanged.** Re-verified 15 Aug: no `executeObjectSet` in codegen (0 hits), so execution remains REST-only; sharing is still the single `isPublic` boolean in packages/spi/src/object-set.ts. Neither gap moved.

**Evidence (read 14 Aug):** Real and wired in both providers: packages/api/src/server.ts:718-720 selects PostgresObjectSetStore(storage.pool) or InMemoryObjectSetStore and builds ObjectSetManager; packages/storage-postgres/src/object-sets/postgres-object-set-store.ts:42,53-75 self-initialises the _object_sets table; packages/engine/src/object-sets/in-memory-object-set-store.ts:11 mirrors it. REST is complete: packages/api/src/rest/route-generator.ts:207 registers CRUD at :1103/:1123/:1155/:1192/:1223, execute at :1246 (auth-filtered, redacted, consent-paginated, plus ?format=ndjson at :1358) and aggregate at :1391. BUT — (a) sharing is one boolean: in-memory-object-set-store.ts:130-134 and postgres-object-set-store.ts:227-231 (visibilitySql) implement only isPublic=tenant-wide vs creator-only, and mutation is creator-only (postgres-object-set-store.ts:206-222 loadForMutation); there is no grant to a user, group or role. (b) GraphQL exposes definitions only — packages/odl/src/codegen/index.ts:750-751 and 781-783 emit objectSet/objectSets/create/update/deleteObjectSet and no execute/aggregate field; packages/api/src/graphql/resolver-generator.ts:1162-1280 confirms no execution resolver. (c) SEC-14 predicate check is missing on the execute path: route-generator.ts:279-281 (list) and :1447-1462 (object-set aggregate) call getVisibleFields and reject filters over redacted fields, but the execute handler (:1246-1387) never does — a saved filter on a redacted field is executed verbatim. (d) No set algebra: ObjectSetDefinition is one objectType + one filter + orderBy + limit + one aggregation (packages/spi/src/object-set.ts), no union/intersect/subtract/search-around composition. (e) create does no input validation (route-generator.ts:1167-1181 casts body fields straight through).

**Gap:** No per-user/group sharing or ACL; no GraphQL execution; no object-set algebra (union/intersect/subtract/search-around); execute leaks predicates over redacted fields.


## actions-writeback

### `actions-writeback/transactional-object-writeback-via-actions-w` — Transactional object writeback via Actions with version consistency — edits through actions, read-your-writes, StaleObject/version-conflict detection, edit history retention (report line 502)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Re-verified 15 Aug. The prior gap is closed: `expectedVersion` is threaded to storage (action-executor.ts:961-966), a storage-raised VERSION_CONFLICT keeps its code across the transaction boundary (action-executor.ts:463-478), and a stale `If-Match` now answers 412 rather than 200 (rest/route-generator.ts:1605-1613). A NEW and more serious defect replaces it, found by the 41-row pass and reproduced by running the built provider: storage-memory checks expectedVersion against the TRANSACTION SNAPSHOT (memory-storage-provider.ts:516-520) and commit flushes changed keys with no re-check (:274-302). Two transactions opened at v1; T1 wrote and committed v2; T2 wrote with expectedVersion=1 and committed with NO error — T1's write was silently lost.

**Gap:** storage-memory gives no write-write conflict detection: concurrent transactions on the same object silently lose an update, so 'version consistency' holds on Postgres and not on memory — same ODL, same action, different concurrency guarantee per provider. Separately, a manifest still cannot declare a version on an updateObject effect.
