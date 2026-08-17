/**
 * Tests for @timeSeries directive in ODL.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl, validateSchema, generateGraphQLSchema } from '../index.js';

const TS_ODL = `
extend schema @namespace(name: "test.ts", version: "0.1.0")

interface Identifiable { id: ID! }

type Sensor implements Identifiable @objectType {
  id: ID! @primary
  name: String!
  temperature: Float @timeSeries
  pressure: Float @timeSeries(retention: "30d", defaultBucket: "1h")
  status: String @timeSeries
}
`;

describe('TimeSeries directive', () => {
  const schema = parseOdl(TS_ODL);

  it('parses @timeSeries directive', () => {
    const sensor = schema.objectTypes.find(t => t.name === 'Sensor')!;
    const temp = sensor.fields.find(f => f.name === 'temperature')!;
    const ts = temp.directives.find(d => d.kind === 'timeSeries');
    expect(ts).toBeDefined();
    expect(ts!.kind).toBe('timeSeries');
  });

  it('parses @timeSeries with retention and defaultBucket', () => {
    const sensor = schema.objectTypes.find(t => t.name === 'Sensor')!;
    const pressure = sensor.fields.find(f => f.name === 'pressure')!;
    const ts = pressure.directives.find(d => d.kind === 'timeSeries');
    if (ts?.kind === 'timeSeries') {
      expect(ts.retention).toBe('30d');
      expect(ts.defaultBucket).toBe('1h');
    }
  });

  it('passes validation', () => {
    const result = validateSchema(schema);
    const errors = result.errors.filter(e => e.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('generates GraphQL with the field as a scalar (latest value)', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('temperature: Float');
    expect(sdl).toContain('pressure: Float');
  });

  it('rejects @timeSeries on Boolean type', () => {
    const bad = parseOdl(`
extend schema @namespace(name: "test.bad", version: "0.1.0")
interface Identifiable { id: ID! }
type Bad implements Identifiable @objectType {
  id: ID! @primary
  flag: Boolean @timeSeries
}
`);
    const result = validateSchema(bad);
    const errors = result.errors.filter(e => e.code === 'TIMESERIES_INVALID_TYPE');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects @timeSeries combined with @primary', () => {
    const bad = parseOdl(`
extend schema @namespace(name: "test.bad", version: "0.1.0")
type Bad @objectType {
  id: ID! @primary @timeSeries
  name: String!
}
`);
    const result = validateSchema(bad);
    const errors = result.errors.filter(e => e.code === 'TIMESERIES_CONFLICT');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects @timeSeries combined with @computed', () => {
    const bad = parseOdl(`
extend schema @namespace(name: "test.bad", version: "0.1.0")
interface Identifiable { id: ID! }
type Bad implements Identifiable @objectType {
  id: ID! @primary
  temp: Float @timeSeries @computed(fn: "sumLinks", args: { linkType: "X" })
}
`);
    const result = validateSchema(bad);
    const errors = result.errors.filter(e => e.code === 'TIMESERIES_CONFLICT');
    expect(errors.length).toBeGreaterThan(0);
  });
});
