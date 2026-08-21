/**
 * `CopilotService` and `EmbeddedCopilotService` are two surfaces over one set of
 * copilots — one configures them, the other suggests and applies through them.
 *
 * They used to be backed by different stores, and the consequence was not just
 * that each was invisible to the other. `getSuggestedActions` is the single
 * place the `canExecuteActions` flag is enforced, and `createCopilot` defaults
 * that flag to **false**. `CopilotService.ensureCopilot` looked the requested id
 * up in its own private store, never found it — copilot ids are generated
 * UUIDs, the requested id comes from the caller — and fell through to creating
 * a fresh copilot with `canExecuteActions: true`.
 *
 * So a copilot deliberately configured not to suggest actions was never
 * consulted, and suggestions came from a fabricated one that could. These tests
 * pin the fix from both directions: the configured copilot is the one that
 * answers, and its restrictions hold.
 *
 * There is no Postgres implementation of either service yet, so this lives here
 * rather than in the cross-provider conformance suite — a "conformance" category
 * with one provider would be a unit test wearing a costume.
 */

import { describe, it, expect } from 'vitest';
import type { RequestContext } from '@altius/spi';
import { InMemoryCopilotService } from '../in-memory-aip-llm.js';
import { InMemoryEmbeddedCopilotService } from '../in-memory-embedded-copilots.js';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

/** Built the way the API builds them: one store, handed to both surfaces. */
function shared() {
  const embedded = new InMemoryEmbeddedCopilotService();
  return { embedded, copilot: new InMemoryCopilotService(embedded) };
}

describe('CopilotService over a shared EmbeddedCopilotService', () => {
  it('answers through the configured copilot rather than a fabricated one', async () => {
    const { embedded, copilot } = shared();
    const configured = await embedded.createCopilot(CTX, {
      name: 'ward assistant',
      appContext: 'general',
      canExecuteActions: true,
    });

    await copilot.suggest(CTX, { copilotId: configured.id, objectType: 'Patient' });

    // No second copilot was invented to serve the request.
    expect(await embedded.listCopilots(CTX)).toHaveLength(1);
  });

  it('honours canExecuteActions: false — the bypass this fix closes', async () => {
    // The whole point. `getSuggestedActions` returns nothing for a copilot that
    // may not execute actions; before the store was shared, that copilot was
    // never the one asked.
    const { embedded, copilot } = shared();
    const restricted = await embedded.createCopilot(CTX, {
      name: 'read only',
      appContext: 'general',
      canExecuteActions: false,
    });

    const suggestion = await copilot.suggest(CTX, {
      copilotId: restricted.id,
      objectType: 'Patient',
      selectedObjectIds: ['p1', 'p2'],
    });
    expect(suggestion.actions).toEqual([]);
  });

  it('still suggests actions for a copilot that is allowed them', async () => {
    // The other side of the same check: the restriction is doing the work, not
    // a blanket refusal.
    const { embedded, copilot } = shared();
    const permitted = await embedded.createCopilot(CTX, {
      name: 'full access',
      appContext: 'general',
      canExecuteActions: true,
    });

    const suggestion = await copilot.suggest(CTX, {
      copilotId: permitted.id,
      objectType: 'Patient',
      selectedObjectIds: ['p1', 'p2'],
    });
    expect(suggestion.actions.length).toBeGreaterThan(0);
  });

  it('serves the configured copilot`s own suggested prompts', async () => {
    const { embedded, copilot } = shared();
    const configured = await embedded.createCopilot(CTX, {
      name: 'ward assistant',
      appContext: 'general',
      suggestedPrompts: ['Which beds are free?', 'Who is on call?'],
    });
    const suggestion = await copilot.suggest(CTX, { copilotId: configured.id });
    expect(suggestion.prompts).toEqual(['Which beds are free?', 'Who is on call?']);
  });

  it('does not leak a new copilot on every call', async () => {
    // The private store made `ensureCopilot` miss every time, so each suggest()
    // created another copilot that nothing would ever look at again.
    const { embedded, copilot } = shared();
    const configured = await embedded.createCopilot(CTX, { name: 'ward assistant', appContext: 'general' });
    for (let i = 0; i < 3; i++) {
      await copilot.suggest(CTX, { copilotId: configured.id, objectType: 'Patient' });
    }
    expect(await embedded.listCopilots(CTX)).toHaveLength(1);
  });

  it('keeps auto-creating a copilot for an unrecognised id', async () => {
    // MATCHED, NOT ENDORSED. An unknown id still yields a copilot that may
    // suggest actions — the opposite of `createCopilot`'s own default of false.
    // Left as it was so this change does exactly one thing; narrowing it is a
    // contract change and is raised separately.
    const { embedded, copilot } = shared();
    const suggestion = await copilot.suggest(CTX, {
      copilotId: 'never-configured',
      objectType: 'Patient',
      selectedObjectIds: ['p1'],
    });
    expect(suggestion.actions.length).toBeGreaterThan(0);
    expect(await embedded.listCopilots(CTX)).toHaveLength(1);
  });

  it('keeps copilots in separate tenants apart', async () => {
    const { embedded, copilot } = shared();
    const mine = await embedded.createCopilot(CTX, { name: 'mine', appContext: 'general' });
    const other: RequestContext = { tenantId: 't2', actorId: 'u2' };
    // Another tenant asking for the same id gets its own auto-created copilot,
    // not this one.
    await copilot.suggest(other, { copilotId: mine.id });
    expect(await embedded.listCopilots(CTX)).toHaveLength(1);
    expect(await embedded.listCopilots(other)).toHaveLength(1);
  });

  it('applies through the shared store too', async () => {
    const { embedded, copilot } = shared();
    const configured = await embedded.createCopilot(CTX, { name: 'ward assistant', appContext: 'general' });
    const result = await copilot.apply(CTX, {
      copilotId: configured.id,
      suggestionId: 's1',
      actionName: 'update',
      params: { ward: 'A' },
    });
    expect(result.applied).toBe(true);
    expect(await embedded.listCopilots(CTX)).toHaveLength(1);
  });
});
