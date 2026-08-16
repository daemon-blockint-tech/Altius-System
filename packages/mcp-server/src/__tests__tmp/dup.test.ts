import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { buildToolList } from '../src/tools.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")
type Ward @objectType { id: ID! @primary }
type ScoreRisk @function(runtime: "node", entry: "score.js", requiredRoles: "analyst") {
  wardId: String! @param
}
`);

describe('dup check', () => {
  it('does not duplicate function tools', () => {
    const tools = buildToolList({ schema, functionInvoker: { invoke: vi.fn() } } as any);
    const names = tools.map(t => t.name);
    const count = names.filter(n => n === 'function_ScoreRisk').length;
    console.log('names:', names);
    expect(count).toBe(1);
  });
});
