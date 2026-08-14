/**
 * Tests for the default connector registry (T6).
 *
 * Verifies that createDefaultRegistry() registers jdbc, rest, and kafka-cdc.
 */

import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from './default-registry.js';

describe('createDefaultRegistry', () => {
  it('registers jdbc, rest, and kafka-cdc plugins', () => {
    const registry = createDefaultRegistry();
    const names = registry.list();
    expect(names).toContain('jdbc');
    expect(names).toContain('rest');
    expect(names).toContain('kafka-cdc');
  });

  it('can create a kafka-cdc connector', () => {
    const registry = createDefaultRegistry();
    const connector = registry.create('kafka-cdc', {
      url: 'localhost:9092',
      table: 'patients',
      properties: { brokers: 'localhost:9092', topic: 'dbserver.public.patients', groupId: 'test' },
    });
    expect(connector.name).toBe('kafka-cdc');
    expect(connector.version).toBe('0.1.0');
  });
});
