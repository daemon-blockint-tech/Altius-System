# LOOP-LOG — iteration log for loop-engineering agents (see AGENT.md §2 RECORD, §7)

## FORMAT (do not improvise)
Iteration line, one per completed iteration, appended to the BODY below:
`<ISO date> | <agent-id> | <row-id or FIXING-BUILD sha> | <outcome: closed|closed-by-others|partial-progress|abandoned|halted> | <lesson, ≤20 words>`
Iteration count for §7 = your own line count. Body > ~500 lines → archive to LOOP-LOG-ARCHIVE.md in the same commit.

## TEMPLATE ADJUSTMENTS (append-only; dated + agent-attributed; newer supersedes older FOR THAT AGENT ONLY)
- 2026-08-21 | seed | example entry: "VERIFY-0: also grep recent git log for the row's keywords before reading cited files — cheaper than re-reading stale evidence." (replace with real adjustments; never rewrite prior entries)
- 2026-08-21 | loop-0821-e7d1 | SHIP: verify a push landed by SHA compare (git fetch; rev-parse HEAD origin/main) — never by command echo; a piped tail eats the rejection. Before repairing a fresh main break, re-fetch first: the breaking author usually lands their own fix within ~15 min.
- 2026-08-21 | loop-0821-9c4e | SYNC: after every rebase, run `turbo build --filter=<row-pkg>^...` BEFORE claiming — concurrent PR merges landed broken barrels/literals on main in 2 of my first 2 iterations; catching it pre-claim costs seconds, mid-PROVE it costs a context switch.

- 2026-08-21 | loop-0821-a7c3 | SYNC: after every pull, run `pnpm turbo run build --filter=@altius/spi --filter=@altius/storage-postgres` (~5s cached) BEFORE claiming — upstream merge artifacts were the top time sink in 2 consecutive iterations; catching them pre-claim converts a mid-row derail into a clean FIXING-BUILD.

## BODY
2026-08-21 | seed | security-gov/organization-tenant-boundary-isolation | closed-by-others | VERIFY-0 saved a full build: concurrent commits had closed the row
2026-08-21 | loop-0821-a7c3 | FIXING-BUILD 9742ab7c | partial-progress | duplicate re-exports from merge; dedupe second block
2026-08-21 | loop-0821-e7d1 | ai-agent-surface/external-ai-ide-access-via-mcp-external-agen | partial-progress | VERIFY-0 found sub-gap closed; re-scoped claim to sibling sub-gap, kept warm context (ff74c77)
2026-08-21 | loop-0821-9c4e | actions-concurrency/governed-object-link-editing-with-writeback | partial-progress | consent+audit hole on direct writes closed via one shared guard; row stays partial (writeback, link mutation)
2026-08-21 | loop-0821-a7c3 | security-consent/sensitive-data-pii-protection-controls | partial-progress | sub-gap 5 closed (allowSensitive gate); iteration dominated by 2 rounds of merge-artifact build fixes
FIXING-BUILD ec617dc/e809ddc loop-0821-9c4e 2026-08-21T14:46+07:00 (spi index.ts duplicated export tail again; fix in same push)
2026-08-21 | loop-0821-9c4e | FIXING-BUILD ec617dc/e809ddc | closed | spi export-tail dedupe (3rd recurrence) + storage-postgres DDL literal unclosed by event-objects merge
2026-08-21 | loop-0821-9c4e | security-gov/layered-permission-separation-app-module-vs- | partial-progress | object-less default-allow closed via declarative manifest requiredRoles; heuristic deleted; app/module tier still absent
2026-08-21 | loop-0821-a7c3 | security-consent/sensitive-data-pii-protection-controls | partial-progress | audit detail redaction shipped; merge-dup class recurred 3x -> left no-duplicate-exports guard test
2026-08-21 | loop-0821-e7d1 | security-gov/scoped-sessions-session-restricted-marking-s | partial-progress | enforcement at auth funnel (718f900) exposed ungated routes as weaponizable; gated same iteration (27fb73e)
2026-08-21 | loop-0821-9c4e | security-gov/checkpoints-justification-capture-for-sensit | partial-progress | manifest requiresJustification + executor capture-before-act shipped; reserved _justification rides all 3 surfaces; SYNC pre-build adjustment held (no mid-row breakage)
2026-08-21 | loop-0821-a7c3 | security-gov/layered-permission-separation | closed-by-others | claim-protocol saved dup work twice this iteration; row now dependency-blocked on kiosk row
2026-08-21 | loop-0821-9c4e | security-consent/sensitive-data-pii-protection-controls | partial-progress | webhook egress redaction shipped (default-body context was raw); explicit config = re-exposure path; logs/at-rest remain
2026-08-21 | loop-0821-e7d1 | security-gov/ai-agent-write-governance-human-approved-non | partial-progress | holds wired e2e (5463771); VERIFY-0 found 3 of 5 sub-gaps closed concurrently; hardened en route (tenant on holds, one-shot consume)
2026-08-21 | loop-0821-a7c3 | security-gov/checkpoints-justification | closed-by-others | verified 3436974 at HEAD (7/7 tests); regraded full; 2nd verify-only iteration in a row — security section draining fast
2026-08-21 | loop-0821-9c4e | ai-agent-surface/uniform-governance-of-ai-actors-agents-under | closed-by-others | 5463771 closed last clause; verified wiring+tests at HEAD, zero code; row to full/DONE. 5-iter reflection: SYNC adjustment validated forward
2026-08-21 | loop-0821-9c4e | security-gov/scoped-sessions-session-restricted-marking-s | partial-progress | conformance suite caught PG fail-open (empty allowed = all) + provider-dependent active-session pick; local PG at :5432 runs the real integration half
