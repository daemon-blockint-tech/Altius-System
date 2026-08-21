/**
 * Tests for DefaultPiiObfuscator.
 *
 * The oracle (§5): a value sourced from a field the caller cannot read is
 * masked in every message; a value the caller can see passes through; a
 * declaration with no field-permission config is fail-closed (masked); an
 * absent sensitiveValues list is a no-op; every decision is logged.
 */
import { describe, it, expect } from 'vitest';
import { DefaultPiiObfuscator } from '../pii-obfuscator.js';
import type { FieldVisibilityProvider, ChatMessage, RequestContext } from '@altius/spi';

class StubVisibility implements FieldVisibilityProvider {
  constructor(private readonly map: Map<string, Set<string>>) {}
  getVisibleFields(_userId: string, _roles: string[], objectType: string): Set<string> | undefined {
    return this.map.get(objectType);
  }
}

/** Role-aware stub: alwaysVisible + role-granted fields, mirroring AuthorizationService. */
class RoleAwareVisibility implements FieldVisibilityProvider {
  constructor(
    private readonly alwaysVisible: Map<string, Set<string>>,
    private readonly byRole: Map<string, Map<string, Set<string>>>,
  ) {}
  getVisibleFields(_userId: string, roles: string[], objectType: string): Set<string> | undefined {
    const av = this.alwaysVisible.get(objectType);
    if (!av) return undefined;
    const visible = new Set(av);
    for (const role of roles) {
      const fields = this.byRole.get(role)?.get(objectType);
      if (fields) for (const f of fields) visible.add(f);
    }
    return visible;
  }
}

const CTX: RequestContext = { tenantId: 't1', actorId: 'dr-1', actorRoles: ['clinician'] };

function userMsg(content: string): ChatMessage {
  return { role: 'user', content };
}

function visNameId(): StubVisibility {
  return new StubVisibility(new Map([['patient', new Set(['name', 'id'])]]));
}

function visIdOnly(): StubVisibility {
  return new StubVisibility(new Map([['patient', new Set(['id'])]]));
}

describe('DefaultPiiObfuscator', () => {
  it('masks a value sourced from a non-visible field', async () => {
    const obf = new DefaultPiiObfuscator({ visibility: visNameId() });
    const messages = [userMsg('Patient NIK 3201-555-1234 is admitted.')];
    const { messages: out, redactions } = await obf.obfuscate(
      CTX,
      messages,
      [{ objectType: 'patient', field: 'nik', value: '3201-555-1234' }],
      'ri.ai-models..models.test',
    );
    expect(out[0]!.content).toBe('Patient NIK [REDACTED:nik] is admitted.');
    expect(redactions).toHaveLength(1);
    expect(redactions[0]!.decision).toBe('redacted');
    expect(redactions[0]!.field).toBe('nik');
    expect(redactions[0]!.occurrences).toBe(1);
  });

  it('passes through a value sourced from a visible field', async () => {
    const obf = new DefaultPiiObfuscator({ visibility: visNameId() });
    const messages = [userMsg('Patient name John Doe is admitted.')];
    const { messages: out, redactions } = await obf.obfuscate(
      CTX,
      messages,
      [{ objectType: 'patient', field: 'name', value: 'John Doe' }],
      'ri.ai-models..models.test',
    );
    expect(out[0]!.content).toBe('Patient name John Doe is admitted.');
    expect(redactions).toHaveLength(1);
    expect(redactions[0]!.decision).toBe('allowed');
    expect(redactions[0]!.occurrences).toBe(0);
  });

  it('fail-closed: masks when no field-permission config exists for the object type', async () => {
    const vis = new StubVisibility(new Map());
    const obf = new DefaultPiiObfuscator({ visibility: vis });
    const messages = [userMsg('Account 987654321 flagged.')];
    const { messages: out, redactions } = await obf.obfuscate(
      CTX,
      messages,
      [{ objectType: 'account', field: 'accountNumber', value: '987654321' }],
      'ri.ai-models..models.test',
    );
    expect(out[0]!.content).toBe('Account [REDACTED:accountNumber] flagged.');
    expect(redactions[0]!.decision).toBe('redacted');
  });

  it('fail-closed: masks when the caller has no roles in ctx and the field is role-gated', async () => {
    // `name` is role-gated (only `clinician` sees it); alwaysVisible is just `id`.
    const vis = new RoleAwareVisibility(
      new Map([['patient', new Set(['id'])]]),
      new Map([['clinician', new Map([['patient', new Set(['name', 'nik'])]])]]),
    );
    const obf = new DefaultPiiObfuscator({ visibility: vis });
    const ctxNoRoles: RequestContext = { tenantId: 't1', actorId: 'anon' };
    const messages = [userMsg('Patient name John Doe.')];
    const { messages: out, redactions } = await obf.obfuscate(
      ctxNoRoles,
      messages,
      [{ objectType: 'patient', field: 'name', value: 'John Doe' }],
      'ri.ai-models..models.test',
    );
    expect(out[0]!.content).toBe('Patient name [REDACTED:name].');
    expect(redactions[0]!.decision).toBe('redacted');
  });

  it('no-op when sensitiveValues is absent or empty', async () => {
    const vis = new StubVisibility(new Map());
    const obf = new DefaultPiiObfuscator({ visibility: vis });
    const messages = [userMsg('hello world')];
    const { messages: out1, redactions: r1 } = await obf.obfuscate(CTX, messages, undefined, 'm');
    expect(out1[0]!.content).toBe('hello world');
    expect(r1).toEqual([]);
    const { messages: out2, redactions: r2 } = await obf.obfuscate(CTX, messages, [], 'm');
    expect(out2[0]!.content).toBe('hello world');
    expect(r2).toEqual([]);
  });

  it('masks all occurrences across all messages', async () => {
    const obf = new DefaultPiiObfuscator({ visibility: visIdOnly() });
    const messages = [
      userMsg('NIK 3201-555-1234 mentioned here.'),
      { role: 'assistant', content: 'Earlier you said NIK 3201-555-1234.' },
      userMsg('Repeat: 3201-555-1234 again.'),
    ];
    const { messages: out, redactions } = await obf.obfuscate(
      CTX,
      messages,
      [{ objectType: 'patient', field: 'nik', value: '3201-555-1234' }],
      'm',
    );
    expect(out[0]!.content).toBe('NIK [REDACTED:nik] mentioned here.');
    expect(out[1]!.content).toBe('Earlier you said NIK [REDACTED:nik].');
    expect(out[2]!.content).toBe('Repeat: [REDACTED:nik] again.');
    expect(redactions[0]!.occurrences).toBe(3);
  });

  it('does not mutate the input messages array', async () => {
    const obf = new DefaultPiiObfuscator({ visibility: visIdOnly() });
    const original = [userMsg('NIK 3201-555-1234.')];
    const originalContent = original[0]!.content;
    await obf.obfuscate(
      CTX,
      original,
      [{ objectType: 'patient', field: 'nik', value: '3201-555-1234' }],
      'm',
    );
    expect(original[0]!.content).toBe(originalContent);
  });

  it('invokes the redaction logger for each decision', async () => {
    const vis = visIdOnly();
    const logged: string[] = [];
    const obf = new DefaultPiiObfuscator({
      visibility: vis,
      onRedaction: (e) => logged.push(`${e.objectType}.${e.field}:${e.decision}`),
    });
    await obf.obfuscate(
      CTX,
      [userMsg('NIK 3201-555-1234. Patient id p-1.')],
      [
        { objectType: 'patient', field: 'nik', value: '3201-555-1234' },
        { objectType: 'patient', field: 'id', value: 'p-1' },
      ],
      'm',
    );
    expect(logged).toContain('patient.nik:redacted');
    expect(logged).toContain('patient.id:allowed');
  });
});
