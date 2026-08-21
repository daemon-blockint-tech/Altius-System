/**
 * checkObjectAccess is the shared per-object gate for the object-linked auxiliary
 * REST families (time-series, comments, embeddings, ...) that bypass the central
 * dispatcher. It must apply the same two checks the generated object routes do:
 * markings hide the type (404), then FGA gates the object (viewer for reads,
 * editor for writes; 403).
 */

import { describe, it, expect } from 'vitest';
import { MarkingPolicy } from '@altius/security';
import { checkObjectAccess, viewableObjectIds } from '../rest/object-access.js';
import type { ApiDependencies, AuthenticatedUserInfo } from '../graphql/types.js';

const user = (markings: string[] = []): AuthenticatedUserInfo => ({
  id: 'u1', name: 'U', email: 'u@x', roles: [], groups: [], tenantId: 't1', markings,
} as AuthenticatedUserInfo);

function deps(opts: {
  check: (rel: string) => boolean;
  markedTypes?: Record<string, string[]>;
}): { deps: ApiDependencies; checkedRelations: string[] } {
  const checkedRelations: string[] = [];
  const d = {
    markingPolicy: opts.markedTypes
      ? new MarkingPolicy({
          markings: Object.values(opts.markedTypes).flat().map(name => ({ name })),
          byObjectType: opts.markedTypes,
        })
      : undefined,
    authorizationService: {
      check: async (_u: string, relation: string) => {
        checkedRelations.push(relation);
        return opts.check(relation);
      },
    },
  } as unknown as ApiDependencies;
  return { deps: d, checkedRelations };
}

describe('checkObjectAccess', () => {
  it('allows when the type is unmarked/visible and FGA grants access', async () => {
    const { deps: d } = deps({ check: () => true });
    expect(await checkObjectAccess(d, user(), 'Patient', 'p1', 'read')).toBeUndefined();
  });

  it('denies with 403 when FGA rejects', async () => {
    const { deps: d } = deps({ check: () => false });
    const denial = await checkObjectAccess(d, user(), 'Patient', 'p1', 'read');
    expect(denial?.status).toBe(403);
  });

  it('denies with 404 when the caller lacks the type markings (before FGA)', async () => {
    const { deps: d, checkedRelations } = deps({
      check: () => true, // FGA would allow — markings must still block
      markedTypes: { Patient: ['SECRET'] },
    });
    const denial = await checkObjectAccess(d, user([]), 'Patient', 'p1', 'read');
    expect(denial?.status).toBe(404);
    // Fail-closed and discovery-hiding: FGA is never even consulted.
    expect(checkedRelations).toEqual([]);
  });

  it('lets a marking-holding caller through to the FGA check', async () => {
    const { deps: d } = deps({ check: () => true, markedTypes: { Patient: ['SECRET'] } });
    expect(await checkObjectAccess(d, user(['SECRET']), 'Patient', 'p1', 'read')).toBeUndefined();
  });

  it('checks viewer for reads and editor for writes', async () => {
    const r = deps({ check: () => true });
    await checkObjectAccess(r.deps, user(), 'Patient', 'p1', 'read');
    expect(r.checkedRelations).toEqual(['viewer']);

    const w = deps({ check: () => true });
    await checkObjectAccess(w.deps, user(), 'Patient', 'p1', 'write');
    expect(w.checkedRelations).toEqual(['editor']);
  });
});

describe('viewableObjectIds', () => {
  it('reports allowAll for the dev/allow-all * sentinel', async () => {
    const d = { authorizationService: { listObjects: async () => ['*'] } } as unknown as ApiDependencies;
    expect(await viewableObjectIds(d, user(), 'Patient')).toEqual({ allowAll: true, ids: [] });
  });

  it('returns the concrete viewable id list otherwise', async () => {
    const d = { authorizationService: { listObjects: async () => ['p1', 'p2'] } } as unknown as ApiDependencies;
    expect(await viewableObjectIds(d, user(), 'Patient')).toEqual({ allowAll: false, ids: ['p1', 'p2'] });
  });
});
