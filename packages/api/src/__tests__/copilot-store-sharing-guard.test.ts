/**
 * Guard against the copilot surfaces drifting onto separate stores.
 *
 * `/api/v1/copilots` (EmbeddedCopilotService) configures copilots;
 * `CopilotService` is the view-facing suggest/apply half. They are two surfaces
 * over one set of copilots, and they used to be backed by different stores.
 *
 * That was not merely a visibility split. `getSuggestedActions` is the one place
 * the `canExecuteActions` flag is enforced, and `createCopilot` defaults it to
 * false — so a copilot configured not to suggest actions was never the one
 * consulted, and suggestions came from a copilot the suggest path fabricated
 * with the flag set true.
 *
 * A source-text test is the right altitude, for the same reason the #14 wiring
 * guard is one: the `nonDurableServices` literal is not exported, the defect is
 * invisible at runtime because both surfaces work perfectly in isolation, and it
 * only shows up as a restriction that quietly does not apply.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const serverPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'server.ts');
const source = readFileSync(serverPath, 'utf8');

function lineFor(key: string): string {
  const line = source.split('\n').find(l => new RegExp(`^\\s*${key}:`).test(l));
  if (!line) throw new Error(`${key} is not wired in server.ts`);
  return line;
}

describe('copilot store sharing', () => {
  it('hands both copilot surfaces the same store', () => {
    const embeddedLine = lineFor('embeddedCopilotService');
    const copilotLine = lineFor('copilotService');

    // Whatever identifier the configuring surface names, the suggest/apply
    // surface has to be constructed from it. Deriving the name rather than
    // hardcoding it keeps this working through a rename.
    const shared = embeddedLine.match(/embeddedCopilotService:\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,/)?.[1];
    expect(
      shared,
      'embeddedCopilotService should name a store built once above the literal, so the\n' +
        'suggest/apply surface can be handed the same instance. Inlining a `new …Service()`\n' +
        'here makes that impossible.',
    ).toBeTruthy();

    expect(
      copilotLine.includes(`(${shared})`),
      'copilotService must be constructed from the same store instance as\n' +
        `embeddedCopilotService (\`${shared}\`). Letting it build its own means a copilot\n` +
        'configured with canExecuteActions: false is never the one consulted, and action\n' +
        'suggestions are served from a fabricated copilot with the flag set true.\n' +
        `Offending wiring: ${copilotLine.trim()}`,
    ).toBe(true);
  });

  it('builds that store exactly once', () => {
    // Two constructions would reintroduce the split without tripping the check
    // above, since the deps literal would still read from one of them.
    const constructions = source.match(/new InMemoryEmbeddedCopilotService\(/g) ?? [];
    expect(constructions).toHaveLength(1);
  });
});
