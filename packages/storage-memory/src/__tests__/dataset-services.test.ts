/**
 * Tests for batch transforms, projections, metadata, SQL, SDK, and variable transforms.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDatasetService } from '../in-memory-datasets.js';
import {
  InMemoryBatchTransformService,
  InMemoryDatasetProjectionService,
  InMemoryDatasetMetadataService,
  InMemorySqlQueryService,
  InMemoryTabularSdk,
  InMemoryVariableTransformService,
} from '../in-memory-dataset-services.js';
import type { DatasetSchema, RequestContext, TransformExecutor } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

const SCHEMA: DatasetSchema = {
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'name', type: 'string', nullable: false },
    { name: 'age', type: 'integer', nullable: true },
  ],
  primaryKey: ['id'],
  version: 1,
};

async function seed(ds: InMemoryDatasetService) {
  await ds.create(CTX, { name: 'patients', schema: SCHEMA });
  await ds.insert(CTX, 'patients', {
    rows: [
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: 25 },
      { id: 3, name: 'Charlie', age: 35 },
    ],
  });
}

// ===========================================================================
// Batch transforms
// ===========================================================================

describe('InMemoryBatchTransformService', () => {
  let ds: InMemoryDatasetService;
  let service: InMemoryBatchTransformService;

  beforeEach(() => {
    ds = new InMemoryDatasetService();
    service = new InMemoryBatchTransformService(ds);
  });

  it('creates and retrieves a transform', async () => {
    await seed(ds);
    await ds.create(CTX, { name: 'output', schema: SCHEMA });
    const t = await service.create(CTX, {
      name: 'transform1', inputs: ['patients'], output: 'output',
      kind: 'map', source: 'return row;',
    });
    expect(t.name).toBe('transform1');
    const fetched = await service.get(CTX, 'transform1');
    expect(fetched?.name).toBe('transform1');
  });

  it('lists and deletes transforms', async () => {
    await seed(ds);
    await ds.create(CTX, { name: 'output', schema: SCHEMA });
    await service.create(CTX, { name: 't1', inputs: ['patients'], output: 'output', kind: 'map', source: '' });
    await service.create(CTX, { name: 't2', inputs: ['patients'], output: 'output', kind: 'map', source: '' });
    expect((await service.list(CTX))).toHaveLength(2);
    await service.delete(CTX, 't1');
    expect((await service.list(CTX))).toHaveLength(1);
  });

  it('starts and completes a build with default executor (pass-through)', async () => {
    await seed(ds);
    await ds.create(CTX, { name: 'output', schema: SCHEMA });
    await service.create(CTX, { name: 'copy', inputs: ['patients'], output: 'output', kind: 'map', source: '' });
    const build = await service.startBuild(CTX, 'copy', 'manual');
    expect(build.state).toBe('succeeded');
    expect(build.rowsRead).toBe(3);
    expect(build.rowsWritten).toBe(3);
    const output = await ds.read(CTX, 'output');
    expect(output.rows).toHaveLength(3);
  });

  it('uses a registered executor', async () => {
    await seed(ds);
    await ds.create(CTX, { name: 'output', schema: SCHEMA });
    const executor: TransformExecutor = {
      execute: (inputs) => inputs[0]!.map((r) => ({ ...r, name: (r.name as string).toUpperCase() })),
    };
    await service.create(CTX, { name: 'upper', inputs: ['patients'], output: 'output', kind: 'map', source: '' });
    await service.registerExecutor(CTX, 'upper', executor);
    const build = await service.startBuild(CTX, 'upper', 'manual');
    expect(build.state).toBe('succeeded');
    const output = await ds.read(CTX, 'output');
    expect(output.rows[0]!.name).toBe('ALICE');
  });

  it('lists builds and aborts', async () => {
    await seed(ds);
    await ds.create(CTX, { name: 'output', schema: SCHEMA });
    await service.create(CTX, { name: 'copy', inputs: ['patients'], output: 'output', kind: 'map', source: '' });
    const build = await service.startBuild(CTX, 'copy', 'manual');
    const builds = await service.listBuilds(CTX, 'copy');
    expect(builds).toHaveLength(1);
    await service.abortBuild(CTX, build.id);
    const aborted = await service.getBuild(CTX, build.id);
    expect(aborted?.state).toBe('aborted');
  });

  it('schedules transforms', async () => {
    await seed(ds);
    await ds.create(CTX, { name: 'output', schema: SCHEMA });
    await service.create(CTX, { name: 'copy', inputs: ['patients'], output: 'output', kind: 'map', source: '' });
    const { scheduleId } = await service.schedule(CTX, 'copy', '0 * * * *');
    expect(scheduleId).toBeTruthy();
    const schedules = await service.listSchedules(CTX);
    expect(schedules).toHaveLength(1);
    await service.deleteSchedule(CTX, scheduleId);
    expect((await service.listSchedules(CTX))).toHaveLength(0);
  });
});

// ===========================================================================
// Projections
// ===========================================================================

describe('InMemoryDatasetProjectionService', () => {
  let ds: InMemoryDatasetService;
  let service: InMemoryDatasetProjectionService;

  beforeEach(() => {
    ds = new InMemoryDatasetService();
    service = new InMemoryDatasetProjectionService(ds);
  });

  it('creates a filtered projection', async () => {
    await seed(ds);
    const p = await service.create(CTX, {
      name: 'adults', source: 'patients',
      filter: { age: { gte: 30 } },
      columns: ['name', 'age'],
    });
    expect(p.name).toBe('adults');
    const read = await service.read(CTX, 'adults');
    expect(read.rows).toHaveLength(2);
    expect(read.rows[0]!.name).toBe('Alice');
  });

  it('creates a join projection', async () => {
    await seed(ds);
    await ds.create(CTX, { name: 'visits', schema: {
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'patientId', type: 'integer', nullable: false },
        { name: 'diagnosis', type: 'string', nullable: true },
      ],
      primaryKey: ['id'], version: 1,
    } });
    await ds.insert(CTX, 'visits', { rows: [
      { id: 1, patientId: 1, diagnosis: 'flu' },
      { id: 2, patientId: 2, diagnosis: 'cold' },
    ] });
    const p = await service.create(CTX, {
      name: 'patientVisits', source: 'patients',
      join: { dataset: 'visits', leftKey: 'id', rightKey: 'patientId', kind: 'inner' },
    });
    expect(p.join).toBeDefined();
    const read = await service.read(CTX, 'patientVisits');
    expect(read.rows).toHaveLength(2);
    expect(read.rows[0]!.diagnosis).toBe('flu');
  });

  it('creates an aggregation projection', async () => {
    await seed(ds);
    await service.create(CTX, {
      name: 'ageStats', source: 'patients',
      aggregation: {
        groupBy: [],
        measures: [{ field: 'age', fn: 'avg' }, { field: 'age', fn: 'max' }],
      },
    });
    const read = await service.read(CTX, 'ageStats');
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]!.avg_age).toBe(30);
    expect(read.rows[0]!.max_age).toBe(35);
  });

  it('materializes and refreshes a projection', async () => {
    await seed(ds);
    await service.create(CTX, { name: 'all', source: 'patients', materialized: true });
    const p = await service.get(CTX, 'all');
    expect(p?.materialized).toBe(true);
    expect(p?.rowCount).toBe(3);
    // Add more rows and refresh
    await ds.insert(CTX, 'patients', { rows: [{ id: 4, name: 'Dave', age: 40 }] });
    await service.refresh(CTX, 'all');
    const updated = await service.get(CTX, 'all');
    expect(updated?.rowCount).toBe(4);
  });

  it('lists, updates, and deletes projections', async () => {
    await seed(ds);
    await service.create(CTX, { name: 'p1', source: 'patients' });
    await service.create(CTX, { name: 'p2', source: 'patients' });
    expect((await service.list(CTX))).toHaveLength(2);
    await service.update(CTX, 'p1', { description: 'updated' });
    expect((await service.get(CTX, 'p1'))?.description).toBe('updated');
    await service.delete(CTX, 'p1');
    expect((await service.list(CTX))).toHaveLength(1);
  });
});

// ===========================================================================
// Dataset metadata
// ===========================================================================

describe('InMemoryDatasetMetadataService', () => {
  let ds: InMemoryDatasetService;
  let service: InMemoryDatasetMetadataService;

  beforeEach(() => {
    ds = new InMemoryDatasetService();
    service = new InMemoryDatasetMetadataService(ds);
  });

  it('lists and gets metadata', async () => {
    await seed(ds);
    const list = await service.list(CTX);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('patients');
    expect(list[0]!.rowCount).toBe(3);
    const meta = await service.get(CTX, 'patients');
    expect(meta?.schema.columns).toHaveLength(3);
  });

  it('retrieves schema', async () => {
    await seed(ds);
    const schema = await service.getSchema(CTX, 'patients');
    expect(schema?.columns).toHaveLength(3);
    expect(schema?.version).toBe(1);
  });

  it('lists branches', async () => {
    await seed(ds);
    await ds.createBranch(CTX, 'patients', 'dev');
    const branches = await service.listBranches(CTX, 'patients');
    expect(branches).toHaveLength(2);
    expect(branches).toContain('main');
    expect(branches).toContain('dev');
  });

  it('lists transactions', async () => {
    await seed(ds);
    const txs = await service.listTransactions(CTX, 'patients');
    expect(txs).toHaveLength(1);
    expect(txs[0]!.type).toBe('insert');
  });
});

// ===========================================================================
// SQL query service
// ===========================================================================

describe('InMemorySqlQueryService', () => {
  let ds: InMemoryDatasetService;
  let service: InMemorySqlQueryService;

  beforeEach(() => {
    ds = new InMemoryDatasetService();
    service = new InMemorySqlQueryService(ds);
  });

  it('executes a SELECT * query', async () => {
    await seed(ds);
    const job = await service.submit(CTX, { sql: 'SELECT * FROM patients' });
    expect(job.state).toBe('succeeded');
    expect(job.rows).toHaveLength(3);
    expect(job.rowCount).toBe(3);
  });

  it('executes a SELECT with columns', async () => {
    await seed(ds);
    const job = await service.submit(CTX, { sql: 'SELECT name, age FROM patients' });
    expect(job.state).toBe('succeeded');
    expect(job.rows![0]!.name).toBe('Alice');
    expect(job.rows![0]!.id).toBeUndefined();
  });

  it('executes a WHERE clause', async () => {
    await seed(ds);
    const job = await service.submit(CTX, { sql: 'SELECT * FROM patients WHERE age >= 30' });
    expect(job.rows).toHaveLength(2);
  });

  it('executes ORDER BY and LIMIT', async () => {
    await seed(ds);
    const job = await service.submit(CTX, { sql: 'SELECT * FROM patients ORDER BY name ASC LIMIT 2' });
    expect(job.rows).toHaveLength(2);
    expect(job.rows![0]!.name).toBe('Alice');
    expect(job.rows![1]!.name).toBe('Bob');
  });

  it('executes a JOIN', async () => {
    await seed(ds);
    await ds.create(CTX, { name: 'visits', schema: {
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'patientId', type: 'integer', nullable: false },
        { name: 'diagnosis', type: 'string', nullable: true },
      ],
      primaryKey: ['id'], version: 1,
    } });
    await ds.insert(CTX, 'visits', { rows: [
      { id: 1, patientId: 1, diagnosis: 'flu' },
    ] });
    const job = await service.submit(CTX, { sql: 'SELECT * FROM patients INNER JOIN visits ON patients.id = visits.patientId' });
    expect(job.state).toBe('succeeded');
    expect(job.rows).toHaveLength(1);
    expect(job.rows![0]!.diagnosis).toBe('flu');
  });

  it('lists and cancels jobs', async () => {
    await seed(ds);
    const job = await service.submit(CTX, { sql: 'SELECT * FROM patients' });
    const list = await service.list(CTX);
    expect(list).toHaveLength(1);
    // Cancel a succeeded job (no-op)
    await service.cancel(CTX, job.id);
    const results = await service.results(CTX, job.id);
    expect(results).toHaveLength(3);
  });

  it('fails on unsupported SQL', async () => {
    await seed(ds);
    const job = await service.submit(CTX, { sql: 'DELETE FROM patients' });
    expect(job.state).toBe('failed');
    expect(job.errorMessage).toBeTruthy();
  });
});

// ===========================================================================
// Tabular SDK
// ===========================================================================

describe('InMemoryTabularSdk', () => {
  let ds: InMemoryDatasetService;
  let sdk: InMemoryTabularSdk;

  beforeEach(() => {
    ds = new InMemoryDatasetService();
    sdk = new InMemoryTabularSdk(ds);
  });

  it('reads with fluent builder (select, where, orderBy, limit)', async () => {
    await seed(ds);
    const result = await sdk.read(CTX, 'patients')
      .select('name', 'age')
      .where('age', 'gte', 30)
      .orderBy('name', 'asc')
      .limit(10)
      .execute();
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.name).toBe('Alice');
    expect(result.rows[0]!.id).toBeUndefined();
  });

  it('writes with fluent builder (addRow, upsert, message)', async () => {
    await ds.create(CTX, { name: 'patients', schema: SCHEMA });
    const result = await sdk.write(CTX, 'patients')
      .addRow({ id: 1, name: 'Alice', age: 30 })
      .addRows([{ id: 2, name: 'Bob', age: 25 }])
      .upsert(true)
      .message('test write')
      .execute();
    expect(result.rowsWritten).toBe(2);
  });

  it('uploads CSV content', async () => {
    await ds.create(CTX, { name: 'patients', schema: SCHEMA });
    const csv = 'id,name,age\n1,Alice,30\n2,Bob,25';
    const result = await sdk.write(CTX, 'patients')
      .upload(csv, 'csv')
      .execute();
    expect(result.rowsWritten).toBe(2);
    const read = await ds.read(CTX, 'patients');
    expect(read.rows[0]!.name).toBe('Alice');
  });

  it('uploads NDJSON content', async () => {
    await ds.create(CTX, { name: 'patients', schema: SCHEMA });
    const ndjson = '{"id":1,"name":"Alice","age":30}\n{"id":2,"name":"Bob","age":25}';
    const result = await sdk.write(CTX, 'patients')
      .upload(ndjson, 'ndjson')
      .execute();
    expect(result.rowsWritten).toBe(2);
  });

  it('infers schema from rows', () => {
    const schema = sdk.inferSchema([
      { id: 1, name: 'Alice', active: true, ts: '2024-01-01T00:00:00Z' },
    ]);
    expect(schema.columns).toHaveLength(4);
    expect(schema.columns.find(c => c.name === 'id')?.type).toBe('integer');
    expect(schema.columns.find(c => c.name === 'name')?.type).toBe('string');
    expect(schema.columns.find(c => c.name === 'active')?.type).toBe('boolean');
    expect(schema.columns.find(c => c.name === 'ts')?.type).toBe('timestamp');
  });

  it('parses CSV and JSON', () => {
    const csv = sdk.parseCsv('a,b\n1,foo\n2,bar');
    expect(csv).toHaveLength(2);
    expect(csv[0]!.a).toBe(1);
    expect(csv[0]!.b).toBe('foo');
    const json = sdk.parseJson('[{"a":1}]', 'json');
    expect(json).toHaveLength(1);
    expect(json[0]!.a).toBe(1);
    const ndjson = sdk.parseJson('{"a":1}\n{"a":2}', 'ndjson');
    expect(ndjson).toHaveLength(2);
  });
});

// ===========================================================================
// Variable transforms
// ===========================================================================

describe('InMemoryVariableTransformService', () => {
  let service: InMemoryVariableTransformService;

  beforeEach(() => {
    service = new InMemoryVariableTransformService();
  });

  it('creates and retrieves a pipeline', async () => {
    const p = await service.create(CTX, {
      name: 'upper-trim',
      steps: [{ kind: 'upper', args: {} }, { kind: 'trim', args: {} }],
    });
    expect(p.name).toBe('upper-trim');
    const fetched = await service.get(CTX, 'upper-trim');
    expect(fetched?.steps).toHaveLength(2);
  });

  it('executes a string pipeline', async () => {
    await service.create(CTX, {
      name: 'clean',
      steps: [{ kind: 'trim', args: {} }, { kind: 'upper', args: {} }],
    });
    const result = await service.execute(CTX, 'clean', '  hello  ');
    expect(result).toBe('HELLO');
  });

  it('executes a math pipeline', async () => {
    await service.create(CTX, {
      name: 'add-round',
      steps: [
        { kind: 'add', args: { value: 0.7 } },
        { kind: 'round', args: {} },
      ],
    });
    const result = await service.execute(CTX, 'add-round', 1.3);
    expect(result).toBe(2);
  });

  it('executes a date pipeline', async () => {
    await service.create(CTX, {
      name: 'year',
      steps: [{ kind: 'extractDatePart', args: { part: 'year' } }],
    });
    const result = await service.execute(CTX, 'year', '2024-06-15T00:00:00Z');
    expect(result).toBe(2024);
  });

  it('executes array operations', async () => {
    await service.create(CTX, {
      name: 'sort-join',
      steps: [
        { kind: 'arraySort', args: { direction: 'asc' } },
        { kind: 'arrayJoin', args: { delimiter: ',' } },
      ],
    });
    const result = await service.execute(CTX, 'sort-join', [3, 1, 2]);
    expect(result).toBe('1,2,3');
  });

  it('executes object operations', async () => {
    await service.create(CTX, {
      name: 'pick',
      steps: [{ kind: 'pickFields', args: { fields: ['a', 'b'] } }],
    });
    const result = await service.execute(CTX, 'pick', { a: 1, b: 2, c: 3 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('executes conditional operations', async () => {
    await service.create(CTX, {
      name: 'coalesce',
      steps: [{ kind: 'coalesce', args: { value: 'default' } }],
    });
    expect(await service.execute(CTX, 'coalesce', null)).toBe('default');
    expect(await service.execute(CTX, 'coalesce', 'value')).toBe('value');
  });

  it('executes batch', async () => {
    await service.create(CTX, {
      name: 'upper',
      steps: [{ kind: 'upper', args: {} }],
    });
    const results = await service.executeBatch(CTX, 'upper', ['a', 'b', 'c']);
    expect(results).toEqual(['A', 'B', 'C']);
  });

  it('executes inline (no persistence)', async () => {
    const result = await service.executeInline(CTX, [
      { kind: 'trim', args: {} },
      { kind: 'upper', args: {} },
    ], '  hello  ');
    expect(result).toBe('HELLO');
  });

  it('lists, updates, and deletes pipelines', async () => {
    await service.create(CTX, { name: 'p1', steps: [] });
    await service.create(CTX, { name: 'p2', steps: [] });
    expect((await service.list(CTX))).toHaveLength(2);
    await service.update(CTX, 'p1', { description: 'updated' });
    expect((await service.get(CTX, 'p1'))?.description).toBe('updated');
    await service.delete(CTX, 'p1');
    expect((await service.list(CTX))).toHaveLength(1);
  });
});
