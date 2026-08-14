/**
 * Boot-time check that every action the ReBAC layer cannot gate is gated by its
 * manifest preconditions.
 *
 * createSecurityLayer returns `allowed: true` for actions with no ObjectType
 * @param (there is no instance to check a relation against). That is deliberate,
 * but it means such an action's ONLY authorization is its CEL preconditions —
 * and nothing used to require those to exist.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ParsedSchema } from '@altius/odl';

import { assertActionAuthzCoverage } from '../config.js';
import type { ManifestRegistry } from '../graphql/types.js';
import type { ActionAuthzMapping } from '../config.js';

/** Minimal ActionType: only `name` and `fields` are read by the check. */
function actionType(name: string) {
  return { name, fields: [] };
}

function schemaWith(...names: string[]): ParsedSchema {
  return { actionTypes: names.map(actionType) } as unknown as ParsedSchema;
}

function registry(manifests: Record<string, { expr: string }[]>): ManifestRegistry {
  return {
    get(action: string) {
      const preconditions = manifests[action];
      return preconditions ? ({ preconditions } as never) : undefined;
    },
  } as ManifestRegistry;
}

const NO_MAPPINGS = new Map<string, ActionAuthzMapping>();

describe('assertActionAuthzCoverage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when an object-less action has no preconditions at all', () => {
    expect(() =>
      assertActionAuthzCoverage(
        schemaWith('PurgeEverything'),
        registry({ PurgeEverything: [] }),
        NO_MAPPINGS,
        false,
      ),
    ).toThrow(/PurgeEverything/);
  });

  it('does not throw in dev, where the security layer is an allow-all stub anyway', () => {
    expect(() =>
      assertActionAuthzCoverage(
        schemaWith('PurgeEverything'),
        registry({ PurgeEverything: [] }),
        NO_MAPPINGS,
        true,
      ),
    ).not.toThrow();
  });

  it('accepts an object-less action gated by a role precondition', () => {
    expect(() =>
      assertActionAuthzCoverage(
        schemaWith('RegisterPatient'),
        registry({
          RegisterPatient: [{ expr: "actor.hasRole('receptionist') || actor.hasRole('clinician')" }],
        }),
        NO_MAPPINGS,
        false,
      ),
    ).not.toThrow();
  });

  it('warns but does not block when preconditions gate data rather than the caller', () => {
    expect(() =>
      assertActionAuthzCoverage(
        schemaWith('CreateOrder'),
        registry({ CreateOrder: [{ expr: 'params.quantity > 0' }] }),
        NO_MAPPINGS,
        false,
      ),
    ).not.toThrow();
  });

  it('ignores actions the ReBAC layer already gates via an ObjectType param', () => {
    const mapped = new Map<string, ActionAuthzMapping>([
      ['AdmitPatient', { relation: 'can_admit', objectType: 'patient', objectIdParam: 'patient' }],
    ]);

    expect(() =>
      assertActionAuthzCoverage(
        schemaWith('AdmitPatient'),
        registry({ AdmitPatient: [] }),
        mapped,
        false,
      ),
    ).not.toThrow();
  });

  it('ignores actions with no manifest — schema-loader already fails those', () => {
    expect(() =>
      assertActionAuthzCoverage(schemaWith('Orphan'), registry({}), NO_MAPPINGS, false),
    ).not.toThrow();
  });
});
