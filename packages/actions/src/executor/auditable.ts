/**
 * Platform-populated `Auditable` fields.
 *
 * altius.core's `Auditable` interface declares createdAt/createdBy/updatedAt/
 * updatedBy as `DateTime!`/`String!` with `@readonly`. Non-null means the
 * generated DDL emits NOT NULL; `@readonly` means a caller may not supply them.
 * Nothing sat between those two facts, so creating an Auditable object through
 * an action failed on Postgres with SQLSTATE 23502 (`null value in column
 * "created_at"`) — and silently succeeded on the memory provider, which does
 * not enforce NOT NULL. That divergence is why no test caught it.
 *
 * `@readonly` is the whole argument for doing this in the platform: a field the
 * caller is forbidden to write has to be written by someone, and the only other
 * candidate — every action manifest setting it by hand — is exactly what
 * `@readonly` exists to prevent.
 *
 * Keyed off the declared `implements Auditable` clause, not off field names: a
 * type that happens to have a `createdAt` of its own is not silently taken over.
 */

import type { ParsedSchema } from '@altius/odl';

/** The interface whose contract this fills. */
const AUDITABLE = 'Auditable';

/** Field → which operations set it. */
const AUDIT_FIELDS = {
  createdAt: 'create',
  createdBy: 'create',
  updatedAt: 'both',
  updatedBy: 'both',
} as const;

/** Which fields carry the actor rather than the timestamp. */
const ACTOR_FIELDS = new Set(['createdBy', 'updatedBy']);

/**
 * The audit values to merge into an effect's properties.
 *
 * Returns only fields that are (a) declared on the type, (b) marked
 * `@readonly`, (c) applicable to this operation, and (d) not already supplied.
 * An explicit value wins — a data migration setting `createdBy` deliberately is
 * not something to overwrite.
 *
 * Unknown types yield `{}` rather than throwing: an effect naming a type
 * outside the schema is the storage layer's error to report, not this one's.
 */
export function auditableDefaults(
  schema: ParsedSchema,
  objectType: string,
  properties: Record<string, unknown>,
  actor: string,
  now: string,
  operation: 'create' | 'update',
): Record<string, unknown> {
  const type = schema.objectTypes.find((o) => o.name === objectType);
  if (!type || !type.interfaces.includes(AUDITABLE)) return {};

  const filled: Record<string, unknown> = {};

  for (const field of type.fields) {
    const applies = AUDIT_FIELDS[field.name as keyof typeof AUDIT_FIELDS];
    if (!applies) continue;
    if (applies !== 'both' && applies !== operation) continue;
    if (!field.directives.some((d) => d.kind === 'readonly')) continue;
    if (properties[field.name] !== undefined && properties[field.name] !== null) continue;

    filled[field.name] = ACTOR_FIELDS.has(field.name) ? actor : now;
  }

  return filled;
}
