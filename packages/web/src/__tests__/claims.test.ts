import { describe, it, expect } from 'vitest';
import { decodeJwtClaims, principalFromClaims } from '../auth/claims.js';

/** base64url-encode a JSON payload into a fake JWT (header.payload.sig). */
function jwt(payload: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64}.sig`;
}

describe('decodeJwtClaims', () => {
  it('decodes the payload segment', () => {
    const claims = decodeJwtClaims(jwt({ sub: 'u1', name: 'Ada Lovelace', tenant_id: 't-9' }));
    expect(claims!.sub).toBe('u1');
    expect(claims!.name).toBe('Ada Lovelace');
    expect(claims!.tenant_id).toBe('t-9');
  });

  it('returns null on malformed input', () => {
    expect(decodeJwtClaims('not-a-jwt')).toBeNull();
    expect(decodeJwtClaims('a.@@@.c')).toBeNull();
    expect(decodeJwtClaims('')).toBeNull();
  });
});

describe('principalFromClaims', () => {
  it('maps claims with tenant_id and flat roles', () => {
    const p = principalFromClaims({ sub: 'u1', name: 'Ada', email: 'ada@x', tenant_id: 't-9', roles: ['admin', 'viewer'] });
    expect(p).toEqual({ name: 'Ada', email: 'ada@x', tenant: 't-9', sub: 'u1', roles: ['admin', 'viewer'] });
  });

  it('falls back through preferred_username, realm_access roles and default tenant', () => {
    const p = principalFromClaims({ sub: 'u2', preferred_username: 'bob', realm_access: { roles: ['clinician'] } });
    expect(p.name).toBe('bob');
    expect(p.tenant).toBe('default');
    expect(p.roles).toEqual(['clinician']);
  });

  it('splits an NHS string roles claim', () => {
    const p = principalFromClaims({ sub: 'u3', nhsroles: 'R8000 R8003' });
    expect(p.roles).toEqual(['R8000', 'R8003']);
  });

  it('returns a safe default for null claims', () => {
    expect(principalFromClaims(null)).toEqual({ name: 'Unknown', email: '', tenant: 'default', sub: '', roles: [] });
  });
});
