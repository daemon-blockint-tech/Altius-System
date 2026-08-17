/**
 * Runtime configuration.
 *
 * vite inlines VITE_* at build time, so a bundle that relies on them alone is
 * pinned to one environment — one image per issuer, and no promotion from
 * staging to production. /config.json is written per container, so the image
 * stays identical and the environment moves into deployment config.
 */

import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from '../client.js';

function fetchReturning(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('loadConfig', () => {
  it('prefers the container config over what was baked in', async () => {
    // The container knows which environment it is in; the build does not.
    const config = await loadConfig(
      { VITE_OIDC_ISSUER: 'http://baked-in/realms/altius' },
      'https://altius.example',
      fetchReturning({ oidcIssuer: 'https://idp.prod/realms/altius', oidcClientId: 'altius' }),
    );

    expect(config.oidc?.issuer).toBe('https://idp.prod/realms/altius');
  });

  it('falls back to build-time values when no container config is served', async () => {
    // `pnpm dev` has no container writing the file.
    const config = await loadConfig(
      { VITE_OIDC_ISSUER: 'http://localhost:8180/auth/realms/altius' },
      'http://localhost:5173',
      fetchReturning(null, false),
    );

    expect(config.oidc?.issuer).toBe('http://localhost:8180/auth/realms/altius');
  });

  it('treats an unconfigured container as no OIDC rather than half-configured', async () => {
    // The entrypoint always writes the file; empty strings mean "not set".
    const config = await loadConfig(
      {},
      'https://altius.example',
      fetchReturning({ oidcIssuer: '', oidcClientId: 'altius', oidcRedirectUri: '' }),
    );

    expect(config.oidc).toBeNull();
  });

  it('refuses to start in production when the config cannot be loaded', async () => {
    // The image entrypoint writes /config.json unconditionally, so in a built
    // bundle its absence means the deployment is broken. Carrying on would run
    // anonymously and have every request rejected with no explanation.
    await expect(
      loadConfig({}, 'https://altius.example', fetchReturning(null, false), true),
    ).rejects.toThrow(/Configuration could not be loaded/);
  });

  it('still tolerates a missing config file outside production', async () => {
    // `pnpm dev` has no container and no file, which is normal — this is the
    // distinction that makes the check above safe to make at all.
    const config = await loadConfig(
      { VITE_OIDC_ISSUER: 'http://localhost:8180/auth/realms/altius' },
      'http://localhost:5173',
      fetchReturning(null, false),
      false,
    );

    expect(config.oidc?.issuer).toBe('http://localhost:8180/auth/realms/altius');
  });

  it('survives an unreachable or unparseable config file', async () => {
    // Against the dev stack there is no OIDC to configure; refusing to start
    // over a missing optional file would be worse than running without it.
    const throwing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const config = await loadConfig({}, 'https://altius.example', throwing);

    expect(config.oidc).toBeNull();
    expect(config.endpoint).toBe('/graphql');
  });

  it('keeps the endpoint relative so one image is promotable', async () => {
    const config = await loadConfig({}, 'https://altius.example', fetchReturning({}));
    expect(config.endpoint).toBe('/graphql');
  });

  it('defaults the redirect URI to this origin', async () => {
    const config = await loadConfig(
      {},
      'https://altius.example',
      fetchReturning({ oidcIssuer: 'https://idp.prod/realms/altius' }),
    );

    expect(config.oidc?.redirectUri).toBe('https://altius.example');
    expect(config.oidc?.clientId).toBe('altius');
  });
});
