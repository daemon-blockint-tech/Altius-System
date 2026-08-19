/**
 * Tests for the in-memory business rules engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBusinessRulesService } from '../in-memory-business-rules.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

describe('InMemoryBusinessRulesService', () => {
  let service: InMemoryBusinessRulesService;

  beforeEach(() => {
    service = new InMemoryBusinessRulesService();
  });

  it('creates a rule', async () => {
    const rule = await service.create(CTX, {
      name: 'high-value-orders',
      description: 'Filter orders > 1000',
      nodes: [
        { type: 'source', name: 'orders', inputs: [], source: { targetType: 'Order' } },
        { type: 'filter', name: 'high-value', inputs: [], filter: [{ field: 'amount', operator: 'gt', value: 1000 }] },
      ],
    });
    expect(rule.id).toBeTruthy();
    expect(rule.state).toBe('draft');
    expect(rule.nodes).toHaveLength(2);
  });

  it('executes a filter rule', async () => {
    const rule = await service.create(CTX, {
      name: 'filter-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'Order' } },
        { type: 'filter', name: 'f', inputs: [], filter: [{ field: 'amount', operator: 'gt', value: 500 }] },
      ],
    });
    // Wire the filter input to the source node
    const sourceId = rule.nodes[0]!.id;
    await service.update(CTX, rule.id, {
      name: 'filter-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'Order' } },
        { type: 'filter', name: 'f', inputs: [sourceId], filter: [{ field: 'amount', operator: 'gt', value: 500 }] },
      ],
    });
    const data = new Map([['Order', [
      { id: 1, amount: 100 },
      { id: 2, amount: 600 },
      { id: 3, amount: 1000 },
    ]]]);
    const result = await service.execute(CTX, rule.id, data);
    expect(result.success).toBe(true);
    expect(result.outputRows).toHaveLength(2);
  });

  it('executes a select rule', async () => {
    const rule = await service.create(CTX, {
      name: 'select-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        { type: 'select', name: 'proj', inputs: [], select: ['id', 'name'] },
      ],
    });
    const sourceId = rule.nodes[0]!.id;
    await service.update(CTX, rule.id, {
      name: 'select-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        { type: 'select', name: 'proj', inputs: [sourceId], select: ['id', 'name'] },
      ],
    });
    const data = new Map([['T', [{ id: 1, name: 'A', extra: 'x' }, { id: 2, name: 'B', extra: 'y' }]]]);
    const result = await service.execute(CTX, rule.id, data);
    expect(result.outputRows).toHaveLength(2);
    expect(result.outputRows[0]).toEqual({ id: 1, name: 'A' });
  });

  it('executes an expression rule (arithmetic)', async () => {
    const rule = await service.create(CTX, {
      name: 'expr-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        {
          type: 'expression', name: 'total', inputs: [],
          expression: {
            outputField: 'total',
            exprType: 'arithmetic',
            operation: 'add',
            operands: [{ field: 'price' }, { field: 'tax' }],
          },
        },
      ],
    });
    const sourceId = rule.nodes[0]!.id;
    await service.update(CTX, rule.id, {
      name: 'expr-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        {
          type: 'expression', name: 'total', inputs: [sourceId],
          expression: {
            outputField: 'total',
            exprType: 'arithmetic',
            operation: 'add',
            operands: [{ field: 'price' }, { field: 'tax' }],
          },
        },
      ],
    });
    const data = new Map([['T', [{ price: 100, tax: 20 }, { price: 50, tax: 5 }]]]);
    const result = await service.execute(CTX, rule.id, data);
    expect(result.outputRows[0]!.total).toBe(120);
    expect(result.outputRows[1]!.total).toBe(55);
  });

  it('executes an aggregate rule', async () => {
    const rule = await service.create(CTX, {
      name: 'agg-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        {
          type: 'aggregate', name: 'agg', inputs: [],
          aggregate: {
            groupBy: ['category'],
            measures: [
              { field: 'amount', function: 'sum', outputField: 'total' },
              { field: 'id', function: 'count', outputField: 'count' },
            ],
          },
        },
      ],
    });
    const sourceId = rule.nodes[0]!.id;
    await service.update(CTX, rule.id, {
      name: 'agg-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        {
          type: 'aggregate', name: 'agg', inputs: [sourceId],
          aggregate: {
            groupBy: ['category'],
            measures: [
              { field: 'amount', function: 'sum', outputField: 'total' },
              { field: 'id', function: 'count', outputField: 'count' },
            ],
          },
        },
      ],
    });
    const data = new Map([['T', [
      { id: 1, category: 'A', amount: 100 },
      { id: 2, category: 'A', amount: 200 },
      { id: 3, category: 'B', amount: 50 },
    ]]]);
    const result = await service.execute(CTX, rule.id, data);
    expect(result.outputRows).toHaveLength(2);
    const catA = result.outputRows.find(r => r.category === 'A');
    expect(catA?.total).toBe(300);
    expect(catA?.count).toBe(2);
  });

  it('executes a sort rule', async () => {
    const rule = await service.create(CTX, {
      name: 'sort-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        { type: 'sort', name: 'sort', inputs: [], sort: { field: 'value', direction: 'desc' } },
      ],
    });
    const sourceId = rule.nodes[0]!.id;
    await service.update(CTX, rule.id, {
      name: 'sort-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        { type: 'sort', name: 'sort', inputs: [sourceId], sort: { field: 'value', direction: 'desc' } },
      ],
    });
    const data = new Map([['T', [{ value: 3 }, { value: 1 }, { value: 2 }]]]);
    const result = await service.execute(CTX, rule.id, data);
    expect(result.outputRows.map(r => r.value)).toEqual([3, 2, 1]);
  });

  it('executes a limit rule', async () => {
    const rule = await service.create(CTX, {
      name: 'limit-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        { type: 'limit', name: 'lim', inputs: [], limit: 2 },
      ],
    });
    const sourceId = rule.nodes[0]!.id;
    await service.update(CTX, rule.id, {
      name: 'limit-test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        { type: 'limit', name: 'lim', inputs: [sourceId], limit: 2 },
      ],
    });
    const data = new Map([['T', [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]]]);
    const result = await service.execute(CTX, rule.id, data);
    expect(result.outputRows).toHaveLength(2);
  });

  it('executes a join rule', async () => {
    const rule = await service.create(CTX, {
      name: 'join-test', description: '',
      nodes: [
        { type: 'source', name: 'orders', inputs: [], source: { targetType: 'Order' } },
        { type: 'source', name: 'customers', inputs: [], source: { targetType: 'Customer' } },
        {
          type: 'join', name: 'join', inputs: [],
          join: {
            leftSourceId: '', rightSourceId: '',
            joinType: 'inner', leftKey: 'customerId', rightKey: 'id',
          },
        },
      ],
    });
    const orderSrcId = rule.nodes[0]!.id;
    const custSrcId = rule.nodes[1]!.id;
    await service.update(CTX, rule.id, {
      name: 'join-test', description: '',
      nodes: [
        { type: 'source', name: 'orders', inputs: [], source: { targetType: 'Order' } },
        { type: 'source', name: 'customers', inputs: [], source: { targetType: 'Customer' } },
        {
          type: 'join', name: 'join', inputs: [orderSrcId, custSrcId],
          join: {
            leftSourceId: orderSrcId, rightSourceId: custSrcId,
            joinType: 'inner', leftKey: 'customerId', rightKey: 'id',
          },
        },
      ],
    });
    const data = new Map([
      ['Order', [{ id: 1, customerId: 10 }, { id: 2, customerId: 20 }]],
      ['Customer', [{ id: 10, name: 'Alice' }, { id: 20, name: 'Bob' }]],
    ]);
    const result = await service.execute(CTX, rule.id, data);
    expect(result.success).toBe(true);
    expect(result.outputRows).toHaveLength(2);
    expect(result.outputRows[0]!.name).toBe('Alice');
  });

  it('executes a union rule', async () => {
    const rule = await service.create(CTX, {
      name: 'union-test', description: '',
      nodes: [
        { type: 'source', name: 'a', inputs: [], source: { targetType: 'A' } },
        { type: 'source', name: 'b', inputs: [], source: { targetType: 'B' } },
        {
          type: 'union', name: 'u', inputs: [],
          union: { sourceIds: [] },
        },
      ],
    });
    const aId = rule.nodes[0]!.id;
    const bId = rule.nodes[1]!.id;
    await service.update(CTX, rule.id, {
      name: 'union-test', description: '',
      nodes: [
        { type: 'source', name: 'a', inputs: [], source: { targetType: 'A' } },
        { type: 'source', name: 'b', inputs: [], source: { targetType: 'B' } },
        {
          type: 'union', name: 'u', inputs: [aId, bId],
          union: { sourceIds: [aId, bId] },
        },
      ],
    });
    const data = new Map([
      ['A', [{ id: 1, val: 'a' }]],
      ['B', [{ id: 2, val: 'b' }]],
    ]);
    const result = await service.execute(CTX, rule.id, data);
    expect(result.outputRows).toHaveLength(2);
  });

  it('transitions through approval workflow', async () => {
    const rule = await service.create(CTX, { name: 'test', description: '', nodes: [] });
    const proposed = await service.submitForApproval(CTX, rule.id);
    expect(proposed.state).toBe('proposed');
    const approved = await service.approve(CTX, rule.id, 'reviewer', 'Good');
    expect(approved.state).toBe('approved');
    expect(approved.reviewedBy).toBe('reviewer');
    const active = await service.activate(CTX, rule.id);
    expect(active.state).toBe('active');
    const inactive = await service.deactivate(CTX, rule.id);
    expect(inactive.state).toBe('inactive');
  });

  it('rejects a rule', async () => {
    const rule = await service.create(CTX, { name: 'test', description: '', nodes: [] });
    await service.submitForApproval(CTX, rule.id);
    const rejected = await service.reject(CTX, rule.id, 'reviewer', 'Bad');
    expect(rejected.state).toBe('rejected');
  });

  it('validates rule DAG', async () => {
    const rule = await service.create(CTX, {
      name: 'test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        { type: 'filter', name: 'f', inputs: [], filter: [] },
      ],
    });
    const sourceId = rule.nodes[0]!.id;
    await service.update(CTX, rule.id, {
      name: 'test', description: '',
      nodes: [
        { type: 'source', name: 'src', inputs: [], source: { targetType: 'T' } },
        { type: 'filter', name: 'f', inputs: [sourceId], filter: [] },
      ],
    });
    const validation = await service.validate(CTX, rule.id);
    expect(validation.valid).toBe(true);
  });

  it('lists rules by state', async () => {
    await service.create(CTX, { name: 'r1', description: '', nodes: [] });
    const r2 = await service.create(CTX, { name: 'r2', description: '', nodes: [] });
    await service.submitForApproval(CTX, r2.id);
    const drafts = await service.list(CTX, 'draft');
    expect(drafts).toHaveLength(1);
    const proposed = await service.list(CTX, 'proposed');
    expect(proposed).toHaveLength(1);
  });

  it('deletes a rule', async () => {
    const rule = await service.create(CTX, { name: 'test', description: '', nodes: [] });
    await service.delete(CTX, rule.id);
    const fetched = await service.get(CTX, rule.id);
    expect(fetched).toBeNull();
  });

  it('isolates tenants', async () => {
    await service.create(CTX, { name: 't1', description: '', nodes: [] });
    const t2 = await service.list({ tenantId: 't2' } as RequestContext);
    expect(t2).toHaveLength(0);
  });
});
