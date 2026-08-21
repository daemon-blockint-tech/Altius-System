/**
 * VariableTransformService conformance — the same assertions against every provider.
 *
 * A pipeline is a named, ordered list of declarative steps reduced over an
 * input value. Two things are being pinned:
 *
 *   1. that both providers keep the same pipelines, keyed the same way, and
 *   2. that both providers **compute the same value** from the same steps.
 *
 * The second is why step execution is shared code in @altius/spi. A pipeline is
 * run to produce a value something downstream then uses, so two providers
 * disagreeing about what `round` or `dateDiff` means would produce different
 * data from the same input, with neither erring. Several cases below therefore
 * pin arithmetic and coercion rather than storage — including the lenient
 * behaviours, which are matched rather than tightened because tightening them
 * would change what an existing pipeline produces.
 */

import { describe, it, expect } from 'vitest';
import type { TransformStep, VariableTransformService, RequestContext } from '@altius/spi';

export type VariableTransformFactory = () =>
  | VariableTransformService
  | Promise<VariableTransformService>;

const UPPER_TRIM: TransformStep[] = [
  { kind: 'trim', args: {} },
  { kind: 'upper', args: {} },
];

export function registerVariableTransformTests(providerName: string, factory: VariableTransformFactory): void {
  describe(`[${providerName}] SPI Conformance: VariableTransformService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_vtx_${label}_${counter++}`, actorId: 'u1' });

    describe('pipeline definitions', () => {
      it('creates a pipeline with its steps and attribution', async () => {
        const svc = await factory();
        const ctx = ctxFor('create');
        const p = await svc.create(ctx, {
          name: 'normalise_name',
          description: 'trim then upper',
          steps: UPPER_TRIM,
        });
        expect(p.name).toBe('normalise_name');
        expect(p.description).toBe('trim then upper');
        expect(p.steps).toEqual(UPPER_TRIM);
        expect(p.createdBy).toBe('u1');
        expect(p.tenantId).toBe(ctx.tenantId);
        expect(p.createdAt).toBeTruthy();
      });

      it('defaults an omitted description to empty rather than undefined', async () => {
        const svc = await factory();
        const ctx = ctxFor('create_nodesc');
        expect((await svc.create(ctx, { name: 'p', steps: [] })).description).toBe('');
      });

      it('round-trips step arguments of every shape', async () => {
        // Steps are the whole pipeline; an argument that did not survive
        // storage would silently change what the pipeline computes.
        const svc = await factory();
        const ctx = ctxFor('steps');
        const steps: TransformStep[] = [
          { kind: 'substring', args: { start: 1, end: 4 } },
          { kind: 'pad', args: { length: 8, pad: '0', side: 'left' } },
          { kind: 'pickFields', args: { fields: ['a', 'b'] } },
          { kind: 'coalesce', args: { value: null } },
        ];
        await svc.create(ctx, { name: 'shapes', steps });
        expect((await svc.get(ctx, 'shapes'))!.steps).toEqual(steps);
      });

      it('returns null for a pipeline that does not exist', async () => {
        const svc = await factory();
        expect(await svc.get(ctxFor('missing'), 'no-such-pipeline')).toBeNull();
      });

      it('replaces rather than refusing when a name is reused', async () => {
        // The in-memory service overwrites on a repeated name, so refusing here
        // would reject a write the other provider accepts.
        const svc = await factory();
        const ctx = ctxFor('recreate');
        await svc.create(ctx, { name: 'p', description: 'first', steps: UPPER_TRIM });
        const second = await svc.create(ctx, { name: 'p', description: 'second', steps: [] });
        expect(second.description).toBe('second');
        expect(second.steps).toEqual([]);
        expect(await svc.list(ctx)).toHaveLength(1);
      });

      it('lists pipelines in the order they were created', async () => {
        const svc = await factory();
        const ctx = ctxFor('list');
        await svc.create(ctx, { name: 'first', steps: [] });
        await svc.create(ctx, { name: 'second', steps: [] });
        expect((await svc.list(ctx)).map(p => p.name)).toEqual(['first', 'second']);
      });

      it('updates steps and description, leaving the rest alone', async () => {
        const svc = await factory();
        const ctx = ctxFor('update');
        const created = await svc.create(ctx, { name: 'p', description: 'original', steps: UPPER_TRIM });
        const updated = await svc.update(ctx, 'p', { steps: [{ kind: 'lower', args: {} }] });
        expect(updated.steps).toEqual([{ kind: 'lower', args: {} }]);
        expect(updated.description).toBe('original');
        expect(updated.name).toBe('p');
        expect(updated.id).toBe(created.id);
        // And the change is what execute now runs.
        expect(await svc.execute(ctx, 'p', 'MiXeD')).toBe('mixed');
      });

      it('renames the record without moving it, when update changes the name', async () => {
        // PINNED AS-IS, NOT ENDORSED. The in-memory service writes the updated
        // record back under the OLD map key, so a rename desynchronises the
        // record from the name it is reachable by. Both providers do this.
        // Fixing it would change which name an existing caller has to use.
        const svc = await factory();
        const ctx = ctxFor('rename');
        await svc.create(ctx, { name: 'old_name', steps: UPPER_TRIM });
        const renamed = await svc.update(ctx, 'old_name', { name: 'new_name' });
        expect(renamed.name).toBe('new_name');
        // Still only reachable under the old name...
        expect(await svc.get(ctx, 'new_name')).toBeNull();
        const found = await svc.get(ctx, 'old_name');
        expect(found).not.toBeNull();
        // ...while reporting the new one.
        expect(found!.name).toBe('new_name');
      });

      it('reports a missing pipeline on update', async () => {
        const svc = await factory();
        await expect(svc.update(ctxFor('update_gone'), 'no-such-pipeline', { steps: [] }))
          .rejects.toThrow(/not found/i);
      });

      it('deletes a pipeline', async () => {
        const svc = await factory();
        const ctx = ctxFor('delete');
        await svc.create(ctx, { name: 'p', steps: [] });
        await svc.delete(ctx, 'p');
        expect(await svc.get(ctx, 'p')).toBeNull();
        expect(await svc.list(ctx)).toHaveLength(0);
      });

      it('keeps pipelines in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        await svc.create(a, { name: 'p', steps: UPPER_TRIM });
        expect(await svc.get(b, 'p')).toBeNull();
        expect(await svc.list(b)).toHaveLength(0);
      });
    });

    describe('what a pipeline computes', () => {
      // The half that is not about storage. Every case here is a value both
      // providers have to produce identically, because something downstream
      // consumes it.

      it('applies steps in order', async () => {
        // Order is the contract: trim-then-substring and substring-then-trim
        // give different answers for the same input.
        const svc = await factory();
        const ctx = ctxFor('order');
        await svc.create(ctx, { name: 'p', steps: [
          { kind: 'trim', args: {} },
          { kind: 'substring', args: { start: 0, end: 3 } },
        ] });
        expect(await svc.execute(ctx, 'p', '  hello  ')).toBe('hel');

        await svc.create(ctx, { name: 'q', steps: [
          { kind: 'substring', args: { start: 0, end: 3 } },
          { kind: 'trim', args: {} },
        ] });
        // '  hello  ' -> '  h' -> 'h': the same two steps, the other way round,
        // and a different answer.
        expect(await svc.execute(ctx, 'q', '  hello  ')).toBe('h');
      });

      it('computes string steps', async () => {
        const svc = await factory();
        const ctx = ctxFor('strings');
        expect(await svc.executeInline(ctx, [{ kind: 'upper', args: {} }], 'abc')).toBe('ABC');
        expect(await svc.executeInline(ctx, [{ kind: 'replace', args: { from: '-', to: '/' } }], 'a-b-c')).toBe('a/b/c');
        expect(await svc.executeInline(ctx, [{ kind: 'split', args: { delimiter: ',' } }], 'a,b')).toEqual(['a', 'b']);
        expect(await svc.executeInline(ctx, [{ kind: 'pad', args: { length: 5, pad: '0', side: 'left' } }], '42')).toBe('00042');
      });

      it('computes math steps', async () => {
        const svc = await factory();
        const ctx = ctxFor('math');
        expect(await svc.executeInline(ctx, [{ kind: 'add', args: { value: 5 } }], 10)).toBe(15);
        expect(await svc.executeInline(ctx, [{ kind: 'divide', args: { value: 4 } }], 10)).toBe(2.5);
        expect(await svc.executeInline(ctx, [{ kind: 'mod', args: { value: 3 } }], 10)).toBe(1);
        expect(await svc.executeInline(ctx, [{ kind: 'round', args: {} }], 2.5)).toBe(3);
        expect(await svc.executeInline(ctx, [{ kind: 'abs', args: {} }], -7)).toBe(7);
      });

      it('computes object steps', async () => {
        const svc = await factory();
        const ctx = ctxFor('objects');
        const value = { a: 1, b: 2, c: 3 };
        expect(await svc.executeInline(ctx, [{ kind: 'pickFields', args: { fields: ['a', 'c'] } }], value))
          .toEqual({ a: 1, c: 3 });
        expect(await svc.executeInline(ctx, [{ kind: 'omitFields', args: { fields: ['b'] } }], value))
          .toEqual({ a: 1, c: 3 });
        expect(await svc.executeInline(ctx, [{ kind: 'getField', args: { field: 'b' } }], value)).toBe(2);
      });

      it('computes conditional steps', async () => {
        const svc = await factory();
        const ctx = ctxFor('conditional');
        expect(await svc.executeInline(ctx, [{ kind: 'coalesce', args: { value: 'fallback' } }], null)).toBe('fallback');
        expect(await svc.executeInline(ctx, [{ kind: 'coalesce', args: { value: 'fallback' } }], 'set')).toBe('set');
        expect(await svc.executeInline(ctx, [{ kind: 'nullIf', args: { value: 'N/A' } }], 'N/A')).toBeNull();
      });

      it('passes an unrecognised step through unchanged', async () => {
        // PINNED AS-IS, NOT ENDORSED. A typo in a step name is a silent no-op
        // in both providers rather than an error, so a pipeline can quietly do
        // less than it says. Matched because throwing would break pipelines
        // that already exist.
        const svc = await factory();
        const ctx = ctxFor('unknown_step');
        const steps = [{ kind: 'uppercase' as TransformStep['kind'], args: {} }];
        expect(await svc.executeInline(ctx, steps, 'abc')).toBe('abc');
      });

      it('coerces rather than refusing on a type mismatch', async () => {
        // Also pinned as-is, and worse than it first looks. `upper` on null is
        // the string "NULL". And `add` on a non-numeric input does not produce
        // NaN — the cast is a TypeScript fiction, so `+` sees two strings and
        // CONCATENATES: 'abc' + 1 is 'abc1'. A pipeline meant to add can
        // silently build a string instead.
        //
        // Both are the same on both providers, and changing either would change
        // what existing pipelines produce, so both are matched rather than
        // tightened and raised as a contract question instead.
        const svc = await factory();
        const ctx = ctxFor('coercion');
        expect(await svc.executeInline(ctx, [{ kind: 'upper', args: {} }], null)).toBe('NULL');
        expect(await svc.executeInline(ctx, [{ kind: 'add', args: { value: 1 } }], 'abc')).toBe('abc1');
        // Where the input really is non-numeric in a way `+` cannot fudge, NaN
        // is what comes out.
        expect(await svc.executeInline(ctx, [{ kind: 'multiply', args: { value: 2 } }], 'abc')).toBeNaN();
      });

      it('runs an empty pipeline as the identity', async () => {
        const svc = await factory();
        const ctx = ctxFor('empty');
        await svc.create(ctx, { name: 'p', steps: [] });
        expect(await svc.execute(ctx, 'p', { untouched: true })).toEqual({ untouched: true });
      });
    });

    describe('executing', () => {
      it('executes a stored pipeline by name', async () => {
        const svc = await factory();
        const ctx = ctxFor('exec');
        await svc.create(ctx, { name: 'normalise', steps: UPPER_TRIM });
        expect(await svc.execute(ctx, 'normalise', '  ada  ')).toBe('ADA');
      });

      it('reports a missing pipeline on execute', async () => {
        // Loud, unlike most of what these conversions protect: a lost pipeline
        // throws rather than quietly returning the input.
        const svc = await factory();
        await expect(svc.execute(ctxFor('exec_gone'), 'no-such-pipeline', 'x'))
          .rejects.toThrow(/not found/i);
      });

      it('executes a batch, one result per input, in order', async () => {
        const svc = await factory();
        const ctx = ctxFor('batch');
        await svc.create(ctx, { name: 'normalise', steps: UPPER_TRIM });
        expect(await svc.executeBatch(ctx, 'normalise', ['  ada  ', 'bea', ' cai'])).toEqual(['ADA', 'BEA', 'CAI']);
      });

      it('returns nothing for an empty batch', async () => {
        const svc = await factory();
        const ctx = ctxFor('batch_empty');
        await svc.create(ctx, { name: 'p', steps: UPPER_TRIM });
        expect(await svc.executeBatch(ctx, 'p', [])).toEqual([]);
      });

      it('reports a missing pipeline on executeBatch', async () => {
        const svc = await factory();
        await expect(svc.executeBatch(ctxFor('batch_gone'), 'no-such-pipeline', ['x']))
          .rejects.toThrow(/not found/i);
      });

      it('executes inline steps without storing them', async () => {
        const svc = await factory();
        const ctx = ctxFor('inline');
        expect(await svc.executeInline(ctx, UPPER_TRIM, '  ada  ')).toBe('ADA');
        // The escape hatch is exactly that: nothing is named, nothing is kept.
        expect(await svc.list(ctx)).toHaveLength(0);
      });
    });
  });
}
