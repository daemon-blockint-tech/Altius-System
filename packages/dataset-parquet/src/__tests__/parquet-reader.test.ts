/**
 * Fixtures are written with a real Parquet writer, so the reader is proven
 * against the format rather than against a mock of it.
 */

import { describe, it, expect } from 'vitest';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { readParquetPage, inferDatasetSchema, rowCount } from '../parquet-reader.js';

/** A shipment extract of the shape a customer's lake would hold. */
function shipmentsFile(rows = 5): ArrayBuffer {
  const ids = Array.from({ length: rows }, (_, i) => `SHP-${String(i + 1).padStart(3, '0')}`);
  return parquetWriteBuffer({
    columnData: [
      { name: 'shipment_id', data: ids, type: 'STRING' },
      { name: 'pallets', data: ids.map((_, i) => BigInt(i * 10)), type: 'INT64' },
      { name: 'weight_kg', data: ids.map((_, i) => i + 0.5), type: 'DOUBLE' },
      { name: 'delivered', data: ids.map((_, i) => i % 2 === 0), type: 'BOOLEAN' },
    ],
  });
}

describe('inferDatasetSchema', () => {
  it('maps parquet types onto the platform column types', () => {
    const schema = inferDatasetSchema(shipmentsFile());
    expect(schema.columns).toEqual([
      { name: 'shipment_id', type: 'string', nullable: true },
      { name: 'pallets', type: 'integer', nullable: true },
      { name: 'weight_kg', type: 'double', nullable: true },
      { name: 'delivered', type: 'boolean', nullable: true },
    ]);
  });

  it('reads the row count from the footer without scanning', () => {
    expect(rowCount(shipmentsFile(1200))).toBe(1200);
  });
});

describe('readParquetPage', () => {
  it('reads the file in place', async () => {
    const page = await readParquetPage(shipmentsFile(3));
    expect(page.total).toBe(3);
    expect(page.rows).toHaveLength(3);
    expect(page.rows[0]).toMatchObject({ shipment_id: 'SHP-001', pallets: 0, delivered: true });
  });

  it('pages with offset and limit', async () => {
    const file = shipmentsFile(10);
    const page = await readParquetPage(file, { offset: 4, limit: 3 });
    expect(page.rows.map(r => r['shipment_id'])).toEqual(['SHP-005', 'SHP-006', 'SHP-007']);
    expect(page.total).toBe(10);
  });

  it('clamps a page that runs past the end, and returns nothing past it', async () => {
    const file = shipmentsFile(5);
    expect((await readParquetPage(file, { offset: 3, limit: 99 })).rows).toHaveLength(2);
    expect((await readParquetPage(file, { offset: 50, limit: 10 })).rows).toEqual([]);
  });

  it('projects the requested columns only', async () => {
    const page = await readParquetPage(shipmentsFile(2), { columns: ['shipment_id', 'pallets'] });
    expect(Object.keys(page.rows[0]!).sort()).toEqual(['pallets', 'shipment_id']);
  });

  it('rejects a column the file does not have instead of returning short rows', async () => {
    await expect(readParquetPage(shipmentsFile(2), { columns: ['shipment_id', 'nope'] }))
      .rejects.toThrow(/no column\(s\): nope/);
  });

  it('keeps int64 JSON-safe without rounding away precision', async () => {
    const file = parquetWriteBuffer({
      columnData: [{
        name: 'account',
        // Inside the safe range, and past it — a 19-digit account id is exactly
        // the value that silently becomes a different number.
        data: [42n, 9007199254740993n],
        type: 'INT64',
      }],
    });

    const page = await readParquetPage(file);
    expect(page.rows[0]!['account']).toBe(42);
    expect(page.rows[1]!['account']).toBe('9007199254740993');
    expect(() => JSON.stringify(page.rows)).not.toThrow();
  });

  it('fails clearly on something that is not a parquet file', async () => {
    const notParquet = new TextEncoder().encode('id,qty\n1,2\n').buffer;
    await expect(readParquetPage(notParquet as ArrayBuffer)).rejects.toThrow();
  });
});
