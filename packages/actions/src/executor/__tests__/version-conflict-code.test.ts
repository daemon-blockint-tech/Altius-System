/**
 * A storage-raised VERSION_CONFLICT must survive the transaction boundary.
 *
 * The executor's catch-all around the effect loop rolls back and reports the
 * failure; if it flattens every code to EFFECT_EXECUTION_ERROR, a genuine
 * concurrent-edit conflict is indistinguishable from any other effect failure
 * and a client cannot implement retry-on-conflict. Both API error translators
 * already map VERSION_CONFLICT to `conflict` — that mapping is only reachable
 * if the code survives.
 */

import { describe, it, expect } from 'vitest';

import { MemoryStorageProvider } from '@altius/storage-memory';
import type { ParsedSchema } from '@altius/odl';
import type { OntologySchema, RequestContext } from '@altius/spi';

import { parseActionManifest } from '../../parser/index.js';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext, CelEvaluator, SecurityLayer } from '../types.js';

const REQ_CTX: RequestContext = {
  tenantId: 'nhs-trust-01',
  actorId: 'dr-smith',
  traceId: 'trace-conflict',
};

const ACTOR: ActionActor = { id: 'dr-smith', type: 'user', roles: ['clinician'] };
const ACTION_CTX: ActionContext = { requestContext: REQ_CTX };

const SCHEMA: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Doc',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'status', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
  ],
  linkTypes: [],
  actionTypes: [
    {
      kind: 'actionType',
      name: 'TouchDoc',
      fields: [
        { name: 'doc', type: { name: 'Doc', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [{ kind: 'actionType' }],
    },
  ],
  functionTypes: [],
  enums: [],
  interfaces: [],
  scalars: [],
};

const SPI_SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [{ name: 'Doc', properties: [{ name: 'status', type: 'String' }] }],
  linkTypes: [],
};

const TOUCH_DOC_YAML = `
action: TouchDoc
version: 1

effects:
  - type: updateObject
    target: "doc"
    set:
      status: "TOUCHED"
`;

const allowAll: SecurityLayer = { async checkPermission() { return { allowed: true }; } };
const noCel: CelEvaluator = { async evaluate() { return { value: true }; } };

describe('storage-raised VERSION_CONFLICT crossing the transaction boundary', () => {
  it('reaches the caller as VERSION_CONFLICT, not EFFECT_EXECUTION_ERROR', async () => {
    const storage = new MemoryStorageProvider();
    await storage.applySchema(REQ_CTX, SPI_SCHEMA);
    const doc = await storage.createObject(REQ_CTX, 'Doc', { status: 'NEW' });

    // Race a competing commit into the window between the executor loading its
    // context (which fixes expectedVersion) and opening its transaction.
    let raced = false;
    const racingStorage = new Proxy(storage, {
      get(target, prop) {
        if (prop === 'beginTransaction') {
          return async (ctx: RequestContext) => {
            if (!raced) {
              raced = true;
              await target.updateObject(REQ_CTX, 'Doc', doc._id, { status: 'RACED' });
            }
            return target.beginTransaction(ctx);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    const executor = new ActionExecutor({
      storage: racingStorage,
      security: allowAll,
      cel: noCel,
    });

    const { manifest } = parseActionManifest(TOUCH_DOC_YAML);
    const result = await executor.execute(
      manifest!,
      { doc: doc._id },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(raced).toBe(true);
    expect(result.success).toBe(false);
    expect(result.errors[0]!.code).toBe('VERSION_CONFLICT');

    // Rollback must still have happened — the losing write must not have landed.
    const after = await storage.getObject(REQ_CTX, 'Doc', doc._id);
    expect(after!['status']).toBe('RACED');
  });
});
