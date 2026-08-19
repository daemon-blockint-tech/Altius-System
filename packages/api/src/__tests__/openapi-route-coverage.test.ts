/**
 * The OpenAPI spec must describe the REST surface that actually exists.
 *
 * Both are generated from the same ParsedSchema, so a disagreement is a bug in
 * one of them rather than a documentation choice. And the failure is silent in
 * the worst direction: a spec that promises a path the server does not serve
 * sends an integrator to a 404 they will read as their own mistake, while a
 * path the server serves and the spec omits is simply never discovered.
 *
 * The fourth generator pair to be held to its counterpart, after SDK/SDL,
 * view/row-type and resolvers/SDL. Same failure shape as the rest of today:
 * a surface that misleads rather than errors.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import { generateAuditRoutes } from '../rest/audit-routes.js';
import { generateTraverseRoutes } from '../rest/traverse-route.js';
import { generateRelationshipRoutes } from '../relationships/router.js';
import { generateConsentRoutes } from '../consent/router.js';
import { generateOpenApiSpec } from '../rest/openapi.js';
import type { ApiDependencies } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "nhs.acute", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  nhsNumber: String @unique @indexed
  name: String! @sensitive
  status: PatientStatus!
}

enum PatientStatus { ACTIVE DISCHARGED }

type Ward @objectType {
  id: ID! @primary
  name: String! @indexed
}

type DischargePatient @actionType {
  patient: Patient! @param
  destination: String! @param
}
`;

function mockDeps(schema: ReturnType<typeof parseOdl>): ApiDependencies {
  const noop = vi.fn();
  return {
    schema,
    objectManager: { get: noop, query: noop, aggregate: noop, search: noop } as never,
    linkManager: { traverse: noop } as never,
    actionExecutor: { execute: noop } as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue([]),
      getVisibleFields: vi.fn(),
      redactFields: vi.fn(),
      redactFieldsBatch: vi.fn(),
    } as never,
    authenticator: {} as never,
    storage: {} as never,
    dataFreshnessService: {
      recordSync: vi.fn().mockResolvedValue({}),
      getFreshnessForType: vi.fn().mockResolvedValue(null),
      getFreshnessForDatasource: vi.fn().mockResolvedValue(null),
      queryFreshness: vi.fn().mockResolvedValue([]),
      getSummary: vi.fn().mockResolvedValue({}),
      deleteFreshness: vi.fn().mockResolvedValue(undefined),
    } as never,
    accessExplanationService: {
      explain: vi.fn().mockResolvedValue({}),
    } as never,
    justificationStore: {
      create: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue({ records: [], totalCount: 0 }),
      approve: vi.fn().mockResolvedValue(undefined),
    } as never,
    scopedSessionStore: {
      create: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      getActiveForUser: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      revoke: vi.fn().mockResolvedValue(undefined),
      isMarkingAllowed: vi.fn().mockResolvedValue(true),
    } as never,
    ontologySqlService: {
      execute: vi.fn().mockResolvedValue({ columns: [], rows: [], totalRowCount: 0, truncated: false, executionTimeMs: 0, accessedObjectTypes: [] }),
      explain: vi.fn().mockResolvedValue({}),
      validate: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
      createSavedQuery: vi.fn().mockResolvedValue({}),
      getSavedQuery: vi.fn().mockResolvedValue(null),
      listSavedQueries: vi.fn().mockResolvedValue([]),
      updateSavedQuery: vi.fn().mockResolvedValue({}),
      deleteSavedQuery: vi.fn().mockResolvedValue(undefined),
      shareSavedQuery: vi.fn().mockResolvedValue({}),
      executeSavedQuery: vi.fn().mockResolvedValue({ columns: [], rows: [], totalRowCount: 0, truncated: false, executionTimeMs: 0, accessedObjectTypes: [] }),
      listVirtualTables: vi.fn().mockResolvedValue([]),
      describeVirtualTable: vi.fn().mockResolvedValue(null),
    } as never,
    datasetService: {
      create: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      drop: vi.fn().mockResolvedValue(undefined),
      updateSchema: vi.fn().mockResolvedValue({}),
      insert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      truncate: vi.fn().mockResolvedValue({}),
      read: vi.fn().mockResolvedValue({ rows: [] }),
      listTransactions: vi.fn().mockResolvedValue([]),
      getTransaction: vi.fn().mockResolvedValue(null),
      createBranch: vi.fn().mockResolvedValue({}),
      listBranches: vi.fn().mockResolvedValue([]),
      mergeBranch: vi.fn().mockResolvedValue({}),
    } as never,
    datasetMetadataService: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      getSchema: vi.fn().mockResolvedValue(null),
      listBranches: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([]),
    } as never,
    usageMetricsService: {
      record: vi.fn().mockResolvedValue(undefined),
      getObjectTypeMetrics: vi.fn().mockResolvedValue([]),
      getActionFunctionMetrics: vi.fn().mockResolvedValue([]),
      getSummary: vi.fn().mockResolvedValue({}),
      queryEvents: vi.fn().mockResolvedValue({ events: [], totalCount: 0 }),
      getActiveUserCount: vi.fn().mockResolvedValue(0),
      createMonitoringRule: vi.fn().mockResolvedValue({}),
      listMonitoringRules: vi.fn().mockResolvedValue([]),
      deleteMonitoringRule: vi.fn().mockResolvedValue(undefined),
      evaluateMonitoringRules: vi.fn().mockResolvedValue([]),
    } as never,
  } as ApiDependencies;
}

/** `/api/v1/patients/:id` -> `/api/v1/patients/{id}`, the OpenAPI spelling. */
function toOpenApiPath(pattern: string): string {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

describe('OpenAPI spec covers the REST routes', () => {
  const parsed = parseOdl(ODL);
  const deps = mockDeps(parsed);
  // Every generator server.ts mounts. Comparing against generateRestRoutes
  // alone would report the governance routes as undocumented when they are
  // simply served from elsewhere — a false finding, and the reason this list
  // has to track server.ts rather than the one obvious generator.
  const routes = [
    ...generateRestRoutes(parsed, deps),
    ...generateAuditRoutes(deps),
    ...generateTraverseRoutes(deps),
    ...generateRelationshipRoutes(deps, new Map()),
    ...generateConsentRoutes(deps),
    // The function pipeline webhook is mounted directly in server.ts (not via
    // a route generator) but is documented in the OpenAPI spec, so include it
    // here to avoid a false "phantom route" finding.
    { method: 'POST', pattern: '/api/v1/functions-lifecycle/webhook', handler: async () => ({ status: 503, body: {} }) },
  ];
  const spec = generateOpenApiSpec(parsed) as { paths: Record<string, Record<string, unknown>> };

  it('generates both sides', () => {
    // A comparison between two empty collections passes while checking
    // nothing — the vacuity this whole file is guarding against elsewhere.
    expect(routes.length).toBeGreaterThan(5);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(5);
  });

  it('documents every route the server serves', () => {
    const undocumented = routes
      .map(r => ({ method: r.method.toLowerCase(), path: toOpenApiPath(r.pattern) }))
      .filter(r => !(spec.paths[r.path]?.[r.method]))
      .map(r => `${r.method.toUpperCase()} ${r.path}`);

    expect(
      undocumented,
      `served but absent from the spec, so no integrator can discover them:\n${undocumented.join('\n')}`,
    ).toEqual([]);
  });

  it('does not promise a route the server does not serve', () => {
    const served = new Set(
      routes.map(r => `${r.method.toLowerCase()} ${toOpenApiPath(r.pattern)}`),
    );

    const phantom: string[] = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        if (!served.has(`${method} ${path}`)) phantom.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(
      phantom,
      `promised by the spec but not served — an integrator gets a 404 they will ` +
        `read as their own mistake:\n${phantom.join('\n')}`,
    ).toEqual([]);
  });
});
