# ODL design guide — domain packs

Adapted from Foundry ontology design docs (best-practices, anti-patterns, structural-guidance — mirrored in docs/foundry/). Rules verified against ODL parser capabilities 21 Aug 2026. Audience: anyone (human | agent) writing a client domain pack.

## Principles (priority order; higher wins on conflict)

1. **Model reality, not systems.** ObjectType = real-world entity (`Shipment`, `Vessel`, `Patient`, `Wallet`), ⊥ source table / API response. Link = real relationship, ⊥ join-key artifact.
2. **DRY, rule of three.** Same shape 3× → refactor to one canonical type | shared interface. 1× coincidence, 2× pattern, 3× refactor.
3. **Open for extension, closed for modification.** Production type stable. New capability → new linked type | new interface impl, ⊥ new columns on core type.
4. **Composition over hierarchy.** Capability interfaces (`Locatable`, `Auditable`, `Temporal` — already in domain-packs/core/schema/core.odl), multiple `implements`. ⊥ deep chains, ⊥ combination types (`SchedulableBuilding`).

## Decision procedures (apply before writing the type)

Three tests, in order. Adapted from TypeDB Academy §9.2 / §9.3 / §11.3 — their PERA model is not ours (ODL links are binary; theirs are n-ary), but the modelling tests are model-independent and close gaps this guide had.

**1. Identity test — ObjectType or field?**
Ask: *would two instances carrying identical property values still be two different things?* Yes → ObjectType (identity independent of properties). No → field on the owning type.
`Supplier` passes: two suppliers named "Acme" in different countries are different suppliers, and a supplier that renames is the same supplier. `address` fails: two identical addresses are the same address → `@struct`, not a type.
Corollary: an identifier field (`nhsNumber`, `orderNumber`) is evidence of identity, not a substitute for it — a type whose identity is *only* its identifier is usually an observation about something else (see "Entity ≠ observation" below).

**2. Single functional dependency per parent — where does the link attach?**
When A determines B and B determines C, chain them; do not also hang C off A.
⊥ `Shipment → City`, `Shipment → State`, `Shipment → Country` (three links, two of them derivable).
✓ `Shipment → City`, `City → State`, `State → Country`.
Duplicate paths are how the same fact ends up stored twice and then disagrees. Reach the far end by traversal (multi-hop is a first-class read: `TraversalStep.maxDepth`), not by a redundant link.
Exception, stated as a tradeoff not silently: denormalise a hot path only with a `# ponytail:` comment naming the read it serves and the write that must maintain it.

**3. Reify or not — ObjectType-plus-links, or one link with fields?**
ODL links carry fields, so a plain association needs no extra type: `InventoryAt(InventoryRecord → Facility)` with `quantity` on the link is complete.
Promote the relationship to its own ObjectType when either holds:
- **Data fidelity** — the relationship owns attributes that belong to *neither* endpoint. `discount` on a promotion↔product pairing belongs to the pairing (a product is in many promotions at different discounts); moving it to either side loses data.
- **Type fidelity** — the relationship has its own subtypes or lifecycle. Contribution splitting into authoring | editing | illustrating, or anything with its own status, timestamps and audit trail, is a thing, not an edge.
Both hold for any relationship joining ≥3 parties: ODL links are binary, so an n-ary relationship *is* an ObjectType plus one link per role — `Shipment` + `ShipmentForOrder`/`ShipsFrom`/`ShipsTo` is the canonical shape, and the role lives in the link name. Name those links for the role they play, never for the FK column (see "Join-table cosplay").
⊥ reifying a plain binary association "for symmetry" — that is a join table with extra steps.

## Rules → ODL syntax

| Rule | ODL lever |
|---|---|
| ∀ ObjectType = 1 distinct entity | split types; 1 CSV row w/ multiple entities → multiple types + links |
| ∀ property has business value | curate; no 1:1 column dump |
| Names for humans | `lastInspectionDate`, ⊥ `dtLastInspMod`; API names self-documenting |
| Entity ≠ observation | measurement/event about entity → separate ObjectType + link |
| Non-semantic/technical type | `@display(hidden: true)` |
| Shared shape, distinct types | `interface` + `implements A, B` |
| Composite value (address, money) | `@struct` — scalar/enum/nested struct only, ⊥ ObjectType refs |
| Aggregate over links | `@reducer` (structural declaration), ⊥ copy-pasted function logic |
| Retiring field/type | `@deprecated` first, remove later; DDL additive only |
| PII/sensitive | `@sensitive` on every personal field + per-relation `field-permissions.yaml`. Universal exposure (`alwaysVisible` or `viewer`) fails boot unless the entry explicitly declares `allowSensitive: true` |
| Search | `@searchable(weight)` on human-queried text fields |
| Document decisions | description strings in ODL — parser preserves them |

## Anti-patterns (reject in review)

- **Kitchen Sink**: type mirrors source table, 40 uncurated columns.
- **God Object**: core type accumulating every team's fields → extension types instead.
- **Golden Hammer**: actions for automated transforms (pipelines' job) | pipelines for human decisions (actions' job). Action = human/agent decision. Pipeline = automated transform.
- **Copy-paste types**: `SalesCustomer`/`SupportCustomer`/`BillingCustomer` → one `Customer` | `CustomerBase` interface.
- **Join-table cosplay**: link types carrying no semantics, named after FK columns.

## Client-sector seeds

| Sector | Core types (sketch) | Capability interfaces |
|---|---|---|
| Ekspedisi/logistik | Shipment, Vessel, Port, Route, Delay | Locatable, Schedulable, Temporal |
| AML/crypto | Customer, Account, Transaction, Wallet, Alert, Case (exists: domain-packs/aml) | Auditable |
| Medical | Patient, Encounter, DischargeRecord (exists: domain-packs/nhs-acute) | Identifiable, Temporal |
| ICS/OT | Machine, Sensor, WorkOrder, ProductionLine | Locatable, Monitorable |
| C2 | Unit, Asset, Track, Mission | Locatable, Temporal |

Rule-of-three watch: `Locatable` + `Temporal` recur across ≥3 sectors → keep in core pack, ⊥ per-pack copies.

## Pragmatism

Guides, not laws. Deadline → build reasonable now + named tradeoff (`# ponytail:`-style comment: what's traded, when to revisit). Defend always: naming quality, semantic clarity, security design — those don't retrofit.

## Not yet in ODL (don't design around them)

Value types (constrained reusable scalars), mandatory control properties, edit-only properties, type groups. Model with plain types + validation in actions until they exist.
