/**
 * SPI property types carry no canonical vocabulary — `PropertyDefinition.type`
 * is an unconstrained string, so ODL emits `Int`/`String` while a hand-written
 * SPI schema may say `integer`/`string`. An unmatched spelling silently became
 * TEXT, which is how numeric columns ended up as text and SUM/AVG failed at
 * query time on Postgres while working on the memory provider.
 */

import { describe, it, expect } from 'vitest';
import { pgType } from '../schema/type-mapping.js';

describe('pgType', () => {
  it('maps the ODL spellings', () => {
    expect(pgType('Int')).toBe('INTEGER');
    expect(pgType('Float')).toBe('DOUBLE PRECISION');
    expect(pgType('String')).toBe('TEXT');
    expect(pgType('Boolean')).toBe('BOOLEAN');
  });

  it('maps the long-form SPI spellings to the same column types', () => {
    // These are what the conformance fixtures declare.
    expect(pgType('integer')).toBe('INTEGER');
    expect(pgType('float')).toBe('DOUBLE PRECISION');
    expect(pgType('string')).toBe('TEXT');
    expect(pgType('boolean')).toBe('BOOLEAN');
  });

  it('is case-insensitive', () => {
    expect(pgType('DATETIME')).toBe('TIMESTAMPTZ');
    expect(pgType('jSoN')).toBe('JSONB');
  });

  it('never silently downgrades a numeric type to text', () => {
    // The failure this guards: any numeric spelling landing as TEXT makes
    // aggregate queries fail with "function avg(text) does not exist".
    for (const spelling of ['Int', 'int', 'integer', 'INTEGER', 'Float', 'float']) {
      expect(pgType(spelling)).not.toBe('TEXT');
    }
  });

  it('still falls back to TEXT for enums and custom scalars', () => {
    expect(pgType('PatientStatus')).toBe('TEXT');
    expect(pgType('NHSNumber')).toBe('TEXT');
  });
});
