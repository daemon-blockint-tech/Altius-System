/**
 * Per-tenant OpenFGA store configuration.
 *
 * Store ids are explicit configuration, never created on demand by the request
 * path. The rules that matter for isolation:
 *   - each tenant gets its own store (two tenants may not share one);
 *   - a tenant with no store is denied, never served from a default store;
 *   - the single-store back-compat path is reachable only by a deployment that
 *     has actually declared itself single-tenant.
 */

import { describe, it, expect } from 'vitest';

import { parseFgaStoreMap, createFgaClientRegistry } from '../config.js';

describe('parseFgaStoreMap', () => {
  describe('OPENFGA_STORE_IDS (multi-tenant)', () => {
    it('parses tenant=storeId pairs', () => {
      const stores = parseFgaStoreMap('a=store-1,b=store-2', undefined, undefined);
      expect(stores.get('a')).toBe('store-1');
      expect(stores.get('b')).toBe('store-2');
      expect(stores.size).toBe(2);
    });

    it('tolerates surrounding whitespace', () => {
      const stores = parseFgaStoreMap(' a = store-1 , b = store-2 ', undefined, undefined);
      expect(stores.get('a')).toBe('store-1');
      expect(stores.get('b')).toBe('store-2');
    });

    it('takes precedence over OPENFGA_STORE_ID', () => {
      // Deployments migrating to per-tenant stores will still have the old var
      // set (and Helm/compose may keep passing it), so the new one must win.
      const stores = parseFgaStoreMap('a=store-1', 'legacy-store', 'default');
      expect(stores.size).toBe(1);
      expect(stores.get('a')).toBe('store-1');
    });

    it('rejects two tenants sharing one store', () => {
      // This is the defect through the back door: a shared store is a shared
      // tuple namespace, so a grant in one tenant authorizes the same object id
      // in the other.
      expect(() => parseFgaStoreMap('a=same,b=same', undefined, undefined)).toThrow(/both map to store/);
    });

    it('rejects a tenant listed twice', () => {
      expect(() => parseFgaStoreMap('a=s1,a=s2', undefined, undefined)).toThrow(/listed more than once/);
    });

    it('rejects malformed entries', () => {
      expect(() => parseFgaStoreMap('a=s1,garbage', undefined, undefined)).toThrow(/expected 'tenant=storeId'/);
      expect(() => parseFgaStoreMap('=s1', undefined, undefined)).toThrow(/expected 'tenant=storeId'/);
      expect(() => parseFgaStoreMap('a=', undefined, undefined)).toThrow(/expected 'tenant=storeId'/);
    });
  });

  describe('OPENFGA_STORE_ID (single-tenant back-compat)', () => {
    it('maps the one store to the deployment\'s declared tenant', () => {
      const stores = parseFgaStoreMap(undefined, 'store-1', 'default');
      expect(stores.size).toBe(1);
      expect(stores.get('default')).toBe('store-1');
    });

    it('refuses to boot when the deployment has not declared a single tenant', () => {
      // Unset OIDC_DEFAULT_TENANT means tenants come from the token's tenant_id
      // claim — i.e. multi-tenant. A lone OPENFGA_STORE_ID there IS the shared
      // store this split removes, so it must fail boot rather than serve it.
      expect(() => parseFgaStoreMap(undefined, 'store-1', undefined)).toThrow(/OIDC_DEFAULT_TENANT is unset/);
      expect(() => parseFgaStoreMap(undefined, 'store-1', '  ')).toThrow(/OIDC_DEFAULT_TENANT is unset/);
    });

    it('treats blank as unset (compose/Helm pass unset knobs as empty strings)', () => {
      expect(() => parseFgaStoreMap('  ', '', 'default')).toThrow(/requires OPENFGA_STORE_IDS/);
    });
  });
});

describe('createFgaClientRegistry', () => {
  it('returns undefined for a tenant with no store, so callers fail closed', async () => {
    const resolve = createFgaClientRegistry('http://fga.invalid', new Map([['a', 'store-1']]));
    expect(await resolve('no-such-tenant')).toBeUndefined();
  });
});
