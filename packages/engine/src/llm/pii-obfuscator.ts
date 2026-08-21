/**
 * Default PII obfuscator — masks @sensitive-sourced values in prompt
 * messages before they reach an LLM provider.
 *
 * Reuses the same `getVisibleFields` policy the read path enforces: a value
 * sourced from a field the caller cannot read on the read path is also
 * masked on the LLM egress path. This is the second layer for cases where a
 * function or SDK caller with elevated read access builds a prompt for a
 * downstream model call — the read path already redacts @sensitive fields
 * per the caller's role, so a value the caller can see is one they are
 * permitted to send; a value they cannot see should never have reached the
 * prompt, and this obfuscator catches the case where it did.
 *
 * Fail-closed: a declaration whose `(objectType, field)` has no
 * field-permission config, or whose caller has no roles, is treated as
 * not-visible and masked. A guard that fails open is a bug even if no test
 * catches it (§4.5).
 */
import type {
  PiiObfuscator,
  PiiRedactionEvent,
  FieldVisibilityProvider,
  SensitiveValueDeclaration,
  ChatMessage,
  RequestContext,
} from '@altius/spi';

export interface PiiObfuscatorOptions {
  /** Field-visibility lookup — usually the platform AuthorizationService. */
  visibility: FieldVisibilityProvider;
  /** Optional sink for each redaction decision (audit / metrics). */
  onRedaction?: (event: PiiRedactionEvent) => void;
}

export class DefaultPiiObfuscator implements PiiObfuscator {
  private readonly visibility: FieldVisibilityProvider;
  private readonly onRedaction?: (event: PiiRedactionEvent) => void;

  constructor(options: PiiObfuscatorOptions) {
    this.visibility = options.visibility;
    this.onRedaction = options.onRedaction;
  }

  async obfuscate(
    ctx: RequestContext,
    messages: ChatMessage[],
    sensitiveValues: SensitiveValueDeclaration[] | undefined,
    model: string,
  ): Promise<{ messages: ChatMessage[]; redactions: PiiRedactionEvent[] }> {
    if (!sensitiveValues || sensitiveValues.length === 0) {
      return { messages, redactions: [] };
    }

    const actorId = ctx.actorId ?? 'anonymous';
    const roles = ctx.actorRoles ?? [];
    const timestamp = new Date().toISOString();

    // Clone once so the caller's array and message objects are untouched.
    const out: ChatMessage[] = messages.map((m) => ({ ...m }));
    const redactions: PiiRedactionEvent[] = [];

    for (const decl of sensitiveValues) {
      const visible = this.visibility.getVisibleFields(actorId, roles, decl.objectType);
      // Fail-closed: undefined (no config) or a set that lacks the field → mask.
      const allowed = visible ? visible.has(decl.field) : false;

      let occurrences = 0;
      if (!allowed) {
        const placeholder = `[REDACTED:${decl.field}]`;
        for (const msg of out) {
          if (typeof msg.content !== 'string' || msg.content.length === 0) continue;
          const { content, count } = replaceAll(msg.content, decl.value, placeholder);
          if (count > 0) {
            msg.content = content;
            occurrences += count;
          }
        }
      }

      const event: PiiRedactionEvent = {
        tenantId: ctx.tenantId,
        actorId,
        model,
        objectType: decl.objectType,
        field: decl.field,
        decision: allowed ? 'allowed' : 'redacted',
        occurrences,
        timestamp,
      };
      redactions.push(event);
      this.onRedaction?.(event);
    }

    return { messages: out, redactions };
  }
}

/** Replace every occurrence of `needle` in `haystack` with `replacement`. */
function replaceAll(
  haystack: string,
  needle: string,
  replacement: string,
): { content: string; count: number } {
  if (needle.length === 0) return { content: haystack, count: 0 };
  let count = 0;
  let idx = 0;
  let out = '';
  while (idx < haystack.length) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) {
      out += haystack.slice(idx);
      break;
    }
    out += haystack.slice(idx, found) + replacement;
    idx = found + needle.length;
    count++;
  }
  return { content: out, count };
}
