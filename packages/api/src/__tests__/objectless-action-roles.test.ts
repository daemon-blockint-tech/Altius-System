/**
 * Object-less actions are deny-by-default at the ReBAC layer.
 *
 * createSecurityLayer used to return `allowed: true` for any action with no
 * ObjectType @param, deferring to CEL preconditions that nothing guaranteed
 * checked the caller — an object-less action whose preconditions gated only
 * data was executable by ANY authenticated user. The gate is now the
 * manifest's declarative requiredRoles, mirroring @function requiredRoles:
 * absent or empty means nobody.
 */

import { describe, it, expect, vi } from 'vitest';

import { createSecurityLayer } from '../config.js';
import type { ManifestRegistry } from '../graphql/types.js';
import type { AuthorizationService } from '@altius/security';

const CTX = { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' };

function actor(roles: string[]) {
  return { id: 'u-1', type: 'user' as const, roles };
}

function authzMock(allowed = true): AuthorizationService {
  return { check: vi.fn().mockResolvedValue(allowed) } as unknown as AuthorizationService;
}

function manifests(requiredRoles?: string[]): ManifestRegistry {
  return {
    get: () => ({ preconditions: [], requiredRoles } as never),
  } as ManifestRegistry;
}

describe('createSecurityLayer — object-less actions', () => {
  it('denies when the manifest declares no requiredRoles (fail closed)', async () => {
    const layer = createSecurityLayer(authzMock(), new Map(), manifests(undefined));
    const result = await layer.checkPermission(actor(['admin']), 'RegisterPatient', {}, CTX);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/requiredRoles/);
  });

  it('denies when no manifest registry is wired at all (fail closed)', async () => {
    const layer = createSecurityLayer(authzMock(), new Map());
    const result = await layer.checkPermission(actor(['admin']), 'RegisterPatient', {}, CTX);
    expect(result.allowed).toBe(false);
  });

  it('denies a caller lacking every required role, naming them', async () => {
    const layer = createSecurityLayer(authzMock(), new Map(), manifests(['receptionist', 'clinician']));
    const result = await layer.checkPermission(actor(['porter']), 'RegisterPatient', {}, CTX);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('receptionist');
  });

  it('allows a caller holding one of the required roles', async () => {
    const layer = createSecurityLayer(authzMock(), new Map(), manifests(['receptionist', 'clinician']));
    const result = await layer.checkPermission(actor(['clinician']), 'RegisterPatient', {}, CTX);
    expect(result.allowed).toBe(true);
  });

  it('leaves ReBAC-mapped actions on the FGA path, ignoring requiredRoles', async () => {
    const authz = authzMock(true);
    const mappings = new Map([
      ['AdmitPatient', { relation: 'can_admit', objectType: 'patient', objectIdParam: 'patient' }],
    ]);
    const layer = createSecurityLayer(authz, mappings, manifests(undefined));
    const result = await layer.checkPermission(actor([]), 'AdmitPatient', { patient: 'p-1' }, CTX);
    expect(result.allowed).toBe(true);
    expect(authz.check).toHaveBeenCalledWith('user:u-1', 'can_admit', 'patient:p-1', 't-1');
  });
});
