/**
 * Data-connection gateway boot wiring tests.
 *
 * The last test is the vertical slice the feature exists for: a pack
 * manifest declaring runtime AGENT becomes a leasable datasource, an agent
 * enrolls and heartbeats its way to the lease, uploads captured records,
 * and the records land in the ontology through the same natural-key upsert
 * path scheduled syncs use.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { MemoryStorageProvider } from '@altius/storage-memory';
import { ObjectManager, InMemoryEventBus, EngineEventEmitter } from '@altius/engine';
import type { RequestContext } from '@altius/spi';
import type { AgentEnrollResponse, AgentHeartbeatResponse } from '@altius/sync';
import { startAgentGateway } from '../data-connection-boot.js';
import type { ConnectorManifest } from '../schema-loader.js';

const schema = parseOdl(`
  extend schema @namespace(name: "test.dc", version: "1.0.0")
  type Widget @objectType {
    id: ID! @primary
    serial: String! @unique
    name: String
  }
`);

const ctx: RequestContext = { tenantId: 'dc-test', actorId: 'sync:AgentSrc' };

function makeManager() {
  const storage = new MemoryStorageProvider();
  const emitter = new EngineEventEmitter(new InMemoryEventBus());
  return { storage, objectManager: new ObjectManager({ storage, schema, eventEmitter: emitter }) };
}

function manifest(config: Record<string, unknown>): ConnectorManifest {
  return { connector: 'jdbc', config, packName: 'test-pack' };
}

const agentConfig = {
  datasource: 'AgentSrc',
  connector: 'jdbc',
  runtime: 'AGENT',
  connection: { url: 'jdbc:postgresql://${ON_PREM_DB}/x', table: 't' },
  mapping: { objectType: 'Widget', primaryKey: { source: 'sid', target: 'serial' }, properties: { name: { source: 'name' } } },
  sync: { mode: 'POLLING' },
};

describe('startAgentGateway', () => {
  it('returns a null gateway when no manifest declares runtime AGENT', async () => {
    const { objectManager } = makeManager();
    const result = await startAgentGateway({
      connectorManifests: [
        manifest({ ...agentConfig, runtime: 'DIRECT' }),
        manifest({ broken: true }),
      ],
      enrollmentSecret: 's3cret',
      objectManager,
      tenantId: 'dc-test',
    });
    expect(result.gateway).toBeNull();
    expect(result.leasable).toEqual([]);
  });

  it('skips unenforceable conflictResolution and non-upsertable key targets', async () => {
    const { objectManager } = makeManager();
    const result = await startAgentGateway({
      connectorManifests: [
        manifest({ ...agentConfig, sync: { mode: 'POLLING', conflictResolution: 'ACTION_PRIORITY' } }),
        manifest({
          ...agentConfig,
          datasource: 'BadKey',
          mapping: { ...agentConfig.mapping, primaryKey: { source: 'sid', target: 'id' } },
        }),
      ],
      enrollmentSecret: 's3cret',
      objectManager,
      tenantId: 'dc-test',
    });
    expect(result.gateway).toBeNull();
    expect(result.leasable).toEqual([]);
  });

  it('leases a pack-declared AGENT datasource and applies uploaded records to the ontology', async () => {
    const { objectManager } = makeManager();
    const result = await startAgentGateway({
      connectorManifests: [manifest(agentConfig)],
      enrollmentSecret: 's3cret',
      objectManager,
      tenantId: 'dc-test',
    });
    expect(result.leasable).toEqual(['AgentSrc']);
    const gateway = result.gateway!;

    // Agent's protocol round-trip: enroll → heartbeat (lease) → upload.
    const enrollRes = gateway.enroll('s3cret', { agentName: 'onprem-agent', connectors: ['jdbc'] });
    expect(enrollRes.status).toBe(200);
    const { agentId, agentToken } = enrollRes.body as AgentEnrollResponse;

    const hb = await gateway.heartbeat(agentId, agentToken, { connectors: ['jdbc'] });
    const leases = (hb.body as AgentHeartbeatResponse).leases;
    expect(leases.map(l => l.datasource)).toEqual(['AgentSrc']);
    // The ${ON_PREM_DB} placeholder passes through unresolved — the platform
    // holds no credential for the customer's source.
    expect(leases[0]!.connection.url).toContain('${ON_PREM_DB}');

    const upload = await gateway.upload(agentId, agentToken, 'AgentSrc', {
      records: [{
        table: 't',
        key: { sid: 'W-9' },
        data: { sid: 'W-9', name: 'From the customer network' },
        operation: 'INSERT',
        timestamp: new Date().toISOString(),
        checkpoint: 'cp-1',
      }],
    });
    expect(upload.status).toBe(200);

    const page = await objectManager.query('Widget', { field: 'serial', operator: 'eq', value: 'W-9' }, undefined, ctx);
    expect(page.totalCount).toBe(1);
    expect(page.items[0]!).toMatchObject({ serial: 'W-9', name: 'From the customer network' });
  });
});
