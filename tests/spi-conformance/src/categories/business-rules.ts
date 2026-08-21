/**
 * BusinessRulesService conformance — the same assertions against every provider.
 *
 * A rule only governs anything once it has been proposed, approved and
 * activated, so `state` is the load-bearing field and the transitions between
 * states are the contract. If one provider let a draft be activated and the
 * other refused, then which deployment you happen to be running decides
 * whether an unreviewed rule is live.
 *
 * Execution is asserted here too, even though both providers call the same
 * engine from @altius/spi: sharing the code is half the guarantee, and this is
 * the half that checks they are wired to it the same way and that a rule
 * survives the round trip through storage with its DAG intact.
 */

import { describe, it, expect } from 'vitest';
import type { BusinessRulesService, CreateRuleInput, RequestContext } from '@altius/spi';

export type BusinessRulesServiceFactory = () => BusinessRulesService | Promise<BusinessRulesService>;

/**
 * source → filter: the smallest rule that actually does something.
 *
 * The filter's `inputs` is empty at creation because node ids are minted by
 * the service, so nothing can reference them yet. Wiring the edge is a second
 * call — see `wireFilterToSource`, which is also what makes positional id
 * preservation on update load-bearing rather than cosmetic.
 */
function ruleInput(name: string, value: unknown = 'urgent'): CreateRuleInput {
  return {
    name,
    description: 'flag high-priority patients',
    nodes: [
      { name: 'patients', type: 'source', source: { targetType: 'Patient' }, inputs: [] },
      { name: 'urgent', type: 'filter', inputs: [], filter: [{ field: 'triage', operator: 'eq', value }] },
    ],
    isTimeSeriesBoard: false,
  };
}

/** Point the filter node at the source node, now that the source has an id. */
async function wireFilterToSource(
  svc: BusinessRulesService, ctx: RequestContext, ruleId: string, sourceId: string, value: unknown = 'urgent',
): Promise<void> {
  await svc.update(ctx, ruleId, {
    nodes: [
      { name: 'patients', type: 'source', source: { targetType: 'Patient' }, inputs: [] },
      { name: 'urgent', type: 'filter', inputs: [sourceId], filter: [{ field: 'triage', operator: 'eq', value }] },
    ],
  });
}

export function registerBusinessRulesTests(providerName: string, factory: BusinessRulesServiceFactory): void {
  describe(`[${providerName}] SPI Conformance: BusinessRulesService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_rule_${label}_${counter++}`, actorId: 'u1' });

    describe('create and read', () => {
      it('creates in draft, mints node ids, and reads back the DAG', async () => {
        const svc = await factory();
        const ctx = ctxFor('create');
        const rule = await svc.create(ctx, ruleInput('High priority'));
        expect(rule.state).toBe('draft');
        expect(rule.createdBy).toBe('u1');
        expect(rule.nodes).toHaveLength(2);
        // Node ids are minted by the service — the DAG's edges reference them,
        // so they must be present and distinct.
        expect(rule.nodes[0]!.id).toBeTruthy();
        expect(rule.nodes[0]!.id).not.toBe(rule.nodes[1]!.id);

        const fetched = await svc.get(ctx, rule.id);
        expect(fetched!.name).toBe('High priority');
        expect(fetched!.nodes[1]!.filter?.[0]!.value).toBe('urgent');
      });

      it('returns null for an unknown id', async () => {
        const svc = await factory();
        expect(await svc.get(ctxFor('missing'), 'no-such-rule')).toBeNull();
      });

      it('lists rules and filters by state', async () => {
        const svc = await factory();
        const ctx = ctxFor('list');
        const a = await svc.create(ctx, ruleInput('A'));
        await svc.create(ctx, ruleInput('B'));
        await svc.submitForApproval(ctx, a.id);
        expect(await svc.list(ctx)).toHaveLength(2);
        expect(await svc.list(ctx, 'proposed')).toHaveLength(1);
        expect(await svc.list(ctx, 'draft')).toHaveLength(1);
        expect(await svc.list(ctx, 'active')).toHaveLength(0);
      });

      it('keeps rules in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        const rule = await svc.create(a, ruleInput('Mine'));
        expect(await svc.get(b, rule.id)).toBeNull();
        expect(await svc.list(b)).toHaveLength(0);
      });

      it('preserves node ids positionally on update', async () => {
        // An edit that only changes a node's config must not orphan the edges
        // pointing at it.
        const svc = await factory();
        const ctx = ctxFor('update');
        const rule = await svc.create(ctx, ruleInput('Before'));
        const originalIds = rule.nodes.map(n => n.id);
        const updated = await svc.update(ctx, rule.id, {
          name: 'After',
          nodes: [
            { name: 'patients', type: 'source', source: { targetType: 'Patient' }, inputs: [] },
            { name: 'urgent', type: 'filter', inputs: [], filter: [{ field: 'triage', operator: 'eq', value: 'critical' }] },
          ],
        });
        expect(updated.name).toBe('After');
        expect(updated.nodes.map(n => n.id)).toEqual(originalIds);
        expect(updated.nodes[1]!.filter?.[0]!.value).toBe('critical');
      });

      it('deletes a rule', async () => {
        const svc = await factory();
        const ctx = ctxFor('delete');
        const rule = await svc.create(ctx, ruleInput('Doomed'));
        await svc.delete(ctx, rule.id);
        expect(await svc.get(ctx, rule.id)).toBeNull();
      });
    });

    describe('the approval state machine', () => {
      it('runs draft → proposed → approved → active → inactive', async () => {
        const svc = await factory();
        const ctx = ctxFor('happy');
        const rule = await svc.create(ctx, ruleInput('Lifecycle'));
        expect((await svc.submitForApproval(ctx, rule.id)).state).toBe('proposed');

        const approved = await svc.approve(ctx, rule.id, 'reviewer-1', 'sound logic');
        expect(approved.state).toBe('approved');
        expect(approved.reviewedBy).toBe('reviewer-1');
        expect(approved.reviewNotes).toBe('sound logic');
        expect(approved.reviewedAt).toBeDefined();

        expect((await svc.activate(ctx, rule.id)).state).toBe('active');
        expect((await svc.deactivate(ctx, rule.id)).state).toBe('inactive');
      });

      it('records the reviewer on rejection', async () => {
        const svc = await factory();
        const ctx = ctxFor('reject');
        const rule = await svc.create(ctx, ruleInput('Rejected'));
        await svc.submitForApproval(ctx, rule.id);
        const rejected = await svc.reject(ctx, rule.id, 'reviewer-2', 'unsafe filter');
        expect(rejected.state).toBe('rejected');
        expect(rejected.reviewedBy).toBe('reviewer-2');
        expect(rejected.reviewNotes).toBe('unsafe filter');
      });

      // Each of these is a way an unreviewed rule could go live, or a live one
      // could be edited out from under its approval.
      it('refuses to activate a rule that was never approved', async () => {
        const svc = await factory();
        const ctx = ctxFor('activate_draft');
        const rule = await svc.create(ctx, ruleInput('Sneaky'));
        await expect(svc.activate(ctx, rule.id)).rejects.toThrow(/Cannot transition from draft to active/);
      });

      it('refuses to activate a rule that is merely proposed', async () => {
        const svc = await factory();
        const ctx = ctxFor('activate_proposed');
        const rule = await svc.create(ctx, ruleInput('Pending'));
        await svc.submitForApproval(ctx, rule.id);
        await expect(svc.activate(ctx, rule.id)).rejects.toThrow(/Cannot transition from proposed to active/);
      });

      it('refuses to approve a rule that was never submitted', async () => {
        const svc = await factory();
        const ctx = ctxFor('approve_draft');
        const rule = await svc.create(ctx, ruleInput('Unsubmitted'));
        await expect(svc.approve(ctx, rule.id, 'reviewer-1')).rejects.toThrow(/Cannot transition from draft to approved/);
      });

      it('refuses to re-approve an already approved rule', async () => {
        const svc = await factory();
        const ctx = ctxFor('double_approve');
        const rule = await svc.create(ctx, ruleInput('Once'));
        await svc.submitForApproval(ctx, rule.id);
        await svc.approve(ctx, rule.id, 'reviewer-1');
        await expect(svc.approve(ctx, rule.id, 'reviewer-2')).rejects.toThrow(/Cannot transition from approved to approved/);
      });

      it('refuses to deactivate a rule that is not active', async () => {
        const svc = await factory();
        const ctx = ctxFor('deactivate_draft');
        const rule = await svc.create(ctx, ruleInput('Idle'));
        await expect(svc.deactivate(ctx, rule.id)).rejects.toThrow(/Cannot transition from draft to inactive/);
      });

      it('reports a missing rule rather than silently doing nothing', async () => {
        const svc = await factory();
        await expect(svc.submitForApproval(ctxFor('gone'), 'no-such-rule')).rejects.toThrow(/Rule not found/);
      });
    });

    describe('execution and validation survive storage', () => {
      it('executes a stored rule against input data', async () => {
        const svc = await factory();
        const ctx = ctxFor('exec');
        const rule = await svc.create(ctx, ruleInput('Filter urgent'));
        await wireFilterToSource(svc, ctx, rule.id, rule.nodes[0]!.id);
        const data = new Map<string, Record<string, unknown>[]>([
          ['Patient', [
            { id: 1, triage: 'urgent' },
            { id: 2, triage: 'routine' },
            { id: 3, triage: 'urgent' },
          ]],
        ]);
        const result = await svc.execute(ctx, rule.id, data);
        expect(result.success).toBe(true);
        expect(result.rowsOutput).toBe(2);
        expect(result.outputRows.every(r => r['triage'] === 'urgent')).toBe(true);
        expect(result.nodeStats).toHaveLength(2);
      });

      it('validates a well-formed DAG', async () => {
        const svc = await factory();
        const ctx = ctxFor('valid');
        const rule = await svc.create(ctx, ruleInput('Fine'));
        expect(await svc.validate(ctx, rule.id)).toEqual({ valid: true, errors: [] });
      });

      it('reports a missing input edge', async () => {
        const svc = await factory();
        const ctx = ctxFor('dangling');
        const rule = await svc.create(ctx, {
          name: 'Dangling', description: '',
          nodes: [{ name: 'orphan', type: 'filter', inputs: ['does-not-exist'], filter: [] }],
        });
        const result = await svc.validate(ctx, rule.id);
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/references missing input/);
      });

      it('reports validation on a rule that does not exist', async () => {
        const svc = await factory();
        expect(await svc.validate(ctxFor('novalidate'), 'no-such-rule')).toEqual({
          valid: false,
          errors: ['Rule not found'],
        });
      });

      it('refuses to execute a rule that does not exist', async () => {
        const svc = await factory();
        await expect(
          svc.execute(ctxFor('noexec'), 'no-such-rule', new Map()),
        ).rejects.toThrow(/Rule not found/);
      });
    });
  });
}
