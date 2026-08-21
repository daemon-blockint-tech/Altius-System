/**
 * The 15 "previously-unreachable SPI service" route families are gated as a
 * whole by platform-service roles. Before this gate, any authenticated user
 * could approve change proposals, mutate business rules, etc.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import { registerAbsentServiceRoutes } from '../rest/absent-services-routes.js';
import { InMemoryChangeProposalStore } from '@altius/storage-memory';

function buildApp(roles: string[], allowed: readonly string[]) {
  const app = express();
  app.use(express.json());
  const authenticator = {
    authenticate: async () => ({
      id: 'u1', tenantId: 't1', roles, name: 'U', email: 'u@x',
    }),
  } as any;
  registerAbsentServiceRoutes(
    app,
    { changeProposalStore: new InMemoryChangeProposalStore() } as any,
    authenticator,
    false,
    allowed,
  );
  return app;
}

async function hit(app: express.Express, path: string): Promise<number> {
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { authorization: 'Bearer x' },
    });
    return res.status;
  } finally {
    server.close();
  }
}

describe('absent-service routes role gate', () => {
  it('rejects a non-admin caller with 403', async () => {
    expect(await hit(buildApp(['viewer'], ['admin']), '/api/v1/change-proposals')).toBe(403);
  });

  it('admits a caller holding an allowed role', async () => {
    expect(await hit(buildApp(['admin'], ['admin']), '/api/v1/change-proposals')).toBe(200);
  });

  it('explicitly empty role list means nobody', async () => {
    expect(await hit(buildApp(['admin'], []), '/api/v1/change-proposals')).toBe(403);
  });
});
