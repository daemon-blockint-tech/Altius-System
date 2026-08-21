# ODL design guide — domain packs

Adapted from Foundry ontology design docs (best-practices, anti-patterns, structural-guidance — mirrored in docs/foundry/). Rules verified against ODL parser capabilities 21 Aug 2026. Audience: anyone (human | agent) writing a client domain pack.

## Principles (priority order; higher wins on conflict)

1. **Model reality, not systems.** ObjectType = real-world entity (`Shipment`, `Vessel`, `Patient`, `Wallet`), ⊥ source table / API response. Link = real relationship, ⊥ join-key artifact.
2. **DRY, rule of three.** Same shape 3× → refactor to one canonical type | shared interface. 1× coincidence, 2× pattern, 3× refactor.
3. **Open for extension, closed for modification.** Production type stable. New capability → new linked type | new interface impl, ⊥ new columns on core type.
4. **Composition over hierarchy.** Capability interfaces (`Locatable`, `Auditable`, `Temporal` — already in domain-packs/core/schema/core.odl), multiple `implements`. ⊥ deep chains, ⊥ combination types (`SchedulableBuilding`).

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
| PII/sensitive | `@sensitive` ! on every personal field + per-relation field-permissions.yaml. viewer grant of @sensitive field = boot warning — treat as error |
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
