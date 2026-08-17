/**
 * Every root field the SDL declares must have a resolver.
 *
 * GraphQL's default resolver reads a property off the parent, which is right
 * for object fields and wrong for roots: a Query, Mutation or Subscription
 * field with no resolver returns `null` against a parent that has no such
 * property. Not an error — a successful response with nothing in it.
 *
 * That is the same shape as the three client bugs found today (empty worklist,
 * action panel that never loaded, unreadable dischargeRecord): a surface that
 * fails by looking empty rather than by failing. `requireResolversToMatchSchema`
 * is set on the executable schema, but it catches the opposite direction — a
 * resolver with no field — and only warns.
 *
 * Both sides are generated from the same ParsedSchema, so any gap is a bug in
 * one of the generators rather than a configuration choice.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildSchema } from 'graphql';
import { parseOdl } from '@altius/odl';
import { generateGraphQLSchema } from '@altius/odl';
import { generateResolvers } from '../graphql/resolver-generator.js';
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

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_MANY) {
  id: ID! @primary
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
  } as ApiDependencies;
}

describe('resolvers cover the SDL', () => {
  const parsed = parseOdl(ODL);
  const schema = buildSchema(generateGraphQLSchema(parsed));
  const { resolvers } = generateResolvers(parsed, mockDeps(parsed));

  for (const rootName of ['Query', 'Mutation', 'Subscription'] as const) {
    it(`implements every ${rootName} field`, () => {
      const rootType = schema.getType(rootName);
      if (!rootType || !('getFields' in rootType)) return;

      const declared = Object.keys((rootType as { getFields(): object }).getFields());
      expect(declared.length, `${rootName} declares no fields`).toBeGreaterThan(0);

      const implemented = new Set(Object.keys((resolvers as Record<string, object>)[rootName] ?? {}));
      const missing = declared.filter(f => !implemented.has(f));

      expect(
        missing,
        `${rootName} fields declared in the SDL with no resolver — these return null ` +
          `to every caller without erroring: ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }
});
