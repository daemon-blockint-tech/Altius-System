# Altius ↔ Palantir Foundry parity

**Role:** canonical index for parity scope, progress, and evidence

**Renewed:** 21 August 2026

**Recorded baseline:** `fb51933e1073e655ecf4eb922a9d9dddaf7e4e25` (uncommitted work excluded)

This file is the front door to the parity documentation. It does not duplicate capability evidence; evidence stays with the corresponding backlog row.

## Current snapshot

The tracker contains **190 Foundry capability rows**:

| Status | Capability rows | Canonical location |
|---|---:|---|
| `full` | 105 | [`audit/ALTIUS-BACKLOG-DONE.md`](audit/ALTIUS-BACKLOG-DONE.md) |
| `partial` | 82 | [`audit/ALTIUS-BACKLOG.md`](audit/ALTIUS-BACKLOG.md) |
| `absent` | 3 | [`audit/ALTIUS-BACKLOG.md`](audit/ALTIUS-BACKLOG.md) |
| **Total** | **190** | |

The Markdown files contain 191 `**Status:**` blocks because `merged/no-code-rules-engine` is a coordinating work-item row above five pre-existing capability rows. It is not a sixth capability and must be excluded from capability totals.

The open queue is organized as:

- **11 security-defect capability rows** — always first.
- **53 actionable parity items covering 57 active capability rows** — the merged rules-engine item covers five duplicated capability rows.
- **17 parked capability rows** — not claimable until their named trigger fires.
- **105 archived `full` capability rows** — snapshots, subject to regression reopening.

Counts describe the committed documentation baseline only. Fresh `🔒 CLAIMED` rows and uncommitted implementation work do not change a grade until their evidence, proof, and resulting status are recorded.

## Source-of-truth order

1. **Foundry behavior specification:** the matching document under [`foundry/foundry/`](foundry/foundry/), supplemented by the live [Palantir Architecture Center](https://www.palantir.com/docs/foundry/architecture-center/overview/) when renewing architecture scope.
2. **Altius target contract:** [`altius-spec-v2.md`](altius-spec-v2.md), where a platform contract exists. It is a target specification, not evidence that the implementation conforms.
3. **Open progress and gaps:** [`audit/ALTIUS-BACKLOG.md`](audit/ALTIUS-BACKLOG.md).
4. **Completed evidence:** [`audit/ALTIUS-BACKLOG-DONE.md`](audit/ALTIUS-BACKLOG-DONE.md).
5. **Open human decisions:** [`audit/DECISIONS-NEEDED.md`](audit/DECISIONS-NEEDED.md).
6. **Iteration history:** [`audit/LOOP-LOG.md`](audit/LOOP-LOG.md).

A statement in a plan, HTML report, old re-grade, interface declaration, generated schema, or unit test is not stronger than current source plus a runnable oracle.

## Architecture Center coverage

The live Architecture Center currently consists of seven pages, all now mirrored locally under `docs/foundry/foundry/`:

| Live page | Local mirror |
|---|---|
| Overview | `architecture-center-overview.md` |
| AIP, Foundry, and Apollo | `platforms.md` |
| The Ontology system | `ontology-system.md` |
| The Multimodal Data Plane | `multimodal-data-plane.md` |
| Interoperability | `interoperability.md` |
| The Rubix substrate | `rubix.md` |
| AIP architecture | `aip-architecture.md` |

Note: `docs/foundry/foundry/overview.md` is the Ontology Manager overview (`/docs/foundry/ontology-manager/overview`), not the Architecture Center overview. The Architecture Center overview is mirrored as `architecture-center-overview.md` to avoid collision. Coverage is now 7/7.

## Grade contract

A capability is `full` only when all of the following hold:

1. The matching Foundry documentation has been read and converted into explicit acceptance behavior.
2. A competent user can reach the capability through a real UI, SDK, API, or test-as-user without writing platform code.
3. The production provider is durable where the capability stores state.
4. Memory and PostgreSQL semantics agree when the behavior belongs to the SPI.
5. Authentication, authorization, tenant isolation, markings, field security, consent, sensitive-data handling, and audit apply on every relevant surface.
6. A non-trivial oracle was shown failing without the implementation and passing with it.
7. The relevant Turbo build, typecheck, and tests pass.

`tools/parity/reachability.mjs` measures only whether SPI services are implemented, surfaced, and PostgreSQL-backed. Its `full` result is necessary, not sufficient, and its service tally must never be presented as the capability tally above. Run it only on a clean, recorded commit.

## Document lifecycle

### Canonical and maintained

| Document | Purpose |
|---|---|
| [`audit/ALTIUS-BACKLOG.md`](audit/ALTIUS-BACKLOG.md) | Open security defects, active parity work, parked scope, and stale-evidence warnings |
| [`audit/ALTIUS-BACKLOG-DONE.md`](audit/ALTIUS-BACKLOG-DONE.md) | Evidence archive for `full` rows |
| [`audit/DECISIONS-NEEDED.md`](audit/DECISIONS-NEEDED.md) | Digest of unresolved product or contract decisions |
| [`audit/LOOP-LOG.md`](audit/LOOP-LOG.md) | Append-only iteration outcomes and agent-specific process adjustments |
| [`altius-spec-v2.md`](altius-spec-v2.md) | Target engineering contract |
| [`api-spec.md`](api-spec.md) | Generated API artifact workflow |
| [`cdm-mapping-profile.md`](cdm-mapping-profile.md) | NHS CDM projection contract |
| [`data-connection.md`](data-connection.md) | Direct and agent-based ingestion behavior |
| [`external-domain-packs.md`](external-domain-packs.md) | Pack format and loading workflow |
| [`mcp-server.md`](mcp-server.md) | Current MCP protocol and governance surface |
| [`odl-design-guide.md`](odl-design-guide.md) | Current domain-pack modeling rules |

### Historical snapshots, retained for provenance

| Document | Snapshot meaning |
|---|---|
| [`audit/foundry-parity-audit.html`](audit/foundry-parity-audit.html) | 14 August external audit; its counts and gaps are superseded |
| [`audit/closed-loop-position.html`](audit/closed-loop-position.html) | 14 August architecture position; several “absent” claims are superseded |
| [`audit/PARITY-REGRADE-19AUG.md`](audit/PARITY-REGRADE-19AUG.md) | Reproducible service-reachability measurement at its named commit |
| [`audit/PARITY-REGRADE-20AUG.md`](audit/PARITY-REGRADE-20AUG.md) | Working re-grade history at its named commits |
| [`mvp-nhs-pilot.md`](mvp-nhs-pilot.md) | February MVP design baseline, not current implementation status |
| [`fdp-plan.md`](fdp-plan.md) | NHS FDP delivery and assurance plan, not the platform parity tracker |

Historical files must not be silently rewritten to look current. Correct their lasting findings in the canonical backlog, label them as snapshots, and preserve their original evidence for audit provenance.

## Renewal procedure

When renewing parity:

1. Work from a clean commit and record its full SHA.
2. Refresh the Foundry source inventory, including live Architecture Center pages missing from the mirror.
3. Run `node tools/parity/reachability.mjs` as a lower-bound substrate check.
4. Re-verify each affected capability end to end from user surface to production provider.
5. Move closed rows to DONE; reopen regressions in the active backlog.
6. Recompute status counts from capability rows, excluding coordinating rows.
7. Update this snapshot and the two backlog headers in the same change.
8. Keep dated HTML audits and re-grade reports historical rather than using them as current dashboards.
