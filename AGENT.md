# Altius vs Palantir Foundry — Capability Parity Report

> 2026-08-14. Source: 242 Foundry docs (~/Documents/knowledge_for_ai/Palantir/foundry) analyzed by 12 agents against the Altius architecture+surface maps. 179 capabilities: 16 FULL / 80 PARTIAL / 83 ABSENT.

## widgets
VERDICT: Near-total absence by design: Altius has no UI layer whatsoever, so none of Workshop's ~50 configurable widgets has a rendered equivalent — parity exists only at the data-plane, where the generated GraphQL/REST surface (filter grammar, aggregation, search, subscriptions, per-object history/audit, governed actions with JSON-Schema tool descriptors) could feed a third-party UI implementing the read-side widget classes (tables, filters, charts, history timelines). The single most impactful gap is the entire no-code app-building/rendering layer itself; beneath the UI, the largest backend absences are media/attachment storage (blocks the whole media widget family) and scenario/what-if data branching.
- [ABSENT] No-code widget library / app-building UI layer (~50 configurable widgets in a module builder)
  evidence: none — Altius is explicitly headless; the only front-end artifacts are a transport-less generated TS SDK (packages/odl/src/codegen/sdk.ts, query/mutate/subscribe throw 'Not implemented') and a hollow 
  gap: Entire rendering/app-composition layer is greenfield. The generated SDK + OpenAPI/AsyncAPI/SDL dump artifacts (packages/api/spec/dump-*.ts) are the only hooks a UI could build on.
- [PARTIAL] Object display widgets (Object Table, Object List, Object View, Property List, Links, Object Set Title)
  evidence: Data substrate is real and working: generated Relay-style list queries with FooFilter/FooOrderBy/pagination (packages/odl/src/codegen/index.ts, packages/api/src/graphql/resolver-generator.ts), REST GE
  gap: No UI. No inline-edit path (objects mutate only via governed actions — deliberate, tests note 'no generic object-CRUD create path'); no generic CSV/Excel export endpoint (only the NHS-gated CDM export, ndjson/csv capped 
- [PARTIAL] Filtering and search widgets (Filter List histograms, Object Dropdown/Selector, date/text/numeric inputs, Exploration Filter Pills/Search Bar, Prominent Terms, User Select)
  evidence: Filter grammar with AND/OR/NOT + per-scalar operator sets (eq/ne/in/contains/startsWith/gt/lt...) generated per type (packages/odl codegen → SPI FilterExpression); full-text search endpoints searchFoo
  gap: No UI or filter-variable runtime; search is ILIKE scan not real FTS (tsvector index generated but unused); no faceting convenience API (client must compose aggregates); no user-directory endpoint for a User Select equiva
- [PARTIAL] Aggregation chart widgets (Chart XY, Pie, Vega, Pivot Table, Metric Card, Waterfall, Observability Chart)
  evidence: fooAggregate / POST /api/v1/{plural}/aggregate with fields+fn (COUNT/SUM/AVG/MIN/MAX), multi-field groupBy, orderBy, filter, FGA-scoped and redaction-guarded (resolver-generator.ts, rest/route-generat
  gap: No rendering at all; aggregation grammar narrower than the widgets need — no cardinality/approx-unique, no date/week/month bucketing, no multi-step pivot totals, no function-backed aggregation layers; chart PNG export an
- [ABSENT] Time series widgets (time series columns in Object Table, Metric Card sparklines, Time Series Analysis widget)
  evidence: none — no time series store or property kind anywhere; closest artifacts are DateTime scalars and per-type *_history snapshot tables (storage-postgres temporal-queries.ts), which are versioned row his
  gap: Time series property type would be new in ODL, SPI, and storage — greenfield across three packages.
- [ABSENT] Geospatial widgets (Map, Map [Legacy], Current Location Manager)
  evidence: GeoPoint scalar is declared in domain-packs/core and passes through the GraphQL codegen (packages/odl scalar mapping) — that is the entire geo surface
  gap: No spatial indexing, no spatial filter operators (operator sets are eq/ne/in/contains/etc.), no geoshape type, no tile/geocoding services. GeoPoint scalar is a storage hook only; everything else is greenfield.
- [PARTIAL] Action-triggering widgets (Button Group, custom right-click row actions, action-backed forms, Stepper-driven workflows, Media Uploader action trigger)
  evidence: Governed actions are Altius's core strength: POST /api/v1/actions/{Name} and Mutation.bar(input) over the 8-stage pipeline (packages/actions ActionExecutor), and Query.availableTools emits per-action 
  gap: No UI/form renderer; no dry-run (ToolDescriptor hardcodes dryRunSupported=false) so no preview-before-apply UX; no client-side validation metadata beyond the JSON-Schema params; submitBulkAction is SDL-only with no resol
- [PARTIAL] Live-updating widgets and event-driven interactivity (auto-refreshing tables/charts, Workshop events, variable propagation)
  evidence: Per-type GraphQL subscriptions fooChanged/foosChanged over graphql-ws, FGA-checked per delivered event, bridged from the CloudEvents bus (packages/api/src/subscriptions/subscription-manager.ts, Redpan
  gap: Known gap: link events publish only to per-object-ID topics so type-level subscribers miss link-driven changes (TODO in subscription-manager.ts); subscription payload is a minimal {id,_type} shape diverging from SDL prom
- [ABSENT] Comments / collaboration widget (threads on objects, @-references, notifications, action-log mirroring)
  evidence: none — no comment service, no notification service anywhere in the maps
  gap: Could be approximated as a pack-defined Comment ObjectType + action (the pack mechanism supports this today), but the built-in service, permission inheritance, mentions, and notifications are greenfield.
- [PARTIAL] Audit and edit-history widgets (Action Log Timeline, Edit History)
  evidence: Strong substrate: append-only audit trail (packages/security audit/, PostgresAuditStore _audit table with OTel traceId correlation, denials audited too), per-object version history API GET /api/v1/{pl
  gap: No UI; audit immutability is application-level only (ddl-audit.ts has no REVOKE/GRANT — DB-level append-only not enforced); audit querying is a library interface (AuditQueryFilter), not an exposed per-object end-user API
- [ABSENT] Data Freshness widget (last-indexed timestamps per object type/datasource)
  evidence: none working — packages/observability metrics.ts pre-declares sync.lag_seconds/records_processed but nothing emits them; packages/sync CheckpointStore is an interface with no production implementation
  gap: Requires the sync pipeline to actually run (no driver loop exists) plus a per-type freshness query API; the declared metrics and CheckpointStore interface are the only hooks.
- [ABSENT] Media and document widgets (Media Preview, Media Uploader, PDF Viewer, Image Annotation, Spreadsheet Display, Video/Audio preview)
  evidence: none — SPI/storage has no blob/attachment/media property kind (pgType map is TEXT/INTEGER/DOUBLE/TIMESTAMPTZ/JSONB only); no upload endpoint on the API surface (surface map: 51 REST entries, none file
  gap: A whole attachment/media subsystem (blob store, media-reference property type in ODL/SPI, upload/download routes, redaction/consent integration for media) is greenfield; annotation objects could ride existing ObjectTypes
- [ABSENT] Scenario widgets (Scenario Manager, Scenario Selector, Scenario Summary, scenario-compare columns in tables/charts/Gantt)
  evidence: none — no data-branching or sandbox-write primitive; the schema registry (packages/odl registry, PostgresSchemaRegistry) versions the schema, not the data; SPI transactions are commit-or-rollback, not
  gap: Scenario = branchable object graph + deferred action application + diffing; nothing in engine/SPI supports it. Largest conceptual gap after the UI itself; greenfield in engine, SPI, and storage.
- [PARTIAL] AIP/LLM widgets (AIP Chatbot, AIP Generated Content)
  evidence: Only the tool-side hook exists and works: Query.availableTools returns per-action ToolDescriptors with JSON-Schema parameters (spec 5.7; packages/actions tool-registry.ts derives LLM tool descriptors 
  gap: No LLM runtime, no agent/chat service, no streaming, no model connectivity anywhere (stated platform non-goal today). Tool discovery gives an external agent framework a governed action surface, but everything conversatio
- [ABSENT] Embedding and cross-app widgets (Iframe, Embed Foundry apps: Quiver/Notepad/Vertex/embedded Workshop modules, App Pairing, Commands)
  evidence: none — there are no sibling applications to embed or pair; the only related knob is CORS_ALLOWED_ORIGINS in packages/api for exposing the API to external UIs
  gap: Meaningless without an app ecosystem; for Altius the equivalent story is 'external UIs call the headless API', which the CORS/OIDC surface already permits.
- [ABSENT] Layout, navigation, and device-capture widgets (Tabs, Stepper, Markdown, Mobile Navbar, Header, QR Code Reader, camera capture, geolocation prompt)
  evidence: none — pure front-end concerns with no backend counterpart to exist in a headless platform
  gap: Nothing backend-shaped to close; these come for free with whatever UI framework a consumer builds. No Altius-side work is meaningful beyond the API already exposed.
- [ABSENT] Platform-resource widgets (Resource List, Linked Compass Resources — browse files/projects, link files to objects, upload-and-link)
  evidence: none — no file/resource catalog subsystem; nearest artifacts are GET /admin/packs introspection and saved object sets, neither a file hierarchy
  gap: Depends on both a resource catalog and media/file storage (see media entry) — double greenfield.
- [PARTIAL] Saved views and per-user state (state saving, variable-backed column config, reusable object-set variables as widget inputs)
  evidence: Saved-query primitive is real: ObjectSetManager + REST /api/v1/object-sets CRUD/execute/aggregate and GraphQL objectSet(s)/createObjectSet (packages/engine object-sets, storage-postgres PostgresObject
  gap: No generic per-user UI-state/preferences store (Foundry's state saving); object sets cover shared saved queries but not arbitrary widget state.
- [PARTIAL] Function-backed widget data (function-backed columns, function aggregation layers, prompt functions, derived display properties)
  evidence: ComputedFieldEvaluator exists in packages/engine but supports only LAZY caching and a single builtin (countLinks — e.g. Ward.currentOccupancy, excluded from filters/orderBy); no user-defined function 
  gap: A server-side function registry/runtime (arbitrary user code over object sets) is greenfield; the evaluator is the hook but is one hardcoded builtin away from a demo, not a platform capability.

## workshop-ui
VERDICT: Near-total absence, by design: Workshop is Foundry's low-code UI layer (module builder, ~60-widget library, reactive variables, events, embedding, mobile, theming) and Altius ships no frontend of any kind — every purely visual capability is greenfield. What Altius does have is a well-shaped headless substrate for exactly the things Workshop binds to (saved/executable object sets, JSON-Schema action descriptors for form generation, FGA-checked GraphQL subscriptions, a typed-SDK generator, schema change classification), so the single most impactful gap is the application-builder + widget-library layer itself: an entire client-side product that would consume Altius's existing APIs, not a backend rework.
- [ABSENT] Low-code application builder (Workshop module model: pages, sections, layouts, header, overlays, templates, example apps)
  evidence: none — Altius is explicitly headless; no package renders or serves any UI (packages/api serves only GraphQL/REST/FHIR/CDM JSON; the other services are /health-only node:http servers).
  gap: Entire authoring-and-rendering product missing: editor, layout engine, page/overlay model, persistence of app definitions. Greenfield build of a frontend platform; Altius's generated GraphQL/REST APIs are the data source
- [ABSENT] Widget library (~60 widgets: object tables/lists/views, charts, maps, Gantt, pivot, filters, inputs, buttons, media, comments, AIP chat) plus per-widget display optimization
  evidence: none — no UI components anywhere in the workspace.
  gap: Complete widget catalog missing. The data endpoints widgets would bind to exist (list/aggregate/search/history REST routes per ObjectType, GraphQL connections/aggregations), but every rendering component is greenfield; n
- [PARTIAL] Reactive variables & data-binding system (typed variables from static/function/aggregation/object-property/object-set sources, transformations, struct variables, lazy recompute, lineage graph)
  evidence: The server-side sources Workshop variables bind to exist: generated GraphQL queries with FooFilter/FooOrderBy/aggregations and REST /api/v1/{plural}/aggregate (packages/api rest/route-generator.ts, re
  gap: The entire client-side reactive engine (variable graph, recompute semantics, transformations, lineage debugging) is greenfield; only the query/aggregation backbone is present. ComputedFieldEvaluator in packages/engine su
- [PARTIAL] Object set & filter-state substrate (object set variables, object set filter variables, saved/shareable sets)
  evidence: Genuine headless equivalent: ObjectSetManager (packages/engine) + PostgresObjectSetStore (packages/storage-postgres/src/object-sets/) + REST CRUD/execute/aggregate at /api/v1/object-sets with tenant s
  gap: No filter-state semantics beyond stored FilterExpressions: no filter-value extraction back into variables, no widget-emitted filter objects, no starting-filter IS/NULL/CONTAIN vocabulary parity. Closing the definitional 
- [PARTIAL] Auto-generated action forms & governed writeback from apps (Actions in Workshop, button-triggered/inline actions, rule-editor style parameter forms)
  evidence: Backend is strong: POST /api/v1/actions/{Name} + GraphQL mutations run the 8-stage governed pipeline (packages/actions ActionExecutor); Query.availableTools emits per-action JSON-Schema parameter desc
  gap: No form renderer, no submission-criteria UX, no proposal/approve-reject application. Form generation from the existing JSON-Schema descriptors is a natural frontend hook — the metadata already exists; the diff/approval a
- [PARTIAL] Events & interactivity system (widget events, layout events, set-variable events, on-load triggers, auto-refresh)
  evidence: Only the server push side exists: GraphQL subscriptions fooChanged/foosChanged over graphql-ws with per-event FGA viewer checks (packages/api/src/subscriptions/subscription-manager.ts), fed by CloudEv
  gap: Client-side event routing (widget→event→variable/layout) is entirely part of the missing UI. Known server gap: link-driven changes miss type-level subscribers (TODO in subscription-manager.ts). Auto-refresh orchestration
- [ABSENT] Modular composition & reuse (embedded modules, loop layouts, module interface as app API, URL/deep-link initialization)
  evidence: none — composition of UI modules has no analog; there is no app-definition artifact to embed or parameterize.
  gap: Whole concept depends on the missing app model. The closest conceptual neighbor (parameterized, shareable saved queries) exists as object sets, but module-interface variable mapping, loop instantiation, and URL-state ini
- [ABSENT] Cross-application interactivity (drag-and-drop media types, App Pairing shared-state sync, commands between apps)
  evidence: none — no client applications exist to pair or drag between; no media-type/RID conventions, no shared-state protocol.
  gap: Requires both the UI layer and an inter-app state protocol (scopes, media types, enrichment). Nothing in Altius points at this; low priority for a headless platform until multiple first-party frontends exist.
- [PARTIAL] Typed SDK for custom (React) application building (OSDK + dnd-osdk-react)
  evidence: generateSdk (packages/odl/src/codegen/sdk.ts) emits a complete typed client from ParsedSchema: per-type get/list/onChange accessors, per-action typed inputs, enums, and security-aware types (@sensitiv
  gap: SDK is generator-only: query/mutate/subscribe throw 'Not implemented' (no transport), generated list() ignores its filter/pagination args, no `odl generate sdk` CLI subcommand, and nothing writes output into the placehol
- [PARTIAL] Interactive graph visualization & embedding (Vertex graph widget: layouts, layer styling, grouping, saved selections, time panels)
  evidence: Only the graph data substrate: Apache AGE graph maintained write-side (packages/storage-postgres, single 'openfoundry' graph), SQL-join traversal via SPI traverse and GET /api/v1/{plural}/:id/links/:l
  gap: All rendering, layout algorithms, styling, grouping, templates, and save/share of explorations are greenfield. Note the AGE graph is effectively write-only in current read paths, so even a future viz would query the SQL 
- [PARTIAL] Read-only dashboard delivery (org/app-access scoping, kiosk mode, read-only enforcement)
  evidence: The enforcement half exists headlessly and fails closed: OpenFGA viewer-only relations gate every read, field redaction + consent filtering on all surfaces, actions gated by can_* relations (packages/
  gap: No dashboard to deliver, no org-level application-access controls, kiosk mode, or home-page config (Altius tenancy is per-request tenant scoping, not an admin console). The authz model needs no change; everything user-fa
- [PARTIAL] Application packaging & distribution (Marketplace products: packaging linter, install parameters, embedded-module customization points)
  evidence: Domain packs are the analogous distribution unit for ontology content: pack.yaml manifests with dependencies/capabilities, external pack mounts (DOMAIN_PACKS_EXTRA_DIRS, Helm domainPacksExtra), boot-t
  gap: Packs carry schema/actions/permissions/connectors/seeds — there is no application artifact to package. No install-parameter templating (env vars only), version ranges limited to '>=', unsatisfied dependencies only warn. 
- [ABSENT] Mobile application support (mobile app launcher, mobile design mode, nav bar/QR/location widgets, browser-history navigation)
  evidence: none — no client exists, mobile or otherwise. The GraphQL/REST API is transport-agnostic but nothing mobile-specific exists.
  gap: Entirely dependent on the missing UI layer; nothing to do backend-side.
- [ABSENT] Design system & theming (unified component design, saved module color palettes, light/dark mode, typography controls)
  evidence: none.
  gap: Design-system work is part of any future frontend; no backend hooks needed or present.
- [PARTIAL] Interactive ontology change management (save/review edits, error/warning linting, merge-conflict resolution, discard/restore)
  evidence: The governance core exists headlessly and is arguably stronger than UI-only: ODL diff/classify with SAFE/COMPATIBLE/BREAKING classification, MigrationPlan gating of BREAKING applies, reverseDiff rollb
  gap: No interactive review UI, no merge-conflict resolution between concurrent editors (registry serializes via advisory lock instead), and boot path auto-approves breaking pack changes with a warning (enforcement deferred to

## ontology-core
VERDICT: Altius has a genuinely strong kernel equivalent for this theme: typed object/link/property schema definition (ODL), governed actions with submission-criteria-style CEL preconditions and per-action permissions, row/column/cell-level security, object sets, version history, and best-in-class schema-change classification (SAFE/COMPATIBLE/BREAKING with migration gating). The single most impactful gap is the logic layer: Foundry's Functions (FOO, function-backed actions, derived-property functions, custom aggregations) has no Altius counterpart beyond a CEL expression sidecar and a one-builtin computed-field evaluator, which blocks the entire class of code-driven derivations and complex action logic; branching/proposal review, structs/shared properties, media, and all UI-facing ontology metadata are also absent.
- [FULL] Object type schema definition (typed entities with primary key, enums, API names)
  evidence: packages/odl parser (@objectType directive, ParsedSchema IR), validateSchema with MISSING_PRIMARY error code, @primary fields, enums; 19 concrete object types across domain-packs/{nhs-acute,aml,supply
  gap: No title-key concept and no naming-governance tooling (Foundry enforces PascalCase/camelCase API-name rules and uniqueness interactively); ODL names serve directly as API names. Minor - conventions could be added to vali
- [FULL] Link types (bidirectional relationships, cardinality, self-links, traversal)
  evidence: @linkType/@link directives with cardinality (MANY_TO_MANY etc.) in packages/odl; engine LinkManager (UUIDv7 link IDs, cardinality checks CQ-02); storage-postgres DDL partial unique indexes enforce car
  gap: Per-side display names absent (display concern); Foundry's dataset-backed many-to-many mapping is N/A since Altius links are first-class rows. Effectively at parity for a headless platform.
- [FULL] Property system: base types, required/unique constraints, sensitive fields
  evidence: ODL FieldDefinition scalars (String/Int/Float/Boolean/ID/Date/DateTime/Duration/GeoPoint/JSON/URI + enums) mapped to Postgres types in storage-postgres ddl-objects; @sensitive, @default, nullability; 
  gap: No vector/embedding property type and struct columns are only untyped JSONB; base-type changes go through schema diff rather than per-property migration tooling.
- [ABSENT] Property/type display metadata (icons, statuses, visibility, groups, value & conditional formatting, render hints, type classes)
  evidence: none - ParsedSchema carries only structural fields and directives; nothing in the architecture or surface maps stores display names, icons, statuses, visibility, or formatting metadata.
  gap: Greenfield, but cheap to close at the schema level: ODL directives are the natural hook (parser drops unknown directives today, so a @display/@status directive family could be added without breaking packs). Rendering wou
- [ABSENT] Structs, shared properties, and property reducers
  evidence: none - closest is the JSON scalar (stored as JSONB) which is untyped; no struct declarations, no shared-property registry, no reducers anywhere in packages/odl or storage.
  gap: Greenfield in the ODL type system. Interfaces in the core pack partially cover the 'shared shape' use case; typed structs with validation and main-field semantics would need parser, codegen, and DDL work.
- [PARTIAL] Interfaces (shared abstractions implemented by multiple object types)
  evidence: domain-packs/core/core.odl declares interfaces (Auditable, Identifiable, Temporal, Locatable, CodeableConcept); ParsedSchema retains interfaces and mergeSchemas merges them across packs.
  gap: Interfaces are declared but not operationalized: no evidence of implements-checking in validateSchema, no interface-typed queries/link types/actions in the generated GraphQL surface, no polymorphic API. Hook exists (pars
- [PARTIAL] Backing datasources and property-to-column mapping (indexing pipeline from source data)
  evidence: packages/sync: YAML datasource-mapping parser with transform-expression DSL, RecordMapper, JdbcConnector (real), CdcConsumer with CheckpointStore, ConflictResolver (LAST_WRITE_WINS/SOURCE_PRIORITY/ACT
  gap: Materially incomplete: no scheduler/driver loop (SyncConfig.interval parsed but never consumed), the CDC write path is not wired to the engine (ChangeApplier has no production implementation), Debezium intake is compose-
- [FULL] Schema evolution with breaking-change detection and migration gating
  evidence: packages/odl diff/classify (any removal = BREAKING; nullable-to-required, type/link changes = BREAKING; additive = SAFE), MigrationPlan required to apply BREAKING, reverseDiff for rollback classificat
  gap: Boot path auto-approves BREAKING pack changes (warn-and-proceed via recordSchemaVersion), so enforcement is real only through the registry API/CLI; and there is no consumer-impact analysis (Foundry warns which apps break
- [ABSENT] Ontology branching, proposals, and review/merge workflow
  evidence: none - the schema registry stores a linear, monotonically-versioned history only (InMemorySchemaRegistry/PostgresSchemaRegistry); no branch, proposal, review, or protection concept anywhere.
  gap: Greenfield. The versioned registry plus diff/classify/reverseDiff is a solid substrate (branch = divergent version chain, merge check = classify), but branch state, conflict resolution, and an approval workflow would all
- [FULL] Action types: declarative create/modify/delete/link rules with parameters, submission criteria, permissions, and side effects
  evidence: packages/actions 8-stage pipeline (validate, authorise, consent, preconditions, execute, side-effects, audit, emit); YAML manifests with CEL preconditions (submission-criteria equivalent, Go cel-evalu
  gap: No auto-generated UI forms or parameter dropdown/default config (headless - generated Input types/OpenAPI are the form contract); no user-facing notification side effect (webhooks/events only); no 'generate default CRUD 
- [PARTIAL] Functions: user-authored code logic on objects (FOO, function-backed actions, custom aggregations)
  evidence: packages/cel-evaluator Go gRPC sidecar (cel-go with custom functions has_link, count_links, hasRole, hasPermission, ISO-8601 duration, validateJsonSchema) evaluates preconditions/conditions; executor'
  gap: Largest gap in the theme. CEL is expression-only and side-effect-free: no arbitrary-code function runtime, no authoring/versioning/publishing, no function-backed actions (effects are declarative), no custom aggregations,
- [PARTIAL] Derived properties (query-time values computed from linked objects)
  evidence: packages/engine ComputedFieldEvaluator with LAZY cache and exactly one builtin, countLinks (used by nhs-acute Ward.currentOccupancy); computed fields correctly excluded from filters/orderBy in generat
  gap: Only countLinks exists; no expression- or function-driven derivations, no aggregation builtins (sum/avg over links), no eager/indexed evaluation. The evaluator is the hook - adding builtins or CEL-backed derivation would
- [FULL] Object sets (saved, shareable, executable object collections with aggregations)
  evidence: engine ObjectSetManager + SPI ObjectSetStore (InMemoryObjectSetStore and storage-postgres postgres-object-set-store); REST /api/v1/object-sets CRUD + /:id/execute + /:id/aggregate and GraphQL objectSe
  gap: No temporary object-set RIDs or cross-app drag/drop transport (UI concerns). Effectively at parity for a headless platform.
- [PARTIAL] Graph exploration and Search Around (multi-hop link traversal with filters)
  evidence: SPI traverse() implemented in both providers (depth cap 10, 10k node visit cap; pure SQL joins over link tables); REST GET /api/v1/{plural}/:id/links/:linkType; nested GraphQL link resolvers with per-
  gap: Single-hop and bounded-path primitives only: no declarative multi-step search-around with per-step filters, no saved/parameterized traversal resources, no graph-result shaping (grouping, intermediate edges). AGE is effec
- [FULL] Object and property security policies (row-, column-, and cell-level security)
  evidence: packages/security AuthorizationService over OpenFGA (viewer relation per object; listObjects restricts list/search/aggregate = row-level); permissions/field-permissions.yaml FieldPermissionConfig reda
  gap: Mechanism is ReBAC+config rather than markings: no marking/classification inheritance from data sources, no mandatory-control-property (per-row markings) analog, and no policy-test simulator. Tenant isolation is app-laye
- [ABSENT] Foundry Rules (end-user rule authoring with proposal/approval change management)
  evidence: none - Altius has no rules-as-data engine; CEL preconditions are developer-authored in pack YAML, not end-user-authored runtime objects, and no proposal/approval workflow exists for any runtime artifa
  gap: Greenfield. Could be modeled ON Altius (rules and proposals as ODL object types plus actions, exactly as Foundry Rules does on its own ontology), but the evaluation pipeline that applies rule logic to object streams and 
- [ABSENT] Media and attachment properties
  evidence: none - no media/attachment/blob storage, reference type, or upload endpoint anywhere in the architecture or 371-entry surface map.
  gap: Greenfield: needs a blob-store abstraction in the SPI, a media-reference scalar in ODL, and upload/permission plumbing in the API gateway.
- [PARTIAL] Geospatial and geotime (geo property types, geo queries, time series)
  evidence: GeoPoint custom scalar declared in domain-packs/core and passed through odl codegen; stored via storage-postgres pgType mapping (unknown scalars stored as TEXT).
  gap: GeoPoint is a pass-through string with no geo semantics: no geoshape type, no spatial indexing (no PostGIS), no geo filter operators in FilterExpression, no time-series property type (only object version history). Real g
- [FULL] Object edit history and temporal queries (single-entity history instead of versioned object copies)
  evidence: storage-postgres per-type <type>_history snapshot tables written in-transaction on every create/update/soft-delete; SPI getObjectAtVersion/getObjectAtTime and QueryOptions.asOfVersion/asOfTime; REST G
  gap: Lineage/provenance recording (LineageRecorder) is in-memory only, and there is no per-field edit-attribution query surface (who changed which property when) beyond the audit trail - minor relative to Foundry's user-edit-
- [PARTIAL] Actions and ontology surfaced as AI-agent tools
  evidence: GraphQL Query.availableTools returns one ToolDescriptor per ActionType with JSON-Schema parameters (spec 5.7, packages/odl tool-registry.ts / actions tool derivation); action execution runs the full a
  gap: Descriptors only: no LLM/agent runtime (explicitly out of Altius scope), dryRunSupported/reversible hardcoded false, and availableTools does no per-user authorization filtering (returns all actions to any authenticated c

## pipelines-data
VERDICT: Altius has essentially no data-pipeline layer: Foundry's core substrate here — versioned/transactional datasets, batch transform frameworks, Pipeline Builder, ad-hoc SQL, projections, and the Foundry Rules batch rules engine — is absent, because Altius stores ontology objects directly in per-type Postgres tables and mutates them only through governed per-request actions. The one real primitive is packages/sync (JDBC connector, mapping DSL, CDC consumer, conflict resolver), but it is a library of unwired components with no scheduler, no Debezium intake code, and no production ChangeApplier. The single most impactful gap is the missing batch compute substrate (dataset primitive + transform execution + scheduling), on which every other capability in this theme depends; the partial credits (temporal/history reads, ODL-generated indexes, CDM export, record-level CEL validation) are per-record ontology mechanisms, not pipeline mechanisms.
- [ABSENT] Versioned transactional dataset primitive (datasets as branchable, transaction-log-backed tabular resources)
  evidence: none — Altius has no dataset/file abstraction at all. Storage is one Postgres table per ObjectType plus <type>_history snapshot tables (packages/storage-postgres ddl-objects.ts); no transactions-as-da
  gap: Greenfield. Would require a whole new storage subsystem (file/tabular store + transaction log + branching); nothing in the SPI contract (packages/spi/src/storage-provider.ts) is dataset-shaped. Arguably out of scope for 
- [ABSENT] Dataset REST API (metadata + schema retrieval addressed by branch / transaction / schema version)
  evidence: none for datasets. Closest schema-introspection surfaces: GET /api/v1/openapi.json (generated contract), GET /admin/packs (pack/type counts, unauthenticated), spec/dump-schema.ts SDL dump, and the ODL
  gap: A read-only 'schema version N' endpoint over PostgresSchemaRegistry would be a small addition (the registry already stores versioned ParsedSchema snapshots with diff/classify); branch/transaction addressing has no substr
- [ABSENT] Code-based batch transform framework (transforms-python / Java transforms on Spark, incremental transforms)
  evidence: none — no transform execution framework, no job runner, and explicitly no scheduler anywhere (architecture map: 'no scheduler exists anywhere in packages/sync'; SyncConfig.interval parsed but never co
  gap: Greenfield: needs a batch engine + scheduler + dataset IO. The sync mapping DSL is the only hook and is deliberately record-scoped; nothing to extend into Spark-class batch compute.
- [ABSENT] Programmatic tabular read/write SDK (foundry.transforms.Dataset: pandas/polars/arrow IO with filter pushdown, schema inference, file upload)
  evidence: none — the generated TypeScript SDK (packages/odl/src/codegen/sdk.ts targeting packages/sdk-typescript) is a transport-less GraphQL API client whose query/mutate/subscribe throw 'Not implemented' and 
  gap: Even the API-client SDK is unwired (no generate-to-publish step, no runtime transport). A dataframe/bulk-IO SDK would additionally need a bulk read/export surface the API layer does not have (consent-aware pagination har
- [ABSENT] No-code pipeline authoring with configurable dataset outputs (Pipeline Builder: output schema mapping, write modes, file formats)
  evidence: none for pipelines/outputs. The only declarative-mapping analog is pack connector YAML (domain-packs/*/connectors/*.yaml parsed by packages/sync/src/mapping/mapping-parser.ts): datasource → object map
  gap: Write-mode semantics (dedupe by primary key, changelog, snapshot-replace) have no home without a dataset primitive; the mapping YAML could grow richer transforms cheaply, but the output/build half is greenfield.
- [PARTIAL] Data expectations / quality checks that gate builds
  evidence: Record-level write-time validation exists and is real: packages/engine validation.ts (schema/type/uniqueness CQ-01 checks, severity model where unevaluable constraints downgrade to warnings) plus CEL 
  gap: The Foundry feature is batch/dataset-level (assert over a whole output before publishing); Altius only validates individual records at write time. No batch context exists to attach expectations to; also inline CEL fallba
- [ABSENT] Interactive SQL query service (Spark SQL REST API with async job lifecycle)
  evidence: none — no ad-hoc SQL surface and no async query-job model. Closest: the generated structured query surface per ObjectType (GraphQL foos/fooAggregate/searchFoos and REST /api/v1/{plural} list/aggregate
  gap: Exposing governed ad-hoc SQL would have to replicate the whole security pipeline (FGA listObjects scoping, field redaction SEC-14 predicate-leakage rules, consent filtering) inside a SQL planner — the existing per-field 
- [PARTIAL] Ontology materializations and governed bulk export (latest object state incl. user edits exported to datasets/restricted views)
  evidence: The latest object state (including all action edits) natively lives in one Postgres table per ObjectType (packages/storage-postgres, snake_type tables) — the 'materialized latest state' exists by cons
  gap: No propagation machinery is needed for the tables themselves, but reading them directly bypasses all governance (redaction/consent are API-layer, RLS explicitly deferred post-MVP per ddl-consent.ts) — so there is no gove
- [PARTIAL] Dataset projections / query acceleration (filter- and join-optimized projections, incremental compaction, transparent planner use)
  evidence: The Postgres-native analog is declarative index generation: ODL IndexDefinitions emit CREATE INDEX DDL per ObjectType (packages/storage-postgres ddl-objects.ts — BTREE plus GIN to_tsvector for FULLTEX
  gap: Known defect-shaped gap: the FULLTEXT tsvector GIN index is generated but never used — runtime searchObjects issues ILIKE '%q%' with CASE-WHEN scoring, so search does not scale (fix is a real tsquery path in objects/sear
- [ABSENT] Foundry Rules: no-code batch rules engine over the ontology (rule authoring + governed rule outputs + generated rules pipeline)
  evidence: none as a batch capability. The related primitives are per-request, not batch: YAML action manifests with CEL preconditions + declarative effects (packages/actions parser + ActionExecutor 8-stage pipe
  gap: A 'rules' capability would need: a rule registry (schema exists for nothing like it), a batch evaluator that sweeps object populations through CEL (the sidecar evaluates one context per call today, with eagerly pre-resol
- [PARTIAL] Source-system sync / CDC ingestion with edit-vs-source reconciliation
  evidence: This is Altius's strongest theme entry: packages/sync implements connectors (JdbcConnector with fullExtract/incrementalExtract updated_at polling; REST stubbed), YAML datasource mapping with compiled 
  gap: Componentized but not a running pipeline: no scheduler/driver loop (SyncConfig.interval parsed, never consumed), no code consumes Kafka/Debezium envelopes (CdcConsumer input is AsyncIterable<SourceRecord> from polling), 
- [PARTIAL] Schema and data version time-travel (schema at any version; reads as of version/time; historical snapshots)
  evidence: Working equivalents at ontology granularity: per-type *_history tables written in the same transaction as every create/update/soft-delete, powering SPI getObjectAtVersion/getObjectAtTime and QueryOpti
  gap: No branches, and no bulk 'dataset as of T' read — time-travel is per-object only (engine managers expose no time-travel API; it lives below in the SPI). Schema-evolution enforcement is soft at boot: recordSchemaVersion a
- [ABSENT] No-code client-side variable transformations (Workshop derived values: string/math/date/object-set/geospatial/array operations)
  evidence: none — Altius is headless with no UI/variable layer by scope. Server-side fragments that cover slivers: GraphQL fooAggregate (COUNT/SUM/AVG/MIN/MAX + groupBy) via resolver-generator, and the engine's 
  gap: Out of scope for a headless platform (a client app would own this). The nearest server-side investment with leverage is expanding ComputedFieldEvaluator builtins / derived properties, which is an acknowledged MVP shim.

## analytics-ts
VERDICT: Altius has a solid headless structured-query substrate — grouped aggregations, composable filters, full-text search, saved object sets, multi-hop graph traversal, and per-object temporal history — but essentially none of Foundry's analytics layer proper: no time series subsystem (no TS property type, no transform/summarizer engine, no interval-detection rules) and no analysis/visualization surface (Quiver, Vertex, Workshop analysis widgets). The UI absences are by design for a headless platform, so the single most impactful gap is the first-class time series subsystem: it is backend functionality (storage layout, series query/transform API, standing rules + scheduler) that a headless ontology platform would be expected to own, and today the only temporal primitive is whole-object version snapshots.
- [PARTIAL] Time series properties (first-class timestamped-value history on ontology objects)
  evidence: packages/storage-postgres temporal layer: per-ObjectType <type>_history snapshot tables written on every create/update/soft-delete (temporal-queries.ts); @altius/spi getObjectAtVersion/getObjectAtTime
  gap: What exists is whole-object version history (audit/as-of reads), not a time series datatype: no TS scalar in ODL, no series ingestion path (nothing like TS syncs/tick datasets), no per-series query API, no interpolation,
- [ABSENT] Time series transform and summarizer engine
  evidence: none
  gap: Nothing temporal-windowed exists anywhere; Altius aggregation is only COUNT/SUM/AVG/MIN/MAX with groupBy over object scalar fields (aggregateObjects). Closing this requires a series compute engine (windowing, interpolati
- [ABSENT] Time series rules / interval detection and alerting (Foundry Rules TS boards, TS alerting automations)
  evidence: none
  gap: Altius has no rules engine and — explicitly — no scheduler anywhere (packages/sync parses SyncConfig.interval but nothing drives it); CEL preconditions in packages/actions gate individual action requests, they are not st
- [ABSENT] Interactive time series analysis workbench (Workshop Time Series Analysis widget / Quiver TS workflows)
  evidence: none
  gap: No UI layer exists in Altius by design (headless platform). Even as a headless concern, the prerequisite series APIs (capability rows above) are missing, so there is nothing for a third-party TS frontend to call.
- [FULL] Grouped aggregation / pivot backend over object sets
  evidence: @altius/spi StorageProvider.aggregateObjects + Aggregate* types (both providers); generated GraphQL Query.fooAggregate(filter, groupBy: [String!], fields COUNT/SUM/AVG/MIN/MAX) returning AggregateGrou
  gap: Working multi-dimension groupBy covers pivot semantics; minor gaps only — no approximate distinct count, percentiles, or waterfall/running-total functions.
- [ABSENT] Exploratory analysis workbench (Quiver canvas/graph mode, Workshop Free-form Analysis widget)
  evidence: none
  gap: No analysis-authoring environment or card/DAG model. The data operations each card performs (filter, aggregate, traverse links) exist as API calls, so a third-party notebook/BI tool could be built against the GraphQL sur
- [PARTIAL] Saved and shareable exploration artifacts (saved analyses, saved explorations, object sets as resources)
  evidence: ObjectSetManager (packages/engine) + PostgresObjectSetStore (storage-postgres/src/object-sets/); REST /api/v1/object-sets CRUD + GET /:id/aggregate; GraphQL objectSet/objectSets queries and create/upd
  gap: Only single object-set definitions (filter + one saved aggregation) are persistable — no multi-card analysis documents, no chart/canvas state, no resource RID ecosystem or cross-app loading. The store/API pattern exists;
- [FULL] Graph traversal query primitive (search-around equivalent, data layer)
  evidence: @altius/spi StorageProvider.traverse with TraversalPath/Step/Options/TraversalResult, implemented in both providers as SQL joins over link tables with guards (depth <= 10, 10k node-visit cap); GraphQL
  gap: Traversal semantics are covered and authz-safe. Gaps are peripheral: no saved/named 'search around' resources or search-around functions, and the AGE Cypher graph is effectively write-only (read paths use SQL joins), so 
- [ABSENT] Interactive graph visualization and exploration (Vertex): styling, histogram filtering, templates, URL-generated graphs, embedding
  evidence: none
  gap: Entire capability is UI-layer, absent by design. Backend feeds exist (traverse, fooAggregate groupBy for histogram counts, link resolvers), but there is no graph-resource/template concept, no layout/styling persistence, 
- [ABSENT] Event objects and timeline analytics (events with start/end, badges, thresholds, time selection/scrubbing)
  evidence: none
  gap: Altius CloudEvents (altius.object.*/link.* on the event bus) and GraphQL fooChanged subscriptions are system change notifications, not analytic event objects. An event with start/end DateTime fields is trivially modelabl
- [ABSENT] Process modeling and process mining (Machinery)
  evidence: none
  gap: No process-model resource and no mining. Nearest primitive: packages/actions YAML manifests with CEL preconditions can enforce input-state constraints per action (analog of submission criteria), and audit records + objec
- [PARTIAL] Object filtering and full-text search exploration layer
  evidence: @altius/spi FilterExpression/FieldPredicate/LogicalPredicate with generated GraphQL FooFilter (AND/OR/NOT, per-type operator sets) and FooOrderBy; searchObjects in both providers surfaced as GraphQL s
  gap: Filtering is complete and conformance-tested. Full-text search is materially weaker than Foundry's: Postgres runtime uses ILIKE '%q%' table scans with CASE-WHEN scoring — the generated tsvector GIN indexes are never used

## scenarios-sim
VERDICT: Scenario/simulation is a wholly missing pillar in Altius: parity is near-zero on everything simulation-specific (no what-if sandbox, no scenario persistence, no model registry/inference, no chained orchestration, no UI), while the substrate Foundry builds scenarios on is largely present (governed transactional actions with CEL, graph traversal, temporal as-of reads, pack-based packaging). The single most impactful gap is the absence of any hypothetical-execution/branching mechanism — every action writes immediately to the live ontology, so there is nothing to stage, compare, save, or apply; the SPI Transaction contract plus the existing *_history temporal tables are the natural hooks for building one.
- [ABSENT] What-if scenario simulation (create scenario, override model inputs, run, compare against auto-run baseline)
  evidence: none — no sandbox/branch/hypothetical-execution mode anywhere; packages/engine ObjectManager/LinkManager and packages/actions ActionExecutor always write to live storage through the SPI
  gap: Entire simulation layer is greenfield. Nearest hooks: SPI Transaction contract (packages/spi/src/storage-provider.ts) could host a run-and-rollback dry-run mode cheaply, and *_history temporal tables give as-of reads, bu
- [PARTIAL] Scenario staging and transactional apply (hold a set of Actions un-applied, then apply all-or-nothing to the Ontology, gated by an apply-Action's permissions)
  evidence: The transactional-apply half exists: packages/spi Transaction (beginTransaction/commit/rollback), ActionExecutor's 8-stage pipeline commits all effects of one action atomically with compensating-trans
  gap: No deferred/staged execution: actions run immediately, there is no buffer holding N pending actions for a later batch apply, and bulkMutate is explicitly non-transactional (storage-postgres bulkMutate: sequential, partia
- [ABSENT] Scenario persistence and sharing as Ontology objects (scenario trait, typeclasses, save/load via Actions and object sets)
  evidence: none for scenario state; the closest pattern is the saved-object-set store — ObjectSetManager with REST /api/v1/object-sets CRUD + execute/aggregate and GraphQL objectSet mutations (packages/engine ob
  gap: No scenario object kind, no versioned scenario RID, nothing to persist because scenarios don't exist. Once a scenario/changeset primitive exists, the object-set store and ODL typeclass-free schema could model it, but tod
- [ABSENT] ML model asset registry and lifecycle (model artifacts + adapters, version history, permissioning, lineage, Modeling Objectives review/release)
  evidence: none — no model registry, no artifact storage, no adapter concept anywhere in the maps; the only versioned-registry machinery is the ODL schema registry (packages/odl registry + storage-postgres Postg
  gap: Whole ML platform pillar missing and out of current scope (headless ontology platform). The schema-registry pattern (versioning, advisory-locked applies, migration gating) is a proven template if a model registry were ev
- [ABSENT] Model inference execution (no-code live deployments, batch inference, inference history)
  evidence: none — no inference runtime; only outbound-call primitives exist: webhook side-effects via injected HttpClient fetch (packages/actions side-effect-executor, wired in packages/api/src/server.ts) and a 
  gap: Could be approximated short-term by webhook side-effects calling an externally hosted model, but there is no model invocation contract, no result capture into the ontology, no inference history. Greenfield.
- [ABSENT] Chained model orchestration (auto-propagate one model's outputs as the next model's inputs across a multi-model case study)
  evidence: none — no DAG/orchestration engine and no scheduler anywhere (packages/sync explicitly has no driver loop; SyncConfig.interval parsed but never consumed); action side-effects are flat post-commit list
  gap: Requires both a model-invocation layer (absent, see inference) and a dependency-graph executor (absent). Note Foundry itself sunset this in favor of composing function-backed Actions — the Altius-shaped equivalent would 
- [PARTIAL] Business logic as ontology-bound functions (Functions on models published as function-backed Actions, the recommended scenario logic path)
  evidence: Declarative governed logic exists: YAML action manifests with CEL preconditions and effect expressions executed by ActionExecutor (packages/actions), with the Go cel-evaluator gRPC sidecar (packages/c
  gap: No user-authored code runtime: logic is limited to CEL expressions plus declarative set/create/link effects (effect values use a separate mini-DSL, resolveExpression). Arbitrary function authoring, a function registry, a
- [PARTIAL] Time series as simulation inputs/outputs (time window selection, smoothing, live polling, historic vs predicted comparison)
  evidence: Temporal object history only: per-type *_history snapshot tables power getObjectAtVersion/getObjectAtTime and QueryOptions.asOfVersion/asOfTime (packages/storage-postgres temporal-queries.ts, SPI cont
  gap: History-of-object-state is not a time-series store: no time-series property type in ODL, no windowed/smoothing/resampling queries, no live polling, no series-valued model I/O. A real time-series capability is a significa
- [FULL] System graph substrate (the object/link graph scenarios are configured against)
  evidence: The graph data layer is real and working: SPI traverse with TraversalPath/Options, SQL-join traversal with depth (10) and node (10k) guards (packages/storage-postgres/src/links/traversal.ts, storage-m
  gap: None at the data layer. The visual/system-graph document (saved graphs, node display, scope-to-graph filtering) is UI and covered under the UI-tooling row.
- [ABSENT] Scenario and graph UI tooling (Vertex canvas, scenario pane, Workshop scenario widgets/variables/buttons, Control Panel admin settings)
  evidence: none — Altius is explicitly headless (no UI layer); the only admin-ish surfaces are GET /admin/packs introspection and env/Helm deployment configuration (packages/api/src/server.ts, Orion/helm chart)
  gap: By design, not an oversight: Altius's generated GraphQL/REST/SDK surface is the substrate a UI would sit on. Runtime admin settings (Foundry Control Panel analogue) are also absent — all platform tuning is boot-time env 
- [PARTIAL] Packaging and distribution of reusable artifacts (Vertex graph templates in Marketplace products via DevOps)
  evidence: Domain packs are a working packaging/distribution mechanism: pack.yaml manifests bundling ODL schema, action manifests, .fga permission overrides, field permissions, connectors, and seeds, loaded from
  gap: Packs distribute ontology/logic/security artifacts but there are no template-like artifact kinds (graphs, scenarios, dashboards) to package, and no marketplace/store/install UX — distribution is filesystem mounts, not a 

## security-gov
VERDICT: Altius and Foundry solve security with different paradigms: Foundry's governance centerpiece in this doc set is mandatory access control (Markings) propagating along data lineage, while Altius ships a genuinely working discretionary/relationship stack (OpenFGA ReBAC, field-level redaction, consent, audit) with zero mandatory-control constructs. The single most impactful gap is the complete absence of a data-classification/marking layer (labels, conjunctive membership checks, lineage propagation, scoped sessions) — mitigated only by the fact that Altius's one shared authenticate→FGA→redact→consent pipeline gives a clean single insertion point to add it.
- [ABSENT] Markings: mandatory access-control labels with centralized administration
  evidence: none — no marking/label construct anywhere; closest primitives are discretionary: OpenFGA relations (packages/odl generateOpenFGASchema, packages/security AuthorizationService) and field permissions (
  gap: Greenfield: needs a label store, user-membership grants, and a conjunctive check inserted into the read path. A clean hook exists — every surface funnels through one authenticate→FGA→redact→consent pipeline (packages/api
- [ABSENT] Marking propagation along data lineage (inheritance, simulation, stop_propagating)
  evidence: Lineage primitives only: engine LineageRecorder (in-memory only, explicitly outside the SPI), lineage.field_provenance Postgres schema, FieldProvenance/ProvenanceSource SPI types. Nothing propagates s
  gap: Doubly greenfield: no marking construct to propagate, and no transform/pipeline layer to propagate through (Altius's only data-in path is sync ingestion, itself not wired end-to-end). The durable lineage store would also
- [ABSENT] Scoped sessions (session-restricted marking subsets)
  evidence: none — auth is stateless per-request OIDC JWT (packages/security/src/auth/oidc-authenticator.ts); no session or scoping construct
  gap: Greenfield and only meaningful after markings exist; would need a session-scoping claim honored by the shared authz pipeline. Low priority until capability 1 lands.
- [PARTIAL] Sensitive-data (PII) protection controls
  evidence: Working field-level machinery: @sensitive ODL directive (SDK emits T | Redacted with REDACTED symbol), permissions/field-permissions.yaml → FieldPermissionConfig → AuthorizationService redaction (visi
  gap: Mechanism is discretionary and role/relationship-derived — there is no mandatory, category-based control a DPO can centrally grant/audit ('who may ever see PII'), and redaction config is per-pack YAML, not centrally admi
- [PARTIAL] Layered permission separation (app/module vs data vs action vs function)
  evidence: The data-side layers all exist independently: per-object FGA viewer checks on every surface (REST/GraphQL/FHIR/CDM/subscriptions), per-action can_* relations via actionPermissionRelation (packages/odl
  gap: No module/app permission layer because Altius is headless by design (no UI artifacts to permission), and no function-level permissioning (no user-facing function resource; CEL sidecar is internal). The data/action/field 
- [PARTIAL] Project-hierarchy permission inheritance and ontology-resource governance
  evidence: Ontology-change governance exists but is git/registry-shaped, not hierarchy-shaped: odl diff/classify (SAFE/COMPATIBLE/BREAKING), MigrationPlan-gated applySchema, PostgresSchemaRegistry (versioned JSO
  gap: No runtime permission hierarchy over schema resources (no projects/folders/roles on object types) — pack files in git are the de facto ACL. Also the boot path auto-approves BREAKING changes ('Recorded at server boot'), s
- [ABSENT] Permission checking / access-explanation tooling
  evidence: No explain/why surface. Internal hooks only: AuthorizationService.check/listObjects, boot-time assertFgaModelCoverage validation, and the hand-rolled fga-dsl-to-json parser in packages/api/src/server.
  gap: Moderate-effort feature on existing primitives: an endpoint composing FGA check/expand + field-permission + consent evaluation for a target user would reuse the whole existing stack; OpenFGA's expand API is unused. Green
- [PARTIAL] Approval/proposal workflows with attribute-based submission criteria
  evidence: The enforcement primitive exists and works: CEL preconditions in the 8-stage action pipeline (packages/actions ActionExecutor + packages/cel-evaluator Go sidecar) support actor.hasRole/hasPermission, 
  gap: No shipped proposal/approval object model or review workflow — a domain pack would have to model Proposal objects plus approve/reject actions itself (feasible today with existing ODL + manifest machinery, but nothing is 
- [PARTIAL] AI/agent write governance (human-approved, non-destructive agent access)
  evidence: The core governance property — agents can only act through governed actions — has a substrate: tool-registry.ts (packages/actions) derives LLM tool descriptors from action manifests, ToolKind/ToolDesc
  gap: No MCP server, no LLM/agent layer at all (stated platform gap), and no human-approval proposal gate for agent-initiated changes — the tool registry is descriptors-only today. The pipeline guarantees are real; the agent-f
- [ABSENT] Checkpoints: justification capture for sensitive actions
  evidence: Audit trail exists (AuditWriter → audit.audit_records with OTel traceId; auditDenied for refusals) but nothing prompts for or stores a user justification, and there is no checkpoint configuration or r
  gap: Small-to-moderate: a required 'justification' action param plus audit-detail capture could be declared per-manifest today with zero engine changes; a reusable checkpoint framework (config, enforcement across surfaces, re
- [PARTIAL] Access-decision audit trail (DPO auditability)
  evidence: Systematic auditing: every action audited post-commit, authz/consent denials audited (auditDenied), relationship grants/revokes and consent writes/denials audited (relationships/router.ts, consent/rou
  gap: Append-only is application-level only (ddl-audit.ts has no REVOKE/GRANT despite the interface doc claiming it), audit writes are best-effort post-commit, and there is no API/UI surface exposing audit queries — the query 
- [PARTIAL] Organization/tenant boundary isolation
  evidence: Row-level multi-tenancy enforced everywhere: _tenant_id composite PKs and tenant-scoped unique indexes (storage-postgres), RequestContext.tenantId threaded through every SPI call, fail-closed 401 on m
  gap: Isolation is app-layer only — Postgres RLS is explicitly deferred post-MVP (documented in consent DDL), so a query-construction bug bypasses tenancy; and there are no cross-org collaboration/sharing constructs (Foundry's

## aip-agents
VERDICT: Altius has near-zero parity with the AIP layer: no LLM gateway, no agent runtime, no evals, no copilots, no token metering — the platform brief's "no LLM/agent layer, no scheduler" is confirmed by the code maps. Its two genuine AI-facing assets are exactly the substrate Foundry agents sit on: an ontology-derived LLM tool registry (ToolDescriptor per ActionType with JSON-Schema params) and the 8-stage governed action pipeline that would subject any AI caller to the same authz/consent/audit as humans. The single most impactful gap is the absent LLM access + agent-orchestration runtime that would consume those tool descriptors; everything else in this theme stacks on top of that.
- [ABSENT] Managed multi-provider LLM gateway (model access, enablement, capacity)
  evidence: none — the surface map's exhaustive egress enumeration (packages/api, packages/actions SideEffectExecutor, Helm NetworkPolicy allowlist: Postgres/OpenFGA/OTLP/Redis/Kafka/443-webhooks) shows no LLM pr
  gap: Pure greenfield: an LLM client/router service plus model-enablement config. Nothing in Altius blocks it (env-driven config and sidecar patterns exist, cf. cel-evaluator), but no hook exists today.
- [ABSENT] Embedding / vector services and semantic retrieval
  evidence: none — full-text search in packages/storage-postgres is ILIKE '%q%' scoring (search.ts; the generated tsvector GIN indexes are never queried); no pgvector, no embedding pipeline anywhere
  gap: Greenfield, but Postgres 17 storage makes pgvector a natural bolt-on; the SPI IndexDefinition path (ddl-objects.ts) is where an EMBEDDING index kind would slot in. Requires an embedding-model caller that does not exist (
- [PARTIAL] Ontology-derived LLM tool registry (tool factory)
  evidence: packages/actions/src/tool-registry.ts derives LLM tool descriptors from ODL ActionType definitions; GraphQL Query.availableTools(filter) returns one ToolDescriptor per @actionType with JSON-Schema par
  gap: Descriptors are generated but nothing consumes them: no agent/LLM runtime, dryRunSupported=false and reversible=false are hardcoded, tags empty, and discovery does no per-user authorization filtering. Closing = build a c
- [ABSENT] Agent construction and orchestration (Chatbot Studio, AIP Logic, Threads)
  evidence: none — no agent runtime, prompt/session state, or LLM-function abstraction exists in any package; the only 'logic' engines are the deterministic CEL sidecar (packages/cel-evaluator) and YAML action ma
  gap: Greenfield agent layer. The invocation substrate (governed actions via POST /api/v1/actions/{Name}, tool descriptors) exists, so an external agent framework could be wired against the API today, but Altius ships no in-pl
- [ABSENT] Agent evaluation framework (AIP Evals)
  evidence: none — test tiers (tests/pilot-scenarios, spi-conformance, integration) are conventional vitest suites for platform correctness, not LLM/agent evaluation harnesses
  gap: Greenfield; depends entirely on an agent/LLM layer existing first.
- [ABSENT] MCP server for external AI IDEs and agents (Palantir MCP)
  evidence: none as protocol — no MCP server code exists; the raw context surface it would wrap does exist: GraphQL introspection + Query.availableTools, GET /api/v1/openapi.json, spec/dump-schema.ts SDL + AsyncA
  gap: Moderate lift, not greenfield-hard: an MCP server would be a thin adapter over the existing machine-readable schema/tool/OpenAPI surfaces plus the odl CLI for schema changes. Missing entirely: proposal/review workflow fo
- [ABSENT] LLM compute/token metering and attribution
  evidence: none — no token accounting exists because no LLM calls exist; the metering substrate is generic only: prom-client HTTP metrics in packages/api/src/metrics.ts, OTel spans via packages/observability, pe
  gap: Depends on the LLM gateway; once one exists, attribution hooks (tenant/actor/traceId in RequestContext, audit trail) are already threaded through every call path, so metering is an increment, not a rearchitecture.
- [PARTIAL] Uniform governance of AI actors (agents under same security/audit as humans)
  evidence: The 8-stage action pipeline (packages/actions/src/action-executor.ts: validate→authorise→consent→preconditions→execute→side-effects→audit→emit) governs any caller identically — OIDC identity (packages
  gap: The substrate is genuinely agent-ready (an agent is just another OIDC principal calling governed actions), but there is no agent identity/service-account concept, no human-in-the-loop approval step in the pipeline, and n
- [PARTIAL] Human-in-the-loop change proposals for AI-driven modifications
  evidence: Schema-change gating only: odl diff/classify (SAFE/COMPATIBLE/BREAKING) with SchemaRegistry.applySchema refusing BREAKING diffs without an approved MigrationPlan (packages/odl registry, PostgresSchema
  gap: The MigrationPlan approval object exists but has no workflow around it — the boot path auto-approves ('Recorded at server boot'), and there is no staged-edit/proposal mechanism for object data at all. Real enforcement is
- [PARTIAL] No-code business rules over data (Foundry Rules logic)
  evidence: Closest analogs: CEL expression evaluation via the Go sidecar (packages/cel-evaluator, custom fns has_link/count_links/hasRole/validateJsonSchema) and declarative YAML action manifests with preconditi
  gap: No batch rules engine: nothing evaluates logic over object/dataset populations, no logic-block pipeline (filter/aggregate/join composition), no authoring UI, no output-dataset mapping. CEL gives single-record predicates 
- [PARTIAL] Operational automation (scheduled + event-driven)
  evidence: Event primitives exist: EngineEventEmitter → EventBus with RedpandaEventBus (CloudEvents on Kafka topic + DLQ), GraphQL subscriptions with per-event FGA rechecks, and post-commit webhook/event side-ef
  gap: Missing the automation engine itself: no cron/scheduler service, no condition-monitor that subscribes to events and triggers actions, no notification framework. The event bus is the hook — an automation consumer subscrib
- [ABSENT] Embedded AI copilots across platform applications
  evidence: none — Altius is headless with no UI layer at all (architecture brief; no frontend package exists in the workspace)
  gap: Out of scope for a headless platform until a UI exists; doubly gated behind the absent LLM gateway. Not a meaningful near-term target.

## platform-ops
VERDICT: Platform-ops parity is low-to-moderate: Altius covers the developer-facing halves well (pack-based product packaging, declarative action rules, webhook side effects, CloudEvents emission, Helm-based delivery, infra monitoring) but has nothing above the action pipeline — no scheduler, no trigger/automation engine consuming its own event bus, no end-user rule authoring, and no UI-layer features at all. The single most impactful gap is the missing automation/rules-execution layer: Foundry Rules + Automate + schedule-triggered builds have no Altius counterpart, so everything reactive beyond an action's own post-commit side effects is greenfield even though the event-bus substrate (Redpanda topic, DLQ, CloudEvents envelope, per-object subscriptions) is already built.
- [PARTIAL] Marketplace product packaging & managed installation
  evidence: Domain packs are the packaging analog: pack.yaml manifest (name/version/namespace/dependencies/capabilities/schema/actions/permissions/connectors/seed), loadDomainPacks in packages/api/src/schema-load
  gap: No storefront/discovery or runtime install — packs load only at boot; no installation modes, managed upgrades or maintenance windows; dependency constraints are '>=' only and unsatisfied deps merely warn. The pack loader
- [ABSENT] No-code end-user rule authoring with proposal/approval workflow and generated execution pipeline (Foundry Rules)
  evidence: none — closest primitives are the packages/cel-evaluator Go sidecar (canonical CEL rule evaluation), developer-authored YAML action manifests (boot-loaded, not runtime-editable), and saved object sets
  gap: The entire runtime rule-object model (Rule/Proposal objects, approval actions, permitted-output-value config) and the rule-application pipeline over data are greenfield; Altius also has no dataset/build system for the pi
- [PARTIAL] Declarative action logic (ontology-edit rules)
  evidence: packages/actions ActionExecutor 8-stage pipeline (validate→authorise→consent→preconditions→execute→side-effects→audit→emit) with manifest effects createObject/updateObject/createLink/deleteLink/record
  gap: Function-backed rules (arbitrary code as the action body — Foundry's escape hatch) are missing: @function directive parses but has no runtime. Also no create-or-modify upsert rule, no interface-targeted rules, and undo/r
- [ABSENT] Action side effect: notifications (in-platform push + email with user preferences)
  evidence: none — packages/actions/src/sideeffects handles only 'webhook' and 'event' types (unknown types throw at execution); no notification service, delivery channels, or user-preference store anywhere in th
  gap: Greenfield, but the SideEffectExecutor type dispatch is a clean extension point: a 'notification' side-effect type plus a delivery service consuming the event bus would slot in without touching the pipeline.
- [FULL] Action side effect: webhooks to external systems
  evidence: SideEffectExecutor webhook type in packages/actions: config {url, headers, body, timeoutMs default 10s}, default 3 retries with exponential backoff, per-manifest rollback policies (LOG_AND_CONTINUE/RE
  gap: Minor deltas: post-commit only (Foundry supports pre-edit webhooks), always POST (manifest 'method' ignored), and no URL allowlist/SSRF validation — hardening rather than capability work.
- [ABSENT] Action-triggered scheduled builds (Schedule rule)
  evidence: none — Altius has no build system, no pipelines, no transforms, and no scheduler anywhere (packages/sync explicitly has no driver loop; SyncConfig.interval is parsed but never consumed).
  gap: Entirely greenfield and depends on capabilities Altius does not target (dataset pipelines). The nearest analog would be triggering a sync-connector extract from an action side effect, which would itself require building 
- [PARTIAL] Event-driven automation / condition-triggered logic (Automate, successor to Object Monitors)
  evidence: The event substrate exists end-to-end: EngineEventEmitter emits CloudEvents 1.0 for object/link changes, RedpandaEventBus publishes to the altius.events topic with a DLQ, pack manifests emit domain ev
  gap: Nothing consumes the bus to drive automation: no monitor/trigger engine, no condition evaluation over events, no scheduler for time-based triggers. An automation service would be a new consumer-group service, but the Clo
- [ABSENT] Workshop application UI runtime features (widget event system, URL routing/shareable state, module changelog & rebase)
  evidence: none — Altius is headless by design (no UI layer at all). The client-facing substrate a future UI would use exists: GraphQL subscriptions over graphql-ws, the generated AsyncAPI 2.6 spec (packages/api
  gap: Entire application-builder UI layer is out of scope/greenfield. Not a meaningful parity target for the headless platform except as SDK/subscription completeness (note the SDK client currently ships no transport and its l
- [PARTIAL] Versioned change management with diff, classification, and rollback
  evidence: For the ontology schema this is fully built: packages/odl diff/classify (SAFE/COMPATIBLE/BREAKING), reverseDiff for rollback classification, InMemorySchemaRegistry + PostgresSchemaRegistry (_schema_re
  gap: Versioning/diff covers only the ODL schema — action manifests, packs, FGA overrides, and connector configs have no version history or diff tooling; no merge/conflict resolution; and the boot path auto-approves breaking c
- [PARTIAL] Temporal events and time-series with thresholds (Vertex events)
  evidence: Event-shaped object types are trivially modelable: DateTime/Date/Duration scalars in the core pack, the Temporal interface, @indexed fields; per-object temporal history exists via *_history tables and
  gap: No time-series property type or series store (only per-object version snapshots), no severity/intent metadata convention, no threshold or alerting configuration, and no timeline exploration (UI-layer). A time-series SPI 
- [ABSENT] Process monitoring & process mining (Machinery)
  evidence: none — adjacent raw material only: the append-only audit trail (audit.audit_records), CloudEvents on every object/link change, per-object *_history tables, and aggregateObjects queries would supply th
  gap: Process-definition model, conformance checking, metrics computation, and all visualization are greenfield; the underlying event/history data is already captured, so this is an analytics-service build, not a data-capture 
- [PARTIAL] Continuous delivery & upgrade orchestration (Apollo)
  evidence: Standard cloud-native delivery exists: production Helm chart for the six first-party services (HPA on api-gateway, PDBs, liveness/readiness probes, default-deny NetworkPolicy with enumerated egress, p
  gap: No autonomous upgrade orchestration or mission-control plane — upgrades are operator-driven helm upgrade with k8s rolling updates; chart deploys apps only (all infra external); known dead config (HPA values without templ
- [PARTIAL] Platform health checks & operational monitoring
  evidence: Service-level monitoring is solid: /health (storage-aware readiness, 503 on degraded) + /healthz per service, gRPC health on the CEL sidecar, Prometheus /metrics (prom-client, cardinality-bounded labe
  gap: No data-flow/pipeline health checks (no pipelines exist; sync metrics openfoundry.sync.records_processed/lag_seconds are pre-declared in observability but never emitted from sync code), no dataset-freshness or build-stat

## misc-1
VERDICT: This chunk splits cleanly: on the ontology substrate it touches (core semantic model, governed action-based editing, change subscriptions, schema versioning/migration gating) Altius is at or near full parity, but every Foundry application-layer capability here (Map, Workshop widgets, commands, Vertex, Machinery, Foundry Rules UX, Marketplace) and the entire AIP layer (multi-model catalog, Logic, AI FDE, Evals, MCP servers) is absent or a thin primitive. The single most impactful closable gap is agent/LLM access: Altius already generates JSON-Schema tool descriptors for every action (availableTools / tool-registry.ts), so an MCP server wrapping the existing governed GraphQL/actions API is a small step that would match Foundry's flagship Ontology-MCP direction — whereas branching/proposals and the UI layer are true greenfield.
- [FULL] Ontology core semantic model (object/link/action types, properties, shared vocabulary, interfaces)
  evidence: packages/odl parser → ParsedSchema (@objectType/@linkType/@actionType/@param, enums, scalars, interfaces); domain-packs/core core.odl interfaces (Identifiable/Auditable/Locatable/Temporal/CodeableConc
  gap: Foundry Functions are only a parsed @function directive (zero uses, no runtime); computed fields have one builtin (countLinks). Function execution runtime is greenfield; the rest is at parity.
- [FULL] Governed object/link editing with writeback and external edit APIs
  evidence: packages/actions 8-stage ActionExecutor (validate→authorise→consent→preconditions→execute→side-effects→audit→emit); YAML manifest effects updateObject/createObject/createLink/deleteLink/recordConsent;
  gap: No writeback-dataset separation (original vs edited data with distinct view permissions) — edits mutate the row, history tables give versions. Bulk-action SDL types exist but the submitBulkAction resolver is a TODO.
- [ABSENT] Interactive geospatial mapping (Map app: layers/overlays, geo search, search-around, annotations)
  evidence: none — only a GeoPoint scalar and Locatable interface (domain-packs/core/core.odl) and the SPI traverse primitive for link traversal.
  gap: Greenfield: no geospatial predicates in FilterExpression (eq/ne/in/gt/lt only), no PostGIS/geo index, no layer/annotation model, no UI. Search-around's underlying link traversal does exist (StorageProvider.traverse, @lin
- [PARTIAL] LLM/agent tool access to platform (Ontology MCP, Palantir MCP, OAuth grant types)
  evidence: Query.availableTools returns a ToolDescriptor per ActionType with JSON-Schema parameters (spec 5.7; packages/actions tool-registry.ts, resolver in packages/api); actions execute under full OpenFGA+CEL
  gap: No MCP protocol server — closing it is a wrapper over the existing GraphQL/actions API (hook exists, moderate effort). Tool surface is actions-only (no schema-editing/SQL/platform-ops tools); OAuth client management is d
- [ABSENT] No-code operational app building (Workshop widgets, layouts, variables; Object Views)
  evidence: none — headless by design; pack.yaml 'provides: widgets' count is dead metadata read by no code.
  gap: Entire UI layer is greenfield. The generated GraphQL API and the typed SDK generator (packages/odl codegen/sdk.ts, transport not yet wired) are the intended substrate for external UIs.
- [PARTIAL] Live data push / auto-refresh
  evidence: Per-object-type GraphQL subscriptions fooChanged(id)/foosChanged(filter) over graphql-ws; CloudEvents bus (RedpandaEventBus topic altius.events, in-memory fallback) bridged by SubscriptionManager; eve
  gap: Headless change-push primitive is solid; missing: link-driven changes never reach type-level subscribers (acknowledged TODO in subscription-manager.ts), in-memory bus is single-pod/lossy, and any client-side refresh orch
- [ABSENT] Cross-application commands (declared client-side operations, command chains, commands-as-chatbot-tools)
  evidence: none — no UI applications exist to interoperate; nearest primitive is the server-side availableTools action-descriptor surface.
  gap: Meaningless without an app layer; the LLM-tool slice of commands is partially covered by the tool registry (see MCP entry).
- [PARTIAL] Platform-wide branching, proposals, and merge (Global Branching; Workshop branch/rebase; branch-aware tooling)
  evidence: Linear schema versioning only: packages/odl diff/classify (SAFE/COMPATIBLE/BREAKING) with MigrationPlan gating and reverseDiff rollback; InMemorySchemaRegistry + PostgresSchemaRegistry (advisory-lock 
  gap: No branches, no proposals/approvals, no merge/rebase, no data branching; boot path auto-approves even BREAKING changes ('Recorded at server boot'). Branch/proposal workflow is greenfield, though the diff/classify machine
- [ABSENT] Classification-based access controls (hierarchical markings, disjunctive releasability, inherited data classification)
  evidence: none — authorization is discretionary ReBAC (OpenFGA) plus field redaction (@sensitive, permissions/field-permissions.yaml) and consent; no marking primitive, no hierarchy, no mandatory-control ubiqui
  gap: OpenFGA could encode marking groups, but hierarchy semantics, conjunctive/disjunctive category evaluation, and lineage-based classification inheritance are greenfield.
- [PARTIAL] Ontology lifecycle governance (cleanup queue, deprecation, usage-flag-driven safe deletion)
  evidence: @deprecated(reason) directive parsed (packages/odl); type removal classifies as BREAKING and both schema registries refuse it without an approved MigrationPlan.
  gap: No usage analytics, no flag/queue tooling, no deprecation surfaced to API consumers. The migration gate is the only guard; cleanup workflow is greenfield but low-risk to add on top of the registry.
- [PARTIAL] Operational no-code rules engine (Foundry Rules: business-user-authored rules executed as pipelines with proposal review)
  evidence: Expression primitives only: packages/cel-evaluator Go CEL sidecar (has_link, count_links, hasRole, ISO-8601 duration, validateJsonSchema), @constraint field/type-level CEL, YAML action preconditions.
  gap: Rules are developer-authored schema/manifest artifacts loaded at boot — no runtime rule authoring/versioning by business users, no batch rule execution over object sets, no output datasets, no proposal workflow, and the 
- [ABSENT] Time-series and process monitoring applications (Vertex thresholds, Machinery process mining)
  evidence: none — no time-series property type, thresholds, alerting, or process-mining analytics. Raw materials exist: per-type *_history tables (storage-postgres temporal-queries.ts), CloudEvents change feed w
  gap: Greenfield apps; the history tables + event feed are exactly the state-transition log Machinery requires, so an external process-mining consumer could be fed without core changes.
- [ABSENT] LLM application platform (AIP: multi-model catalog, prompt engineering, AIP Logic block orchestration, token/rate governance)
  evidence: none — no LLM invocation anywhere in the codebase; only the actions tool-descriptor surface intended for external agents (packages/actions tool-registry.ts).
  gap: Model gateway, prompt/orchestration runtime, and LLM capacity management are all greenfield. API-level per-principal/tenant rate limiting (Redis sliding-window) exists but has no LLM/token dimension.
- [ABSENT] Autonomous platform engineering agent and evaluation harness (AI FDE, AIP Evals, Model Evaluations)
  evidence: none.
  gap: Depends on two layers Altius lacks (LLM runtime and branching/proposal workflow); fully greenfield.
- [ABSENT] Ad-hoc SQL analytics over the ontology (SQL Studio / Ontology SQL)
  evidence: none exposed — data physically lives in Postgres tables (one per ObjectType, storage-postgres), so raw SQL is possible for operators, but no governed SQL surface exists; query surface is generated Gra
  gap: Exposing raw SQL would bypass the entire authenticate→FGA→redaction→consent pipeline (enforced only in the API layer, RLS explicitly deferred post-MVP); a governed SQL surface is greenfield.
- [PARTIAL] Third-party application platform (Developer Console: OAuth clients, scoped tokens, service users, OSDK)
  evidence: OIDC resource-server auth: packages/security OidcAuthenticator (jose + remote JWKS, aud/tenant_id/flat-roles contract), Keycloak realm with protocol mappers (deploy/keycloak/openfoundry-realm.json); c
  gap: App registration, scopes, and consent live entirely in the external IdP — no first-party app-management or per-app resource scoping. The generated SDK ships no runtime transport (query/mutate/subscribe throw), has no CLI
- [PARTIAL] Packaged product distribution and install (Marketplace, bulk install/upgrade)
  evidence: Domain packs are the install unit: pack.yaml (schema/actions/permissions/connectors/seed/capabilities), deterministic discovery + DOMAIN_PACKS_EXTRA_DIRS / Helm domainPacksExtra mounting, dependency c
  gap: Boot-time file mounting, not a catalog: no store, no versioned upgrade/uninstall, dependency checks are warn-only ('>=' semantics only), first-wins name collisions, no input-mapping UX.

## misc-2
VERDICT: This bucket is dominated by Foundry's application/UI surface (Map, Workshop mobile/kiosk/formatting, Vertex, Ontology Manager, AI FDE) where headless Altius is deliberately absent — 8 of 18 capabilities have no equivalent and mostly should not, though geospatial querying, media storage, and a model/simulation layer are genuine backend gaps hiding inside those UI docs. Where the docs describe platform semantics rather than UI, Altius holds up well: ontology-as-code (full, arguably stronger than Foundry's JSON export) and transactional action writeback with version-conflict detection (full), with partial credit for derived properties, saved-query execution, connector plumbing, and conflict resolution. The single most impactful gap is the absence of any user-authored function/rule runtime — it is the common dependency behind derived-property math, Foundry Rules, and the published-query API, and nothing in Altius today provides deployable user code.
- [ABSENT] Interactive geospatial Map application (layers/base layers, find/geocode, histogram property faceting+filtering, selection, time selection, draw/measure/annotate shapes, search-around, capture, saved maps)
  evidence: none as a feature; only adjacent primitives: GeoPoint scalar in domain-packs/core (mapped to {lat,lng} in the generated SDK, packages/odl/src/codegen/sdk.ts), and backend aggregate/groupBy endpoints (
  gap: Entire UI layer is out of scope for headless Altius; additionally no geospatial query operators or geo indexing exist in SPI FilterExpression (GeoPoint is a bare scalar), so even a third-party map frontend would lack bbo
- [ABSENT] Mobile application delivery (Workshop mobile modules, mobile-optimized widgets, dedicated mobile app launcher, MDM/VPN/network-access and SSO guidance)
  evidence: none; the OIDC/JWKS auth stack (packages/security/src/auth/oidc-authenticator.ts) and GraphQL/REST gateway (packages/api) could back a customer-built mobile client, but no app-building or launcher sur
  gap: No UI layer at all. A mobile client would be a from-scratch external app consuming the generated GraphQL/REST APIs; the auth hook (OIDC bearer + tenant claim) is the only piece already in place.
- [ABSENT] Kiosk mode (long-lived, read-only, permission-scoped display sessions with admin allowlisting and session launch history)
  evidence: none; nearest primitives are ReBAC viewer-only relations (packages/odl OpenFGA generation, packages/security AuthorizationService) and the read-only FHIR/CDM facades (packages/api cdm/router.ts return
  gap: No session concept beyond JWT lifetime, no scoped-token minting, no session registry. Could be approximated with a viewer-only service identity, but scoped-session machinery is greenfield.
- [PARTIAL] Runtime derived properties (linked property passthrough, linked aggregations across links, column math between properties)
  evidence: @computed(fn, args, cache, ttl) ODL directive + ComputedFieldEvaluator in packages/engine, but the only registered builtin is countLinks with LAZY cache; 1:1 linked-property display is separately cove
  gap: One builtin (countLinks) vs Foundry's linked aggregations (sum/avg/etc. with filters) and column math; computed fields are excluded from filters/orderBy (surface map, Ward.currentOccupancy). The evaluator and directive p
- [ABSENT] Value and conditional formatting metadata (display-friendly rendering rules for values, numbers, sparklines)
  evidence: none; ODL has no render-hint or formatting directives (packages/odl/src/parser/types.ts directive set is @primary/@sensitive/@link/@computed/@immutable/etc.)
  gap: Pure presentation metadata with no consumer in a headless platform; would only matter if a UI layer is built. Low priority; would be an additive ODL directive (SAFE schema change).
- [ABSENT] No-code business rules engine (Foundry Rules: window/aggregation/join/expression/select/union logic boards, time series boards, Contour import, deployable rule pipelines)
  evidence: none; the CEL evaluator sidecar (packages/cel-evaluator, cel-go with has_link/count_links/hasRole custom functions) and YAML action manifests (packages/actions parser) express per-action gating logic 
  gap: CEL preconditions gate individual action executions — there is no standing-rule evaluation over data, no batch execution, no windows/joins/aggregation logic, and Altius explicitly has no scheduler to drive periodic evalu
- [PARTIAL] Environment-portable configuration for packaged logic (custom aliases: named config values decoupled from code, installer-configurable via Marketplace)
  evidence: domain packs achieve the same decoupling via ${ENV_VAR} placeholders in connector YAML (e.g. ${PAS_DB_URL} in domain-packs/nhs-acute/connectors/pas-jdbc.yaml) and env-driven governance vocab (CONSENT_
  gap: Config portability exists at the deployment/pack level but there is no per-repository alias store or install-time parameter UI, and no user function runtime to consume aliases. Equivalent for the pack use case; absent fo
- [ABSENT] User-authored serverless functions (TypeScript v2/Python code repositories, ontology edits from functions, unit testing, publish/deploy)
  evidence: none; only in-process extension points exist: the computed-field builtin registry (packages/engine ComputedFieldEvaluator), the sync mapping DSL's custom() transform registry (packages/sync mapping, m
  gap: No function runtime, no code-repo tooling, no publish/version surface. This is the deepest platform gap in this bucket: derived logic, rules, and query functions all presuppose it. Greenfield (a sandboxed runtime or webh
- [PARTIAL] Published query execution API (POST /api/v2/ontologies/{o}/queries/{q}/execute with parameters, version pinning, branches, ontology transactions, scenario context, rich value-type wire format)
  evidence: saved object sets: POST/GET /api/v1/object-sets CRUD plus GET /api/v1/object-sets/:id/execute and /:id/aggregate (packages/api relationships of ObjectSetManager + PostgresObjectSetStore), re-authorize
  gap: Altius executes saved declarative queries, not user-defined query functions; no query versioning/publishing, no branches, no scenario context, no transaction-scoped reads via API, and a much thinner value-type system (no
- [FULL] Ontology-as-code export/edit/import (dump schema to a file, edit in a code editor, re-import; copy one ontology's state to another)
  evidence: schema-as-code is Altius's native authoring model, not an escape hatch: domain-packs/*/schema/*.odl files are the source of truth, the odl CLI (packages/odl bin) does validate/diff/apply/generate/roll
  gap: None — Altius exceeds Foundry here (Foundry warns 'do not depend on the exported JSON schema'; ODL is a stable, validated, diffable contract). Only caveat: cross-environment copy is by copying pack directories, and boot-
- [PARTIAL] Ontology metadata catalog with search (searchable index of object/link/action types, shared properties, interfaces, functions; visibility/status/indexing-issue filters)
  evidence: machine-readable introspection only: GET /admin/packs (per-pack type/connector/fga counts), GET /api/v1/openapi.json, generated GraphQL schema introspection, schema registry version history (packages/
  gap: All the metadata is queryable but there is no catalog/search surface and no per-type health/usage reporting (no analog of indexing-issue flags or usage views). A thin catalog app over existing endpoints would close most 
- [FULL] Transactional object writeback via Actions with version consistency (edits applied through actions, read-your-writes, StaleObject/version-conflict detection, edit history retention)
  evidence: the 8-stage ActionExecutor (packages/actions/src/action-executor.ts) mutates only inside SPI transactions (BEGIN/COMMIT in storage-postgres); optimistic concurrency via expectedVersion → err.code='VER
  gap: Effectively none for the core semantics — synchronous Postgres writes give stronger read-your-writes than Foundry's Funnel queue/offset design. Minor deltas: no property-level staleness refinement (Foundry OSv2's reduced
- [PARTIAL] Datasource-vs-user-edit conflict resolution (user-edits-win vs latest-value-wins strategies when synced source rows and action edits touch the same object/properties)
  evidence: packages/sync/src/conflict ConflictResolver implements per-field LAST_WRITE_WINS / SOURCE_PRIORITY / ACTION_PRIORITY (ACTION_PRIORITY ≈ 'user edits win' for protected fields)
  gap: The mechanism exists but is not live: the CDC write path is not wired end-to-end (no code instantiates CdcConsumer in production, ChangeApplier host implementation missing), no producer stamps the 'action:' source prefix
- [PARTIAL] Prebuilt enterprise source-connector catalog (Palantir-provided drivers, e.g. Microsoft Dynamics 365 Business Central: OAuth/AzureAD auth schemes, managed egress policies, agent proxy for on-prem)
  evidence: packages/sync connector SPI + plugin registry (createDefaultRegistry: jdbc/Postgres real, rest stubbed); packs declare connector manifests (DatasourceMappingConfig YAML with ${ENV_VAR} connection plac
  gap: One real connector (JDBC/Postgres) vs a catalog of hundreds; no OAuth connector auth, no egress-policy management, no agent proxy, and no scheduler/driver loop to run syncs (SyncConfig.interval parsed but never consumed)
- [PARTIAL] External AI/IDE access via MCP (Palantir MCP server: external agents like Claude Code/Cursor read data+metadata under user-token permissions, admin-enabled per user/group in Control Panel)
  evidence: packages/actions tool-registry.ts derives LLM tool descriptors from action manifests, and the generated GraphQL schema exposes an availableTools query (surface map: core pack yields Query.availableToo
  gap: No MCP protocol server, no packaged IDE integration, no admin gating of AI access. The hard part (permission-enforced, tool-shaped action descriptors) exists; an MCP adapter over availableTools + the REST action routes i
- [ABSENT] AI FDE agentic platform assistant (mode-scoped agent that performs platform work: data integration, ontology editing, functions, governance audit, ML, OSDK React; capabilities incl. plan generation, clarification, executing actions)
  evidence: none; Altius has no LLM/agent layer by design — the only related artifact is the action tool-descriptor registry (packages/actions tool-registry.ts) intended for external agents
  gap: Entire agent product is out of scope. Altius's plausible position is being a good agent target (headless APIs + tool registry) rather than shipping an agent; anything more is greenfield including LLM provider integration
- [ABSENT] Model integration and productionization (import models from in-platform training, uploaded files, containers, or external hosts; model adapters; Modeling Objectives lifecycle)
  evidence: none; no model registry, serving, or adapter concept anywhere in the architecture or surface maps (the only external compute sidecar is the Go CEL evaluator, which is expression evaluation, not ML)
  gap: Complete model layer missing. The SideEffectExecutor webhook egress (packages/actions + api HttpClient) is the only hook by which an externally-hosted model could participate in workflows today. Greenfield.
- [ABSENT] Vertex digital-twin visualization and simulation (object-backed process/system diagrams, what-if simulation over connected models, media layers and image annotations on maps/images)
  evidence: none; adjacent primitives only: the Apache AGE graph is maintained write-side but effectively write-only in read paths (storage-postgres), SQL-join traversal serves link queries, and annotation-like o
  gap: Simulation requires both a scenario branching mechanism over object state and a model-serving layer, neither present; media layers additionally require binary/media storage which the SPI does not define. Among the larges

## misc-3
VERDICT: This chunk splits cleanly in two: for ontology governance mechanics (schema versioning/rollback, required properties, action parameters, tool exposure, usage signals) Altius has genuine headless primitives — mostly partial parity with clear extension seams — while every application-layer capability (Ontology Manager UI, Workshop UX features, Map, Vertex, Machinery) and the AI layer (LLM proxy, MCP) is absent, consistent with Altius's stated headless/no-LLM scope. The single most impactful gap is the total absence of any scheduler or build-orchestration layer: nothing in Altius can run on a schedule, which leaves even its own sync engine an inert library and blocks the entire Foundry-style pipeline capability class.
- [PARTIAL] Multi-ontology governance (org-scoped and cross-org shared ontologies mapped 1:1 to spaces/markings)
  evidence: Domain packs with dot-namespaces are the ontology-partitioning unit (domain-packs/*/pack.yaml, packages/api/src/schema-loader.ts loadDomainPacks, DOMAIN_PACKS_EXTRA_DIRS); tenancy is row-level _tenant
  gap: No org/space/marking model and no cross-org sharing semantics: pack type names merge into one global namespace (first-wins collisions), all tenants share one schema, and RLS is explicitly deferred post-MVP. Closing it me
- [ABSENT] Visual ontology management application (Ontology Manager: discover, edit types/properties/links/actions, function/action observability tabs)
  evidence: Headless by design: authoring is text — .odl files plus the `odl` CLI (validate/diff/apply/generate/rollback, packages/odl bin) and GET /admin/packs introspection (packages/api/src/server.ts); no UI p
  gap: Entire management UI is missing (deliberate: Altius is a headless platform). The compiler/registry/introspection endpoints an editor UI would need already exist, so a UI would be additive greenfield frontend work, not pl
- [PARTIAL] Ontology change history, review, and restore (per-resource edit history, unsaved-changes review, restore object type to prior version)
  evidence: packages/odl registry + diff/classify gives versioned schema history with SAFE/COMPATIBLE/BREAKING classification, reverseDiff for rollback, and `odl rollback` CLI; durable history in packages/storage
  gap: Mechanism-level parity is strong (versioned diffs, gated breaking changes, rollback classification), but there is no per-author change attribution surface, no review/approval workflow (boot path auto-approves BREAKING wi
- [PARTIAL] Action parameters and form configuration (typed inputs, hidden/read-only params, dropdown filtering, overrides, submission criteria wiring)
  evidence: @param fields on ODL @actionType types (packages/odl parser, ActionType), generated <Action>Input GraphQL types and REST POST /api/v1/actions/{Name} bodies (packages/api rest/route-generator.ts, resol
  gap: Typed, validated parameters exist end-to-end, but all form-behavior configuration (visibility, user-editability, dropdown result filtering, parameter overrides) is absent because there is no form layer. Param ordering is
- [PARTIAL] Rich property type system (struct, array, vector/embedding, media reference, time series, attachment, geoshape, marking, cipher; title/primary-key rules)
  evidence: ODL scalars String/Int/Float/Boolean/ID/Date/DateTime/Duration/GeoPoint/JSON/URI plus enums and pack-defined scalars (packages/odl, core pack), mapped to Postgres types incl. JSONB (packages/storage-p
  gap: No struct type system (JSON blob only), no array-typed columns, no vector/embedding type, no media/attachment/time-series property kinds, no per-value Marking/Cipher. Scalar plumbing is extensible (unknown scalar → TEXT)
- [PARTIAL] Required property enforcement (non-null validation at data-load time and at action apply time)
  evidence: Engine validation enforces schema nullability on every mutating call (packages/engine validation.ts; nonNull ODL fields), NOT NULL columns in generated DDL (packages/storage-postgres ddl-objects.ts), 
  gap: The action/transactional path is covered. The datasource-indexing half has no analogue because Altius has no dataset layer — and the sync path (ChangeApplier) bypasses engine validation entirely, so synced records can vi
- [PARTIAL] Dataset table read/export API (readTable: Arrow/CSV export addressed by branch and transaction, column projection, row limits)
  evidence: Nearest analogues: GET /api/v1/cdm/{SourceType}/export?format=ndjson|csv (capped 10,000 rows, packages/api cdm/router.ts) and per-object version history via /api/v1/{plural}/:id/history plus storage t
  gap: No dataset/branch/transaction model exists at all — export is a capped, NHS-capability-gated projection, not a general bulk-read API; no Arrow, no column projection, no transaction addressing. A generic per-ObjectType ex
- [PARTIAL] Outbound REST integration (REST API sources with managed auth, action-triggered webhooks, code-based external transforms for REST sync/export)
  evidence: Webhook side-effects in action manifests are real and hardened (packages/actions side-effect-executor: POST with retries/backoff, AbortController timeout, ${ENV_VAR} URLs like ${REGULATORY_WEBHOOK_URL
  gap: Action-to-webhook parity is decent (POST-only, headers configurable). Missing: a working REST connector (stub), any managed credential/secret store (env vars only), OAuth token flows, and any way to run custom sync code.
- [ABSENT] Governed LLM gateway (OpenAI-compatible chat-completions proxy with model catalog RIDs, usage attribution, rate limiting, ZDR/geo governance)
  evidence: none — Altius has no LLM layer at all (stated platform scope); rate limiting, OIDC auth, and audit exist as generic API-gateway machinery (packages/api) but nothing brokers model calls.
  gap: Entire LLM proxy/catalog/attribution stack is greenfield. The gateway's existing auth/rate-limit/audit middleware could wrap a proxy route, so the plumbing to host one exists, but model governance (ZDR, attribution accou
- [PARTIAL] MCP/agent integration (Ontology MCP exposing object-type SQL, action tools, and query functions to external agents; agents-as-tools composition)
  evidence: Query.availableTools returns ToolDescriptors generated per ODL ActionType with JSON-Schema parameters (spec 5.7; packages/actions tool-registry.ts, packages/api resolver-generator) — an explicit LLM-t
  gap: Tool *descriptors* exist but there is no MCP server/transport, no SQL-over-objects tool, no query-function concept, and no agent runtime. An MCP adapter over availableTools + action routes is a thin, well-scaffolded addi
- [ABSENT] Batch pipeline build orchestration and maintenance (schedules with retries/targets/abort-on-failure, force/connecting builds, event-based triggers, validation-dataset gating, health checks)
  evidence: none — the architecture map states no scheduler exists anywhere: packages/sync parses SyncConfig.interval but nothing consumes it, POLLING/BATCH modes have no driver loop, and there is no dataset/tran
  gap: The single largest functional hole in this chunk: Altius cannot run anything on a schedule, including its own sync engine. A minimal driver loop over JdbcConnector.incrementalExtract + CdcConsumer has clean seams (Connec
- [PARTIAL] Transform expression library (schema-driven functions like Parse JSON as schema, usable across batch and streaming pipelines with error-mode outputs)
  evidence: packages/sync mapping module has a compiled transform-expression DSL (trim/toUpper/concat/custom() via module-global registry) applied per-record by RecordMapper; CEL (packages/cel-evaluator sidecar) 
  gap: The DSL is single-call only (no nesting), has a handful of functions, and runs only in the (un-wired) sync path; no schema-driven JSON parsing into typed structs, no error-mode outputs, no streaming engine. Extending the
- [ABSENT] Workshop application UX platform features (state saving/sharing, redact mode, performance profiler, translations/i18n incl. AIP auto-translate)
  evidence: none for the UI features themselves; the only adjacent primitive is saved, shareable server-side queries — object sets with isPublic and execute/aggregate endpoints (packages/engine ObjectSetManager, 
  gap: No UI layer exists, so all four features are out of scope until one does. Object sets already cover the 'save a filter state and share it' data half of state saving; everything else is greenfield frontend.
- [ABSENT] Geospatial map workspace (object selection, shape drawing/buffer/modify, spatial intersect search, geospatial actions, layer management)
  evidence: none beyond a GeoPoint ODL scalar stored as text (packages/odl scalar mapping; storage-postgres pgType) — no PostGIS, no spatial predicates in FilterExpression, no map UI.
  gap: Both the geo query engine (spatial indexes/intersection filters — would need PostGIS in the SPI and new FilterExpression operators) and the entire map frontend are missing. Query-side is tractable platform work; the app 
- [ABSENT] Time-aware graph exploration and versioned saved analyses (Vertex: timeline view/filter/playback, comparative time selection, graph save/share/duplicate with version history and revert)
  evidence: none for the app; underlying data primitives exist: temporal queries getObjectAtVersion/getObjectAtTime and QueryOptions.asOfTime (packages/spi, storage-postgres temporal-queries.ts *_history tables),
  gap: As-of-time reads and per-object history give the data substrate for a timeline/compare feature, but there is no time-series property type, no graph document model, and no UI. The visualization layer is greenfield; the te
- [ABSENT] Process mining (derive process models from historical state/log data with noise filtering, overlay against defined process)
  evidence: none — closest primitives are the append-only audit trail (packages/security audit, PostgresAuditStore) and the in-memory LineageRecorder (packages/engine lineage/), which record events but perform no
  gap: No process-model concept, no mining algorithms, no app. The audit/history tables would be usable as the event log input, but everything above them is greenfield.
- [PARTIAL] Ontology usage metrics and change-impact observability (per-type reads/writes/active users over 30 days, per-action and per-function usage with monitoring rules)
  evidence: Raw signals exist: append-only audit records for every access/action incl. denials with queryable AuditQueryFilter (packages/security audit, storage-postgres PostgresAuditStore), Prometheus http_reque
  gap: No aggregation from those signals into per-type usage/active-user metrics, no linkage to the schema-change workflow (diff/classify does not consult usage), and no monitoring-rule engine. A reporting query over the audit 

---

# Delta vs official Foundry overview (palantir.com llms doc, 2026-07-02)

Cross-checked after the 12-agent analysis. Nothing in the official doc contradicts the report; it sharpens it. Verdict changes and additions:

## Confirmations (higher confidence, named product targets)
- **Ontology MCP (OMCP)** is the named flagship for external-agent access: OAuth2 (auth-code + client-credentials), read objects / execute predefined actions, MCP Hub management. Altius substrate maps 1:1: availableTools (JSON-Schema ToolDescriptors) + POST /api/v1/actions/* + OIDC. Separate "Palantir MCP" (builder-side, 70+ ontology-authoring tools) ≈ a future `odl` MCP.
- **Automate model** = conditions (time-based | data-based) × effects (action | function | AIP Logic | notification | fallback). Validates the factoring of the new SyncScheduler: it is the *sync-schedule* half (data intake), NOT Automate. The Automate-equivalent — trigger engine consuming the event bus + cron conditions with action/webhook/notification effects and fallback-on-error — remains open, now with a precise target shape.
- **Functions** (TS/Python w/ Ontology edits, function-backed actions/columns, Ontology SQL) confirmed as the central logic pillar — gap #2 stands.
- **Markings** as mandatory controls + **checkpoint justifications** — gap #5 confirmed verbatim.
- **Global Branching + proposals** span data, Ontology, AND apps — gap #3 is bigger than scenarios alone; proposals ≈ PR-style review before merge.

## New gap-register entries (under-covered by the doc scrape)
- **Listeners** (HTTPS webhook→stream, WebSocket↔compute, Email→media): push-based intake. Altius sync is pull-only (JDBC poll); no push endpoint exists. Partial hook: the REST action surface could accept pushes but nothing maps them to ingestion.
- **Materializations** (ontology + user edits → dataset for downstream pipelines/export): Altius analog is only the NHS-gated CDM export. No generic ontology→dataset projection.
- **Data Expectations / Data Health** (quality assertions that can block builds; scope-based monitoring rules; PagerDuty/Slack alerting): Altius has schema validation + Prometheus infra metrics, but no data-quality gate layer at all.
- **LLM-provider compatible proxy APIs + BYOM + Model Catalog**: concrete shape for the absent LLM access layer — proxy endpoints (Anthropic/OpenAI-format) with rate limiting, ZDR, usage tracking; registered models via REST source.
- **MMDP / Apache Iceberg virtual tables**: open-format data plane with lake interop (Databricks/Snowflake/BigQuery). Altius SPI is Postgres-native; no lake-format story. Strategic, not near-term.
- **Interfaces elevated**: doc defines interfaces as core Ontology Language for polymorphic workflows. Altius parses/merges interfaces but does not operationalize them (no implements-check, no polymorphic queries) — priority of that quick-win rises.
- **Pilot** (NL→app generator over OSDK/React) and **Apollo** (zero-downtime delivery platform): far-field; Helm chart is the crude Apollo analog.

## Roadmap ordering (unchanged, now with named targets)
OMCP-equivalent MCP server → Automate-equivalent trigger engine → Functions runtime → Markings → Branching/proposals.

---

# Verified new-gap register (6-agent adversarial pass, 2026-08-14)

===== listeners [partial | M] =====
REALITY: Refutation attempt found real seams but no working push intake. (1) Connector SPI is pull-by-design: packages/sync/src/connectors/connector.ts:131-143 — fullExtract/incrementalExtract return AsyncIterable, header comment says "Section 6.2.1: pull-based". JDBC incrementalExtract is literally `WHERE updated_at > $1` polling (jdbc-connector.ts:198-227). RestConnector is a stub whose extract methods yield nothing (rest-connector.ts:70-84, "TODO"). Default registry has only jdbc + rest-stub (default-
CLOSURE: Two halves, both anchored in existing seams. A) Streaming/CDC syncs (the designed-but-unbuilt path): add packages/sync/src/cdc/kafka-cdc-source.ts — a class that consumes Debezium topics from Redpanda (kafkajs is already in the workspace via @altius/api) and yields SourceRecord as AsyncIterable, unwrapping the Debezium envelope (op c/u/d → INSERT/UPDATE/DELETE, offset → Checkpoint); feed it straig
QUICK WINS: Register a Debezium Postgres source connector in Orion/init-services.sh via one curl to http://debezium:8083/connectors — the container already runs healthy (docker-compose.yaml:110) and this makes CDC topics actually flow into Redpanda, turning the informational integration test (overlay-sync.test.ts:86) into a real one. ▪ Bare-bones POST /ingest/:datasource in packages/api/src/server.ts reusing parseMappingObject + RecordMapper + createEngineChangeApplier (all exported already) with a shared-secret header — single-record webhook upsert path in well under a day. ▪ Ten-minute hygiene: DEBEZIUM_URL is injected into the sync-engine container (docker-compose.yaml:326, helm configmap.yaml:32) but read by no production code — either delete it or leave a comment pointing at the planned KafkaCdcSource so the next reader doesn't chase it. ▪ Zero-code push relay: document that external Kafka producers can publish CloudEvents onto the altius.events Redpanda topic and every API pod fans them out to WebSocket subscribers (redpanda-event-bus.ts:75-99) — usable today for push notifications, though not ontology ingestion.
===== materializations [partial | M] =====
REALITY: The 'only NHS-gated CDM export' claim is an undercount, and the Foundry framing half-applies because Altius's architecture already merges base data and edits at write time. Found: (1) Merged latest state is inherent — sync writes through the same ObjectManager as user actions (packages/api/src/sync-boot.ts:54 createEngineChangeApplier does query→update/create/soft-delete on the main object tables), with per-field merge via ConflictResolver (packages/sync/src/conflict/conflict-resolver.ts:14 — LA
CLOSURE: Build on the fact that Altius's object tables already hold the merged state, so 'materialization' reduces to (a) a general export surface and (b) scheduled/auto-refreshed dataset artifacts. Step 1 — generalize export: lift collectObjectRecords/handleObjectExport out of packages/api/src/cdm/router.ts into a profile-agnostic helper and add GET /api/v1/{plural}/export?format=ndjson|csv to generateObj
QUICK WINS: Add GET /api/v1/{plural}/export (ndjson/csv) to route-generator.ts by extracting the CDM router's collectObjectRecords pipeline with an identity projection — all auth/redaction/consent pieces already exist in both files (sub-day) ▪ Add ?format=ndjson to /api/v1/object-sets/:id/execute so a saved object set doubles as a downloadable dataset (handler at route-generator.ts:1125 already returns fully-governed rows; just reformat) ▪ Raise/parameterize the CDM EXPORT_LIMIT with an explicit ?limit= capped server-side, and export handleObjectExport from cdm/index.ts for reuse (currently not re-exported) ▪ Hand-write one CREATE MATERIALIZED VIEW + REFRESH for a single object type as an Orion/init-services.sh demo artifact proving the Postgres-native materialization path against the existing object tables
===== data-quality [partial | M] =====
REALITY: The 'no data-quality layer' claim is REFUTED — a blocking per-record quality gate exists on every write path including sync ingest, plus several dormant quality seams. Evidence: (1) packages/engine/src/objects/validation.ts — full 5-step pipeline: schema/type/enum/required (validateSchema, L187-284), @constraint CEL field- and type-level evaluation via injectable CelEvaluator sidecar with inline fallback (L300-364, L491-536), @unique cross-instance check via storage.queryObjects (L548-587), @imm
CLOSURE: Four tiers, each anchored in existing seams. (T1, hours) Surface sync quality signals: packages/api/src/sync-boot.ts already holds the SyncScheduler handle — add gauges/counters in packages/api/src/metrics.ts (altius_sync_records_failed_total, altius_sync_records_processed_total, altius_sync_last_processed_timestamp per datasource label) fed from scheduler.stats(); add SyncRecordsFailing and SyncS
QUICK WINS: Export SyncScheduler.stats() as Prometheus metrics (records failed/processed, last_processed_timestamp per datasource) in packages/api/src/metrics.ts, wired from the scheduler handle in sync-boot.ts ▪ Add SyncRecordsFailing and SyncStale alert rules to Orion/helm/altius/templates/prometheusrule.yaml (routing to PagerDuty/Slack is then plain Alertmanager receiver config) ▪ Add onRecordFailed callback hook to CdcConsumer's catch block (cdc-consumer.ts L128-135) so failed ingest payloads stop being log-and-drop; wire to the existing (currently unwired) QuarantineQueue in-memory for now ▪ Expose a podDirectOnly-guarded /admin/sync endpoint returning SyncScheduler.stats() — the guard and pattern already exist in metrics.ts/server.ts ▪ Parse an optional severity arg on @constraint in packages/odl/src/parser (types.ts L62, index.ts L301/L369) and pass it through validation.ts, which already partitions blocking vs warning failures
===== llm-access [absent | L] =====
REALITY: Refutation attempt confirms the core claim but finds more substrate than "only the tool registry". Zero LLM integration confirmed: no anthropic/openai/bedrock/vllm/langchain/@ai-sdk dependency in any package.json; grep for llm/anthropic/openai/claude across *.ts/*.go hits only docs (docs/fdp-plan.md, docs/altius-spec-v2.md, docs/mvp-nhs-pilot.md, README.md); no packages/aip-*; no MCP code anywhere (fdp-plan.md:149,411 lists the "AIP trio (gateway/logic/MCP)" as Missing/planned S1.6). Existing se
CLOSURE: Minimal governed proxy: new packages/aip-gateway (Fastify, mirroring packages/api/src/server.ts patterns) exposing POST /llm/proxy/openai/v1/chat/completions and /llm/proxy/anthropic/v1/messages as thin passthroughs (native fetch, streaming SSE piped through — do NOT reuse the sideeffects HttpClient, it can't stream). Reuse directly: auth middleware and identity extraction from packages/api/src/se
QUICK WINS: Unify the availableTools GraphQL resolver (packages/api/src/graphql/resolver-generator.ts:1035) onto ToolRegistry — removes ~60 duplicated lines and fixes the dryRunSupported:false vs true inconsistency with tool-registry.ts ▪ Add an optional cost/weight param to RateLimiter.check() in packages/api/src/governance/rate-limiter.ts and redis-rate-limiter.ts (default 1) — unlocks token budgets with ~20 lines per implementation ▪ Add toAnthropicTools()/toOpenAiTools() mapping functions (~30 lines) in packages/actions/src/tools/ — ToolDescriptor already carries name/description/JSON-Schema parameters, so provider-format export is a pure transform ▪ Define and document the llm.call audit convention (operation.type + token counts in AuditDetail) against the existing AuditWriter — zero code, makes usage tracking a query over the existing AuditStore ▪ Stub packages/aip-mcp with @modelcontextprotocol/sdk exposing availableTools() as read-only tools/list — one file over the existing registry
===== lake-interop [partial | M] =====
REALITY: The claim is HALF WRONG and HALF RIGHT. The "SPI is Postgres-native" half is REFUTED: packages/spi/src/storage-provider.ts (35-73) is a clean, storage-agnostic contract — recursive grep of packages/spi/src for tsvector/advisory/pg_/ag_catalog/cypher/jsonb/postgres returns ZERO hits. Postgres exotica exists only behind the interface: storage-postgres uses pg_advisory_xact_lock solely for migration serialization (postgres-storage-provider.ts:266) and Apache AGE as a graph mirror (objects/object-cr
CLOSURE: Verdict on the explicit question: a lake-backed READ-ONLY provider is an M, not an XL — transactions/history only bite the write path, and the only unconditional beginTransaction caller is action-executor.ts:239, which read traffic never hits. Path: (1) New package `packages/storage-duckdb` implementing StorageProvider (packages/spi/src/storage-provider.ts) read methods over DuckDB (node bindings,
QUICK WINS: Add supportsWrites to StorageCapabilities (packages/spi/src/ontology.ts:229) and READ_ONLY/NOT_SUPPORTED to ErrorCode (packages/spi/src/errors.ts:24) — purely additive type change, both existing providers set supportsWrites: true ▪ Capability-gate the conformance suite: in tests/spi-conformance/src/suite.ts, instantiate one provider, read capabilities(), and skip transactions/temporal/search categories when the flags are false — unlocks conformance-driven development of any partial provider ▪ Add Arrow IPC streaming export to api/src/cdm/router.ts (EXPORT_FORMATS at line 54, writer beside the CSV branch at line 324) using apache-arrow — gives Foundry readTable ARROW|CSV parity in one endpoint ▪ Pre-flight check capabilities().supportsTransactions in actions/src/executor/action-executor.ts:239 and fail with a typed PlatformError instead of whatever the provider throws — makes every future non-transactional provider degrade cleanly
===== interfaces [absent | M] =====
REALITY: Refutation attempt failed — the claim holds at every layer, though representation and versioning footholds are real. (1) Parser captures everything needed: interface defs land in ParsedSchema.interfaces (packages/odl/src/parser/index.ts:78-79; InterfaceDefinition with fields at parser/types.ts:225-230) and implements clauses land in ObjectType.interfaces string[] (parser/index.ts:134; types.ts:181). (2) Validator has NO implements rule: rules 1-12 in packages/odl/src/validator/index.ts cover pri
CLOSURE: Staged, all anchored in existing seams. Stage 1 — enforcement (packages/odl/src/validator/index.ts): add Rule 13: every name in ObjectType.interfaces must exist in interfaceNames, and each InterfaceDefinition field must appear on the implementer with identical type/nonNull; both sides are already on ParsedSchema, so this is a pure function alongside rules 1-12. Stage 2 — SDL (packages/odl/src/code
QUICK WINS: Rule 13 implements-conformance check in packages/odl/src/validator/index.ts — pure function over data already on ParsedSchema (ObjectType.interfaces + InterfaceDefinition.fields); also flag interface-typed fields whose type never reaches SDL, closing the latent Apollo build-failure bug ▪ Emit `interface` SDL blocks and `implements A & B` clauses in generateGraphQLSchema/generateObjectType (packages/odl/src/codegen/index.ts) — obj.interfaces is already parsed; pairs with a trivial __resolveType map in resolver-generator.ts ▪ Add `implements` clauses to existing domain-pack object types (.odl files under domain-packs/*/schema/) so the 5 shipped core interfaces gain real implementers and become the test corpus for the validator rule.

as moving from data plumbing to decision support to action. The key design idea is that models are not isolated analytics artifacts; they are bound to operational objects in the Ontology so they can be used inside real workflows.
---
Data Sources:
   -> Ingest & Connect
   -> Ontology
   -> Models & AI
   -> Apps & Workflows
   -> Operator Decisions
   -> Write-back
   -> Feedback Loop
---
A simple way to read the diagram is: connect data → organize it in the Ontology → run models → present actions to users → write decisions back → learn continuously.
---
one data source, one Ontology, one app.
one model and one decision workflow.
write-back, audit logs, and feedback capture.
expand to more sources, models, and teams.
---
Minimal architecture
A simple first version looks like this:

* Ingest layer for data pipelines and access control.
* Ontology layer for semantic objects and actions.
* Model layer for predictions, forecasts, and simulations.
* App layer for operator workflows and what-if analysis.
* Write-back layer for syncing decisions to systems of record.
* Governance layer across everything for lineage, versioning, and permissions.

---
ou build the platform pattern represents: connected data, semantic modeling, model operationalization, human decision workflows, and closed-loop learning. In practice, that means starting small, proving value in one workflow, and expanding from there.
---
the platform emphasis is on operational AI: data, user expertise, and AI-generated insights working together in near real time,
How it fits:

* Data layer: ingest enterprise and operational data from systems like ERP, CRM, sensors, imagery, and APIs.
* Ontology layer: represent real-world entities, relationships, and actions in a semantic model.
* AI layer: bind models to Ontology objects so AI can be called inside workflows with governance and lineage.
* App/workflow layer: surface AI recommendations, what-if analysis, and operational actions to users.
* Feedback loop: capture decisions and outcomes back into the Ontology to improve future model performance.

---
it is AI connected to real business or mission processes, with permissions, auditability, and write-back so the AI can influence operations safely. frames it as a closed-loop platform rather than a standalone model host. the AI layer that makes Antero workflows intelligent and interactive.
---
flowchart LR
  D[Data Sources\nERP, CRM, sensors, imagery, APIs] --> I[Ingest & Connect\nPipelines, permissions, lineage]
  I --> O[Ontology\nObjects, relations, actions]
  O --> M[Models & AI\nForecasts, LLMs, simulations]
  O --> A[Apps & Workflows\nOperator UI, scenarios, planning]
  M --> A
  A --> W[Write-back\nSource systems + audit]
  W --> F[Feedback Loop\nMonitoring, retraining]
  F --> O
  G[Governance\nSecurity, access, provenance] -.-> I
  G -.-> O
  G -.-> M
  G -.-> A
  G -.-> W
---
How to read it

* provide the data foundation, Ontology, and workflow backbone.
* adds AI and LLM-enabled decision support on top of that foundation.
* The important part is the loop: AI suggests, users act, decisions write back, and the system learns.


Think of it like this:

* Data in.
* Meaning layer in the middle.
* AI and apps on top.
* Decisions out.
* Learning feeds back in

---
|  What it is                                                                  | Main job                                                                                                                                                                                         |
| -------------------------------------- --------------| ----------------------------------------------------------------------------------------------------------------------- |
| Operational data and workflow platform | Connect data, Ontology, models, and write-back across enterprise use cases.                                 |
| AI-enabled operations platform                    | Support live operational decision-making, planning, simulation, and closed-loop learning           |
| AI layer on top of the platform                        | Embed AI/LLMs into governed workflows and decision processes                                                           |
---
Practical mental model
Think of it as:

* platform foundation
* operational product built on that foundation
* intelligence layer that makes the product AI-driven

---
The Ontology is the common thread across all three because it lets data, models, and actions use the same semantic objects and relationships. That is what allows an AI model to read context from the platform and write decisions back into the real workflow.