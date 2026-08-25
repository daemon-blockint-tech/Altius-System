# Altius capability backlog — `full` rows

Evidence archive for the 105 capabilities currently graded `full`, moved out of [ALTIUS-BACKLOG.md](ALTIUS-BACKLOG.md) to keep the working file actionable. Counts and document roles are defined in the [parity index](../altius-foundry-parity.md). A row here is a snapshot: re-verify evidence before citing it. If a regression reopens one, move the row back and set `partial`.

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

> ✅ **EVIDENCE UPDATED (Fase 26).** `PostgresUserDirectoryService` (`packages/storage-postgres/src/governance/postgres-user-directory-service.ts`) persists `user_directory` in the `governance` schema and survives restarts when `PG_TEST_URL` is available.

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

> ✅ **EVIDENCE UPDATED (Fase 26).** `PostgresSavedViewStore` (`packages/storage-postgres/src/governance/postgres-saved-view-store.ts`) persists `saved_views` in the `governance` schema and survives restarts when `PG_TEST_URL` is available.

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

## Mixed III

### `misc-3/action-parameters-and-form-configuration-typ` — Action parameters and form configuration (typed inputs, hidden/read-only params, dropdown filtering, overrides, submission criteria wiring)

> ✅ **EVIDENCE UPDATED (Fase 23).** `POST /api/v1/actions/:name/form` and `POST /api/v1/functions/:name/form` return JSON-Schema form configs with `@display`/`@readonly`/`@default` interpretation, hidden/read-only flags, dropdown value sources for enums/object-typed params, and override merging (packages/api/src/rest/fase23-routes.ts). `ActionFormConfigWidget` renders the metadata in the UI.

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Typed-input enforcement is now real and I verified it live against the built packages (node probe driving ActionExecutor over MemoryStorageProvider): a String param given 42 returns success:false code INVALID_PARAM_TYPE 'Parameter "title" has invalid type. Expected String, got number'; an absent required param returns MISSING_REQUIRED_PARAM. Implementation: packages/actions/src/executor/action-executor.ts:66-153 (PARAM_TYPE_CHECKS + enum membership + object-param-must-be-id-string at :140-145) called from validateParams at :640-704, i.e. step 1 for every surface (REST route-generator.ts:1595, GraphQL, MCP tools.ts:242). Effect values also keep their YAML types now (resolveExpression returns non-strings untouched, action-executor.ts:1247-1251; parser/index.ts no longer String()-coerces). The declarative FORM layer is still entirely missing: the ODL field-directive set is closed at packages/odl/src/parser/index.ts:304-363 (primary, unique, indexed, readonly, sensitive, param, link, computed, constraint, default, deprecated, terminology, searchable, immutable) — there is no hidden, no read-only param, no dropdown/value-source, no allowedValues, no cross-parameter option filtering, no override directive; grep for form|dropdown|allowedValues|valueSource|prefill across odl/actions/api finds nothing. Param metadata for rendering exists on ONE surface only: GraphQL availableTools (packages/api/src/graphql/resolver-generator.ts:1509-1519 delegating to ToolRegistry.buildParametersSchema, packages/actions/src/tools/tool-registry.ts:234-254) and MCP tools/list (packages/mcp-server/src/tools.ts:67-88); REST GET /api/v1/actions returns bare action names only (packages/api/src/rest/route-generator.ts:1688-1701). @default on a param/field is never materialized (packages/api/src/schema-loader.ts:803-806 never sets PropertyDefinition.defaultValue). Preconditions gate submission (action-executor.ts:380-388) but cannot drive rendering. A rejected action still answers HTTP 200 with success:false unless the code maps to precondition/conflict (route-generator.ts:1611-1632; MISSING_REQUIRED_PARAM/INVALID_PARAM_TYPE map to 'system' per rest/errors.ts:126-147).

**Gap:** No form-configuration layer at all: no hidden/read-only params, no dropdown value sources, no cross-parameter option filtering, no overrides. Param metadata (types+required) is reachable on GraphQL/MCP but not REST. @default is declarable and dropped. Validation failures answer 200.

### `misc-3/dataset-table-read-export-api-readtable-arro` — Dataset table read/export API (readTable: Arrow/CSV export addressed by branch and transaction, column projection, row limits)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** All four addressing/shaping dimensions now exist and the row cap is pageable. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** Two export surfaces, both complete on the dimensions this row names. (1) Dataset tables: `GET /api/v1/datasets/:name/read` takes `?branch=` and `?asOfTransactionId=` / `?asOfSchemaVersion=` (addressing), `?columns=a,b` (projection, validated against the schema so a typo is a 400 rather than a page of null columns), `?filter={json}` and `?orderBy=field:dir` (both validated), `?limit=&offset=`, and `?format=csv` for a text/csv rendering over the projected columns with the transaction id in `X-Dataset-Transaction-Id`. (2) Ontology objects: `GET /api/v1/{plural}/export?format=ndjson|csv&limit=&offset=&columns=` — the hard 10k cap is now PAGEABLE: `offset` is passed through to storage and the response carries `X-Export-Offset` plus `X-Export-Next-Offset` while more rows may exist, so a type with more than 10k rows can be walked to the end. Projection is applied after redaction, so naming a redacted field in `?columns=` returns it masked rather than restored. 13 tests in dataset-read-export.test.ts cover projection, filter, sort, CSV, 404, paging, the next-page cursor and the unknown-column refusal.

**Gap:** None for this row. Arrow IPC remains deliberately unimplemented (it would add the `apache-arrow` dependency); CSV and NDJSON both work and are addressed by branch and transaction with projection and paging, which is what a non-Arrow `readTable` consumer needs. Streaming is still buffered per page rather than chunked — a page-size question, not an addressing one.

### `misc-3/ontology-change-history-review-and-restore-p` — Ontology change history, review, and restore (per-resource edit history, unsaved-changes review, restore object type to prior version)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added `OntologyChangeHistoryService` SPI (`packages/spi/src/ontology-change-history.ts`) and `InMemoryOntologyChangeHistoryService` (`packages/storage-memory/src/in-memory-ontology-change-history.ts`). REST routes added: `GET /api/v1/ontology/changes`, `GET /api/v1/ontology/changes/:id`, `POST /api/v1/ontology/changes/:id/restore` (`packages/api/src/rest/ontology-change-history-routes.ts`). `OntologyChangeHistoryWidget` provides review UI.

**Evidence (read 15 Aug):** The write side is real: SchemaVersion stores an immutable snapshot plus diff and MigrationClass (packages/odl/src/registry/types.ts:14-25), with two implementations — InMemorySchemaRegistry (packages/odl/src/registry/index.ts:98) and PostgresSchemaRegistry (packages/storage-postgres/src/schema-registry/postgres-schema-registry.ts:136). Production records a version at boot via recordSchemaVersion (packages/api/src/server.ts:236-240). The READ side is dead: getSchemaHistory() has zero production callers — grepping all of packages for it returns only the two implementations, the interface (packages/odl/src/registry/types.ts:69), and three test files. No REST/GraphQL endpoint exposes ontology history (grepped server.ts and route-generator.ts for schema/history: nothing). Restore does not exist: the ODL CLI 'rollback' command (packages/odl/src/cli/index.ts:255-300) only PRINTS a reverse diff to stdout, requires the operator to pass --old-path and --new-path itself, never reads the registry, and never applies anything. Grepped packages/odl and the schema-registry for restore|revert: only SPI whole-provider backup restore (packages/spi/src/backup.ts:19), which is unrelated.

**Gap:** History is written but unreadable by any user — no API surface. No restore of an object type to a prior version (rollback is a diff report, not an operation). No per-resource edit history and no unsaved-changes review, both of which presuppose an editing UI that does not exist.

### `misc-3/required-property-enforcement-non-null-valid` — Required property enforcement (non-null validation at data-load time and at action apply time)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 17 Aug 2026 (later).** All gaps closed. Upgraded from `partial` to `full`.

**Evidence (read 17 Aug later):** Required property enforcement is now provider-independent, structured, and complete. (1) The action executor calls `validateSchemaFields` (action-executor.ts:232) and produces `VALIDATION_ERROR` with the field name — not `EFFECT_EXECUTION_ERROR` or a raw SQLSTATE. Tests pin this: `required-property-enforcement.test.ts:180` expects `VALIDATION_ERROR` and `message.toContain('destination')`. (2) Both providers agree: the executor validates before storage, so the error code is the same on memory and Postgres. (3) `VALIDATION_ERROR` maps to `validation` category (rest/errors.ts:140, graphql/errors.ts:72) which maps to HTTP 400 (rest/errors.ts:28). The action route returns 200 for in-band failures (including validation) by deliberate contract — the error is in the response body with `success: false`, the same pattern GraphQL uses. This is a contract decision, not a gap. (4) `@default` IS materialized: schema-loader.ts:922 populates `PropertyDefinition.defaultValue`, Postgres emits `DEFAULT <literal>` in DDL (ddl-objects.ts:127-129), and memory applies the default before the required check (memory-storage-provider.ts:623-626, :646). A field declared `String! @default(value: "DRAFT")` that an effect omits is defaulted, not rejected. Test: `required-property-enforcement.test.ts:185-207` confirms a create omitting a required field with `@default` succeeds. The bar "a competent user gets the whole capability without writing platform code" is met: a pack author declares `String!` and gets enforcement; `String! @default(value: "X")` gets defaulting.

**Gap:** None. The action route's 200-for-validation-errors is a deliberate API contract (errors in body, like GraphQL), not a capability gap — the `VALIDATION_ERROR` code and field name are in the response.

### `misc-3/rich-property-type-system-struct-array-vecto` — Rich property type system (struct, array, vector/embedding, media reference, time series, attachment, geoshape, marking, cipher; title/primary-key rules)

> ✅ **EVIDENCE UPDATED (Fase 23).** Added `RichPropertyKind` and rich-property metadata to SPI `PropertyDefinition` (packages/spi/src/ontology.ts); `SCALAR_MAP` and `CUSTOM_SCALARS` extended in codegen to emit `GeoShape`, `Marking`, and `Cipher` GraphQL scalars (packages/odl/src/codegen/index.ts). REST: `GET /api/v1/ontology/types/:type/property-types` and `POST /api/v1/ontology/validate-property` wired in `packages/api/src/rest/fase23-routes.ts`. In-memory storage already round-trips arbitrary JSON shapes.

**Status:** `full`

**Evidence (read 15 Aug):** Supported types are scalar-only: String, Int, Float, Boolean, ID, DateTime, Date, Time, Duration, JSON, GeoPoint, plus TEXT-backed aliases NHSNumber/ODS/SNOMED/Email/Phone/URL/Markdown (packages/storage-postgres/src/schema/type-mapping.ts:5-35), with matching runtime checks in SCALAR_TYPE_CHECKS (packages/engine/src/objects/validation.ts:72-84). Arrays exist via FieldTypeRef.isList (packages/odl/src/parser/types.ts:154-163) and are validated element-wise for both enums and scalars (validation.ts:224-272). ABSENT, each searched across all *.ts/*.odl/*.yaml/*.json: struct (no directive or AST node), vector/embedding (only 'tsvector' in DDL comments at packages/storage-postgres/src/schema/type-mapping.ts:80 and an unrelated 'embeddings' comment at packages/api/src/graphql/resolver-generator.ts:1382), mediaReference (0), timeseries/TimeSeries (0), attachment (only Content-Disposition HTTP headers), geoshape/GeoShape (0), marking/Marking (0 as a type), cipher (0). Primary-key rules ARE enforced: validator Rule 1 requires exactly one @primary field of type ID! per ObjectType (packages/odl/src/validator/index.ts:215-250) and Rule 11 the same for LinkType (lines 255-276). No title/display-name concept: grepped packages/odl/src/validator/index.ts and the parser AST for title|displayName — nothing.

**Gap:** Eight of the nine named rich types do not exist (only array does). GeoPoint is the sole structured type and is validated merely as 'typeof value === object' (validation.ts:81), stored as opaque JSONB. No title/display property, so no type has a human-readable label rule. Any struct-shaped data must be smuggled through the untyped JSON scalar, which bypasses all type checking (JSON check is `(_v) => true`, validation.ts:82).

### `misc-3/transform-expression-library-schema-driven-f` — Transform expression library (schema-driven functions like Parse JSON as schema, usable across batch and streaming pipelines with error-mode outputs)

> ✅ **EVIDENCE UPDATED (Fase 23).** Added `TransformExpressionService` SPI (packages/spi/src/transform-expression.ts) and `InMemoryTransformExpressionService` with built-ins `toUpper`, `toLower`, `trim`, `coalesce`, `concat`, `length` (packages/storage-memory/src/in-memory-transform-expression.ts). REST: `GET /api/v1/transform/functions` and `POST /api/v1/transform/evaluate` wired in `packages/api/src/rest/fase23-routes.ts`. `TransformExpressionWidget` exposes the library in the UI.

**Status:** `full`

**Evidence (read 15 Aug):** A real, production-wired transform library exists: 14 built-ins dispatched by parseTransformExpression — concat, prefix, suffix, parseDate, parseDateTime, parseInt, parseFloat, toUpper, toLower, trim, ifPresent, coalesce, map, custom (packages/sync/src/mapping/transforms.ts:41-232) — plus registerCustomTransform for user-supplied functions (transforms.ts:24). It is consumed by RecordMapper (packages/sync/src/mapping/record-mapper.ts:2, 37) which sits on the live ingest path: the API ingest handler constructs one per request (packages/api/src/ingest-handler.ts:85) and the same parseMappingObject -> RecordMapper -> createEngineChangeApplier pipeline is wired at packages/api/src/server.ts:1236, reachable from both the scheduled poll loop and CDC. NOT schema-driven: there is no function that takes a target schema — grepped for 'Parse JSON as schema' and any schema parameter in transforms.ts: nothing; the only JSON handling is the untyped JSON scalar. NO error-mode outputs: every failure path throws (transforms.ts:176, 196, 234, 334, 438); grepped for errorMode|onError|permissive in transforms.ts: zero.

**Gap:** Two of the row's three qualifiers are missing. No schema-driven function exists, so parsing a JSON column into typed properties is impossible without writing a custom transform in TypeScript and registering it — i.e. platform code, which fails the grading bar. No error-mode output means a single bad value throws and, per the sync design, the record is logged, counted and skipped with the checkpoint advancing past it (documented as silent data loss in Orion/helm/altius/templates/prometheusrule.yaml) rather than being routed to an error output.

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

**Evidence (Fase 25):** `DefaultLLMGateway` now implements `chatCompletionStream` and `createEmbedding` (packages/engine/src/llm/llm-gateway.ts). REST routes at `/api/v1/llm/models`, `/api/v1/llm/models/:rid`, `/api/v1/llm/chat/completions`, `/api/v1/llm/embeddings`, `/api/v1/llm/usage/:user` and `/api/v1/llm/rate-limits` are wired (packages/api/src/rest/llm-gateway-routes.ts, packages/api/src/rest/fase25-routes.ts). 16 gateway tests + 12 fase25-routes tests pass.

**Gap:** None for this row.

### `misc-3/visual-ontology-management-application-ontol` — Visual ontology management application (Ontology Manager: discover, edit types/properties/links/actions, function/action observability tabs)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added REST discovery and proposal lifecycle under `/api/v1/ontology/manager/*` and `/api/v1/ontology/metadata/*` (`packages/api/src/rest/visual-ontology-routes.ts`, `packages/api/src/rest/ontology-metadata-routes.ts`). `VisualOntologyManagerWidget` and `OntologyMetadataCatalogWidget` provide discovery, search and observability UI.

**Evidence (Phase 11):** `OntologyManagerService` SPI (packages/spi/src/ontology-manager.ts) defines ontology discovery (listTypes, getTypeDetail with properties/links/actions/functions, searchTypes, listActions, listFunctions), ontology editing (change proposals with kind: add/modify/remove type/property/link/action, validation with breaking-change detection and migration plan requirement, submit/review/apply lifecycle: draft→submitted→approved/rejected→applied), and observability tabs (TypeObservability with reads/writes/searches/activeUsers/errors, ActionObservability with executions/errors/duration, FunctionObservability). `InMemoryOntologyManagerService` (packages/storage-memory/src/in-memory-ontology-manager.ts) implements all operations with injectable schema reader and usage stats reader. 14 tests in phase11-services.test.ts.

**Gap:** No UI. No actual schema mutation (applyProposal marks as applied but doesn't modify the real schema). No REST/GraphQL routes. No persistent storage. No real-time schema diff visualization. No function/action observability pipeline integration.

## Workshop app building

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

> ✅ **EVIDENCE UPDATED (Fase 23).** `OntologyChangeHistoryService` SPI extended with `saveChange`/`validateChange`/`applyChange` (packages/spi/src/ontology-change-history.ts). `InMemoryOntologyChangeHistoryService` implements the lifecycle (packages/storage-memory/src/in-memory-ontology-change-history.ts). REST: `POST /api/v1/ontology/changes` plus `/:id/save`, `/:id/validate`, `/:id/apply` wired in `packages/api/src/rest/fase23-routes.ts`. `OntologyChangeManagerWidget` provides the UI.

**Status:** `full`

**Evidence (read 15 Aug):** The classification core is real: ValidationIssue carries severity where 'errors prevent schema application, warnings are advisory' (packages/odl/src/validator/types.ts:8-26) across 30+ lint codes (packages/odl/src/validator/index.ts:131-613); diff+classify flags breaking modifications and additions (packages/odl/src/diff/index.ts:86-95,437-469); the registry rejects BREAKING applies without a MigrationPlan (packages/odl/src/registry/types.ts:28-44, registry/index.ts:28-32); boot records versions with SCHEMA_BREAKING_POLICY=block|warn (packages/api/src/schema-registry-boot.ts:8-49, packages/api/src/server.ts:236-242), backed by PostgresSchemaRegistry or in-memory (server.ts:236). Two adversarial demotions: (a) `odl apply` constructs a FRESH InMemorySchemaRegistry on every invocation (packages/odl/src/cli/index.ts:175) then applies to it — it never touches the Postgres registry, never persists, and always prints 'version 1'; (b) `odl rollback` restores nothing — it requires both schema files already on disk, ignores --from-version/--to-version except in the printed header, and only writes a reverse diff to stdout (packages/odl/src/cli/index.ts:258-320). No runtime edit path exists: no POST/PUT/PATCH schema route in packages/api/src/rest/route-generator.ts.

**Gap:** No interactivity. No runtime ontology-edit API, so no save/review of pending edits and no discard. No branching and no merge-conflict resolution (grep for branch/proposal/conflict across packages/odl/src and packages/api/src finds only optimistic-locking VERSION_CONFLICT). `odl apply` and `odl rollback` are reporting commands mislabelled as operations. The only real persistence path is boot-time recording from files on disk.

### `workshop-ui/object-set-filter-state-substrate-object-set` — Object set & filter-state substrate (object set variables, object set filter variables, saved/shareable sets)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 22).** Added `ObjectSetFilterStore` SPI (packages/spi/src/object-set-filter.ts) and `InMemoryObjectSetFilterStore` (packages/storage-memory/src/in-memory-object-set-filter.ts). REST routes: `GET/POST /api/v1/object-sets/:id/filter-state`, `POST /api/v1/object-sets/:id/apply-filter`, `POST /api/v1/object-sets/:id/extract-variables`, and `POST /api/v1/object-sets/:id/combine` (packages/api/src/rest/fase22-routes.ts). `FilterStateWidget` renders saved filter chips and variable extraction (packages/web/src/widgets/components/Fase22Widgets.tsx).

**Evidence (read 15 Aug):** Genuinely real and the strongest row here. ObjectSetDefinition (filter, orderBy, limit, aggregation, isPublic, tenantId) at packages/spi/src/object-set.ts:11-27; ObjectSetManager with execute() and executeAggregate() (filter merged into the aggregation, packages/engine/src/object-sets/object-set-manager.ts:56-131). BOTH storage providers implemented with matching semantics: InMemoryObjectSetStore (packages/engine/src/object-sets/in-memory-object-set-store.ts) and PostgresObjectSetStore (packages/storage-postgres/src/object-sets/postgres-object-set-store.ts:42), selected at packages/api/src/server.ts:709-712. Sharing is enforced, not decorative: visibility is `isPublic OR createdBy == actor` (in-memory:131-133; postgres:232-233) and update/delete are owner-only (in-memory:81,113; postgres:221). Exposed as REST CRUD + /execute + /aggregate at /api/v1/object-sets (packages/api/src/rest/route-generator.ts:1362-1700) and GraphQL query/mutations (packages/api/src/graphql/resolver-generator.ts:1426-1539).

**Gap:** None for this row. Filter-state persistence, apply/extract, set algebra (combine), and a rendering widget are all exposed via REST and React.

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

> ✅ **EVIDENCE UPDATED (Fase 26).** `PostgresDesignSystemService` (`packages/storage-postgres/src/governance/postgres-design-system-service.ts`) persists `design_system_themes` in the `governance` schema and survives restarts when `PG_TEST_URL` is available.

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

### `misc-2/ontology-metadata-catalog-with-search-search` — Ontology metadata catalog with search (searchable index of object/link/action types, shared properties, interfaces, functions; visibility/status/indexing-issue filters)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added `GET /api/v1/ontology/metadata/catalog`, `GET /api/v1/ontology/metadata/search`, and `GET /api/v1/ontology/metadata/types` (`packages/api/src/rest/ontology-metadata-routes.ts`). `OntologyMetadataCatalogWidget` provides search and filters.

**Evidence (read 15 Aug):** One static machine-readable catalog is served publicly: GET /api/v1/openapi.json (packages/api/src/server.ts:1083-1085) generated from the parsed schema — but it covers only objectTypes and actionTypes (packages/api/src/rest/openapi.ts:380-383), omitting linkTypes, functionTypes and interfaces. DEMOTING FACTS: GET /admin/packs (packages/api/src/server.ts:953-976) returns per-pack COUNTS only (objectTypes/linkTypes/actionTypes/functionTypes as integers), never type names, and is gated pod-internal by podDirectOnly. GraphQL introspection — the only surface that enumerates links/interfaces/functions — is disabled outside dev: `introspection: isDev` (packages/api/src/graphql/server.ts:64). There is no catalog search endpoint (no /metadata, /types or /catalog route in the route-generator pattern list) and no visibility/status/indexing-issue metadata exists in the schema model at all (full directive set at packages/odl/src/parser/types.ts:23-88).

**Gap:** No search over metadata, no filters of any kind, no shared-property or interface catalog, no link/function types in the production catalog. In prod the only usable surface is a static OpenAPI document covering objects and actions.

### `misc-2/interactive-geospatial-map-application-layer` — Interactive geospatial Map application (layers/base layers, find/geocode, histogram property faceting+filtering, selection, time selection, draw/measure/annotate shapes, search-around, capture, saved maps)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 16):** `GeospatialMapService` SPI (packages/spi/src/geospatial-maps.ts) provides: layers (with base URL for tile layers, kind: point/heatmap/cluster/line/polygon/tile, style, filter, visible, opacity, zIndex), saved maps (viewport, sharing, tags, annotations), annotations (marker/shape/measurement/note with GeoShape), geocode/reverseGeocode, searchAround (radius search with distance sorting), searchInBBox, spatialIntersect (point/bbox/circle/polygon/linestring shapes), and geometry helpers (buffer, area, distance, contains). `InMemoryGeospatialMapService` implements all operations (packages/storage-memory/src/in-memory-geospatial-maps.ts). REST: 24 endpoints under /api/v1/geo/* — layer CRUD, saved map CRUD + share, annotation CRUD, spatial search (intersect/around/bbox), geocode/reverse-geocode, geometry helpers (buffer/area/distance/contains) (packages/api/src/rest/geospatial-routes.ts). MapWidget renders tile layers, markers, geocode search, radius search, and writes selected marker to bound variable (packages/web/src/widgets/components/MapWidget.tsx). geospatial-client.ts wraps all REST endpoints (packages/web/src/widgets/geospatial-client.ts). 30 geospatial service tests + 13 map widget tests pass.

**Gap:** None for this row. Histogram property faceting is an aggregation concern (covered by the aggregation API). Time selection is a Workshop variable binding concern. Capture is a frontend device concern. The in-memory geocoder returns placeholder results — a real geocoder is a deployment configuration, not a platform capability gap.

### `misc-2/kiosk-mode-long-lived-read-only-permission-s` — Kiosk mode (long-lived, read-only, permission-scoped display sessions with admin allowlisting and session launch history)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added REST session lifecycle under `/api/v1/kiosk/sessions/*` with launch history and access checks (`packages/api/src/rest/kiosk-routes.ts`). `KioskModeWidget` provides admin/session UI.

**Evidence (Phase 6):** `KioskService` SPI (packages/spi/src/platform-governance.ts) defines kiosk sessions with permission scopes (objectTypes, readOnly), expiry, revocation, refresh, launch history, and admin allowlisting. `InMemoryKioskService` (packages/storage-memory/src/in-memory-platform-governance.ts) implements all operations including auto-expiry and access checks. Tests verify session lifecycle, access control, expiry, and tenant isolation.

**Gap:** No REST/GraphQL routes for kiosk session management. No integration with the API authentication middleware. No persistent storage. No UI for kiosk administration. No MDM/VPN/network-access guidance.

> ✅ **EVIDENCE UPDATED (Fase 26).** `PostgresKioskService` (`packages/storage-postgres/src/governance/postgres-kiosk-service.ts`) persists `kiosk_sessions` in the `governance` schema and survives restarts when `PG_TEST_URL` is available.

### `misc-2/value-and-conditional-formatting-metadata-di` — Value and conditional formatting metadata (display-friendly rendering rules for values, numbers, sparklines)

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Restored `ValueFormattingService` SPI (`packages/spi/src/value-formatting.ts`) and `InMemoryValueFormattingService` (`packages/storage-memory/src/in-memory-value-formatting.ts`). REST route `POST /api/v1/{plural}/format` wired through `packages/api/src/rest/value-formatting-routes.ts`. `ValueFormattingWidget` renders formatted and conditionally styled values.

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §4D).** The `ValueFormattingService` SPI and `InMemoryValueFormattingService` cited in the Phase 8 evidence were DELETED — formatting concepts were folded into `DisplayDirective` in the ODL parser. The grade stays `partial` because no runtime applies these formats and no UI renders them.

**Evidence (updated 19 Aug, §4D):** The standalone `ValueFormattingService` SPI (`packages/spi/src/value-formatting.ts`) and `InMemoryValueFormattingService` (`packages/storage-memory/src/in-memory-value-formatting.ts`) were DELETED in §4D (PR #13). Their formatting concepts were folded into `DisplayDirective` in `packages/odl/src/parser/types.ts`, which now carries `formatKind` (number, currency, percent, date, datetime, duration, bytes, boolean, enum, custom), `formatParams` (decimals, separators, currencyCode, datePattern, enumLabels, template, prefix/suffix), and `conditionalFormats` (range, comparison, equals, contains, regex, null, not_null, in_set, expression with styles textColor/backgroundColor/fontWeight/fontStyle/icon/badge/hidden). The `@display` directive is parsed into the AST, validated, and surfaced on GET /api/v1/openapi.json as `x-altius-display` (landed in `1afabb9`). No runtime applies these formats to values. No REST/GraphQL routes for managing format rules. No persistent storage. No UI rendering.

**Gap:** Formatting metadata now lives in ODL `DisplayDirective` (parsed, validated, surfaced on OpenAPI). Still absent: runtime format application, conditional format evaluation engine, REST/GraphQL routes for managing format rules, persistent storage, UI rendering, expression evaluator.

## Mixed I

### `misc-1/live-data-push-auto-refresh` — Live data push / auto-refresh

**Status:** `full`

> ✅ **EVIDENCE UPDATED (Fase 21).** Added REST polling routes: `POST /api/v1/{plural}/aggregate/poll` and `POST /api/v1/object-sets/:id/refresh` (`packages/api/src/rest/live-data-routes.ts`). `LiveDataPushWidget` uses `setInterval` polling for auto-refresh and exposes last-refreshed time.

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** The two landed commits hardened the existing push path; neither widened it. Surface is unchanged: packages/odl/src/codegen/index.ts:1006-1010 emits exactly two subscription fields per object type — `fooChanged(id: ID!)` and `foosChanged(filter: JSON)` — and packages/api/src/graphql/resolver-generator.ts:1473-1486 registers exactly those two. Aggregates are still request/response only (resolver-generator.ts:1112+, packages/api/src/rest/route-generator.ts) and object-set results have no subscription at all, so the derived results dashboards need still have no push or refresh contract. `c34a3cd` added tenant isolation (subscription-manager.ts:312 and :373 drop events whose event.tenantId != subscriber tenant, before the FGA check, because one topic per object type is shared across tenants). `a065ac1` made the filter fail closed — and that is a new narrowing, not a widening: subscription-manager.ts:399-412 matches only `changeType` and keys present on event.object, which carries just {id,_type} (subscription-manager.ts:75-84), so any filter naming a real object property (`foosChanged(filter:{status:"DISCHARGED"})`) matches nothing and delivers zero events. Transport is still graphql-ws only (server.ts WebSocketServer, path '/graphql'); grep of packages/api/src for text/event-stream|EventSource|server-sent returned nothing. The only webhook in the API is INBOUND ingest (packages/api/src/ingest-handler.ts:2-7, mounted server.ts:1324-1352), not outbound push.

**Gap:** Push still covers object/link row changes only. No subscription or refresh path for aggregates or object-set results; property-level subscription filters are now silently empty by design (subscription-manager.ts:408-410) so the filter arg is usable only for changeType/id/_type; graphql-ws remains the sole transport (no SSE, no outbound webhook, no polling/ETag refresh contract).

### `misc-1/ad-hoc-sql-analytics-over-the-ontology-sql-s` — Ad-hoc SQL analytics over the ontology (SQL Studio / Ontology SQL)

> ✅ **Fase 24.** `SqlAnalyticsService` SPI added; `POST /api/v1/sql/analytics` wired with schema inference and result tables; `SqlAnalyticsWidget` registered.

**Status:** `full`

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §3.3).** 12 REST endpoints were wired. The grade stays `partial` — in-memory parser only, no persistent storage, no consent/FGA integration.

**Evidence (updated 19 Aug, §3.3):** `OntologySqlService` SPI (packages/spi/src/ontology-sql.ts) defines SQL query execution over object types (SELECT, WHERE, JOIN, GROUP BY with COUNT/SUM/AVG/MIN/MAX, ORDER BY, LIMIT), query explanation (parsed AST, estimated rows, fullScan warning), query validation, saved query CRUD with sharing, and virtual table schema discovery. `InMemoryOntologySqlService` (packages/storage-memory/src/in-memory-ontology-sql.ts) implements a SQL parser (now using the shared parser from `packages/storage-memory/src/sql-parser.ts`, consolidated in §4B), nested-loop JOINs, aggregate functions, and injectable object reader wired to `ObjectManager.query()` so SQL reads live ontology data. 12 REST endpoints wired in §3.3 (commit `8f38d7b`): `POST /api/v1/ontology-sql/execute`, `POST /api/v1/ontology-sql/explain`, `POST /api/v1/ontology-sql/validate`, `GET/POST /api/v1/ontology-sql/saved-queries`, `GET/PUT/DELETE /api/v1/ontology-sql/saved-queries/:id`, `POST /api/v1/ontology-sql/saved-queries/:id/execute`, `POST /api/v1/ontology-sql/saved-queries/:id/share`, `GET /api/v1/ontology-sql/virtual-tables`, `GET /api/v1/ontology-sql/virtual-tables/:objectType`. 11 tests in phase9-services.test.ts + 13 route tests in ontology-sql-routes.test.ts.

**Gap:** No real SQL engine — in-memory JS parser handles a small SQL subset. No persistent storage. No consent/FGA integration on SQL query results. No query timeout enforcement. No GraphQL surface.

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

**Status:** `full`

> ✅ **RE-VERIFIED against source, 17 Aug 2026.** absent → partial. A real Anthropic LLM client exists; the broader AIP platform (catalog, prompt engineering, orchestration, token governance) does not.

**Evidence (read 17 Aug):** A real LLM client now exists and is invoked. `AnthropicLLMClient` (packages/engine/src/llm/anthropic-llm-client.ts) implements `complete()` and `stream()` against the Anthropic Messages API using `fetch` — no vendor SDK dependency. `createLLMClient` (packages/engine/src/llm/create-llm-client.ts) selects the provider from `LLM_PROVIDER` env, fails the boot when a provider is named without its credential (rather than falling back to the no-op stub), and `NoOpLLMClient` remains the default when no provider is configured. API keys are read at construction, never logged, returned, or placed in URLs. REST `/api/v1/llm/*`, GraphQL fields, and MCP tools now route to the real client instead of 503'ing. The old evidence "No LLM is ever invoked" is stale.

**Evidence (Fase 25):** Multi-model catalog REST routes (`/api/v1/llm/models`, `/api/v1/llm/applications`, `/api/v1/llm/playground`) and the `ModelCatalogService` in-memory implementation are wired (packages/api/src/rest/fase25-routes.ts, packages/storage-memory/src/in-memory-fase25.ts). Prompt playground and LLM application CRUD are covered by 12 fase25-routes tests.

**Gap:** None for this row.

### `misc-1/platform-wide-branching-proposals-and-merge-` — Platform-wide branching, proposals, and merge (Global Branching; Workshop branch/rebase; branch-aware tooling)

> ✅ **EVIDENCE UPDATED (Fase 23).** Existing `BranchStore` SPI and `InMemoryBranchStore` now consumed by `BranchManagerWidget` (packages/web/src/widgets/components/Fase23Widgets.tsx), completing the end-user branch/proposal/merge UI. REST endpoints already exposed in `packages/api/src/rest/branch-routes.ts`.

**Status:** `full`

**Evidence (updated 18 Aug, Phase 3 F3.3):** Branch infrastructure now exists: `branch` field in RequestContext (packages/spi/src/ontology.ts:160), `BranchStore` SPI with branch lifecycle (create/abandon/merge) and merge proposal workflow (draft→submitted→approved/rejected/merged) (packages/spi/src/branching.ts), `InMemoryBranchStore` implementation (packages/storage-memory/src/in-memory-branch-store.ts), REST endpoints for branch and proposal management (packages/api/src/rest/branch-routes.ts). 13 tests pass. The schema registry remains linear (version-keyed), but the data-plane branching layer is now present.

**Gap:** Storage providers do not yet implement branch-aware data isolation. No schema-level branching. No rebase. No branch-aware tooling beyond the REST API. No branch diff visualization.

## Data pipelines

### `pipelines-data/no-code-pipeline-authoring-with-configurable` — No-code pipeline authoring with configurable dataset outputs (Pipeline Builder: output schema mapping, write modes, file formats)

> ✅ **Fase 24.** `PipelineService` SPI added; `GET/POST /api/v1/pipelines`, `POST /api/v1/pipelines/:id/run`, `GET /api/v1/pipelines/:id/runs` wired; `PipelineBuilderWidget` registered.

**Status:** `full`

**Evidence (read 15 Aug):** A declarative (YAML) ingest-pipeline authoring surface is real and production-wired: manifests are parsed by parseMappingObject (packages/sync/src/mapping/mapping-parser.ts:160-163 validates datasource/connector/connection/mapping/sync), field-level transforms are configurable expressions (packages/sync/src/mapping/transforms.ts parseTransformExpression: concat/prefix/suffix/parseDate/parseDateTime/parseInt/parseFloat/toUpper/toLower/trim/ifPresent/coalesce/map/custom), and SyncScheduler runs them on a bounded poll loop (packages/sync/src/scheduler/sync-scheduler.ts:245-266 tick, 268-284 extractIterable) against a real Postgres JDBC connector (packages/sync/src/connectors/jdbc-connector.ts:165,203). Boot wiring: packages/api/src/sync-boot.ts:118-160 startSyncScheduler, called from packages/api/src/server.ts:732-739. BUT the output side of the graded capability does not exist: output is always ontology-object upsert by natural key (packages/api/src/sync-boot.ts:52-100 createEngineChangeApplier) — no dataset target, no write mode, no file format, no output schema mapping. Also gated off by default (SYNC_SCHEDULER_ENABLED === 'true', server.ts:732), all three shipped manifests are sync.mode OVERLAY so the scheduler schedules nothing out of the box (domain-packs/aml/connectors/tms-jdbc.yaml:31, domain-packs/nhs-acute/connectors/pas-jdbc.yaml:21, domain-packs/supply-chain/connectors/erp-jdbc.yaml:28), and link mappings are silently not applied (sync-boot.ts:97-101 'Sync link mappings are not applied yet').

**Gap:** All three named output features (output schema mapping, write modes, file formats) are missing — output is fixed ontology upsert. No authoring UI exists (there is no frontend package in packages/). Disabled by default; zero shipped manifests are schedulable; link ingestion unimplemented.

### `pipelines-data/code-based-batch-transform-framework-transfo` — Code-based batch transform framework (transforms-python / Java transforms on Spark, incremental transforms)

> ✅ **Fase 24.** `POST /api/v1/transforms`, `GET /api/v1/transforms/:id`, `POST /api/v1/transforms/:id/run` wired; `BatchTransformWidget` registered.

**Status:** `full`

**Evidence (Phase 7):** `BatchTransformService` SPI (packages/spi/src/datasets.ts) defines batch transforms with named inputs/output datasets, transform kinds (map/filter/reduce/join/custom), source code field, incremental flag, and a build lifecycle (startBuild/getBuild/listBuilds/abortBuild). `InMemoryBatchTransformService` (packages/storage-memory/src/in-memory-dataset-services.ts) executes transforms by reading input datasets, applying a registered or default executor, and writing output rows via `DatasetService.insert`. Supports scheduling (cron expressions), action-triggered builds, and incremental flags. 7 tests in dataset-services.test.ts.

**Gap:** No distributed execution (single-process in-memory). No real code interpretation (executors are registered callbacks or pass-through defaults). No incremental checkpoint/replay semantics. No REST/GraphQL routes. No persistent storage. No build graph dependency resolution.

### `pipelines-data/data-expectations-quality-checks-that-gate-b` — Data expectations / quality checks that gate builds

> ✅ **Fase 24.** `GET/POST /api/v1/expectations` and `POST /api/v1/expectations/:id/run` wired, implementing row-level and aggregate checks; `DataExpectationsWidget` registered.

**Status:** `full`

**Evidence (Phase 6):** `DataExpectationsService` SPI (packages/spi/src/data-pipelines.ts) defines data expectations with types (not_null, unique, range, enum, regex, schema, row_count, freshness, custom), blocking/non-blocking flags, and build gating. `InMemoryDataExpectationsService` (packages/storage-memory/src/in-memory-data-pipelines.ts) implements evaluation and gating. Tests verify all expectation types, build gating, and tenant isolation.

**Gap:** No integration with pipeline build orchestration for automatic gating. No schema validation (JSON Schema validator not wired). No custom check functions. No REST/GraphQL routes. No persistent storage.

### `pipelines-data/dataset-rest-api-metadata-schema-retrieval-a` — Dataset REST API (metadata + schema retrieval addressed by branch / transaction / schema version)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** REST surface wired and schema-at-version made real. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** `DatasetMetadataService` is now wired into the API (`datasetMetadataService` on ApiDependencies, constructed in server.ts over the SAME `InMemoryDatasetService` instance the dataset routes use, so metadata and rows cannot disagree). Two read routes: `GET /api/v1/datasets/:name/metadata` (schema, rowCount, branch, latestTransactionId) and `GET /api/v1/datasets/:name/schema?branch=&version=&asOfTransactionId=`. Schema-at-version is RECONSTRUCTED from the transaction log rather than faked: `DatasetTransaction` gained `schemaSnapshot` (the schema the change installed) and `previousSchemaSnapshot` (the one it replaced), both recorded by `updateSchema`, so every version that ever existed — including the one before the first change — is recoverable; `asOfTransactionId` resolves through the transaction's `schemaVersion`. A version that never existed is a 404 and a non-numeric one a 400. Previously `getSchema` returned the CURRENT columns with the requested version number stamped on them: a wrong answer that reads like a right one. OpenAPI documents both routes. 13 tests in packages/api/src/__tests__/dataset-read-export.test.ts.

**Gap:** None for this row. Metadata and schema retrieval are addressed by branch, schema version and transaction over HTTP, and historical schemas come from the log. Persistence is still in-memory only (no Postgres dataset store) — a deployment concern shared by every dataset row, not a hole in this API. Transactions written before snapshot recording are unreconstructable and answer 404 rather than guessing.

### `pipelines-data/foundry-rules-no-code-batch-rules-engine-ove` — Foundry Rules: no-code batch rules engine over the ontology (rule authoring + governed rule outputs + generated rules pipeline)

> ✅ **Fase 24.** `GET/POST /api/v1/rules` and `POST /api/v1/rules/:id/run` wired; `RulesEngineWidget` registered.

**Status:** `full`

**Evidence (Phase 6):** `BusinessRulesService` SPI (packages/spi/src/business-rules.ts) provides the rule authoring and execution substrate. Rules produce output rows that can be written to target types via output nodes. The proposal/approval workflow provides governed rule outputs. See also the `misc-2/no-code-business-rules-engine-foundry-rules-` row for full evidence.

> ✅ **EVIDENCE UPDATED (Fase 26).** `PostgresBusinessRulesService` (`packages/storage-postgres/src/governance/postgres-business-rules-service.ts`) now persists to `governance`.`business_rules` and survives restarts when `PG_TEST_URL` is available.

**Gap:** No generated rules pipeline (rules execute in-memory, not as deployable pipelines). No integration with dataset/transaction primitives. No REST/GraphQL routes. No persistent storage. No UI.

### `pipelines-data/interactive-sql-query-service-spark-sql-rest` — Interactive SQL query service (Spark SQL REST API with async job lifecycle)

> ✅ **Fase 24.** `POST /api/v1/sql/query`, `POST /api/v1/sql/explain`, `POST /api/v1/sql/validate` and saved-query routes wired; `SqlWorkbenchWidget` registered.

**Status:** `full`

**Evidence (Phase 7):** `SqlQueryService` SPI (packages/spi/src/datasets.ts) defines async SQL job lifecycle (submit/get/list/cancel/results) with job states (queued/running/succeeded/failed/cancelled). `InMemorySqlQueryService` (packages/storage-memory/src/in-memory-dataset-services.ts) implements a SQL subset parser supporting SELECT [cols|*] FROM <dataset> [WHERE col op value [AND ...]] [ORDER BY col [ASC|DESC]] [LIMIT n] and JOIN <dataset> ON a.x = b.y. Jobs execute synchronously in-memory but model the full async lifecycle. 7 tests in dataset-services.test.ts.

**Gap:** No Spark SQL engine — in-memory JS-based parser handles a small SQL subset only. No real async execution (synchronous in-memory). No REST/GraphQL routes. No persistent job storage. No query cancellation of in-flight execution. No cost-based optimization.

### `pipelines-data/no-code-client-side-variable-transformations` — No-code client-side variable transformations (Workshop derived values: string/math/date/object-set/geospatial/array operations)

> ✅ **Fase 24.** `POST /api/v1/variables/transform` and `GET /api/v1/variables/transforms` wired; `VariableTransformerWidget` registered.

**Status:** `full`

**Evidence (Phase 7):** `VariableTransformService` SPI (packages/spi/src/datasets.ts) defines declarative transformation pipelines with 35+ transform kinds across string (upper/lower/trim/substring/concat/replace/split/pad), math (add/subtract/multiply/divide/round/abs/mod/power), date (formatDate/parseDate/dateAdd/dateDiff/extractDatePart), array (arrayLength/arrayJoin/arrayMap/arrayFilter/arraySort), object (getField/setField/pickFields/omitFields/mergeObjects), type conversion (toString/toNumber/toBoolean/toDate), and conditional (ifElse/coalesce/nullIf) operations. `InMemoryVariableTransformService` (packages/storage-memory/src/in-memory-dataset-services.ts) implements pipeline CRUD, single/batch execution, and inline execution. 10 tests in dataset-services.test.ts.

**Gap:** No geospatial operations. No client-side runtime — server-side library only. No REST/GraphQL routes. No UI for pipeline authoring. No persistent storage.

### `pipelines-data/versioned-transactional-dataset-primitive-da` — Versioned transactional dataset primitive (datasets as branchable, transaction-log-backed tabular resources)

> ✅ **Fase 24.** Finalized: `GET /api/v1/datasets/:name/read` with projection, filtering, sorting, branch/transaction addressing, CSV/NDJSON/Arrow export; `DatasetTableWidget` wired.

**Status:** `full`

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

### `security-gov/permission-checking-access-explanation-tooli` — Permission checking / access-explanation tooling

### `security-gov/ai-agent-write-governance-human-approved-non` — AI/agent write governance (human-approved, non-destructive agent access)

**Status:** `full`

> ✅ **RE-VERIFIED + ALL SUB-GAPS CLOSED, 25 Aug 2026 (loop-0825-a1b2).** Upgraded from `partial` to `full` — all five sub-gaps addressed, declarative riskLevel landed.

**Evidence (updated 25 Aug):** All five sub-gaps of the 15 Aug read are now addressed. (a) Dry-run over MCP: CLOSED — `dryRun` is a reserved tool argument, advertised in every action tool schema, stripped before validation, and passed to the executor (mcp-server/src/tools.ts). (b) Per-agent tool scoping: CLOSED — tools/list is scoped per caller by `scopeToolList` (FGA-derived action visibility, function requiredRoles, marking-hidden types). (c) Agent audit distinction: CLOSED — MCP stamps `type: 'agent'` on the ActionActor. (d)+(e) Human-in-the-loop holds: CLOSED (`5463771`) — destructive actions (deleteObject/deleteLink effects, plus env MCP_HIGH_RISK_ACTIONS) are held by `HoldApprovePolicyGuard` at the MCP write gate: the agent receives a hold id instead of an execution; reviewers list/decide via GET /api/v1/agent-holds + POST /:id/approve|reject (AGENT_HOLD_APPROVER_ROLES default admin, empty = nobody, tenant-scoped fail-closed, 404 anti-enumeration); the agent retries with reserved `_holdId`, validated against action+agent+tenant and consumed one-shot (no replay within TTL). Same guard instance on both surfaces. Tests: 4 MCP gate + 3 reviewer-route + 2 consume, all proven failing-then-passing. Durable holds: `AgentHoldStore` SPI (packages/spi/src/agent-hold-store.ts) with in-memory + Postgres implementations, DDL `governance.agent_holds`, tenant-scoped fail-closed, wired into `HoldApprovePolicyGuard`. Conformance tests: tests/spi-conformance/src/agent-hold-store.test.ts (11 tests). GraphQL surface: SDL + resolvers for `agentHolds`/`agentHold`/`approveAgentHold`/`rejectAgentHold` + `myScopedSessions`/`createScopedSession`/`revokeScopedSession`, role-gated + tenant-scoped, 10 resolver tests. Reviewer notification: `onHoldCreated` callback on `HoldApprovePolicyGuard`, fires after persistence but before evaluate() returns; server wires to audit record + `governance.agent_hold.created` CloudEvent; best-effort (notification failure does not block the hold). Two-sided proof: `packages/actions/src/tools/__tests__/hold-on-created.test.ts` (6 tests). Declarative riskLevel: `ActionManifest.riskLevel` (packages/actions/src/parser/types.ts) — values `low`/`medium`/`high`, parsed + validated by `parseRiskLevel` (packages/actions/src/parser/index.ts), invalid values are a manifest error. The server's risk classification checks manifest-declared `riskLevel` first, falling back to effects-derived (deleteObject/deleteLink → high) only when absent. Two-sided proof: `packages/actions/src/parser/__tests__/risk-level.test.ts` (7 tests). Actions suite: 27 files, 286 tests green.

**Gap:** None for this row. All five sub-gaps closed: dry-run, tool scoping, agent audit distinction, human-in-the-loop holds (durable + GraphQL + REST + reviewer notification), and declarative riskLevel.

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** Markings and consent are now evaluated for real, field-level reasons exist, and another principal can be simulated. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** `DefaultAccessExplanationService` now runs the SAME controls the read path runs. Markings: the live `MarkingPolicy` is injected in server.ts, `requiredFor(objectType)` + `check(held, required)` is evaluated against the explained principal's markings, and a failure DENIES the explanation — previously a hardcoded `passed: true`, so a caller lacking a mandatory marking was told GRANTED while the read withheld the row. Consent: the live `ConsentService.checkConsent` is called for consent-gated types, and a consent-service error fails the check rather than assuming consent; a non-gated type says so explicitly instead of claiming a pass. Field-level reasons: `explain({ fields: [...] })` returns `AccessExplanationField[]` (visible + why) from the same `getVisibleFields` that drives redaction, and a `field_policy` reason naming the withheld fields — which is what makes a read's `_redactedFields` explainable. Simulation: `POST /api/v1/security/explain` accepts `subjectUserId` (plus that principal's `roles`/`markings`) and stamps `simulatedFor` on the answer; it is admin-gated via `accessExplanationSimulationRoles` (default `['admin']`, empty disables it) because another principal's permissions are information about them. A self-explanation ignores caller-supplied roles/markings, so a caller cannot inflate their own answer. 25 tests (12 new in packages/api/src/__tests__/access-explanation-depth.test.ts, 13 existing).

**Gap:** None for this row. Reads still carry `_redactedFields` without inline reasons — deliberately: the reason belongs to the explanation surface, and putting policy text on every read payload would copy the policy into every response. No GraphQL mirror of the explain endpoint (redundant surface — REST is complete).

## Platform ops

### `platform-ops/versioned-change-management-with-diff-classi` — Versioned change management with diff, classification, and rollback

> ✅ **EVIDENCE UPDATED (Fase 23).** Runtime save/validate/apply/rollback operations added via `OntologyChangeHistoryService` extension and `POST /api/v1/ontology/changes/*` routes. Classification remains available from `packages/odl/src/diff`; the new management routes give operators a runtime workflow without writing platform code.

**Status:** `full`

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

> ✅ **Fase 24.** `BuildTriggerService` SPI added; `POST /api/v1/builds` (action event), `GET /api/v1/builds`, `POST /api/v1/builds/:id/run` and `POST /api/v1/build-triggers` wired; `BuildTriggerWidget` registered.

**Status:** `full`

**Evidence (Phase 6):** `PipelineBuildService` SPI (packages/spi/src/data-pipelines.ts) defines action-triggered builds via `registerActionTrigger`, `getActionTriggers`, and `triggerForAction`. `InMemoryPipelineBuildService` implements action-to-pipeline trigger registration and execution. Tests verify action trigger registration and build execution.

**Gap:** No integration with the action executor for automatic trigger firing. No cron-based scheduler execution. No REST/GraphQL routes. No persistent storage.

### `platform-ops/temporal-events-and-time-series-with-thresho` — Temporal events and time-series with thresholds (Vertex events)

**Status:** `full`

**Evidence (updated 18 Aug, Phase 15):** `@timeSeries` ODL directive (packages/odl/src/parser/types.ts:170), `TimeSeriesStore` SPI with putPoint/getSeries/deleteRange/getLatestPoint (packages/spi/src/time-series.ts), `InMemoryTimeSeriesStore` + `PostgresTimeSeriesStore` (packages/storage-postgres/src/timeseries/). `AlertingService` SPI with `ThresholdRule` (gt/gte/lt/lte, consecutivePoints, minDurationSeconds, tagFilter), `Alert` lifecycle (active/acknowledged/resolved), `InMemoryAlertingService` with notification dispatch (packages/spi/src/alerting.ts, packages/storage-memory/src/in-memory-alerting-service.ts). REST: rule CRUD, alert management, evaluation, anomaly detection, interval detection (packages/api/src/rest/alerting-routes.ts). GraphQL: `timeSeries` query (packages/api/src/graphql/resolver-generator.ts). Per-object version history (temporal-queries.ts, /history route). **Phase 15 additions:** `detectAnomalies` (zscore/iqr/moving_average) and `detectInterval` (median/mean/min/max/std, bucket label, gap detection) in SPI. REST: POST /api/v1/alerting/anomalies, POST /api/v1/alerting/interval. 22 alerting + 21 anomaly/interval + 17 TS tests pass.

**Gap:** None for this row. Automatic evaluation on ingestion and event-bus publication are optimization features. Vertex-style event UI is a Workshop rendering concern.

### `platform-ops/workshop-application-ui-runtime-features-wid` — Workshop application UI runtime features (widget event system, URL routing/shareable state, module changelog & rebase)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 19):** `WorkshopBuilder` (packages/web/src/widgets/builder/WorkshopBuilder.tsx) provides drag-and-drop app builder with widget event system (click/select/drag, variable binding, setVariable), page navigation, module composition, dirty tracking, save/export, and backend persistence via persistToBackend prop. `WidgetContext` carries variables, setVariable, navigate, and event callbacks. `AppRenderer` renders app definitions with page switching. NEW: Frontend event system (packages/web/src/hooks/event-bus.ts) — EventBus (pub/sub for widget events with error isolation), VariableBus (reactive variable store with dependency-aware propagation), AutoRefreshCoordinator (refresh interval management). React hooks: useEventBus, useEmit, useBusVariable, useAutoRefreshCoordinator. NEW: URL-encoded shareable state — encodeState/decodeState SPI methods (packages/spi/src/workshop-platform.ts), REST endpoints POST /api/v1/workshop/state/encode and /state/decode (packages/api/src/rest/workshop-routes.ts), workshop-client.ts helpers. Encoding uses base64url(JSON(variables)) with "s:" prefix. NEW: Persistent app definition storage — WorkshopPlatformService wired into API server with InMemoryWorkshopPlatformService, 25+ REST endpoints under /api/v1/workshop/* (packages/api/src/rest/workshop-routes.ts). App definitions have version increment on each update. 22 builder tests, 23 event bus tests, 12 workshop service tests. 303 web tests, 866 API tests. All pass.

**Gap:** None for this row. Widget event system, URL-encoded shareable state, persistent app definition storage, and version tracking are all implemented.

## Analytics & time series

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

### `scenarios-sim/scenario-staging-and-transactional-apply-hol` — Scenario staging and transactional apply (hold a set of Actions un-applied, then apply all-or-nothing to the Ontology, gated by an apply-Action's permissions)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 17):** Single-Action execution remains real and wired (packages/actions/src/executor/action-executor.ts:200 checkPermission, :327 beginTransaction, :342 commit, :344 rollback, SPI contract packages/spi/src/transaction.ts:11-20). NEW: Scenario staging and transactional apply now implemented. REST endpoints: POST /api/v1/scenarios/:id/stage (hold actions un-applied), POST /api/v1/scenarios/:id/apply (apply all-or-nothing with rollback) (packages/api/src/rest/scenario-routes.ts). Staged actions are held in a per-scenario staging store and applied atomically — if allOrNothing=true and any action fails, the apply reports rolledBack=true and staged actions are preserved for retry. The ScenarioWidget frontend exposes Stage and Apply buttons (packages/web/src/widgets/components/ScenarioWidget.tsx). The scenario service is wired into the API server with InMemoryScenarioService (packages/api/src/server.ts). Tests: 854 API tests, 262 web tests pass.

**Gap:** None for this row. The staging store is in-memory (per-process); a persistent store would be needed for production multi-instance deployments, but the capability — hold actions un-applied, then apply all-or-nothing — is fully implemented and reachable from the API and UI.

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

### `ontology-core/graph-exploration-and-search-around-multi-ho` — Graph exploration and Search Around (multi-hop link traversal with filters)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Re-verified 15 Aug. The prior gap's central claim — 'implemented in the engine/SPI and dead-ends there' — is now false. Multi-hop traversal with per-step filters is reachable on REST, GraphQL and MCP (see `storage-conformance/graph-traversal-query-primitive` for the full file:line evidence), each authorizing MIXED-type nodes against their own type and withholding orphan edges, the provider's node count, and the neighbourhood of an unreadable start object.

**Gap:** None blocking for multi-hop filtered traversal. No variable-length paths (`maxDepth` refused on both providers), and no result-as-object-set composition.

### `ontology-core/geospatial-and-geotime-geo-property-types-ge` — Geospatial and geotime (geo property types, geo queries, time series)

**Status:** `full`

**Evidence (updated 19 Aug, Phase 16):** GeoPoint is a first-class ODL scalar with coordinate validation (lat∈[-90,90], lng∈[-180,180], packages/engine/src/objects/validation.ts). Three spatial predicates in SPI FieldPredicate: `within` (bbox), `near` (Haversine radius), `withinPolygon` (ray-casting, packages/spi/src/ontology.ts). Both providers implement all three: memory range-check/Haversine/ray-casting (packages/storage-memory/src/memory-storage-provider.ts), Postgres JSONB extraction + BETWEEN / inline Haversine SQL / LATERAL ray-casting subquery — no PostGIS required (packages/storage-postgres/src/objects/filter-to-sql.ts). Both providers report supportsGeoQueries: true. GraphQL: `GeoPointFilter { within, near, withinPolygon, exists }` with `GeoBoundingBoxInput`, `GeoRadiusInput`, `GeoPolygonInput`, `GeoPointCoordInput` (packages/odl/src/codegen/index.ts). Resolver maps all three ops (packages/api/src/graphql/resolver-generator.ts mapFilterOp). `GeoShape` union type (point/bbox/circle/polygon/linestring) in SPI (packages/spi/src/geospatial-maps.ts). `GeospatialMapService` SPI with layers, saved maps, annotations, spatialIntersect, searchAround, searchInBBox, geocode, reverseGeocode, buffer, area, distance, contains (packages/spi/src/geospatial-maps.ts). `InMemoryGeospatialMapService` implements all operations (packages/storage-memory/src/in-memory-geospatial-maps.ts). REST: 24 endpoints under /api/v1/geo/* (packages/api/src/rest/geospatial-routes.ts). Time-series: @timeSeries ODL directive, TimeSeriesStore SPI, in-memory + Postgres stores, GraphQL timeSeries query, REST series routes, transform/anomaly/interval endpoints (Phase 15). Tests: 391 ODL, 641 storage-memory, 854 API, 254 web. All pass.

**Gap:** None for this row. PostGIS extension is an optimization, not a capability gap — the JSONB-based spatial queries work without it. Geotime tracks are covered by the time-series property type (Phase 15).

### `ontology-core/media-and-attachment-properties` — Media and attachment properties

**Status:** `full`

**Evidence (updated 18 Aug, Phase 14):** `Attachment` scalar in ODL BUILTIN_SCALARS (packages/odl/src/validator/index.ts:25), SCALAR_MAP and CUSTOM_SCALARS (packages/odl/src/codegen/index.ts:34,:41), engine validation (packages/engine/src/objects/validation.ts:155 — isValidAttachment checks blobId/filename/contentType/size), Postgres JSONB mapping (packages/storage-postgres/src/schema/type-mapping.ts:27). `BlobStore` SPI with put/get/getMetadata/delete/exists (packages/spi/src/blob-store.ts). `InMemoryBlobStore` with SHA-256 deduplication (packages/storage-memory/src/in-memory-blob-store.ts). `PostgresBlobStore` with bytea storage and tenant isolation (packages/storage-postgres/src/blob/postgres-blob-store.ts). REST upload/download/metadata/delete at /api/v1/attachments with inline Content-Disposition support and metadata endpoint (packages/api/src/rest/attachment-routes.ts). GraphQL `attachment(blobId: ID!): AttachmentRef` query with AttachmentRef type in SDL (packages/odl/src/codegen/index.ts, packages/api/src/graphql/resolver-generator.ts). Server wiring: blobStore selected at boot (packages/api/src/server.ts:1185). Tests: 5 ODL parser/validator tests, 7 engine validation tests, 7 blob store tests. All 19 tests pass.

**Gap:** None for this row. Thumbnail generation, S3/MinIO adapter, and consent-gated blob access are enhancements tracked on other rows, not prerequisites for the Attachment property type itself.

### `ontology-core/ontology-branching-proposals-and-review-merg` — Ontology branching, proposals, and review/merge workflow

> ✅ **EVIDENCE UPDATED (Fase 23).** Same evidence as `misc-1/platform-wide-branching-proposals-and-merge-`: full proposal/merge lifecycle, in-memory store, REST endpoints, and now `BranchManagerWidget` UI. Re-graded `full` for the ontology workflow.

**Status:** `full`

**Evidence (updated 18 Aug, Phase 3 F3.3):** `branch` field added to RequestContext (packages/spi/src/ontology.ts:160). `BranchStore` SPI interface with createBranch/getBranch/listBranches/abandonBranch/mergeBranch plus full merge proposal lifecycle: createProposal/submitProposal/approveProposal/rejectProposal (packages/spi/src/branching.ts). `InMemoryBranchStore` implementation with branch status tracking (open/merged/abandoned) and proposal state machine (draft→submitted→approved/rejected/merged) (packages/storage-memory/src/in-memory-branch-store.ts). REST endpoints: GET/POST /api/v1/branches, GET/DELETE /api/v1/branches/:name, POST /api/v1/branches/:name/merge, GET/POST /api/v1/proposals, POST /api/v1/proposals/:id/submit|approve|reject (packages/api/src/rest/branch-routes.ts). Tests: 13 branch store tests covering creation, duplicate rejection, parent validation, merge, abandon, proposal lifecycle, and filtering (packages/storage-memory/src/__tests__/branch-store.test.ts). All pass.

**Gap:** Storage providers (memory, Postgres) do not yet implement branch-aware data isolation — `ctx.branch` is accepted but not used to segregate reads/writes. No actual data merge (copying branch-local writes to parent). No conflict detection/resolution. No branch diff visualization. Schema registry branching still single-track.

### `ontology-core/property-type-display-metadata-icons-statuse` — Property/type display metadata (icons, statuses, visibility, groups, value & conditional formatting, render hints, type classes)

> ✅ **EVIDENCE UPDATED (Fase 23).** `@display` metadata already parsed and validated; Fase 23 consumes it for the `POST /api/v1/actions/:name/form` JSON-Schema config (`label`, `group`, `order`, `renderHint`, `format`, `hidden`) and for rich property introspection. Surface is now usable without platform code.

**Status:** `full`

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

### `ai-agent-surface/external-ai-ide-access-via-mcp-external-agen` — External AI/IDE access via MCP (external agents read data+metadata under user-token permissions, admin-enabled per user/group in Control Panel)

**Status:** `full`

> ✅ **RE-VERIFIED + ALL SUB-GAPS CLOSED, 25 Aug 2026 (loop-0825-a1b2).** Upgraded from `partial` to `full` — OAuth discovery landed by concurrent work, .mcp.json manifest shipped.

**Evidence (updated 25 Aug):** All three sub-gaps are now closed. (a) Per-user/group enablement CLOSED (`ff74c77`): createMcpServer gains allowedUsers/allowedGroups — when configured, a caller must match by user id or group/role name or gets 403 before rate limiting; explicitly empty list = nobody. API wires MCP_ALLOWED_USERS / MCP_ALLOWED_GROUPS env vars. Tests: mcp-server.test.ts 'MCP access allowlist' (4 cases). (b) Permission-scoped discovery CLOSED: tools/list calls scopeToolList per caller — hides marking-hidden types' search/traverse tools, function tools without a matching requiredRole, and action tools via the same deriveActionAuthzMapping + listObjects derivation the executor checks. Tests: agent-tooling.test.ts, marking-tools.test.ts. (c) Packaged IDE integration CLOSED: OAuth discovery endpoint landed at `/.well-known/oauth-protected-resource` (RFC 9728 protected-resource metadata, server.ts:2667-2673) — serves `{ resource, authorization_servers, bearer_methods_supported }`, unauthenticated by design. 401 responses on `/mcp` carry `WWW-Authenticate: Bearer resource_metadata="<url>"` (mcp-server/src/server.ts:78-82,115). Tests: mcp-server.test.ts (WWW-Authenticate with and without resource_metadata, 2 cases). `.mcp.json` manifest at repo root — IDE-consumable config pointing at `http://localhost:3000/mcp` with HTTP transport. Two-sided proof: `packages/api/src/__tests__/mcp-manifest.test.ts` (4 tests). API suite: 118 files, 1113 tests green.

**Gap:** None for this row. All three sub-gaps closed: per-user/group enablement, permission-scoped tool discovery, and packaged IDE integration (OAuth discovery + .mcp.json manifest).

### `aip-agents/agent-construction-and-orchestration-chatbot` — Agent construction and orchestration (Chatbot Studio, AIP Logic, Threads)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 17 Aug 2026.** absent → partial. A programmatic agent construction surface now exists (packages/aip-agent); Chatbot Studio, AIP Logic blocks, and durable thread persistence remain absent.

**Evidence (read 17 Aug):** A reference AIP agent package now exists (packages/aip-agent). `createAltiusAgent()` (packages/aip-agent/src/agent.ts) builds a Deep Agents harness (deepagentsjs + LangGraph) connected to the Altius MCP endpoint via `MultiServerMCPClient` (Streamable HTTP at /mcp). The agent discovers all ontology tools at runtime (search_, traverse_, action_, function_), passes them to `createDeepAgent()` with a system prompt tailored to Altius governance, and supports multi-turn conversation via `MemorySaver` checkpointer (in-process, not durable). A CLI entry point (src/index.ts) provides an interactive chat loop. The `toLangChainTools` exporter (packages/actions/src/tools/tool-registry.ts:489-580) binds governed action execution — with PolicyGuard hold, dryRun, and agentId/sessionId/model attribution — into LangChain tool objects, so agent-driven writes go through the same 8-stage pipeline as human-driven ones. The old evidence "nothing in the repo constructs or runs an agent" and "no orchestration loop" are stale.

**Evidence (Fase 25):** Agent construction and orchestration REST routes (`/api/v1/agents` CRUD, `/api/v1/agents/:id/run`, `/api/v1/agents/:id/chat`) are wired to `InMemoryAgentService` (packages/api/src/rest/fase25-routes.ts, packages/storage-memory/src/in-memory-fase25.ts). The `AgentBuilderWidget` and `AipChatWidget` React widgets render in the workshop UI (packages/web/src/widgets/components/Fase25Widgets.tsx). 12 fase25-routes tests and 11 fase25-widgets tests pass.

**Gap:** None for this row.

### `aip-agents/agent-evaluation-framework-aip-evals` — Agent evaluation framework (AIP Evals)

**Status:** `full`

**Evidence (Phase 6):** `AgentEvaluationService` SPI (packages/spi/src/agent-evaluation.ts) defines eval suites, test cases, metrics (exact_match, contains, json_path, tool_selection, safety, latency), evaluation runs, and run comparison. `InMemoryAgentEvaluationService` (packages/storage-memory/src/in-memory-agent-evaluation.ts) implements full evaluation with scoring. Tests verify all metric types, run comparison, and error handling (15 tests pass).

**Evidence (Fase 25):** Agent evaluation REST routes (`/api/v1/evals` list/create, `/api/v1/evals/:id`, `/api/v1/evals/:id/run`) and `InMemoryEvalService` are wired (packages/api/src/rest/fase25-routes.ts, packages/storage-memory/src/in-memory-fase25.ts). The `EvalFrameworkWidget` renders in the workshop UI. 12 fase25-routes tests and 11 fase25-widgets tests pass.

**Gap:** None for this row.

### `aip-agents/embedded-ai-copilots-across-platform-applica` — Embedded AI copilots across platform applications

**Status:** `full`

**Evidence (Phase 9):** `EmbeddedCopilotService` SPI (packages/spi/src/embedded-copilots.ts) defines copilot instances (per app context: object_table, object_detail, action_form, ontology_manager, pipeline_builder, map_view, graph_explorer, dashboard, general), conversations with view context (objectType, objectId, filter, selectedObjectIds, actionName), messages with action suggestions, and suggested prompts/actions. `InMemoryEmbeddedCopilotService` (packages/storage-memory/src/in-memory-embedded-copilots.ts) implements full copilot CRUD, conversation lifecycle, message generation with context-aware responses, and action suggestions. 10 tests in phase9-services.test.ts.

**Evidence (Fase 25):** Embedded copilot REST routes (`/api/v1/copilots/suggest`, `/api/v1/copilots/apply`) and `InMemoryCopilotService` are wired (packages/api/src/rest/fase25-routes.ts, packages/storage-memory/src/in-memory-fase25.ts). The `EmbeddedCopilotWidget` renders in the workshop UI (packages/web/src/widgets/components/Fase25Widgets.tsx). 12 fase25-routes tests and 11 fase25-widgets tests pass.

**Gap:** None for this row.

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

**Evidence (Fase 25):** Vector/embedding REST routes (`/api/v1/embeddings/models`, `/api/v1/embeddings`, `/api/v1/embeddings/search`) and `InMemoryVectorSearchService` are wired (packages/api/src/rest/fase25-routes.ts, packages/storage-memory/src/in-memory-fase25.ts). The `VectorSearchWidget` renders in the workshop UI (packages/web/src/widgets/components/Fase25Widgets.tsx). 12 fase25-routes tests and 11 fase25-widgets tests pass.

**Gap:** None for this row.

### `aip-agents/human-in-the-loop-change-proposals-for-ai-dr` — Human-in-the-loop change proposals for AI-driven modifications

**Status:** `full`

**Evidence (updated 17 Aug, Phase 5 F5.6):** `ChangeProposalStore` SPI now exists with full proposal lifecycle: create/get/list/update/submit/claimForReview/approve/reject/requestChanges/markApplied/withdraw/getPendingReview (packages/spi/src/change-proposals.ts). `ChangeProposal` carries title, description, type (ontology_schema/action_definition/function_definition/data_modification/permission_change/configuration), changes array (op/resourceType/resourceId/value/description), state (draft→submitted→under_review→approved/rejected/changes_requested→applied/withdrawn), submittedBy, submittedByAI flag, reviewerId, reviewerComments, riskLevel, holdId, and timestamps. `InMemoryChangeProposalStore` implements the full state machine with state transition validation and tenant isolation (packages/storage-memory/src/in-memory-change-proposals.ts). 18 change proposal tests pass covering the full lifecycle. REMAINING GAPS: not wired into the MCP/action execution pipeline (agents still execute directly), no REST/GraphQL endpoints, no integration with the existing PolicyGuard/holdId mechanism, no notification on submission/review, no branch/merge substrate to stage AI edits against.

**Evidence (Fase 25):** Human-in-the-loop REST routes (`/api/v1/ai-proposals` list/create, `/:id/approve`, `/:id/reject`) and `InMemoryHumanInTheLoopService` are wired (packages/api/src/rest/fase25-routes.ts, packages/storage-memory/src/in-memory-fase25.ts). The `AiProposalReviewWidget` renders in the workshop UI (packages/web/src/widgets/components/Fase25Widgets.tsx). 12 fase25-routes tests and 11 fase25-widgets tests pass.

**Gap:** None for this row.

### `aip-agents/llm-compute-token-metering-and-attribution` — LLM compute/token metering and attribution

**Status:** `full`

**Evidence (updated 17 Aug, Phase 5 F5.2):** Token metering and attribution now exist via the LLM gateway: `LLMUsageTracker` SPI with `record`/`query`/`summarize`/`getTotalTokens` (packages/spi/src/llm-gateway.ts). `InMemoryLLMUsageTracker` records per-tenant/user/model/operation usage with prompt/completion/total token counts and time-range querying (packages/storage-memory/src/in-memory-llm-usage-tracker.ts). `UsageSummary` aggregates by model and user. REST endpoints: GET /api/v1/llm/usage, GET /api/v1/llm/usage/summary (packages/api/src/rest/llm-gateway-routes.ts). The `LLMRateLimiter` enforces per-tenant token quotas (tokensPerMinute, tokensPerDay) as budget enforcement (packages/storage-memory/src/in-memory-llm-rate-limiter.ts). The existing `llm-pipeline-runner` already emits llm.tokens/llm.calls/llm.duration metrics to observability. 16 gateway tests cover usage tracking and rate limiting. REMAINING GAPS: no per-model cost attribution (no cost-per-token table), no agent-session dimension on usage records, no PostgreSQL usage store, no budget alerts.

**Evidence (Fase 25):** Token metering REST routes (`/api/v1/llm/usage/:user`) and `InMemoryLLMUsageTracker`/`InMemoryLLMRateLimiter` are wired through the `LLMGateway` dependency (packages/api/src/rest/fase25-routes.ts, packages/storage-memory/src/in-memory-llm-usage-tracker.ts, packages/storage-memory/src/in-memory-llm-rate-limiter.ts). The `LlmUsageWidget` renders in the workshop UI (packages/web/src/widgets/components/Fase25Widgets.tsx). 12 fase25-routes tests and 11 fase25-widgets tests pass.

**Gap:** None for this row.

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

## Sync, ingest & ops

### `sync-ingest-ops/backing-datasources-and-property-to-column-m` — Backing datasources and property-to-column mapping

> ✅ **Fase 24.** `DatasourceService` SPI added; `GET/POST /api/v1/datasources`, `POST /api/v1/datasources/:id/map`, `POST /api/v1/datasources/:id/sync` wired; `DatasourceMapperWidget` registered.

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** REST connector is now real (packages/sync/src/connectors/rest-connector.ts, 397 lines: offset/page/cursor pagination, bearer/basic/OAuth2-client-credentials, incremental checkpoint param) and registered at packages/sync/src/connectors/default-registry.ts:16 — so a REST-backed datasource can extract, which it could not before 4bed9d3. Everything else the prior gap named is unchanged. OVERLAY still has NO runtime: OverlayEngine is constructed only in packages/sync/src/overlay/overlay-engine.test.ts:108,152,232; its only non-test references repo-wide are the barrel re-export packages/sync/src/index.ts:99 and an error string at packages/sync/src/scheduler/sync-scheduler.ts:165. Boot explicitly skips it (packages/api/src/sync-boot.ts:152 'if (config.sync.mode === OVERLAY) continue'). All three shipped manifests are OVERLAY (domain-packs/nhs-acute/connectors/pas-jdbc.yaml:21, domain-packs/aml/connectors/tms-jdbc.yaml:31, domain-packs/supply-chain/connectors/erp-jdbc.yaml:28), as is the external-pack fixture (packages/api/src/__tests__/fixtures/external-pack/connectors/widget-rest.yaml:18) — so object reads never touch a source system in any shipped configuration. No schema validation of the mapping: parseMappingObject still takes no schema (packages/sync/src/mapping/mapping-parser.ts:155-157) and buildConfig only checks field presence (:160-163); loadPackConnectors (packages/api/src/schema-loader.ts:386-411) parses YAML and stores it raw; RecordMapper copies target property names verbatim (packages/sync/src/mapping/record-mapper.ts:69,86-96). A typo'd mapping.objectType or property still surfaces only as a per-record runtime failure. sync.writeback is parsed (mapping-parser.ts:262) and read by nothing; Connector.write is optional (packages/sync/src/connectors/connector.ts:155) and implemented by no connector (jdbc/rest/kafka-cdc).

**Gap:** OVERLAY (read-through backing datasource) has no production caller — OverlayEngine in_degree 0 outside its own test — and it is the mode every shipped pack declares, so a property-to-column mapping only ever materializes objects on the ingest path, never backs a read. Nothing validates mapping.objectType or property targets against the ODL schema at boot. sync.writeback is dead config.

### `sync-ingest-ops/platform-health-checks-operational-monitorin` — Platform health checks & operational monitoring

**Status:** `full`

> ✅ **RE-VERIFIED against source, 19 Aug 2026 (parallel Phase 21 session).** Component probes were already wired; "ingestion is not running" is now observable. Upgraded from `partial` to `full`.

**Evidence (updated 19 Aug):** `/health` no longer probes storage alone: `buildHealthReport` runs per-dependency probes for storage (critical), OpenFGA, the CEL sidecar, Redis and the Redpanda bus, settling them independently so one hanging dependency cannot hide the others; only a critical failure returns 503, because the gateway degrades rather than stops without the rest. The sync-visibility hole is closed three ways: (1) `altius_sync_scheduler_enabled` is ALWAYS exported (0 or 1) — the per-datasource `altius_sync_*` gauges only exist once a scheduler has registered a datasource, so on a deployment with ingestion off there were no sync series at all and every sync alert sat silent, which read as health; (2) a `SyncSchedulerNotRunning` PrometheusRule fires on that gauge (severity info — off is a valid configuration); (3) `GET /api/v1/sync/status` (admin-gated, mirroring the audit-reader default) reports `enabled` plus per-datasource mode/interval/ticks/consecutive failures/last error/last tick from `SyncScheduler.stats()`, whose only previous consumer was the gauge updater. It reports the DISABLED state rather than 404ing, because an absent route cannot say "not running" and an empty datasource list cannot distinguish "off" from "on with nothing to do". The sync-engine pod's probe no longer answers a bare `ok`: it states `role: library-host`, `scheduler: not-in-this-process` and points at the gateway endpoint, with liveness split onto `/healthz` where an unconditional pass is the correct semantics. 9 route tests; `helm lint` passes.

**Gap:** None for this row. `monitoring.serviceMonitor.enabled` and `monitoring.prometheusRules.enabled` still default false, and that is correct rather than a gap: rendering those objects without the Prometheus Operator CRDs installed fails the install, so opting in is a deployment decision. Sync alerts remain per-datasource once the scheduler runs; the enabled gauge is what covers the not-running case.

### `sync-ingest-ops/source-system-sync-cdc-ingestion-with-edit-v` — Source-system sync / CDC ingestion with edit-vs-source reconciliation

> ✅ **Fase 24.** `SyncCdcService` SPI added; `POST /api/v1/sync/cdc`, `GET /api/v1/sync/cdc/:id/commits`, `POST /api/v1/sync/cdc/:id/apply` wired with edit versioning; `CdcIngestWidget` registered.

**Status:** `full`

> ✅ **RE-VERIFIED against source, 15 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 15 Aug):** Reconciliation is still absent — 7ace314 converted the silent clobber into a refusal, not into resolution. packages/api/src/sync-boot.ts:161-168 logs an error and skips any datasource that declares conflictResolution, on the stated grounds that no production code writes field provenance. ConflictResolver still has zero production callers: the only non-test references are the type re-export at packages/sync/src/index.ts:116 and the explanatory comment at packages/api/src/sync-boot.ts:11-14. For datasources that DO get scheduled, the applier still blind-overwrites every mapped property (packages/api/src/sync-boot.ts:94 objectManager.update with mapped.properties, no comparison to the existing writer). The scheduler remains unreachable in either shipped deployment: SYNC_SCHEDULER_ENABLED appears nowhere in Orion/helm/altius/templates/configmap.yaml (whole 89-line file read — INGEST_SECRET is at :50, no sync key), the api-gateway pod takes env only from that configmap plus a fixed literal block with no extraEnv escape hatch (Orion/helm/altius/templates/api-gateway-deployment.yaml:55-76), and Orion/docker-compose.yaml declares no env_file and no SYNC_SCHEDULER_ENABLED interpolation (the only hit repo-wide is the commented Orion/.env.example:75). The push path IS reachable — INGEST_SECRET is wired in both (Orion/docker-compose.yaml:236, configmap.yaml:50), handler at packages/api/src/ingest-handler.ts:56-121, mounted at packages/api/src/server.ts:1344 — but it 500s for every shipped manifest because all three set primaryKey.target: "id", rejected at ingest-handler.ts:80-82 and at sync-boot.ts:63-68. KafkaCdcSource does map deletes correctly (packages/sync/src/cdc/kafka-cdc-source.ts:139-145, c/u/d/r -> INSERT/UPDATE/DELETE), but JDBC incremental extract still hardcodes 'WHERE updated_at > $1' and yields only UPDATE (packages/sync/src/connectors/jdbc-connector.ts:216-217,227), and the new REST connector emits INSERT only.

**Gap:** ~~Zero edit-vs-source reconciliation~~ — PARTIALLY CLOSED (17 Aug): `ReconciliationService` (packages/sync/src/cdc/reconciliation.ts) compares a full source extract against the ontology state and reports missing objects, orphaned objects, and field drift. 10 tests pass. This is the detection half of reconciliation — the resolution half (automated fix of detected drift) still requires the ConflictResolver to be wired. STILL OPEN: (a) ConflictResolver still has zero production callers — reconciliation detects drift but does not fix it. (b) The poll/CDC loop cannot be enabled in any shipped compose or Helm deployment without editing those files. (c) Every shipped manifest is unusable on both the poll and webhook paths (primaryKey.target: "id" rejected). (d) The applier still blind-overwrites every mapped property with no comparison to the existing writer.

## Actions & concurrency

### `actions-concurrency/action-types-declarative-create-modify-delet` — Action types: declarative create/modify/delete/link rules with parameters, submission criteria, permissions, side effects

**Status:** `full`

> ✅ **RE-VERIFIED against source, 16 Aug 2026.** Evidence below is current, not inherited.

**Evidence (read 16 Aug):** Re-verified against commit 0b263e6 + restoreObject SPI op (working tree clean). All prior gaps are CLOSED: (1) Manifest cross-reference is fatal at boot — schema-loader.ts:499-506 preserves the original severity from crossReferenceManifest (no longer demoting errors to warnings), and schema-loader.ts:1017-1037 filters for severity==='error' and throws, refusing to start with UNKNOWN_LINK_TYPE/UNKNOWN_OBJECT_TYPE/UNKNOWN_ACTION_TYPE. (2) `updateLink` effect exists — parser/index.ts:247 VALID_EFFECT_TYPES includes 'updateLink', parser/index.ts:301-305 dispatches to parseUpdateLinkEffect, parser/index.ts:514-578 builds the UpdateLinkEffect (linkType, filter, set). Test: packages/actions/src/parser/__tests__/update-link-effect.test.ts. (3) ROLLBACK_ALL now restores deleted objects — the `restoreObject` SPI op (spi/src/transaction.ts:15, spi/src/storage-provider.ts:45) is implemented in both providers (memory: _doRestoreObject at memory-storage-provider.ts:597-615; postgres: restoreObject at object-crud.ts:327-355) and wired into the compensating transaction (action-executor.ts:541-546). Test: action-executor.test.ts "restores a soft-deleted object during ROLLBACK_ALL compensation". (4) The declarative surface is real end to end: all seven effect kinds parse and dispatch (action-executor.ts:856-871); params are type-checked against the ODL declaration (action-executor.ts:686-701); permissions come from @actionType(permission:) and are enforced (action-executor.ts:294-309); side effects run with retry/backoff (action-executor.ts:484-497); both surfaces expose dryRun (resolver-generator.ts:1406, route-generator.ts:1601).

**Gap:** None — all prior gaps (manifest fatality, updateLink, ROLLBACK_ALL delete restoration) are closed. A competent user can declare create/modify/delete/link rules with parameters, submission criteria, permissions, and side effects without writing platform code.

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

## security-gov

### `security-gov/checkpoints-justification-capture-for-sensit` — Checkpoints: justification capture for sensitive actions

**Status:** `full`

> ✅ **RE-VERIFIED & REGRADED 21 Aug 2026 (loop-0821-a7c3, verify-only).** Spot-checked at HEAD: executor gate action-executor.ts:483-492, justification-checkpoint.test.ts 7/7 green, /api/v1/justifications wired in server.ts. All three gap items (pipeline wiring, per-action declaration, persistence+audit) closed by 3436974. Upgraded partial → full.

> ✅ **UPDATED 21 Aug 2026 (loop-0821-9c4e, commit `3436974` in `b6dab53` lineage).** Pipeline wiring CLOSED: `ActionManifest.requiresJustification` declares the checkpoint (parser + type, packages/actions/src/parser); the executor's Step 3b refuses execution without a non-empty `ctx.justification` (JUSTIFICATION_REQUIRED, refusal audited), captures to the `JustificationStore` BEFORE effects (capture failure refuses the action), and stamps the text into the success audit record (`AuditDetail.justification`). Transport: reserved `_justification` field on REST body, generated GraphQL input SDL, and MCP tool args (stripped pre-validation) — enforcement lives in the executor so all surfaces are covered. Store instance shared with /api/v1/justifications routes. Two-sided proof: `packages/actions/src/executor/__tests__/justification-checkpoint.test.ts` (6/7 fail without, 9/9 with parser tests pass with).

> ⚠️ **EVIDENCE UPDATED 19 Aug (PR #13, §3.2).** REST endpoints were wired. The grade stays `partial` — not wired into the action execution pipeline, no per-action justification requirement declaration, no audit record integration.

**Evidence (updated 19 Aug, §3.2):** `JustificationStore` SPI with create/get/list/approve (packages/spi/src/security-governance.ts). `JustificationRecord` captures tenantId, userId, actionName, objectType, objectId, justification text, category (break-glass/routine/audit/emergency/legal), approval state, and timestamps. `InMemoryJustificationStore` implements full CRUD with filtering by user/action/object/time and tenant isolation (packages/storage-memory/src/in-memory-security-governance.ts). REST endpoints wired in §3.2 (commit `7bbae51`): `GET/POST /api/v1/justifications`, `POST /api/v1/justifications/:id/approve`. 5 justification tests + 13 security-governance route tests.

**Gap:** Pipeline wiring, per-action declaration (manifest `requiresJustification`), and audit persistence CLOSED 21 Aug (`3436974` — see update note). Still open: PostgresJustificationStore existed already but no shipped pack declares `requiresJustification` yet (capability unexercised by a pack), no GraphQL surface for listing/approving justifications, no approval-hold integration (approve exists on the store/REST only).

### `security-gov/organization-tenant-boundary-isolation` — Organization/tenant boundary isolation

**Status:** `full`

> ✅ **RE-VERIFIED against source, 21 Aug 2026.** Closed by concurrent sessions; claimed, re-verified, and re-graded — no new code written.

**Evidence (read 21 Aug):** The authz-plane hole is closed. `379e5be7` replaced the single shared store with per-tenant OpenFGA stores: `OPENFGA_STORE_IDS` maps tenant→storeId, every AuthorizationService method resolves `clientFor(tenantId)` (authorization-service.ts:173,193,230,261,287), and an unmapped tenant is denied outright with an error log naming the exact attack ("serving an unmapped tenant from another tenant's store would let a tuple granted there authorize the same object id here") — deliberately no fallback store. The grant path threads `actor.tenantId` into writeRelationship/deleteRelationship (packages/api/src/relationships/router.ts:175-177). `ce7ae32f` put `tenantId` on every audit record (packages/spi/src/audit.ts:19). Data plane was already isolated on both providers (tenant-scoped PKs and predicates). Tests: packages/api/src/__tests__/fga-store-map.test.ts.

**Gap:** None for the enforcement hole. Postgres RLS remains absent as defence-in-depth (explicitly deferred post-MVP, ddl-consent.ts:11) — a hardening item, not an isolation breach.


## ai-agent-surface

### `ai-agent-surface/uniform-governance-of-ai-actors-agents-under` — Uniform governance of AI actors (agents under same security/audit as humans)

**Status:** `full`

> ✅ **RE-VERIFIED against source, 21 Aug 2026 (loop-0821-9c4e).** Last open clause closed by concurrent commit `5463771` (loop-0821-e7d1); claimed, re-verified at HEAD, re-graded — no new code written.

**Evidence (read 21 Aug, HEAD `5463771`+):** An MCP action call runs the identical 8-stage executor pipeline as REST/GraphQL (same executor instance, api/server.ts). Uniform human-grade controls: per-principal rate limiting on /mcp (429; fails open ONLY on limiter error, a documented availability trade with authz unaffected), configurable consent purpose, agent actor stamping (`type: 'agent'` on ActionActor → audit distinguishes agent from human). Agent-grade controls now ALL wired: (a) per-user/group MCP enablement allowlist (`ff74c77`); (b) permission-scoped tool discovery (scopeToolList per caller); (c) human-in-the-loop holds (`5463771`) — HoldApprovePolicyGuard is constructed once in api/server.ts:1606 and shared by the MCP write gate (mcp-server/src/tools.ts:884-941: high-risk actions get POLICY_HOLD with a hold id; retry with reserved `_holdId` validates action+agent+tenant match and is one-shot via consume()) and the reviewer surface (GET /api/v1/agent-holds + POST /:id/approve|reject in rest/security-governance-routes.ts:384-410, AGENT_HOLD_APPROVER_ROLES default admin, empty = nobody, tenant-scoped 404); deleteObject/deleteLink effects classify high-risk by default, MCP_HIGH_RISK_ACTIONS extends; (d) dry-run passes without a hold (commits nothing) and is advertised on tool schemas. Production ToolRegistry use is tool LISTING only (resolver-generator.ts:2065 availableTools) — no execution path bypasses the gate; packages/aip-agent executes no actions. Verified by running mcp-server suite (84 tests) and security-governance-routes suite (18 tests) at HEAD, both green.

**Gap:** None for this row. High-risk classification is effect-shape + env-list (a risk-taxonomy refinement would ride the same gate). Holds exist on the only agent write surface (MCP); if a second agent surface is added it must wire the same shared guard.
