import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageProvider } from '@altius/spi';
import type { ProviderFactory } from '../suite.js';
import { tenantA, baseSchema } from '../fixtures.js';

export function registerLineageTests(name: string, factory: ProviderFactory): void {
  describe(`[${name}] SPI Conformance: Lineage`, () => {
    let provider: StorageProvider;

    beforeEach(async () => {
      provider = await factory();
      await provider.applySchema(tenantA, baseSchema);
    });

    // ─── Provenance via Version History ───

    describe('provenance via version history', () => {
      it('object creation captures initial state as version 1', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Initial', age: 30 });
        const v1 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 1);
        expect(v1).not.toBeNull();
        expect(v1!.name).toBe('Initial');
        expect(v1!.age).toBe(30);
        expect(v1!._version).toBe(1);
      });

      it('each update creates new version preserving field changes', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Evolving', age: 20 });
        await provider.updateObject(tenantA, 'Patient', obj._id, { age: 25 });
        await provider.updateObject(tenantA, 'Patient', obj._id, { age: 30, status: 'active' });

        const v1 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 1);
        const v2 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 2);
        const v3 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 3);

        expect(v1!.age).toBe(20);
        expect(v2!.age).toBe(25);
        expect(v3!.age).toBe(30);
        expect(v3!.status).toBe('active');
      });

      it('version history tracks changes via _updatedAt', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Track' });
        await new Promise(r => setTimeout(r, 10));
        await provider.updateObject(tenantA, 'Patient', obj._id, { age: 40 });

        const v1 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 1);
        const v2 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 2);
        expect(v1!._updatedAt).toBeDefined();
        expect(v2!._updatedAt).toBeDefined();
        expect(v2!._updatedAt >= v1!._updatedAt).toBe(true);
      });

      it('version history is complete (no gaps)', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Complete' });
        await provider.updateObject(tenantA, 'Patient', obj._id, { age: 1 });
        await provider.updateObject(tenantA, 'Patient', obj._id, { age: 2 });
        await provider.updateObject(tenantA, 'Patient', obj._id, { age: 3 });

        for (let v = 1; v <= 4; v++) {
          const snapshot = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, v);
          expect(snapshot).not.toBeNull();
          expect(snapshot!._version).toBe(v);
        }
      });

      it('version history preserves full object state', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Full', age: 10, status: 'new' });
        await provider.updateObject(tenantA, 'Patient', obj._id, { age: 20 });
        await provider.updateObject(tenantA, 'Patient', obj._id, { status: 'active' });

        const v1 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 1);
        expect(v1!.name).toBe('Full');
        expect(v1!.age).toBe(10);
        expect(v1!.status).toBe('new');

        const v2 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 2);
        expect(v2!.name).toBe('Full');
        expect(v2!.age).toBe(20);
        expect(v2!.status).toBe('new');

        const v3 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 3);
        expect(v3!.name).toBe('Full');
        expect(v3!.age).toBe(20);
        expect(v3!.status).toBe('active');
      });
    });

    // ─── Lineage via Graph Traversal ───

    describe('lineage via graph traversal', () => {
      it('single-step outbound traversal shows direct relationships', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'Source' });
        const c1 = await provider.createObject(tenantA, 'CareTeam', { name: 'Target1' });
        const c2 = await provider.createObject(tenantA, 'CareTeam', { name: 'Target2' });
        await provider.createLink(tenantA, 'AssignedTo', p._id, c1._id);
        await provider.createLink(tenantA, 'AssignedTo', p._id, c2._id);

        const result = await provider.traverse(tenantA, p._id, {
          steps: [{ linkType: 'AssignedTo', direction: 'outbound' }],
        });
        expect(result.nodes).toHaveLength(2);
        expect(result.edges).toHaveLength(2);
      });

      it('single-step inbound traversal shows reverse relationships', async () => {
        const p1 = await provider.createObject(tenantA, 'Patient', { name: 'P1' });
        const p2 = await provider.createObject(tenantA, 'Patient', { name: 'P2' });
        const c = await provider.createObject(tenantA, 'CareTeam', { name: 'Team' });
        await provider.createLink(tenantA, 'AssignedTo', p1._id, c._id);
        await provider.createLink(tenantA, 'AssignedTo', p2._id, c._id);

        const result = await provider.traverse(tenantA, c._id, {
          steps: [{ linkType: 'AssignedTo', direction: 'inbound' }],
        });
        expect(result.nodes).toHaveLength(2);
      });

      // ─── Variable-depth traversal (TraversalStep.maxDepth) ───
      //
      // These replace 'rejects a step that sets maxDepth, on either provider',
      // which pinned the unimplemented state and asked to be updated
      // deliberately when the feature landed. Its guarantee — that neither
      // provider silently answers a 2-hop request with 1 hop — is now carried
      // by the positive cases below, on both providers.

      /**
       * Build a chain a→b→c→d where each ReportsTo points at its manager, and
       * return the ids in order. Traversing `inbound` from a walks DOWN the
       * tree, which is the "everyone under this manager" query.
       */
      async function chain(prefix: string): Promise<string[]> {
        const a = await provider.createObject(tenantA, 'CareTeam', { name: `${prefix}-a` });
        const b = await provider.createObject(tenantA, 'CareTeam', { name: `${prefix}-b` });
        const c = await provider.createObject(tenantA, 'CareTeam', { name: `${prefix}-c` });
        const d = await provider.createObject(tenantA, 'CareTeam', { name: `${prefix}-d` });
        await provider.createLink(tenantA, 'ReportsTo', b._id, a._id);
        await provider.createLink(tenantA, 'ReportsTo', c._id, b._id);
        await provider.createLink(tenantA, 'ReportsTo', d._id, c._id);
        return [a._id, b._id, c._id, d._id];
      }

      it('maxDepth: 1 is identical to omitting it', async () => {
        // The invariant that lets this feature exist without changing any
        // answer that was already correct.
        const [a] = await chain('one');
        const step = { linkType: 'ReportsTo', direction: 'inbound' as const };

        const without = await provider.traverse(tenantA, a!, { steps: [step] });
        const with1 = await provider.traverse(tenantA, a!, { steps: [{ ...step, maxDepth: 1 }] });

        expect(with1.nodes.map((n) => n.name).sort()).toEqual(
          without.nodes.map((n) => n.name).sort(),
        );
        expect(with1.totalCount).toBe(without.totalCount);
      });

      it('returns every node reachable within N hops, not only those at exactly N', async () => {
        // "Up to N" is what makes it useful: everyone under this manager, not
        // everyone exactly three levels down.
        const [a] = await chain('upto');

        const result = await provider.traverse(tenantA, a!, {
          steps: [{ linkType: 'ReportsTo', direction: 'inbound', maxDepth: 3 }],
        });

        expect(result.nodes.map((n) => n.name).sort()).toEqual([
          'upto-b',
          'upto-c',
          'upto-d',
        ]);
      });

      it('stops at the depth asked for', async () => {
        const [a] = await chain('stop');

        const result = await provider.traverse(tenantA, a!, {
          steps: [{ linkType: 'ReportsTo', direction: 'inbound', maxDepth: 2 }],
        });

        // d is three hops down and must not appear.
        expect(result.nodes.map((n) => n.name).sort()).toEqual(['stop-b', 'stop-c']);
      });

      it('terminates on a cycle instead of running to the node cap', async () => {
        // A self-referential link is exactly what maxDepth is for, and such a
        // graph can cycle. Without a per-step visited set the frontier never
        // empties: the traversal would stop only on MAX_TRAVERSAL_NODES, which
        // reads as a silent truncation rather than a complete answer.
        const x = await provider.createObject(tenantA, 'CareTeam', { name: 'cyc-x' });
        const y = await provider.createObject(tenantA, 'CareTeam', { name: 'cyc-y' });
        await provider.createLink(tenantA, 'ReportsTo', x._id, y._id);
        await provider.createLink(tenantA, 'ReportsTo', y._id, x._id);

        const result = await provider.traverse(tenantA, x._id, {
          steps: [{ linkType: 'ReportsTo', direction: 'outbound', maxDepth: 9 }],
        });

        expect(result.nodes.map((n) => n.name).sort()).toEqual(['cyc-x', 'cyc-y']);
      });

      it('does not report a node twice when two paths reach it', async () => {
        // Diamond: a→b, a→c, b→d, c→d. Two distinct paths reach d at the same
        // depth, which a tree cannot express — ReportsTo is MANY_TO_ONE and
        // correctly refuses a second manager, so this uses the many-to-many
        // self link.
        const a = await provider.createObject(tenantA, 'CareTeam', { name: 'dia-a' });
        const b = await provider.createObject(tenantA, 'CareTeam', { name: 'dia-b' });
        const c = await provider.createObject(tenantA, 'CareTeam', { name: 'dia-c' });
        const d = await provider.createObject(tenantA, 'CareTeam', { name: 'dia-d' });
        await provider.createLink(tenantA, 'CollaboratesWith', a._id, b._id);
        await provider.createLink(tenantA, 'CollaboratesWith', a._id, c._id);
        await provider.createLink(tenantA, 'CollaboratesWith', b._id, d._id);
        await provider.createLink(tenantA, 'CollaboratesWith', c._id, d._id);

        const result = await provider.traverse(tenantA, a._id, {
          steps: [{ linkType: 'CollaboratesWith', direction: 'outbound', maxDepth: 3 }],
        });

        const names = result.nodes.map((n) => n.name).sort();
        expect(names).toEqual(['dia-b', 'dia-c', 'dia-d']);
        expect(result.totalCount).toBe(3);
      });

      it('feeds every depth into the following step, not just the deepest', async () => {
        // The step's node set and the frontier it hands on must be the same
        // set, or a following step silently sees fewer objects than the caller
        // was told the step matched.
        const [a, , c] = await chain('feed');
        const med = await provider.createObject(tenantA, 'Medication', { name: 'feed-med' });
        // Prescribed by the MIDDLE of the chain, reachable only if depth 2 is
        // carried forward as well as depth 3.
        await provider.createLink(tenantA, 'Prescribes', c!, med._id);

        const result = await provider.traverse(tenantA, a!, {
          steps: [
            { linkType: 'ReportsTo', direction: 'inbound', maxDepth: 3 },
            { linkType: 'Prescribes', direction: 'outbound' },
          ],
        });

        expect(result.nodes.map((n) => n.name)).toEqual(['feed-med']);
      });

      it('counts the depth budget in hops, so a large maxDepth cannot slip past it', async () => {
        const [a] = await chain('budget');
        // The cap is 10 hops. One step asking for 11 exceeds it just as
        // eleven single-hop steps would; counting steps would let this pass.
        await expect(
          provider.traverse(tenantA, a!, {
            steps: [{ linkType: 'ReportsTo', direction: 'inbound', maxDepth: 11 }],
          }),
        ).rejects.toThrow(/exceeds maximum/);
      });

      it('rejects a maxDepth below 1 rather than returning nothing', async () => {
        // An empty result would be indistinguishable from "no such
        // relationships exist", which hides the caller's bug.
        const [a] = await chain('zero');
        await expect(
          provider.traverse(tenantA, a!, {
            steps: [{ linkType: 'ReportsTo', direction: 'inbound', maxDepth: 0 }],
          }),
        ).rejects.toThrow(/maxDepth/);
      });

      it('multi-step traversal shows transitive lineage', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'Start' });
        const c = await provider.createObject(tenantA, 'CareTeam', { name: 'Middle' });
        const m = await provider.createObject(tenantA, 'Medication', { name: 'End' });
        await provider.createLink(tenantA, 'AssignedTo', p._id, c._id);
        await provider.createLink(tenantA, 'Prescribes', c._id, m._id);

        const result = await provider.traverse(tenantA, p._id, {
          steps: [
            { linkType: 'AssignedTo', direction: 'outbound' },
            { linkType: 'Prescribes', direction: 'outbound' },
          ],
        });
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0]!.name).toBe('End');
      });

      it('traversal with filters narrows results', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'FilterStart' });
        const c1 = await provider.createObject(tenantA, 'CareTeam', { name: 'Alpha' });
        const c2 = await provider.createObject(tenantA, 'CareTeam', { name: 'Beta' });
        await provider.createLink(tenantA, 'AssignedTo', p._id, c1._id);
        await provider.createLink(tenantA, 'AssignedTo', p._id, c2._id);

        const result = await provider.traverse(tenantA, p._id, {
          steps: [{
            linkType: 'AssignedTo',
            direction: 'outbound',
            filter: { field: 'name', operator: 'eq', value: 'Alpha' },
          }],
        });
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0]!.name).toBe('Alpha');
      });

      it('traversal pagination works correctly', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'PagStart' });
        const teams = [];
        for (let i = 0; i < 5; i++) {
          const c = await provider.createObject(tenantA, 'CareTeam', { name: `Team${i}` });
          await provider.createLink(tenantA, 'AssignedTo', p._id, c._id);
          teams.push(c);
        }

        const result = await provider.traverse(tenantA, p._id, {
          steps: [{ linkType: 'AssignedTo', direction: 'outbound' }],
        }, { limit: 3 });
        expect(result.nodes).toHaveLength(3);
        expect(result.totalCount).toBe(5);
      });

      it('traversal returns both nodes and edges', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'NodeEdge' });
        const c = await provider.createObject(tenantA, 'CareTeam', { name: 'Team' });
        await provider.createLink(tenantA, 'AssignedTo', p._id, c._id);

        const result = await provider.traverse(tenantA, p._id, {
          steps: [{ linkType: 'AssignedTo', direction: 'outbound' }],
        });
        expect(result.nodes).toHaveLength(1);
        expect(result.edges).toHaveLength(1);
        expect(result.edges[0]!._fromId).toBe(p._id);
        expect(result.edges[0]!._toId).toBe(c._id);
      });
    });

    // ─── Lineage Query Patterns ───

    describe('lineage query patterns', () => {
      it('find all CareTeams for a Patient', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'QueryP' });
        const c1 = await provider.createObject(tenantA, 'CareTeam', { name: 'QTeam1' });
        const c2 = await provider.createObject(tenantA, 'CareTeam', { name: 'QTeam2' });
        await provider.createLink(tenantA, 'AssignedTo', p._id, c1._id);
        await provider.createLink(tenantA, 'AssignedTo', p._id, c2._id);

        const result = await provider.traverse(tenantA, p._id, {
          steps: [{ linkType: 'AssignedTo', direction: 'outbound' }],
        });
        expect(result.nodes).toHaveLength(2);
      });

      it('find all Patients for a CareTeam', async () => {
        const p1 = await provider.createObject(tenantA, 'Patient', { name: 'QP1' });
        const p2 = await provider.createObject(tenantA, 'Patient', { name: 'QP2' });
        const c = await provider.createObject(tenantA, 'CareTeam', { name: 'SharedTeam' });
        await provider.createLink(tenantA, 'AssignedTo', p1._id, c._id);
        await provider.createLink(tenantA, 'AssignedTo', p2._id, c._id);

        const result = await provider.traverse(tenantA, c._id, {
          steps: [{ linkType: 'AssignedTo', direction: 'inbound' }],
        });
        expect(result.nodes).toHaveLength(2);
      });

      it('find medications prescribed by a team', async () => {
        const c = await provider.createObject(tenantA, 'CareTeam', { name: 'Prescribers' });
        const m1 = await provider.createObject(tenantA, 'Medication', { name: 'Med1' });
        const m2 = await provider.createObject(tenantA, 'Medication', { name: 'Med2' });
        await provider.createLink(tenantA, 'Prescribes', c._id, m1._id);
        await provider.createLink(tenantA, 'Prescribes', c._id, m2._id);

        const result = await provider.traverse(tenantA, c._id, {
          steps: [{ linkType: 'Prescribes', direction: 'outbound' }],
        });
        expect(result.nodes).toHaveLength(2);
      });

      it('full care chain: Patient -> CareTeam -> Medication', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'Chain' });
        const c = await provider.createObject(tenantA, 'CareTeam', { name: 'ChainTeam' });
        const m = await provider.createObject(tenantA, 'Medication', { name: 'ChainMed' });
        await provider.createLink(tenantA, 'AssignedTo', p._id, c._id);
        await provider.createLink(tenantA, 'Prescribes', c._id, m._id);

        const result = await provider.traverse(tenantA, p._id, {
          steps: [
            { linkType: 'AssignedTo', direction: 'outbound' },
            { linkType: 'Prescribes', direction: 'outbound' },
          ],
        });
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0]!._type).toBe('Medication');
      });

      it('empty traversal returns empty result', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'Lonely' });
        const result = await provider.traverse(tenantA, p._id, {
          steps: [{ linkType: 'AssignedTo', direction: 'outbound' }],
        });
        expect(result.nodes).toHaveLength(0);
        expect(result.edges).toHaveLength(0);
      });
    });

    // ─── Change Tracking ───

    describe('change tracking', () => {
      it('_version tracks modification count', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Counter' });
        expect(obj._version).toBe(1);
        const u1 = await provider.updateObject(tenantA, 'Patient', obj._id, { age: 1 });
        expect(u1._version).toBe(2);
        const u2 = await provider.updateObject(tenantA, 'Patient', obj._id, { age: 2 });
        expect(u2._version).toBe(3);
      });

      it('_createdAt is immutable across updates', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Immutable' });
        const createdAt = obj._createdAt;
        await new Promise(r => setTimeout(r, 10));
        const updated = await provider.updateObject(tenantA, 'Patient', obj._id, { age: 99 });
        expect(updated._createdAt).toBe(createdAt);
      });

      it('_updatedAt changes on every update', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Mutable' });
        await new Promise(r => setTimeout(r, 10));
        const u1 = await provider.updateObject(tenantA, 'Patient', obj._id, { age: 1 });
        expect(u1._updatedAt >= obj._updatedAt).toBe(true);
      });

      it('soft-delete records _deletedAt as deletion provenance', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Deleted' });
        await provider.deleteObject(tenantA, 'Patient', obj._id, 'soft');
        const page = await provider.queryObjects(tenantA, 'Patient',
          { field: '_id', operator: 'eq', value: obj._id },
          { includeDeleted: true },
        );
        expect(page.items[0]!._deletedAt).toBeDefined();
      });

      it('object state before and after update independently retrievable', async () => {
        const obj = await provider.createObject(tenantA, 'Patient', { name: 'Before', age: 10 });
        await provider.updateObject(tenantA, 'Patient', obj._id, { name: 'After', age: 20 });

        const v1 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 1);
        const v2 = await provider.getObjectAtVersion(tenantA, 'Patient', obj._id, 2);
        expect(v1!.name).toBe('Before');
        expect(v1!.age).toBe(10);
        expect(v2!.name).toBe('After');
        expect(v2!.age).toBe(20);
      });
    });
  });
}
