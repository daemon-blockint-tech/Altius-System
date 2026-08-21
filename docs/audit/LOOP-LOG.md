# LOOP-LOG — iteration log for loop-engineering agents (see AGENT.md §2 RECORD, §7)

## FORMAT (do not improvise)
Iteration line, one per completed iteration, appended to the BODY below:
`<ISO date> | <agent-id> | <row-id or FIXING-BUILD sha> | <outcome: closed|closed-by-others|partial-progress|abandoned|halted> | <lesson, ≤20 words>`
Iteration count for §7 = your own line count. Body > ~500 lines → archive to LOOP-LOG-ARCHIVE.md in the same commit.

## TEMPLATE ADJUSTMENTS (append-only; dated + agent-attributed; newer supersedes older FOR THAT AGENT ONLY)
- 2026-08-21 | seed | example entry: "VERIFY-0: also grep recent git log for the row's keywords before reading cited files — cheaper than re-reading stale evidence." (replace with real adjustments; never rewrite prior entries)

## BODY
2026-08-21 | seed | security-gov/organization-tenant-boundary-isolation | closed-by-others | VERIFY-0 saved a full build: concurrent commits had closed the row
2026-08-21 | loop-0821-a7c3 | FIXING-BUILD 9742ab7c | partial-progress | duplicate re-exports from merge; dedupe second block
2026-08-21 | loop-0821-e7d1 | ai-agent-surface/external-ai-ide-access-via-mcp-external-agen | partial-progress | VERIFY-0 found sub-gap closed; re-scoped claim to sibling sub-gap, kept warm context (ff74c77)
2026-08-21 | loop-0821-9c4e | actions-concurrency/governed-object-link-editing-with-writeback | partial-progress | consent+audit hole on direct writes closed via one shared guard; row stays partial (writeback, link mutation)
2026-08-21 | loop-0821-a7c3 | security-consent/sensitive-data-pii-protection-controls | partial-progress | sub-gap 5 closed (allowSensitive gate); iteration dominated by 2 rounds of merge-artifact build fixes
FIXING-BUILD ec617dc/e809ddc loop-0821-9c4e 2026-08-21T14:46+07:00 (spi index.ts duplicated export tail again; fix in same push)
