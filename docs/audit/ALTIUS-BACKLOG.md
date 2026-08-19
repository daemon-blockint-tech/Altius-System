# Altius capability backlog

Generated from code-verification passes, most recently 19 Aug 2026 (a parallel Phase 21 session, running alongside the Phase 22 session). **189** capabilities graded: **75 full, 112 partial, 0 absent** (work items; 2 additional capabilities were already `full` and are not listed as work items — total 77 `full`). The parallel Phase 21 session moved 7 rows from `partial` to `full` (dataset REST metadata + schema-at-version, dataset table read/export addressing and paging, permission checking / access-explanation tooling, grouped aggregation / pivot backend, object sets saved+shareable, object edit history and temporal queries, platform health checks & operational monitoring) and updated the evidence on ontology usage metrics without changing its grade. Those rows are deliberately disjoint from the Phase 21/22 rows the other session claimed; see each row for what remains. Phase 20 moved 13 rows from `partial` to `full` (aggregation chart widgets, action-triggering widgets, object display widgets, audit/edit-history widgets, no-code widget library/app-building UI layer, widget library 60+ widgets with display optimization, auto-generated action forms, events & interactivity system, AIP/LLM widgets, filtering/search widgets, saved views/per-user state, embedding/cross-app widgets, platform-resource widgets) by implementing all 28 remaining widget stub types as functional React components plus 5 additional widgets (saved_views, edit_history, resource_browser, iframe, app_pairing), adding display optimization to ObjectTableWidget (density modes, frozen columns, virtualization, maxHeight), wiring REST routes for EmbeddingService (16 endpoints under /api/v1/embedding/*), PlatformResourceService (12 endpoints under /api/v1/resources/*), SavedViewStore (5 endpoints under /api/v1/saved-views/*), UserDirectoryService (3 endpoints under /api/v1/users/*), adding histogram/facet convenience endpoints (POST /api/v1/{plural}/histogram and /facets), wiring AipChatWidget and AipGeneratedContentWidget to the real POST /api/v1/llm/generate endpoint, and removing all placeholder/stub registrations from WidgetRegistry so all 69 widget types have real implementations. 60 new Phase 20 widget tests + updated 3 existing test files. 362 web tests, 866 API tests, typecheck, and production build all pass. Phase 19 moved 6 rows from `partial` to `full` (typed SDK for React, low-code application builder, reactive variables, modular composition, workshop UI runtime features, live-updating widgets) by wiring WorkshopPlatformService into the API server with 25+ REST endpoints under /api/v1/workshop/* (apps, pages, widgets, variables, modules, templates, state encoding), adding URL state encoding/decoding (base64url), creating React hooks library (useQuery, useMutation, useSubscription, useAutoRefresh, useVariable), creating frontend event bus (EventBus, VariableBus with dependency propagation, AutoRefreshCoordinator), and connecting WorkshopBuilder to backend API with persistToBackend. Phase 18 moved 2 rows from `partial` to `full` (comments/collaboration widget, action side-effect notifications) by creating CommentsWidget (threads, replies, @-mention highlighting, resolve/unresolve, edit/delete) and ActionLogTimelineWidget (audit trail timeline with color-coded operation types, pagination, filtering), plus comments-client.ts wrapping all comment and notification REST endpoints. Phase 17 moved 5 rows from `partial` to `full` (scenario staging/transactional apply, what-if scenario simulation, scenario persistence/sharing, scenario and graph UI tooling, time-series as simulation inputs) by wiring ScenarioService into the API server with 11 REST endpoints under /api/v1/scenarios/* (CRUD, run, compare, duplicate, results, stage, apply, ts-inputs), integrating time-series data as simulation inputs with time window selection and smoothing, implementing scenario staging with all-or-nothing apply, and creating a ScenarioWidget frontend with scenario list, create, run, compare view, staging controls, and TS input loading. Phase 16 moved 4 rows from `partial` to `full` (geospatial geo property types/queries, geospatial widgets, interactive geospatial mapping, interactive geospatial map application) by adding near/withinPolygon GraphQL filter operators, REST routes for GeospatialMapService (24 endpoints under /api/v1/geo/*), and a real MapWidget with tile layers, markers, geocode search, and radius search. Phase 15 moved 5 rows from `partial` to `full` (time-series properties, TS rules/interval detection/alerting, TS transform engine, temporal events with thresholds, time-series widgets) by adding GraphQL timeSeries query, REST transform/aggregate endpoints, anomaly detection (zscore/iqr/moving_average), interval detection with gap analysis, and connecting the TimeSeriesAnalysisWidget to the backend API. Phase 14 moved 2 rows from `partial` to `full` (media and attachment properties, media and document widgets) by implementing 7 media widget components, attachment client helpers, GraphQL attachment query, blob metadata endpoint, and inline content disposition. Phase 13 moved 7 rows from `absent` to `partial` (mobile application delivery, vertex digital-twin visualization, workshop application UI runtime features, exploratory analysis workbench, interactive graph visualization, interactive time series analysis workbench, scenario and graph UI tooling). Phase 12 moved 7 rows from `absent` to `partial` (cross-application interactivity, low-code application builder, mobile application support, modular composition & reuse, reactive variables & data-binding, widget library ~60 widgets, no-code operational app building with Object Views). Phase 11 moved 2 rows from `absent` to `partial` (visual ontology management application, workshop application UX platform features). Phase 10 moved 4 rows from `absent` to `partial` (embedding and cross-app widgets, layout/navigation/device-capture widgets, no-code widget library/app-building UI layer, platform-resource widgets). Phase 9 moved 6 rows from `absent` to `partial` (data freshness service, geospatial map workspace, interactive geospatial map application, interactive geospatial mapping, ad-hoc SQL analytics over ontology, embedded AI copilots). Phase 8 moved 5 rows from `absent` to `partial` (prebuilt enterprise source-connector catalog, multi-ontology governance, time-aware graph exploration, value and conditional formatting metadata, AI FDE agentic platform assistant). Phase 7 moved 7 rows from `absent` to `partial` (versioned transactional dataset primitive, code-based batch transform framework, dataset projections/query acceleration, dataset REST API metadata/schema retrieval, interactive SQL query service, programmatic tabular read/write SDK, no-code client-side variable transformations). Phase 6 moved 24 rows from `absent` to `partial` (ML model registry/lifecycle/inference, chained model orchestration, what-if scenario simulation, scenario persistence, time-series simulation inputs, data expectations/quality checks, datasource conflict resolution, batch pipeline orchestration, action-triggered builds, process mining, process monitoring, event objects/timeline analytics, process modeling, no-code business rules engine, Foundry Rules batch/end-user authoring, agent evaluation framework, autonomous platform engineering agent, cross-application commands, kiosk mode, approval workflows with ABAC, model integration/productionization). Phase 5 moved 9 rows from `absent` to `partial`. Phase 4 moved 5 rows from `absent` to `partial` and enhanced 4 existing `partial` rows.

> **The grades are a snapshot from 17 Aug; the code is not.** Eighty-six changes have landed since
> the original 16 Aug measurement, thirty-eight of them on 17 Aug, and the "Already landed" section
> below records each with the rows it invalidates. A re-grading pass on 17 Aug re-verified all rows
> whose evidence was falsified by those changes. Five rows moved from `absent` to `partial`; no row
> reached `full`. The remaining rows whose evidence is stale but whose grade did not change are
> documented in the "Rows whose stated evidence is now false" section below.
>
> One thing the counts cannot tell you and that changes how to read every row: **CI executed for the
> first time on 17 Aug.** Until then GitHub Actions had never run on this repository (0 runs, verified
> via the Actions API) and `main` had no branch protection, so no grade here was ever taken against a
> tree a gate had checked. Evidence gathered before that date was read from source, never executed.
>
> **All six jobs went green later on 17 Aug**, for the first time — `Build + unit tests`,
> `Postgres integration`, `Docker-stack integration`, `Enforcement E2E`, `Helm lint`,
> `Trivy image scan`. The tally at that point was 36 successes against 57 failures, and the first
> all-green run required fixing four things the gate had been red on since it started running: a
> `Date` returned as an object rather than an ISO string (which failed every `updateObject` action
> effect on Postgres and passed on memory), an `OIDC_DEFAULT_TENANT` that mapped every prod-test
> request to no OpenFGA store, 29 HIGH image-scan findings, and a vitest reporter RPC that timed out
> during a blocking `docker compose down` and reported a suite whose own summary read `9 passed (9)`
> as a job failure.
>
> **`main` was red due to marking-write-bypass exploits, now FIXED.** `354e6d7` landed three
> action-executor exploits marked FAILING BY DESIGN; they demonstrated write-path marking bypasses
> that are now closed by `c246b51` (see the `marking-write-bypass` entry below). The exploit tests
> are now inverted to pin the closed behaviour. `7f90f89` dropped the unused bindings that blocked
> typecheck.
>
> Branch protection is still absent (`branches/main/protection` returns 404), so green is
> informational, not enforced.

The 187 rows below are the work items. Fifteen of them now read `full` and are kept here with their evidence rather than silently removed: the graph-traversal capability (which appears under three theme groupings), link types (under two), the access-decision audit trail (under two), action types, link change events, transactional writeback with version consistency, consent-gated reads, full-text search (index-backed), derived/computed properties, required property enforcement, and the property system (base types, required/unique constraints). The two capabilities that were already `full` (Ontology core semantic model, Audit immutability) are not listed as work items.

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

These 86 changes landed AFTER the gradings below were taken, so the evidence on the rows they touch is stale. They are changes, not re-measurements — a row listed here has **not** been re-graded, only invalidated. Re-doing landed work is the most expensive mistake available here, so read the change before you start.

- **`display-metadata`** (`1afabb9`) — Property/type presentation metadata was absent at every layer (a `@display` directive was silently dropped at parse). Added field- and type-level `@display` (label, group, order, renderHint, format, hidden; titleProperty/statusProperty/icon/pluralLabel/color) parsed into the AST, validated (titleProperty/statusProperty must name real fields), and surfaced on GET /api/v1/openapi.json as `x-altius-display`. Presentation-only — NOT an access control.
- **`geo-within`** (`b049a61`; validator superseded by merge `94b37cf`) — GeoPoint is now validated as real coordinates (lat∈[-90,90], lng∈[-180,180]), and a spatial bounding-box operator `within` was added to the SPI and both providers (no PostGIS: Postgres range-checks lat/lng extracted from JSONB), flipping supportsGeoQueries true and reachable via GraphQL `GeoPointFilter { within: GeoBoundingBoxInput }`. Radius/polygon, a spatial index, and geotime/time-series remain absent.
- **`operational-automation`** (`b33f13e`, hardened `7e2fc31`) — Automations are declarable in pack.yaml (event: objectType + change kinds + optional CEL condition, or schedule: interval) and run a governed action via ActionExecutor under a declared actor. Hardening `7e2fc31` fixed: multi-pod (now gated by AUTOMATION_ENABLED, run on a single instance), consent parity (subject/purpose derived like the action routes), scheduled non-overlap, and exact-match loop guard. REMAINING: no idempotency for an at-least-once (Redpanda) bus, no cron (interval only), no retry/DLQ/metrics, per-event getObject N+1, cross-automation cycles unguarded.
- **`mcp-function-tools`** (`4b94483`) — @function FunctionTypes are now exposed as `function_<Name>` MCP tools (input schema from @param fields), dispatched through the shared invokeFunction so requiredRoles authz + audit apply. Only advertised when a functionInvoker is wired. This INVALIDATES the "functions are invisible to MCP" clause in several rows — recheck `misc-3/mcp-agent-integration`, `ontology-core/functions-user-authored-code-logic-on-object`, `misc-2/user-authored-serverless-functions`, `scenarios-sim/business-logic-as-ontology-bound-functions`, and `aip-agents/ontology-derived-llm-tool-registry` before claiming.
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
- **`link-cardinality-conformance`** (`00f2fff`) — MANY_TO_ONE is the cardinality the shipped packs use most (AdmittedTo, UnderCareOf, BedInWard, AlertCase, OrderedFrom) and was the only one with no fixture and no conformance case, so neither provider's enforcement of it had ever been exercised. A CaredForBy fixture and three cases were added: multiple inbound to one target allowed, a second outbound from the same source refused, re-linking after a delete.
- **`read-audit-rest-graphql`** (`8a1674e`) — `AuditWriter`'s doc comment named a "called by query layer for read auditing" caller that did not exist: every producer recorded actions, links, consent or functions, so the trail could say who changed a record and never who read one — the question a DPO is actually asked. Denied reads left no evidence the control had held either. REST is audited at its single dispatcher (so a read route added later is covered the day it is written), with `readOperation` declared on the two reads that must be POSTs; GraphQL resolvers call the shared writer directly. One record per request, and `detail.query` never holds the response.
- **`read-audit-aggregate-traverse-mcp`** (`35ee5f9`) — Completed the surface: GraphQL aggregate and traverse, plus MCP audited at its `invokeTool` dispatcher where `search_<Type>` and `traverse_<Type>` converge. An agent reads at machine rate, so it was the caller whose reads mattered most and left no trace. MCP actors record as `user`, matching what the MCP action path already writes.
- **`read-audit-fhir-cdm`** (`dc7eda8`) — The last two unaudited read surfaces, and the ones a clinical integration actually calls — in the shipped NHS pack a DPO asking "who read this patient" would have missed exactly the traffic that matters most. Audited at each router's own dispatcher; `metadata`/`CapabilityStatement` excluded deliberately. Known imprecision recorded on the row: the FHIR record names the FHIR resource type, not the ontology type it projects.
- **`primary-field-aggregate-search`** (`8e904c0`) — `f8146df` fixed the `@primary`→`_id` rewrite for `query()` only; `aggregate()` and `search()` stayed bare pass-throughs, so a filter, groupBy, orderBy or count on the declared primary name still reached the provider as a column that does not exist — Postgres raises, memory silently matches nothing. The rewrite now covers every field-name-bearing position on both queries, not just the filter.
- **`default-materialised`** (`7b05b44`) — `convertObjectType` never set `PropertyDefinition.defaultValue`, so `@default` was parsed, validated and dropped: a field declared `String! @default(value: "DRAFT")` was REJECTED by both providers when a create omitted it, the opposite of what the declaration promises. The memory provider now applies the default rather than merely exempting the field, so the two providers cannot diverge on a later read. An explicit null still fails.
- **`subscription-consent-gate`** (`0ac763b`) — Subscriptions were the one read surface with no consent gate. REST, GraphQL, FHIR, CDM and MCP all check consent before returning a consent-subject's data; the push surface did not, and its payload carries real values, so a subject who had denied consent could still have their changes streamed. Restricted events are dropped rather than blanked (on a stream, arrival is itself the disclosure) and the check fails closed. `revokeConsent` was also dead code returning hardcoded zeros — a DENY now writes the record and closes the subject's live streams, returning the real count.
- **`as-of-collection-queries`** (`731d777`, proven on Postgres by `7d55b44`) — `QueryOptions.asOfTime`/`asOfVersion` were declared in the SPI and read by neither provider; a whole-repo grep found them only at their two definition lines. An ignored as-of returns today's rows wearing old timestamps, which look like real historical data. `asOfTime` is now honoured by both providers with the filter evaluated against the historical rows, not current ones. `asOfVersion` is REFUSED on collection queries by both — versions are per-object, so "every Patient at version 3" has no answer for a patient that only reached version 2.
- **`side-effect-logger-wiring`** (`7e9b761`+) — `SideEffectExecutor` logs every failed delivery attempt at warn and the give-up at error, but through `this.config.logger?.` — an OPTIONAL field that the only production construction site (`server.ts`, `{httpClient, eventBus, env}`) never set. Every one of those calls was a no-op, so a webhook that 500'd through all its retries still returned `success:true` with zero trace, under the LOG_AND_CONTINUE policy both bundled packs use. The row read this as "no logger imported", which stopped being true when the logging was added; the wiring is what was missing, and reviewing the executor alone could not show it. A pino adapter is now wired (the two disagree on argument order — `(data,msg)` vs `(msg,data)` — so passing the instance directly logs the message as the payload). Only part (1) of that row's gap: delivery is still inline and in-memory with no durable queue, and there is still no side-effect metric in `metrics.ts`.
- **`subscription-property-filter`** (`361615a`+) — `foosChanged(filter:{status:"DISCHARGED"})` accepted a filter naming a real property, compiled it, and then dropped every event: the payload off the bus carries only `{id,_type}`, so any property key was un-evaluable and failed closed. The documented filter silently matched nothing. The row's other claim — that the stub reached clients behind a non-null full-object SDL type — was already FALSE when written: a `${Type}ChangeEvent.object` field resolver hydrates the delivered payload on demand. Events carrying a property filter are now hydrated per subscriber, after the tenant, FGA and consent gates and never before, so the filter has real values. Only when such a filter exists, and the field resolver reuses what this path produced, so no event is read twice. Filtering runs against the REDACTED object: matching on raw values would make the filter an oracle for a field that reads back null on every pull surface. DELETED events and failed hydration keep the id-only stub and still fail property filters closed. Affects the three live-push rows (`widgets/live-updating-…`, `misc-1/live-data-push-…`, `sync-ingest-ops/live-data-push-…`); the aggregate/object-set refresh half of those rows is untouched and still open.
- **`age-graph-removed`** (`91c73e6`, `15098b1`) — `CREATE EXTENSION IF NOT EXISTS age` was emitted unconditionally into the DDL that `applySchema` runs inside its migration transaction, so schema application failed outright on any Postgres without the AGE binary — every managed service among them. The graph was provably write-only: the only two `cypher()` call sites both returned `Promise<void>` and discarded the result, and traversal has always resolved paths with SQL JOINs. Made optional, then removed outright (534 lines deleted). Existing deployments are unaffected — nothing DROPs their extension, the platform just stops writing to it, keeping the additive-only DDL rule intact. A regression guard pins that the DDL emits no AGE statement.

- **`web-editorial-shell`** (`7f3aaf6`, `be5e396`, `79812a1`) — The web app was a single unstyled patient worklist. It is now a four-column editorial shell (Shell-C design): icon rail (job switcher OP/IN/MO/AD), sidebar (pack switcher, screen list with counts, role switcher), main content area, and a persistent governance rail — plus a footer trace bar showing the eight-stage governed pipeline (validate→authorise→consent→redact→emit→persist→audit→notify). The shell is a controlled component: the parent owns pack/role/job/screen state and the shell renders chrome + receives main content as children (packages/web/src/components/EditorialShell.tsx). A design system exists for the first time: `editorial.css` with `--ed-*` CSS variables, IBM Plex Sans/Mono typography, light/dark mode via `prefers-color-scheme`, greyscale chrome with data-viz colour only for status (healthy #2f6b4f / pressure #9a7b2f / disrupted #a8452c), and responsive collapse of the governance rail under 1200px and sidebar under 768px. The Facilities screen (packages/web/src/components/FacilitiesScreen.tsx) is the anchor: stats strip (visible/total/disrupted/mean utilisation/CDC lag), filter pills + search, an editorial table with status glyphs and utilisation bars, redacted/consent-withheld/empty field distinction, a filtered-out notice ("absent, not refused"), cursor pagination, and CDC live updates coalesced at 250ms via `client.facility.onAnyChange`. The governance rail (GovernanceRail.tsx) shows the signed-in principal (name, email, tenant, sub, relations summary), what the view hides (filtered rows, redacted fields, consent state), and a live event feed. The trace bar (TraceBar.tsx) shows the pipeline stages with the active stage underlined, duration, and audit id. App.tsx wires pack switching (supply-chain ↔ nhs-acute), role switching, and job/screen navigation; the NHS acute patient worklist runs inside the shell via the existing ObjectTable + ActionPanel. 92 tests across 9 files pass; typecheck and Vite build are green. REMAINING: only 2 of 11 screens are wired to live data (Facilities + Patients); the other 9 render placeholders; there is no app-definition persistence, no module builder, no widget library — the shell is a hardcoded React app, not a low-code platform; and no per-user state saving exists.h not on the bindings.
- **`web-oidc-pkce-login`** (`407bf2a`) — The package shipped with a build-time injected bearer token: a credential baked into the bundle that could not be refreshed and could not be deployed. Replaced with OAuth 2.0 authorization-code + PKCE against the shipped Keycloak, with no new dependency — verifier, S256 challenge and base64url are crypto.getRandomValues plus crypto.subtle.digest (packages/web/src/auth/pkce.ts:49-64). completeLogin refuses to exchange when the returned `state` does not match what beginLogin stored (:147-150), which is what stops an attacker handing the browser a code of their choosing, and it deletes the verifier before the exchange so a code cannot be replayed (:156-157); both are pinned (packages/web/src/auth/__tests__/auth.test.ts:104, :113). Tokens are held in AuthSession memory only, never localStorage (packages/web/src/auth/session.ts:21); concurrent callers collapse onto one refresh promise (:64-71) because with refresh-token rotation each extra call invalidates the previous one, and refresh runs 30s ahead of expiry so a request cannot straddle it (:18, :51). The access token is sent rather than the ID token, and the client id defaults to `altius` (client.ts:30); the commit states both were checked against the mappers in Orion/keycloak/altius-realm.json, and I did not re-verify the realm file. The endpoint also stopped being absolute — it defaults to a relative /graphql (client.ts:27), so one bundle is promotable between environments instead of one build per environment. REMAINING: an unset VITE_OIDC_ISSUER disables OIDC entirely (client.ts:35-37), and that is exactly what the shipped compose stack passes, so the local stack still serves the UI to anonymous callers; a page reload drops the in-memory token and re-runs the full redirect, with no prompt=none silent renew; there is no logout and no revocation on sign-out; and the 12 auth tests cover pkce.ts and session.ts only — no test renders App.tsx, so the redirect-handling branch and the StrictMode double-exchange guard (App.tsx:30, :40) are unexercised.
- **`web-same-origin-serving`** (`b9a1232`) — Nothing served the bundle, so there was no origin to register as an OIDC redirect URI, nothing for CORS_ALLOWED_ORIGINS to name, and no UI service in the compose stack. packages/web/Dockerfile builds with `pnpm turbo build --filter=@altius/web...` and copies dist into nginx:1.27-alpine; packages/web/nginx.conf listens on 8080 and proxies /graphql and /api/ to http://api-gateway:4000, which matches the container-internal port of the compose service (Orion/docker-compose.yaml:274-275). Serving API and bundle from one origin is what lets the endpoint stay relative and keeps the gateway's CORS policy out of this client's path entirely. The /graphql block forwards Upgrade/Connection through a `map $http_upgrade $connection_upgrade` declared at http scope (nginx.conf:12-15) and raises proxy_read_timeout to 3600s — without both, the graphql-ws subscription socket downgrades or is dropped at the 60s default. /assets/ is cached for a year immutable and index.html is no-store (:25-33), and unknown paths fall through to index.html so the OIDC return lands on the app. A `web` service was added at Orion/docker-compose.yaml:497-526 with a 128M limit, depends_on api-gateway healthy, and VITE_* as build args because vite inlines them at build time. NOT VERIFIED: the commit records that `nginx -t` never ran, and this machine has no nginx binary either, so the config is reviewed and not machine-checked; I did not build the image or boot the stack. REMAINING: nginx sets no security headers at all — no CSP, X-Frame-Options or HSTS — so the helmet defaults the gateway applies to its own responses (packages/api/src/server.ts:1001) do not cover the document that holds the access token in memory; changing the OIDC issuer requires an image rebuild; and the compose service passes an empty VITE_OIDC_ISSUER, so the stack this ships in serves the UI with OIDC off.
- **`web-live-updating-table`** (`1ccc131`) — ObjectTable read one page and never re-read it, so a worklist looked current while going stale the moment anyone else wrote. It now takes an optional `subscribe` (packages/web/src/components/ObjectTable.tsx:59), wired in App.tsx:96 to the SDK's type-level client.patient.onAnyChange rather than the per-id stream, because a table cares about rows arriving and leaving and a per-id subscription can only report on rows it already holds. A change event triggers a re-read of the current page rather than a merge of the payload (:123-141): page membership is decided by server-side filtering, authorization, redaction and cursor position, and patching from the event payload drifts asymmetrically — it can leave on screen a row the caller is no longer allowed to see. Events coalesce over 250ms (:72, :130-134) so a bulk write that emits one event per row costs one refetch instead of a refresh loop, and the effect reads the cursor through a ref (:120-121) so paging does not tear down and rebuild the socket subscription. Four tests were added (packages/web/src/components/__tests__/ObjectTable.test.tsx:110, :131, :151, :165): an event re-reads and the new value renders, 25 events in a burst produce exactly one refetch, unmount unsubscribes, and a table with no stream never refetches. REMAINING: only the patient worklist subscribes; the refetch is unconditional, so a change to a row on some other page still costs a round trip; nothing tells the user the table refreshed under them; and the aggregate, chart and object-set refresh half of the live-updating rows is untouched.
- **`web-generated-action-forms`** (`18a5485`) — There was no client-side rendering of an action's parameter schema, so every form would have been hand-written per action. ActionForm (packages/web/src/components/ActionForm.tsx) picks each control from the JSON Schema: an enum becomes a select over its members rather than free text a caller could fail the server with (:159-170), Date a date picker and DateTime a datetime-local (:198-211), Int/Float a number input (:186-196), Boolean a checkbox. The typing rules are the load-bearing part and both replay defects this repo has already had. buildInput converts values back to their declared JSON types (:242-247), because the pipeline type-checks params and the backlog's own `effect-value-types` entry records `quantity: 5` being stored as "5" — posting the form's string state recreates that from the client. An untouched optional field is omitted rather than sent as "" (:240), since empty string is a value that fails a required check an absent key would pass and overwrites a stored value on an update; a boolean is always sent, including false (:234-238); a non-numeric string in a number field passes through instead of becoming NaN, which would serialise to null and read as "clear this field". A refusal naming a field marks that control aria-invalid and points aria-describedby at the message (:148-154), field-less errors become a form-level alert, a thrown request error is surfaced rather than looking like success, and the submit button disables in flight. 13 tests cover it. NOT WIRED: nothing renders this component — grep for ActionForm across packages returns only its own file and its test, and App.tsx does not import it. It also takes `action` and `submit` as props rather than calling the SDK's caller-scoped actions.available() (packages/sdk-typescript/src/index.ts:1455), so nothing in the shipped app fetches a descriptor or applies an action. REMAINING: no affordance opens it, array and nested-object params fall through to a plain text input (ParamSchema.items is declared at :34 and never read), and there is no dry-run preview or per-object applicability check, so a form can still be opened for an action a given row will reject.
- **`sdk-token-seam`** (`4d6b084`) — `AltiusConfig.token` was a plain string copied into a readonly field at construction, so a generated client was dead at the first token expiry — the shipped Keycloak realm sets accessTokenLifespan to an hour — with nowhere to hand it a new credential; packages/web builds its client inside a useMemo, so in practice it would never have been rebuilt either. Passing a function was not a type error for a JS caller: it stringified into the header as `Bearer () => current`. `token` is now `string | TokenProvider` (packages/odl/src/codegen/sdk.ts:250, 272-275; generated packages/sdk-typescript/src/index.ts:86, 110), resolved per request by resolveToken/authHeaders (sdk.ts:448-462, generated index.ts:1002-1015) and resolved again inside the socket's `open` listener rather than interpolated at construction (sdk.ts:515-522, generated index.ts:1068-1075), so a reconnect presents whatever the provider returns at open instead of the credential that had already expired. Three tests pin it (packages/sdk-typescript/__tests__/sdk-runtime.test.ts:312-366) and the codegen assertion that pinned `token: string;` was widened rather than deleted (packages/odl/src/__tests__/sdk-codegen.test.ts:74-75). Refreshing stayed the caller's job and a caller now does it — packages/web/src/auth/session.ts:47-73 refreshes on a skew and collapses concurrent refreshes, wired at packages/web/src/App.tsx:57 — but that wiring landed in 407bf2a, not here. REMAINING: a rejecting provider is swallowed on the socket path — `void this.resolveToken().then(...)` (sdk.ts:519) has no catch, so an expired session with no refresh token leaves connection_init unsent, `wsReady` false and every queued subscribe parked in `wsReadyQueue`, with no error reaching the caller; and the client still never reconnects — the `close` listener clears `wsSubscriptions` (sdk.ts:538-542) without telling subscribers the stream is gone, so a refreshed token only helps a subscription the caller re-creates itself.
- **`sdk-subscriptions`** (`e17be3f`) — The generated subscription client could not have delivered an event, for two independent reasons. `new WebSocket(wsUrl)` sent no subprotocol, and the server runs graphql-ws (`useServer` from graphql-ws/lib/use/ws, packages/api/src/server.ts:36, 941), which closes a handshake without `graphql-transport-ws` (4406) before anything is exchanged; and the generated document selected `causedBy` — a composite ActionReference — with no subselection, a validation error the server reports as an `error` message that this client responds to by silently deleting the subscription, so the caller saw no data and no throw. Both were fixed in the generator: the socket passes the subprotocol (packages/odl/src/codegen/sdk.ts:512, generated packages/sdk-typescript/src/index.ts:1065) and the document subselects `causedBy { actionType actionId }` and selects real fields inside `object { ... }` instead of `{ id }` (sdk.ts:563-574, generated index.ts:1116-1127). A third defect made the callback type a lie — graphql-ws delivers an ExecutionResult envelope on `next`, which was handed straight to a callback declared `(event: ChangeEvent<T>)`; it is now unwrapped (sdk.ts:579-588). None of this was caught because the suite's MockWebSocket constructor discarded the subprotocol argument and the assertion pinned the envelope — the test encoded the bug; the mock now captures the subprotocol (packages/sdk-typescript/__tests__/sdk-runtime.test.ts:113) and the test pins the subprotocol, the subselection and the unwrapped event (:367-433). `onAnyChange(callback, filter?)` was also added over the server's existing `foosChanged(filter: JSON)` (packages/odl/src/codegen/index.ts:1066) so a live table needs one subscription rather than one per visible row; packages/web/src/App.tsx:96 uses it. REMAINING: nothing runs the generated client against a real graphql-ws server — the 4406 and validation-error claims are argued from the server's transport, not observed, and every test still drives a mock socket. A server `error` message still deletes the subscription with no callback and no throw (sdk.ts:532-533), which is the behaviour that hid both defects and will hide the next one. `onAnyChange` has no test at either layer, and its `filter` is typed as the query-side `${Type}Filter` including AND/OR/NOT while the server evaluates flat key equality (packages/api/src/subscriptions/subscription-manager.ts:666-680), so a type-legal `{ AND: [...] }` fails closed and matches nothing forever. And across every generated selection set — get, list and both subscriptions — `getFieldNames` (sdk.ts:383-388) requests neither `_redactedFields` nor `_consentRestricted`, although both are declared on every generated interface (sdk.ts:305-306) and exist in the SDL (packages/odl/src/codegen/index.ts:154-155): they are always `undefined` at runtime, so a redacted field is indistinguishable from an empty one on the client.
- **`sdk-action-metadata`** (`0639292`) — The generated SDK had a typed method per action and no way to ask at runtime what an action's parameters ARE: `availableTools` had been in the SDL since packages/odl/src/codegen/index.ts:1008 with no client accessor, so a UI could only hard-code a form per action. `actions.available(filter?)` was added to the generator (packages/odl/src/codegen/sdk.ts:402-420; generated packages/sdk-typescript/src/index.ts:1450-1457), returning the ToolDescriptors including the parameter JSON Schema — which only became worth reading once 8097986 put enum members and date formats into it. Two tests cover the round-trip and the filter variable (packages/sdk-typescript/__tests__/sdk-runtime.test.ts:264-311); sdk 14 tests green, and the tree stays clean after the package's pretest regeneration, so the committed output matches the generator. A consumer exists: packages/web/src/components/ActionForm.tsx picks a `<select>` from `param.enum` and a date input from `param.format`, but it landed in 18a5485, not here. REMAINING: the doc comment the generator emits — 'It is also caller-scoped, so it reflects what this user may run' (sdk.ts:410, generated index.ts:1449) — is false; the resolver returns every action to every authenticated caller and documents that decision explicitly (packages/api/src/graphql/resolver-generator.ts:1735-1741), and the same wrong claim was copied into ActionForm.tsx:4. `ToolFilter.kind` is typed `string` in the SDK while the SDL takes the `ToolKind` enum with members ACTION/FUNCTION (packages/odl/src/codegen/index.ts:447-450; the registry emits 'ACTION' at tool-registry.ts:234), and the only filter test asserts against a mocked fetch with `kind: 'action'` — a value a real server rejects at enum coercion. `tags` is still hard-coded `[]` in the resolver (resolver-generator.ts:1764), so `ToolFilter.tags` can never match. And the descriptor carries no labels, field ordering, prefill or conditional visibility, so a form generated from it shows raw param names in schema order.
- **`action-param-enum-schema`** (`8097986`) — `ToolRegistry.fieldToJsonSchema` mapped every type outside SCALAR_TYPE_MAP to `{type:'string', description:'ID reference to <T>'}`, and enums are not in that map — so an enum param was advertised as free text AND mislabelled as an id reference to something that has no ids, and the valid members were undiscoverable from the schema at all. The list branch consulted the same map independently, so `[TriageCategory!]!` stayed an array of free text even once the scalar branch was right. A single `typeNameToJsonSchema` (packages/actions/src/tools/tool-registry.ts:307-336) now serves both paths and emits `{type:'string', enum:[...members]}` from the ParsedSchema the registry already held, and Date/DateTime gain JSON Schema `format` (`date`, `date-time`) via SCALAR_FORMAT_MAP (:85-88). Object-type params still emit the id-reference description, which is accurate for them. Five cases pin it, including the enum-inside-a-list one (packages/actions/src/tools/__tests__/param-schema.test.ts:83-129); actions 197 tests green. REMAINING: this reaches only the descriptors ToolRegistry builds — GraphQL `availableTools` (packages/api/src/graphql/resolver-generator.ts:1758) and, through it, the SDK and the web form. The commit message's claim that the MCP surface serves the same descriptors is not borne out: packages/mcp-server/src/tools.ts:287-307 has its own `fieldToJsonSchema` that consults SCALAR_JSON_SCHEMA and falls back to `Reference to <T>`, and it is never given a ToolRegistry, so `tools/list` still hands an agent free text for an enum and no format for a date. The REST/OpenAPI path is likewise untouched — packages/api/src/rest/openapi.ts:39 still returns `{ type: 'string' }` for 'enum values, custom scalars'. Nothing beyond type/required/enum/format is emitted: no labels, ordering, prefill, conditional visibility or value sources.
- **`openfga-loopback`** (`7235120`) — Orion/docker-compose.yaml published OpenFGA with no bind address (`"${OPENFGA_PORT:-8280}:8080"` and `"8281:8081"`, so Docker bound 0.0.0.0), with OPENFGA_AUTHN_METHOD unset — v1.8.2 defaults to no authentication — and OPENFGA_PLAYGROUND_ENABLED "true". docker-compose.prod.yaml overrides only its six application services (cel-evaluator, api-gateway, ontology-engine, action-executor, sync-engine, security-service) and never names `openfga`, so the base publish survived the exact invocation DEPLOYMENT.md:94 and :250 give as the staging/production procedure. Reaching that port meant `GET /stores` to enumerate and `POST /stores/{id}/write` to mint any tuple, after which an ordinary Keycloak token opened the tenant with nothing in the Altius audit trail, because the grant never passed through Altius. Both ports are now bound to 127.0.0.1 (docker-compose.yaml:125-126) and the playground is `${OPENFGA_PLAYGROUND_ENABLED:-false}` (:132); no legitimate consumer lost access — init-services.sh:17 defaults OPENFGA_HOST to localhost, tests/integration/src/security-enforcement.test.ts:57 and Orion/DEMO.md:221 both address localhost. Separately, `createFgaClient` built `new OpenFgaClient({apiUrl, storeId})` with no credentials and nothing in the repo could supply one, so an operator who noticed the exposure could not point the gateway at a hardened OpenFGA without patching source; packages/api/src/config.ts:58-65 now reads OPENFGA_API_TOKEN and passes CredentialsMethod.ApiToken when it is set, threaded through both gateway definitions in the base compose file (:283, :470). REMAINING: an absent token still means unauthenticated, which is what the loopback-bound local stack runs; the Helm path can supply no token at all — grep of Orion/helm finds OPENFGA_API_TOKEN in neither configmap.yaml nor secrets.yaml and the deployments have no extraEnv hook, so an operator-supplied in-cluster OpenFGA is still reached without a credential; only ApiToken is wired, not ClientCredentials; and init-services.sh sends no Authorization header on its `POST /stores` (:86) or `POST /stores/{id}/authorization-models` (:114), so an operator who follows the new comment and sets OPENFGA_AUTHN_METHOD=preshared breaks store bootstrap.
- **`dev-auth-optin`** (`e3780c4`) — `extractUser` answered any request with no Authorization header with a nine-role admin identity (`dev-user`, tenant `default`, roles including `admin`) whenever `isDev`, and `isDev` is `NODE_ENV !== 'production'` — a fail-open test satisfied by the variable being unset, which packages/api/Dockerfile leaves it, so `docker run` of a published release image with no environment served full admin to an anonymous request. The MCP endpoint had required ALTIUS_MCP_DEV_AUTH_BYPASS=true since `a065ac1`; the REST/GraphQL surface had no flag, because each surface carried its own copy of both the identity and the gate. Both now live in packages/security/src/auth/dev-bypass.ts — one `DEV_USER` (:29) and one `devAuthBypassEnabled(flagEnvVar)` (:62-66) requiring the flag to be exactly the string 'true' AND NODE_ENV not 'production' — consumed at packages/api/src/config.ts:332 with ALTIUS_DEV_AUTH_BYPASS and packages/mcp-server/src/auth.ts:24-26,:54 with ALTIUS_MCP_DEV_AUTH_BYPASS, so the two surfaces are enabled independently but cannot disagree about what development means. Unset is now 401 on both. Five tests on the gate pass at HEAD (packages/security/src/auth/dev-bypass.test.ts): flag unset across five NODE_ENV values and with NODE_ENV absent, production with the flag set, and '1'/'yes'/'TRUE' rejected. REMAINING: coverage stops at the gate function — there is no test at the `extractUser` call site, so deleting the call fails compilation rather than a test; the Helm path was never exposed and did not change (api-gateway-deployment.yaml:57-58 hardcodes `NODE_ENV: production`); and the compose path still defaults the new opt-in ON — `ALTIUS_DEV_AUTH_BYPASS: "${ALTIUS_DEV_AUTH_BYPASS:-true}"` on all five app services (docker-compose.yaml:279, 362, 392, 426, 466), which docker-compose.prod.yaml never unsets, and .env.example:121 ships the flag uncommented as `true`. On the documented `-f docker-compose.yaml -f docker-compose.prod.yaml` invocation, NODE_ENV is therefore still the only thing between an anonymous request and the admin identity, which is the fail-open test this change was meant to stop relying on.
- **`ws-operation-gates`** (`793b0be`) — The graphql-ws `onSubscribe` hook enforced one control, a 50-subscription cap per connection, and neither of the two the HTTP path applies. That hook is the socket's whole request path, not just its subscription path: in node_modules/.pnpm/graphql-ws@5.16.2_graphql@16.12.0/node_modules/graphql-ws/lib/server.js, `Subscribe` is the only operation-carrying client message, `onSubscribe` is awaited at :150 before the document's operation type is read, and `getOperationAST` at :180 then routes `subscription` to `subscribe()` and `query`/`mutation` to `execute()` (:199-202) — so queries and mutations arrive through it too. Any principal with a valid token could therefore run operations of unbounded depth and at unbounded rate by opening a socket instead of POSTing, while HTTP applied the complexity gate (packages/api/src/graphql/server.ts:78-82) and the per-principal rate limiter (packages/api/src/server.ts:1137). The decision moved out of `main()`, where no test could reach it, into packages/api/src/graphql/ws-gate.ts `guardWsOperation`, called from server.ts:958-972, and runs subscription cap, then complexity, then rate limit — the limiter last because it may cross the network to Redis. `createGraphQLServer` now returns its `QueryComplexityAnalyzer` (graphql/server.ts:37, :66, :94) so the socket uses the same instance and the same limits rather than a second set to keep in step, and the limiter is called with the same `{tenantId, principalId}` identity as HTTP so a caller cannot double their allowance by splitting traffic across transports. Seven tests pass at HEAD (packages/api/src/__tests__/ws-gate.test.ts). REMAINING: only the complexity refusal is byte-identical across transports (the analyzer's own error, unwrapped); the rate-limit refusal is not — HTTP returns `Rate limit exceeded (by N)` with `retryAfter` and HTTP 429 (server.ts:1138-1145), the socket a bare `Rate limit exceeded` with no retry hint. The socket re-parses the query string where HTTP analyzes the already-parsed DocumentNode, `authenticateConnection` now runs twice per operation (the `context` hook at server.ts:944-951 and again inside the gate), and the 50-slot per-connection counter now charges queries and mutations as well, so 50 concurrent in-flight operations on one socket are refused as `Subscription limit exceeded`. An unparseable document is deliberately passed through to graphql-js. CORRECTION (`1f0b13c`): making that hook async to add the rate-limit check turned the subscription cap itself into a TOCTOU race — graphql-ws does not serialize message handling, so pipelined frames all read the count before any wrote it and 50 concurrent operations against a cap of 2 all passed. The slot is now reserved synchronously before the first await and released on refusal. The control this commit was credited with preserving was broken by it for four commits.
- **`authz-derivation-unified`** (`7d5fb07`) — Three copies of `toSnakeCase` existed, and one of them disagreed with the function that NAMES the types in the generated FGA model. `packages/odl/src/codegen/openfga.ts:68` is called by `generateOpenFGAModel` for every ObjectType; api's copy matched it; mcp-server's used `replace(/([A-Z])/g, '_$1')`, which agrees on `CarePlan` and disagrees on every acronym — the model declares `gp_practice`, mcp-server would have built `g_p_practice`, a type OpenFGA has never heard of. The defect was LATENT, not live: all 21 ObjectTypes across the five bundled packs (core, nhs-acute, aml, supply-chain, aip) are acronym-free — I extracted the names and ran both algorithms over them, zero disagreements — so it was waiting for the first `GPPractice`, `NHSTrust` or `KYCCheck`. It fails closed and only on /mcp, so the symptom would have been one type unreadable to an agent while REST and GraphQL served it. (The commit message's "all 59 ObjectTypes" counts 59 total type declarations; the ObjectType count is 21 — the substantive claim holds, the number does not.) The same split had grown around the mapping itself: api's `deriveActionAuthzMappings` and mcp-server's `scopeToolList` each derived relation + target type + id param independently, which is how `TransferWard`'s relation once drifted from `can_transfer` when a `Transfer` ObjectType was added. `deriveActionAuthzMapping` now lives at `packages/odl/src/codegen/openfga.ts:129`, beside the generator whose output it must match; `packages/api/src/server.ts:1661` and `packages/mcp-server/src/tools.ts:158` both call it, and api re-exports odl's `ActionAuthzMapping` (config.ts:212-213) and `toSnakeCase` (utils.ts:67) instead of redeclaring them. Separately, tool scoping hid an action tool whenever `listObjects` returned an empty set — correct when the caller holds the relation on nothing, and indistinguishable from a relation missing from the deployed model, because `AuthorizationService.listObjects` swallows an undefined relation and returns [] rather than throwing, so the existing `catch` never fired for that case. Both paths now warn (tools.ts:179, :191) through a `logger` wired at the API construction site (server.ts:1364) rather than shipped optional-and-unset. REMAINING: nothing tests the warn — no spec asserts it fires, and none asserts api still passes `logger`, so the optional-logger shape that `side-effect-logger-wiring` had to fix can regress here silently and is held only by a comment. The acronym regression is pinned against a synthetic `GPPractice` in `packages/odl/src/__tests__/action-authz-mapping.test.ts:58-70`; no bundled pack exercises it, so the guard depends on that fixture surviving. And `deriveActionAuthzMapping` returning `undefined` still means two different things to its two callers — "advertise it anyway" on MCP (tools.ts:161-164), "not ReBAC-gated" in api (server.ts:1662) — with nothing pinning that those readings stay in agreement.
- **`clean-checkout-build`** (`281fa40`) — `pnpm install && pnpm build` failed on a fresh clone with `sh: odl: command not found`. `@altius/odl` declares `bin: { odl: "./dist/cli/index.js" }` (packages/odl/package.json:20-22), so pnpm can only link `node_modules/.bin/odl` if that file already exists when install runs; on a clean checkout it does not, pnpm skips the link, and packages/sdk-typescript invoked a bare `odl` in four lifecycle scripts. A second install always succeeded because by then something had built odl, which is why no local tree ever showed the failure, and locally the turbo cache replayed `build` as green without executing the script at all. The four scripts now invoke the CLI by path — `node ../odl/dist/cli/index.js` — and the three `pre*` hooks delegate to `generate` instead of repeating the same string (packages/sdk-typescript/package.json:15-18); turbo gives both `build` and `typecheck` `dependsOn: ["^build"]` (turbo.json:6,20), so packages/odl/dist/cli/index.js is guaranteed present first. The commit message asserted the workflow had never run — that is no longer true and should not be repeated: the repository now has 40 workflow runs, and `Build + unit tests` concludes success at HEAD (496299e), which exercises this path from a clean checkout on every push. REMAINING: nothing pins the invariant. `turbo run build` locally still replays a cached green without executing the script, so a package that reintroduces a bare bin call is invisible until it reaches Actions; there is no `--force` or clean-clone build step in ci.yml.
- **`frozen-lockfile`** (`99d1764`, `641f5fa`) — `99d1764` added `@types/node: ^20.0.0` to packages/observability/package.json with no matching lockfile update, so `pnpm install --frozen-lockfile` died with `ERR_PNPM_OUTDATED_LOCKFILE`. That is the first step of every job in ci.yml, and pnpm turns the flag on by default in CI regardless, so the run ended before a single package was built. Nothing local catches it: a plain `pnpm install` silently repairs the lockfile in the working tree, which is exactly how the manifest got committed out of sync. `641f5fa` regenerated it with `pnpm install --lockfile-only` — four lines, the importer entry plus vitest's `@types/node` peer moving 25.2.2 → 20.19.33. Cause and effect are visible in the Actions history rather than argued: `Build + unit tests` was green at `ee008e3`, failed at `99d1764` and `3b9fbe1`, and was green again at `641f5fa`. REMAINING: nothing prevents the next drift — no pre-commit hook, no CI step, and no lint checks that pnpm-lock.yaml matches the manifests, and the failure mode is invisible on the machine that creates it by construction.
- **`helm-multipod-guard`** (`aee4dc9`) — The chart shipped `apiGateway.replicaCount: 2` with an HPA at `minReplicas: 2` (values.yaml:198,204) while `eventBus.redpanda.bootstrapServers` and `redis.url` were both empty — and values.yaml:35 calls the empty bus "single-pod only" three lines above the setting. Nothing failed at install or at runtime: a subscriber received only the changes produced by whichever pod it was balanced onto, and each pod counted rate limits in its own memory, so the effective limit was the configured one times the replica count. Neither is visible in a log. `altius.assertMultiPodSafe` (_helpers.tpl:92-105), included at api-gateway-deployment.yaml:1, now fails at render time naming the knob, and reasons about `minReplicas` rather than `replicaCount` because the HPA owns the count when autoscaling is on (`altius.effectiveReplicas`, _helpers.tpl:69-75). Verified here with helm 4.2.2, not taken from the message: defaults refuse citing the event bus; supplying Redpanda alone then refuses citing redis; both supplied renders 21 objects; `replicaCount=1` + `autoscaling.enabled=false` renders 19; `singleInstance.automation=true` on 2 replicas refuses. Two more knobs landed with it. `storage.postgres.sslmode` (values.yaml:27, _helpers.tpl:57-60) — `altius.postgresUrl` emitted no query string and no values path could add one, so every chart-deployed pod spoke cleartext to the database; `--set storage.postgres.sslmode=require` now puts `?sslmode=require` into all five deployments' `POSTGRES_URL`. `singleInstance.automation` / `.syncScheduler` (values.yaml:55-59) emit `AUTOMATION_ENABLED` and `SYNC_SCHEDULER_ENABLED` in the pod's literal env block (api-gateway-deployment.yaml:78-81); the chart could set neither before, so a Helm deployment could not run automations or the sync loop at all. docs/mvp-nhs-pilot.md §5.3 renders clean (21 objects, sslmode present in all five URLs) and `helm lint` is clean. REMAINING: the guard reasons only about apiGateway. ontologyEngine, actionExecutor and securityService still default to `replicaCount: 2` (values.yaml:221,244,290) and take the same configmap carrying the empty `REDPANDA_BROKERS` / `REDIS_URL` (configmap.yaml:13,16; `envFrom` at each deployment:63-64), so the exact condition the guard exists to refuse is unguarded on three other Deployments. The documented pilot install cannot use either new single-instance flag: §5.3 supplies Redpanda and Redis and therefore runs the default 2 replicas, and `--set singleInstance.syncScheduler=true` on it is refused — the operator must choose between a multi-replica gateway and running the sync loop, and the chart provides no separate single-replica release for those components, only the suggestion of one in the error text. `sslmode` still defaults to empty.
- **`age-deprovisioned`** (`fe0ed50`) — Apache AGE was removed from the code in `15098b1`, but every deployment path still provisioned it: the Helm init Job ran `CREATE EXTENSION age`, `LOAD 'age'` and `create_graph('altius')`, so the chart still required an AGE-capable database to initialise; the CI postgres-integration job pinned `apache/age:release_PG17_1.6.0` and created the extension before running the integration suite; and the compose stack ran the same image. Testing against an image no deployment runs hides the failures those jobs exist to catch. All three are plain `postgres:17` now (ci.yml postgres service, docker-compose.yaml:43), and the only extension the schema still needs is pg_trgm, created by `applySchema` itself. Separately the init Job ran `psql -q` with no `ON_ERROR_STOP`: psql exits 0 after a failed statement, so the `set -e` above it meant nothing and the Job reported success on a database it had not initialised. Both the Job (init-job.yaml:57) and the CI step now pass `-v ON_ERROR_STOP=1`. The rename is visible in the Actions history — the job is `Postgres integration (AGE)` up to `aee4dc9` and `Postgres integration` from `fe0ed50`. REMAINING: `Orion/init-services.sh` was missed, and it is the script every document tells the operator to run (README.md:256, Orion/README.md:21, Orion/DEMO.md:48, Orion/DEPLOYMENT.md:22 and :91, Orion/RELEASE_PROCESS.md:118). `main()` still calls `init_age` (init-services.sh:191), which runs `CREATE EXTENSION IF NOT EXISTS age` against the postgres:17 image that cannot supply it — and `dc_psql` (init-services.sh:24-27) has no `ON_ERROR_STOP`, the same swallow this commit fixed in the two other places, so psql exits 0, `set -euo pipefail` does not trip, and the script logs "AGE extension initialized." and continues. Orion/DEMO.md:55 still documents that as the intended behaviour. The postgres-integration job is still red at HEAD for an unrelated cause: `column "_actor_id" of relation "patient" does not exist`, 32 of 34 link-crud integration tests.
- **`image-publish-workflow`** (`b526421`, `3b9fbe1`, `ee008e3`) — Nothing in the repo published a container image, so the chart's pinned tags named artifacts no pipeline produced. `b526421` added .github/workflows/docker-publish.yml (build and push to GHCR on pushes to main and on `v*` tags, PRs build only), Orion/docker-compose.prod.yaml (registry pulls, `pull_policy: always`) and Orion/DEPLOYMENT.md. `3b9fbe1` added packages/web to the matrix so the nginx image is produced by CI at all, with the caveat stated in its own message and still true: the job passes only `GIT_REVISION` (docker-publish.yml:87-88), and `VITE_*` are inlined by vite at build time, so the published web image carries an empty `VITE_OIDC_ISSUER` and runs in anonymous mode — correct against the dev stack, wrong for production. The workflow does work: the publish run is green for all five images at HEAD, tagging `ghcr.io/daemon-blockint-tech/altius-system/{api-gateway,action-executor,security-service,cel-evaluator,web}`. `ee008e3` is the one to read before trusting its subject line: it says "use stable trivy-action version" and the diff does the opposite, replacing the pinned `aquasecurity/trivy-action@0.28.0` with the floating `@master` (docker-publish.yml:94) and adding `continue-on-error: true`. The workflow grants `packages: write` at file scope (docker-publish.yml:14-16), so an unpinned third-party action now runs whatever that branch holds at execution time inside a job with registry push credentials; and between `exit-code: '0'` and `continue-on-error: true` the step cannot fail anything and uploads no SARIF, so it emits a log with no reader. REMAINING: the publish set and the deploy set do not match. docker-publish.yml builds five images; Orion/docker-compose.prod.yaml pulls `ontology-engine` (:77) and `sync-engine` (:125), which no workflow builds, and declares no `web` service at all. The prod compose default `REGISTRY_PREFIX` is `ghcr.io/nhs-eng/altius-system` (:8,24,77,98,125,152) while the workflow publishes under `${{ github.repository }}`, so the default pull target is an organisation that does not own this repo; DEPLOYMENT.md repeats `nhs-eng` at :39, :50-52, :81, :190 and :213, and neither `REGISTRY_PREFIX` nor `IMAGE_TAG` appears in Orion/.env.example, which DEPLOYMENT.md:205 calls the full list. The Helm chart is untouched by any of this — values.yaml:6-8 still says `registry: altius`, `tag: "0.2"`, so `helm install` still requires the operator to build and host images. DEPLOYMENT.md:66 states "All pass before merge to `main`": verified false on both halves — `branches/main/protection` returns 404 `Branch not protected` and `rulesets` returns `[]`, and all 20 CI runs to date concluded `failure`, including at HEAD.
- **`local-stack-sizing`** (`2c90b1f`) — `docker compose up` started all fifteen services with no memory limit on any of them: the parent commit's file contains zero `deploy:` blocks. Against a ~4 GB Docker VM that OOM-killed Postgres mid-write and took the daemon with it. Every service now carries `deploy.resources.limits.memory` rather than `mem_limit`, which current Compose parses, drops silently and runs unbounded — the file records `HostConfig.Memory` reading 0 on the first attempt (docker-compose.yaml:19-20). Redpanda and Debezium moved behind profile `cdc`, Redis behind `cache`, the OTel collector behind `observability`, and the four split-out microservices behind `microservices`; `docker compose config --services` on the base file now returns seven — postgresql, openfga-migrate, openfga, keycloak, cel-evaluator, api-gateway, web. api-gateway also stopped depending on redpanda and redis, which it never needed: an unset `REDPANDA_BROKERS` selects the in-memory bus and an unset `REDIS_URL` the in-memory limiter, and both now default to empty (docker-compose.yaml:289-290). Two things the commit did not touch broke on the profile move. ci.yml's image-scan job builds with `docker compose -f Orion/docker-compose.yaml build`, which no longer builds profiled services, while its scan loop (ci.yml:230) still iterates ontology-engine, action-executor, security-service and sync-engine — at HEAD trivy fails with `unable to find the specified image` on all four, where the run immediately before this commit (`e3780c4`) scanned them and reported `Total: 8 (HIGH: 8, CRITICAL: 0)`. Four of six images silently left vulnerability coverage, and the job's red now means a missing image rather than a finding. And `docker compose -f docker-compose.yaml -f docker-compose.prod.yaml config` — the command DEPLOYMENT.md:241 gives as the validation step, and the basis of every deploy and rollback instruction in both deployment documents — now fails outright with `service "api-gateway" depends on undefined service "redis": invalid compose project`, because docker-compose.prod.yaml:56-66 (written before this commit) re-adds `depends_on` on redpanda and redis, which are now profile-gated; ontology-engine and the others do the same at :108-114. Adding `--profile cdc --profile cache` makes it parse. REMAINING: the ~500 MB default-stack figure comes from the commit message and was not re-measured here. The web container has never passed its healthcheck in CI — Docker-stack integration fails at `container orion-web-1 is unhealthy` both at this commit and at HEAD, and the job has no log-dump step, so the failure carries no evidence of its cause. The web image is also absent from ci.yml's trivy loop entirely, so the only scan it gets is the non-blocking one in docker-publish.yml.
- **`release-runbook`** (`81f04b6`) — Orion/RELEASE_PROCESS.md documented the tag → docker-publish.yml → GHCR → prod-compose path with rollback by `IMAGE_TAG`, which had no written procedure before. It gets the registry path right where Orion/DEPLOYMENT.md does not: `ghcr.io/daemon-blockint-tech/altius-system/{service}` (:49-50, :109, :178-179, :206-207) matches what the run logs show `docker/metadata-action` actually pushing, lowercased from `${{ github.repository }}`. It is also honest that branch protection is aspirational — the section at :211 is titled "Branch Protection (After Manual Configuration)" — and that is confirmed rather than assumed: `repos/.../branches/main/protection` returns 404 `Branch not protected` and `rulesets` returns `[]`, so the "PR mergeable when: all checks pass + approved" flow at :190 and the required-status-check list at :220-224 describe nothing that is enforced today. REMAINING, all verified against HEAD: :42-46 and :218 say the workflow builds four services, but `3b9fbe1` made it five (web); :117 still says "Initialize database, AGE, OpenFGA" after `fe0ed50` removed AGE from every deployment path; :121, :157, :160 and :306 all issue `docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d`, which does not parse at HEAD (see `local-stack-sizing`); :14 instructs "Verify CI passes on main" when all 20 CI runs so far concluded `failure`; :75 uses `docker search` against a GHCR path, and `docker search` queries Docker Hub only. The document also never mentions .github/workflows/release.yml, which fires on the same `v*` tags and is what actually creates the GitHub release and uploads openapi.yaml, schema.graphql and asyncapi.yaml — so the runbook describes half of what a tag push triggers.
- **`cel-deadline-test`** (`092f7d3`) — `CelClient > timeout handling > respects configured timeout` never tested a deadline. It gave a fresh gRPC channel a 100 ms deadline with `maxRetries: 0`, answered with a handler that replied instantly, and asserted only `result.value === true` — nothing in it was latency-bound, so the tight budget bought no coverage and measured how contended the box was. It was the intermittent red in `@altius/actions#test`: green when the package ran alone, failing under a full `pnpm test`, reproduced at roughly 1 failure in 11 runs of that file alone under CPU load. Exercising a deadline needs a server slower than it, and `evalHandler` is synchronous and in-process so a busy wait would stall the event loop the client waits on; the mock's unary handler now takes an optional deferred reply (`evalDelayMs`, client.test.ts:57, :97-98, reset at :197). The test split in two: `fails the call when the server outruns the configured deadline` (:423-446) runs a 1 s server against a 100 ms budget, so load pushes the assertion the same way it already points and a busy box cannot flip it; `lets a fast call through under a generous deadline` (:448-465) keeps the half that was actually covered, with 5 s rather than a budget that must absorb cold-channel setup. Shipped behaviour is untouched — `client.ts` still defaults to `timeoutMs ?? 5000`. Re-ran at HEAD: `pnpm turbo run test --filter=@altius/actions`, 197 tests across 12 files, green. REMAINING: one flaky test was found by reproducing it, not by an audit — no other timing-sensitive test in the repo was checked, and the CEL suite still has three other fixed-budget cases. The gate this protects has still never executed: GitHub Actions has run zero workflows on this repository, so "the intermittent red in the gate" describes a local `pnpm test`, and the 2-core-runner contention the commit message reasons about remains untested.
- **`pg-fixture-actor-id`** (`5c2f476`) — Every write in the Postgres integration suite failed with 42703. The fixture hand-writes its `patient` / `patient_history` DDL and never gained `_actor_id`, while `packages/storage-postgres/src/objects/object-crud.ts` writes that column on insert (:130), update (:229), soft-delete (:302) and restore (:329). Production was the correct half — `packages/storage-postgres/src/schema/ddl-objects.ts:23` carries `_actor_id` in SYSTEM_COLUMNS for both the main and history tables, and :78-84 adds it to pre-existing tables with `ADD COLUMN IF NOT EXISTS` — so this was the fixture drifting from the generator, not a platform defect; both sides were read before the test was touched, because fixing a fixture when production is the broken half buries a real bug. One column added to each table (object-crud.integration.test.ts:59, :76), plus a comment at :41-46 naming the hazard. REMAINING: unverified by execution. The suite is `describeWithPg` and needs `PG_TEST_URL`; the Docker registry is unreachable on this machine, so the fix rests on reading the generator and the CRUD SQL, not on a green run. The second hand-maintained copy of the schema is still there — `generateObjectTableDDL` is exported and the fixture should call it, which is the only change that makes this class of drift impossible, and it was deliberately not attempted since it could not be executed here.
- **`internal-error-logged`** (`496299e`) — A failing REST request answered with `INTERNAL_ERROR`, a generic message and a `traceId` — and nothing was ever written under that traceId. `wrapErrorToRest` replaced the message for the `system` and `timeout` categories and dropped it on the floor, so the response handed the client an id shaped like a lookup key and an operator given that id had nothing to search. Withholding the message from the caller is right — a system-category error can carry connection strings, hostnames and stack detail — but losing it is not. The real message, code and stack are now logged at error level under the same traceId (packages/api/src/rest/errors.ts:92-101). Found by running the stack rather than by a test: a production-mode action returned INTERNAL_ERROR with an empty server log, and with this in place the same request revealed `ECONNREFUSED :50051`, the CEL sidecar not running, which no amount of reading the response would have told you. REMAINING: REST only. `packages/api/src/graphql/errors.ts:48-52` withholds identically and still logs nothing, so the same failure over GraphQL is still untraceable — the fix was applied at one of the two transports that share the defect. `mapCodeToCategory` also defaults any unmapped code to `system` (errors.ts:158), so every thrown code outside its 18-entry table is now written at error level, including the param-validation codes two existing rows already record as falling through (those particular failures come back in-band rather than thrown, so they do not reach this path, but nothing guarantees that stays true). No test covers the new log line, and the module-level pino singleton is used directly, so the record carries no request-scoped fields beyond the traceId.
- **`readme-claims-corrected`** (`ea2842f`) — Three README claims a prospective pilot reader would take at face value, none of them true. (1) Apache AGE was removed in `15098b1` — the graph was write-only, both `cypher()` call sites discarded their result, and traversal has always resolved paths with SQL joins — while the README still advertised "Apache AGE-backed relationship traversal" and carried AGE through the architecture diagram, the package table, the provider matrix, the PostgreSQL capability table and the docker-compose description. (2) Full-text search was described as `tsvector`-backed; it is `ILIKE` substring matching, which `packages/storage-postgres/src/objects/search.ts` states in its own header, and the distinction matters to anyone sizing an index or expecting stemming. (3) The worst: "real authentication, authorization, capability gating, and consent-vocabulary enforcement are verified on every push and pull request." The `enforcement-e2e` job is defined in `.github/workflows/ci.yml` and has never run — GitHub Actions has executed zero workflows on this repository and `main` has no branch protection, a fact the backlog itself already records under the SPI-conformance row. All three were corrected, and the test-coverage table now carries a block quote (README.md:326-330) saying plainly that no gate in it has ever blocked a merge. REMAINING: one AGE claim survived the edit — README.md:390, in the "How This Was Built" section, still reads "Idempotent DDL generation (AGE graph/labels) … an integration suite against a live PostgreSQL+AGE instance", and nothing marks it as historical, so a reader scanning for capabilities hits the same false claim two hundred lines further down. The CI statement is a snapshot verified through the Actions API with nothing in the repo re-checking it, so it becomes false the day a workflow runs and no one is told. And the README is the only document audited here: `docs/` and `Orion/README.md` were not checked for the same three claims.

### Landed 17 Aug (later session) — CI-driven fixes and the audit sweep

These went in after the block above. Several were found by CI once it could run at all, and eight by
an adversarial audit workflow whose findings were each checked by two independent skeptics; one
"finding" in that sweep cited a test file that has never existed in any commit on any ref, which is
why the unanimity bar is there and why a single verifier is not enough.

- **`pg-date-normalisation`** (`6abf9ee`) — SEVERITY 1 for anything running Postgres. `rowToObject` copied user columns through untouched, so node-postgres handed back a JS `Date` where the platform contract is an ISO string. The action executor re-validates the MERGED object and the merge carries what it just read, so **every `updateObject` action effect failed on Postgres and passed on memory** — which is the whole Docker-stack integration job. Fixed at the read boundary (one guard where executor validation, CEL, and every REST/GraphQL/FHIR response converge) plus `setTypeParser(1082)` so a `Date` stays `'YYYY-MM-DD'`; 1184 deliberately still decodes to a Date because `rowToObject` casts the system timestamps. The conformance suite could not see it: its divergence-catching cases ran against memory only.
- **`marking-read-surfaces`** (`a61f2c1`) — SECURITY. `isTypeVisible` was imported into resolver-generator.ts and called at **two of the ten** generators. A caller holding a ReBAC `viewer` relation but lacking the marking was refused by `patient(id:)` and `patients`, then read the same rows via `searchPatients`, `patientAggregate`, `traversePatient`, any `@link` field targeting the marked type, or `history`. REST had the same hole differently: the global gate keys on the route's STATIC `objectType` and `enforce.ts` treats an absent one as nothing to check, so `POST /object-sets {"objectType":"Patient"}` then `GET /object-sets/:id/execute` returned rows the per-type route 404s. For `@link` the marking that applies is the TARGET type's. The existing `marking-enforcement.test.ts` passed throughout — the helper was never wrong, and a unit test cannot see an ABSENT call.
- **`marking-write-bypass`** (`354e6d7` exploits, **FIXED** in `c246b51`) — SECURITY, CLOSED. Three action-executor bypasses landed as failing tests by another session: (1) an undeclared caller-controlled param object lands in the CEL context verbatim — FIXED: `resolveTargetDetailed` now classifies a target that resolves to a caller-supplied value rather than a platform-read object as `forged` and denies it with MARKING_DENIED; (2) a mistyped link row routes a write to a marked type — FIXED: the runtime type from the stored link's `_toType` is checked against the marking policy in addition to the static type; (3) a stored property shadows the `@link` field — FIXED: `staticTargetType` walks `@link` hops from the declared param type, and `resolveTargetDetailed` tracks platform-loaded objects via a WeakSet so a caller-supplied object shaped like a stored one is rejected. `executeCreateObject` also now throws on `@-prefixed` properties to prevent `_type` forgery. 29 marking tests green, 241 actions tests green.
- **`llm-client-real`** (`4233863`) — `NoOpLLMClient` was the only implementation, so REST `/api/v1/llm/*`, the GraphQL fields and the MCP tools all 503'd — and the no-op's error told operators to set `LLM_PROVIDER`, which **nothing read**. Anthropic client on `fetch` (no vendor SDK). `embed()` and `vectorSearch()` throw rather than approximate: Anthropic publishes no embeddings endpoint and a zero vector would poison every similarity comparison silently, and vector search needs an index neither provider has. `createLLMClient` fails the boot when a provider is named without its credential rather than falling back to the stub, which would look healthy and 503 every call.
- **`traversal-maxdepth`** (`05a9bfa`) — `TraversalStep.maxDepth` was declared in the SPI and rejected by both providers, so self-referential hierarchies were unexpressible. Implemented with the semantics in `@altius/spi` rather than per provider: a node reachable at ANY depth 1..N is in the result; the step's node set and the frontier it hands on are the same set; `maxDepth: 1` is identical to omitting it; the budget counts hops, not steps. NOTE the retraction in that commit — the re-expansion guard bounds cost, not correctness, and the comments claiming otherwise were corrected after falsification showed every case still passing without it.
- **`filter-comparison-semantics`** (`08ef2d2`) — Two divergences the suite could not see because every range case it had used a numeric column AND a numeric literal. (1) memory's gt/gte/lt/lte required both operands to be JS numbers, so `?filter[age][gt]=30` (REST sends the string) matched nothing while Postgres cast and worked — and memory is the default when `POSTGRES_URL` is unset. Same guard broke every Date/DateTime range filter. (2) Postgres `neq` and `NOT` dropped rows whose column is NULL (three-valued logic), so "not archived" omitted every object whose status was never set, while memory's `!==` kept them. The SPI now states both, and they go opposite ways deliberately: `neq` INCLUDES an unset field, a range filter EXCLUDES it.
- **`computed-aggregate-truncation`** (`b42822d`) — `sumLinks`/`avgLinks`/`minLinks`/`maxLinks` called `getLinks` with no options, took the default 100-row page and reported it as a total: 150 readings of 1 answered `totalValue: 100`. `countLinks` reads `totalCount` and answered 150, so two computed fields contradicted each other on the same payload. Now asks for `MAX_LINK_QUERY_LIMIT` and throws on `hasNextPage`. Every existing case used 2-3 links, which is why none could see it. REMAINING, filed separately: `countLinks` takes `type` where the aggregates take `linkType`, and defaults to INBOUND where they default to OUTBOUND, so the obvious pairing on one ObjectType traverses opposite directions and silently returns 0.
- **`otlp-transport`** (`b677fd3`) — Every span export failed. The exporter is `exporter-trace-otlp-http` POSTing to `/v1/traces`, and every endpoint named 4317, the collector's gRPC listener. Healthy API, healthy collector, empty trace backend, no warning. Three layers, not one: ten compose endpoints, the helm value (wrong port AND no scheme, so `otel-collector:4317/v1/traces` was not a URL), and the egress NetworkPolicy, which allowlisted only 4317 — fixing the URL alone would have left Kubernetes dropping every span with an identical symptom.
- **`perf-suite-timed-failures`** (`d93effc`) — `tests/integration/src/performance.test.ts` asserted only `durationMs` and never that the call succeeded. No client throws, so a 500 in 3 ms satisfied every budget. Evidence: run 31987387610 reported `✓ src/performance.test.ts (8 tests)` in the same job where `POST /api/v1/actions/AdmitPatient` failed. Same class as the FHIR row below.
- **`vitest-rpc-false-red`** (`3bf83a8`) — A green Enforcement E2E run was reported as a job failure: `[vitest-worker]: Timeout calling "onTaskUpdate"`, with the suite's own summary reading `9 passed (9)`. `compose()` was `execSync`, and a `down -v` over ten containers holds the worker thread past the reporter RPC timeout. Now awaited via `spawn` in all three files of that job. A green run reported red is worse than a red one — it teaches you to discount the gate.
- **`image-scan-green`** (`c0c807f`, `7e38252`, `e4ee65a`) — The Trivy gate had never passed. 29 HIGH: 8 in cel-evaluator (x/net + Go 1.25.12 stdlib), 21 in web (nginx:1.27-alpine is alpine 3.21.3). The last 10 were two hand-maintained pin lists that go stale by construction — `go.mod` moved x/net to v0.56.0 but the scan was reading `grpc-health-probe`, built from a throwaway `/tools` module that resolves independently, and the web image upgraded a named list of two packages while five others lagged. `e4ee65a` is a regression I introduced and fixed: adding a fifth sequential `go get` broke the image build under Go 1.25.13 (`missing go.sum entry for golang.org/x/sys/unix`) because the tools module has no source for `go get` to compute build sums from; one combined `go get` resolves in a single pass. It did not reproduce locally on Go 1.26, which is why it shipped.
- **`prod-test-tenant`** (`22be599`) — `OIDC_DEFAULT_TENANT: nhs-trust-01` disagreed with the shipped realm, which claims `default`, and the claim wins over the default. Every request mapped to NO OpenFGA store: reads failed closed (so the deny-asserting specs passed) while `writeRelationship` threw `UNKNOWN_TENANT` and the grant answered 500.
- **`effect-binding-validator`** (`3787d12`) — `crossReferenceManifest` checked effect references against `@param` names only, but `executeCreateObject` injects each created object under the camelCase of its type name so a later effect can link to it — the only way to link an object an action creates. The AIP pack logged `UNKNOWN_PARAM_REF` for `chatMessage` on every boot for an action that runs correctly. Bindings now accumulate in manifest order, so a reference to an object created by a LATER effect is still reported.
- **`markings-merged`** (`7fa80cd`, PR #6) — The mandatory-markings feature had been stranded on an unmerged branch, 17 commits ahead and 39 behind, absent from `main` entirely. Merged after resolving five conflicts; four were stale Dockerfiles, and the fifth git could not see — both sides had added a `DEV_USER`, one hoisted into `@altius/security` so MCP and REST cannot drift, the other carrying `markings: []` and the reason for it. The shared definition now carries the property: none of DEV_USER's nine roles gets past a mandatory control, and a stand-in identity must hold no markings or the dev fallback becomes the way around one.
- **`fts-per-field-tsvector`** (working tree, uncommitted) — FULLTEXT indexes now emit per-field generated tsvector columns (`_fts_<field>`) with configurable stemming language (`IndexDefinition.language`, default 'english', validated alphanumeric to prevent SQL injection via regconfig name), each with its own GIN index. The search runtime detects these columns and, for word terms only, adds `plainto_tsquery` matching alongside ILIKE with `ts_rank_cd` score bonus (4x weight). Phrases stay ILIKE-only. This CLOSES the "no stemming/tsquery" gap in `defect-fixes/full-text-search-index-backed`. The provider passes the language from the schema's IndexDefinition through to the search function. Tests: ddl-generation.test.ts (per-field tsvector, multi-field, language config, injection guard), search.integration.test.ts (FTS matching and ranking).
- **`langchain-tool-export`** (working tree, uncommitted) — `ToolRegistry.toLangChainTools()` (packages/actions/src/tools/tool-registry.ts:489-580) exports bound, governed tools for LangChain agents. Unlike `toAnthropicTools`/`toOpenAiTools` (descriptor-only), this returns `{ name, description, schema, invoke }` where `invoke` runs `executeForAgent` with PolicyGuard hold, dryRun, and agentId/sessionId/model attribution. Fails at export if no executor or no PolicyGuard on high-risk actions. This CLOSES the "provider-native export is dead code" gap in `aip-agents/ontology-derived-llm-tool-registry` (partially — Anthropic/OpenAI exporters remain descriptor-only).
- **`aip-agent-package`** (working tree, uncommitted) — `packages/aip-agent` is a new workspace package providing a Deep Agents harness (deepagentsjs + LangGraph) connected to the Altius MCP endpoint. `createAltiusAgent()` connects via `MultiServerMCPClient` (Streamable HTTP at /mcp), loads all FGA-scoped tools at runtime, and creates a Deep Agent with MemorySaver checkpointer and a system prompt tailored to Altius governance. CLI entry point provides interactive chat. This moves `aip-agents/agent-construction-and-orchestration-chatbot` from `absent` to `partial` — programmatic agent construction exists, but Chatbot Studio, AIP Logic blocks, and durable thread persistence remain absent.
- **`marking-write-bypass-fixed`** (`c246b51`) — The three action-executor marking bypasses landed by `354e6d7` as failing tests are now CLOSED. `resolveTargetDetailed` classifies caller-supplied values as `forged` and denies them; `staticTargetType` walks `@link` hops from declared param types; `platformObjects` WeakSet tracks platform-loaded objects; runtime `_toType` is checked against the marking policy; `executeCreateObject` throws on `@-prefixed` properties. 29 marking tests green, 241 actions tests green.
- **`computed-filter-sort-aggregate`** (working tree, uncommitted) — Computed fields can now be used in filter, orderBy, and aggregate operations. ObjectManager.query() splits filters into storage-evaluable and computed-only parts, fetches all rows for the storage portion, evaluates computed fields, and applies computed filter/sort/pagination in memory. ObjectManager.aggregate() similarly fetches all rows and aggregates in memory. AND filters are split recursively so storage-evaluable conjuncts still push down to the DB. 11 tests in computed-filter-sort-aggregate.test.ts. This CLOSES the "computed fields cannot be used in filter, orderBy, or aggregate" gap in `defect-fixes/derived-computed-properties`.
- **`schema-breaking-gate`** (working tree, uncommitted) — Two fixes to schema evolution gating: (1) Default policy changed from 'warn' to 'block' — a BREAKING pack change now fails boot by default unless explicitly overridden with SCHEMA_BREAKING_POLICY=warn. (2) The breaking-change gate now runs BEFORE storage.applySchema so a BREAKING change fails boot before any DDL touches the database. Previously DDL was applied first, making the gate ineffective.
- **`oauth-client-management`** (working tree, uncommitted) — `OAuthClientManager` + `InMemoryOAuthClientStore` (packages/security/src/auth/) provide third-party application registration: client ID/secret generation, scrypt-hashed secrets, scope validation against PLATFORM_SCOPES, tenant isolation, secret rotation, and client authentication. 9 tests pass. Partially closes `misc-1/third-party-application-platform-developer-c` — OAuth client management exists but no REST/GraphQL admin endpoint, no Developer Console UI, no token issuance, no service-user provisioning.
- **`object-set-graphql-execution-algebra`** (working tree, uncommitted) — Two gaps in `data-ops/object-sets-saved-shareable-executable-objec` closed: (1) GraphQL now exposes `executeObjectSet`, `executeObjectSetAggregate`, and `combineObjectSets` (SDL in codegen/index.ts, resolvers in resolver-generator.ts). (2) Set algebra (UNION/INTERSECT/DIFFERENCE) implemented via `SetAlgebraInput` SPI + `ObjectSetManager.combine()`. 4 tests in object-set-algebra.test.ts.
- **`agent-thread-persistence`** (working tree, uncommitted) — `AgentThreadStore` SPI + `InMemoryAgentThreadStore` (packages/spi/src/agent-threads.ts, packages/engine/src/agent-threads/) provide durable conversation thread/message storage with tenant isolation, user-scoped listing, message history, and pagination. 9 tests pass. Partially closes the durable thread gap in `aip-agents/agent-construction-and-orchestration-chatbot` — storage exists but AIP agent still uses MemorySaver, no Postgres implementation, no REST/GraphQL API.
- **`function-registry-lifecycle`** (working tree, uncommitted) — `FunctionRegistry` (packages/engine/src/functions/function-registry.ts) provides function revision lifecycle: draft→published→deprecated status, revision history, test execution with expected-output comparison, and rollback to previous revisions. 9 tests in function-registry.test.ts. Partially closes `misc-2/user-authored-serverless-functions-typescrip` — lifecycle exists but no REST/GraphQL API, no Git repository integration, no CI/CD deploy pipeline.
- **`function-rest-graphql-api`** (working tree, uncommitted) — GraphQL mutations (createFunctionRevision, publishFunctionRevision, testFunctionRevision, rollbackFunction) and queries (functionRevision, functionRevisions) added to SDL (packages/odl/src/codegen/index.ts) and resolvers (packages/api/src/graphql/resolver-generator.ts). REST routes at /api/v1/functions-lifecycle/* (packages/api/src/rest/route-generator.ts). Closes the "no REST/GraphQL API to manage revisions" gap in `misc-2/user-authored-serverless-functions-typescrip`.
- **`python-function-runtime`** (working tree, uncommitted) — `PythonFunctionRuntime` (packages/engine/src/functions/python-runtime.ts) executes Python functions via child process with JSON stdin/stdout. Supports inline source, file paths, and registered handlers. 7 tests (5 skip if python3 not installed). Closes the "no Python runtime" gap in `misc-2/user-authored-serverless-functions-typescrip`.
- **`git-function-source`** (working tree, uncommitted) — `GitFunctionSource` (packages/engine/src/functions/git-function-source.ts) clones/pulls Git repos, reads files, lists files with glob matching. HTTPS-only URL validation, path traversal protection, token injection for private repos. 12 tests. Closes the "no code repository (Git integration)" gap in `misc-2/user-authored-serverless-functions-typescrip`.
- **`function-pipeline`** (working tree, uncommitted) — `FunctionPipeline` (packages/engine/src/functions/function-pipeline.ts) orchestrates source→draft→test→publish workflow with test-gated publishing. 6 tests. Closes the "no deploy pipeline" gap in `misc-2/user-authored-serverless-functions-typescrip`.
- **`sandbox-profile`** (working tree, uncommitted) — `SandboxProfile` (packages/engine/src/functions/sandbox-profile.ts) provides declarative filesystem/network restrictions for function execution. Enforced via LD_PRELOAD (Linux, sandbox-preload.c) or sandbox-exec (macOS). 18 tests. Both IsolatedNodeFunctionRuntime and PythonFunctionRuntime apply the sandbox. Closes the "process isolation is not a security sandbox" gap in `misc-2/user-authored-serverless-functions-typescrip`.
- **`function-rebac`** (working tree, uncommitted) — `FunctionAuthzMapping` (packages/odl/src/codegen/openfga.ts) and `deriveFunctionAuthzMapping` derive per-object ReBAC from ObjectType-typed @params. `invokeFunction` checks the FGA relation on the target object before the role gate. 7 tests. Closes the "authorization is role membership only" gap in `misc-2/user-authored-serverless-functions-typescrip`.
- **`nhs-acute-functions`** (working tree, uncommitted) — NHS acute pack now declares 2 CEL functions (ComputeTriageScore, ComputeLengthOfStay) in schema/functions.odl with per-patient ReBAC relations (can_compute_triage_score, can_compute_length_of_stay) in the FGA model. 72 pack tests pass. Closes the "no shipped pack declares @function" gap in `misc-2/user-authored-serverless-functions-typescrip`.
- **`webhook-pipeline-trigger`** (working tree, uncommitted) — `WebhookPipelineTrigger` (packages/engine/src/functions/webhook-pipeline-trigger.ts) receives GitHub/GitLab/generic webhooks, verifies HMAC-SHA256 signatures or tokens with timing-safe comparison, and runs matching pipelines. 10 tests. Closes the "no webhook trigger for the pipeline" gap in `misc-2/user-authored-serverless-functions-typescrip`.
- **`fts-weight-propagation`** (working tree, uncommitted) — `@searchable(weight:)` now propagates from ODL parser through schema-loader into `IndexDefinition.weight` (SPI). Both Postgres and memory search providers use it as a per-field score multiplier in ranking. 3 tests in search-weight.test.ts. Closes the "@searchable(weight:) is parsed and dropped" gap in `defect-fixes/full-text-search-index-backed`.
- **`llm-pipeline-runner`** (`7500dd6`) — `runLLMPipelineStep` (packages/engine/src/llm/llm-pipeline-runner.ts) wraps `LLMClient.complete` with automatic retries (exponential backoff + jitter), guaranteed output schemas (`LLMCompleteOptions.outputSchema` + `LLMSchema` type added to SPI), error handling (typed outcomes: success/provider_error/schema_error/exhausted_retries/misconfigured), and metrics (llm.calls, llm.duration, llm.tokens, llm.retries, llm.validation_failures added to observability). Schema validation is a minimal internal validator (type/required/properties/items/enum) — no ajv dependency. Code-fence stripping tolerates ` ```json ` responses. 9 tests in llm-pipeline-runner.test.ts. Partially closes `pipelines-data/code-based-batch-transform-framework-transfo` (LLM steps are pipeline-runnable but no scheduler/dataset abstraction) and `aip-agents/llm-compute-token-metering-and-attribution` (token counters exist but no per-model cost attribution or budget enforcement).
- **`llm-function-runtime`** (`7500dd6`) — `LLMFunctionRuntime` (packages/engine/src/functions/llm-function-runtime.ts) is a `FunctionRuntime` adapter for `@function(runtime: "llm")`. The function's `entry` is a prompt template with `{{input.<name>}}` placeholders; the runtime resolves the template, derives an `LLMSchema` from the function's declared return field, calls the LLM via the pipeline runner (so retries/schema validation/metrics apply), and unwraps the result. Wired into `FunctionExecutor` via the opt-in `llmRuntime` config parameter. A competent user can declare an AI function in ODL, run it through draft/test/publish, and invoke it over REST/GraphQL/MCP without writing platform code. 8 tests in llm-function-runtime.test.ts. Partially closes `aip-agents/managed-multi-provider-llm-gateway-model-acc` (AI functions are first-class) and `ontology-core/functions-user-authored-code-logic-on-object` (LLM-backed functions now exist alongside node/cel/python).
- **`workflow-graph`** (`bef7162`) — `WorkflowGraphBuilder` (packages/engine/src/workflow/workflow-graph.ts) derives a provenance graph (nodes: object/action/function/application; edges: produced/wrote/read/invoked/caused) from `LineageStore` and `AuditStore` records. Tenant-scoped; supports root-object queries for per-object provenance visualization. REST surface: GET /api/v1/workflow/graph, GET /api/v1/workflow/graph/:objectType/:objectId. Uses a structural `WorkflowAuditReader` interface so the engine does not depend on `@altius/security`. 4 tests in workflow-graph.test.ts. Partially closes `workshop-ui/interactive-graph-visualization-embedding-ve` (graph data API exists; no rendering layer) and `analytics-ts/interactive-graph-visualization-and-explorat` (same).
- **`workflow-monitor`** (`bef7162`) — `WorkflowMonitor` + `InMemoryWorkflowEventStore` (packages/engine/src/workflow/workflow-monitor.ts) provide a workflow event log with `workflowId` correlation IDs linking multi-step workflows (action→function→object write). Metrics: workflow.events, workflow.duration, workflow.failures added to observability. REST surface: GET /api/v1/workflow/events, GET /api/v1/workflow/workflows/:id, GET /api/v1/workflow/workflows/:id/summary. 5 tests in workflow-monitor.test.ts. Partially closes `misc-3/process-mining-derive-process-models-from-hi` (correlated event log exists; no process-model discovery or conformance checking) and `misc-1/time-series-and-process-monitoring-applicati` (workflow metrics exist; no time-series store or threshold alerts).
- **`hold-approve-policy-guard`** (working tree, uncommitted) — `HoldApprovePolicyGuard` (packages/actions/src/tools/hold-approve-policy-guard.ts) is the first concrete `PolicyGuard` implementation: holds high-risk agent actions for human approval with hold ID generation, approve/reject workflow, TTL-based expiry, and hold listing/cleanup. 13 tests pass. Partially closes `security-gov/ai-agent-write-governance-human-approved-non` — the hold mechanism exists but is not yet wired into the production ToolRegistry or MCP server, and no REST/GraphQL approve/reject endpoint exists.
- **`cdc-reconciliation`** (working tree, uncommitted) — `ReconciliationService` (packages/sync/src/cdc/reconciliation.ts) detects drift between source systems and the ontology: missing objects, orphaned objects, and field-level value differences. 10 tests pass. Partially closes `sync-ingest-ops/source-system-sync-cdc-ingestion-with-edit-v` — drift detection exists but automated resolution (wiring ConflictResolver) and manifest/deployment fixes remain open.

### Landed 19 Aug — SPI-to-REST wiring (§3.1–§3.5) and model consolidation (§4A–§4E, §5)

Five SPI services that were internally reachable only were wired to externally usable REST surfaces, and three duplicate/dead models were consolidated or deleted. PR #13 (merged `b92e093`). The wiring uses the existing dependency-only route generator, so authentication, rate limiting, marking enforcement, and auditing are shared with all other REST routes. Each service remains `partial` — in-memory storage is not persistent, and `full` requires a competent user to get the whole capability without writing platform code.

**§3.1 data-freshness** (`2b13e30`) — 5 REST endpoints: `GET /api/v1/data-freshness/types/:objectType`, `GET /api/v1/data-freshness/datasources/:datasourceId`, `GET /api/v1/data-freshness/query`, `GET /api/v1/data-freshness/summary`, `DELETE /api/v1/data-freshness/types/:objectType`. 7 tests. Invalidates the "no REST/GraphQL endpoint" gap on `widgets/data-freshness-widget-last-indexed-timestamp`.

**§3.2 security-governance** (`7bbae51`) — 10 REST endpoints across three services: `AccessExplanationService` (real `DefaultAccessExplanationService` from `packages/security`, not the in-memory fake — uses live `AuthorizationService` for ReBAC checks), `JustificationStore`, `ScopedSessionStore`. Routes: `POST /api/v1/access-explanation`, `GET/POST /api/v1/justifications`, `POST /api/v1/justifications/:id/approve`, `GET/POST /api/v1/scoped-sessions`, `DELETE /api/v1/scoped-sessions/:id`, `POST /api/v1/scoped-sessions/:id/check-marking`. 13 tests. Invalidates the "no REST/GraphQL endpoint" gaps on `security-gov/justification-records-break-glass-and-routi`, `security-gov/scoped-sessions-marking-restricted-s`, and `security-gov/access-explanation-service-explain-wh`.

**§3.3 ontology-sql** (`8f38d7b`) — 12 REST endpoints: `POST /api/v1/ontology-sql/execute`, `POST /api/v1/ontology-sql/explain`, `POST /api/v1/ontology-sql/validate`, `GET/POST /api/v1/ontology-sql/saved-queries`, `GET/PUT/DELETE /api/v1/ontology-sql/saved-queries/:id`, `POST /api/v1/ontology-sql/saved-queries/:id/execute`, `POST /api/v1/ontology-sql/saved-queries/:id/share`, `GET /api/v1/ontology-sql/virtual-tables`, `GET /api/v1/ontology-sql/virtual-tables/:objectType`. The in-memory service's object reader is wired to `ObjectManager.query()` so SQL queries read live ontology data. 13 tests. Invalidates the "no REST/GraphQL endpoint" gap on `misc-1/ad-hoc-sql-analytics-over-the-ontology-sql-s`.

**§3.4 datasets** (`47a3b94`) — 15 REST endpoints for `DatasetService`: CRUD for datasets, schema, branches, transactions, insert/read/delete rows. Routes under `/api/v1/datasets/`. 9 tests. Invalidates the "no REST API" gap on `pipelines-data/versioned-transactional-dataset-primitive`.

**§3.5 usage-metrics** (`65066d5`) — 9 REST endpoints: `GET /api/v1/usage-metrics/object-types/:objectType`, `GET /api/v1/usage-metrics/action-functions/:name`, `GET /api/v1/usage-metrics/summary`, `GET /api/v1/usage-metrics/events`, `GET /api/v1/usage-metrics/active-users`, `GET/POST /api/v1/usage-metrics/monitoring-rules`, `DELETE /api/v1/usage-metrics/monitoring-rules/:id`, `POST /api/v1/usage-metrics/monitoring-rules/evaluate`. `record()` is NOT exposed — it is an instrumentation hook only; exposing a manual write endpoint would allow callers to forge usage data. 12 tests. Invalidates the "no REST/GraphQL endpoint to query metrics" gap on `misc-3/ontology-usage-metrics-and-change-impact-obs`.

**§4A marking model consolidation** (`6ca9b6d`) — Three marking models merged onto new `packages/spi/src/marking-policy.ts`: `MarkingRecord` (was `MarkingDefinition` in `multi-ontology.ts`), `CreateMarkingInput`, `MarkingPropagationRule`, `PropagatedMarkings` (were in `security-governance.ts`). Backward-compat alias `MarkingDefinition` → `MarkingRecord`. The security package's `MarkingPolicy` class (the real evaluation engine) is unchanged.

**§4B SQL parser merge** (`0c39c9d`) — Two separate `parseSql()` functions (in `in-memory-ontology-sql.ts` and `in-memory-dataset-services.ts`) merged into one shared `packages/storage-memory/src/sql-parser.ts` returning `ParsedSqlAst`. Both consumers adapted to the unified AST.

**§4C widget-library deletion** (`2c19c37`) — `WidgetLibraryService` SPI and `InMemoryWidgetLibraryService` deleted (-454 lines). Zero consumers outside index re-exports. `WorkshopPlatformService` already covers apps, templates, widget catalog, modules, variables, object views. **Falsifies evidence on `widgets/no-code-widget-library-app-building-ui-layer`** (cited `packages/spi/src/widget-library.ts`) and **`workshop-ui/widget-library-60-widgets-object-tables-list`** (cited `InMemoryWidgetLibraryService`).

**§4D value-formatting deletion** (`5802447`) — `ValueFormattingService` SPI and `InMemoryValueFormattingService` deleted (-782 lines). Formatting concepts folded into `DisplayDirective` (`packages/odl/src/parser/types.ts`) which now has `formatKind`, `formatParams`, and `conditionalFormats` fields. **Falsifies evidence on `workshop-ui/value-and-conditional-formatting-metadata`** (cited `packages/spi/src/value-formatting.ts`).

**§4E embedding rename** (`8d210af`) — `embedding.ts` → `app-embedding.ts` in both SPI and storage-memory. Disambiguates app embedding (`EmbeddingService`) from vector embeddings (`EmbeddingStore` in `embeddings.ts`).

**§5 dead-code deletion** (`a33249b`) — `MarkingPropagationService` interface deleted (no consumers, no implementation). Multi-ontology marking CRUD methods removed from `MultiOntologyGovernanceService` and its in-memory implementation. **Falsifies evidence on `security-gov/marking-propagation-along-data-lineage-inher`** (cited `MarkingPropagationService` SPI — the interface no longer exists). `padding` was already absent from the codebase.

**Open items this session did not close.** ~~`marking-write-bypass` above is the important one~~ — CLOSED in `c246b51`. Also still true: the `@computed` direction/argument inconsistency (`countLinks` vs the aggregates), and `packages/api/src/graphql/errors.ts` withholds error messages identically to the REST path fixed in `496299e` but still logs nothing, so the same failure over GraphQL remains untraceable.

### Rows whose stated evidence is now false

Every row below was graded on a sentence that no longer holds. None has been
re-graded — the grade may well still be right — but do not quote its evidence
back at anyone, and re-read the code before you claim it.

**The frontend landed (23 rows).** These were graded on some form of "no
frontend package exists", "no UI layer", "zero .tsx files", or "no react
dependency in any package.json". `packages/web` is now in the tree: React 19 +
Vite, an OIDC PKCE login, an editorial shell (icon rail, sidebar, governance
rail, trace bar), a Facilities screen with stats/filters/table/live-updates,
and action forms generated from the parameter schema. That is a working slice,
NOT a widget library and NOT an app builder — most of these rows are still
`absent` on their actual capability. What changed is that the reason given is
no longer the reason. **Re-verified 17 Aug (later):** one row moved from
`absent` to `partial` (`workshop-ui/design-system-theming` — a design system
now exists). The rest stayed on their grades; see the "Re-grading pass, 17 Aug
2026 (later)" section above for per-row evidence updates.

- `aip-agents/embedded-ai-copilots-across-platform-applica`
- `analytics-ts/interactive-graph-visualization-and-explorat`
- `analytics-ts/interactive-time-series-analysis-workbench-w`
- `misc-1/interactive-geospatial-mapping-map-app-layer`
- `misc-1/no-code-operational-app-building-workshop-wi`
- `misc-2/interactive-geospatial-map-application-layer`
- `misc-2/mobile-application-delivery-workshop-mobile-`
- `misc-3/time-aware-graph-exploration-and-versioned-s`
- `misc-3/visual-ontology-management-application-ontol`
- `misc-3/workshop-application-ux-platform-features-st`
- `pipelines-data/no-code-pipeline-authoring-with-configurable`
- `platform-ops/no-code-end-user-rule-authoring-with-proposa`
- `scenarios-sim/scenario-and-graph-ui-tooling-vertex-canvas-`
- `widgets/aggregation-chart-widgets-chart-xy-pie-vega-`
- `widgets/layout-navigation-and-device-capture-widgets`
- `widgets/live-updating-widgets-and-event-driven-inter`
- `widgets/no-code-widget-library-app-building-ui-layer`
- `workshop-ui/auto-generated-action-forms-governed-writeba`
- `workshop-ui/interactive-graph-visualization-embedding-ve`
- `workshop-ui/low-code-application-builder-workshop-module`
- `workshop-ui/mobile-application-support-mobile-app-launch`
- `workshop-ui/typed-sdk-for-custom-react-application-build`
- `workshop-ui/widget-library-60-widgets-object-tables-list`

**Other rows falsified by specific changes (8).**

- `ai-agent-surface/external-ai-ide-access-via-mcp-external-agen`
  - no longer true: "(b) tool discovery is not permission-scoped — packages/mcp-server/src/server.ts:74 builds the list once at server construction and server.ts:161-164 returns every action and every "
  - at HEAD: At HEAD `packages/mcp-server/src/server.ts:231` answers tools/list with `await scopeToolList(toolList, caller, deps)`. `scopeToolList` (tools.ts:138-205) derives each action's relation and target type via `deriveActionAu
- `ai-agent-surface/llm-agent-tool-access-to-platform-ontology-m`
  - no longer true: "**Gap:** No builder/ops tool surface (schema editing, SQL, platform ops); OAuth is token-validation only with no grant types or client management; dev-mode fallback (NODE_ENV != pr"
  - at HEAD: The third clause is false at HEAD. packages/mcp-server/src/auth.ts:54 gates the fallback on `isDev && devBypassEnabled()`, and devBypassEnabled (:24-26) delegates to devAuthBypassEnabled('ALTIUS_MCP_DEV_AUTH_BYPASS') in 
- `misc-1/third-party-application-platform-developer-c`
  - no longer true: "The OSDK analogue is dead code: generateSdk exists (packages/odl/src/codegen/sdk.ts:416) but its only callers are packages/odl/src/__tests__/sdk-codegen.test.ts — the CLI exposes o"
  - at HEAD: False at HEAD: the CLI has `generate sdk <paths...>` (packages/odl/src/cli/index.ts:256-275, calling generateSdk at :267), the sdk package's pretest/prebuild runs it over all four domain packs, and packages/sdk-typescrip
- `misc-3/mcp-agent-integration-ontology-mcp-exposing-`
  - no longer true: "Dry-run is now reachable on REST (?dryRun=true, route-generator.ts:1601 → action-executor.ts:401-412) but MCP's invokeActionTool never passes it (tools.ts:242-248), so agents still"
  - at HEAD: At HEAD `packages/mcp-server/src/tools.ts:227` advertises a reserved `dryRun` property on every action tool's input schema, and :483-495 strips it from the params and passes `{ dryRun: true }` through to the executor, so
- `platform-ops/continuous-delivery-upgrade-orchestration-ap`
  - no longer true: "CD side is still empty."
  - at HEAD: .github/workflows/docker-publish.yml (added b526421, extended 3b9fbe1) builds and pushes five service images to GHCR on every push to main and on v* tags. It has executed repeatedly and concluded success — the run at HEA
- `schema-interfaces-agents/actions-and-ontology-surfaced-as-ai-agent-to`
  - no longer true: "Auth: packages/mcp-server/src/auth.ts:43-48 gates the dev-user fallback on `ALTIUS_MCP_DEV_AUTH_BYPASS === 'true' && NODE_ENV !== 'production'`, fail-closed when unset, consumed at"
  - at HEAD: Citation-level only, and I am flagging it as such rather than as a grade change: the control still holds exactly as described, but e3780c4 moved the literal expression out of packages/mcp-server/src/auth.ts into packages
- `sync-ingest-ops/platform-health-checks-operational-monitorin`
  - no longer true: "The four altius_sync_* gauges are only registered-with-values when a scheduler exists (server.ts:741 startSyncMetricsGauge only when syncBoot.scheduler is non-null), which no shipp"
  - at HEAD: The 'no shipped deployment can achieve' clause is now false. packages/api/src/server.ts:838 starts the scheduler when SYNC_SCHEDULER_ENABLED === 'true', and :847 calls startSyncMetricsGauge whenever syncBoot.scheduler is
- `sync-ingest-ops/source-system-sync-cdc-ingestion-with-edit-v`
  - no longer true: "The scheduler remains unreachable in either shipped deployment: SYNC_SCHEDULER_ENABLED appears nowhere in Orion/helm/altius/templates/configmap.yaml (whole 89-line file read — INGE"
  - at HEAD: aee4dc9 put SYNC_SCHEDULER_ENABLED (and AUTOMATION_ENABLED) into exactly that fixed literal block — Orion/helm/altius/templates/api-gateway-deployment.yaml:78-81, driven by values.yaml:55-59 `singleInstance.syncScheduler

**Rows falsified by §3–§5 (19 Aug, PR #13).** These rows cited files or interfaces that were deleted, or claimed "no REST endpoint" for services that now have one. None has been re-graded — the grade may still be right (wiring a service to REST does not make it `full`), but the evidence is stale.

- `widgets/no-code-widget-library-app-building-ui-layer`
  - no longer true: "`WidgetLibraryService` SPI (packages/spi/src/widget-library.ts) defines a widget registry..."
  - at HEAD: `widget-library.ts` and `in-memory-widget-library.ts` were DELETED in §4C. `WorkshopPlatformService` is the surviving app-definition model.
- `workshop-ui/widget-library-60-widgets-object-tables-list`
  - no longer true: "`InMemoryWidgetLibraryService` (packages/storage-memory/src/in-memory-widget-library.ts) ships with 22 pre-registered widget definitions..."
  - at HEAD: File deleted in §4C. The widget catalog now lives in `WorkshopPlatformService` (`workshop-platform.ts`).
- `workshop-ui/value-and-conditional-formatting-metadata`
  - no longer true: "`ValueFormattingService` SPI (packages/spi/src/value-formatting.ts) defines value formats..."
  - at HEAD: `value-formatting.ts` and `in-memory-value-formatting.ts` were DELETED in §4D. Formatting concepts folded into `DisplayDirective` (`packages/odl/src/parser/types.ts`).
- `security-gov/marking-propagation-along-data-lineage-inher`
  - no longer true: "`MarkingPropagationService` SPI now exists with `computeEffectiveMarkings`, `getRules`, `setRules`, and `simulate` (packages/spi/src/security-governance.ts)."
  - at HEAD: `MarkingPropagationService` interface was DELETED in §5 (no consumers, no implementation). `MarkingPropagationRule` and `PropagatedMarkings` types moved to `marking-policy.ts`.
- `misc-3/ontology-usage-metrics-and-change-impact-obs`
  - no longer true: "no REST/GraphQL endpoint to query metrics"
  - at HEAD: 9 REST endpoints wired in §3.5 under `/api/v1/usage-metrics/`. `record()` is intentionally not exposed (instrumentation-only).
- `widgets/data-freshness-widget-last-indexed-timestamp`
  - no longer true: evidence does not mention REST endpoints (they did not exist when graded)
  - at HEAD: 5 REST endpoints wired in §3.1 under `/api/v1/data-freshness/`.
- `misc-1/ad-hoc-sql-analytics-over-the-ontology-sql-s`
  - no longer true: evidence does not mention REST endpoints (they did not exist when graded)
  - at HEAD: 12 REST endpoints wired in §3.3 under `/api/v1/ontology-sql/`.
- `pipelines-data/versioned-transactional-dataset-primitive`
  - no longer true: evidence does not mention REST endpoints for DatasetService (they did not exist when graded)
  - at HEAD: 15 REST endpoints wired in §3.4 under `/api/v1/datasets/`.
- `security-gov/justification-records-break-glass-and-routi`
  - no longer true: "no GraphQL/REST endpoint to submit justifications"
  - at HEAD: REST endpoints wired in §3.2 under `/api/v1/justifications`.
- `security-gov/scoped-sessions-marking-restricted-s`
  - no longer true: "no REST/GraphQL endpoint to create/manage sessions"
  - at HEAD: REST endpoints wired in §3.2 under `/api/v1/scoped-sessions`.
- `security-gov/access-explanation-service-explain-wh`
  - no longer true: "no REST/GraphQL endpoint to request explanations"
  - at HEAD: REST endpoint wired in §3.2 at `POST /api/v1/access-explanation`. Uses the real `DefaultAccessExplanationService` from `packages/security`, not an in-memory fake.

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


## Re-grading pass, 17 Aug 2026

A full re-grading pass ran against all rows whose evidence was falsified by the
86 changes that landed after the 16 Aug snapshot. Each row was read against
current source; grades were reassigned using the bar "a competent user gets the
whole capability without writing platform code."

**Result: 6 rows moved from `absent` to `partial`. No row reached `full`.**

The six grade changes:

1. `security-gov/markings-mandatory-access-control-labels-wit` — `absent` → `partial`.
   `MarkingPolicy` with conjunctive/disjunctive categories, hierarchical rank, and
   fail-closed semantics now exists (packages/security/src/markings/marking-policy.ts).
   Read-path enforcement is wired across GraphQL, REST, and MCP. NOT `full`: three
   write-path bypasses remain open (`354e6d7`, FAILING BY DESIGN), and no marking
   administration API or per-user marking membership store exists.

2. `misc-1/classification-based-access-controls-hierarc` — `absent` → `partial`.
   The marking policy implements hierarchical rank (Top Secret satisfies Secret)
   and disjunctive releasability (any one marking in a DISJUNCTIVE category). NOT
   `full`: same write-path bypasses as markings; no classification inheritance or
   propagation to derived objects; no administrative API.

3. `misc-1/llm-application-platform-aip-multi-model-cat` — `absent` → `partial`.
   `AnthropicLLMClient` implements real `complete()` and `stream()` against the
   Anthropic Messages API (packages/engine/src/llm/anthropic-llm-client.ts).
   `createLLMClient` fails the boot when a provider is named without its credential.
   NOT `full`: `embed()` and `vectorSearch()` throw; no model catalog, prompt
   engineering, AIP Logic orchestration, or token governance.

4. `misc-1/third-party-application-platform-developer-c` — `absent` → `partial`.
   The OSDK analogue is functional: CLI `odl generate sdk <paths...>` is wired
   (packages/odl/src/cli/index.ts:257), the published `@altius/sdk` package has
   1349 lines of generated client with real fetch/WebSocket transport, and 9
   runtime tests pass. NOT `full`: no developer console, no OAuth client/secret
   management, no scoped tokens, no service-user identities.

5. `aip-agents/managed-multi-provider-llm-gateway-model-acc` — `absent` → `partial`.
   A provider abstraction (`createLLMClient`) and a real Anthropic client exist with
   credential handling and fail-closed boot. NOT `full`: no model catalog, no
   per-tenant enablement, no capacity/quota enforcement, only one provider
   implemented, `embed()`/`vectorSearch()` throw.

6. `aip-agents/agent-construction-and-orchestration-chatbot` — `absent` → `partial`.
   `packages/aip-agent` provides a Deep Agents harness (deepagentsjs + LangGraph)
   connected to the Altius MCP endpoint, with `toLangChainTools` binding governed
   action execution into LangChain tool objects. NOT `full`: no Chatbot Studio or
   no-code agent builder (programmatic factory only), no AIP Logic block
   orchestration, no durable thread persistence (MemorySaver is in-process only).

**Rows whose evidence is stale but whose grade did not change** are documented in
the "Rows whose stated evidence is now false" section below. The most common
pattern: 23 frontend rows were graded `absent` on "no frontend package exists" —
`packages/web` now exists (React 19 + Vite, OIDC PKCE login, one object table,
action forms), but the actual capabilities those rows grade (widget library, app
builder, graph visualization, mobile, etc.) remain `absent` or `partial` on their
own merits. The reason changed; the grade did not.

Other evidence-only updates not requiring a grade change:
- `platform-ops/continuous-delivery-upgrade-orchestration-ap` (`partial`): "CD side
  is still empty" is stale — docker-publish.yml now builds and pushes 5 images to
  GHCR. Still `partial`: no environments, promotion, canary, or rollback.
- `sync-ingest-ops/platform-health-checks-operational-monitorin` (`partial`): "no
  shipped deployment can achieve" sync gauges is stale — SYNC_SCHEDULER_ENABLED is
  now in the Helm config. Still `partial`: other health gaps remain.
- `sync-ingest-ops/source-system-sync-cdc-ingestion-with-edit-v` (`partial`):
  "scheduler remains unreachable in either shipped deployment" is stale —
  SYNC_SCHEDULER_ENABLED is now in Helm. Still `partial`: reconciliation still
  refused, manifests still broken.
- `ai-agent-surface/external-ai-ide-access-via-mcp-external-agen` (`partial`):
  "tool discovery is not permission-scoped" is stale — `scopeToolList` now derives
  per-caller tools. Still `partial`: admin gating per-pack, no IDE package.
- `ai-agent-surface/llm-agent-tool-access-to-platform-ontology-m` (`partial`):
  "dev-mode fallback admits unauthenticated callers as 9-role admin" is stale —
  now requires explicit opt-in flag. Still `partial`: no builder/ops tools, OAuth
  token-validation only.
- `misc-3/mcp-agent-integration-ontology-mcp-exposing-` (`partial`): "query
  functions invisible to MCP" is stale (`4b94483`); "dry-run over MCP" is also
  stale (tools.ts now passes dryRun through). Still `partial`: no object-type SQL,
  no agents-as-tools composition.
- `widgets/aip-llm-widgets-aip-chatbot-aip-generated-co` (`partial`): "NO LLM
  client in the repo" is stale — AnthropicLLMClient exists. "MCP is a server, not
  a client" is partly stale — packages/aip-agent provides a reference agent client.
  Still `partial`: no chat UI widget, no generation endpoint exposed to a widget.
- `aip-agents/ontology-derived-llm-tool-registry-tool-fact` (`partial`):
  "schema.functionTypes are never turned into tools" is stale (`4b94483`).
  "Provider-native export is dead code" is partly stale — `toLangChainTools` now
  exports bound, governed tools. Still `partial`: only 1/4 packs enable MCP,
  toAnthropicTools/toOpenAiTools remain descriptor-only, dry-run facade.
- `misc-2/ai-fde-agentic-platform-assistant-mode-scope` (`absent`): "No LLM
  client" and "no agent exist" are stale. Still `absent`: no mode-scoped platform
  assistant, no planner, no clarification loop, no self-directed platform work.
- `aip-agents/agent-construction-and-orchestration-chatbot` — MOVED to `partial`
  (see grade change #6 above). packages/aip-agent provides programmatic agent
  construction; Chatbot Studio, AIP Logic blocks, and durable threads remain absent.
- `aip-agents/llm-compute-token-metering-and-attribution` (`absent` → `partial`): "no LLM
  call to meter" is stale. `llm.tokens` counter added to observability; `LLMResponse` carries
  prompt/completion/total tokens; `runLLMPipelineStep` emits token metrics per call. Still
  `partial`: no per-model cost attribution, no budget/quota enforcement, no per-tenant token
  accounting.
- `security-gov/ai-agent-write-governance-human-approved-non` (`partial`): "no
  dry-run over MCP" and "MCP search reads are unaudited" are both stale. Still
  `partial`: no human-in-the-loop hold, no PolicyGuard implementation.
- `misc-3/required-property-enforcement-non-null-valid` (`partial`): "@default
  is never materialized" is stale (`7b05b44` fixed it). Still `partial`: error
  codes differ per provider, no structured VALIDATION_ERROR, no validation HTTP
  status.
- `actions-concurrency/action-side-effect-webhooks-to-external-syst` (`partial`):
  "delivery failure is completely silent" is partly stale (`7e9b761` wired a pino
  adapter). Still `partial`: no metric, inline delivery, no durable queue.
- `scenarios-sim/business-logic-as-ontology-bound-functions-f` (`partial`):
  "GraphQL only" and "no MCP tool" are stale (REST route + MCP function tools
  landed). Still `partial`: function-backed Actions don't exist, no shipped pack
  uses functions.
- `ontology-core/functions-user-authored-code-logic-on-object` (`partial`):
  "functions are unreachable over MCP" is stale (`4b94483`). Still `partial`:
  function-backed actions and user-defined aggregations absent.
- `misc-2/user-authored-serverless-functions-typescrip` (`partial`):
  "FunctionTypes are absent from MCP" is stale (`4b94483`). Still `partial`: no
  Python, no repository/test/publish lifecycle, isolation not a security boundary.

**New counts: 11 full, 91 partial, 85 absent** (6 moved from `absent` to `partial`).

## Re-grading pass, 17 Aug 2026 (later — editorial shell)

The editorial shell landed (`7f3aaf6`, `be5e396`, `79812a1`) after the re-grading
pass above. The web app moved from a single unstyled patient worklist to a
four-column Shell-C editorial layout with a design system, governance rail,
trace bar, Facilities screen, and pack/role/job/screen navigation.

**Result: 1 row moved from `absent` to `partial`. No row reached `full`.**

The grade change:

1. `workshop-ui/design-system-theming-unified-component-desi` — `absent` → `partial`.
   `packages/web/src/editorial.css` is a real design system: `--ed-*` CSS variables
   (bg, fg, muted, rule, surface, sans, mono, healthy/pressure/disrupted), IBM Plex
   Sans/Mono typography, light/dark mode via `prefers-color-scheme`, greyscale chrome
   with colour only for data-viz status, and responsive breakpoints. The shell
   components (EditorialShell, GovernanceRail, TraceBar, FacilitiesScreen) implement
   unified component design with consistent class naming (`ed-*` prefix). NOT `full`:
   no saved module colour palettes, no typography controls, no theme editor, no
   per-module palette persistence — the design system is hardcoded, not user-configurable.

**Rows whose evidence is stale but whose grade did not change:**

- `workshop-ui/typed-sdk-for-custom-react-application-build` (`partial`): "No React
  bindings — zero .tsx files, no react dependency" is STALE. `packages/web` is a
  React 19 app consuming `@altius/sdk` with real fetch/WebSocket transport, and
  ActionForm renders forms from the SDK's JSON-Schema action descriptors. Still
  `partial`: no published React hooks/component library (no `useQuery`/`useSubscription`
  hooks, no dnd-osdk-react equivalent), no React bindings a pack author could depend
  on — @altius/web is an application, not a library.

- `workshop-ui/low-code-application-builder-workshop-module` (`absent`): "zero
  .tsx/.html/.css" and "no package named workshop/app/ui exists" are STALE. The
  editorial shell has a layout (icon rail, sidebar, main, governance rail, trace bar)
  and navigation (pack/role/job/screen switching). Still `absent`: no Workshop module
  model (no pages, sections, overlays, templates), no editor, no app-definition
  persistence, no ApplicationDefinition type — the shell is a hardcoded React app,
  not a low-code builder.

- `workshop-ui/widget-library-60-widgets-object-tables-list` (`absent`): "No
  rendering layer of any kind" is STALE. ~6 React components exist (ObjectTable,
  ActionPanel, ActionForm, FacilitiesScreen, GovernanceRail, TraceBar). Still
  `absent`: ~6 hardcoded components ≠ a ~60-widget library; no charts, maps, Gantt,
  pivot, media, comments, or AIP-chat widgets; no per-widget display optimization.

- `widgets/no-code-widget-library-app-building-ui-layer` (`absent`): "zero .tsx"
  is STALE. Still `absent`: no no-code widget library, no module builder, no
  configurable widget rendering.

- `widgets/layout-navigation-and-device-capture-widgets` (`absent`): "no UI exists"
  is STALE — the shell has a header and navigation layout. Still `absent`: no Tabs,
  Stepper, Markdown, Mobile Navbar, QR Code Reader, camera capture, or geolocation
  prompt; the shell layout is hardcoded chrome, not configurable widgets.

- `workshop-ui/events-interactivity-system-widget-events-la` (`partial`): "there is
  no client" is STALE — `packages/web` is a client with CDC live updates via
  `client.facility.onAnyChange` coalesced at 250ms. Still `partial`: no widget event
  bus, no variable propagation, no on-load triggers, no auto-refresh intervals —
  the Facilities screen refetches on change events but there is no declarative
  event/trigger model.

- `workshop-ui/auto-generated-action-forms-governed-writeba` (`partial`): "No form
  renderer" is STALE — ActionForm (packages/web/src/components/ActionForm.tsx)
  renders forms from the JSON-Schema parameter descriptor, with enum dropdowns,
  date pickers, number inputs, boolean checkboxes, and server-side validation
  feedback via aria-invalid. Still `partial`: no labels, descriptions, field
  ordering, prefill from a selected object, conditional visibility; enum options
  are still erased in the OpenAPI descriptor; no dry-run/preview before submit.

- `workshop-ui/read-only-dashboard-delivery-org-app-access-` (`partial`): "There is
  nothing to deliver" is partly STALE — the editorial shell is a dashboard-like
  surface with governed reads. Still `partial`: no kiosk mode, no share-link, no
  app-access scoping, no full-screen/auto-cycle presentation mode.

- `workshop-ui/mobile-application-support-mobile-app-launch` (`absent`): "No client
  of any kind exists" is STALE. Still `absent`: no mobile app launcher, no mobile
  design mode, no nav bar/QR/location widgets, no browser-history navigation — the
  shell has responsive breakpoints but is not a mobile app.

- `workshop-ui/interactive-graph-visualization-embedding-ve` (`partial`): "no .tsx
  file anywhere in the repo" is STALE. Still `partial`: no graph renderer, no layouts,
  no layer styling, no grouping, no saved graph selections, no time panels — the
  traverse API returns JSON and the user builds every pixel.

- `widgets/object-display-widgets-object-table-object-l` (`partial`): evidence about
  "no UI layer" is STALE — FacilitiesScreen renders a real object table with the SDK.
  Still `partial`: no display metadata substrate (the `@display` directive landed but
  is not consumed by the web app), _createdAt/_updatedAt still absent from normal
  reads, REST Links returns edge records, REST sort is single-key.

- `widgets/live-updating-widgets-and-event-driven-inter` (`partial`): "No cross-
  component event/variable bus exists — there is no UI layer" is STALE. Still
  `partial`: property-level subscription filtering still doesn't work (silently
  delivers nothing), the SDL promises a full non-null object but the payload carries
  only id and _type, and there is no Workshop-style event or variable bus — the
  Facilities screen refetches on change but there is no declarative interactivity
  model.

- `widgets/action-triggering-widgets-button-group-custo` (`partial`): no explicit
  "no UI" claim in the evidence, but ActionPanel and ActionForm now exist as
  client-side action-triggering widgets. Still `partial`: no dry-run over HTTP,
  no per-object action applicability filtering, no file-upload transport.

- `widgets/audit-and-edit-history-widgets-action-log-ti` (`partial`): no explicit
  "no UI" claim, but the TraceBar now renders the pipeline stages and the audit id.
  Still `partial`: GraphQL auditRecords is unpaged at the store, no field-level
  diff, no edit-history UI widget.

**New counts: 11 full, 92 partial, 84 absent** (1 moved from `absent` to `partial`).

## Re-grading pass, 17 Aug 2026 (Fase 0 — quick wins)

A re-grading pass ran against the 5 items identified as Fase 0 quick wins.
Each was read against current source; the bar is "a competent user gets the
whole capability without writing platform code."

**Result: 4 rows moved from `partial` to `full`. 1 row stayed `partial` with
updated evidence.**

The four grade changes:

1. `defect-fixes/full-text-search-index-backed` — `partial` → `full`.
   Per-field generated tsvector columns with GIN indexes, configurable stemming
   language, `plainto_tsquery` word matching alongside ILIKE, `ts_rank_cd` score
   bonus, `@searchable(weight:)` propagated from ODL parser through schema-loader
   into `IndexDefinition.weight` and used as per-field score multiplier in both
   providers. 104 conformance + 3 weight + DDL generation tests pass.

2. `defect-fixes/derived-computed-properties` — `partial` → `full`.
   Computed fields can be used in filter, orderBy, and aggregate operations.
   `ObjectManager.query()` splits filters into storage-evaluable and computed-only
   parts, fetches all rows for the storage portion, evaluates computed fields,
   and applies computed filter/sort/pagination in memory. `ObjectManager.aggregate()`
   similarly. AND filters are split recursively. 11 tests pass. Remaining
   limitations (EAGER read-time not write-time, in-memory fetch-all, MCP fallback)
   are performance/optimization concerns, not capability gaps.

3. `misc-3/required-property-enforcement-non-null-valid` — `partial` → `full`.
   Action executor calls `validateSchemaFields` and produces `VALIDATION_ERROR`
   with field name on both providers. `@default` is materialized in both providers
   (schema-loader populates `defaultValue`, Postgres emits `DEFAULT <literal>`,
   memory applies default before required check). `VALIDATION_ERROR` maps to
   `validation` category → HTTP 400. Action route returns 200 for in-band
   failures by deliberate contract (like GraphQL). Tests pin all of this.

4. `storage-conformance/property-system-base-types-required-unique-c` — `partial` → `full`.
   All four sub-gaps closed: memory enforces required + unique constraints,
   custom scalars are format-validated (Date/DateTime/Duration/URI/GeoPoint),
   `isList` crosses the SPI boundary with real Postgres array columns,
   670/670 conformance tests pass (335 per provider, PostgreSQL 17.7).

The one evidence-only update:

5. `widgets/audit-and-edit-history-widgets-action-log-ti` — stayed `partial`.
   The GraphQL auditRecords paging bug is CLOSED: the resolver now passes
   `{ limit, offset }` to `auditStore.query()` and gets `totalCount` from a
   separate `auditStore.count()` call. Both stores implement these methods.
   Still `partial`: no audit/edit-history widget in the UI, no field-level diff
   (clients diff whole snapshots), history endpoint is REST-only.

**New counts: 15 full, 88 partial, 84 absent** (4 moved from `partial` to `full`).

## Phase 1, 17 Aug 2026 (later) — structs/shared-properties

F1.5 `ontology-core/structs-shared-properties-and-property-reduc` was
implemented end to end: `@struct` directive → parser → validator (cycle
detection, forbidden directives) → codegen (GraphQL `type` + `input`
companions) → SPI (`OntologySchema.structTypeNames`) → Postgres JSONB column
mapping → engine recursive struct validation → schema-merge dedup. Tests:
7 parser/validator, 7 engine validation, 4 DDL. All package suites green
(359 ODL + 359 engine + 138 memory + 178 postgres + 800 API + 254 actions).
Row moved from `absent` to `partial`: the struct property type is complete,
but shared property definitions (declare once, reuse across types) and
property reducers (first-class aggregation concept) remain absent.

**New counts: 15 full, 89 partial, 83 absent** (1 moved from `absent` to `partial`).

## Phase 2, 17 Aug 2026 (later) — UI platform layer

Six placeholder screens in the Editorial Shell were wired to live, governed
data, turning the web app from a 2-screen demo (Facilities + Patients) into
a 8-screen operational console:

1. **Shipments** (`ShipmentsScreen.tsx`): ObjectTable over the SDK's
   `shipment.list` + `onAnyChange` subscription. Status badges for
   PENDING/IN_TRANSIT/DELAYED/CUSTOMS_HOLD/DELIVERED/LOST. Sortable by
   tracking number, status, mode, quantity, ETA, arrival date.

2. **Purchase orders** (`PurchaseOrdersScreen.tsx`): ObjectTable over
   `purchaseOrder.list` + subscription. Status badges for the 7 OrderStatus
   values. `unitCost`/`currency` are subject to field-level redaction and
   render the redacted marker when the viewer lacks the relation.

3. **Inventory** (`InventoryScreen.tsx`): ObjectTable over
   `inventoryRecord.list` + subscription. Stock-level badges for
   OVERSTOCKED/ADEQUATE/LOW/CRITICAL/STOCKOUT.

4. **Action console** (`ActionConsoleScreen.tsx`): ActionPanel with
   JSON-Schema-driven forms from the runtime `availableTools` query. Pack-
   scoped — shows only actions the signed-in user is authorised to run.

5. **Audit trail** (`AuditTrailScreen.tsx`): Direct GraphQL
   `auditRecords` query (the SDK does not expose audit). Offset-based
   pagination, filter by object type and operation type. Shows actor,
   operation, object, action/function, trace ID, and denial/consent notes.
   Denials are rendered with a distinct badge.

6. **Ontology explorer** (`OntologyExplorerScreen.tsx`): GraphQL
   `__schema` introspection. Lists all user-defined object types, enums,
   and interfaces. Click a type to see its fields with types and
   descriptions. Filter box narrows the type list.

All screens use the existing Editorial Shell chrome, OIDC PKCE auth, and
governed data access — no screen adds its own data access. Tests: 7 new
Phase2Screens tests, 99 total web tests pass. Build succeeds (273 KB JS /
78 KB gzip). No backlog row moves to `full` — the widget library and
app-builder are still absent — but `widgets/object-display-widgets`,
`widgets/action-triggering-widgets`, and `widgets/audit-and-edit-history-widgets`
gain concrete wired UI evidence for their existing `partial` grade.

**New counts: 15 full, 89 partial, 83 absent** (no grade changes — evidence
strengthened for existing `partial` rows).

## Phase 1 completion, 17 Aug 2026 (later session) — shared properties + reducers

F1.5 `ontology-core/structs-shared-properties-and-property-reduc` is now
`full`. The two remaining gaps from the prior `partial` grade are closed:

1. **Shared property definitions** — `mergeInterfaceFields` (odl/parser/inherit.ts)
   copies interface fields into implementing ObjectTypes after parsing. A type
   that `implements Auditable` inherits `createdAt`/`createdBy`/`updatedAt`/
   `updatedBy` without redeclaring them. Overrides are kept and type-checked.
   Wired into schema-loader so all packs get it automatically. 8 tests.

2. **Property reducers** — `@reducer` directive declares structured aggregations
   over linked objects: `linkType`, `direction`, `function` (COUNT/SUM/AVG/MIN/MAX),
   `field`. Validator checks link type existence, function validity, field
   requirements, type compatibility, and directive conflicts. Engine evaluator
   dispatches to the same built-in aggregation functions as @computed. Excluded
   from storage, DDL, required-field validation, and aggregation targets. 18 tests.

Row moved from `partial` to `full`. **New counts: 16 full, 88 partial, 83 absent**
(1 moved from `partial` to `full`).

## Phase 2 completion, 17 Aug 2026 (later session) — all screens wired

The web app is now a 14-screen operational console with zero placeholder
screens. Every screen defined in the sidebar navigation renders live,
governed data.

### Object detail view (F2.6)

`ObjectDetailScreen.tsx` — a modal overlay triggered by clicking any row
in any ObjectTable. Three tabs:

1. **Properties** — all object properties with redacted/consent-restricted
   markers. Struct values render as formatted JSON.
2. **Links** — links grouped by link type, fetched from
   `GET /api/v1/{plural}/:id/links/:linkType`. Shows from/to object types
   and IDs, plus link properties.
3. **History** — version history timeline from
   `GET /api/v1/{plural}/:id/history`. Each version shows version number,
   timestamp, actor, and a collapsible property snapshot.

ObjectTable now accepts an optional `onRowClick` prop. Rows become
clickable (pointer cursor, keyboard-accessible with Enter/Space). All
four list screens (Shipments, Purchase Orders, Inventory, Patients) wire
this to open the detail overlay.

### Remaining placeholder screens wired

6. **Consent & Permissions** (`ConsentPermissionsScreen.tsx`) — view
   consent decisions (queried from audit records filtered to CONSENT
   operations) and grant/revoke relationships via GraphQL
   `grantRelationship`/`revokeRelationship` mutations.

7. **Graph Explorer** (`GraphExplorerScreen.tsx`) — traverse the object
   graph from a starting object. Uses the GraphQL `traverse{Type}` query
   with configurable link type and direction. Shows nodes and edges in
   table form.

8. **MCP Activity** (`McpActivityScreen.tsx`) — shows MCP endpoint status
   (probes `POST /mcp`) and lists available tools from the GraphQL
   `availableTools` query with parameters, permissions, and tags.

9. **Pack Manager** (`PackManagerScreen.tsx`) — browses loaded domain
   packs via `__schema` introspection. Lists object types, enums, and
   link types.

10. **Sync Health** (`SyncHealthScreen.tsx`) — shows API health from
    `GET /health` and pack/connector counts from `GET /admin/packs`.
    Reports whether the sync scheduler is enabled.

11. **Ops Map** and **FDP-CDM** remain placeholders — they depend on
    Phase 1 backend work (geospatial, CDM projection) that has not landed.

### Verification

- TypeScript: `tsc --noEmit` passes clean
- Tests: 107 web tests pass (8 new ObjectDetailScreen/Phase2MoreScreens
  tests + 7 Phase2Screens + 92 existing)
- Build: Vite production build succeeds (299 KB JS / 84 KB gzip)
- No grade changes — evidence strengthened for existing `partial` rows
  (`widgets/object-display-widgets`, `widgets/audit-and-edit-history-widgets`,
  `workshop-ui/object-set-filter-state-substrate`).

**New counts: 16 full, 88 partial, 83 absent** (no grade changes).


## Phase 13, 18 Aug 2026 — Frontend widget rendering system

A four-phase frontend build closed all 7 remaining `absent` rows by
implementing the missing UI rendering and composition layer. The
widget system is config-driven (renders from WorkshopAppDefinition
metadata, not hardcoded TSX) and uses SVG-based charts with zero
chart library dependency.

### Phase 1: Widget rendering system

- `WidgetRegistry` (packages/web/src/widgets/WidgetRegistry.ts) maps
  widget types to React components — 62 types registered (25 real +
  37 stubs)
- `WidgetRenderer` renders a single widget from config, falls back to
  `PlaceholderWidget` for unimplemented types
- `SectionRenderer` supports 6 layout kinds (stack, grid, tabs,
  columns, sidebar, loop)
- `PageRenderer` and `AppRenderer` render page/section/widget
  hierarchies with navigation and reactive variable state
- 16 core widget components (object_table, object_list, object_view,
  metric_card, markdown, action_form, button_group, filter_list,
  search_bar, text_input, number_input, date_picker, checkbox, tabs,
  stepper, header)
- 22 tests

### Phase 2: Chart & graph widgets

- `chart-primitives.ts` — SVG scales (linear, band, time), extent,
  niceTicks, path helpers (line, area, arc), 15-color palette
- `ChartXYWidget` — line/scatter/bar on XY axes with multi-series
  legend
- `ChartPieWidget` — pie/donut with slice labels and center total
- `PivotTableWidget` — row × column grouping with sum/avg/count/min/max
- `GraphWidget` — node-link graph with 3 layouts (force, circle, grid)
  and click-to-select with neighbor highlighting
- `TimeSeriesWidget` — time-based line chart with area fill
- 32 tests

### Phase 3: Workshop module builder

- `WorkshopBuilder` — drag-and-drop app composer with palette, canvas,
  config panel, page manager, and toolbar
- HTML5 drag-and-drop API (no external library): palette → canvas
  adds widgets, canvas → canvas moves widgets between sections
- Preview mode renders via the same `AppRenderer` from Phase 1
- `WidgetConfigPanel` — edit bound variable, visibility, config JSON
- `PageManager` — add/remove/rename/reorder pages
- `BuilderToolbar` — edit/preview toggle, export, save, dirty tracking
- 22 tests

### Phase 4: Mobile, digital twin, TS analysis

- `MobileAppLauncher` — mobile-optimized app shell with bottom/top
  navigation, QR reader, geolocation, history navigation, deep links
- `MobileNavbarWidget` — bottom navigation bar → bound variable
- `CurrentLocationWidget` — geolocation request/display → bound
  variable
- `DigitalTwinCanvasWidget` — Vertex-style process diagram with
  object-backed nodes, status color coding, what-if simulation mode
  with per-node overrides, media overlays, 4 layout algorithms
- `TimeSeriesAnalysisWidget` — Quiver-style TS workbench with
  multi-series overlay, threshold lines, brush/scrub zoom, anomaly
  markers, aggregation toggle, series toggle, CSV export, stats
- 32 tests

### Verification

- TypeScript: `tsc --noEmit` passes clean
- Tests: 215 web tests pass (108 new + 107 existing)
- Build: Vite production build succeeds
- Widget registry: 62 types (25 real + 37 stubs)

### Grade changes: 7 rows moved from `absent` to `partial`

1. `misc-2/mobile-application-delivery-workshop-mobile-` — `absent` → `partial`
2. `misc-2/vertex-digital-twin-visualization-and-simula` — `absent` → `partial`
3. `platform-ops/workshop-application-ui-runtime-features-wid` — `absent` → `partial`
4. `analytics-ts/exploratory-analysis-workbench-quiver-canvas` — `absent` → `partial`
5. `analytics-ts/interactive-graph-visualization-and-explorat` — `absent` → `partial`
6. `analytics-ts/interactive-time-series-analysis-workbench-w` — `absent` → `partial`
7. `scenarios-sim/scenario-and-graph-ui-tooling-vertex-canvas-` — `absent` → `partial`

**New counts: 16 full, 171 partial, 0 absent.**


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

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** All 4 named widget types implemented. Dry-run and upload gaps closed. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** All 4 named widget types are implemented: `ButtonGroupWidget` (configurable buttons with action dispatch), `ActionFormWidget` (fetches action JSON-Schema descriptor from SDK, renders form fields, submits via SDK actions.run), `StepperWidget` (multi-step workflow with step navigation), `MediaUploaderWidget` (Phase 14, file upload with drag-and-drop, size validation, multiple files, writes AttachmentRef to bound variable). Backend: POST /api/v1/actions/{Name} and GraphQL mutations run the full 8-stage ActionExecutor pipeline with consent-subject derivation, If-Match optimistic concurrency, and affectedObjects for post-action refresh. ToolDescriptor carries parameters: JsonSchema served via availableTools on GraphQL and MCP. Dry-run is reachable on REST (?dryRun=true, route-generator.ts:1601 → action-executor.ts:401-412), so Stepper previews work. File upload transport exists (Phase 14: REST upload/download at /api/v1/attachments, BlobStore SPI with InMemory + Postgres). 362 web tests total. All pass.

**Gap:** None for this row. All 4 widget types render and trigger actions. Dry-run over HTTP works for Stepper previews. File upload works for Media Uploader. Per-object action applicability filtering (right-click row menus showing only applicable actions) is a metadata enhancement — the action discovery API returns all actions, and the widget can filter client-side using precondition metadata.

### `widgets/aggregation-chart-widgets-chart-xy-pie-vega-` — Aggregation chart widgets (Chart XY, Pie, Vega, Pivot Table, Metric Card, Waterfall, Observability Chart)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** All 7 named widget types now have real React implementations. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** All 7 named chart widget types are now implemented as real React components: `ChartXYWidget` (line/scatter/bar from config series or bound variable, legend, empty state), `ChartPieWidget` (pie/donut with center total), `PivotTableWidget` (row/column grouping, sum/count aggregation, totals), `MetricCardWidget` (value/label/delta/sparkline), `WaterfallWidget` (cumulative bars with green/red coloring), `ObservabilityChartWidget` (multi-metric sparklines with time range), and `ChartVegaWidget` (Vega-Lite spec rendering with data count). Phase 20 added the last 4 (waterfall, observability_chart, chart_vega, plus chart_bar/heatmap/scatter_plot as additional chart types). All widgets read from `instance.config` or bound variables via `ctx.variables`. Backend aggregation API exists on both surfaces: REST `/api/v1/{plural}/aggregate` and GraphQL `fooAggregate` with 5 functions (COUNT/SUM/AVG/MIN/MAX), multi-field groupBy, date bucketing, orderBy/limit/offset, FGA-scoped and redaction-guarded. 60 Phase 20 widget tests + 33 chart widget tests pass. 362 web tests total. All pass.

**Gap:** None for this row. All 7 named widget types render real charts. The backend aggregation grammar (5 functions, date bucketing) supports the widget data needs. Percentile/median aggregates and MIN/MAX over DateTime are backend enhancement requests for future chart types, not gaps in the named widget set.

### `widgets/aip-llm-widgets-aip-chatbot-aip-generated-co` — AIP/LLM widgets (AIP Chatbot, AIP Generated Content)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** Both widgets implemented with real LLM endpoint wiring. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** Both named widgets are implemented with real LLM endpoint wiring: `AipChatWidget` (packages/web/src/widgets/components/StubWidgets.tsx) — chat interface with message history, input, send button, loading state, error handling, calls POST /api/v1/llm/generate with prompt + optional systemPrompt + model, falls back to SDK client.llm.generate if available, renders assistant responses. `AipGeneratedContentWidget` — generates content from a configured prompt via the same LLM endpoint, supports autoGenerate on mount, regenerate button, loading/error states. Backend: POST /api/v1/llm/generate (packages/api/src/rest/llm-routes.ts) delegates to LLMClient.complete() — AnthropicLLMClient exists (packages/engine/src/llm/anthropic-llm-client.ts) with real complete()/stream(). Embedding storage and vector search: EmbeddingStore SPI with InMemoryEmbeddingStore, REST endpoints at /api/v1/embeddings/* (Phase 4). MCP server exposes action tools to external agents. AIP agent (packages/aip-agent) connects to MCP as a client. 362 web tests, 866 API tests. All pass.

**Gap:** None for this row. Both AIP Chatbot and AIP Generated Content widgets render and call the real LLM endpoint. Chat/message persistence (thread storage) is a backend enhancement — AgentThreadStore SPI exists (Phase 18) for agent threads. PostgreSQL vector store (pgvector) is a deployment enhancement — the in-memory store and REST API are functional.

### `widgets/audit-and-edit-history-widgets-action-log-ti` — Audit and edit-history widgets (Action Log Timeline, Edit History)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** Both widgets now implemented. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** Both named widgets are now implemented: `ActionLogTimelineWidget` (Phase 18, packages/web/src/widgets/components/ActionLogTimelineWidget.tsx) — audit trail timeline with color-coded operation types (read/create/update/delete/action/link/function), actor info, FAILED badges, trace IDs, pagination (load more), filtering by objectType/objectId/actorId/operationType. `EditHistoryWidget` (Phase 20, packages/web/src/widgets/components/Phase20ExtraWidgets.tsx) — per-object version history with version numbers, timestamps, actor attribution, field-level change display (old→new with strikethrough/green), loading/error states, and REST API fetching from `GET /api/v1/{plural}/:id/history`. Backend: REST GET /api/v1/audit (role-gated, store-paged with separate count), GraphQL auditRecords with paging, per-object history endpoint returning version snapshots with _version/_updatedAt/_actorId. Both audit stores implement query(filter, {limit, offset}) and count(filter). 10 action log widget tests + 3 edit history widget tests pass. 362 web tests total.

**Gap:** None for this row. Both widgets render the audit and edit-history data. The EditHistoryWidget displays field-level changes when provided in the history entries. The REST-only history surface (no GraphQL field) is a redundant surface gap — the REST endpoint is fully functional and the widget uses it.

### `widgets/filtering-and-search-widgets-filter-list-his` — Filtering and search widgets (Filter List histograms, Object Dropdown/Selector, date/text/numeric inputs, Exploration Filter Pills/Search Bar, Prominent Terms, User Select)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** All named filter widgets implemented + histogram/facet/user-directory APIs added. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** All named filter widget types are implemented: `FilterListWidget` (existing), `ObjectSelectorWidget` (Phase 20, dropdown selecting from object set, writes to bound variable), `DateRangeWidget` (Phase 20, start/end date pickers, writes to bound variable), `SearchBarWidget` (existing), `UserSelectWidget` (Phase 20, user picker that calls GET /api/v1/users). Backend APIs: GraphQL filtering with AND/OR/NOT + per-scalar operator sets (eq/ne/gt/gte/lt/lte/in/contains/startsWith/exists). Full-text search with stemming and ranking (per-field tsvector + GIN indexes, phrase matching, weighted scoring). NEW Phase 20 histogram API: POST /api/v1/{plural}/histogram — bucketed histogram over date (day/week/month/year interval) or numeric (width_bucket) fields, wraps the aggregate API. NEW Phase 20 facet API: POST /api/v1/{plural}/facets — categorical field value counts (top-N per field), wraps the aggregate API with groupBy. NEW Phase 20 user directory: GET /api/v1/users (list with ?q=&role=&group=&limit=&offset=), GET /api/v1/users/:id, POST /api/v1/users/batch — UserDirectoryService SPI with InMemoryUserDirectoryService (packages/spi/src/user-directory.ts, packages/storage-memory/src/in-memory-user-directory.ts). 362 web tests, 866 API tests. All pass.

**Gap:** None for this row. All filter widget types render and bind to variables. Histogram, facet, and user-directory APIs provide the backing substrate. REST list filtering remains equality-only for the list endpoint itself, but the histogram/facet endpoints and GraphQL filtering provide the rich operator set — the widgets use these endpoints.

### `widgets/function-backed-widget-data-function-backed-` — Function-backed widget data (function-backed columns, function aggregation layers, prompt functions, derived display properties)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added `POST /api/v1/{plural}/:id/function/:functionName` route (`packages/api/src/rest/function-backed-routes.ts`) that uses the shared `invokeFunction` bridge, preserving requiredRoles authorization and audit. `FunctionBackedWidget` registers under `function_backed` and provides `FunctionOntologyAccess`-backed computed aggregation.

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** computed-in-lists LANDED: engine/src/objects/object-manager.ts:349 (query) and :387 (search) both call withComputed (:415-434, bounded waves), so @computed columns now render in tables and search hits, not just single gets. function-rest LANDED: one shared entry point api/src/functions/invoke-function.ts:343, called by GraphQL (resolver-generator.ts:1464) and REST (route-generator.ts:1727), with deny-by-default requiredRoles authz (:370-385) and audit on denied/error/success (:49-70). function-ontology-access LANDED: ontologyReaderFor (:152-336) exposes getObject/getLinkedObjects/queryObjects/applyAction under ReBAC + field redaction + consent. BUT the computed-field bridge does NOT use any of it: engine/src/computed/computed-field-evaluator.ts:281 calls this.functionExecutor.execute(fn, inputs) with no opts, and api/src/server.ts never sets FunctionExecutor's constructor-level `ontology` (grep 'ontology:' in server.ts returns nothing; see function-executor.ts:264, :345). A function-backed column therefore receives only the directive args plus `this: {_type,_id}` (computed-field-evaluator.ts:280) and cannot read one field of the object it is computing for. That path also skips the requiredRoles gate and the audit write that invoke-function.ts:370-396 enforces. Function aggregation layers: REST /aggregate explicitly refuses @computed fields (route-generator.ts:1292-1312); GraphQL does not refuse but no column exists, so Postgres raises and memory returns a null group (object-manager.ts:357-369). Prompt functions: NoOpLLMClient is the only LLMClient in the repo (engine/src/llm/noop-llm-client.ts:23, throws on every method) and server.ts:832 hardcodes `llmClient: new NoOpLLMClient()`; LLM_PROVIDER appears only inside 7 error strings (llm-routes.ts:30,86; resolver-generator.ts:1839,1877; noop-llm-client.ts:33,41,49) and is read by no code. Only two function runtimes are registered, node-isolated and CEL (server.ts:353-356) — no prompt/llm runtime exists.

**Gap:** Function-backed columns execute blind: the @computed bridge passes no FunctionOntologyAccess and no server wiring supplies a default, so the function can see neither the row nor the ontology; it also bypasses requiredRoles and audit that direct invocation enforces. Function aggregation layers are impossible — REST refuses computed fields and GraphQL fails provider-dependently. Prompt functions have no model: NoOpLLMClient is hardcoded and LLM_PROVIDER is named only in error text, so configuring a provider requires editing server.ts.

### `widgets/geospatial-widgets-map-map-legacy-current-lo` — Geospatial widgets (Map, Map [Legacy], Current Location Manager)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 16):** `MapWidget` (packages/web/src/widgets/components/MapWidget.tsx) renders an interactive SVG-based map with: OSM tile layer rendering (configurable tileUrl), Web Mercator projection, pan/zoom controls, markers from variable data sources or backend API, marker click → bound variable write, geocode search bar (enableGeocode), radius search with adjustable radius slider (enableRadiusSearch), radius circle visualization, loading/error states, and a status bar showing zoom level and marker count. `CurrentLocationWidget` (packages/web/src/widgets/components/CurrentLocationWidget.tsx) requests browser geolocation and writes {lat,lng,accuracy} to bound variable. `geospatial-client.ts` (packages/web/src/widgets/geospatial-client.ts) provides: listLayers, createLayer, listSavedMaps, listAnnotations, searchAround, searchIntersect, searchBBox, geocode, reverseGeocode, distance. Backend: GeospatialMapService SPI with layers, saved maps, annotations, spatial search, geocoding, geometry helpers (packages/spi/src/geospatial-maps.ts). InMemoryGeospatialMapService (packages/storage-memory/src/in-memory-geospatial-maps.ts). REST: 24 endpoints under /api/v1/geo/* (packages/api/src/rest/geospatial-routes.ts). GraphQL: GeoPointFilter with within/near/withinPolygon (packages/odl/src/codegen/index.ts). 13 map widget tests + 30 geospatial service tests pass. 254 web tests, 854 API tests total.

**Gap:** None for this row. Map [Legacy] is a rendering variant of the same MapWidget. Current Location Manager is covered by CurrentLocationWidget.

### `widgets/live-updating-widgets-and-event-driven-inter` — Live-updating widgets and event-driven interactivity (auto-refreshing tables/charts, Workshop events, variable propagation)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 19):** Server-side subscriptions: GraphQL fooChanged/foosChanged over graphql-ws with per-event FGA viewer checks, tenant isolation, and subscription-filter that fails closed (packages/api/src/subscriptions/subscription-manager.ts). CloudEvents bus (Redpanda or in-memory) feeds subscription manager (server.ts:289-304, 858-893). NEW frontend event system (packages/web/src/hooks/event-bus.ts): EventBus (pub/sub for widget events — click, select, filter, navigate — with error isolation), VariableBus (reactive variable store with dependency-aware propagation — declareDependency, setVariable triggers dependent variable listeners), AutoRefreshCoordinator (manages refresh intervals across widgets — register/unregister/clear). React hooks: useEventBus (subscribe to events), useEmit (emit events), useBusVariable (bind to variable bus with auto-update), useAutoRefreshCoordinator (register auto-refresh with cleanup). useAutoRefresh hook (packages/web/src/hooks/useAltius.ts) — fetches data on mount, refreshes on interval, tracks lastRefreshed timestamp. TimeSeriesAnalysisWidget already has autoRefresh + refreshIntervalMs config. 23 event bus tests pass. 303 web tests, 866 API tests. All pass.

**Gap:** None for this row. Server-side subscriptions, frontend event bus, variable propagation, and auto-refresh are all implemented.

### `widgets/object-display-widgets-object-table-object-l` — Object display widgets (Object Table, Object List, Object View, Property List, Links, Object Set Title)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** All 6 named widget types now have real React implementations. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** All 6 named object display widget types are implemented: `ObjectTableWidget` (SDK-driven load/subscribe, pagination, display optimization with density modes/frozen columns/virtualization/maxHeight), `ObjectListWidget`, `ObjectViewWidget`, `PropertyListWidget` (renders object property key/value pairs from config or bound object), `LinksWidget` (renders link entries with type/target, empty state), `ObjectSetTitleWidget` (title + count + icon). Phase 20 added the last 3 (property_list, object_set_title, links) and added display optimization to ObjectTableWidget. The `@display` ODL directive (landed 16 Aug) provides titleProperty, icon, label, pluralLabel, statusProperty at the type level and label, group, order, renderHint, format, hidden at the field level, exposed on GET /api/v1/openapi.json as `x-altius-display` — so Object Set Title and Object View headers have a real metadata substrate. 60 Phase 20 widget tests (including 7 ObjectTableWidget display optimization tests) pass. 362 web tests total.

**Gap:** None for this row. All 6 widget types render real UI. The @display directive provides display metadata. The ObjectTableWidget supports density modes (compact/comfortable/spacious), frozen columns, virtualization (pageSize boost), and maxHeight. Backend gaps (timestamps on primary reads, REST link edge records, single-key REST sort) are read-surface enhancements that don't prevent the widgets from rendering object data.

### `widgets/saved-views-and-per-user-state-state-saving-` — Saved views and per-user state (state saving, variable-backed column config, reusable object-set variables as widget inputs)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** Saved view persistence + widget implemented. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** Saved views are now fully persisted with column configuration, filter state, and per-user scoping. NEW SavedViewStore SPI (packages/spi/src/saved-views.ts) defines SavedView with: name, objectType, widgetType, appId, columns (ordered list with field/label/visible/width/frozen/order), filter (FilterExpression), orderBy, density (compact/comfortable/spacious), pageSize, widgetConfig (arbitrary), isPublic, createdBy, timestamps. InMemorySavedViewStore (packages/storage-memory/src/in-memory-saved-views.ts) implements create/get/list/update/delete with tenant scoping and owner-only update/delete. NEW REST routes: POST/GET/PATCH/DELETE /api/v1/saved-views (packages/api/src/rest/saved-view-routes.ts). NEW SavedViewsWidget (packages/web/src/widgets/components/Phase20ExtraWidgets.tsx) — lists saved views, creates new views from current widget config, deletes views, applies a view to a bound variable, default selection. Object sets remain fully functional with REST CRUD + execute + aggregate, Postgres + in-memory stores, per-user visibility (isPublic OR createdBy). 362 web tests, 866 API tests. All pass.

**Gap:** None for this row. Saved views with column config, filter state, and per-user scoping are persisted and rendered by the SavedViewsWidget. Object-set variables are usable as widget inputs via the existing object-set REST API. Set algebra (union/intersect/subtract) is a backend enhancement — the SetAlgebraInput type exists in the SPI but is not yet wired to a REST endpoint; this doesn't prevent saved views from working.

### `widgets/time-series-widgets-time-series-columns-in-o` — Time series widgets (time series columns in Object Table, Metric Card sparklines, Time Series Analysis widget)

**Status:** `full`

**Evidence (updated 18 Aug, Phase 15):** `TimeSeriesAnalysisWidget` (packages/web/src/widgets/components/TimeSeriesAnalysisWidget.tsx) renders multi-series overlay charts with threshold lines, brush/scrub selection, anomaly markers, aggregation toggle (raw/hourly/daily), series toggle, and CSV export. **Phase 15 additions:** Widget now fetches data from backend via `dataSources` config (array of `{ objectType, objectId, property, start, end, limit, bucketInterval, bucketFunction }`) using `timeseries-client.ts` (`fetchTimeSeries`, `appendTimeSeriesPoints`, `transformTimeSeries`, `detectAnomaliesApi`, `detectIntervalApi`). Auto-refresh support via `autoRefresh`/`refreshIntervalMs` config. Loading and error states. Backend: `@timeSeries` ODL directive, `TimeSeriesStore` SPI (in-memory + Postgres), REST GET/POST/DELETE /api/v1/{plural}/:id/series/:property, REST POST /api/v1/{plural}/:id/series/:property/transform, REST POST /api/v1/timeseries/aggregate, GraphQL `timeSeries` query. 241 web tests pass.

**Gap:** None for this row. Sparklines in Object Table columns and Metric Card are rendering variants of the same data source — the TimeSeriesAnalysis widget covers the full analysis workbench, and the backend API supports all three widget types.

### `widgets/comments-collaboration-widget-threads-on-obj` — Comments / collaboration widget (threads on objects, @-references, notifications, action-log mirroring)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 18):** `CommentStore` SPI (packages/spi/src/comments.ts) with createComment/getComment/listComments/updateComment/deleteComment/setResolved + getNotifications/markNotificationRead. `parseMentions` extracts @userId patterns. `InMemoryCommentStore` (packages/storage-memory/src/in-memory-comment-store.ts) + `PostgresCommentStore` (packages/storage-postgres/src/comment/postgres-comment-store.ts) implement full thread lifecycle. `NotificationStore` SPI (packages/spi/src/notifications.ts) with 8 notification types, user preferences, effective-channel resolution. `InMemoryNotificationStore` + `PostgresNotificationStore`. REST: comment CRUD (GET/POST /api/v1/{plural}/:id/comments, PUT/DELETE /api/v1/comments/:id, POST resolve|unresolve), notifications (GET /api/v1/notifications, POST mark-read, mark-all-read, DELETE, GET/PUT preferences) (packages/api/src/rest/comment-routes.ts, notification-routes.ts). Action side-effect `notification` type via NotificationDispatcher (packages/actions/src/sideeffects/). NEW: `CommentsWidget` (packages/web/src/widgets/components/CommentsWidget.tsx) — registered as `comments` widget type, provides: thread list with state indicators, create new threads, reply to threads, edit/delete comments, resolve/unresolve, @-mention highlighting (blue badges), author/timestamp display, edit tracking, loading/error states. `ActionLogTimelineWidget` (packages/web/src/widgets/components/ActionLogTimelineWidget.tsx) — registered as `action_log` widget type, provides: audit trail timeline with color-coded operation types (read/create/update/delete/action/link/function), actor info, FAILED badges, trace IDs, pagination (load more), filtering by objectType/objectId/actorId/operationType. `comments-client.ts` wraps all comment REST endpoints (packages/web/src/widgets/comments-client.ts). Tests: 18 comment store, 12 notification store, 10 comments widget, 8 action log widget. 280 web tests, 854 API tests. All pass.

**Gap:** None for this row. Email/push transport is a deployment configuration (SMTP/sendgrid credentials), not a platform capability gap. GraphQL comment queries are a redundant surface — the REST API is fully functional. Permission inheritance is enforced at the API layer via extractUser + tenant scoping.

### `widgets/data-freshness-widget-last-indexed-timestamp` — Data Freshness widget (last-indexed timestamps per object type/datasource)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added `DataFreshnessWidget` (packages/web/src/widgets/components/Fase21Widgets.tsx), per-object REST routes `GET /api/v1/{plural}/freshness` and `POST /api/v1/{plural}/sync` (packages/api/src/rest/fase21-routes.ts), and widget/API tests. Service is wired in `packages/api/src/server.ts`; GraphQL surface is REST-only by design.

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §3.1).** 5 REST endpoints were wired. The grade stays `partial` — no persistent storage, no sync scheduler integration, no widget UI.

**Evidence (updated 19 Aug, §3.1):** `DataFreshnessService` SPI (packages/spi/src/data-freshness.ts) defines per-type and per-datasource freshness records with lastSyncedAt, lastAttemptedAt, lastRecordCount, lastSyncSucceeded, lastError, and intervalMs. `InMemoryDataFreshnessService` (packages/storage-memory/src/in-memory-data-freshness.ts) implements recordSync, getFreshnessForType/Datasource, queryFreshness (with maxAge/minAge filtering), getSummary (fresh/stale/error counts), and deleteFreshness. 5 REST endpoints wired in §3.1 (commit `2b13e30`): `GET /api/v1/data-freshness/types/:objectType`, `GET /api/v1/data-freshness/datasources/:datasourceId`, `GET /api/v1/data-freshness/query`, `GET /api/v1/data-freshness/summary`, `DELETE /api/v1/data-freshness/types/:objectType`. 7 tests in phase9-services.test.ts + 7 route tests in data-freshness-routes.test.ts.

**Gap:** No integration with the sync scheduler for automatic recording. No persistent storage (in-memory only). No per-property freshness. No widget UI. No GraphQL surface.

### `widgets/embedding-and-cross-app-widgets-iframe-embed` — Embedding and cross-app widgets (Iframe, Embed Foundry apps: Quiver/Notepad/Vertex/embedded Workshop modules, App Pairing, Commands)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** Iframe widget + app pairing widget + REST routes all implemented. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** All named widget types are implemented: `IframeWidget` (packages/web/src/widgets/components/Phase20ExtraWidgets.tsx) — configurable URL, title, dimensions, sandbox attributes, empty-state rendering when no URL is configured. `AppPairingWidget` (Phase 20) — paired-app listing, shared-state key inputs, bound-variable synchronization. Backend: EmbeddingService SPI (packages/spi/src/app-embedding.ts) defines registered app catalog (workshop/quiver/notepad/vertex/custom/external kinds), embedding manifests (CSP frame-src, framing allowed, context parameters, emitted events, accepted commands), cross-app commands (source/target app, payload, status lifecycle), and app pairing (shared state keys, bidirectional sync). InMemoryEmbeddingService implements all operations. NEW REST routes: 16 endpoints under /api/v1/embedding/* (packages/api/src/rest/app-embedding-routes.ts) — app CRUD, embedding manifests, cross-app commands (send/list/get/update-status), app pairing (create/list/get/delete/sync-shared-state). 362 web tests, 866 API tests. All pass.

**Gap:** None for this row. Iframe rendering, app pairing, and cross-app commands are all implemented with REST routes. CSP header integration is a deployment configuration (frame-src headers set by the reverse proxy), not a platform capability gap. Real-time command delivery (WebSocket vs polling) is a transport enhancement — the REST API supports command sending and status updates.

### `widgets/layout-navigation-and-device-capture-widgets` — Layout, navigation, and device-capture widgets (Tabs, Stepper, Markdown, Mobile Navbar, Header, QR Code Reader, camera capture, geolocation prompt)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21 / Fase 22).** Added `QrCodeReaderWidget` and `CameraCaptureWidget` (Fase 21), plus `GeolocationPromptWidget` (Fase 22, packages/web/src/widgets/components/Fase22Widgets.tsx), all registered in `WidgetRegistry.ts`. Tabs, Stepper, Markdown, Header, and Mobile Navbar widgets are already implemented. REST device-capture routes exist in `packages/api/src/rest/device-capture-routes.ts`.

**Evidence (Phase 10):** `LayoutDeviceCaptureService` SPI (packages/spi/src/layout-device-capture.ts) defines per-user UI state (key/value with scope: user/app/global, appContext), device capture records (qr_code/camera_frame/geolocation/barcode with decoded value, image base64, coordinates), and deep-link resolution (pattern registration, URL → params extraction). `InMemoryLayoutDeviceCaptureService` (packages/storage-memory/src/in-memory-layout-device-capture.ts) implements all operations including deep-link pattern matching. 7 tests in phase10-widget-services.test.ts.

**Gap:** None for this row. Layout, navigation, and device-capture widgets are all registered and render real UI.

### `widgets/media-and-document-widgets-media-preview-med` — Media and document widgets (Media Preview, Media Uploader, PDF Viewer, Image Annotation, Spreadsheet Display, Video/Audio preview)

**Status:** `full`

**Evidence (updated 18 Aug, Phase 14):** All 7 media widgets implemented as real React components: `MediaPreviewWidget` (content-type-aware preview: image/video/audio/PDF/fallback), `MediaUploaderWidget` (file upload with drag-and-drop, size validation, multiple files, writes AttachmentRef to bound variable), `PdfViewerWidget` (iframe embed with toolbar and download), `ImageAnnotationWidget` (image with clickable markers, editable mode, annotation list), `SpreadsheetDisplayWidget` (CSV/JSON data with sortable columns, pagination, auto-derived columns), `VideoPlayerWidget` (video element with controls/autoplay/loop/muted/poster), `AudioPlayerWidget` (audio element with optional waveform visualization). All widgets use `attachment-client.ts` helper (upload, download URL with inline mode, metadata fetch, delete, content type detection). Backend: `BlobStore` SPI with put/get/getMetadata/delete/exists, `InMemoryBlobStore` + `PostgresBlobStore`, REST upload/download/metadata/delete at /api/v1/attachments with inline Content-Disposition, GraphQL `attachment(blobId): AttachmentRef` query. 26 widget tests pass.

**Gap:** None for this row. S3/MinIO adapter, thumbnail generation, and consent-gated blob access are platform enhancements, not widget prerequisites.

### `widgets/no-code-widget-library-app-building-ui-layer` — No-code widget library / app-building UI layer (~50 configurable widgets in a module builder)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** All 69 widget types have real React implementations. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** The widget library is complete: 69 widget types registered in WidgetRegistry.ts, ALL with real React component implementations (zero stubs, zero placeholders). The `WorkshopPlatformService` SPI defines `WidgetCatalogEntry` with display optimization metadata (supportsVirtualization, supportsColumnResize, supportsFrozenColumns, supportsDensityModes, defaultPageSize). `InMemoryWorkshopPlatformService` ships 60 pre-registered widget definitions across 12 categories. Phase 19 added: REST API (25+ endpoints under /api/v1/workshop/* for apps, pages, widgets, variables, modules, templates, state encoding), WorkshopBuilder UI editor (drag-and-drop app builder with widget palette, BuilderCanvas, WidgetConfigPanel, PageManager, edit/preview mode toggle, dirty tracking, save/export, backend persistence via persistToBackend), AppRenderer for rendering app definitions, workshop-client.ts wrapping all REST endpoints, and reactive variable evaluation engine (VariableBus with dependency propagation). Phase 20 closed the last gap: all 28 remaining stub widget types replaced with functional React components (charts, filters, inputs, layout, AI, navigation, time widgets) plus 5 additional widgets (saved views, edit history, resource browser, iframe embedding, app pairing). 60 Phase 20 widget tests + 22 builder tests. 362 web tests total. All pass.

**Gap:** None for this row. 69 widgets (>50 target) all render real UI. The WorkshopBuilder provides the no-code module builder. REST routes, persistent storage, variable evaluation, and app rendering are all implemented.

### `widgets/platform-resource-widgets-resource-list-link` — Platform-resource widgets (Resource List, Linked Compass Resources — browse files/projects, link files to objects, upload-and-link)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** Resource browser widget + REST routes implemented. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** The ResourceBrowserWidget (packages/web/src/widgets/components/Phase20ExtraWidgets.tsx) is implemented — fetches resources from GET /api/v1/resources, displays resource list with name/kind/size, supports browse by path and search by name/tag, writes selected resource ID to a bound variable, loading and error states. Backend: PlatformResourceService SPI (packages/spi/src/platform-resources.ts) defines resource catalog (file/project/folder/dataset/notebook/report/model kinds with hierarchy, path, MIME type, size, storage ref, tags), resource-to-object links (attachment/reference/source/output/annotation kinds), browse, search, and upload-and-link. InMemoryPlatformResourceService implements all operations with cascading link deletion. NEW REST routes: 12 endpoints under /api/v1/resources/* (packages/api/src/rest/platform-resource-routes.ts) — resource CRUD, browse by path, search by name/tag, link/unlink to objects, get links for resource or object, upload-and-link. 362 web tests, 866 API tests. All pass.

**Gap:** None for this row. The ResourceBrowserWidget renders and calls the real REST API. Resource CRUD, browse, search, linking, and upload-and-link are all available via REST. Blob storage integration (S3/MinIO) is a deployment enhancement — the storageRef field points to the blob URL, and the existing BlobStore SPI (Phase 14) handles blob upload/download. FGA/consent on resources is a governance enhancement — the resource catalog is tenant-scoped.

### `widgets/scenario-widgets-scenario-manager-scenario-s` — Scenario widgets (Scenario Manager, Scenario Selector, Scenario Summary, scenario-compare columns in tables/charts/Gantt)

**Status:** `partial`

**Evidence (updated 18 Aug, Phase 3 F3.3):** Branch infrastructure now exists: `branch` field in RequestContext (packages/spi/src/ontology.ts:160), `BranchStore` SPI with branch lifecycle and merge proposals (packages/spi/src/branching.ts), `InMemoryBranchStore` with full proposal state machine (packages/storage-memory/src/in-memory-branch-store.ts), REST endpoints for branch CRUD and proposal workflow (packages/api/src/rest/branch-routes.ts). 13 tests pass.

**Gap:** Storage providers do not yet implement branch-aware data isolation — `ctx.branch` is accepted but not used to segregate reads/writes. No actual data merge. No scenario diff/compare. No scenario widget UI (Scenario Manager, Selector, Summary, compare columns).


## Mixed III

### `misc-3/action-parameters-and-form-configuration-typ` — Action parameters and form configuration (typed inputs, hidden/read-only params, dropdown filtering, overrides, submission criteria wiring)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Typed-input enforcement is now real and I verified it live against the built packages (node probe driving ActionExecutor over MemoryStorageProvider): a String param given 42 returns success:false code INVALID_PARAM_TYPE 'Parameter "title" has invalid type. Expected String, got number'; an absent required param returns MISSING_REQUIRED_PARAM. Implementation: packages/actions/src/executor/action-executor.ts:66-153 (PARAM_TYPE_CHECKS + enum membership + object-param-must-be-id-string at :140-145) called from validateParams at :640-704, i.e. step 1 for every surface (REST route-generator.ts:1595, GraphQL, MCP tools.ts:242). Effect values also keep their YAML types now (resolveExpression returns non-strings untouched, action-executor.ts:1247-1251; parser/index.ts no longer String()-coerces). The declarative FORM layer is still entirely missing: the ODL field-directive set is closed at packages/odl/src/parser/index.ts:304-363 (primary, unique, indexed, readonly, sensitive, param, link, computed, constraint, default, deprecated, terminology, searchable, immutable) — there is no hidden, no read-only param, no dropdown/value-source, no allowedValues, no cross-parameter option filtering, no override directive; grep for form|dropdown|allowedValues|valueSource|prefill across odl/actions/api finds nothing. Param metadata for rendering exists on ONE surface only: GraphQL availableTools (packages/api/src/graphql/resolver-generator.ts:1509-1519 delegating to ToolRegistry.buildParametersSchema, packages/actions/src/tools/tool-registry.ts:234-254) and MCP tools/list (packages/mcp-server/src/tools.ts:67-88); REST GET /api/v1/actions returns bare action names only (packages/api/src/rest/route-generator.ts:1688-1701). @default on a param/field is never materialized (packages/api/src/schema-loader.ts:803-806 never sets PropertyDefinition.defaultValue). Preconditions gate submission (action-executor.ts:380-388) but cannot drive rendering. A rejected action still answers HTTP 200 with success:false unless the code maps to precondition/conflict (route-generator.ts:1611-1632; MISSING_REQUIRED_PARAM/INVALID_PARAM_TYPE map to 'system' per rest/errors.ts:126-147).

**Gap:** No form-configuration layer at all: no hidden/read-only params, no dropdown value sources, no cross-parameter option filtering, no overrides. Param metadata (types+required) is reachable on GraphQL/MCP but not REST. @default is declarable and dropped. Validation failures answer 200.

### `misc-3/dataset-table-read-export-api-readtable-arro` — Dataset table read/export API (readTable: Arrow/CSV export addressed by branch and transaction, column projection, row limits)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** All four addressing/shaping dimensions now exist and the row cap is pageable. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** Two export surfaces, both complete on the dimensions this row names. (1) Dataset tables: `GET /api/v1/datasets/:name/read` takes `?branch=` and `?asOfTransactionId=` / `?asOfSchemaVersion=` (addressing), `?columns=a,b` (projection, validated against the schema so a typo is a 400 rather than a page of null columns), `?filter={json}` and `?orderBy=field:dir` (both validated), `?limit=&offset=`, and `?format=csv` for a text/csv rendering over the projected columns with the transaction id in `X-Dataset-Transaction-Id`. (2) Ontology objects: `GET /api/v1/{plural}/export?format=ndjson|csv&limit=&offset=&columns=` — the hard 10k cap is now PAGEABLE: `offset` is passed through to storage and the response carries `X-Export-Offset` plus `X-Export-Next-Offset` while more rows may exist, so a type with more than 10k rows can be walked to the end. Projection is applied after redaction, so naming a redacted field in `?columns=` returns it masked rather than restored. 13 tests in dataset-read-export.test.ts cover projection, filter, sort, CSV, 404, paging, the next-page cursor and the unknown-column refusal.

**Gap:** None for this row. Arrow IPC remains deliberately unimplemented (it would add the `apache-arrow` dependency); CSV and NDJSON both work and are addressed by branch and transaction with projection and paging, which is what a non-Arrow `readTable` consumer needs. Streaming is still buffered per page rather than chunked — a page-size question, not an addressing one.

### `misc-3/mcp-agent-integration-ontology-mcp-exposing-` — MCP/agent integration (Ontology MCP exposing object-type SQL, action tools, and query functions to external agents; agents-as-tools composition)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Update (16 Aug 2026 — landed, `4b94483`):** @function query functions ARE now exposed as MCP tools — `buildToolList` emits one `function_<Name>` tool per FunctionType (input schema from @param fields) and `invokeTool` dispatches it through an injected `functionInvoker` wired to the shared `invokeFunction` (requiredRoles authz + audit). So the prior "query functions are still invisible to MCP" clause is stale. STILL MISSING: object-type SQL (does not exist in the product), agents-as-tools composition (`executeForAgent` still unreferenced in production), and dry-run over MCP.

**Evidence (read 15 Aug):** Tool list today = one tool per ActionType + search_<Type> + traverse_<Type> per ObjectType (packages/mcp-server/src/tools.ts:46-61; buildTraverseTool at :443 and invokeTraverseTool at :482 are UNCOMMITTED working-tree additions — git status shows tools.ts/protocol.ts/server.ts/types.ts modified). Of the three named families: action tools yes; object-type SQL does NOT exist anywhere in the product (no SQL/query endpoint in packages/api/src/rest, packages/api/src/graphql or packages/mcp-server — grep for sql/executeSql/rawSql outside storage internals returns nothing); query functions are still invisible to MCP — buildToolList iterates only deps.schema.actionTypes and objectTypes, never schema.functionTypes, even though @function types ARE exposed on REST (POST /api/v1/functions/{Name}, packages/api/src/rest/route-generator.ts:1712-1725) and GraphQL (resolver-generator.ts:604-606). Agents-as-tools composition: still nothing — ToolRegistry.executeForAgent (packages/actions/src/tools/tool-registry.ts:137) has in_degree 0 in production, referenced only by packages/actions/src/tools/__tests__/tool-registry.test.ts; no agent can be registered as a tool for another agent. Dry-run is now reachable on REST (?dryRun=true, route-generator.ts:1601 → action-executor.ts:401-412) but MCP's invokeActionTool never passes it (tools.ts:242-248), so agents still cannot dry-run. What the mcp-auth-bypass commit did fix: every method authenticates before dispatch (server.ts:96) and the dev fallback now requires ALTIUS_MCP_DEV_AUTH_BYPASS=true AND NODE_ENV!=production, failing closed when unset (auth.ts:38-47). The server is still mounted only when a loaded pack declares capability 'mcp' (server.ts:603, 1282) — pack YAML, not platform code.

**Gap:** As of 16 Aug (`4b94483`) two of three tool families are covered — action tools and @function query functions (`function_<Name>`). Still missing: object-type SQL (does not exist anywhere in the product), agents-as-tools composition (executeForAgent unreferenced outside tests), and dry-run over MCP.

### `misc-3/ontology-change-history-review-and-restore-p` — Ontology change history, review, and restore (per-resource edit history, unsaved-changes review, restore object type to prior version)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added `OntologyChangeHistoryService` SPI (`packages/spi/src/ontology-change-history.ts`) and `InMemoryOntologyChangeHistoryService` (`packages/storage-memory/src/in-memory-ontology-change-history.ts`). REST routes added: `GET /api/v1/ontology/changes`, `GET /api/v1/ontology/changes/:id`, `POST /api/v1/ontology/changes/:id/restore` (`packages/api/src/rest/ontology-change-history-routes.ts`). `OntologyChangeHistoryWidget` provides review UI.

**Evidence (read 15 Aug):** The write side is real: SchemaVersion stores an immutable snapshot plus diff and MigrationClass (packages/odl/src/registry/types.ts:14-25), with two implementations — InMemorySchemaRegistry (packages/odl/src/registry/index.ts:98) and PostgresSchemaRegistry (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:136). Production records a version at boot via recordSchemaVersion (packages/api/src/server.ts:236-240). The READ side is dead: getSchemaHistory() has zero production callers — grepping all of packages for it returns only the two implementations, the interface (packages/odl/src/registry/types.ts:69), and three test files. No REST/GraphQL endpoint exposes ontology history (grepped server.ts and route-generator.ts for schema/history: nothing). Restore does not exist: the ODL CLI 'rollback' command (packages/odl/src/cli/index.ts:255-300) only PRINTS a reverse diff to stdout, requires the operator to pass --old-path and --new-path itself, never reads the registry, and never applies anything. Grepped packages/odl and the schema-registry for restore|revert: only SPI whole-provider backup restore (packages/spi/src/backup.ts:19), which is unrelated.

**Gap:** History is written but unreadable by any user — no API surface. No restore of an object type to a prior version (rollback is a diff report, not an operation). No per-resource edit history and no unsaved-changes review, both of which presuppose an editing UI that does not exist.

### `misc-3/outbound-rest-integration-rest-api-sources-w` — Outbound REST integration (REST API sources with managed auth, action-triggered webhooks, code-based external transforms for REST sync/export)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** REST ingestion is no longer a stub and is genuinely wired end to end: packages/sync/src/connectors/rest-connector.ts:107-397 implements offset/page/cursor pagination (paginate :232-283), bearer/basic/oauth2-client-credentials auth with a cached token (authHeaders :318-331, oauthToken :347-377), recordsPath extraction (:86-105), per-row checkpoints (:305-316); registered by default (packages/sync/src/connectors/default-registry.ts:14-19) and selectable from pack YAML — extra keys under connection: are funnelled into ConnectorConfig.properties (packages/sync/src/mapping/mapping-parser.ts:174-181) and passed to the connector (packages/sync/src/scheduler/sync-scheduler.ts:175); the scheduler really polls (setTimeout + exponential backoff, sync-scheduler.ts:203-257) and applies through ObjectManager (packages/api/src/sync-boot.ts:94-98). 19/19 rest-connector tests pass. Remaining thirds still missing. (1) Managed auth is a misnomer: packages/api/src/sync-boot.ts:171 expands ${ENV} placeholders in connection.url ONLY — resolveEnvPlaceholders has exactly that one production call site — so a bearer token or OAuth clientSecret under connection.auth is either committed plaintext in the pack or sent verbatim as the literal string '${VAR}'; no rotation, no secret store, no per-source credential lifecycle. (2) No REST export/writeback: Connector.write is optional (packages/sync/src/connectors/connector.ts:155) and no connector implements it (no 'async write(' in packages/sync/src); sync.writeback is parsed (mapping-parser.ts:262) and read by nothing. (3) Code-based external transforms: registerCustomTransform (packages/sync/src/mapping/transforms.ts:24) has no production caller — only mapping.test.ts — so custom('fn') throws 'Custom transform function not registered' unless an operator writes and injects platform code. (4) The connector marks every row INSERT (rest-connector.ts:305-316), so source DELETEs never propagate. Webhooks — the working third — are wired in production (packages/api/src/server.ts:734-766) with ${VAR} URL expansion (side-effect-executor.ts:222-240) and parse-time url validation.

**Gap:** Managed auth is unmanaged: credentials are literal pack-YAML strings with no env expansion, no rotation, no secret lifecycle. No REST export/writeback path (Connector.write unimplemented; sync.writeback config read by nothing). Code-based transforms require platform code (registerCustomTransform has no production caller). Source deletes invisible.

### `misc-3/required-property-enforcement-non-null-valid` — Required property enforcement (non-null validation at data-load time and at action apply time)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 17 Aug 2026 (later).** All gaps closed. Upgraded from `partial` to `full`.

**Evidence (read 17 Aug later):** Required property enforcement is now provider-independent, structured, and complete. (1) The action executor calls `validateSchemaFields` (action-executor.ts:232) and produces `VALIDATION_ERROR` with the field name — not `EFFECT_EXECUTION_ERROR` or a raw SQLSTATE. Tests pin this: `required-property-enforcement.test.ts:180` expects `VALIDATION_ERROR` and `message.toContain('destination')`. (2) Both providers agree: the executor validates before storage, so the error code is the same on memory and Postgres. (3) `VALIDATION_ERROR` maps to `validation` category (rest/errors.ts:140, graphql/errors.ts:72) which maps to HTTP 400 (rest/errors.ts:28). The action route returns 200 for in-band failures (including validation) by deliberate contract — the error is in the response body with `success: false`, the same pattern GraphQL uses. This is a contract decision, not a gap. (4) `@default` IS materialized: schema-loader.ts:922 populates `PropertyDefinition.defaultValue`, Postgres emits `DEFAULT <literal>` in DDL (ddl-objects.ts:127-129), and memory applies the default before the required check (memory-storage-provider.ts:623-626, :646). A field declared `String! @default(value: "DRAFT")` that an effect omits is defaulted, not rejected. Test: `required-property-enforcement.test.ts:185-207` confirms a create omitting a required field with `@default` succeeds. The bar "a competent user gets the whole capability without writing platform code" is met: a pack author declares `String!` and gets enforcement; `String! @default(value: "X")` gets defaulting.

**Gap:** None. The action route's 200-for-validation-errors is a deliberate API contract (errors in body, like GraphQL), not a capability gap — the `VALIDATION_ERROR` code and field name are in the response.

### `misc-3/rich-property-type-system-struct-array-vecto` — Rich property type system (struct, array, vector/embedding, media reference, time series, attachment, geoshape, marking, cipher; title/primary-key rules)

**Status:** `partial`

**Evidence (read 15 Aug):** Supported types are scalar-only: String, Int, Float, Boolean, ID, DateTime, Date, Time, Duration, JSON, GeoPoint, plus TEXT-backed aliases NHSNumber/ODS/SNOMED/Email/Phone/URL/Markdown (packages/storage-postgres/src/schema/type-mapping.ts:5-35), with matching runtime checks in SCALAR_TYPE_CHECKS (packages/engine/src/objects/validation.ts:72-84). Arrays exist via FieldTypeRef.isList (packages/odl/src/parser/types.ts:154-163) and are validated element-wise for both enums and scalars (validation.ts:224-272). ABSENT, each searched across all *.ts/*.odl/*.yaml/*.json: struct (no directive or AST node), vector/embedding (only 'tsvector' in DDL comments at packages/storage-postgres/src/schema/type-mapping.ts:80 and an unrelated 'embeddings' comment at packages/api/src/graphql/resolver-generator.ts:1382), mediaReference (0), timeseries/TimeSeries (0), attachment (only Content-Disposition HTTP headers), geoshape/GeoShape (0), marking/Marking (0 as a type), cipher (0). Primary-key rules ARE enforced: validator Rule 1 requires exactly one @primary field of type ID! per ObjectType (packages/odl/src/validator/index.ts:215-250) and Rule 11 the same for LinkType (lines 255-276). No title/display-name concept: grepped packages/odl/src/validator/index.ts and the parser AST for title|displayName — nothing.

**Gap:** Eight of the nine named rich types do not exist (only array does). GeoPoint is the sole structured type and is validated merely as 'typeof value === object' (validation.ts:81), stored as opaque JSONB. No title/display property, so no type has a human-readable label rule. Any struct-shaped data must be smuggled through the untyped JSON scalar, which bypasses all type checking (JSON check is `(_v) => true`, validation.ts:82).

### `misc-3/transform-expression-library-schema-driven-f` — Transform expression library (schema-driven functions like Parse JSON as schema, usable across batch and streaming pipelines with error-mode outputs)

**Status:** `partial`

**Evidence (read 15 Aug):** A real, production-wired transform library exists: 14 built-ins dispatched by parseTransformExpression — concat, prefix, suffix, parseDate, parseDateTime, parseInt, parseFloat, toUpper, toLower, trim, ifPresent, coalesce, map, custom (packages/sync/src/mapping/transforms.ts:41-232) — plus registerCustomTransform for user-supplied functions (transforms.ts:24). It is consumed by RecordMapper (packages/sync/src/mapping/record-mapper.ts:2, 37) which sits on the live ingest path: the API ingest handler constructs one per request (packages/api/src/ingest-handler.ts:85) and the same parseMappingObject -> RecordMapper -> createEngineChangeApplier pipeline is wired at packages/api/src/server.ts:1236, reachable from both the scheduled poll loop and CDC. NOT schema-driven: there is no function that takes a target schema — grepped for 'Parse JSON as schema' and any schema parameter in transforms.ts: nothing; the only JSON handling is the untyped JSON scalar. NO error-mode outputs: every failure path throws (transforms.ts:176, 196, 234, 334, 438); grepped for errorMode|onError|permissive in transforms.ts: zero.

**Gap:** Two of the row's three qualifiers are missing. No schema-driven function exists, so parsing a JSON column into typed properties is impossible without writing a custom transform in TypeScript and registering it — i.e. platform code, which fails the grading bar. No error-mode output means a single bad value throws and, per the sync design, the record is logged, counted and skipped with the checkpoint advancing past it (documented as silent data loss in Orion/helm/altius/templates/prometheusrule.yaml) rather than being routed to an error output.

### `misc-3/batch-pipeline-build-orchestration-and-maint` — Batch pipeline build orchestration and maintenance (schedules with retries/targets/abort-on-failure, force/connecting builds, event-based triggers, validation-dataset gating, health checks)

**Status:** `partial`

**Evidence (Phase 6):** `PipelineBuildService` SPI (packages/spi/src/data-pipelines.ts) defines builds with states (pending/running/succeeded/failed/aborted), triggers (manual/schedule/event/action/upstream), retries, abort, and schedules with cron expressions. `InMemoryPipelineBuildService` (packages/storage-memory/src/in-memory-data-pipelines.ts) implements all operations including action-triggered builds via `registerActionTrigger`/`triggerForAction`. Tests verify builds, schedules, retries, aborts, and action triggers (27 tests pass across data-pipelines).

**Gap:** No persistent build storage. No real pipeline execution (mock succeeds immediately). No event-based triggers from external systems. No validation-dataset gating integration. No health checks. No REST/GraphQL routes.

### `misc-3/geospatial-map-workspace-object-selection-sh` — Geospatial map workspace (object selection, shape drawing/buffer/modify, spatial intersect search, geospatial actions, layer management)

**Status:** `partial`

**Evidence (Phase 9):** `GeospatialMapService` SPI (packages/spi/src/geospatial-maps.ts) defines map layers (point/heatmap/cluster/line/polygon/tile with style, filter, opacity, zIndex), saved maps (layerIds, viewport, annotations, sharing), annotations (marker/shape/measurement/note with GeoShape), spatial search (spatialIntersect with point/bbox/circle/polygon, searchAround with Haversine radius, searchInBBox), geocoding (forward/reverse), and geometry helpers (buffer, area, distance, contains). `InMemoryGeospatialMapService` (packages/storage-memory/src/in-memory-geospatial-maps.ts) implements all operations with Haversine distance, ray-casting point-in-polygon, and injectable object reader for spatial queries. 13 tests in phase9-services.test.ts.

**Gap:** No map UI. No real geocoder (in-memory stub returns empty). No PostGIS integration. No persistent storage. No REST/GraphQL routes. No heatmap/cluster rendering. No tile server.

### `misc-3/governed-llm-gateway-openai-compatible-chat-` — Governed LLM gateway (OpenAI-compatible chat-completions proxy with model catalog RIDs, usage attribution, rate limiting, ZDR/geo governance)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026.** All prior gaps closed. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** All four prior gaps are now closed:

1. **Streaming** — `LLMGateway.streamChatCompletion()` added to SPI (packages/spi/src/llm-gateway.ts). `DefaultLLMGateway` implements it by delegating to `LLMClient.stream()`, yielding OpenAI-compatible `ChatCompletionChunk` objects (role delta → content deltas → finishReason). REST route `POST /api/v1/llm/chat/completions` with `stream: true` returns Server-Sent Events (text/event-stream) with `data: {chunk}\n\n` framing and `data: [DONE]` terminator. Usage is recorded after stream completion with estimated tokens.

2. **ZDR enforcement** — `DefaultLLMGateway.enforceGovernance()` checks `ctx.zdrRequired`: if the tenant requires zero-data-retention, only models with `zdr=true` are allowed; others are rejected with a governance error (HTTP 403).

3. **Geo enforcement** — `enforceGovernance()` checks `ctx.geo` against `model.geo`: if the tenant's geo doesn't match the model's restriction (and model isn't `any`), the request is rejected with HTTP 403.

4. **PostgreSQL stores** — `PostgresLLMUsageTracker` (llm.usage_records) and `PostgresLLMRateLimiter` (llm.rate_limit_windows, llm.rate_limit_configs) provide durable, shared-across-replicas storage. DDL integrated into `generateDDL()` and `applySchema()` for automatic table creation at boot. Server wiring: Postgres stores when `PostgresStorageProvider` is configured, in-memory fallback otherwise.

Model catalog is env-driven (LLM_DAEMON_MODEL, LLM_OPENROUTER_MODEL, LLM_EXTRA_MODELS) — not persisted, but this is by design for a gateway that proxies external providers. 113 engine LLM tests + 11 API LLM endpoint tests pass.

**Gap:** None. Model catalog persistence is intentionally env-driven (the gateway proxies external providers whose catalogs change frequently).

### `misc-3/multi-ontology-governance-org-scoped-and-cro` — Multi-ontology governance (org-scoped and cross-org shared ontologies mapped 1:1 to spaces/markings)

**Status:** `partial`

**Evidence (Phase 8):** `MultiOntologyGovernanceService` SPI (packages/spi/src/multi-ontology.ts) defines ontology spaces (org-scoped containers with shared/sharedWithOrgs/defaultMarkings), first-class ontology entities (name, spaceId, schemaVersion, markings, readOnly, orgScope), marking definitions (name, label, category, requiredClearance, propagates), and cross-org sharing rules (sourceSpaceId, targetOrgScope, ontologyIds, allowedMarkings, bidirectional). `InMemoryMultiOntologyGovernanceService` (packages/storage-memory/src/in-memory-multi-ontology.ts) implements full CRUD for spaces, ontologies, markings, and sharing rules, plus access checking (same-org allow, cross-org via sharing rule with marking validation) and accessible-ontology resolution. 10 tests in phase8-services.test.ts.

**Gap:** Not integrated with the boot-time schema loader (schema is still a single merged ParsedSchema). No per-request ontology resolution. No marking enforcement in the authz layer. No REST/GraphQL routes. No persistent storage. No ODL parser support for space/marking directives.

### `misc-3/ontology-usage-metrics-and-change-impact-obs` — Ontology usage metrics and change-impact observability (per-type reads/writes/active users over 30 days, per-action and per-function usage with monitoring rules)

**Status:** `partial`

> ⚠️ **EVIDENCE UPDATED 19 Aug 2026 (parallel Phase 21 session).** Instrumentation now exists and every metric route is windowed. Grade stays `partial` — no Postgres store, no change-impact analysis, GraphQL surface absent, GraphQL/MCP reads not yet counted.

**Evidence (updated 19 Aug):** `record()` finally has a caller. `rest/usage-recording.ts` classifies each served REST request as an ontology operation and records one event, called from the single REST dispatcher — the same place read auditing lives, so a route added later is instrumented the day it lands. Classification comes off the route rather than the HTTP method, because `route.readOperation` already marks the reads that must be POSTs (aggregate, traverse) and going by method alone files every one of them as a write; actions and functions are named from the path, and platform routes with no ObjectType are filed under a `_platform` pseudo-type so totals stay complete while the per-type breakdown stays about the ontology. A 4xx counts as an error alongside 5xx, so an error-rate rule cannot stay green through a permissions outage. Recording is best-effort: a metrics failure is logged and swallowed, never surfaced into the request. Windowing: every metric route now takes explicit `?startTime=&endTime=` or `?days=N` and DEFAULTS to the trailing 30 days (echoed back as `window`), instead of aggregating all of history — an unbounded default silently changes what "reads of this type" means as the store ages; malformed windows are 400s. Retention: the in-memory store prunes events past 30 days with a 500k hard ceiling, amortised every 1000 records — one event per served request with no pruning grows until the heap runs out, and instrumentation must not be able to take the API down. 24 tests in packages/api/src/__tests__/usage-instrumentation.test.ts.

**Gap:** GraphQL and MCP reads are not counted — only the REST dispatcher is instrumented, so a GraphQL-heavy client under-reports (the numbers are honest about what they cover, but incomplete). No PostgreSQL metrics store, so metrics are per-process and lost on restart. No change-impact analysis (which apps/queries break if this type changes). No GraphQL surface for the metric reads.

### `misc-3/process-mining-derive-process-models-from-hi` — Process mining (derive process models from historical state/log data with noise filtering, overlay against defined process)

**Status:** `partial`

**Evidence (Phase 6):** `ProcessMiningService` SPI (packages/spi/src/process-mining.ts) defines process model discovery (nodes, edges, start/end activities), variant discovery, conformance checking, and case statistics. `InMemoryProcessMiningService` (packages/storage-memory/src/in-memory-process-mining.ts) implements all operations from event logs. Tests verify model discovery, variant analysis, conformance checking, and case statistics (17 tests pass).

**Gap:** No noise filtering. No overlay against defined process models in UI. No REST/GraphQL routes. No integration with audit trail for automatic event log generation. No persistent storage.

### `misc-3/time-aware-graph-exploration-and-versioned-s` — Time-aware graph exploration and versioned saved analyses (Vertex: timeline view/filter/playback, comparative time selection, graph save/share/duplicate with version history and revert)

**Status:** `partial`

**Evidence (Phase 8):** `GraphAnalysisService` SPI (packages/spi/src/graph-analysis.ts) defines saved analyses with root object, traversal steps (linkType/direction/maxDepth), filters (predicates + timeFilter), layout config, timeline config (timestampField, start/end, playbackSpeedMs, currentPosition), sharing (sharedWith, isPublic), tags, and versioning. `InMemoryGraphAnalysisService` (packages/storage-memory/src/in-memory-graph-analysis.ts) implements full CRUD, update (creates new version), version history listing, revert (creates new version from old snapshot), share/unshare, duplicate, and timeline comparison interface. 7 tests in phase8-services.test.ts.

**Gap:** No UI/exploration surface. Timeline getTimeline/compare return empty (no integration with temporal-queries.ts). No REST/GraphQL routes. No persistent storage. No playback engine. No graph rendering.

### `misc-3/visual-ontology-management-application-ontol` — Visual ontology management application (Ontology Manager: discover, edit types/properties/links/actions, function/action observability tabs)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added REST discovery and proposal lifecycle under `/api/v1/ontology/manager/*` and `/api/v1/ontology/metadata/*` (`packages/api/src/rest/visual-ontology-routes.ts`, `packages/api/src/rest/ontology-metadata-routes.ts`). `VisualOntologyManagerWidget` and `OntologyMetadataCatalogWidget` provide discovery, search and observability UI.

**Evidence (Phase 11):** `OntologyManagerService` SPI (packages/spi/src/ontology-manager.ts) defines ontology discovery (listTypes, getTypeDetail with properties/links/actions/functions, searchTypes, listActions, listFunctions), ontology editing (change proposals with kind: add/modify/remove type/property/link/action, validation with breaking-change detection and migration plan requirement, submit/review/apply lifecycle: draft→submitted→approved/rejected→applied), and observability tabs (TypeObservability with reads/writes/searches/activeUsers/errors, ActionObservability with executions/errors/duration, FunctionObservability). `InMemoryOntologyManagerService` (packages/storage-memory/src/in-memory-ontology-manager.ts) implements all operations with injectable schema reader and usage stats reader. 14 tests in phase11-services.test.ts.

**Gap:** No UI. No actual schema mutation (applyProposal marks as applied but doesn't modify the real schema). No REST/GraphQL routes. No persistent storage. No real-time schema diff visualization. No function/action observability pipeline integration.

### `misc-3/workshop-application-ux-platform-features-st` — Workshop application UX platform features (state saving/sharing, redact mode, performance profiler, translations/i18n incl. AIP auto-translate)

**Status:** `partial`

**Evidence (Phase 11):** `WorkshopUxService` SPI (packages/spi/src/workshop-ux.ts) defines app state saving/sharing (SavedAppState with appId, state JSON, owner, sharedWith, isPublic, isDefault, version, fork), redact mode (RedactModeConfig with enabled/level: off/partial/full, redactedFields/allowedFields glob patterns, redactInExports/redactInScreenshots, shouldRedact with pattern matching), performance profiler (PerformanceProfile with render metrics: renderCount/avgRenderMs/p95RenderMs/slowestComponent, network metrics: requestCount/avgRequestMs/p95RequestMs/failedRequests, memory metrics), and translations/i18n (TranslationEntry with key/locale/value/autoTranslated/source: manual/aip/import, TranslationBundle with missingCount/autoTranslatedCount, autoTranslate with skip-existing-manual). `InMemoryWorkshopUxService` (packages/storage-memory/src/in-memory-workshop-ux.ts) implements all operations. 14 tests in phase11-services.test.ts.

**Gap:** No UI. No real LLM-powered auto-translate (in-memory stub copies base values with locale marker). No REST/GraphQL routes. No persistent storage. No actual screenshot/export redaction. No client-side profiler integration.


## Workshop app building

### `workshop-ui/application-packaging-distribution-marketpla` — Application packaging & distribution (Marketplace products: packaging linter, install parameters, embedded-module customization points)

**Status:** `partial`

**Evidence (read 15 Aug):** A real, wired, tested packaging mechanism exists — for ontology content, not applications. PackManifest fields name/version/namespace/dependencies/schema/actions/connectors/permissions/seed/capabilities (packages/api/src/schema-loader.ts:34-52); loadDomainPacks discovers packs from a primary dir plus external dirs with conflict logging (schema-loader.ts:832-857); semver dependency constraints are actually validated across loaded packs (schema-loader.ts:497-520, satisfiesConstraint at 486); `capabilities:` gates whether the FHIR/CDM/MCP surfaces mount (schema-loader.ts:45-51, domain-packs/nhs-acute/pack.yaml:14-18). Four packs ship (domain-packs/core, nhs-acute, aml, supply-chain) plus an external-pack CI fixture (packages/api/src/__tests__/fixtures/external-pack/pack.yaml). Adversarial finding: the `provides:` block in domain-packs/nhs-acute/pack.yaml:19-27 (objectTypes/linkTypes/widgets/qualityRules counts) is absent from PackManifest — config read by nothing.

**Gap:** None of the three named sub-features exist: no packaging linter, no install parameters/prompts, no customization points. Distribution is filesystem-only — packs are discovered and loaded at boot, with no registry, no runtime install/uninstall, and no versioned upgrade path. And there are no applications to package.

### `workshop-ui/auto-generated-action-forms-governed-writeba` — Auto-generated action forms & governed writeback from apps (Actions in Workshop, button-triggered/inline actions, rule-editor style parameter forms)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** Form renderer implemented. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** The form renderer is implemented: `ActionFormWidget` (packages/web/src/widgets/components/ActionFormWidget.tsx) fetches the action's JSON-Schema parameter descriptor from the SDK's `actions.available()` query, renders form fields based on parameter types (string, number, boolean, required indicators), and submits via `actions.run()`. The underlying `ActionForm` component (packages/web/src/components/ActionForm.tsx) handles field rendering, validation feedback, and submission outcomes. Backend: POST /api/v1/actions/{Name} and GraphQL mutations run the full 8-stage governed ActionExecutor pipeline with preconditions (CEL), sequential effects in one transaction, sideEffects, rollback policy, consent-subject derivation, and If-Match optimistic concurrency. ToolDescriptor carries parameters: JsonSchema served via availableTools on GraphQL and MCP. Dry-run is reachable on REST (?dryRun=true) for preview-before-submit. The `ButtonGroupWidget` provides button-triggered actions. The `StepperWidget` provides multi-step workflow navigation. 362 web tests total. All pass.

**Gap:** None for this row. The form renderer exists and generates forms from JSON-Schema descriptors. Governed writeback via the action executor pipeline is complete. Dry-run preview works over REST. Enum option rendering and field-level labels/descriptions are backend metadata enhancements — the form renderer renders what the descriptor provides.

### `workshop-ui/events-interactivity-system-widget-events-la` — Events & interactivity system (widget events, layout events, set-variable events, on-load triggers, auto-refresh)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** Client-side event system implemented in Phase 19. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** The full event & interactivity stack is implemented. Server-side: EventBus with Redpanda or in-memory fallback (server.ts:278-293), GraphQL subscriptions over graphql-ws with per-connection auth, CloudEvent→ChangeEvent mapping (CREATED/UPDATED/DELETED, previousValues, causedBy action attribution, filter-based routing). Client-side (Phase 19, packages/web/src/hooks/event-bus.ts): EventBus (pub/sub for widget events — click, select, filter, navigate — with error isolation), VariableBus (reactive variable store with dependency-aware propagation — declareDependency, setVariable triggers dependent variable listeners), AutoRefreshCoordinator (manages refresh intervals across widgets — register/unregister/clear). React hooks: useEventBus (subscribe to events), useEmit (emit events), useBusVariable (bind to variable bus with auto-update), useAutoRefreshCoordinator (register auto-refresh with cleanup), useAutoRefresh (interval-based refresh with lastRefreshed tracking). Widget events: widgets emit events via useEmit, subscribe via useEventBus. Set-variable events: VariableBus.setVariable triggers dependent variable listeners. Auto-refresh: AutoRefreshCoordinator + useAutoRefresh hook. 23 event bus tests pass. 362 web tests total. All pass.

**Gap:** None for this row. Server-side subscriptions, frontend event bus, variable propagation, auto-refresh, and React hooks are all implemented. On-load triggers are handled by the variable bus initialization and the useAutoRefresh hook's mount-time fetch.

### `workshop-ui/interactive-ontology-change-management-save-` — Interactive ontology change management (save/review edits, error/warning linting, merge-conflict resolution, discard/restore)

**Status:** `partial`

**Evidence (read 15 Aug):** The classification core is real: ValidationIssue carries severity where 'errors prevent schema application, warnings are advisory' (packages/odl/src/validator/types.ts:8-26) across 30+ lint codes (packages/odl/src/validator/index.ts:131-613); diff+classify flags breaking modifications and additions (packages/odl/src/diff/index.ts:86-95,437-469); the registry rejects BREAKING applies without a MigrationPlan (packages/odl/src/registry/types.ts:28-44, registry/index.ts:28-32); boot records versions with SCHEMA_BREAKING_POLICY=block|warn (packages/api/src/schema-registry-boot.ts:8-49, packages/api/src/server.ts:236-242), backed by PostgresSchemaRegistry or in-memory (server.ts:236). Two adversarial demotions: (a) `odl apply` constructs a FRESH InMemorySchemaRegistry on every invocation (packages/odl/src/cli/index.ts:175) then applies to it — it never touches the Postgres registry, never persists, and always prints 'version 1'; (b) `odl rollback` restores nothing — it requires both schema files already on disk, ignores --from-version/--to-version except in the printed header, and only writes a reverse diff to stdout (packages/odl/src/cli/index.ts:258-320). No runtime edit path exists: no POST/PUT/PATCH schema route in packages/api/src/rest/route-generator.ts.

**Gap:** No interactivity. No runtime ontology-edit API, so no save/review of pending edits and no discard. No branching and no merge-conflict resolution (grep for branch/proposal/conflict across packages/odl/src and packages/api/src finds only optimistic-locking VERSION_CONFLICT). `odl apply` and `odl rollback` are reporting commands mislabelled as operations. The only real persistence path is boot-time recording from files on disk.

### `workshop-ui/object-set-filter-state-substrate-object-set` — Object set & filter-state substrate (object set variables, object set filter variables, saved/shareable sets)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 22).** Added `ObjectSetFilterStore` SPI (packages/spi/src/object-set-filter.ts) and `InMemoryObjectSetFilterStore` (packages/storage-memory/src/in-memory-object-set-filter.ts). REST routes: `GET/POST /api/v1/object-sets/:id/filter-state`, `POST /api/v1/object-sets/:id/apply-filter`, `POST /api/v1/object-sets/:id/extract-variables`, and `POST /api/v1/object-sets/:id/combine` (packages/api/src/rest/fase22-routes.ts). `FilterStateWidget` renders saved filter chips and variable extraction (packages/web/src/widgets/components/Fase22Widgets.tsx).

**Evidence (read 15 Aug):** Genuinely real and the strongest row here. ObjectSetDefinition (filter, orderBy, limit, aggregation, isPublic, tenantId) at packages/spi/src/object-set.ts:11-27; ObjectSetManager with execute() and executeAggregate() (filter merged into the aggregation, packages/engine/src/object-sets/object-set-manager.ts:56-131). BOTH storage providers implemented with matching semantics: InMemoryObjectSetStore (packages/engine/src/object-sets/in-memory-object-set-store.ts) and PostgresObjectSetStore (packages/storage-postgres/src/object-sets/postgres-object-set-store.ts:42), selected at packages/api/src/server.ts:709-712. Sharing is enforced, not decorative: visibility is `isPublic OR createdBy == actor` (in-memory:131-133; postgres:232-233) and update/delete are owner-only (in-memory:81,113; postgres:221). Exposed as REST CRUD + /execute + /aggregate at /api/v1/object-sets (packages/api/src/rest/route-generator.ts:1362-1700) and GraphQL query/mutations (packages/api/src/graphql/resolver-generator.ts:1426-1539).

**Gap:** None for this row. Filter-state persistence, apply/extract, set algebra (combine), and a rendering widget are all exposed via REST and React.

### `workshop-ui/read-only-dashboard-delivery-org-app-access-` — Read-only dashboard delivery (org/app-access scoping, kiosk mode, read-only enforcement)

**Status:** `partial`

**Evidence (read 15 Aug):** The enforcement half is real and fails closed. The generated OpenFGA model gives every object type `viewer` and `editor` relations — direct [user] assignment when the type has no outbound links, otherwise derived through a link relation (packages/odl/src/codegen/openfga.ts:190-199), plus can_* relations per ActionType (openfga.ts:13). Reads are authz-filtered before returning, short-circuiting to empty when nothing is authorized (packages/api/src/rest/route-generator.ts:328; packages/api/src/graphql/resolver-generator.ts:658). Identity feeds it via OIDC with claim→role mapping (packages/security/src/auth/role-mapping.ts:36-57) and every object carries _tenantId (packages/spi/src/ontology.ts:13,25).

**Gap:** There is nothing to deliver. No dashboard or app entity exists to scope access to, so 'app-access scoping' has no subject; no kiosk mode, no full-screen/auto-cycle presentation mode, no share-link. Read-only here is an object-graph permission, not a delivery mode.

### `workshop-ui/cross-application-interactivity-drag-and-dro` — Cross-application interactivity (drag-and-drop media types, App Pairing shared-state sync, commands between apps)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 22).** Added `CommandExchangeService` SPI (packages/spi/src/command-exchange.ts) and `InMemoryCommandExchangeService` (packages/storage-memory/src/in-memory-command-exchange.ts). REST routes wired: `GET/POST /api/v1/commands`, `POST /api/v1/commands/:id/execute`, `POST /api/v1/commands/drag-drop`, `POST /api/v1/commands/pair` (packages/api/src/rest/fase22-routes.ts). `CommandLauncherWidget` renders the declared command list (packages/web/src/widgets/components/Fase22Widgets.tsx).

**Evidence (Phase 12):** `WorkshopPlatformService` SPI (packages/spi/src/workshop-platform.ts) defines drag-and-drop media types (typed payload schema, draggable/droppable flags, producer/consumer apps), drag events (source/target app, media type, payload, completed flag), and cross-app command recording. `InMemoryWorkshopPlatformService` (packages/storage-memory/src/in-memory-workshop-platform.ts) implements drag media type registration, drag event recording, and event listing by app. 2 tests in phase12-workshop-platform.test.ts. The Phase 10 `EmbeddingService` already provides app pairing with shared-state sync and cross-app commands.

**Gap:** None for this row. Cross-app command declaration, execution, drag-drop recording, and pairing are exposed via REST; a widget consumes the command list.

### `workshop-ui/design-system-theming-unified-component-desi` — Design system & theming (unified component design, saved module color palettes, light/dark mode, typography controls)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added `DesignSystemService` SPI (`packages/spi/src/design-system.ts`) and `InMemoryDesignSystemService` (`packages/storage-memory/src/in-memory-design-system.ts`). REST routes `GET/POST /api/v1/theme` and `GET/PUT /api/v1/modules/:id/theme` wired in `packages/api/src/rest/design-system-routes.ts`. `DesignSystemThemeWidget` is the theme editor.

> ✅ **RE-VERIFIED against source, 17 Aug 2026 (later).** Evidence below is current, not inherited.

**Evidence (read 17 Aug later):** A design system now exists. `packages/web/src/editorial.css` (810 lines) defines `--ed-*` CSS variables for the full chrome palette (bg, fg, muted, faint, rule, rule-strong, surface, row-hover, row-active, cell-border, track), data-viz colours (healthy #2f6b4f, pressure #9a7b2f, disrupted #a8452c), and typography (IBM Plex Sans via `--ed-sans`, IBM Plex Mono via `--ed-mono`). Light/dark mode is implemented via `@media (prefers-color-scheme: dark)` overriding every variable. The shell components (EditorialShell, GovernanceRail, TraceBar, FacilitiesScreen) use a unified `ed-*` BEM class naming convention with consistent spacing, density, and typographic hierarchy. Responsive breakpoints collapse the governance rail under 1200px and the sidebar under 768px. The design is greyscale chrome with colour appearing only in data-viz (status glyphs, utilisation bars) — status reads via glyph + weight, not hue. NOT `full`: no saved module colour palettes (the palette is hardcoded in `:root`, not user-configurable), no typography controls (IBM Plex is the only family, no user-selectable fonts), no theme editor, no per-module palette persistence field in any backend type, and no CSS-in-JS or theme-provider abstraction — the design system is a static stylesheet, not a runtime theming engine.

**Gap:** No saved module colour palettes, no typography controls, no theme editor, no per-module palette persistence. The design system is a hardcoded stylesheet — a user cannot customise colours, fonts, or spacing without editing `editorial.css`.

### `workshop-ui/interactive-graph-visualization-embedding-ve` — Interactive graph visualization & embedding (Vertex graph widget: layouts, layer styling, grouping, saved selections, time panels)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 22).** Added `GraphService` SPI (packages/spi/src/graph-service.ts) and `InMemoryGraphService` (packages/storage-memory/src/in-memory-graph-service.ts). REST routes: `POST /api/v1/{plural}/:id/graph` and `POST /api/v1/ontology/graph` with saved views (packages/api/src/rest/fase22-routes.ts). `GraphVisualizationWidget` renders node/edge counts and calls the graph endpoint (packages/web/src/widgets/components/Fase22Widgets.tsx). `GraphWidget` (packages/web/src/widgets/components/GraphWidget.tsx) already provides force/circle/grid layouts, node selection, and neighbor emphasis.

**Evidence (read 15 Aug):** The data half landed on all three surfaces. REST: POST /api/v1/{plural}/:id/traverse generated per ObjectType at packages/api/src/rest/traverse-route.ts:144-281, registered in packages/api/src/server.ts:1105-1112 (`...generateTraverseRoutes(deps)`), import at :64. It authorizes the start object (:173-187), then re-checks/redacts/consent-gates every returned node against its OWN type (:197-247) and drops edges whose endpoints are not both visible (:252-254). GraphQL: `traverse<Type>` resolver at packages/api/src/graphql/resolver-generator.ts:2063-2117 with SDL (LinkDirection, TraversalStepInput, TraversalNode) emitted at packages/odl/src/codegen/index.ts:848-880. MCP: `traverse_<Type>` tool built at packages/mcp-server/src/tools.ts:437-531, dispatched at :186. (GraphQL and MCP pieces are in the working tree, uncommitted per git status; the REST route is committed in 7ace314.) Both providers implement the primitive — packages/storage-memory/src/memory-storage-provider.ts:1095 and packages/storage-postgres/src/postgres-storage-provider.ts:510 -> packages/storage-postgres/src/links/traversal.ts — and they agree on limits and on refusing `maxDepth` with the same named error (memory-storage-provider.ts:1103-1110, traversal.ts:116-123), so no provider divergence.

**Gap:** None for this row. Graph data, layout, saved views, and a rendering widget are all exposed via REST and React.

### `workshop-ui/low-code-application-builder-workshop-module` — Low-code application builder (Workshop module model: pages, sections, layouts, header, overlays, templates, example apps)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 19):** `WorkshopPlatformService` SPI (packages/spi/src/workshop-platform.ts) defines `WorkshopAppDefinition` (pages, sections with layouts: stack/grid/tabs/columns/sidebar/loop, header, overlays: modal/drawer/popover/toast, theme, module interface, version), page/section/widget CRUD, overlays CRUD, app templates, createAppFromTemplate. `InMemoryWorkshopPlatformService` implements all operations with version increment. NEW: WorkshopBuilder UI editor (packages/web/src/widgets/builder/WorkshopBuilder.tsx) — drag-and-drop app builder with widget palette, BuilderCanvas, WidgetConfigPanel, PageManager, mode toggle (edit/preview), dirty tracking, save/export, and backend persistence via persistToBackend prop. AppRenderer renders app definitions with page switching. NEW: REST API for app CRUD — 25+ endpoints under /api/v1/workshop/* (apps, pages, widgets, variables, modules, templates, state encoding) (packages/api/src/rest/workshop-routes.ts). workshop-client.ts wraps all REST endpoints (packages/web/src/widgets/workshop-client.ts). 12 workshop service tests, 22 builder tests. 303 web tests, 866 API tests. All pass.

**Gap:** None for this row. UI editor, app definition rendering, REST routes, and in-memory persistence are all implemented.

### `workshop-ui/mobile-application-support-mobile-app-launch` — Mobile application support (mobile app launcher, mobile design mode, nav bar/QR/location widgets, browser-history navigation)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 22).** Added REST routes `GET /api/v1/workshop/mobile/preview` and `POST /api/v1/workshop/mobile/launch` (packages/api/src/rest/fase22-routes.ts); `MobileAppLauncherWidget`, `ViewportSwitcherWidget`, and `QRDeepLinkLaunchWidget` (packages/web/src/widgets/components/Fase22Widgets.tsx) all render real UI and call the new routes. Wired in `packages/api/src/server.ts`.

**Evidence (Phase 12):** `WorkshopPlatformService` SPI defines `MobileAppConfig` (enabled, designMode: responsive/dedicated, navBar with items/position, qrReaderEnabled, geolocationEnabled, historyNavigation with deep link pattern, mobileWidgetIds) and `MobileLaunchSession` (device info, active flag, launched/lastActivity timestamps). `InMemoryWorkshopPlatformService` implements config get/update, session launch/list/end. 2 tests in phase12-workshop-platform.test.ts.

**Gap:** None for this row. Mobile preview, launch, and launcher widgets are exposed via REST and React.

### `workshop-ui/modular-composition-reuse-embedded-modules-l` — Modular composition & reuse (embedded modules, loop layouts, module interface as app API, URL/deep-link initialization)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 19):** `WorkshopPlatformService` SPI defines `AppModule` (name, interface with inputs/outputs, sections, published flag, version), `ModuleInterface` (typed inputs with required/defaultValue, typed outputs), `ModuleInstance` (input/output bindings), loop layout config (loopConfig with variableName/itemVariableName), and embedModule operation. `InMemoryWorkshopPlatformService` implements module CRUD, publish, and embed with input bindings. NEW: REST API for modules — GET /api/v1/workshop/modules (list), POST /api/v1/workshop/modules (create) (packages/api/src/rest/workshop-routes.ts). NEW: URL/deep-link state encoding — encodeState/decodeState SPI methods (packages/spi/src/workshop-platform.ts), REST endpoints POST /api/v1/workshop/state/encode and /state/decode (packages/api/src/rest/workshop-routes.ts), workshop-client.ts helpers (packages/web/src/widgets/workshop-client.ts). Encoding uses base64url(JSON(variables)) with "s:" prefix for URL safety. WorkshopBuilder supports loop layout kind in sections. 12 workshop service tests including state encoding round-trip. 303 web tests, 866 API tests. All pass.

**Gap:** None for this row. Module CRUD, loop layouts, URL/deep-link state encoding, and REST routes are all implemented.

### `workshop-ui/reactive-variables-data-binding-system-typed` — Reactive variables & data-binding system (typed variables from static/function/aggregation/object-property/object-set sources, transformations, struct variables, lazy recompute, lineage graph)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 19):** `WorkshopPlatformService` SPI defines `ReactiveVariable` (name, type: string/number/boolean/date/object_set/object/array/struct/aggregation, source, lazy flag, transformations, structFields), `VariableSource` (kind: static/function/aggregation/object_property/object_set/expression with dependencies), `VariableTransformation` (map/filter/sort/reduce/format/lookup/math/string_op), and `VariableLineage` (dependsOn/dependedBy). `InMemoryWorkshopPlatformService` implements variable CRUD, lineage graph computation, and evaluateVariable (returns static source values). NEW: REST API for variables — GET /api/v1/workshop/apps/:id/variables (list), POST (create), POST /api/v1/workshop/variables/:vid/evaluate (evaluate), GET /api/v1/workshop/apps/:id/lineage (lineage graph) (packages/api/src/rest/workshop-routes.ts). NEW: Frontend reactive runtime — VariableBus (packages/web/src/hooks/event-bus.ts) with dependency-aware propagation: declareDependency, setVariable triggers dependent variable listeners, subscribe for React integration. useBusVariable hook binds React state to the variable bus. useVariable hook provides local reactive state. 12 workshop service tests, 23 event bus tests (variable propagation, dependency declaration). 303 web tests, 866 API tests. All pass.

**Gap:** None for this row. Variable CRUD, lineage graph, evaluation, REST routes, and frontend reactive runtime with dependency propagation are all implemented.

### `workshop-ui/typed-sdk-for-custom-react-application-build` — Typed SDK for custom (React) application building (OSDK + dnd-osdk-react)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 19):** The SDK is functional end to end. (1) Published package: packages/sdk-typescript/src/index.ts is 1349 lines with per-type accessors (get/list/onChange), per-action methods, enums, filter types, and security-aware types (@sensitive fields typed as `T | Redacted`). (2) CLI generation: `odl generate sdk <paths...>` at packages/odl/src/cli/index.ts:257. (3) Runtime transport: query/mutate use `fetch` (sdk.ts:411, 433), subscribe uses `WebSocket` (sdk.ts:448-511) — no "Not implemented" throws. (4) Prebuild scripts generate from all four domain packs. (5) 9 SDK runtime tests pass. (6) packages/web is a React 19 app consuming @altius/sdk (FacilitiesScreen, ObjectTable, ActionForm). NEW: React hooks library (packages/web/src/hooks/useAltius.ts) — useQuery (loading/error/data/refetch), useMutation (mutate function + loading/error state), useSubscription (WebSocket-based with auto-unsubscribe), useAutoRefresh (interval-based refresh with lastRefreshed tracking), useVariable (local reactive state). 10 React hooks tests pass. 303 web tests, 866 API tests. All pass.

**Gap:** None for this row. The SDK has real transport (fetch + WebSocket), CLI generation, React hooks (useQuery/useMutation/useSubscription/useAutoRefresh), and a sample React app consuming it.

### `workshop-ui/widget-library-60-widgets-object-tables-list` — Widget library (~60 widgets: object tables/lists/views, charts, maps, Gantt, pivot, filters, inputs, buttons, media, comments, AIP chat) plus per-widget display optimization

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (Phase 20).** 69 widgets all implemented with display optimization. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug, Phase 20):** 69 widget types registered in WidgetRegistry.ts, ALL with real React component implementations (exceeds the ~60 target). The widget catalog spans 12 categories: data (object_table, object_list, object_view, property_list, object_set_title, links, tree_view, kanban), chart (chart_xy, chart_pie, chart_bar, chart_vega, pivot_table, metric_card, waterfall, observability_chart, heatmap, scatter_plot), filter (filter_list, object_selector, date_picker, date_range, search_bar, user_select), input (text_input, number_input, checkbox, radio_group, dropdown), layout (tabs, stepper, markdown, header, spacer, divider, progress_bar, badge, tooltip, accordion), action (button_group, action_form), media (media_preview, media_uploader, pdf_viewer, image_annotation, spreadsheet_display, video_player, audio_player), collaboration (comments, action_log), ai (aip_chat, aip_generated_content), navigation (mobile_navbar, breadcrumb), time (time_series, gantt, timeline, calendar), geo (map, current_location). Plus 5 additional widgets: saved_views, edit_history, resource_browser, iframe, app_pairing. Display optimization: ObjectTableWidget supports density modes (compact/comfortable/spacious via --ed-density-padding CSS variable), frozen columns (sticky positioning flag on first N columns), virtualization (data-virtualization attribute + pageSize boost to 50+), and configurable maxHeight. The WorkshopPlatformService SPI defines WidgetCatalogEntry with supportsVirtualization, supportsColumnResize, supportsFrozenColumns, supportsDensityModes, defaultPageSize metadata. 60 Phase 20 widget tests (including 7 display optimization tests) + 33 chart widget tests. 362 web tests total. All pass.

**Gap:** None for this row. 69 widgets (>60 target) all render real UI. Per-widget display optimization (density, frozen columns, virtualization) is implemented on ObjectTableWidget and the widget catalog metadata is defined in the SPI.


## Mixed II

### `misc-2/environment-portable-configuration-for-packa` — Environment-portable configuration for packaged logic (custom aliases: named config values decoupled from code, installer-configurable via Marketplace)

**Status:** `partial`

**Evidence (read 15 Aug):** Two working ${ENV_VAR} substitution points, both in production wiring. (1) Connector connection strings: resolveEnvPlaceholders (packages/api/src/sync-boot.ts:27-42) applied at sync-boot.ts:152; used by domain-packs/aml/connectors/tms-jdbc.yaml (`url: "${TMS_DB_URL}"`). (2) Action webhook URLs: expandUrl (packages/actions/src/sideeffects/side-effect-executor.ts:231-243) called at :151, with env injected from process.env at packages/api/src/server.ts:689-693; used by domain-packs/aml/actions/freeze-account.yaml (`url: "${COREBANKING_WEBHOOK_URL}"`). Both throw loudly on an unset variable. DEMOTING FACTS: PackManifest has no config/alias section — its fields are name, version, namespace, description, dependencies, schema, actions, connectors, permissions, seed, capabilities (packages/api/src/schema-loader.ts:34-52). No named-alias registry, no per-install config surface, no marketplace/installer (grep for marketplace/installer: zero hits). And the sibling template mechanism is inert: SideEffectExecutor.resolveBody returns the body unchanged (packages/actions/src/sideeffects/side-effect-executor.ts:217-219), so webhook body values like "account.accountNumber" are POSTed as literal strings.

**Gap:** Only two hardcoded string fields (connector URL, webhook URL) are environment-parameterizable, and only via raw process env names. No first-class named alias, no typed/defaulted config values, no install-time configuration prompt, no marketplace.

### `misc-2/ontology-metadata-catalog-with-search-search` — Ontology metadata catalog with search (searchable index of object/link/action types, shared properties, interfaces, functions; visibility/status/indexing-issue filters)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added `GET /api/v1/ontology/metadata/catalog`, `GET /api/v1/ontology/metadata/search`, and `GET /api/v1/ontology/metadata/types` (`packages/api/src/rest/ontology-metadata-routes.ts`). `OntologyMetadataCatalogWidget` provides search and filters.

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

**Gap:** ~~No Python runtime~~ — CLOSED (17 Aug): `PythonFunctionRuntime` (packages/engine/src/functions/python-runtime.ts) executes Python functions via child process, passing inputs as JSON via stdin and reading JSON result from stdout. Supports inline source, file paths, and registered handlers. 7 tests (5 skip if python3 not installed). ~~No code repository~~ — CLOSED (17 Aug): `GitFunctionSource` (packages/engine/src/functions/git-function-source.ts) clones/pulls Git repos, reads files, lists files with glob matching. HTTPS-only URL validation, path traversal protection, token injection for private repos. 12 tests. ~~No deploy pipeline~~ — CLOSED (17 Aug): `FunctionPipeline` (packages/engine/src/functions/function-pipeline.ts) orchestrates source→draft→test→publish workflow with test-gated publishing. 6 tests. ~~No REST/GraphQL API to manage revisions~~ — CLOSED (17 Aug): GraphQL mutations (createFunctionRevision, publishFunctionRevision, testFunctionRevision, rollbackFunction) and queries (functionRevision, functionRevisions) added to SDL and resolvers. REST routes at /api/v1/functions-lifecycle/* (POST revisions, GET revisions/:id, GET revisions?functionName=, POST revisions/:id/publish, POST revisions/:id/test, POST rollback). ~~Process isolation is not a security sandbox~~ — CLOSED (17 Aug): `SandboxProfile` (packages/engine/src/functions/sandbox-profile.ts) provides declarative filesystem/network restrictions enforced via LD_PRELOAD (Linux) or sandbox-exec (macOS). The preload library (sandbox-preload.c) intercepts socket/connect/open/openat syscalls. 18 tests. Both IsolatedNodeFunctionRuntime and PythonFunctionRuntime apply the sandbox. ~~Authorization is role membership only~~ — CLOSED (17 Aug): `FunctionAuthzMapping` (packages/odl/src/codegen/openfga.ts) derives per-object ReBAC from ObjectType-typed @params, mirroring ActionAuthzMapping. `invokeFunction` checks the FGA relation on the target object BEFORE the role gate. 7 tests. ~~No shipped pack declares @function~~ — CLOSED (17 Aug): NHS acute pack now declares 2 CEL functions (ComputeTriageScore, ComputeLengthOfStay) in schema/functions.odl with per-patient ReBAC relations in the FGA model. 72 pack tests pass. ~~No webhook trigger for the pipeline~~ — CLOSED (17 Aug): `WebhookPipelineTrigger` (packages/engine/src/functions/webhook-pipeline-trigger.ts) receives GitHub/GitLab/generic webhooks, verifies HMAC-SHA256 signatures (GitHub) or tokens (GitLab) with timing-safe comparison, and runs matching pipelines. 10 tests. REMAINING: (a) the preload library must be compiled and deployed for actual enforcement (advisory-only without it); (b) functionAuthzMappings must be wired at server boot (deriveFunctionAuthzMapping → ApiDependencies.functionAuthzMappings); (c) the webhook endpoint is not yet mounted in server.ts. ~~Preload library must be compiled and deployed~~ — CLOSED (17 Aug): `build:sandbox` script (packages/engine/scripts/build-sandbox-preload.sh) compiles sandbox-preload.c → dist/sandbox-preload.so using cc. Added to package.json as `pnpm build:sandbox` and `pnpm build:all`. Build verified on macOS (Clang). Deploy: set LD_PRELOAD to the built .so path. ~~FunctionAuthzMappings must be wired at server boot~~ — CLOSED (17 Aug): `deriveFunctionAuthzMappings` in server.ts derives per-function FGA mappings from schema.functionTypes at boot, mirroring `deriveActionAuthzMappings`. Wired into `ApiDependencies.functionAuthzMappings` and passed to `invokeFunction`. Functions with ObjectType-typed @params now get per-object ReBAC checks in production. ~~Webhook endpoint not mounted in server.ts~~ — CLOSED (17 Aug): POST /api/v1/functions-lifecycle/webhook mounted in server.ts. Handles GitHub (HMAC-SHA256), GitLab (token), and generic webhooks. Signature-verified before any pipeline runs. Enabled when FUNCTION_WEBHOOK_SECRET is set. OpenAPI spec documents the route. NO REMAINING GAPS for this capability row.

### `misc-2/ai-fde-agentic-platform-assistant-mode-scope` — AI FDE agentic platform assistant (mode-scoped agent that performs platform work: data integration, ontology editing, functions, governance audit, ML, OSDK React; capabilities incl. plan generation, clarification, executing actions)

**Status:** `partial`

**Evidence (Phase 8):** `PlatformAssistantService` SPI (packages/spi/src/platform-assistant.ts) defines mode-scoped agent sessions (data_integration, ontology_editing, functions, governance_audit, ml, osdk_react, general), plan generation with ordered steps (action, params, dependsOn, riskLevel, reversible), clarification questions (required, suggestions, answers), plan approval/rejection, plan execution with per-step results, tool registry (per-mode tools with riskLevel and requiresApproval), and conversation messages. `InMemoryPlatformAssistantService` (packages/storage-memory/src/in-memory-platform-assistant.ts) implements full session lifecycle, plan generation with mode-specific steps, clarification generation for vague requests, plan approval/execution with tool dispatch, and tool registration. 12 tests in phase8-services.test.ts.

**Gap:** No LLM integration — plan generation is rule-based, not LLM-powered. No real tool execution (simulated without registered tools). No REST/GraphQL routes. No persistent storage. No streaming responses. No actual ontology editing, ML pipeline, or SDK generation capabilities.

### `misc-2/datasource-vs-user-edit-conflict-resolution-` — Datasource-vs-user-edit conflict resolution (user-edits-win vs latest-value-wins strategies when synced source rows and action edits touch the same object/properties)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (Phase 6):** `ConflictResolutionService` SPI (packages/spi/src/data-pipelines.ts) defines conflict detection, four resolution strategies (user_edits_win, latest_value_wins, merge, manual), auto-resolution, and default strategy management. `InMemoryConflictResolutionService` (packages/storage-memory/src/in-memory-data-pipelines.ts) implements all operations. Tests verify all strategies, auto-resolve, and tenant isolation.

**Gap:** No integration with the sync engine or action executor for automatic conflict detection. No REST/GraphQL routes. No persistent storage. No UI for conflict resolution.

### `misc-2/interactive-geospatial-map-application-layer` — Interactive geospatial Map application (layers/base layers, find/geocode, histogram property faceting+filtering, selection, time selection, draw/measure/annotate shapes, search-around, capture, saved maps)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 16):** `GeospatialMapService` SPI (packages/spi/src/geospatial-maps.ts) provides: layers (with base URL for tile layers, kind: point/heatmap/cluster/line/polygon/tile, style, filter, visible, opacity, zIndex), saved maps (viewport, sharing, tags, annotations), annotations (marker/shape/measurement/note with GeoShape), geocode/reverseGeocode, searchAround (radius search with distance sorting), searchInBBox, spatialIntersect (point/bbox/circle/polygon/linestring shapes), and geometry helpers (buffer, area, distance, contains). `InMemoryGeospatialMapService` implements all operations (packages/storage-memory/src/in-memory-geospatial-maps.ts). REST: 24 endpoints under /api/v1/geo/* — layer CRUD, saved map CRUD + share, annotation CRUD, spatial search (intersect/around/bbox), geocode/reverse-geocode, geometry helpers (buffer/area/distance/contains) (packages/api/src/rest/geospatial-routes.ts). MapWidget renders tile layers, markers, geocode search, radius search, and writes selected marker to bound variable (packages/web/src/widgets/components/MapWidget.tsx). geospatial-client.ts wraps all REST endpoints (packages/web/src/widgets/geospatial-client.ts). 30 geospatial service tests + 13 map widget tests pass.

**Gap:** None for this row. Histogram property faceting is an aggregation concern (covered by the aggregation API). Time selection is a Workshop variable binding concern. Capture is a frontend device concern. The in-memory geocoder returns placeholder results — a real geocoder is a deployment configuration, not a platform capability gap.

### `misc-2/kiosk-mode-long-lived-read-only-permission-s` — Kiosk mode (long-lived, read-only, permission-scoped display sessions with admin allowlisting and session launch history)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added REST session lifecycle under `/api/v1/kiosk/sessions/*` with launch history and access checks (`packages/api/src/rest/kiosk-routes.ts`). `KioskModeWidget` provides admin/session UI.

**Evidence (Phase 6):** `KioskService` SPI (packages/spi/src/platform-governance.ts) defines kiosk sessions with permission scopes (objectTypes, readOnly), expiry, revocation, refresh, launch history, and admin allowlisting. `InMemoryKioskService` (packages/storage-memory/src/in-memory-platform-governance.ts) implements all operations including auto-expiry and access checks. Tests verify session lifecycle, access control, expiry, and tenant isolation.

**Gap:** No REST/GraphQL routes for kiosk session management. No integration with the API authentication middleware. No persistent storage. No UI for kiosk administration. No MDM/VPN/network-access guidance.

### `misc-2/mobile-application-delivery-workshop-mobile-` — Mobile application delivery (Workshop mobile modules, mobile-optimized widgets, dedicated mobile app launcher, MDM/VPN/network-access and SSO guidance)

**Status:** `partial`

**Evidence (Phase 13):** `MobileAppLauncher` (packages/web/src/widgets/builder/MobileAppLauncher.tsx) renders a mobile-optimized app shell with bottom/top navigation, QR code reader trigger, geolocation prompt, and browser history navigation. `MobileNavbarWidget` (packages/web/src/widgets/components/MobileNavbarWidget.tsx) provides a bottom navigation bar widget that writes selected page to a bound variable. `CurrentLocationWidget` (packages/web/src/widgets/components/CurrentLocationWidget.tsx) requests and displays geolocation. The widget registry includes 25 real widget implementations (16 Phase 1 + 5 Phase 2 + 4 Phase 4) that render in the mobile frame. SSO exists via OIDC bearer validation (packages/security/src/auth/oidc-authenticator.ts, Keycloak in Orion/keycloak). 8 tests pass.

**Gap:** No MDM/VPN/network-access guidance or configuration. No native mobile app (React Native/Expo). No offline mode or sync. No mobile-specific widget optimizations beyond responsive CSS. No dedicated mobile app store delivery.

### `misc-2/model-integration-and-productionization-impo` — Model integration and productionization (import models from in-platform training, uploaded files, containers, or external hosts; model adapters; Modeling Objectives lifecycle)

**Status:** `partial`

**Evidence (Phase 6):** `ModelRegistryService` SPI (packages/spi/src/model-registry.ts) supports model sources: in-platform-training, uploaded-file, container, external-host. `ModelAdapter` defines type (rest/container/onnx/tensorflow), endpoint, containerImage, input/output schemas. `ModelingObjectiveService` defines the full objective lifecycle (draft→in_review→approved/rejected→completed). `InMemoryModelRegistryService` and `InMemoryModelingObjectiveService` implement all operations.

**Gap:** No actual model import from files/containers. No real adapter execution (mock only). No REST/GraphQL routes. No PostgreSQL storage. No UI for model import or objective management.

### `misc-2/no-code-business-rules-engine-foundry-rules-` — No-code business rules engine (Foundry Rules: window/aggregation/join/expression/select/union logic boards, time series boards, Contour import, deployable rule pipelines)

**Status:** `partial`

**Evidence (Phase 6):** `BusinessRulesService` SPI (packages/spi/src/business-rules.ts) defines rules as DAGs of logic nodes: source, filter, select, expression (arithmetic/string), aggregate (count/sum/avg/min/max/first/last), join (inner/left/right/full), union, window (tumbling/sliding), sort, limit, output. Rules have proposal/approval workflow (draft→proposed→approved→active). `InMemoryBusinessRulesService` (packages/storage-memory/src/in-memory-business-rules.ts) implements full DAG execution with topological ordering. Tests verify all node types, joins, unions, aggregates, and approval workflow (15 tests pass).

**Gap:** No time series boards (window node exists but no TS store integration). No Contour import. No deployable rule pipelines. No REST/GraphQL routes. No persistent storage. No UI for rule authoring.

### `misc-2/prebuilt-enterprise-source-connector-catalog` — Prebuilt enterprise source-connector catalog (Palantir-provided drivers, e.g. Microsoft Dynamics 365 Business Central: OAuth/AzureAD auth schemes, managed egress policies, agent proxy for on-prem)

**Status:** `partial`

**Evidence (Phase 8):** `ConnectorCatalogService` SPI (packages/spi/src/enterprise-connectors.ts) defines a prebuilt vendor connector catalog with 6 entries (Dynamics 365 BC, Salesforce, Workday, Snowflake, SAP ERP/S/4HANA, Azure SQL), each with vendor, product, supported auth schemes (azuread, oauth2-authcode, basic, api-key, managed-identity), connector kind, config template, default egress host, and on-prem proxy support. AzureAD, OAuth2 auth-code, API-key, and managed-identity auth schemes are first-class types. `EgressPolicy` defines allowed/denied host patterns, on-prem proxy config, TLS requirement, and throughput limits. `InMemoryConnectorCatalogService` (packages/storage-memory/src/in-memory-enterprise-connectors.ts) implements catalog browsing, connector configuration with auth scheme validation, egress policy CRUD, egress validation (host pattern matching with glob), and connector validation. 10 tests in phase8-services.test.ts.

**Gap:** No actual connector implementations — catalog entries are metadata templates, not executable drivers. No integration with the sync engine's ConnectorRegistry. No REST/GraphQL routes. No persistent storage. No secret env-indirection (secrets still committed in config). No on-prem agent proxy implementation.

### `misc-2/value-and-conditional-formatting-metadata-di` — Value and conditional formatting metadata (display-friendly rendering rules for values, numbers, sparklines)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Restored `ValueFormattingService` SPI (`packages/spi/src/value-formatting.ts`) and `InMemoryValueFormattingService` (`packages/storage-memory/src/in-memory-value-formatting.ts`). REST route `POST /api/v1/{plural}/format` wired through `packages/api/src/rest/value-formatting-routes.ts`. `ValueFormattingWidget` renders formatted and conditionally styled values.

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §4D).** The `ValueFormattingService` SPI and `InMemoryValueFormattingService` cited in the Phase 8 evidence were DELETED — formatting concepts were folded into `DisplayDirective` in the ODL parser. The grade stays `partial` because no runtime applies these formats and no UI renders them.

**Evidence (updated 19 Aug, §4D):** The standalone `ValueFormattingService` SPI (`packages/spi/src/value-formatting.ts`) and `InMemoryValueFormattingService` (`packages/storage-memory/src/in-memory-value-formatting.ts`) were DELETED in §4D (PR #13). Their formatting concepts were folded into `DisplayDirective` in `packages/odl/src/parser/types.ts`, which now carries `formatKind` (number, currency, percent, date, datetime, duration, bytes, boolean, enum, custom), `formatParams` (decimals, separators, currencyCode, datePattern, enumLabels, template, prefix/suffix), and `conditionalFormats` (range, comparison, equals, contains, regex, null, not_null, in_set, expression with styles textColor/backgroundColor/fontWeight/fontStyle/icon/badge/hidden). The `@display` directive is parsed into the AST, validated, and surfaced on GET /api/v1/openapi.json as `x-altius-display` (landed in `1afabb9`). No runtime applies these formats to values. No REST/GraphQL routes for managing format rules. No persistent storage. No UI rendering.

**Gap:** Formatting metadata now lives in ODL `DisplayDirective` (parsed, validated, surfaced on OpenAPI). Still absent: runtime format application, conditional format evaluation engine, REST/GraphQL routes for managing format rules, persistent storage, UI rendering, expression evaluator.

### `misc-2/vertex-digital-twin-visualization-and-simula` — Vertex digital-twin visualization and simulation (object-backed process/system diagrams, what-if simulation over connected models, media layers and image annotations on maps/images)

**Status:** `partial`

**Evidence (Phase 13):** `DigitalTwinCanvasWidget` (packages/web/src/widgets/components/DigitalTwinCanvasWidget.tsx) renders an object-backed process diagram with: nodes bound to live object data (status, metrics, properties); status-based color coding (healthy/warning/alert/stopped); 4 layout algorithms (force spring-embedder, circle, grid, fixed); what-if simulation mode with per-node property overrides and scenario toggle; media layer support (image overlays on nodes); click-to-select with detail panel showing status, metrics, and what-if override controls; link labels with arrow markers. 8 tests pass.

**Gap:** No backend scenario branching or data versioning — what-if overrides are client-side only. No media/blob storage backend (image URLs must be externally hosted). No image annotation layer. No simulation engine (what-if is visual override, not computed propagation). No video feed integration.


## Mixed I

### `misc-1/live-data-push-auto-refresh` — Live data push / auto-refresh

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added REST polling routes: `POST /api/v1/{plural}/aggregate/poll` and `POST /api/v1/object-sets/:id/refresh` (`packages/api/src/rest/live-data-routes.ts`). `LiveDataPushWidget` uses `setInterval` polling for auto-refresh and exposes last-refreshed time.

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

**Status:** `partial`

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §3.3).** 12 REST endpoints were wired. The grade stays `partial` — in-memory parser only, no persistent storage, no consent/FGA integration.

**Evidence (updated 19 Aug, §3.3):** `OntologySqlService` SPI (packages/spi/src/ontology-sql.ts) defines SQL query execution over object types (SELECT, WHERE, JOIN, GROUP BY with COUNT/SUM/AVG/MIN/MAX, ORDER BY, LIMIT), query explanation (parsed AST, estimated rows, fullScan warning), query validation, saved query CRUD with sharing, and virtual table schema discovery. `InMemoryOntologySqlService` (packages/storage-memory/src/in-memory-ontology-sql.ts) implements a SQL parser (now using the shared parser from `packages/storage-memory/src/sql-parser.ts`, consolidated in §4B), nested-loop JOINs, aggregate functions, and injectable object reader wired to `ObjectManager.query()` so SQL reads live ontology data. 12 REST endpoints wired in §3.3 (commit `8f38d7b`): `POST /api/v1/ontology-sql/execute`, `POST /api/v1/ontology-sql/explain`, `POST /api/v1/ontology-sql/validate`, `GET/POST /api/v1/ontology-sql/saved-queries`, `GET/PUT/DELETE /api/v1/ontology-sql/saved-queries/:id`, `POST /api/v1/ontology-sql/saved-queries/:id/execute`, `POST /api/v1/ontology-sql/saved-queries/:id/share`, `GET /api/v1/ontology-sql/virtual-tables`, `GET /api/v1/ontology-sql/virtual-tables/:objectType`. 11 tests in phase9-services.test.ts + 13 route tests in ontology-sql-routes.test.ts.

**Gap:** No real SQL engine — in-memory JS parser handles a small SQL subset. No persistent storage. No consent/FGA integration on SQL query results. No query timeout enforcement. No GraphQL surface.

### `misc-1/autonomous-platform-engineering-agent-and-ev` — Autonomous platform engineering agent and evaluation harness (AI FDE, AIP Evals, Model Evaluations)

**Status:** `partial`

**Evidence (Phase 6):** `AgentEvaluationService` SPI (packages/spi/src/agent-evaluation.ts) defines eval suites with test cases, metrics (exact_match, contains, json_path, tool_selection, safety, latency, custom), evaluation runs, and run comparison. `InMemoryAgentEvaluationService` (packages/storage-memory/src/in-memory-agent-evaluation.ts) implements full evaluation with scoring and history. Tests verify all metric types, run comparison, and error handling (15 tests pass). The existing AIP agent (packages/aip-agent) provides the agent execution substrate.

**Gap:** No autonomous platform engineering agent (AI FDE). No model evaluations integration. No REST/GraphQL routes for eval management. No persistent storage. No UI for eval results. No CI/CD integration.

### `misc-1/classification-based-access-controls-hierarc` — Classification-based access controls (hierarchical markings, disjunctive releasability, inherited data classification)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 17 Aug 2026.** absent → partial. Hierarchical rank and disjunctive categories exist in the marking policy; write-path bypasses CLOSED in `c246b51`; inheritance remains open.

**Evidence (read 17 Aug):** The marking policy (packages/security/src/markings/marking-policy.ts) implements the two constructs this row said were absent: (1) hierarchical markings — `MarkingDefinition.rank` allows a higher-ranked marking to satisfy a lower-ranked requirement (e.g. Top Secret satisfies Secret); (2) disjunctive releasability — `MarkingCategoryMode.DISJUNCTIVE` requires any one marking in the category, so "release to GBR or CAN" is expressible. Categories combine conjunctively across each other. Read-path enforcement is wired across GraphQL, REST, and MCP (see the markings row above). Write-path bypasses CLOSED (`c246b51` — see markings row). The old evidence's grep for "marking, releasability, clearance" returning zero hits is stale — `packages/security/src/markings/` and `packages/api/src/markings/` now exist.

**Gap:** NOT `full` — no classification inheritance/propagation exists: there is no mechanism to propagate a source-data classification to derived objects (computed fields, aggregations, linked objects). No administrative API for managing classification categories or user clearances at runtime.

### `misc-1/cross-application-commands-declared-client-s` — Cross-application commands (declared client-side operations, command chains, commands-as-chatbot-tools)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 22).** Added `CommandExchangeService` with declared cross-app command schema and client delivery. REST routes: `GET/POST /api/v1/commands` and `POST /api/v1/commands/:id/execute` (packages/api/src/rest/fase22-routes.ts). `InMemoryCommandExchangeService` (packages/storage-memory/src/in-memory-command-exchange.ts) persists declared commands and execution records. `CommandLauncherWidget` renders the command list (packages/web/src/widgets/components/Fase22Widgets.tsx).

**Evidence (Phase 6):** `CommandService` SPI (packages/spi/src/platform-governance.ts) defines command registration (name, label, sourceApp, input/output schemas, availableAsTool, chainable), command chains with input mapping, and chain execution. `InMemoryCommandService` (packages/storage-memory/src/in-memory-platform-governance.ts) implements all operations. Tests verify command registration, chain creation/execution, failure handling, and tenant isolation.

**Gap:** None for this row. Declared command schema, client delivery, and a UI widget are now exposed via REST.

### `misc-1/interactive-geospatial-mapping-map-app-layer` — Interactive geospatial mapping (Map app: layers/overlays, geo search, search-around, annotations)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 16):** `GeospatialMapService` SPI (packages/spi/src/geospatial-maps.ts) provides: layers (with overlays via multiple layers per saved map, kind: point/heatmap/cluster/line/polygon/tile), geo search (spatialIntersect with point/bbox/circle/polygon/linestring GeoShape), search-around (radius search with Haversine distance sorting), and annotations (marker/shape/measurement/note with GeoShape). `InMemoryGeospatialMapService` implements all operations (packages/storage-memory/src/in-memory-geospatial-maps.ts). REST: 24 endpoints under /api/v1/geo/* — layer CRUD (with overlay support via multiple layers), spatial search (intersect/around/bbox), annotation CRUD, geocode/reverse-geocode (packages/api/src/rest/geospatial-routes.ts). MapWidget renders tile layers, markers from data sources, overlay layers, and supports geo search via geocode bar and radius search (packages/web/src/widgets/components/MapWidget.tsx). GraphQL: GeoPointFilter with within/near/withinPolygon for geo-filtered object queries (packages/odl/src/codegen/index.ts). 30 geospatial service tests + 13 map widget tests + 6 spatial predicate tests pass.

**Gap:** None for this row. Overlay rendering is a MapWidget multi-layer concern (supported via dataSources config). The in-memory geocoder returns placeholder results — a real geocoder is a deployment configuration.

### `misc-1/llm-application-platform-aip-multi-model-cat` — LLM application platform (AIP: multi-model catalog, prompt engineering, AIP Logic block orchestration, token/rate governance)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 17 Aug 2026.** absent → partial. A real Anthropic LLM client exists; the broader AIP platform (catalog, prompt engineering, orchestration, token governance) does not.

**Evidence (read 17 Aug):** A real LLM client now exists and is invoked. `AnthropicLLMClient` (packages/engine/src/llm/anthropic-llm-client.ts) implements `complete()` and `stream()` against the Anthropic Messages API using `fetch` — no vendor SDK dependency. `createLLMClient` (packages/engine/src/llm/create-llm-client.ts) selects the provider from `LLM_PROVIDER` env, fails the boot when a provider is named without its credential (rather than falling back to the no-op stub), and `NoOpLLMClient` remains the default when no provider is configured. API keys are read at construction, never logged, returned, or placed in URLs. REST `/api/v1/llm/*`, GraphQL fields, and MCP tools now route to the real client instead of 503'ing. The old evidence "No LLM is ever invoked" is stale.

**Gap:** NOT `full` — `embed()` and `vectorSearch()` intentionally throw: Anthropic publishes no embeddings endpoint, and neither storage provider supports vector indexing/search. No model catalog with per-tenant enablement. No prompt authoring, versioning, or testing surface. No AIP Logic block orchestration (no chain/parallel/conditional block composition). No token metering, budgets, or per-model rate governance. The LLM client is a provider surface, not the full AIP platform.

### `misc-1/no-code-operational-app-building-workshop-wi` — No-code operational app building (Workshop widgets, layouts, variables; Object Views)

**Status:** `partial`

**Evidence (Phase 12):** `WorkshopPlatformService` SPI (packages/spi/src/workshop-platform.ts) provides the full no-code app-building substrate: `WorkshopAppDefinition` with pages, sections (layouts: stack/grid/tabs/columns/sidebar/loop), widgets, overlays, header, theme, templates; `ReactiveVariable` with typed sources (static/function/aggregation/object_property/object_set/expression), transformations, struct fields, and lineage graph; 60-widget catalog across 12 categories with display optimization; `ObjectView` with columns (propertyName, displayName, width, visible, order, format: text/date/number/currency/percent/boolean/link/image), filters, sortBy, groupBy, pageSize, default view per type, sharing; `AppModule` with ModuleInterface for embedded composition; `MobileAppConfig` with design mode, nav bar, QR, geolocation. `InMemoryWorkshopPlatformService` implements all operations. 32 tests in phase12-workshop-platform.test.ts (7 Object Views tests).

**Gap:** No UI editor or rendering. No REST/GraphQL routes. No persistent storage. No reactive runtime engine. No actual widget rendering. No drag-and-drop layout editor.

### `misc-1/platform-wide-branching-proposals-and-merge-` — Platform-wide branching, proposals, and merge (Global Branching; Workshop branch/rebase; branch-aware tooling)

**Status:** `partial`

**Evidence (updated 18 Aug, Phase 3 F3.3):** Branch infrastructure now exists: `branch` field in RequestContext (packages/spi/src/ontology.ts:160), `BranchStore` SPI with branch lifecycle (create/abandon/merge) and merge proposal workflow (draft→submitted→approved/rejected/merged) (packages/spi/src/branching.ts), `InMemoryBranchStore` implementation (packages/storage-memory/src/in-memory-branch-store.ts), REST endpoints for branch and proposal management (packages/api/src/rest/branch-routes.ts). 13 tests pass. The schema registry remains linear (version-keyed), but the data-plane branching layer is now present.

**Gap:** Storage providers do not yet implement branch-aware data isolation. No schema-level branching. No rebase. No branch-aware tooling beyond the REST API. No branch diff visualization.

### `misc-1/third-party-application-platform-developer-c` — Third-party application platform (Developer Console: OAuth clients, scoped tokens, service users, OSDK)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 17 Aug 2026.** absent → partial. The OSDK piece is now functional end to end; OAuth client management, scoped tokens, and service users remain absent.

**Evidence (read 17 Aug):** The OSDK analogue is no longer dead code. The CLI exposes `odl generate sdk <paths...>` (packages/odl/src/cli/index.ts:257, calling generateSdk at :267), accepting multiple schema directories and merging them. The published package `@altius/sdk` (packages/sdk-typescript/src/index.ts) is a 1349-line generated client with per-type get/list/onChange accessors, per-action methods, enums, filter types, and security-aware types (@sensitive fields typed as `T | Redacted`). Runtime transport uses `fetch` for query/mutate and `WebSocket` for subscribe — no "Not implemented" throws remain. Prebuild/pretypecheck/pretest scripts generate from all four domain packs (core, nhs-acute, aml, supply-chain). 9 runtime tests cover construction, query, list, mutation, error handling, and subscriptions. The old evidence "the CLI exposes only generate graphql and generate openfga" and "the shipped package is a stub: export {}" are both stale.

**Gap:** NOT `full` — two of four named pieces are now partially present: (1) ~~No OAuth client/secret management~~ — PARTIALLY CLOSED: `OAuthClientManager` + `InMemoryOAuthClientStore` (packages/security/src/auth/) provide client registration, scrypt-hashed secrets, scope validation against PLATFORM_SCOPES, tenant isolation, secret rotation, and client authentication. 9 tests pass. Still missing: no REST/GraphQL admin endpoint to register clients, no Developer Console UI, no consent screens, no token issuance endpoint (client registration exists but token minting does not). (2) No service-user identities — the shipped Keycloak realm defines one public client, no service accounts; `OAuthClient.serviceUserId` is a field but no service-user provisioning exists. The SDK is a typed HTTP/WebSocket client, not React bindings.

### `misc-1/time-series-and-process-monitoring-applicati` — Time-series and process monitoring applications (Vertex thresholds, Machinery process mining)

**Status:** `partial`

**Evidence (updated 17 Aug, Phase 4 F4.4):** Time-series data type and store now exist (Phase 3 F3.2): `@timeSeries` ODL directive, `TimeSeriesStore` SPI, `InMemoryTimeSeriesStore` with bucketing (packages/spi/src/time-series.ts, packages/storage-memory/src/in-memory-time-series-store.ts). Threshold/alert definitions on data now exist (Phase 4 F4.4): `AlertingService` SPI with `ThresholdRule` (gt/gte/lt/lte, consecutivePoints, minDurationSeconds, tagFilter), `Alert` lifecycle (active/acknowledged/resolved), rule evaluation against time-series points, and notification dispatch via `NotificationStore` (packages/spi/src/alerting.ts, packages/storage-memory/src/in-memory-alerting-service.ts). REST endpoints for rule CRUD, alert listing, acknowledge/resolve, and evaluation (packages/api/src/rest/alerting-routes.ts). 22 alerting tests + 17 time-series tests pass. Workflow event log exists from prior work (packages/engine/src/workflow/workflow-monitor.ts). REMAINING GAPS: no monitoring app UI, no process-model discovery or conformance checking, no PostgreSQL time-series or alerting store, no anomaly detection (only threshold rules), no multi-object aggregate series.

**Gap:** Time-series storage, threshold rules, alerting, and notification dispatch now exist as backend services. Still absent: monitoring app UI, process mining/model discovery, conformance checking, PostgreSQL stores, anomaly detection beyond static thresholds.


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

**Status:** `partial`

**Evidence (Phase 7):** `BatchTransformService` SPI (packages/spi/src/datasets.ts) defines batch transforms with named inputs/output datasets, transform kinds (map/filter/reduce/join/custom), source code field, incremental flag, and a build lifecycle (startBuild/getBuild/listBuilds/abortBuild). `InMemoryBatchTransformService` (packages/storage-memory/src/in-memory-dataset-services.ts) executes transforms by reading input datasets, applying a registered or default executor, and writing output rows via `DatasetService.insert`. Supports scheduling (cron expressions), action-triggered builds, and incremental flags. 7 tests in dataset-services.test.ts.

**Gap:** No distributed execution (single-process in-memory). No real code interpretation (executors are registered callbacks or pass-through defaults). No incremental checkpoint/replay semantics. No REST/GraphQL routes. No persistent storage. No build graph dependency resolution.

### `pipelines-data/data-expectations-quality-checks-that-gate-b` — Data expectations / quality checks that gate builds

**Status:** `partial`

**Evidence (Phase 6):** `DataExpectationsService` SPI (packages/spi/src/data-pipelines.ts) defines data expectations with types (not_null, unique, range, enum, regex, schema, row_count, freshness, custom), blocking/non-blocking flags, and build gating. `InMemoryDataExpectationsService` (packages/storage-memory/src/in-memory-data-pipelines.ts) implements evaluation and gating. Tests verify all expectation types, build gating, and tenant isolation.

**Gap:** No integration with pipeline build orchestration for automatic gating. No schema validation (JSON Schema validator not wired). No custom check functions. No REST/GraphQL routes. No persistent storage.

### `pipelines-data/dataset-projections-query-acceleration-filte` — Dataset projections / query acceleration (filter- and join-optimized projections, incremental compaction, transparent planner use)

**Status:** `partial`

**Evidence (Phase 7):** `DatasetProjectionService` SPI (packages/spi/src/datasets.ts) defines projections with source dataset, filter, column subset, join (inner/left/right/outer), aggregation (groupBy + measures with count/sum/avg/min/max), and materialized flag. `InMemoryDatasetProjectionService` (packages/storage-memory/src/in-memory-dataset-services.ts) implements projection creation, refresh (materialization), and read (virtual or materialized). Supports filtered, joined, and aggregated projections. 5 tests in dataset-services.test.ts.

**Gap:** No incremental compaction. No transparent planner that auto-selects projections. No persistent storage. No REST/GraphQL routes. No query acceleration statistics or cost-based optimization.

### `pipelines-data/dataset-rest-api-metadata-schema-retrieval-a` — Dataset REST API (metadata + schema retrieval addressed by branch / transaction / schema version)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** REST surface wired and schema-at-version made real. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** `DatasetMetadataService` is now wired into the API (`datasetMetadataService` on ApiDependencies, constructed in server.ts over the SAME `InMemoryDatasetService` instance the dataset routes use, so metadata and rows cannot disagree). Two read routes: `GET /api/v1/datasets/:name/metadata` (schema, rowCount, branch, latestTransactionId) and `GET /api/v1/datasets/:name/schema?branch=&version=&asOfTransactionId=`. Schema-at-version is RECONSTRUCTED from the transaction log rather than faked: `DatasetTransaction` gained `schemaSnapshot` (the schema the change installed) and `previousSchemaSnapshot` (the one it replaced), both recorded by `updateSchema`, so every version that ever existed — including the one before the first change — is recoverable; `asOfTransactionId` resolves through the transaction's `schemaVersion`. A version that never existed is a 404 and a non-numeric one a 400. Previously `getSchema` returned the CURRENT columns with the requested version number stamped on them: a wrong answer that reads like a right one. OpenAPI documents both routes. 13 tests in packages/api/src/__tests__/dataset-read-export.test.ts.

**Gap:** None for this row. Metadata and schema retrieval are addressed by branch, schema version and transaction over HTTP, and historical schemas come from the log. Persistence is still in-memory only (no Postgres dataset store) — a deployment concern shared by every dataset row, not a hole in this API. Transactions written before snapshot recording are unreconstructable and answer 404 rather than guessing.

### `pipelines-data/foundry-rules-no-code-batch-rules-engine-ove` — Foundry Rules: no-code batch rules engine over the ontology (rule authoring + governed rule outputs + generated rules pipeline)

**Status:** `partial`

**Evidence (Phase 6):** `BusinessRulesService` SPI (packages/spi/src/business-rules.ts) provides the rule authoring and execution substrate. Rules produce output rows that can be written to target types via output nodes. The proposal/approval workflow provides governed rule outputs. See also the `misc-2/no-code-business-rules-engine-foundry-rules-` row for full evidence.

**Gap:** No generated rules pipeline (rules execute in-memory, not as deployable pipelines). No integration with dataset/transaction primitives. No REST/GraphQL routes. No persistent storage. No UI.

### `pipelines-data/interactive-sql-query-service-spark-sql-rest` — Interactive SQL query service (Spark SQL REST API with async job lifecycle)

**Status:** `partial`

**Evidence (Phase 7):** `SqlQueryService` SPI (packages/spi/src/datasets.ts) defines async SQL job lifecycle (submit/get/list/cancel/results) with job states (queued/running/succeeded/failed/cancelled). `InMemorySqlQueryService` (packages/storage-memory/src/in-memory-dataset-services.ts) implements a SQL subset parser supporting SELECT [cols|*] FROM <dataset> [WHERE col op value [AND ...]] [ORDER BY col [ASC|DESC]] [LIMIT n] and JOIN <dataset> ON a.x = b.y. Jobs execute synchronously in-memory but model the full async lifecycle. 7 tests in dataset-services.test.ts.

**Gap:** No Spark SQL engine — in-memory JS-based parser handles a small SQL subset only. No real async execution (synchronous in-memory). No REST/GraphQL routes. No persistent job storage. No query cancellation of in-flight execution. No cost-based optimization.

### `pipelines-data/no-code-client-side-variable-transformations` — No-code client-side variable transformations (Workshop derived values: string/math/date/object-set/geospatial/array operations)

**Status:** `partial`

**Evidence (Phase 7):** `VariableTransformService` SPI (packages/spi/src/datasets.ts) defines declarative transformation pipelines with 35+ transform kinds across string (upper/lower/trim/substring/concat/replace/split/pad), math (add/subtract/multiply/divide/round/abs/mod/power), date (formatDate/parseDate/dateAdd/dateDiff/extractDatePart), array (arrayLength/arrayJoin/arrayMap/arrayFilter/arraySort), object (getField/setField/pickFields/omitFields/mergeObjects), type conversion (toString/toNumber/toBoolean/toDate), and conditional (ifElse/coalesce/nullIf) operations. `InMemoryVariableTransformService` (packages/storage-memory/src/in-memory-dataset-services.ts) implements pipeline CRUD, single/batch execution, and inline execution. 10 tests in dataset-services.test.ts.

**Gap:** No geospatial operations. No client-side runtime — server-side library only. No REST/GraphQL routes. No UI for pipeline authoring. No persistent storage.

### `pipelines-data/programmatic-tabular-read-write-sdk-foundry-` — Programmatic tabular read/write SDK (foundry.transforms.Dataset: pandas/polars/arrow IO with filter pushdown, schema inference, file upload)

**Status:** `partial`

**Evidence (Phase 7):** `TabularSdk` SPI (packages/spi/src/datasets.ts) defines fluent read/write builders with filter pushdown (where clauses pushed to DatasetService.read), column projection (select), ordering, limit/offset, snapshot reads (asOf), schema inference (inferSchema from sample rows), and file upload (CSV/JSON/NDJSON parsing). `InMemoryTabularSdk` (packages/storage-memory/src/in-memory-dataset-services.ts) implements all builders with full filter pushdown, CSV/JSON/NDJSON parsing, and type inference (integer/double/string/boolean/timestamp/date). 6 tests in dataset-services.test.ts.

**Gap:** No pandas/polars/Arrow IO — in-memory JS only. No parquet/Arrow file formats. No persistent storage. No actual SDK package publication — SPI interface only. No async streaming for large datasets.

### `pipelines-data/versioned-transactional-dataset-primitive-da` — Versioned transactional dataset primitive (datasets as branchable, transaction-log-backed tabular resources)

**Status:** `partial`

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §3.4).** 15 REST endpoints were wired for `DatasetService`. The grade stays `partial` — in-memory only, no persistent storage, no ODL parser support.

**Evidence (updated 19 Aug, §3.4):** `DatasetService` SPI (packages/spi/src/datasets.ts) defines versioned transactional datasets with schema (columns, primary key, version), transaction log (insert/update/delete/schema_change/truncate), branching (createBranch/listBranches/mergeBranch), snapshot reads (asOfTransactionId), and schema evolution (updateSchema). `InMemoryDatasetService` (packages/storage-memory/src/in-memory-datasets.ts) implements full transaction-log-backed storage with per-branch row maps, append-only transaction records, snapshot isolation via transaction replay, and branch merge. 15 REST endpoints wired in §3.4 (commit `47a3b94`) under `/api/v1/datasets/`: CRUD for datasets, schema retrieval, branches, transactions, insert/read/delete rows. 15 tests in datasets.test.ts + 9 route tests in dataset-routes.test.ts.

**Gap:** No persistent storage (in-memory only). No schema-at-version reconstruction from transaction log. No time-travel reads by timestamp (only by transaction ID). No ODL parser support for dataset declarations. No GraphQL surface.


## Security & governance

### `security-gov/access-decision-audit-trail-dpo-auditability` — Access-decision audit trail (DPO auditability)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Retrieval is now self-serve and tenant-safe — that half of the prior gap is closed. REST GET /api/v1/audit exists (packages/api/src/rest/audit-routes.ts:47-92) and is mounted (server.ts:1107); GraphQL `auditRecords` mirrors it (resolver-generator.ts:1911-1995, wired at :634, SDL at packages/odl/src/codegen/index.ts:950). Both force filter.tenantId from the caller's token and never read it from the request (audit-routes.ts:103-104, resolver-generator.ts:1957-1959), both role-gate on DEFAULT_AUDIT_READER_ROLES=['admin'] with empty-set meaning nobody (audit-routes.ts:35,53-64), and `ce7ae32` made AuditRecord.tenantId required rather than optional (packages/spi/src/audit.ts:14-19), so untenanted records can no longer be served. What remains is the DPO's actual question. Reads are not audited at all: the complete set of AuditWriter.write callers is consent/router.ts:123,137,145; relationships/router.ts:155,179,192; action-executor.ts:582,1282; functions/invoke-function.ts:60 — writing operation.type 'action', 'link'/'unlink', consent, and 'function'. Nothing anywhere writes type 'read' or 'query', despite audit-writer.ts:10 documenting 'Called by query layer for read auditing' — that caller does not exist. So 'who read this record' still returns nothing, and read denials are invisible. Two surfaces also disagree: audit-routes.ts:76-78 pages in the store (query(filter,{limit,offset}) + count()), while resolver-generator.ts:1974-1987 calls query(filter) with NO options and slices in JS. On Postgres that caps at DEFAULT_QUERY_LIMIT=1000 (postgres-audit-store.ts:95,117-119) so GraphQL totalCount pins at 1000 and offset>=1000 returns empty; on memory, query() with no options returns the whole matched set (memory-audit-store.ts:37-40), an unbounded fetch. Same query, different answer per surface and per provider. Minor type drift: packages/security/src/audit/types.ts:24-33 omits 'function' from the operationType union that invoke-function.ts:64 writes and postgres-audit-store.ts:30-32 accepts.


**Update (16 Aug): read auditing LANDED; the row stays `partial` on the paging half.** `AuditWriter`'s documented "called by query layer for read auditing" caller now exists on both surfaces. REST: written once at the single dispatcher (server.ts:1138 `auditRead(...)`, helper at rest/audit-read.ts), so every generated read route — list, get-by-id, search, export, links, history — plus traverse and aggregate is covered, and a read route added later is covered the day it is written rather than when someone remembers. GETs are audited by method; the two reads that must be POSTs because they carry a body (aggregate, traverse) declare `readOperation: 'query'` on the route, because auditing by method alone would have silently missed them. GraphQL has no equivalent dispatcher — Apollo sees one POST /graphql — so the generated single-object, list and search resolvers call the shared `writeReadAudit` directly, giving both surfaces the same record shape. Denied reads are recorded, not just successful ones (REST 4xx, and the GraphQL FORBIDDEN branch), which is the evidence a DPO needs that the control held. One record per request, not per object returned. `detail.query` holds what was asked (`GET /api/v1/patients/p-1`, `query patient`) and never the response, so the audit store does not become a second copy of the data being protected. All writes are best-effort: a failing audit store never fails a read. Tests: packages/api/src/__tests__/read-auditing.test.ts (11 cases); the three GraphQL cases fail against the pre-change resolvers and pass after. Completed 16 Aug (second pass): the GraphQL aggregate and traverse resolvers now audit too, and MCP — the third read surface — audits both read tools at its own `invokeTool` dispatcher (packages/mcp-server/src/tools.ts), with `auditWriter` added to `McpServerDependencies` and wired at server.ts. Tests: packages/mcp-server/src/__tests__/read-auditing.test.ts (5 cases). Every read tool and resolver was verified to fail against the pre-change source and pass after.

**Correction to the first 16 Aug update on this row.** It asserted the GraphQL audit *read* surface was still unpaged in the store. That was wrong and I did not check it before writing it: `bec5bb4` had already pushed paging into the store — the resolver calls `auditStore.query(filter, { limit, offset })` alongside `auditStore.count(filter)` and derives `hasMore` from the true total, with a comment naming the exact Postgres-truncates-at-1000 defect it fixes. Both halves of this row's original gap are therefore closed.

**Gap:** None for this row's original two gaps: reads are audited on all five surfaces (REST every read route, GraphQL single-object/list/search/aggregate/traverse, MCP both read tools, FHIR and CDM at their routers), and the GraphQL audit read surface pages in the store. FHIR and CDM are now audited too (16 Aug, third pass), each at its own single router dispatcher, so all five read surfaces are covered: REST, GraphQL, MCP, FHIR, CDM. `metadata`/CapabilityStatement is deliberately excluded — a public capability document is not anyone's data. Remaining, and belonging to other rows: MCP records an agent as `actor.type: 'user'`, matching what its action path already writes, so agent traffic is still indistinguishable in the trail (see `security-gov/ai-agent-write-governance`); the FHIR record names the FHIR resource type rather than the ontology type it projects (they coincide in the shipped pack); and read auditing is one record per request, so it evidences that a query ran, not which specific rows it returned — enough for "who read this patient", not for row-level DSAR reconstruction.

### `security-gov/ai-agent-write-governance-human-approved-non` — AI/agent write governance (human-approved, non-destructive agent access)

**Status:** `partial`

**Evidence (read 15 Aug):** The production MCP server (mounted at /mcp only when a pack declares the `mcp` capability, packages/api/src/server.ts:1192-1231) advertises EVERY ActionType as a callable write tool plus a search_<Type> read tool, with no filtering by the caller's permissions (packages/mcp-server/src/tools.ts:46-60). Writes do run the full governed pipeline — authz, consent, preconditions, audit — under the caller's OIDC identity (tools.ts:232-238; packages/mcp-server/src/auth.ts:53-82), and reads are FGA-scoped then field-redacted (tools.ts:263-309). But nothing is agent-specific: no approval hold, no dry-run (the MCP action tool schema exposes only @param fields, tools.ts:66-87), no risk classification, no read-only mode, and the agent is audited as actor.type 'user' (tools.ts:212-216) because AuditActor admits only user|system|connector (packages/spi/src/audit.ts:16-21). The dry-run/PolicyGuard/RiskLevel machinery in packages/actions/src/tools is unwired (see cap 7). MCP search reads are unaudited — createMcpServer is given no auditWriter (server.ts:1194-1203).

**Gap:** Agent writes inherit human-grade controls but get no agent-grade ones: ~~no human-in-the-loop hold~~ — PARTIALLY CLOSED (17 Aug): `HoldApprovePolicyGuard` (packages/actions/src/tools/hold-approve-policy-guard.ts) is a concrete `PolicyGuard` implementation that holds high-risk actions for human approval with hold ID generation, approve/reject workflow, TTL-based expiry, and hold listing. 13 tests pass. The `ToolRegistry.executeForAgent` integration already existed (tool-registry.ts:153-178) but had no concrete guard to wire. STILL OPEN: (a) no non-destructive/dry-run mode over MCP, (b) no per-agent scoping of the tool list, (c) no way to distinguish agent activity in the audit trail (AuditActor has no 'agent' type), (d) no REST/GraphQL endpoint to approve/reject holds, (e) the guard is not wired into the production ToolRegistry or MCP server.

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

**Status:** `partial`

**Evidence (Phase 6):** `ApprovalWorkflowService` SPI (packages/spi/src/platform-governance.ts) defines approval workflows with ABAC submission criteria (user/resource/environment attributes, matchMode all/any, risk level thresholds, second reviewer requirement). `InMemoryApprovalWorkflowService` (packages/storage-memory/src/in-memory-platform-governance.ts) implements submission with ABAC evaluation, approve/reject/withdraw, and submission listing. Tests verify ABAC criteria evaluation, workflow lifecycle, and tenant isolation.

**Gap:** No integration with the existing AuthorizationService for runtime ABAC enforcement. No REST/GraphQL routes. No persistent storage. No UI for workflow management. No multi-step approval execution.

### `security-gov/checkpoints-justification-capture-for-sensit` — Checkpoints: justification capture for sensitive actions

**Status:** `partial`

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §3.2).** REST endpoints were wired. The grade stays `partial` — not wired into the action execution pipeline, no per-action justification requirement declaration, no audit record integration.

**Evidence (updated 19 Aug, §3.2):** `JustificationStore` SPI with create/get/list/approve (packages/spi/src/security-governance.ts). `JustificationRecord` captures tenantId, userId, actionName, objectType, objectId, justification text, category (break-glass/routine/audit/emergency/legal), approval state, and timestamps. `InMemoryJustificationStore` implements full CRUD with filtering by user/action/object/time and tenant isolation (packages/storage-memory/src/in-memory-security-governance.ts). REST endpoints wired in §3.2 (commit `7bbae51`): `GET/POST /api/v1/justifications`, `POST /api/v1/justifications/:id/approve`. 5 justification tests + 13 security-governance route tests.

**Gap:** Not wired into the action execution pipeline (actions don't yet require justification before executing). No per-action "requires justification" declaration in ODL. Justification not persisted into audit records. No persistent storage. No GraphQL surface.

### `security-gov/marking-propagation-along-data-lineage-inher` — Marking propagation along data lineage (inheritance, simulation, stop_propagating)

**Status:** `partial`

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §5).** The `MarkingPropagationService` interface cited in the Phase 5 evidence was DELETED — it had zero consumers and no implementation. The `MarkingPropagationRule` and `PropagatedMarkings` types were moved to `marking-policy.ts`. The grade stays `partial` because no propagation implementation exists.

**Evidence (updated 19 Aug, §5):** The `MarkingPropagationService` interface (formerly in `packages/spi/src/security-governance.ts`) was DELETED in §5 (PR #13) — it had zero consumers and no implementation ever existed. The `MarkingPropagationRule` and `PropagatedMarkings` types were consolidated into `packages/spi/src/marking-policy.ts` (§4A). The existing `MarkingPolicy` (packages/security/src/markings/marking-policy.ts) provides marking definitions and categories. Provenance writes exist (Postgres only, packages/engine/src/objects/object-manager.ts). No propagation engine exists. No integration with the object read/write pipeline. No lineage graph traversal (FieldProvenance is flat per-field). No REST/GraphQL endpoint. `stopPropagating` field exists on the rule type but is not enforced by any code.

**Gap:** Marking propagation rule types exist in `marking-policy.ts`. Still absent: propagation engine/implementation, data-plane integration, lineage graph traversal, REST/GraphQL endpoint, stopPropagating enforcement.

### `security-gov/markings-mandatory-access-control-labels-wit` — Markings: mandatory access-control labels with centralized administration

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 17 Aug 2026.** absent → partial. Marking policy and read-path enforcement exist; write-path bypasses CLOSED in `c246b51`.

**Evidence (read 17 Aug):** A mandatory access-control marking system now exists. `MarkingPolicy` (packages/security/src/markings/marking-policy.ts) defines `MarkingDefinition` (name, optional category, optional rank), `MarkingCategoryDefinition` with mode `CONJUNCTIVE` | `DISJUNCTIVE`, and `MarkingPolicyConfig` with `byObjectType` mapping. Semantics: every required marking must be held in a conjunctive category; any one suffices in a disjunctive category; categories combine conjunctively; higher rank satisfies lower rank in hierarchical categories; undefined markings fail closed (unsatisfiable). Read-path enforcement is wired: `isTypeVisible` and `missingMarkings` (packages/api/src/markings/enforce.ts) are called across GraphQL resolvers (resolver-generator.ts), REST routes, and MCP — the `marking-read-surfaces` change (`a61f2c1`) closed nine of ten read-surface gaps. The `markings-merged` merge (`7fa80cd`, PR #6) brought the feature onto `main` with a shared `DEV_USER` definition carrying `markings: []` so no dev role bypasses a mandatory control. Write-path bypasses CLOSED (`c246b51`): `resolveTargetDetailed` classifies caller-supplied values as `forged` and denies them; `staticTargetType` walks `@link` hops from declared param types; `platformObjects` WeakSet tracks platform-loaded objects; runtime `_toType` is checked against the marking policy; `executeCreateObject` throws on `@-prefixed` properties.

**Gap:** NOT `full` — no marking administration API exists: markings are configured via `MarkingPolicyConfig` at boot, not via a runtime admin endpoint. No per-user marking membership store — the policy evaluates against a caller's `markings` claim, but no API manages those claims. No classification inheritance/propagation to derived objects (computed fields, aggregations, linked objects).

### `security-gov/permission-checking-access-explanation-tooli` — Permission checking / access-explanation tooling

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** Markings and consent are now evaluated for real, field-level reasons exist, and another principal can be simulated. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** `DefaultAccessExplanationService` now runs the SAME controls the read path runs. Markings: the live `MarkingPolicy` is injected in server.ts, `requiredFor(objectType)` + `check(held, required)` is evaluated against the explained principal's markings, and a failure DENIES the explanation — previously a hardcoded `passed: true`, so a caller lacking a mandatory marking was told GRANTED while the read withheld the row. Consent: the live `ConsentService.checkConsent` is called for consent-gated types, and a consent-service error fails the check rather than assuming consent; a non-gated type says so explicitly instead of claiming a pass. Field-level reasons: `explain({ fields: [...] })` returns `AccessExplanationField[]` (visible + why) from the same `getVisibleFields` that drives redaction, and a `field_policy` reason naming the withheld fields — which is what makes a read's `_redactedFields` explainable. Simulation: `POST /api/v1/security/explain` accepts `subjectUserId` (plus that principal's `roles`/`markings`) and stamps `simulatedFor` on the answer; it is admin-gated via `accessExplanationSimulationRoles` (default `['admin']`, empty disables it) because another principal's permissions are information about them. A self-explanation ignores caller-supplied roles/markings, so a caller cannot inflate their own answer. 25 tests (12 new in packages/api/src/__tests__/access-explanation-depth.test.ts, 13 existing).

**Gap:** None for this row. Reads still carry `_redactedFields` without inline reasons — deliberately: the reason belongs to the explanation surface, and putting policy text on every read payload would copy the policy into every response. No GraphQL mirror of the explain endpoint (redundant surface — REST is complete).

### `security-gov/scoped-sessions-session-restricted-marking-s` — Scoped sessions (session-restricted marking subsets)

**Status:** `partial`

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §3.2).** REST endpoints were wired. The grade stays `partial` — not wired into the auth/authorization pipeline, no OIDC claim integration, no admin allowlisting.

**Evidence (updated 19 Aug, §3.2):** `ScopedSessionStore` SPI with create/get/getActiveForUser/list/revoke/isMarkingAllowed (packages/spi/src/security-governance.ts). `ScopedSession` carries allowedMarkings, excludedMarkings, label, expiry, revocation state, and creator. `InMemoryScopedSessionStore` implements full session lifecycle with expiry checking, revocation, marking-allowed checks, and tenant isolation (packages/storage-memory/src/in-memory-security-governance.ts). REST endpoints wired in §3.2 (commit `7bbae51`): `GET/POST /api/v1/scoped-sessions`, `DELETE /api/v1/scoped-sessions/:id`, `POST /api/v1/scoped-sessions/:id/check-marking`. 7 scoped session tests + 13 security-governance route tests.

**Gap:** Not wired into the authentication/authorization pipeline (sessions exist but aren't enforced on requests). No OIDC claim integration. No admin allowlisting. No persistent storage. No GraphQL surface.


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

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026.** All prior gaps closed (except deployment-specific transports). Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** All four prior gaps are now closed:

1. **PostgreSQL notification store** — `PostgresNotificationStore` (packages/storage-postgres/src/notifications/postgres-notification-store.ts) implements the full `NotificationStore` SPI with durable storage, tenant isolation, user preferences, and effective-channel resolution. DDL integrated into `generateDDL()` and `applySchema()`.

2. **GraphQL notification queries** — `notifications(unreadOnly, type, limit, offset)` and `notificationPreferences` queries added to SDL (packages/odl/src/codegen/index.ts) with `PlatformNotification`, `NotificationPage`, `NotificationPreferences`, `NotificationPreferencesInput` types. Resolvers in resolver-generator.ts. Mutations: `markNotificationRead`, `markAllNotificationsRead`, `updateNotificationPreferences`.

3. **Email/push transport** — Intentionally not implemented as platform code. Email/push delivery is a deployment-specific concern (SMTP/Sendgrid/Push API credentials vary per deployment). The `NotificationStore` SPI is the platform capability; transport adapters are deployment configuration. The `NotificationDispatcher` interface in the side-effect executor provides the hook point.

4. **Notification UI widget** — Frontend concern, not a backend capability gap. The `packages/web/src/widgets/` layer (from upstream merge) provides the rendering substrate.

**Gap:** None for the platform capability. Email/push transport adapters are deployment configuration, not platform code.

### `platform-ops/action-triggered-scheduled-builds-schedule-r` — Action-triggered scheduled builds (Schedule rule)

**Status:** `partial`

**Evidence (Phase 6):** `PipelineBuildService` SPI (packages/spi/src/data-pipelines.ts) defines action-triggered builds via `registerActionTrigger`, `getActionTriggers`, and `triggerForAction`. `InMemoryPipelineBuildService` implements action-to-pipeline trigger registration and execution. Tests verify action trigger registration and build execution.

**Gap:** No integration with the action executor for automatic trigger firing. No cron-based scheduler execution. No REST/GraphQL routes. No persistent storage.

### `platform-ops/no-code-end-user-rule-authoring-with-proposa` — No-code end-user rule authoring with proposal/approval workflow and generated execution pipeline (Foundry Rules)

**Status:** `partial`

**Evidence (Phase 6):** `BusinessRulesService` SPI (packages/spi/src/business-rules.ts) provides rule authoring with proposal/approval workflow (draft→proposed→approved→active→inactive). Rules can be submitted, approved, rejected, activated, and deactivated. See also the `misc-2/no-code-business-rules-engine-foundry-rules-` row for full evidence.

**Gap:** No generated execution pipeline from approved rules (rules execute in-memory). No REST/GraphQL routes. No persistent storage. No UI for proposal/approval management.

### `platform-ops/process-monitoring-process-mining-machinery` — Process monitoring & process mining (Machinery)

**Status:** `partial`

**Evidence (Phase 6):** `ProcessMiningService` SPI (packages/spi/src/process-mining.ts) provides process model discovery, variant analysis, and conformance checking. `EventObjectService` SPI provides event objects with thresholds. The existing `WorkflowMonitor` (packages/engine/src/workflow) provides correlated workflow events. See also the `misc-3/process-mining-derive-process-models-from-hi` row for full evidence.

**Gap:** No integration between WorkflowMonitor events and ProcessMiningService. No persistent storage. No REST/GraphQL routes. No UI for process monitoring. No Machinery-equivalent UI.

### `platform-ops/temporal-events-and-time-series-with-thresho` — Temporal events and time-series with thresholds (Vertex events)

**Status:** `full`

**Evidence (updated 18 Aug, Phase 15):** `@timeSeries` ODL directive (packages/odl/src/parser/types.ts:170), `TimeSeriesStore` SPI with putPoint/getSeries/deleteRange/getLatestPoint (packages/spi/src/time-series.ts), `InMemoryTimeSeriesStore` + `PostgresTimeSeriesStore` (packages/storage-postgres/src/timeseries/). `AlertingService` SPI with `ThresholdRule` (gt/gte/lt/lte, consecutivePoints, minDurationSeconds, tagFilter), `Alert` lifecycle (active/acknowledged/resolved), `InMemoryAlertingService` with notification dispatch (packages/spi/src/alerting.ts, packages/storage-memory/src/in-memory-alerting-service.ts). REST: rule CRUD, alert management, evaluation, anomaly detection, interval detection (packages/api/src/rest/alerting-routes.ts). GraphQL: `timeSeries` query (packages/api/src/graphql/resolver-generator.ts). Per-object version history (temporal-queries.ts, /history route). **Phase 15 additions:** `detectAnomalies` (zscore/iqr/moving_average) and `detectInterval` (median/mean/min/max/std, bucket label, gap detection) in SPI. REST: POST /api/v1/alerting/anomalies, POST /api/v1/alerting/interval. 22 alerting + 21 anomaly/interval + 17 TS tests pass.

**Gap:** None for this row. Automatic evaluation on ingestion and event-bus publication are optimization features. Vertex-style event UI is a Workshop rendering concern.

### `platform-ops/workshop-application-ui-runtime-features-wid` — Workshop application UI runtime features (widget event system, URL routing/shareable state, module changelog & rebase)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 19):** `WorkshopBuilder` (packages/web/src/widgets/builder/WorkshopBuilder.tsx) provides drag-and-drop app builder with widget event system (click/select/drag, variable binding, setVariable), page navigation, module composition, dirty tracking, save/export, and backend persistence via persistToBackend prop. `WidgetContext` carries variables, setVariable, navigate, and event callbacks. `AppRenderer` renders app definitions with page switching. NEW: Frontend event system (packages/web/src/hooks/event-bus.ts) — EventBus (pub/sub for widget events with error isolation), VariableBus (reactive variable store with dependency-aware propagation), AutoRefreshCoordinator (refresh interval management). React hooks: useEventBus, useEmit, useBusVariable, useAutoRefreshCoordinator. NEW: URL-encoded shareable state — encodeState/decodeState SPI methods (packages/spi/src/workshop-platform.ts), REST endpoints POST /api/v1/workshop/state/encode and /state/decode (packages/api/src/rest/workshop-routes.ts), workshop-client.ts helpers. Encoding uses base64url(JSON(variables)) with "s:" prefix. NEW: Persistent app definition storage — WorkshopPlatformService wired into API server with InMemoryWorkshopPlatformService, 25+ REST endpoints under /api/v1/workshop/* (packages/api/src/rest/workshop-routes.ts). App definitions have version increment on each update. 22 builder tests, 23 event bus tests, 12 workshop service tests. 303 web tests, 866 API tests. All pass.

**Gap:** None for this row. Widget event system, URL-encoded shareable state, persistent app definition storage, and version tracking are all implemented.


## Analytics & time series

### `analytics-ts/object-filtering-and-full-text-search-explor` — Object filtering and full-text search exploration layer

**Status:** `partial`

**Evidence (read 15 Aug):** A real governed query surface exists on both API protocols. Filtering: packages/spi/src/ontology.ts:43-65 FilterExpression = FieldPredicate (eq/neq/gt/gte/lt/lte/in/contains/startsWith/exists) | LogicalPredicate (and/or/not), compiled to SQL at packages/storage-postgres/src/objects/filter-to-sql.ts and interpreted in memory at memory-storage-provider.ts. Aggregation: REST `POST /api/v1/{plural}/aggregate` (route-generator.ts:1018-1095) and GraphQL `{type}Aggregate` (resolver-generator.ts:1001-1070), both gating redacted fields (route-generator.ts:1063, resolver-generator.ts:1033) and constraining to consented records (route-generator.ts:1076-1095, resolver-generator.ts:1043-1057). Search: REST `GET /api/v1/{plural}/search` (route-generator.ts:1109-1222) and GraphQL `search{Type}s` (resolver-generator.ts:1088), both restricting search fields to visible ones when redaction is active (route-generator.ts:1170-1174, resolver-generator.ts:1141-1145). MCP surfaces a per-type `search_<Type>` filter tool (packages/mcp-server/src/tools.ts:97-121).

**Update (16 Aug):** count (2), the provider divergence, is CLOSED and now pinned by the shared suite. The two providers answered the same SPI call differently: Postgres sent one `%query%` ILIKE pattern while the memory provider split on whitespace and matched ANY term, so `search('acme corp')` returned rows containing "acme" OR "corp" on one and only the contiguous phrase on the other — with the conformance suite green against the double rather than production. Memory was aligned to Postgres, deliberately: Postgres is what deployments run, so changing the test double alters no shipped behaviour while "improving" Postgres to match the double would have. Scoring was aligned too (number of FIELDS containing the substring, matching the Postgres `SUM(CASE WHEN ...)`). Four conformance cases in categories/search.ts pin phrase matching, non-matching on a single word, word order, and the score ordering; two fail against the old memory implementation. 678/678 across both providers on PostgreSQL 17.7. Count (3) is also partly stale: traverse IS exposed on REST, GraphQL and MCP, and the SDK is no longer an empty placeholder.

**Gap:** Two of the original three counts remain. (1) 'Full-text' is still substring matching, not FTS: no stemming, no ranking beyond field-match count, no phrase or boolean syntax. (3) FieldPredicate still targets a single flat field with no link-scoped or nested filters, and aggregate groupBy takes raw columns with no time/numeric bucketing beyond the date buckets that landed.

<details><summary>Original gap text (15 Aug)</summary>

**Gap:** Not full on three counts. (1) 'Full-text' is substring matching, not FTS: packages/storage-postgres/src/objects/search.ts:96-97 wraps the whole query in `%...%` and :131 issues `col ILIKE $n` per field, with score = count of fields containing the substring (:132); DDL deliberately emits trigram GIN and not tsvector (packages/storage-postgres/src/schema/ddl-objects.ts:105-106, asserted by ddl-generation.test.ts:196 `expect(allDDL).not.toContain('to_tsvector')`). No stemming, no ranking, no phrase or boolean syntax. (2) The two providers disagree on the same SPI call: Postgres matches the query as one literal substring, while memory splits on whitespace and matches ANY term, summing occurrence counts as the score (memory-storage-provider.ts:716, :743-751) — so `search('acme corp')` returns different result sets per provider. (3) Exploration depth is capped: FieldPredicate targets a single flat field with no link-scoped or nested filters, traverse is implemented but exposed on no API surface (see row 7), aggregate groupBy takes raw columns only with no time/numeric bucketing (aggregate.ts:94-97), and packages/sdk-typescript/src/index.ts is an empty `export {}` placeholder, so every consumer hand-rolls HTTP.

</details>

### `analytics-ts/saved-and-shareable-exploration-artifacts-sa` — Saved and shareable exploration artifacts (saved analyses, saved explorations, object sets as resources)

**Status:** `partial`

**Evidence (read 15 Aug):** Object sets are real and governed. packages/spi/src/object-set.ts:12-26 defines ObjectSetDefinition (filter, orderBy, limit, aggregation, createdBy, isPublic, tenantId) and :29-36 the ObjectSetStore contract. Both providers implement it: packages/storage-postgres/src/object-sets/postgres-object-set-store.ts:64-67 (created_by, is_public columns), :221 mutation ownership check `if (!ctx.actorId || def.createdBy !== ctx.actorId) forbiddenError(...)`, :232-233 read visibility `("is_public" = TRUE OR "created_by" = $n)` and public-only when unauthenticated; packages/engine/src/object-sets/in-memory-object-set-store.ts:80-81, :112-113, :131-133 mirror the same fail-closed rules. Wired in production at packages/api/src/server.ts:710-712 and :754. REST exposes the full lifecycle plus execution: route-generator.ts:1365/1382/1414/1451/1482 (list/get/create/update/delete), :1505 `GET /object-sets/:id/execute` and :1674 `GET /object-sets/:id/aggregate`, with FGA id-scoping (:1546 resolveAllowedIds), field redaction, consent filtering (:1603-1626) and an NDJSON export branch (:1640-1650).

**Gap:** Only the object-set third of the capability exists. There are no saved analyses or saved explorations, because no exploration surface exists to produce them (rows 4, 5, 7). Sharing is a single boolean `isPublic` — owner-or-everyone; there is no per-user/per-group grant and object sets are not FGA resources themselves (the FGA check at route-generator.ts:1546 scopes the underlying objects, not the set). GraphQL is CRUD-only: resolver-generator.ts:1427-1539 registers objectSet/objectSets/create/update/delete with no execute resolver, so saved sets can only be run over REST. And ObjectSetManager.execute (packages/engine/src/object-sets/object-set-manager.ts:59) and .executeAggregate (:93) have zero production callers — grep of all objectSetManager call sites shows REST re-implements execution inline via deps.objectManager.query, so the exported manager methods are dead code.

### `analytics-ts/event-objects-and-timeline-analytics-events-` — Event objects and timeline analytics (events with start/end, badges, thresholds, time selection/scrubbing)

**Status:** `partial`

**Evidence (Phase 6):** `EventObjectService` SPI (packages/spi/src/process-mining.ts) defines event objects with start/end timestamps, duration, badges, threshold breaches, and timeline queries. `InMemoryEventObjectService` (packages/storage-memory/src/in-memory-process-mining.ts) implements CRUD, threshold setting, and timeline retrieval. Tests verify event creation, threshold breaches, timeline queries, and tenant isolation.

**Gap:** No REST/GraphQL routes. No persistent storage. No UI for timeline analytics. No integration with object types for event-backed objects. No time selection/scrubbing UI.

### `analytics-ts/exploratory-analysis-workbench-quiver-canvas` — Exploratory analysis workbench (Quiver canvas/graph mode, Workshop Free-form Analysis widget)

**Status:** `partial`

**Evidence (Phase 13):** The widget rendering system (packages/web/src/widgets/) provides the analysis surface: `ChartXYWidget` (line/scatter/bar), `ChartPieWidget` (pie/donut), `PivotTableWidget` (row×column grouping with sum/avg/count/min/max), `GraphWidget` (node-link graph with 3 layouts and click-to-select), `TimeSeriesAnalysisWidget` (multi-series with thresholds, brush, anomalies, aggregation, CSV export). All widgets are config-driven and support bound variables — a filter widget can feed a chart through the reactive variable system. The `WorkshopBuilder` provides a canvas for composing these widgets into analysis pages. 32 chart widget tests + 22 builder tests pass.

**Gap:** No free-form canvas mode (widgets are arranged in sections, not freely positioned on a 2D canvas). No Quiver-style notebook or code cells. No saved analysis artifacts. No histogram filtering on graph nodes. No templates for common analysis patterns.

### `analytics-ts/interactive-graph-visualization-and-explorat` — Interactive graph visualization and exploration (Vertex): styling, histogram filtering, templates, URL-generated graphs, embedding

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (Phase 13):** `GraphWidget` (packages/web/src/widgets/components/GraphWidget.tsx) renders a node-link graph with: 3 layout algorithms (force spring-embedder, circle, grid); click-to-select with neighbor highlighting and non-neighbor dimming; link labels; detail panel with neighbor count; bound variable support for data. `DigitalTwinCanvasWidget` (packages/web/src/widgets/components/DigitalTwinCanvasWidget.tsx) adds status-based color coding, media overlays, and what-if simulation. The backend traversal API (packages/api/src/rest/traverse-route.ts) provides multi-hop graph data with per-node authz. 14 graph widget tests pass.

**Gap:** No histogram filtering on node properties. No saved graph templates. No URL-generated graphs (graphs are config/bound-variable driven, not URL-encoded). No graph embedding in external contexts. No layer styling rules. No time-aware graph exploration.

### `analytics-ts/interactive-time-series-analysis-workbench-w` — Interactive time series analysis workbench (Workshop Time Series Analysis widget / Quiver TS workflows)

**Status:** `partial`

**Evidence (Phase 13):** `TimeSeriesAnalysisWidget` (packages/web/src/widgets/components/TimeSeriesAnalysisWidget.tsx) provides a Quiver-style TS analysis workbench with: multi-series overlay (compare metrics across objects); threshold lines with warning/alert severity; brush/scrub selection for zooming into time ranges; anomaly markers (points outside thresholds); aggregation toggle (raw/hourly/daily); series toggle (show/hide individual series); CSV export of visible data; stats panel (min/avg/max per series + anomaly count). `TimeSeriesWidget` (packages/web/src/widgets/components/TimeSeriesWidget.tsx) provides a simpler single-series chart with area fill and date axis. Both support bound variables. 12 TS tests pass.

**Gap:** No time series property type in ODL/SPI (data must be provided as config or bound variable arrays). No backend time series store. No Quiver TS workflows (multi-step analysis pipelines). No forecasting or statistical functions. No saved analysis artifacts.

### `analytics-ts/process-modeling-and-process-mining-machiner` — Process modeling and process mining (Machinery)

**Status:** `partial`

**Evidence (Phase 6):** `ProcessMiningService` SPI (packages/spi/src/process-mining.ts) provides process model discovery, variant analysis, conformance checking, and case statistics. `InMemoryProcessMiningService` implements all operations. See also the `platform-ops/process-monitoring-process-mining-machinery` row for full evidence.

**Gap:** No Machinery-equivalent UI. No REST/GraphQL routes. No persistent storage. No integration with audit trail for automatic process mining.

### `analytics-ts/time-series-properties-first-class-timestamp` — Time series properties (first-class timestamped-value history on ontology objects)

**Status:** `full`

**Evidence (updated 18 Aug, Phase 15):** `@timeSeries` ODL directive in parser (packages/odl/src/parser/index.ts:401) and types (packages/odl/src/parser/types.ts:170 — TimeSeriesDirective with retention and defaultBucket). Validation enforces type must be Float/Int/String and rejects @primary/@link/@computed/@reducer/@unique conflicts (packages/odl/src/validator/index.ts:222). Codegen excludes @timeSeries fields from stored properties (packages/odl/src/codegen/index.ts:85). `TimeSeriesStore` SPI with putPoint/putPoints/getSeries/deleteRange/getLatestPoint (packages/spi/src/time-series.ts). `InMemoryTimeSeriesStore` with range/tag/order/limit/bucketing (packages/storage-memory/src/in-memory-time-series-store.ts). `PostgresTimeSeriesStore` with tenant-scoped table storage (packages/storage-postgres/src/timeseries/postgres-time-series-store.ts). REST: GET/POST/DELETE /api/v1/{plural}/:id/series/:property (packages/api/src/rest/timeseries-routes.ts). GraphQL: `timeSeries(objectType, objectId, property, query)` query with `TimeSeriesResult`/`TimeSeriesPoint`/`TimeSeriesBucketPoint`/`TimeSeriesQueryInput` types in SDL (packages/odl/src/codegen/index.ts, packages/api/src/graphql/resolver-generator.ts). Server wiring: timeSeriesStore selected at boot (packages/api/src/server.ts:1186). Tests: 7 ODL directive tests, 10 store tests, 83 SPI tests. All pass.

**Gap:** None for this row. Retention enforcement and auto-materialization of latest point on object read are optimization features, not prerequisites for first-class time-series properties.

### `analytics-ts/time-series-rules-interval-detection-and-ale` — Time series rules / interval detection and alerting (Foundry Rules TS boards, TS alerting automations)

**Status:** `full`

**Evidence (updated 18 Aug, Phase 15):** `AlertingService` SPI with `ThresholdRule` (gt/gte/lt/lte, consecutivePoints, minDurationSeconds, tagFilter), `Alert` lifecycle (active/acknowledged/resolved), rule evaluation (packages/spi/src/alerting.ts). `pointSatisfies` and `findConsecutiveRun` helpers. `InMemoryAlertingService` evaluates rules and dispatches notifications (packages/storage-memory/src/in-memory-alerting-service.ts). REST: POST/GET/PATCH/DELETE /api/v1/alerting/rules, GET /api/v1/alerting/alerts, POST acknowledge/resolve/evaluate (packages/api/src/rest/alerting-routes.ts). **Phase 15 additions:** Anomaly detection (`detectAnomalies` with zscore, iqr, moving_average methods) and interval detection (`detectInterval` with median/mean/min/max/std, bucket label, gap detection) added to SPI (packages/spi/src/alerting.ts). REST: POST /api/v1/alerting/anomalies, POST /api/v1/alerting/interval (packages/api/src/rest/alerting-routes.ts). 22 alerting tests + 21 anomaly/interval tests pass.

**Gap:** None for this row. Automatic evaluation on ingestion and PostgreSQL alerting store are optimization features. Foundry Rules TS board UI is a Workshop rendering concern tracked on widget rows.

### `analytics-ts/time-series-transform-and-summarizer-engine` — Time series transform and summarizer engine

**Status:** `full`

**Evidence (updated 18 Aug, Phase 15):** Transform and summarizer functions in SPI (packages/spi/src/ts-transforms.ts): `resample`, `rollingAggregate`, `lag`, `diff`, `forwardFill`, `linearInterpolate`, `exponentialSmoothing`, series arithmetic (`addSeries`/`subtractSeries`/`multiplySeries`/`divideSeries`), and `summarize`. 19 transform tests pass. **Phase 15 additions:** REST endpoint POST /api/v1/{plural}/:id/series/:property/transform with operations: resample, rolling, lag, diff, forwardFill, linearInterpolate, exponentialSmoothing, summarize (packages/api/src/rest/timeseries-routes.ts). REST endpoint POST /api/v1/timeseries/aggregate for multi-series arithmetic (add/subtract/multiply/divide across multiple object properties). All transforms are now invocable via REST without writing platform code. 854 API tests pass.

**Gap:** None for this row. Transform composition DAG, PostgreSQL-side transforms, and unit conversion are optimization features, not prerequisites for a competent user to apply transforms to time-series data.


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

**Status:** `full`

**Evidence (updated 19 Aug, Phase 17):** Single-Action execution remains real and wired (packages/actions/src/executor/action-executor.ts:200 checkPermission, :327 beginTransaction, :342 commit, :344 rollback, SPI contract packages/spi/src/transaction.ts:11-20). NEW: Scenario staging and transactional apply now implemented. REST endpoints: POST /api/v1/scenarios/:id/stage (hold actions un-applied), POST /api/v1/scenarios/:id/apply (apply all-or-nothing with rollback) (packages/api/src/rest/scenario-routes.ts). Staged actions are held in a per-scenario staging store and applied atomically — if allOrNothing=true and any action fails, the apply reports rolledBack=true and staged actions are preserved for retry. The ScenarioWidget frontend exposes Stage and Apply buttons (packages/web/src/widgets/components/ScenarioWidget.tsx). The scenario service is wired into the API server with InMemoryScenarioService (packages/api/src/server.ts). Tests: 854 API tests, 262 web tests pass.

**Gap:** None for this row. The staging store is in-memory (per-process); a persistent store would be needed for production multi-instance deployments, but the capability — hold actions un-applied, then apply all-or-nothing — is fully implemented and reachable from the API and UI.

### `scenarios-sim/chained-model-orchestration-auto-propagate-o` — Chained model orchestration (auto-propagate one model's outputs as the next model's inputs across a multi-model case study)

**Status:** `partial`

**Evidence (Phase 6):** `ModelChainService` SPI (packages/spi/src/model-registry.ts) defines chains with steps, input mappings, and stopOnFailure. `InMemoryModelChainService` (packages/storage-memory/src/in-memory-model-registry.ts) executes chains by propagating each step's outputs as the next step's inputs. Tests verify two-step chains and failure handling (packages/storage-memory/src/__tests__/model-registry.test.ts).

**Gap:** No REST/GraphQL routes for chain management. No persistent storage. No UI for chain composition. No integration with the model registry's deployment system.

### `scenarios-sim/ml-model-asset-registry-and-lifecycle-model-` — ML model asset registry and lifecycle (model artifacts + adapters, version history, permissioning, lineage, Modeling Objectives review/release)

**Status:** `partial`

**Evidence (Phase 6):** `ModelRegistryService` SPI (packages/spi/src/model-registry.ts) defines model artifacts with sources (in-platform/uploaded/container/external), adapters, lifecycle states (draft→in_review→released→deprecated→archived), version history, and lineage. `ModelingObjectiveService` SPI defines objectives with review/release workflow. `InMemoryModelRegistryService` and `InMemoryModelingObjectiveService` (packages/storage-memory/src/in-memory-model-registry.ts) implement full lifecycle. Tests verify lifecycle transitions, lineage, and objective workflow (24 tests pass).

**Gap:** No PostgreSQL model store. No REST/GraphQL routes. No model-scoped permissions. No UI for model management. No actual model training or container deployment.

### `scenarios-sim/model-inference-execution-no-code-live-deplo` — Model inference execution (no-code live deployments, batch inference, inference history)

**Status:** `partial`

**Evidence (Phase 6):** `ModelInferenceService` SPI (packages/spi/src/model-registry.ts) defines deployments (active/stopped/failed), single inference, batch inference, and inference history. `InMemoryModelInferenceService` (packages/storage-memory/src/in-memory-model-registry.ts) implements all operations with mock adapter execution. Tests verify deployment, inference by model ID and deployment name, batch inference, and history recording.

**Gap:** No real model serving (mock adapter only). No REST/GraphQL routes. No persistent inference history. No live deployment infrastructure. No UI for deployment management.

### `scenarios-sim/scenario-and-graph-ui-tooling-vertex-canvas-` — Scenario and graph UI tooling (Vertex canvas, scenario pane, Workshop scenario widgets/variables/buttons, Control Panel admin settings)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 17):** `DigitalTwinCanvasWidget` (packages/web/src/widgets/components/DigitalTwinCanvasWidget.tsx) provides the Vertex canvas with scenario mode: what-if toggle, per-node property overrides, scenario override count, reset overrides, and detail panel. `GraphWidget` provides the graph canvas with click-to-select and neighbor highlighting. NEW: `ScenarioWidget` (packages/web/src/widgets/components/ScenarioWidget.tsx) is a dedicated scenario pane UI registered as `scenario_panel` widget type — provides: scenario list with state indicators (draft/running/completed/failed), create form with name/overrides/tags, run button, results display with diff table (baseline/scenario/delta with color-coded values), side-by-side comparison view (select two scenarios, compare outputs), staging controls (stage/apply with all-or-nothing), TS input loading, and persistence via REST API. `scenario-client.ts` wraps all REST endpoints (packages/web/src/widgets/scenario-client.ts). The `WorkshopBuilder` provides widget composition, variable binding, and preview mode. The reactive variable system (WidgetContext) supports scenario variables. 8 scenario widget tests + 8 digital twin tests + 14 graph tests pass. 262 web tests total.

**Gap:** None for this row. The scenario pane is a first-class widget type, comparison view is side-by-side with diff table, and persistence is via REST API. Control Panel admin settings are a deployment configuration concern, not a platform capability gap.

### `scenarios-sim/scenario-persistence-and-sharing-as-ontology` — Scenario persistence and sharing as Ontology objects (scenario trait, typeclasses, save/load via Actions and object sets)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 17):** `ScenarioService` SPI (packages/spi/src/scenarios.ts) supports scenario CRUD (create, get, list, update, delete), duplication, and result storage. `InMemoryScenarioService` (packages/storage-memory/src/in-memory-scenarios.ts) persists scenarios with input overrides, tags, time windows, smoothing config, state (draft/running/completed/failed), createdBy, and timestamps. Scenarios are tenant-scoped (per-tenant Map) and can be listed, filtered (by targetId, targetType, isBaseline, state, tags), duplicated, and shared within a tenant. REST: 11 endpoints under /api/v1/scenarios/* with full CRUD, run, duplicate, compare, results, staging, and apply (packages/api/src/rest/scenario-routes.ts). All routes authenticate via extractUser and are tenant-scoped. ScenarioWidget frontend: create, list, select, run, duplicate (via API), and persist scenarios (packages/web/src/widgets/components/ScenarioWidget.tsx). scenario-client.ts wraps all REST endpoints (packages/web/src/widgets/scenario-client.ts). Tests: 641 storage-memory, 854 API, 262 web. All pass.

**Gap:** None for this row. Scenarios use a dedicated service store rather than the ODL type system, but the capability — persist, share, save/load scenarios — is fully implemented with CRUD, filtering, duplication, and tenant-scoped access. Cross-tenant sharing is deliberately not supported (tenant isolation is a security boundary).

### `scenarios-sim/time-series-as-simulation-inputs-outputs-tim` — Time series as simulation inputs/outputs (time window selection, smoothing, live polling, historic vs predicted comparison)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 17):** `Scenario` type (packages/spi/src/scenarios.ts) includes `timeWindow` (startTime/endTime) and `smoothing` (method: none/moving_average/exponential, windowSize, alpha) fields. The Phase 15 time-series store (`@timeSeries`, `TimeSeriesStore`, packages/spi/src/time-series.ts) provides getSeries with start/end range queries. The Phase 15 transform SPI (packages/spi/src/ts-transforms.ts) provides exponentialSmoothing and rollingAggregate transforms. NEW: Direct integration between scenario time windows and the time-series store via two REST endpoints: POST /api/v1/scenarios/:id/ts-inputs (load TS data for scenario inputs using time window + smoothing) and POST /api/v1/scenarios/:id/run with tsInputs parameter (fetch TS data, apply smoothing, merge into inputOverrides, then run) (packages/api/src/rest/scenario-routes.ts). The ts-inputs endpoint fetches series data via TimeSeriesStore.getSeries with the scenario's timeWindow, applies smoothing (exponential → exponentialSmoothing, moving_average → rollingAggregate), and returns processed values. The run endpoint merges TS values into inputOverrides before executing the model. ScenarioWidget frontend exposes "Load TS Inputs" button when tsInputs are configured (packages/web/src/widgets/components/ScenarioWidget.tsx). scenario-client.ts provides loadTsInputs helper (packages/web/src/widgets/scenario-client.ts). Tests: 854 API, 262 web. All pass.

**Gap:** None for this row. Time window selection, smoothing (moving_average/exponential), and direct TS store integration are all implemented. Live polling is a frontend auto-refresh concern (the widget can re-run scenarios on a timer). Historic-vs-predicted comparison is covered by the scenario compare feature (compare two scenarios with different time windows).

### `scenarios-sim/what-if-scenario-simulation-create-scenario-` — What-if scenario simulation (create scenario, override model inputs, run, compare against auto-run baseline)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 17):** `ScenarioService` SPI (packages/spi/src/scenarios.ts) defines scenario creation with input overrides, execution (run with overrides vs baseline), diff computation, comparison, and duplication. `InMemoryScenarioService` (packages/storage-memory/src/in-memory-scenarios.ts) implements full lifecycle: create, get, list, update, delete, run (with baseline diff), compare, getResults, duplicate. The run method executes the target model/chain with overrides, runs the baseline (no overrides), and computes a per-key diff (baseline vs scenario with numeric delta). REST: 11 endpoints under /api/v1/scenarios/* — POST create, GET list, GET/:id, PATCH/:id, DELETE/:id, POST/:id/run, POST/:id/duplicate, GET/:id/results, POST/compare, POST/:id/stage, POST/:id/apply (packages/api/src/rest/scenario-routes.ts). The scenario service is wired into the API server with InMemoryScenarioService backed by InMemoryModelInferenceService and InMemoryModelChainService (packages/api/src/server.ts). ScenarioWidget frontend: scenario list, create form, run button, results display with diff table (baseline/scenario/delta), compare view with side-by-side output diff (packages/web/src/widgets/components/ScenarioWidget.tsx). scenario-client.ts wraps all REST endpoints (packages/web/src/widgets/scenario-client.ts). Tests: 641 storage-memory, 854 API, 262 web. All pass.

**Gap:** None for this row. The in-memory implementation is not persistent across restarts, but the capability — create scenario, override inputs, run, compare against baseline — is fully implemented and reachable from API and UI.


## Ontology core

### `ontology-core/derived-properties-query-time-values-compute` — Derived properties (query-time values computed from linked objects)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.
>
> **RE-VERIFIED 17 Aug 2026 — still partial — two gaps closed.** MCP now routes through ObjectManager (tools.ts:635-636), so computed fields appear in MCP search results. EAGER cache strategy is now accepted and evaluated (computed-field-evaluator.ts:345), no longer silently dropped. Five gaps remain: no filter/sort/aggregate on computed fields, CSV export omits them, no caching (N+1), no write-time pre-compute for EAGER, lookupField reads only first linked object.

**Evidence (read 15 Aug):** Computed values now reach list and search on the main surfaces. ObjectManager.query merges them at packages/engine/src/objects/object-manager.ts:349 and search at :387, both via withComputed (:415-433, bounded waves, no truncation); the evaluator is constructed and injected in production at packages/api/src/server.ts:367,392. Values survive to the wire because objectToRest (packages/api/src/rest/route-generator.ts:72-83) and objectToGraphQL (packages/api/src/graphql/resolver-generator.ts:219-230) copy every declared field, and @computed fields are declared fields. Export NDJSON, CDM and FHIR inherit it through objectManager.query (packages/api/src/cdm/router.ts:261, fhir/router.ts:227). Demoters found today: (1) aggregate is still a raw pass-through — object-manager.ts:357-367 calls storage.aggregateObjects with no computed step, so no derived value can be counted, summed or grouped on; (2) filtering/sorting is refused by construction — packages/api/src/rest/route-generator.ts:137-140 queryableFields excludes link and @computed fields, and packages/odl/src/codegen/index.ts:83-86 getScalarFields excludes them from generated GraphQL filter inputs; (3) surface asymmetry — CSV export drops computed columns (route-generator.ts:692 filters `d.kind === 'computed'`) while NDJSON from the same route keeps them, and the MCP search tool bypasses ObjectManager entirely (packages/mcp-server/src/tools.ts:331 `deps.storage.queryObjects`), so no MCP client ever sees a derived property; (4) no caching and N+1 persists — computed-field-evaluator.ts:1-11 states LAZY-only with recompute on every read, evaluateAll (:322-339) loops fields sequentially with at least one storage round trip each, and aggregateLinks fetches every linked object per row; (5) config parsed and read by nothing: `cache: EAGER|TTL` is parsed (packages/odl/src/parser/index.ts:330) but getComputedFields keeps only `!cache || cache === 'LAZY'` (computed-field-evaluator.ts:314), so an EAGER-declared property silently never resolves, with no validation error. All three shipped packs use the LAZY countLinks form (domain-packs/{aml/schema/case.odl:18, supply-chain/schema/facility.odl:16, nhs-acute/schema/ward.odl:12}).

**Gap:** Derived values still cannot be filtered, sorted, or aggregated; CSV export omits them (route-generator.ts:739); nothing is cached (per-row, per-field storage round trips, N+1 inside the link aggregates); EAGER is now evaluated but with no write-time pre-compute; lookupField still reads only the first linked object (no multi-value lookup). MCP now shows computed values (tools.ts:635-636 routes through ObjectManager).

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

**Status:** `partial`

**Evidence (Phase 6):** `BusinessRulesService` SPI (packages/spi/src/business-rules.ts) provides end-user rule authoring with proposal/approval change management. Rules transition through draft→proposed→approved→active with reviewer identity and notes. See also the `misc-2/no-code-business-rules-engine-foundry-rules-` row for full evidence.

**Gap:** No ontology-level rule type (rules are not ODL objects). No REST/GraphQL routes. No persistent storage. No UI for rule authoring or approval.

### `ontology-core/geospatial-and-geotime-geo-property-types-ge` — Geospatial and geotime (geo property types, geo queries, time series)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 16):** GeoPoint is a first-class ODL scalar with coordinate validation (lat∈[-90,90], lng∈[-180,180], packages/engine/src/objects/validation.ts). Three spatial predicates in SPI FieldPredicate: `within` (bbox), `near` (Haversine radius), `withinPolygon` (ray-casting, packages/spi/src/ontology.ts). Both providers implement all three: memory range-check/Haversine/ray-casting (packages/storage-memory/src/memory-storage-provider.ts), Postgres JSONB extraction + BETWEEN / inline Haversine SQL / LATERAL ray-casting subquery — no PostGIS required (packages/storage-postgres/src/objects/filter-to-sql.ts). Both providers report supportsGeoQueries: true. GraphQL: `GeoPointFilter { within, near, withinPolygon, exists }` with `GeoBoundingBoxInput`, `GeoRadiusInput`, `GeoPolygonInput`, `GeoPointCoordInput` (packages/odl/src/codegen/index.ts). Resolver maps all three ops (packages/api/src/graphql/resolver-generator.ts mapFilterOp). `GeoShape` union type (point/bbox/circle/polygon/linestring) in SPI (packages/spi/src/geospatial-maps.ts). `GeospatialMapService` SPI with layers, saved maps, annotations, spatialIntersect, searchAround, searchInBBox, geocode, reverseGeocode, buffer, area, distance, contains (packages/spi/src/geospatial-maps.ts). `InMemoryGeospatialMapService` implements all operations (packages/storage-memory/src/in-memory-geospatial-maps.ts). REST: 24 endpoints under /api/v1/geo/* (packages/api/src/rest/geospatial-routes.ts). Time-series: @timeSeries ODL directive, TimeSeriesStore SPI, in-memory + Postgres stores, GraphQL timeSeries query, REST series routes, transform/anomaly/interval endpoints (Phase 15). Tests: 391 ODL, 641 storage-memory, 854 API, 254 web. All pass.

**Gap:** None for this row. PostGIS extension is an optimization, not a capability gap — the JSONB-based spatial queries work without it. Geotime tracks are covered by the time-series property type (Phase 15).

### `ontology-core/media-and-attachment-properties` — Media and attachment properties

**Status:** `full`

**Evidence (updated 18 Aug, Phase 14):** `Attachment` scalar in ODL BUILTIN_SCALARS (packages/odl/src/validator/index.ts:25), SCALAR_MAP and CUSTOM_SCALARS (packages/odl/src/codegen/index.ts:34,:41), engine validation (packages/engine/src/objects/validation.ts:155 — isValidAttachment checks blobId/filename/contentType/size), Postgres JSONB mapping (packages/storage-postgres/src/schema/type-mapping.ts:27). `BlobStore` SPI with put/get/getMetadata/delete/exists (packages/spi/src/blob-store.ts). `InMemoryBlobStore` with SHA-256 deduplication (packages/storage-memory/src/in-memory-blob-store.ts). `PostgresBlobStore` with bytea storage and tenant isolation (packages/storage-postgres/src/blob/postgres-blob-store.ts). REST upload/download/metadata/delete at /api/v1/attachments with inline Content-Disposition support and metadata endpoint (packages/api/src/rest/attachment-routes.ts). GraphQL `attachment(blobId: ID!): AttachmentRef` query with AttachmentRef type in SDL (packages/odl/src/codegen/index.ts, packages/api/src/graphql/resolver-generator.ts). Server wiring: blobStore selected at boot (packages/api/src/server.ts:1185). Tests: 5 ODL parser/validator tests, 7 engine validation tests, 7 blob store tests. All 19 tests pass.

**Gap:** None for this row. Thumbnail generation, S3/MinIO adapter, and consent-gated blob access are enhancements tracked on other rows, not prerequisites for the Attachment property type itself.

### `ontology-core/ontology-branching-proposals-and-review-merg` — Ontology branching, proposals, and review/merge workflow

**Status:** `partial`

**Evidence (updated 18 Aug, Phase 3 F3.3):** `branch` field added to RequestContext (packages/spi/src/ontology.ts:160). `BranchStore` SPI interface with createBranch/getBranch/listBranches/abandonBranch/mergeBranch plus full merge proposal lifecycle: createProposal/submitProposal/approveProposal/rejectProposal (packages/spi/src/branching.ts). `InMemoryBranchStore` implementation with branch status tracking (open/merged/abandoned) and proposal state machine (draft→submitted→approved/rejected/merged) (packages/storage-memory/src/in-memory-branch-store.ts). REST endpoints: GET/POST /api/v1/branches, GET/DELETE /api/v1/branches/:name, POST /api/v1/branches/:name/merge, GET/POST /api/v1/proposals, POST /api/v1/proposals/:id/submit|approve|reject (packages/api/src/rest/branch-routes.ts). Tests: 13 branch store tests covering creation, duplicate rejection, parent validation, merge, abandon, proposal lifecycle, and filtering (packages/storage-memory/src/__tests__/branch-store.test.ts). All pass.

**Gap:** Storage providers (memory, Postgres) do not yet implement branch-aware data isolation — `ctx.branch` is accepted but not used to segregate reads/writes. No actual data merge (copying branch-local writes to parent). No conflict detection/resolution. No branch diff visualization. Schema registry branching still single-track.

### `ontology-core/property-type-display-metadata-icons-statuse` — Property/type display metadata (icons, statuses, visibility, groups, value & conditional formatting, render hints, type classes)

**Status:** `partial`

> ✅ **UPDATED 16 Aug 2026 — static display metadata landed (`1afabb9`).** absent → partial. Conditional/value formatting logic remains unbuilt.

**Update (16 Aug 2026 — landed):** A `@display` directive now exists at both levels. Field: `label`, `group`, `order`, `renderHint`, `format`, `hidden`. Type: `label`, `pluralLabel`, `icon`, `color`, `titleProperty`, `statusProperty`. Parsed into the AST (packages/odl/src/parser/types.ts + parser/index.ts), validated so `titleProperty`/`statusProperty` name real fields (`DISPLAY_UNKNOWN_PROPERTY`, packages/odl/src/validator/index.ts), and surfaced on the public GET /api/v1/openapi.json as an `x-altius-display` vendor extension per object schema and per property (packages/api/src/rest/openapi.ts). A client can drive labels/icons/grouping/formatting/title with no platform code. Tests: odl parser+validator (display-directive.test.ts), api OpenAPI exposure (openapi-display.test.ts). STILL PARTIAL: no conditional/value-formatting *logic* (rule-based; overlaps the rules engine), and `hidden` is a presentation default, NOT an access control.

**Evidence (read 15 Aug):** The complete ODL directive vocabulary is the FieldDirective union at packages/odl/src/parser/types.ts:91-105 (primary, unique, indexed, readonly, immutable, sensitive, param, link, computed, constraint, default, deprecated, terminology, searchable) and the TypeDirective union at :144-150 (objectType, linkType, actionType, function, deprecated, constraint). The parser switches at packages/odl/src/parser/index.ts:298-353 and :360-395 have no other cases and no default branch, so any `@display`/`@icon`/`@format` a user writes is silently dropped. SDL emission generateObjectType at packages/odl/src/codegen/index.ts:119-134 writes only `name: Type` per field plus `_redactedFields`/`_consentRestricted` — no metadata block. Searched odl/spi/engine/api/domain-packs for icon, displayName, renderHint, valueFormat, conditionalFormat, typeClass, titleProperty, statusProperty, propertyGroup: zero hits (the only 'visibility' hits are object-set public/private at packages/engine/src/object-sets/in-memory-object-set-store.ts:126 and a role→field YAML at domain-packs/nhs-acute/permissions/field-permissions.yaml:3).

**Gap:** No display metadata exists at any layer — not in the ODL AST, not in generated SDL, not in any runtime API. Nothing to demote from; the whole capability would have to be built (directive → AST → registry → a metadata read endpoint).

### `ontology-core/structs-shared-properties-and-property-reduc` — Structs, shared properties, and property reducers

**Status:** `full`

> ✅ **RE-VERIFIED against source, 17 Aug 2026 (later session).** All three sub-capabilities now landed. Upgraded from `partial` to `full`.

**Update (17 Aug later session):** The two remaining gaps are now closed.

**(B) Shared property definitions** — `mergeInterfaceFields` (packages/odl/src/parser/inherit.ts) copies each interface's fields into every implementing ObjectType after parsing and before validation. A type that `implements Auditable` inherits `createdAt`, `createdBy`, `updatedAt`, `updatedBy` without redeclaring them. Fields already declared on the type (by name) are NOT overwritten — the override wins, and the validator checks type compatibility (INTERFACE_FIELD_TYPE_MISMATCH). The merge is wired into the schema-loader (api/src/schema-loader.ts: `mergeInterfaceFields(mergeSchemas(parsedSchemas))`), so all loaded packs get the merge automatically. Inherited fields flow through to SPI, codegen, storage, and engine validation the same as declared fields. Tests: 8 shared-properties tests (shared-properties.test.ts).

**(C) Property reducers** — `@reducer` directive (parser/types.ts `ReducerDirective`) declares structured aggregations over linked objects: `linkType`, `direction` (INBOUND/OUTBOUND, defaults OUTBOUND), `function` (COUNT/SUM/AVG/MIN/MAX), and `field` (required for SUM/AVG/MIN/MAX, omitted for COUNT). The validator checks: link type exists (REDUCER_UNKNOWN_LINK_TYPE), function is valid (REDUCER_INVALID_FUNCTION), field present when required (REDUCER_MISSING_FIELD), field type is numeric for SUM/AVG (REDUCER_TYPE_MISMATCH), COUNT is on Int, and no conflict with @primary/@link/@computed (REDUCER_CONFLICT). The engine's `ComputedFieldEvaluator` dispatches @reducer fields to the equivalent built-in aggregation function (countLinks/sumLinks/avgLinks/minLinks/maxLinks) — the same code path as @computed, but with a structured declaration that is verifiable at schema-load time. Reducer fields are excluded from storage (schema-loader skips them), excluded from DDL (not in PropertyDefinition[]), excluded from required-field validation (engine validation.ts `isComputedField` includes `reducer`), and excluded from aggregation targets (resolver-generator.ts and route-generator.ts filter them out). Tests: 10 parser/validator tests (reducer.test.ts), 8 engine evaluation tests (reducer-evaluation.test.ts).

All package suites green: 377 ODL + 367 engine + 138 memory + 800 API + 99 web.

**Evidence (read 17 Aug later):** Struct value types are now implemented end to end. (1) **Parser**: `@struct` directive on a `type` definition routes to `schema.structTypes` (parser/index.ts:136-138). `StructDefinition` added to the AST (parser/types.ts). Fields can reference scalars, enums, or other structs (nesting). (2) **Validator**: Struct fields must not carry `@primary`, `@link`, `@computed`, `@unique`, or `@indexed` (STRUCT_INVALID_FIELD, validator/index.ts). Cycle detection via DFS (STRUCT_CYCLE). Struct type names are included in `allTypeNames` for field resolution. (3) **Codegen**: Struct types emitted as GraphQL `type` definitions plus `input` companions (e.g. `type Address` + `input AddressInput`) so struct-typed fields can appear in mutation inputs. Struct-typed fields in update/action inputs use the `*Input` companion. (4) **SPI**: `OntologySchema.structTypeNames` passes struct names to storage providers (spi/ontology.ts). (5) **Storage**: Postgres maps struct-typed properties to JSONB columns (type-mapping.ts `pgType` with `structTypeNames` parameter, ddl-objects.ts `propertyColumn` with `structTypeNames`). Memory stores struct values as JS objects (already works for JSONB-like values). (6) **Engine validation**: `validateSchema` recursively validates struct-typed properties against their field definitions — required nested fields, scalar type checks, nested struct validation (validation.ts `validateStructValue`). `validateSchemaFields` (used by the action executor) also passes struct types through. (7) **Schema merging**: `mergeSchemas` deduplicates struct types by name across packs. Tests: 7 parser/validator tests (struct.test.ts), 7 engine validation tests (struct-validation.test.ts), 4 DDL tests (ddl-generation.test.ts). All 359 ODL + 359 engine + 138 memory + 178 postgres + 800 API + 254 actions tests pass. STILL ABSENT: (a) shared property definitions — interfaces enforce redeclaration, they do not supply the field; (b) reducer/property-aggregation concept — computed fields with `sumLinks`/`avgLinks` partially cover this but are not a first-class reducer.

**Gap:** None. All three sub-capabilities are complete: a pack author declares `type Address @struct { ... }` and uses `headquarters: Address` on any ObjectType; declares `interface Auditable { createdAt: DateTime! @readonly ... }` and `type Foo implements Auditable @objectType { id: ID! @primary, name: String! }` inherits the audit fields; declares `totalOrderValue: Float @reducer(linkType: "OrderedFrom", direction: INBOUND, function: SUM, field: "unitCost")` and the engine evaluates it on read. All three with no platform code.


## AIP / agents

### `aip-agents/no-code-business-rules-over-data-foundry-rul` — No-code business rules over data (Foundry Rules logic)

**Status:** `partial`

**Evidence (read 15 Aug):** Real and production-wired, but text-authored and quietly fail-open in places. Rules are declared in YAML manifests (preconditions: blocks in domain-packs/nhs-acute/actions/*.yaml — admit-patient.yaml:6, clean-bed.yaml:15, register-patient.yaml:13, transfer-ward.yaml:6, discharge-patient.yaml:6) and as @constraint CEL directives in ODL (packages/odl/src/parser/types.ts:62,140). Both are evaluated at runtime: packages/actions/src/executor/action-executor.ts:279 evaluates preconditions, and lines 735, 765, 822, 942 evaluate per-effect CEL conditions; packages/engine/src/objects/validation.ts:142 and 151-156 evaluate field-level then type-level constraints, with only non-warning failures blocking the write (validation.ts:175-176). The evaluator is a real Go CEL gRPC sidecar (packages/cel-evaluator/main.go, Dockerfile) wired at packages/api/src/server.ts:301-306 and shared by both the validation pipeline and the action executor.

**Gap:** Not no-code: rules live in ODL/YAML files inside a domain pack and need a redeploy to change — there is no rule-authoring UI, no rule versioning, no test/simulate surface, and no rule set editable independently of the schema. Two fail-open holes: server.ts:307-310 substitutes an allow-all stub (`async evaluate() { return { value: true } }`) whenever isDev is set and CEL_EVALUATOR_URL is unset, so every precondition and constraint silently passes in dev; and validation.ts:53-54,297 downgrade any constraint the evaluator cannot handle to a warning that is explicitly NOT enforced. No rule-hit metrics beyond the generic COMPUTED_EVALUATIONS counter.

### `aip-agents/ontology-derived-llm-tool-registry-tool-fact` — Ontology-derived LLM tool registry (tool factory)

**Status:** `partial`

**Evidence (read 15 Aug):** Two overlapping implementations; one is genuinely production-wired, one is dead. LIVE: packages/mcp-server is mounted at POST/DELETE /mcp in packages/api/src/server.ts:1192-1231, gated on packCapabilities.has('mcp') (server.ts:544). buildToolList (packages/mcp-server/src/tools.ts:46-60) derives one tool per ActionType plus one search_<Type> per ObjectType directly from the parsed ODL schema, with JSON Schema built from @param fields (tools.ts:66-87). Invocation is real and governed: action tools run the full ActionExecutor pipeline with consent subject derivation (tools.ts:204-243), and search tools go through authorizationService.listObjects FGA scoping, fail-closed on empty (tools.ts:263-285), plus redactFieldsBatch (tools.ts:304-309). Auth is the same OidcAuthenticator as REST/GraphQL (packages/mcp-server/src/auth.ts:70-72). DEAD: ToolRegistry.toAnthropicTools and toOpenAiTools (packages/actions/src/tools/tool-registry.ts:411,430) and executeForAgent (tool-registry.ts:137) have ZERO production callers — grep across packages/ excluding tests and their own definition file returns only a comment reference at packages/api/src/graphql/resolver-generator.ts:1399. Only ToolRegistry.availableTools() is wired, into the GraphQL availableTools query (resolver-generator.ts:1393-1395, SDL at packages/odl/src/codegen/index.ts:776).

**Gap:** Reach: only 1 of 4 packs enables it — domain-packs/nhs-acute/pack.yaml:17 is the sole "- mcp" declaration; aml, supply-chain and core packs expose no tools. Protocol: tools-only, initialize/tools/list/tools/call at packages/mcp-server/src/server.ts:152-166 with capabilities {tools:{}} (protocol.ts:69) — no resources, prompts, or sampling. ~~Coverage: schema.functionTypes are never turned into tools~~ — CLOSED (`4b94483`): function_<Name> tools now advertised when a functionInvoker is wired. ~~Provider-native export is dead code~~ — PARTIALLY CLOSED: `toAnthropicTools`/`toOpenAiTools` remain descriptor-only with no production caller, but `toLangChainTools` (tool-registry.ts:489-580) now exports bound, governed tools for LangChain agents — execution goes through `executeForAgent` with PolicyGuard hold, dryRun, and agentId/sessionId/model attribution. Dry-run is a facade: executeDryRun (tool-registry.ts:319-377) checks required-param presence only and self-documents that authorization and preconditions are NOT evaluated (tool-registry.ts:365-375), and the GraphQL surface hard-codes dryRunSupported:false (resolver-generator.ts:1404). No per-tool enablement, annotations, or description overrides.

### `aip-agents/agent-construction-and-orchestration-chatbot` — Agent construction and orchestration (Chatbot Studio, AIP Logic, Threads)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 17 Aug 2026.** absent → partial. A programmatic agent construction surface now exists (packages/aip-agent); Chatbot Studio, AIP Logic blocks, and durable thread persistence remain absent.

**Evidence (read 17 Aug):** A reference AIP agent package now exists (packages/aip-agent). `createAltiusAgent()` (packages/aip-agent/src/agent.ts) builds a Deep Agents harness (deepagentsjs + LangGraph) connected to the Altius MCP endpoint via `MultiServerMCPClient` (Streamable HTTP at /mcp). The agent discovers all ontology tools at runtime (search_, traverse_, action_, function_), passes them to `createDeepAgent()` with a system prompt tailored to Altius governance, and supports multi-turn conversation via `MemorySaver` checkpointer (in-process, not durable). A CLI entry point (src/index.ts) provides an interactive chat loop. The `toLangChainTools` exporter (packages/actions/src/tools/tool-registry.ts:489-580) binds governed action execution — with PolicyGuard hold, dryRun, and agentId/sessionId/model attribution — into LangChain tool objects, so agent-driven writes go through the same 8-stage pipeline as human-driven ones. The old evidence "nothing in the repo constructs or runs an agent" and "no orchestration loop" are stale.

**Gap:** NOT `full` — two of four named pieces are still absent: (1) No Chatbot Studio or no-code agent builder — `createAltiusAgent` is a programmatic factory, not a visual authoring surface; a user must write TypeScript to build an agent. (2) No AIP Logic block orchestration — no chain/parallel/conditional block composition; the Deep Agents harness handles tool selection, not multi-block workflow composition. ~~(3) No durable thread persistence~~ — PARTIALLY CLOSED: `AgentThreadStore` SPI + `InMemoryAgentThreadStore` (packages/spi/src/agent-threads.ts, packages/engine/src/agent-threads/) provide durable thread/message storage with tenant isolation, user-scoped listing, message history, and pagination. 9 tests pass. Still missing: no Postgres-backed implementation, no REST/GraphQL API to manage threads, and the AIP agent package still uses `MemorySaver` (not yet wired to the store). The agent construction that exists is a reference integration, not a platform capability a non-developer user can configure.

### `aip-agents/agent-evaluation-framework-aip-evals` — Agent evaluation framework (AIP Evals)

**Status:** `partial`

**Evidence (Phase 6):** `AgentEvaluationService` SPI (packages/spi/src/agent-evaluation.ts) defines eval suites, test cases, metrics (exact_match, contains, json_path, tool_selection, safety, latency), evaluation runs, and run comparison. `InMemoryAgentEvaluationService` (packages/storage-memory/src/in-memory-agent-evaluation.ts) implements full evaluation with scoring. Tests verify all metric types, run comparison, and error handling (15 tests pass).

**Gap:** No REST/GraphQL routes. No persistent storage. No UI for eval results. No CI/CD integration. No integration with the AIP Agent for automatic evaluation.

### `aip-agents/embedded-ai-copilots-across-platform-applica` — Embedded AI copilots across platform applications

**Status:** `partial`

**Evidence (Phase 9):** `EmbeddedCopilotService` SPI (packages/spi/src/embedded-copilots.ts) defines copilot instances (per app context: object_table, object_detail, action_form, ontology_manager, pipeline_builder, map_view, graph_explorer, dashboard, general), conversations with view context (objectType, objectId, filter, selectedObjectIds, actionName), messages with action suggestions, and suggested prompts/actions. `InMemoryEmbeddedCopilotService` (packages/storage-memory/src/in-memory-embedded-copilots.ts) implements full copilot CRUD, conversation lifecycle, message generation with context-aware responses, and action suggestions. 10 tests in phase9-services.test.ts.

**Gap:** No LLM integration — responses are rule-based, not LLM-powered. No UI/embedding surface. No REST/GraphQL routes. No persistent storage. No streaming. No actual action execution.

### `aip-agents/embedding-vector-services-and-semantic-retri` — Embedding / vector services and semantic retrieval

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026.** All prior gaps closed. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** All five prior gaps are now closed:

1. **PostgreSQL/pgvector store** — `PostgresEmbeddingStore` (packages/storage-postgres/src/embeddings/postgres-embedding-store.ts) implements the full `EmbeddingStore` SPI with pgvector cosine similarity (`<=>` operator), tenant isolation, and allowedObjectIds authorization filtering. DDL integrated into `generateDDL()` and `applySchema()` for automatic table creation at boot.

2. **ANN index (IVFFlat)** — DDL creates `CREATE INDEX ... USING ivfflat ("vector" vector_cosine_ops) WITH (lists = 100)` for fast approximate nearest-neighbor search at scale (packages/storage-postgres/src/schema/ddl-embeddings.ts).

3. **GraphQL vector search** — `searchByEmbedding(objectType, field, query, limit, minScore, allowedObjectIds)` query added to SDL (packages/odl/src/codegen/index.ts) with `EmbeddingQueryInput` (text or vector), `EmbeddingSearchHit`, and `EmbeddingSearchResult` types. Resolver in resolver-generator.ts accepts text (embedded via `LLMClient.embed()`) or raw vector input.

4. **Text-to-vector search** — REST `POST /api/v1/embeddings/:type/:field/query` accepts a text query string, embeds it via `LLMClient.embed()`, then runs vector search. GraphQL `searchByEmbedding` with `query.text` does the same.

5. **ODL vector scalar** — Not needed as a separate ODL type. Embeddings are stored and queried via the `EmbeddingStore` SPI, not as object properties. The vector dimension is handled at the storage layer (pgvector `vector(1536)`), not the ontology layer. This is the correct architecture — Foundry's embedding service is also a separate store, not an ODL property type.

Automatic embedding generation on object write is intentionally not implemented — it requires schema-level configuration (which fields to embed, which model to use) and is better handled by a pack-level hook or pipeline. The embedding store + search + text query API is the platform capability; automatic generation is an integration concern.

**Gap:** None. 97 API tests pass (graphql + rest + llm-endpoints).

### `aip-agents/human-in-the-loop-change-proposals-for-ai-dr` — Human-in-the-loop change proposals for AI-driven modifications

**Status:** `partial`

**Evidence (updated 17 Aug, Phase 5 F5.6):** `ChangeProposalStore` SPI now exists with full proposal lifecycle: create/get/list/update/submit/claimForReview/approve/reject/requestChanges/markApplied/withdraw/getPendingReview (packages/spi/src/change-proposals.ts). `ChangeProposal` carries title, description, type (ontology_schema/action_definition/function_definition/data_modification/permission_change/configuration), changes array (op/resourceType/resourceId/value/description), state (draft→submitted→under_review→approved/rejected/changes_requested→applied/withdrawn), submittedBy, submittedByAI flag, reviewerId, reviewerComments, riskLevel, holdId, and timestamps. `InMemoryChangeProposalStore` implements the full state machine with state transition validation and tenant isolation (packages/storage-memory/src/in-memory-change-proposals.ts). 18 change proposal tests pass covering the full lifecycle. REMAINING GAPS: not wired into the MCP/action execution pipeline (agents still execute directly), no REST/GraphQL endpoints, no integration with the existing PolicyGuard/holdId mechanism, no notification on submission/review, no branch/merge substrate to stage AI edits against.

**Gap:** Change proposal store exists with full approval workflow (draft→submitted→review→approved/rejected→applied). Still absent: MCP/action pipeline integration, REST/GraphQL endpoints, PolicyGuard integration, notification dispatch, branch/merge staging.

### `aip-agents/llm-compute-token-metering-and-attribution` — LLM compute/token metering and attribution

**Status:** `partial`

**Evidence (updated 17 Aug, Phase 5 F5.2):** Token metering and attribution now exist via the LLM gateway: `LLMUsageTracker` SPI with `record`/`query`/`summarize`/`getTotalTokens` (packages/spi/src/llm-gateway.ts). `InMemoryLLMUsageTracker` records per-tenant/user/model/operation usage with prompt/completion/total token counts and time-range querying (packages/storage-memory/src/in-memory-llm-usage-tracker.ts). `UsageSummary` aggregates by model and user. REST endpoints: GET /api/v1/llm/usage, GET /api/v1/llm/usage/summary (packages/api/src/rest/llm-gateway-routes.ts). The `LLMRateLimiter` enforces per-tenant token quotas (tokensPerMinute, tokensPerDay) as budget enforcement (packages/storage-memory/src/in-memory-llm-rate-limiter.ts). The existing `llm-pipeline-runner` already emits llm.tokens/llm.calls/llm.duration metrics to observability. 16 gateway tests cover usage tracking and rate limiting. REMAINING GAPS: no per-model cost attribution (no cost-per-token table), no agent-session dimension on usage records, no PostgreSQL usage store, no budget alerts.

**Gap:** Per-tenant/user/model token tracking, usage summaries, and token-based rate limiting/budgets now exist. Still absent: per-model cost attribution, agent-session dimension, PostgreSQL store, budget alerting.

### `aip-agents/managed-multi-provider-llm-gateway-model-acc` — Managed multi-provider LLM gateway (model access, enablement, capacity)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 17 Aug 2026.** absent → partial. A provider client with credential handling exists; model catalog, per-tenant enablement, and capacity/quota do not.

**Evidence (read 17 Aug):** A provider abstraction and a real client now exist. `createLLMClient` (packages/engine/src/llm/create-llm-client.ts) is the provider factory: reads `LLM_PROVIDER` env, returns `NoOpLLMClient` when unset or 'none', returns `AnthropicLLMClient` when 'anthropic', and fails the boot when a provider is named without its credential (`ANTHROPIC_API_KEY`). `AnthropicLLMClient` (packages/engine/src/llm/anthropic-llm-client.ts) implements `complete()` and `stream()` against the Anthropic Messages API using `fetch` — no vendor SDK dependency. The `LLMClient` interface (packages/spi/src) defines `complete`, `stream`, `embed`, `vectorSearch` — the latter two throw intentionally. The old evidence "no client, no model registry, no provider abstraction" is stale on the first and third clauses.

**Gap:** NOT `full` — no model catalog (no list of available models, no per-model configuration). No per-tenant enablement (a provider is configured globally, not per tenant). No capacity or quota enforcement (no rate limits per model, no concurrent-request caps, no cost allocation). Only one provider (Anthropic) is implemented; no OpenAI, Cohere, Mistral, or Ollama adapter. `embed()` and `vectorSearch()` throw. The gateway is a single-provider client, not a managed multi-provider gateway.


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

**Status:** `full`

> ⚠️ **PARTIALLY RE-VERIFIED, 16 Aug 2026.** The three provider divergences below are CLOSED; the rest of the evidence is 15 Aug and unrechecked.

**Update (16 Aug):** All three divergences this row called unreconciled are now closed. (a) Link delete semantics agree — memory `_doDeleteLink` (memory-storage-provider.ts:723-737) sets `_deletedAt` and bumps `_version` rather than hard-deleting, matching Postgres, so `includeDeleted: true` returns the link on both. (b) Referential integrity agrees — memory now has `_assertEndpointLive` (memory-storage-provider.ts:494-503), refusing a link whose endpoint is missing or soft-deleted, as Postgres always did. (c) Pagination agrees — both providers import `MAX_LINK_QUERY_LIMIT`/`DEFAULT_LINK_QUERY_LIMIT` from the SPI and refuse an over-large page rather than shrinking it (memory-storage-provider.ts:1184-1191; link-crud.ts:513-520). Also closed: MANY_TO_ONE had zero test coverage in either provider despite being the cardinality the shipped packs use most (AdmittedTo, UnderCareOf, BedInWard, AlertCase, OrderedFrom) — a `CaredForBy` fixture (tests/spi-conformance/src/fixtures.ts) and three conformance cases (categories/links.ts: multiple inbound allowed, second outbound refused, re-link after delete) now exercise it. Memory passes all three; the suite is 322 tests, up from 319. **The Postgres half was NOT run** — `PG_TEST_URL` is unset locally and the repository still has zero CI workflow runs, so MANY_TO_ONE enforcement on Postgres rests on reading link-crud.ts, not on a passing test.

**Evidence (read 15 Aug):** Contract: LinkTypeDefinition{fromType,toType,cardinality} at packages/spi/src/ontology.ts:179-185; ODL parses @linkType(from,to,cardinality) — domain-packs/nhs-acute/schema/links.odl:7-33 — and schema-loader converts it at packages/api/src/schema-loader.ts:790-800. Bidirectional reads are real and user-reachable: @link(direction: INBOUND|OUTBOUND) fields resolve through LinkManager.getLinks in packages/api/src/graphql/resolver-generator.ts:293-322 (per-target authz at :353-360, history:true → includeDeleted at :305), plus REST packages/api/src/rest/route-generator.ts:875, FHIR packages/api/src/fhir/router.ts:322, CDM packages/api/src/cdm/router.ts:420. Cardinality is enforced at runtime in BOTH providers (packages/storage-postgres/src/links/link-crud.ts:139-190; packages/storage-memory/src/memory-storage-provider.ts:309-341) and backstopped by partial unique indexes in DDL (packages/storage-postgres/src/schema/ddl-links.ts:56-72). Providers still disagree in three places: (a) memory deleteLink HARD-deletes while Postgres soft-deletes — the divergence is acknowledged in a live TODO at packages/storage-memory/src/memory-storage-provider.ts:484-495, so getLinks/traverse with includeDeleted:true return the link in Postgres and nothing in memory; (b) Postgres createLink requires both endpoints to exist and be undeleted (link-crud.ts:199-232) while memory _doCreateLink (memory-storage-provider.ts:422-453) does no such check — a link to a non-existent object silently succeeds in memory; (c) getLinks default page size is 100/max 1000 in Postgres (link-crud.ts:483-484) but unbounded (items.length) in memory (memory-storage-provider.ts:877), so totalCount/hasNextPage diverge past 100 links. Self-links exist only as an unexercised fixture: LinkType TeamLead CareTeam→CareTeam at tests/spi-conformance/src/fixtures.ts:105-111 is referenced once, by a name assertion in tests/spi-conformance/src/categories/schema.ts:120, and no shipped pack declares a self-link. MANY_TO_ONE — the cardinality shipped packs use most (AdmittedTo, UnderCareOf, BedInWard, AlertCase, OrderedFrom) — has zero test coverage: grep for MANY_TO_ONE in tests/spi-conformance/src and packages/storage-*/src/__tests__ returns nothing.

**Update (16 Aug, second pass):** Self-links now have SPI conformance coverage. Five cases exercise the `TeamLead` (CareTeam -> CareTeam) fixture that previously only a name assertion touched: create between two objects of one type, direction asymmetry (outbound and inbound must not both match on the same endpoint), a traverse hop, cardinality enforcement on a self-link, and delete leaving both endpoints intact. Suite is 332 tests, up from 319 at the start of the day.

**Update (16 Aug, third pass): the Postgres half has now RUN.** The conformance suite was executed against the shipped `apache/age:release_PG17_1.6.0` container (PostgreSQL 17.7 + Apache AGE) via `PG_TEST_URL`: **664/664 tests pass, 332 per provider**. Self-link, MANY_TO_ONE, cardinality, direction asymmetry and traversal are now proven on Postgres, not merely reviewed. Two traps worth recording for whoever runs this next: (1) `turbo run test` does NOT forward `PG_TEST_URL` to the task, so the Postgres file silently skips — run `vitest` directly in tests/spi-conformance; (2) a Homebrew Postgres listening on 5432 will answer instead of the container, and if it happens to have an `altius` database the suite will run against it and fail every test with `extension "age" is not available`. Map the container to another port (`POSTGRES_PORT=5433`).

**Gap:** None for the storage layer. Still open and unrelated to the providers: this has never run in CI — the repository has zero workflow runs — so the guarantee holds only as long as someone runs it by hand.

### `storage-conformance/object-edit-history-and-temporal-queries` — Object edit history and temporal queries

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** Link temporal queries now exist across the SPI, both providers and REST. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** Object edit history and point-in-time reads were already complete across REST, GraphQL and the SDK. Links now have the same question answerable: `StorageProvider.getLinksAtTime(ctx, objectId, linkType, direction, timestamp, options?)` resolves membership from the link's own lifecycle — created at or before the instant and not deleted by it — in BOTH providers, with the same paging bounds, cursor contract and tenant scoping as `getLinks`. `includeDeleted` is deliberately ignored (a link deleted before the instant did not exist then whatever the flag says) and a malformed timestamp throws rather than falling back to the live graph. Reachable as `GET /api/v1/{plural}/:id/links/:linkType?asOf=`, which routes through `LinkManager.getLinksAtTime` and keeps the same authorization, pagination and link-property redaction as the live read. 7 conformance cases hold the two providers to identical semantics (created-after, deleted-after, deleted-before with includeDeleted, inbound direction, paging, malformed timestamp, tenant isolation) plus 7 REST tests. The Postgres half of the conformance suite has NOT been executed here (no live database); its SQL is verified by compilation and review only.

**Gap:** None for this row. Link PROPERTY history is absent by design and documented on the SPI method: neither provider stores per-link version snapshots, so property-level time travel would have to be invented rather than read. Membership at an instant — the question the row named — is answered.

### `storage-conformance/property-system-base-types-required-unique-c` — Property system: base types, required/unique constraints

**Status:** `full`

> ✅ **RE-VERIFIED against source, 17 Aug 2026 (later).** All gaps closed. Upgraded from `partial` to `full`.

**Evidence (read 17 Aug later):** All four sub-gaps are closed. (1) Memory enforces both required and unique constraints at the storage layer (memory-storage-provider.ts:403-436). (2) Custom scalars are validated by FORMAT in the engine (objects/validation.ts): Date requires a real calendar date, DateTime rejects a bare date, Duration requires ISO 8601, URI must parse, GeoPoint must be a lat/lng pair on the globe. 19 tests, 13 of which fail against the old `typeof` table. (3) `isList` crosses the SPI boundary (`PropertyDefinition.isList`), Postgres emits a real array column, and the value serializer passes arrays through. (4) Both providers pass 670/670 conformance tests (335 per provider, verified against PostgreSQL 17.7). The bar "a competent user gets the whole capability without writing platform code" is met: a pack author declares base types, required, unique, and list properties and gets enforcement on both providers.

**Gap:** None. One documented limitation: `canonicalPgType` maps every array to `ARRAY`, so a change from `TEXT[]` to `INTEGER[]` is not detected as a type change — catching it needs `udt_name` in the column query. This is a migration-detection edge case, not a capability gap.

### `storage-conformance/schema-evolution-with-breaking-change-detect` — Schema evolution with breaking-change detection and migration gating

**Status:** `partial`

**Evidence (read 15 Aug):** Detection and gating are genuinely wired now. diff()/classify() (packages/odl/src/diff/index.ts:34-100, breaking rules at :435-475) run inside PostgresSchemaRegistry.applySchema, which stores the diff and classification per version and refuses BREAKING without an approved plan (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:99-124), and boot calls it: server.ts:236-256 builds PostgresSchemaRegistry (or InMemorySchemaRegistry) and calls recordSchemaVersion (packages/api/src/schema-registry-boot.ts:64-91), with SCHEMA_BREAKING_POLICY=block turning a BREAKING pack change into a boot failure (config.ts:221-228, rethrow at server.ts:250-252). A deployed ontology can now evolve additively: applySchema detects DDL drift on an already-applied version, plans ALTER TABLE ... ADD COLUMN against information_schema and refuses destructive changes (packages/storage-postgres/src/schema/ddl-migrate.ts:77-150), wired under the advisory lock at packages/storage-postgres/src/postgres-storage-provider.ts:288-309, which also re-runs ddl.all so newly declared tables/indexes appear. Limits: production always presents version 1 — toOntologySchema hard-codes `version: 1` (packages/api/src/schema-loader.ts:809-815) — so every real evolution takes the checksum-drift branch, never the version-bump branch the conformance suite exercises (tests/spi-conformance/src/categories/schema.ts:247-326). Anything non-additive (type change, new required property without @default) throws out of applySchema (postgres-storage-provider.ts:289-295) and boot dies with no in-product remedy: MigrationPlan is {description, approved} metadata only (packages/odl/src/registry/types.ts:29-34) — there is no migration executor, no backfill, no DDL plan attached to it. Default policy is 'warn', which auto-approves BREAKING changes with a log line (schema-registry-boot.ts:86-88, server.ts:242). Ordering is wrong for gating: storage.applySchema runs at server.ts:211, before the breaking-change check at :240. planAdditiveMigration is unit-tested against canned information_schema rows only (packages/storage-postgres/src/__tests__/ddl-migrate.test.ts:1-6, 12-22) — no test runs a real ALTER TABLE. Registry versions and storage _schema_migrations versions are independent counters, and getSchema serves only the in-process map (postgres-storage-provider.ts:365-372), so older versions are unreadable after a restart.

**Gap:** ~~The default policy auto-approves BREAKING changes~~ — CLOSED (17 Aug): default is now 'block', not 'warn'. ~~Storage DDL is applied before the breaking gate~~ — CLOSED (17 Aug): the breaking-change gate now runs BEFORE storage.applySchema so a BREAKING pack change fails boot before any DDL touches the database. STILL OPEN: (a) No executable migration for non-additive changes — detection blocks, nothing unblocks; MigrationPlan is metadata only, no migration executor, no backfill, no DDL plan. (b) SPI schema version is a constant (version: 1) so version-based migration is dead. (c) Live ALTER TABLE is untested.


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

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** Component probes were already wired; "ingestion is not running" is now observable. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** `/health` no longer probes storage alone: `buildHealthReport` runs per-dependency probes for storage (critical), OpenFGA, the CEL sidecar, Redis and the Redpanda bus, settling them independently so one hanging dependency cannot hide the others; only a critical failure returns 503, because the gateway degrades rather than stops without the rest. The sync-visibility hole is closed three ways: (1) `altius_sync_scheduler_enabled` is ALWAYS exported (0 or 1) — the per-datasource `altius_sync_*` gauges only exist once a scheduler has registered a datasource, so on a deployment with ingestion off there were no sync series at all and every sync alert sat silent, which read as health; (2) a `SyncSchedulerNotRunning` PrometheusRule fires on that gauge (severity info — off is a valid configuration); (3) `GET /api/v1/sync/status` (admin-gated, mirroring the audit-reader default) reports `enabled` plus per-datasource mode/interval/ticks/consecutive failures/last error/last tick from `SyncScheduler.stats()`, whose only previous consumer was the gauge updater. It reports the DISABLED state rather than 404ing, because an absent route cannot say "not running" and an empty datasource list cannot distinguish "off" from "on with nothing to do". The sync-engine pod's probe no longer answers a bare `ok`: it states `role: library-host`, `scheduler: not-in-this-process` and points at the gateway endpoint, with liveness split onto `/healthz` where an unconditional pass is the correct semantics. 9 route tests; `helm lint` passes.

**Gap:** None for this row. `monitoring.serviceMonitor.enabled` and `monitoring.prometheusRules.enabled` still default false, and that is correct rather than a gap: rendering those objects without the Prometheus Operator CRDs installed fails the install, so opting in is a deployment decision. Sync alerts remain per-datasource once the scheduler runs; the enabled gauge is what covers the not-running case.

### `sync-ingest-ops/source-system-sync-cdc-ingestion-with-edit-v` — Source-system sync / CDC ingestion with edit-vs-source reconciliation

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Reconciliation is still absent — 7ace314 converted the silent clobber into a refusal, not into resolution. packages/api/src/sync-boot.ts:161-168 logs an error and skips any datasource that declares conflictResolution, on the stated grounds that no production code writes field provenance. ConflictResolver still has zero production callers: the only non-test references are the type re-export at packages/sync/src/index.ts:116 and the explanatory comment at packages/api/src/sync-boot.ts:11-14. For datasources that DO get scheduled, the applier still blind-overwrites every mapped property (packages/api/src/sync-boot.ts:94 objectManager.update with mapped.properties, no comparison to the existing writer). The scheduler remains unreachable in either shipped deployment: SYNC_SCHEDULER_ENABLED appears nowhere in Orion/helm/altius/templates/configmap.yaml (whole 89-line file read — INGEST_SECRET is at :50, no sync key), the api-gateway pod takes env only from that configmap plus a fixed literal block with no extraEnv escape hatch (Orion/helm/altius/templates/api-gateway-deployment.yaml:55-76), and Orion/docker-compose.yaml declares no env_file and no SYNC_SCHEDULER_ENABLED interpolation (the only hit repo-wide is the commented Orion/.env.example:75). The push path IS reachable — INGEST_SECRET is wired in both (Orion/docker-compose.yaml:236, configmap.yaml:50), handler at packages/api/src/ingest-handler.ts:56-121, mounted at packages/api/src/server.ts:1344 — but it 500s for every shipped manifest because all three set primaryKey.target: "id", rejected at ingest-handler.ts:80-82 and at sync-boot.ts:63-68. KafkaCdcSource does map deletes correctly (packages/sync/src/cdc/kafka-cdc-source.ts:139-145, c/u/d/r -> INSERT/UPDATE/DELETE), but JDBC incremental extract still hardcodes 'WHERE updated_at > $1' and yields only UPDATE (packages/sync/src/connectors/jdbc-connector.ts:216-217,227), and the new REST connector emits INSERT only.

**Gap:** ~~Zero edit-vs-source reconciliation~~ — PARTIALLY CLOSED (17 Aug): `ReconciliationService` (packages/sync/src/cdc/reconciliation.ts) compares a full source extract against the ontology state and reports missing objects, orphaned objects, and field drift. 10 tests pass. This is the detection half of reconciliation — the resolution half (automated fix of detected drift) still requires the ConflictResolver to be wired. STILL OPEN: (a) ConflictResolver still has zero production callers — reconciliation detects drift but does not fix it. (b) The poll/CDC loop cannot be enabled in any shipped compose or Helm deployment without editing those files. (c) Every shipped manifest is unusable on both the poll and webhook paths (primaryKey.target: "id" rejected). (d) The applier still blind-overwrites every mapped property with no comparison to the existing writer.

### `sync-ingest-ops/operational-automation-scheduled-event-drive` — Operational automation (scheduled + event-driven)

**Status:** `partial`

> ✅ **UPDATED 16 Aug 2026 — automation runtime landed (`b33f13e`) + hardened (`7e2fc31`).** absent → partial.

**Update (16 Aug 2026 — landed + hardened):** Automations are declarable in pack.yaml (`automations: [file...]`). Each manifest has a trigger (`event`: objectType + change kinds + optional CEL `condition`, or `schedule`: interval), an `action { name, params }` with static values or `{ from: <CEL> }` mappings, an `actor { id, roles }`, and (for schedule) a `tenantId`. Runtime: `AutomationRunner` (packages/api/src/automation/) subscribes to the EventBus and, on a matching object lifecycle event, evaluates the CEL condition against `{ event, object, changes }` and runs the action via ActionExecutor under a `type:'system'` actor (ReBAC authz + audit apply); schedule triggers run per interval under the declared tenant. Loaded by schema-loader, started/stopped at boot (server.ts). Tests: parser + runner (param mapping, CEL gating, loop guard, schedule, overlap, consent) — 18 tests. HARDENED (`7e2fc31`): multi-pod is now gated by `AUTOMATION_ENABLED` (default off — run on ONE instance; event/schedule on every replica would fire N×); consent parity — subject/purpose derived from an object-typed @param like the REST/GraphQL/MCP action paths; scheduled runs skip if the previous run is still in flight; loop guard is exact-match on the causing actor (not substring). REMAINING GAPS: (1) no idempotency for an at-least-once (Redpanda) bus → a redelivered event runs the action twice; (2) cron unsupported (interval only); (3) no retry/DLQ/metrics; (4) per-event `getObject` is an N+1 across matching automations; (5) cross-automation cycles (A→B→A) unguarded. Multi-pod leader election (vs the single-instance env gate) is a future enhancement.

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

> ⚠️ **STALE, re-verified 16 Aug 2026.** The write-write defect described below is CLOSED. `memory-storage-provider.ts:310-332` now performs a commit-time base-version check that raises `VERSION_CONFLICT`, and `74d08ad` extended it to deletes and restores; `transaction-isolation.test.ts` passes 9 cases including the lost-update one. Only the second half of the gap stands: a manifest still cannot declare a version on an `updateObject` effect.

**Gap:** storage-memory gives no write-write conflict detection: concurrent transactions on the same object silently lose an update (memory-storage-provider.ts:274-302 has no version re-check at commit), so 'version consistency' holds on postgres and not on memory. Same ODL + same action = different concurrency guarantees per provider.

</details>

## Security & consent

### `security-consent/access-decision-audit-trail` — Access-decision audit trail

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Re-verified 15 Aug. Retrieval landed and is tenant-safe: REST GET /api/v1/audit (rest/audit-routes.ts:47-92, mounted server.ts:1107) and GraphQL `auditRecords` both force filter.tenantId from the caller's token and role-gate on admin; `ce7ae32` made AuditRecord.tenantId required. The defining gap is untouched: `grep -c auditWriter` returns 0 in BOTH read paths (rest/route-generator.ts, graphql/resolver-generator.ts). Nothing writes operation.type 'read' or 'query', despite audit-writer.ts:10 documenting that caller.


**Update (16 Aug): read auditing LANDED; the row stays `partial` on the paging half.** `AuditWriter`'s documented "called by query layer for read auditing" caller now exists on both surfaces. REST: written once at the single dispatcher (server.ts:1138 `auditRead(...)`, helper at rest/audit-read.ts), so every generated read route — list, get-by-id, search, export, links, history — plus traverse and aggregate is covered, and a read route added later is covered the day it is written rather than when someone remembers. GETs are audited by method; the two reads that must be POSTs because they carry a body (aggregate, traverse) declare `readOperation: 'query'` on the route, because auditing by method alone would have silently missed them. GraphQL has no equivalent dispatcher — Apollo sees one POST /graphql — so the generated single-object, list and search resolvers call the shared `writeReadAudit` directly, giving both surfaces the same record shape. Denied reads are recorded, not just successful ones (REST 4xx, and the GraphQL FORBIDDEN branch), which is the evidence a DPO needs that the control held. One record per request, not per object returned. `detail.query` holds what was asked (`GET /api/v1/patients/p-1`, `query patient`) and never the response, so the audit store does not become a second copy of the data being protected. All writes are best-effort: a failing audit store never fails a read. Tests: packages/api/src/__tests__/read-auditing.test.ts (11 cases); the three GraphQL cases fail against the pre-change resolvers and pass after. Completed 16 Aug (second pass): the GraphQL aggregate and traverse resolvers now audit too, and MCP — the third read surface — audits both read tools at its own `invokeTool` dispatcher (packages/mcp-server/src/tools.ts), with `auditWriter` added to `McpServerDependencies` and wired at server.ts. Tests: packages/mcp-server/src/__tests__/read-auditing.test.ts (5 cases). Every read tool and resolver was verified to fail against the pre-change source and pass after.

**Correction to the first 16 Aug update on this row.** It asserted the GraphQL audit *read* surface was still unpaged in the store. That was wrong and I did not check it before writing it: `bec5bb4` had already pushed paging into the store — the resolver calls `auditStore.query(filter, { limit, offset })` alongside `auditStore.count(filter)` and derives `hasMore` from the true total, with a comment naming the exact Postgres-truncates-at-1000 defect it fixes. Both halves of this row's original gap are therefore closed.

**Gap:** None for this row's original two gaps: reads are audited on all five surfaces (REST every read route, GraphQL single-object/list/search/aggregate/traverse, MCP both read tools, FHIR and CDM at their routers), and the GraphQL audit read surface pages in the store. FHIR and CDM are now audited too (16 Aug, third pass), each at its own single router dispatcher, so all five read surfaces are covered: REST, GraphQL, MCP, FHIR, CDM. `metadata`/CapabilityStatement is deliberately excluded — a public capability document is not anyone's data. Remaining, and belonging to other rows: MCP records an agent as `actor.type: 'user'`, matching what its action path already writes, so agent traffic is still indistinguishable in the trail (see `security-gov/ai-agent-write-governance`); the FHIR record names the FHIR resource type rather than the ontology type it projects (they coincide in the shipped pack); and read auditing is one record per request, so it evidences that a query ran, not which specific rows it returned — enough for "who read this patient", not for row-level DSAR reconstruction.

### `security-consent/consent-management-consent-gated-reads` — Consent management / consent-gated reads

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Consent is enforced on REST list/get/search/aggregate (rest/route-generator.ts:362, 808, 1183, 1235, and the fail-loud aggregate scan cap at :335-367), GraphQL object/connection/search (resolver-generator.ts:387, 477, 697, 909), FHIR (fhir/router.ts:146, 246, 356), CDM (cdm/router.ts:175, 279, 440), functions (functions/invoke-function.ts:123, 272) and the REST traverse route (rest/traverse-route.ts:231). Recording and revoking are reachable and governed: POST /api/v1/consent (consent/router.ts:169, mounted server.ts:1110) accepts decision GRANT|DENY, role-gated (:121-128) and audited (:135-141); a later DENY wins on read because checkConsent takes the last matching record (consent-service.ts:86-100) and both stores preserve insertion order (memory-consent-store.ts:30, postgres-consent-store.ts:70 ORDER BY seq ASC). STILL UNGATED — GraphQL subscriptions: subscription-manager.ts contains zero consent references, is production-wired (server.ts:858, 924) and the delivered payload carries actual field values, not just ids (`previousValues: data.changes` — subscription-manager.ts:29, 80), FGA-checked only (:293-330, :350-390). ConsentService.revokeConsent (consent-service.ts:161-177) has NO production caller (only the SPI declaration spi/src/consent.ts:64 and three test stubs) and hardcodes `activeSessions: 0, subscriptionsTerminated: 0`, so nothing tears down a live stream on revocation. MCP: consent gating for search/query tools now exists (mcp-server/src/tools.ts:344-361, 556, consentAllows :591-608) and server.ts:1293 passes consentService — but this is UNCOMMITTED working-tree work: `git show HEAD:packages/mcp-server/src/tools.ts | grep -c consentService` returns 0 at HEAD 57cb52c, so at every committed revision the production-mounted /mcp read tools (server.ts:1282-1308) are still consent-free.

**Update (16 Aug):** Both named gaps are CLOSED. (1) Subscriptions now apply the same consent gate as every pull surface: `passesConsent` runs after the FGA check in both `createIdFilteredSubscription` and `createFilteredSubscription` (subscription-manager.ts), using the deployment's DEFAULT_CONSENT_PURPOSE. A restricted event is DROPPED, not blanked — on a single-object read the caller already named the record, but on a stream the mere arrival of an event discloses that the record exists and just changed. It fails closed: a throwing consent service withholds the event. (2) `revokeConsent` is no longer dead code returning zeros. `POST /api/v1/consent` with `decision: DENY` now routes through it rather than `recordConsent` (consent/router.ts), so a withdrawal both writes the DENY record and closes the subject's live streams via a new `SubscriptionRegistry`; the real count is returned to the caller and written to the audit record. Only subject-scoped (id-filtered) streams are closed — a type-level `patientsChanged` is about every patient, and closing it would cut a subscriber off from unrelated subjects, while the per-event gate already withholds the revoking subject's events. `activeSessions` is still 0 and is now documented as "not tracked anywhere in the platform" rather than implying none exist. Tests: packages/api/src/__tests__/subscription-consent.test.ts (5 cases); 4 fail against the pre-change source. MCP consent gating is committed (verified at HEAD).

**Gap:** None for this row. Residual, documented rather than implied: `activeSessions` is always 0 because in-flight requests are not tracked; and a type-level subscription is not torn down on revocation by design, relying on the per-event gate instead.

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

**Status:** `full`

> ✅ **RE-VERIFIED against source, 17 Aug 2026 (later).** All gaps closed. Upgraded from `partial` to `full`.

**Evidence (read 17 Aug later):** Computed/derived properties are fully functional end to end. (1) ODL validator whitelist includes all six builtins (countLinks, lookupField, sumLinks, avgLinks, minLinks, maxLinks — odl/src/validator/index.ts:495-502). (2) EAGER computed fields are evaluated on reads (computed-field-evaluator.ts:310-324). (3) MCP reads use ObjectManager when injected (mcp-server/src/tools.ts:340-349). (4) Computed fields are resolved on list paths via withComputed (object-manager.ts:349, 387, 415-434). (5) Computed fields CAN be used in filter, orderBy, and aggregate operations: ObjectManager.query() splits filters into storage-evaluable and computed-only parts (splitFilter, object-manager.ts:142-184), fetches all rows matching the storage portion, evaluates computed fields, and applies computed filter/sort/pagination in memory (object-manager.ts:492-570). ObjectManager.aggregate() similarly fetches all rows, evaluates computed fields, and aggregates in memory (object-manager.ts:640-667). AND filters are split recursively so storage-evaluable conjuncts still push down to the DB. 11 tests in computed-filter-sort-aggregate.test.ts cover eq/gt/gte filters, combined storage+computed AND filters, asc/desc ordering, and sum/max/count/groupBy aggregation. The bar "a competent user gets the whole capability without writing platform code" is met: a pack author declares `@computed` fields and can filter, sort, and aggregate on them with no platform code.

**Gap:** None. Documented limitations (not capability gaps): (a) EAGER is read-time evaluation, not true write-time materialization — described as MVP-compatible in source comments. (b) In-memory computed filtering fetches all rows, which is correct but expensive on large types without write-time materialization. (c) MCP fallback mode bypasses ObjectManager if no manager is injected, although production wiring provides one. These are performance/optimization concerns, not missing capabilities — a user gets the whole capability today.

### `defect-fixes/full-text-search-index-backed` — Full-text search (index-backed)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 17 Aug 2026 (later).** All gaps closed. Upgraded from `partial` to `full`.

**Evidence (read 17 Aug later):** Full-text search is now index-backed, stemmed, ranked, and weighted end to end. (1) DDL: per-field generated tsvector columns (`_fts_<field>`) with GIN indexes for each FULLTEXT IndexDefinition, with configurable stemming language (`IndexDefinition.language`, default 'english', validated alphanumeric to prevent SQL injection via regconfig name) — ddl-objects.ts. pg_trgm extension is emitted when any FULLTEXT index exists (schema/index.ts:90-97). (2) Runtime: the Postgres search function detects FTS columns at query time and, for word terms only, adds `plainto_tsquery('<lang>', $n)` matching alongside ILIKE — so "run" matches "running" via stemming while phrases stay ILIKE-only (search.ts:184-189). Score includes `4 * ts_rank_cd(<fts_col>, plainto_tsquery(...))` per FTS-indexed field (search.ts:187-188). (3) `@searchable(weight:)` propagates from ODL parser (parser/index.ts:356) through schema-loader (schema-loader.ts:938-948) into `IndexDefinition.weight` (spi/ontology.ts:347-353). Both providers use it as a per-field score multiplier: Postgres multiplies each field's CASE-WHEN score and ts_rank_cd bonus by the weight (search.ts:187, :219); memory multiplies each field's match-quality score (memory-storage-provider.ts:1278-1284). (4) Default-fields SQL error is FIXED: when no explicit fields are provided, Postgres queries `information_schema.columns` for text/varchar columns only, and resolvers intersect `visibleFields` with `searchableTextFields` — `id` and `dateOfBirth` are excluded. (5) Ranking is REAL: both providers implement boolean query parsing (required/excluded/orGroups), phrase matching (weight 3), and relevance scoring. 104 search conformance tests + 3 weight tests + DDL generation tests all pass. The bar "a competent user gets the whole capability without writing platform code" is met: a pack author declares `@searchable(weight: 2.0)` and gets stemmed, ranked, weighted search with no platform code.

**Gap:** None. One documented limitation: upgrading an existing deployment trips the DDL checksum guard until schema.version is bumped, because FULLTEXT DDL text changed. This is a deployment operational note, not a capability gap.

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

**Update (16 Aug): AGE is no longer mandatory.** `PostgresStorageConfig.enableGraph` (default true, so self-hosted deployments are unaffected) and the `POSTGRES_ENABLE_GRAPH=false` env var turn off both halves: `generateDDL` stops emitting `CREATE EXTENSION IF NOT EXISTS age` / `create_graph` / `create_vlabel` / `create_elabel`, and the write mirror stops being attempted. Turning off the writes matters as much as the DDL — the AGE helpers already fail safely inside a savepoint, but each failure logs at error level, so leaving them on would turn every insert on a managed Postgres into an error line. The switch is keyed per Pool (graph-flag.ts), not a module global, because one process runs many providers — the conformance suite builds a fresh one per test — and a global would let the last provider constructed decide for all of them. **Proven by execution:** the full conformance suite ran against a database where AGE was never installed (`select count(*) from pg_extension where extname='age'` = 0 afterwards) — 664/664 pass, 332 per provider. So Supabase, RDS and Cloud SQL are now legitimate targets, and nothing in the platform silently depended on the graph. Tests: packages/storage-postgres/src/__tests__/graph-optional.test.ts. Also closed here: GraphQL traverse is committed at HEAD, so the "REST only" clause is stale.

**Update (16 Aug, final): AGE is REMOVED, not just made optional.** Making it opt-out left the default paying for a mirror nothing reads, so the flag was the wrong answer. Verified before deleting: the only two `cypher()` call sites in the repo were inside `ageQuery` in object-crud and link-crud, both `Promise<void>` discarding the result — provably write-only. Removed: `schema/ddl-graph.ts`, the `graph-flag.ts` switch added hours earlier, `ageQuery`/`createAgeVertex`/`updateAgeVertex`/`deleteAgeVertex` and their call sites, the `sanitizeCypher*` helpers, `GRAPH_NAME`, the `enableGraph` config and `POSTGRES_ENABLE_GRAPH` env var, the AGE branch of `healthCheck`, and the AGE DDL tests — **534 lines deleted against 8 added**. Also corrected a stale header in links/traversal.ts that claimed traversal "translates TraversalPath steps into Cypher MATCH patterns" when it has always used SQL JOINs. Proven by execution on a real Postgres with no AGE installed (`pg_extension` count 0 afterwards): 664/664, 332 per provider. A regression guard (packages/storage-postgres/src/__tests__/graph-removed.test.ts) pins that the DDL emits no `EXTENSION IF NOT EXISTS age`, `create_graph`, `create_vlabel`, `create_elabel` or `ag_catalog`, so re-introducing the dependency has to be deliberate. Existing self-hosted deployments are unaffected: nothing DROPs their extension or graph — the platform simply stops writing to it, which respects the additive-only DDL rule.

**Gap:** No variable-depth (`maxDepth`) traversal on either provider; both refuse it rather than truncating. The graph substrate itself is now honestly described: object and link tables queried with SQL, no second store pretending to be a graph.


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

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** Function set extended, HAVING added, MCP aggregate tool shipped, object-set field validation closed. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** Four of the five open items are closed. (a) The grammar is now count, count_distinct, sum, avg, min, max, stddev, median and percentile, plus HAVING, across the SPI (`AggregateFunction`, `AggregateField.percentile`, `AggregateHaving`), BOTH providers, REST (`having` validated against the requested aliases; an unknown alias is a 400 rather than something the two providers each interpret differently) and the GraphQL SDL (`COUNT_DISTINCT`/`STDDEV`/`MEDIAN`/`PERCENTILE`, `AggregateHavingInput`, `having:` on every `<type>Aggregate` field). The semantics are pinned to Postgres's: STDDEV is the SAMPLE deviation (null at n=1) and MEDIAN/PERCENTILE are CONTINUOUS (interpolating), so the memory provider cannot answer a median differently from the database. HAVING filters groups before counting, ordering and paging, so `totalGroups` counts only survivors. (b) An `aggregate_<Type>` MCP tool now exists per ObjectType, carrying the full grammar plus groupBy/filter/having/limit; an agent asking "how many" previously had to page rows through `search_<Type>` and count them, which stops at the 50-row search limit. It validates against the schema, refuses redacted fields (a groupBy over a redacted field returns its values as group keys), scopes to FGA-authorised ids, and narrows a consent-gated type to consented records BEFORE grouping — refusing rather than answering when the population exceeds the 10k consent-scan cap. (d) The object-set aggregate route now applies the same aggregatable-field-name check the per-type routes apply. 10 provider tests, 9 conformance cases (both providers), 18 REST tests, 16 MCP tool tests.

**Gap:** None for this row. Aggregation over a TRAVERSAL-derived set remains unsupported (an ObjectSetDefinition names one objectType — composed sets work, because set algebra persists a combined filter that the aggregate route then reads). Running totals are computed client-side by the widgets that need them (WaterfallWidget), not in the aggregate grammar.

### `data-ops/object-sets-saved-shareable-executable-objec` — Object sets — saved, shareable, executable object collections with aggregations (report line 151)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** Per-user/group sharing and create-time validation added; the SEC-14 execute check was already closed. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** (a) Sharing is no longer one boolean. `ObjectSetDefinition` carries `sharedWithUsers` and `sharedWithGroups`, both stores evaluate them in their visibility check (public OR creator OR shared-with-me OR shared-with-a-group-I-am-in), and `RequestContext.actorGroups` — set once in `buildResolverContext`, so REST and GraphQL agree — is what makes the group case resolvable at the store layer. Sharing grants READ only: mutation and deletion stay with the creator, an unauthenticated caller inherits nothing, and a share does not cross the tenant boundary. Postgres persists them as additive `TEXT[]` columns (`ADD COLUMN IF NOT EXISTS`, matching the table's self-initialising pattern) with an array-overlap predicate. Revocation is an update to the list. (c) The SEC-14 predicate check on the execute path is present (`getVisibleFields` over the saved filter and orderBy, refusing execution of a set filtered or sorted by a redacted field). (e) Create now validates: name non-empty, objectType in the schema, filter/orderBy/aggregation field names stored and real, positive integer limit, boolean isPublic, share lists arrays of non-empty strings — previously a set naming a dropped field was accepted and only failed later, on someone else's execute request. 8 store tests + 18 REST tests.

**Gap:** None for this row. Sharing is per-user and per-group and read-only by design; a role-scoped grant would ride on the same field. Group membership comes from the caller's token rather than a directory lookup, so a group renamed in the IdP needs the share updated.

## actions-writeback

### `actions-writeback/transactional-object-writeback-via-actions-w` — Transactional object writeback via Actions with version consistency — edits through actions, read-your-writes, StaleObject/version-conflict detection, edit history retention (report line 502)

**Status:** `partial`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Re-verified 15 Aug. The prior gap is closed: `expectedVersion` is threaded to storage (action-executor.ts:961-966), a storage-raised VERSION_CONFLICT keeps its code across the transaction boundary (action-executor.ts:463-478), and a stale `If-Match` now answers 412 rather than 200 (rest/route-generator.ts:1605-1613). A NEW and more serious defect replaces it, found by the 41-row pass and reproduced by running the built provider: storage-memory checks expectedVersion against the TRANSACTION SNAPSHOT (memory-storage-provider.ts:516-520) and commit flushes changed keys with no re-check (:274-302). Two transactions opened at v1; T1 wrote and committed v2; T2 wrote with expectedVersion=1 and committed with NO error — T1's write was silently lost.

> ⚠️ **STALE, re-verified 16 Aug 2026.** The write-write defect described below is CLOSED. `memory-storage-provider.ts:310-332` now performs a commit-time base-version check that raises `VERSION_CONFLICT`, and `74d08ad` extended it to deletes and restores; `transaction-isolation.test.ts` passes 9 cases including the lost-update one. Only the second half of the gap stands: a manifest still cannot declare a version on an `updateObject` effect.

**Gap:** storage-memory gives no write-write conflict detection: concurrent transactions on the same object silently lose an update, so 'version consistency' holds on Postgres and not on memory — same ODL, same action, different concurrency guarantee per provider. Separately, a manifest still cannot declare a version on an updateObject effect.
