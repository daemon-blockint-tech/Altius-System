/**
 * Non-durable platform services — the services that have no Postgres
 * implementation and keep per-tenant state in a process-local Map.
 *
 * The risk these tests pin is not that the services are missing, it is that
 * they used to be wired unconditionally. On a Postgres deployment that made
 * every one of their routes answer 200 while writing to memory that is lost on
 * restart and not shared across replicas — and the shipped Helm values run the
 * gateway at minReplicas 2, so a write served by one pod was already invisible
 * to the next read. Withholding them restores the honest answer: the route
 * modules skip registration and callers get a 404.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { InMemoryDatasetService } from '@altius/storage-memory';
import {
  parseAllowNonDurableServices,
  shouldRegisterNonDurableServices,
} from '../config.js';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")
type Widget @objectType { id: ID! @primary name: String! }
`;

const PARSED = parseOdl(ODL);

function createDeps(withDatasetService: boolean): ApiDependencies {
  return {
    schema: PARSED,
    objectManager: {} as never,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn(),
      redactFields: vi.fn(),
      redactFieldsBatch: vi.fn(),
      clearFieldCache: vi.fn(),
    } as never,
    authenticator: {} as never,
    storage: {} as never,
    ...(withDatasetService ? { datasetService: new InMemoryDatasetService() } : {}),
  } as ApiDependencies;
}

describe('parseAllowNonDurableServices (ALLOW_NON_DURABLE_SERVICES env parsing)', () => {
  it("defaults to false when unset or blank (compose/Helm pass unset knobs as '')", () => {
    expect(parseAllowNonDurableServices(undefined)).toBe(false);
    expect(parseAllowNonDurableServices('')).toBe(false);
    expect(parseAllowNonDurableServices('  ')).toBe(false);
  });

  it('accepts true/false case-insensitively with surrounding whitespace', () => {
    expect(parseAllowNonDurableServices('true')).toBe(true);
    expect(parseAllowNonDurableServices(' TRUE ')).toBe(true);
    expect(parseAllowNonDurableServices('false')).toBe(false);
  });

  it('throws on unrecognized values so a misconfigured knob fails boot loudly', () => {
    expect(() => parseAllowNonDurableServices('yes')).toThrow(/ALLOW_NON_DURABLE_SERVICES/);
    expect(() => parseAllowNonDurableServices('1')).toThrow(/ALLOW_NON_DURABLE_SERVICES/);
  });
});

describe('shouldRegisterNonDurableServices', () => {
  it('registers them without a Postgres pool — memory is the only option there', () => {
    expect(shouldRegisterNonDurableServices(false, undefined)).toBe(true);
    expect(shouldRegisterNonDurableServices(false, 'false')).toBe(true);
  });

  it('withholds them by default under Postgres, where the deployment claims durability', () => {
    expect(shouldRegisterNonDurableServices(true, undefined)).toBe(false);
    expect(shouldRegisterNonDurableServices(true, '')).toBe(false);
    expect(shouldRegisterNonDurableServices(true, 'false')).toBe(false);
  });

  it('registers them under Postgres only on an explicit opt-in', () => {
    expect(shouldRegisterNonDurableServices(true, 'true')).toBe(true);
  });
});

describe('withholding a non-durable dep unregisters its routes', () => {
  it('registers dataset routes when the service is present', () => {
    const routes = generateRestRoutes(PARSED, createDeps(true));
    expect(routes.some(r => r.pattern.includes('/datasets'))).toBe(true);
  });

  it('registers no dataset route when the service is withheld, so callers 404 rather than writing to memory that is dropped', () => {
    const routes = generateRestRoutes(PARSED, createDeps(false));
    expect(routes.filter(r => r.pattern.includes('/datasets'))).toEqual([]);
  });

  // Phase 16 added geospatialMapService to the wiring unconditionally, which is
  // how the original defect got in. Pin the guard for it too, so the next
  // service added to the gated object cannot silently regain a live route.
  it('registers no geospatial route when its service is withheld', () => {
    const routes = generateRestRoutes(PARSED, createDeps(false));
    expect(routes.filter(r => r.pattern.includes('/geo'))).toEqual([]);
  });
});
