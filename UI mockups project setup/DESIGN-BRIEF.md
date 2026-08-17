# Altius UI mockups — locked brief

All decisions below are settled across nine rounds of questions. Build from this.

## Direction
- **Shell:** C (Editorial) — `Shell-C-Editorial.dc.html`. Large type, air, rules as
  structure, prose in the governance rail.
- **Character:** quiet infrastructure leads; instrument-panel numerals as accent.
- **Type:** IBM Plex Mono (labels, data, numerals) + IBM Plex Sans (body, headings).
- **Colour:** greyscale chrome. Colour only in data viz — utilisation bars, occupancy,
  throughput, map arcs. Status reads via glyph + weight, not hue, in tables.
  Data-viz values in use: `#2f6b4f` healthy, `#9a7b2f` pressure, `#a8452c` disrupted.
- **Theme:** both schemes, light default. **Density:** roomy. **Canvas:** fluid.

## Structure
- Icon rail (OP / IN / MO / AD) grouped **by job**: Operate, Investigate, Model, Administer.
  Secondary sidebar lists the screens within the active job.
- **Pack switcher** in the sidebar: supply.chain (default), nhs.acute, aml — same screens,
  three packs of data.
- **Role switcher** in the chrome: warehouse_manager / logistics_manager / supply_chain_admin.
  Changes what is redacted, withheld and refused on screen.
- **Object detail:** full-page — clicking a facility replaces the list.
- **Entry screen:** Ops map.
- **Build split:** one file with all eleven screens, plus a second file showing today's
  bare worklist **side by side** with the new explorer, same data.

## Governance — front and centre, all five mechanisms
1. Persistent right-hand rail: principal, tenant, relations held, what is withheld here.
2. Inline per-cell truth: `consent withheld` / `redacted` / `—` rendered distinctly.
3. Footer trace bar: pipeline stages, audit id, trace id, duration.
4. Pre-flight on actions: the 8 pipeline stages before and after commit.
5. Denial is a first-class screen, not a toast.
- Rail **speaks as data** on ops screens, **as prose** on explainer screens.
- **Staged refusal showpiece:** an MCP agent refused mid-tool-call — same pipeline,
  non-human principal.

## Screens (11)
Operate: Ops map · Facilities (anchor) · Shipments · Purchase orders · Inventory · Action console
Investigate: Audit trail · Consent & permissions inspector · Graph / link explorer · MCP activity
Model: Ontology / schema explorer · Domain pack manager
Administer: Sync & connector health · FDP-CDM projection

## Ops map
Real coastlines from geo data, facilities at true coordinates, origin→destination arcs.
Projection still open (equirectangular vs Natural Earth) — pick at build time; equirectangular
is the default if unanswered.

## Motion
Live only where it means something: CDC lag and the event feed tick. Everything else still.
The real client coalesces subscription events over 250ms — mirror that cadence.

## Source of truth — read these, do not invent
- `packages/web/src/App.tsx`, `components/ObjectTable.tsx`, `ActionPanel.tsx`,
  `ActionForm.tsx`, `index.css` — today's UI, and the redaction/consent/empty distinction.
- `domain-packs/supply-chain/schema/*.odl` — Facility, Supplier, Product, PurchaseOrder,
  Shipment, InventoryRecord; 7 link types; enums incl. ShipmentStatus CUSTOMS_HOLD / LOST.
- `domain-packs/supply-chain/permissions/supply-chain-roles.fga` — `facility.viewer: assigned`,
  `purchase_order.can_ship`, `shipment.can_receive`, `inventory_record.viewer from at_facility`.
- `domain-packs/supply-chain/actions/*.yaml` — CreateOrder, ShipOrder, ReceiveShipment, CancelOrder.
- `domain-packs/nhs-acute/**` — for the nhs.acute pack in the switcher.
- `docs/mcp-server.md` — the MCP tool-call path for the staged denial.
