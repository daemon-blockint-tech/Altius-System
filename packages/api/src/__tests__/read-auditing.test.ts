/**
 * Reads must land in the audit trail.
 *
 * AuditWriter's own doc comment has always claimed a "called by query layer
 * for read auditing" caller, and no such caller existed: every producer wrote
 * actions, links, consent or functions. The trail could say who changed a
 * record and never who read one — so a DPO could not answer a subject-access
 * request, and a denied read left no evidence the control had held.
 *
 * These pin the behaviour at the REST dispatcher, where every read route
 * converges, so a read route added later is covered without being remembered.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AuditRecord } from '@altius/spi';
import { AuditWriter, MemoryAuditStore } from '@altius/security';
import { auditRead } from '../rest/audit-read.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import { createFhirRouter } from '../fhir/router.js';
import { createCdmRouter } from '../cdm/router.js';
import type { RestRequest, RestRoute } from '../rest/types.js';
import type { ResolverContext } from '../graphql/types.js';

/** ResolverMap values are a union; read resolvers are plain functions. */
type ReadResolver = (p: unknown, a: Record<string, unknown>, c: ResolverContext) => Promise<unknown>;

const noopHandler: RestRoute['handler'] = async () => ({ status: 200, body: {} });

function route(over: Partial<RestRoute> = {}): RestRoute {
  return { method: 'GET', pattern: '/api/v1/patients', handler: noopHandler, ...over };
}

function request(over: Partial<RestRequest> = {}): RestRequest {
  return {
    method: 'GET',
    path: '/api/v1/patients',
    params: {},
    query: {},
    body: {},
    user: { id: 'u-1', name: 'Dr Smith', email: 'd@nhs.uk', roles: ['clinician'], groups: [], tenantId: 't-1' },
    headers: {},
    ...over,
  } as RestRequest;
}

function context(): ResolverContext {
  return {
    user: { id: 'u-1', name: 'Dr Smith', email: 'd@nhs.uk', roles: ['clinician'], groups: [], tenantId: 't-1' },
    requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'trace-1' },
  } as unknown as ResolverContext;
}

let store: MemoryAuditStore;
let writer: AuditWriter;

async function records(): Promise<AuditRecord[]> {
  return store.query({ tenantId: 't-1' });
}

beforeEach(() => {
  store = new MemoryAuditStore();
  writer = new AuditWriter(store);
});

describe('read auditing', () => {
  it('records a single-object read with the object id', async () => {
    await auditRead(
      writer,
      route({ pattern: '/api/v1/patients/:id', objectType: 'Patient' }),
      request({ path: '/api/v1/patients/p-1', params: { id: 'p-1' } }),
      context(),
      200,
    );

    const [rec] = await records();
    expect(rec?.operation.type).toBe('read');
    expect(rec?.operation.objectType).toBe('Patient');
    expect(rec?.operation.objectId).toBe('p-1');
    expect(rec?.detail.result).toBe('success');
    expect(rec?.actor.id).toBe('u-1');
    expect(rec?.tenantId).toBe('t-1');
  });

  it('records a list read as a query, with no object id', async () => {
    await auditRead(writer, route({ objectType: 'Patient' }), request(), context(), 200);

    const [rec] = await records();
    expect(rec?.operation.type).toBe('query');
    expect(rec?.operation.objectId).toBeUndefined();
  });

  it('records a denied read — the evidence that the control held', async () => {
    await auditRead(
      writer,
      route({ pattern: '/api/v1/patients/:id', objectType: 'Patient' }),
      request({ path: '/api/v1/patients/p-9', params: { id: 'p-9' } }),
      context(),
      403,
    );

    const [rec] = await records();
    expect(rec?.detail.result).toBe('denied');
    expect(rec?.operation.objectId).toBe('p-9');
  });

  it('audits a POST read that declares itself one (aggregate, traverse)', async () => {
    await auditRead(
      writer,
      route({ method: 'POST', pattern: '/api/v1/patients/aggregate', readOperation: 'query', objectType: 'Patient' }),
      request({ method: 'POST', path: '/api/v1/patients/aggregate' }),
      context(),
      200,
    );

    const [rec] = await records();
    expect(rec?.operation.type).toBe('query');
  });

  it('does not audit a write as a read — its own handler does that', async () => {
    await auditRead(
      writer,
      route({ method: 'PUT', pattern: '/api/v1/patients/:id', objectType: 'Patient' }),
      request({ method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' } }),
      context(),
      200,
    );

    expect(await records()).toHaveLength(0);
  });

  it('records what was asked, not what was returned', async () => {
    await auditRead(
      writer,
      route({ pattern: '/api/v1/patients/search', objectType: 'Patient' }),
      request({ path: '/api/v1/patients/search' }),
      context(),
      200,
    );

    const [rec] = await records();
    expect(rec?.detail.query).toBe('GET /api/v1/patients/search');
    // The response body must not be copied into a second store.
    expect(rec?.detail.after).toBeUndefined();
  });

  it('never fails the read when the audit store throws', async () => {
    const brokenWriter = new AuditWriter({
      write: async () => { throw new Error('store down'); },
      query: async () => [],
      count: async () => 0,
    } as unknown as MemoryAuditStore);

    await expect(
      auditRead(brokenWriter, route({ objectType: 'Patient' }), request(), context(), 200),
    ).resolves.toBeUndefined();
  });

  it('is inert when no audit writer is configured', async () => {
    await expect(
      auditRead(undefined, route({ objectType: 'Patient' }), request(), context(), 200),
    ).resolves.toBeUndefined();
  });
});

/**
 * The REST half is covered above at the dispatcher. GraphQL has no equivalent
 * single dispatcher — Apollo sees one POST /graphql for any query — so the
 * generated read resolvers audit individually. These run the real generated
 * resolvers to prove the records actually land, rather than asserting the
 * helper in isolation a second time.
 */
describe('read auditing — GraphQL resolvers', () => {
  const schema = {
    objectTypes: [{
      name: 'Patient',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false }, directives: [{ kind: 'primary' }] },
        { name: 'name', type: { name: 'String', nonNull: false, isList: false }, directives: [] },
      ],
      directives: [{ kind: 'objectType' }],
    }],
    linkTypes: [], actionTypes: [], functionTypes: [], enums: [], interfaces: [],
  };

  function deps(allowed: boolean) {
    return {
      schema,
      auditWriter: writer,
      authorizationService: {
        check: async () => allowed,
        listObjects: async () => ['p-1'],
        redactFields: (_u: unknown, _r: unknown, _t: unknown, d: Record<string, unknown>) => ({ data: d, _redactedFields: [] }),
        redactFieldsBatch: (_u: unknown, _r: unknown, _t: unknown, ds: Record<string, unknown>[]) => ds.map(d => ({ data: d, _redactedFields: [] })),
        getVisibleFields: () => undefined,
        clearFieldCache: () => {},
      },
      objectManager: {
        get: async () => ({ _id: 'p-1', _type: 'Patient', name: 'Ann', _version: 1 }),
        query: async () => ({ items: [{ _id: 'p-1', _type: 'Patient', name: 'Ann', _version: 1 }], totalCount: 1 }),
      },
    } as unknown as Parameters<typeof generateResolvers>[1];
  }

  it('audits a successful single-object read', async () => {
    const { resolvers } = generateResolvers(schema as never, deps(true));
    await (resolvers['Query']!['patient'] as ReadResolver)({}, { id: 'p-1' }, context());

    const [rec] = await records();
    expect(rec?.operation.type).toBe('read');
    expect(rec?.operation.objectType).toBe('Patient');
    expect(rec?.operation.objectId).toBe('p-1');
    expect(rec?.detail.result).toBe('success');
  });

  it('audits a denied single-object read', async () => {
    const { resolvers } = generateResolvers(schema as never, deps(false));
    await expect(
      (resolvers['Query']!['patient'] as ReadResolver)({}, { id: 'p-1' }, context()),
    ).rejects.toThrow();

    const [rec] = await records();
    expect(rec?.detail.result).toBe('denied');
    expect(rec?.operation.objectId).toBe('p-1');
  });

  it('audits an aggregate as a query', async () => {
    const d = deps(true) as unknown as Record<string, unknown>;
    (d['objectManager'] as Record<string, unknown>)['aggregate'] =
      async () => ({ groups: [], totalGroups: 0 });
    const { resolvers } = generateResolvers(schema as never, d as never);
    await (resolvers['Query']!['patientAggregate'] as ReadResolver)(
      {}, { fields: [{ fn: 'count', field: 'name' }] }, context(),
    );

    const [rec] = await records();
    expect(rec?.operation.type).toBe('query');
    expect(rec?.operation.objectType).toBe('Patient');
  });

  it('audits a traverse, naming the start object', async () => {
    const d = deps(true) as unknown as Record<string, unknown>;
    d['linkManager'] = { traverse: async () => ({ nodes: [], edges: [], totalCount: 0 }) };
    (d['storage'] as unknown) = { traverse: async () => ({ nodes: [], edges: [], totalCount: 0 }) };
    const { resolvers } = generateResolvers(schema as never, d as never);
    await (resolvers['Query']!['traversePatient'] as ReadResolver)(
      {}, { startId: 'p-1', steps: [] }, context(),
    );

    const [rec] = await records();
    expect(rec?.operation.type).toBe('query');
    expect(rec?.operation.objectId).toBe('p-1');
  });

  it('audits a list read as a query', async () => {
    const { resolvers } = generateResolvers(schema as never, deps(true));
    await (resolvers['Query']!['patients'] as ReadResolver)({}, {}, context());

    const [rec] = await records();
    expect(rec?.operation.type).toBe('query');
    expect(rec?.operation.objectType).toBe('Patient');
    expect(rec?.operation.objectId).toBeUndefined();
  });
});

/**
 * FHIR and CDM are read-only projections over the same objects. They were the
 * last unaudited read surfaces — and they are the ones a clinical integration
 * actually calls, so a DPO asking "who read this patient" would have missed
 * exactly the traffic that matters most in the shipped NHS pack.
 */
describe('read auditing — FHIR and CDM projections', () => {
  const deps = () => ({
    auditWriter: writer,
    schema: { objectTypes: [], linkTypes: [], actionTypes: [], functionTypes: [], enums: [], interfaces: [] },
    authorizationService: { check: async () => false },
  }) as never;

  const user = { id: 'u-1', name: 'Dr Smith', email: 'd@nhs.uk', roles: ['clinician'], groups: [], tenantId: 't-1' };

  it('audits a FHIR resource read', async () => {
    const router = createFhirRouter({ deps: deps() });
    await router({ method: 'GET', path: '/Patient/p-1', query: {}, headers: {}, user } as never);

    const [rec] = await records();
    expect(rec?.operation.type).toBe('read');
    expect(rec?.operation.objectType).toBe('Patient');
    expect(rec?.operation.objectId).toBe('p-1');
    expect(rec?.detail.query).toBe('fhir GET /Patient/p-1');
  });

  it('audits a FHIR search as a query', async () => {
    const router = createFhirRouter({ deps: deps() });
    await router({ method: 'GET', path: '/Patient', query: {}, headers: {}, user } as never);

    const [rec] = await records();
    expect(rec?.operation.type).toBe('query');
    expect(rec?.operation.objectId).toBeUndefined();
  });

  it('does not audit the FHIR CapabilityStatement — it is not anyone data', async () => {
    const router = createFhirRouter({ deps: deps() });
    await router({ method: 'GET', path: '/metadata', query: {}, headers: {}, user } as never);

    expect(await records()).toHaveLength(0);
  });

  it('audits a CDM object read', async () => {
    const router = createCdmRouter({ deps: deps() });
    await router({ method: 'GET', path: '/Patient/p-1', query: {}, headers: {}, user } as never);

    const [rec] = await records();
    expect(rec?.operation.objectType).toBe('Patient');
    expect(rec?.operation.objectId).toBe('p-1');
    expect(rec?.detail.query).toBe('cdm GET /Patient/p-1');
  });

  it('audits a CDM export as a query, not a record read', async () => {
    const router = createCdmRouter({ deps: deps() });
    await router({ method: 'GET', path: '/Patient/export', query: {}, headers: {}, user } as never);

    const [rec] = await records();
    expect(rec?.operation.type).toBe('query');
    expect(rec?.operation.objectId).toBeUndefined();
  });

  it('records a denied FHIR read', async () => {
    const router = createFhirRouter({ deps: deps() });
    await router({ method: 'GET', path: '/Patient/p-9', query: {}, headers: {}, user } as never);

    const [rec] = await records();
    expect(rec?.detail.result).toBe('denied');
  });
});
