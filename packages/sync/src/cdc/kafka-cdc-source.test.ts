/**
 * Tests for KafkaCdcSource (T6).
 *
 * Validates Debezium envelope unwrapping (op c/u/d/r → INSERT/UPDATE/DELETE),
 * key parsing, and checkpoint extraction. Uses a stub that exercises the
 * unwrapMessage method directly without a real Kafka connection.
 */

import { describe, it, expect } from 'vitest';
import { KafkaCdcSource } from './kafka-cdc-source.js';

// We test unwrapMessage directly to avoid needing a real Kafka broker.
// The source is constructed with dummy broker config; start() is never called.
function makeSource(): KafkaCdcSource {
  return new KafkaCdcSource({
    brokers: 'localhost:9092',
    topic: 'dbserver.public.patients',
    groupId: 'test-group',
  });
}

function makeMessage(value: unknown, key?: unknown, partition = 0, offset = '42'): {
  value: Buffer | null;
  key: Buffer | null;
  partition: number;
  offset: string;
} {
  return {
    value: value ? Buffer.from(JSON.stringify(value)) : null,
    key: key ? Buffer.from(typeof key === 'string' ? key : JSON.stringify(key)) : null,
    partition,
    offset,
  };
}

describe('KafkaCdcSource.unwrapMessage', () => {
  const source = makeSource();

  it('unwraps op=c (create) as INSERT with after payload', () => {
    const msg = makeMessage(
      { before: null, after: { id: 1, name: 'Alice' }, op: 'c', ts_ms: 1700000000000, source: { table: 'patients' } },
      { id: 1 },
    );
    const record = source.unwrapMessage(msg as never, 0);
    expect(record).not.toBeNull();
    expect(record!.operation).toBe('INSERT');
    expect(record!.data).toEqual({ id: 1, name: 'Alice' });
    expect(record!.table).toBe('patients');
    expect(record!.timestamp).toBe('2023-11-14T22:13:20.000Z');
  });

  it('unwraps op=u (update) as UPDATE with after payload', () => {
    const msg = makeMessage(
      { before: { id: 1, name: 'Alice' }, after: { id: 1, name: 'Alice Updated' }, op: 'u', ts_ms: 1700000000000 },
      { id: 1 },
    );
    const record = source.unwrapMessage(msg as never, 0);
    expect(record!.operation).toBe('UPDATE');
    expect(record!.data).toEqual({ id: 1, name: 'Alice Updated' });
  });

  it('unwraps op=d (delete) as DELETE with before payload', () => {
    const msg = makeMessage(
      { before: { id: 1, name: 'Alice' }, after: null, op: 'd', ts_ms: 1700000000000 },
      { id: 1 },
    );
    const record = source.unwrapMessage(msg as never, 0);
    expect(record!.operation).toBe('DELETE');
    expect(record!.data).toEqual({ id: 1, name: 'Alice' });
  });

  it('unwraps op=r (snapshot read) as INSERT', () => {
    const msg = makeMessage(
      { before: null, after: { id: 2, name: 'Bob' }, op: 'r', ts_ms: 1700000000000 },
      { id: 2 },
    );
    const record = source.unwrapMessage(msg as never, 0);
    expect(record!.operation).toBe('INSERT');
    expect(record!.data).toEqual({ id: 2, name: 'Bob' });
  });

  it('extracts Kafka offset as checkpoint', () => {
    const msg = makeMessage(
      { before: null, after: { id: 1 }, op: 'c' },
      { id: 1 },
      3,
      '12345',
    );
    const record = source.unwrapMessage(msg as never, 3);
    expect(record!.checkpoint).toEqual({ topic: 'dbserver.public.patients', partition: 3, offset: '12345' });
  });

  it('parses Debezium key wrapped in payload', () => {
    const msg = makeMessage(
      { before: null, after: { id: 1, name: 'Alice' }, op: 'c' },
      { payload: { id: 1 } },
    );
    const record = source.unwrapMessage(msg as never, 0);
    expect(record!.key).toEqual({ id: 1 });
  });

  it('parses plain string key as { id: "..." }', () => {
    const msg = makeMessage(
      { before: null, after: { id: 1, name: 'Alice' }, op: 'c' },
      'abc-123',
    );
    const record = source.unwrapMessage(msg as never, 0);
    expect(record!.key).toEqual({ id: 'abc-123' });
  });

  it('returns null for tombstone (null value)', () => {
    const msg = makeMessage(null, { id: 1 });
    const record = source.unwrapMessage(msg as never, 0);
    expect(record).toBeNull();
  });

  it('returns null for unparseable JSON', () => {
    const msg = {
      value: Buffer.from('not json'),
      key: null,
      partition: 0,
      offset: '0',
    };
    const record = source.unwrapMessage(msg as never, 0);
    expect(record).toBeNull();
  });

  it('returns null for unknown op code', () => {
    const msg = makeMessage(
      { before: null, after: { id: 1 }, op: 'z' },
      { id: 1 },
    );
    const record = source.unwrapMessage(msg as never, 0);
    expect(record).toBeNull();
  });

  it('defaults table name from topic suffix when source.table is absent', () => {
    const msg = makeMessage(
      { before: null, after: { id: 1 }, op: 'c' },
      { id: 1 },
    );
    const record = source.unwrapMessage(msg as never, 0);
    expect(record!.table).toBe('patients');
  });
});
