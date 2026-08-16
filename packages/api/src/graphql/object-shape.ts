/**
 * Shared OntologyObject → GraphQL shaping.
 *
 * Lives in its own module rather than in resolver-generator because the
 * subscription manager needs the same shaping to hydrate change payloads, and
 * resolver-generator already imports the subscription manager — importing it
 * back would close a cycle.
 */

import type { ObjectType, FieldDefinition } from '@altius/odl';
import type { OntologyObject } from '@altius/spi';

export function isPrimaryField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'primary');
}

/**
 * Convert an OntologyObject to a GraphQL-friendly shape.
 * Strips the underscore prefix from system fields that map to schema fields.
 */
export function objectToGraphQL(obj: OntologyObject, objectType: ObjectType): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of objectType.fields) {
    if (isPrimaryField(field)) {
      // Primary field is an alias for the system _id column — the field name
      // can be anything (id, mrn, sku); the value always comes from obj._id.
      result[field.name] = obj._id;
    } else {
      result[field.name] = obj[field.name];
    }
  }

  // Stamp the concrete type name so interface `__resolveType` resolvers can
  // return the implementing ObjectType without a separate lookup. graphql-tools
  // exposes `__typename` as a default field, so this is also queryable.
  result.__typename = objectType.name;

  // Include system metadata. `_id` is not in the generated SDL (so it never
  // reaches a client), but downstream steps identify the row by it — the list
  // and search paths resolve the consent subject from `_id`, and without it
  // every row is checked as subject '' and default-denied.
  result._id = obj._id;
  // `_version` is what callers pass back as `expectedVersion` on update/delete
  // mutations and `_expectedVersion` on action inputs; it is in the SDL.
  result._version = obj._version;
  // `_actorId` attributes each version to the actor who wrote it; it is in
  // the SDL and surfaces in history snapshots so the timeline shows who.
  result._actorId = obj._actorId ?? null;
  result._redactedFields = null;
  result._consentRestricted = false;

  return result;
}
