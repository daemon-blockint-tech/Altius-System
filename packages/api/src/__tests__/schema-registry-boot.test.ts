import { describe, it, expect } from 'vitest';
import { InMemorySchemaRegistry } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import { recordSchemaVersion, BreakingSchemaChangeError } from '../schema-registry-boot.js';
import { parseSchemaBreakingPolicy } from '../config.js';

function emptySchema(): ParsedSchema {
  return { objectTypes: [], linkTypes: [], actionTypes: [], functionTypes: [], enums: [], interfaces: [], scalars: [] };
}

function objectType(name: string, fields: ParsedSchema['objectTypes'][0]['fields']): ParsedSchema['objectTypes'][0] {
  return { kind: 'objectType', name, fields, interfaces: [], directives: [{ kind: 'objectType' }] };
}

function field(name: string, typeName: string, nonNull = false): ParsedSchema['objectTypes'][0]['fields'][0] {
  return {
    name,
    type: { name: typeName, nonNull, isList: false, listElementNonNull: false },
    directives: nonNull && name === 'id' ? [{ kind: 'primary' }] : [],
  };
}

const v1 = (): ParsedSchema => ({ ...emptySchema(), objectTypes: [objectType('Patient', [field('id', 'ID', true), field('name', 'String', true)])] });
const v2additive = (): ParsedSchema => ({ ...emptySchema(), objectTypes: [objectType('Patient', [field('id', 'ID', true), field('name', 'String', true), field('notes', 'String')])] });
const v2breaking = (): ParsedSchema => ({ ...emptySchema(), objectTypes: [objectType('Patient', [field('id', 'ID', true)])] });

describe('recordSchemaVersion (boot wiring)', () => {
  it('records version 1 on an empty registry', async () => {
    const reg = new InMemorySchemaRegistry();
    const r = await recordSchemaVersion(reg, v1());
    expect(r).toMatchObject({ version: 1, recorded: true, breaking: false });
    expect(await reg.getCurrentVersion()).toBe(1);
  });

  it('is a no-op when the schema is unchanged (no version inflation across boots)', async () => {
    const reg = new InMemorySchemaRegistry();
    await recordSchemaVersion(reg, v1());
    const r = await recordSchemaVersion(reg, v1()); // simulates a restart with same packs
    expect(r).toMatchObject({ version: 1, recorded: false, breaking: false });
    expect(await reg.getCurrentVersion()).toBe(1);
  });

  it('records a new version on an additive change (not breaking)', async () => {
    const reg = new InMemorySchemaRegistry();
    await recordSchemaVersion(reg, v1());
    const r = await recordSchemaVersion(reg, v2additive());
    expect(r).toMatchObject({ version: 2, recorded: true, breaking: false });
  });

  it('records a breaking change with the breaking flag (auto-approved, not blocked)', async () => {
    const reg = new InMemorySchemaRegistry();
    await recordSchemaVersion(reg, v1());
    const r = await recordSchemaVersion(reg, v2breaking());
    expect(r.recorded).toBe(true);
    expect(r.version).toBe(2);
    expect(r.breaking).toBe(true);
  });

  it("policy 'block': throws BreakingSchemaChangeError on a breaking change and does not record", async () => {
    const reg = new InMemorySchemaRegistry();
    await recordSchemaVersion(reg, v1());
    await expect(recordSchemaVersion(reg, v2breaking(), 'block')).rejects.toThrow(BreakingSchemaChangeError);
    expect(await reg.getCurrentVersion()).toBe(1); // version NOT recorded
  });

  it("policy 'block': still records non-breaking changes", async () => {
    const reg = new InMemorySchemaRegistry();
    await recordSchemaVersion(reg, v1());
    const r = await recordSchemaVersion(reg, v2additive(), 'block');
    expect(r).toMatchObject({ version: 2, recorded: true, breaking: false });
  });

  it("policy 'block': records version 1 on an empty registry (no prior schema, nothing to break)", async () => {
    const reg = new InMemorySchemaRegistry();
    const r = await recordSchemaVersion(reg, v1(), 'block');
    expect(r).toMatchObject({ version: 1, recorded: true, breaking: false });
  });

  it("policy 'warn' (explicit): records a breaking change, same as the default", async () => {
    const reg = new InMemorySchemaRegistry();
    await recordSchemaVersion(reg, v1());
    const r = await recordSchemaVersion(reg, v2breaking(), 'warn');
    expect(r).toMatchObject({ version: 2, recorded: true, breaking: true });
  });

  it('treats type reordering as unchanged (no spurious version from pack discovery order)', async () => {
    const a = objectType('Alpha', [field('id', 'ID', true)]);
    const b = objectType('Beta', [field('id', 'ID', true)]);
    const orderAB: ParsedSchema = { ...emptySchema(), objectTypes: [a, b] };
    const orderBA: ParsedSchema = { ...emptySchema(), objectTypes: [b, a] };

    const reg = new InMemorySchemaRegistry();
    await recordSchemaVersion(reg, orderAB);
    // Same types, different discovery/merge order → must NOT mint a new version.
    const r = await recordSchemaVersion(reg, orderBA);
    expect(r).toMatchObject({ version: 1, recorded: false });
    expect(await reg.getCurrentVersion()).toBe(1);
  });
});

describe('parseSchemaBreakingPolicy (SCHEMA_BREAKING_POLICY env parsing)', () => {
  it("defaults to 'warn' when unset or blank (compose/Helm pass unset knobs as '')", () => {
    expect(parseSchemaBreakingPolicy(undefined)).toBe('warn');
    expect(parseSchemaBreakingPolicy('')).toBe('warn');
    expect(parseSchemaBreakingPolicy('  ')).toBe('warn');
  });

  it('accepts warn/block case-insensitively with surrounding whitespace', () => {
    expect(parseSchemaBreakingPolicy('warn')).toBe('warn');
    expect(parseSchemaBreakingPolicy(' BLOCK ')).toBe('block');
  });

  it('throws on unrecognized values so a misconfigured policy fails boot loudly', () => {
    expect(() => parseSchemaBreakingPolicy('strict')).toThrow(/SCHEMA_BREAKING_POLICY/);
  });
});
