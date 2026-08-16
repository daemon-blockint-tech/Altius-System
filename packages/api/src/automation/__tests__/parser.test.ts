import { describe, it, expect } from 'vitest';
import { parseAutomationManifest, parseIntervalMs } from '../parser.js';

describe('parseIntervalMs', () => {
  it('parses units', () => {
    expect(parseIntervalMs('500ms')).toBe(500);
    expect(parseIntervalMs('30s')).toBe(30_000);
    expect(parseIntervalMs('5m')).toBe(300_000);
    expect(parseIntervalMs('2h')).toBe(7_200_000);
  });
  it('rejects malformed intervals', () => {
    expect(() => parseIntervalMs('5')).toThrow();
    expect(() => parseIntervalMs('0s')).toThrow();
    expect(() => parseIntervalMs('later')).toThrow();
  });
});

describe('parseAutomationManifest', () => {
  it('parses an event automation with a condition and mixed params', () => {
    const m = parseAutomationManifest({
      name: 'CleanOnDischarge',
      trigger: { type: 'event', objectType: 'Patient', on: ['UPDATED'], condition: "object.status == 'DISCHARGED'" },
      action: { name: 'CleanBed', params: { bedId: { from: 'object.bedId' }, reason: 'auto' } },
      actor: { id: 'svc-automation', roles: ['automation'] },
    });
    expect(m.trigger).toEqual({ type: 'event', objectType: 'Patient', on: ['UPDATED'], condition: "object.status == 'DISCHARGED'" });
    expect(m.action).toEqual({ name: 'CleanBed', params: { bedId: { from: 'object.bedId' }, reason: 'auto' } });
    expect(m.actor).toEqual({ id: 'svc-automation', roles: ['automation'] });
  });

  it('defaults event "on" to all change kinds when omitted', () => {
    const m = parseAutomationManifest({
      name: 'A', trigger: { type: 'event', objectType: 'X' },
      action: { name: 'Do' }, actor: { id: 'a' },
    });
    expect(m.trigger).toMatchObject({ on: ['CREATED', 'UPDATED', 'DELETED'] });
    expect(m.action.params).toEqual({});
    expect(m.actor.roles).toEqual([]);
  });

  it('parses a schedule automation and converts the interval', () => {
    const m = parseAutomationManifest({
      name: 'Nightly', trigger: { type: 'schedule', interval: '1h' },
      action: { name: 'Sweep' }, actor: { id: 'svc' }, tenantId: 't1',
    });
    expect(m.trigger).toEqual({ type: 'schedule', intervalMs: 3_600_000 });
    expect(m.tenantId).toBe('t1');
  });

  it('rejects a schedule automation without a tenantId', () => {
    expect(() => parseAutomationManifest({
      name: 'Nightly', trigger: { type: 'schedule', interval: '1h' },
      action: { name: 'Sweep' }, actor: { id: 'svc' },
    })).toThrow(/tenantId/);
  });

  it('rejects cron (not yet supported)', () => {
    expect(() => parseAutomationManifest({
      name: 'Nightly', trigger: { type: 'schedule', cron: '0 * * * *' },
      action: { name: 'Sweep' }, actor: { id: 'svc' }, tenantId: 't1',
    })).toThrow(/cron/);
  });

  it('rejects unknown change kinds, missing action, and bad trigger type', () => {
    expect(() => parseAutomationManifest({ name: 'A', trigger: { type: 'event', objectType: 'X', on: ['NOPE'] }, action: { name: 'D' }, actor: { id: 'a' } })).toThrow();
    expect(() => parseAutomationManifest({ name: 'A', trigger: { type: 'event', objectType: 'X' }, action: {}, actor: { id: 'a' } })).toThrow();
    expect(() => parseAutomationManifest({ name: 'A', trigger: { type: 'nope' }, action: { name: 'D' }, actor: { id: 'a' } })).toThrow();
  });
});
