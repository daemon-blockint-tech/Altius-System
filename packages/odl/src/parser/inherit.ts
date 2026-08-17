/**
 * Interface field inheritance — shared property definitions.
 *
 * In ODL, an interface declares a set of fields. An ObjectType that
 * `implements` the interface previously had to REDECLARE every field —
 * the interface was a conformance check, not a source of fields.
 *
 * `mergeInterfaceFields` changes that: it copies each interface's fields
 * into every implementing ObjectType, unless the ObjectType already
 * declares a field of the same name (in which case the override is kept
 * and checked for type compatibility by the validator).
 *
 * This makes interfaces a shared-property mechanism: declare `createdAt`,
 * `createdBy`, `updatedAt`, `updatedBy` once on an `Auditable` interface,
 * and every type that `implements Auditable` inherits them without
 * redeclaration.
 *
 * The merge is performed AFTER parsing and BEFORE validation, so the
 * validator sees the merged field list and can check inherited fields
 * the same way it checks declared ones.
 */

import type {
  ParsedSchema,
  ObjectType,
  InterfaceDefinition,
  FieldDefinition,
} from './types.js';

/**
 * Return a new ParsedSchema where every ObjectType that `implements` an
 * interface has the interface's fields merged into its `fields` array.
 *
 * Fields already declared on the ObjectType (by name) are NOT overwritten —
 * the override wins, and the validator checks type compatibility.
 *
 * Inherited fields are appended AFTER the type's own fields, so a type's
 * own field order is preserved (important for display/rendering order).
 *
 * The input schema is not mutated.
 */
export function mergeInterfaceFields(schema: ParsedSchema): ParsedSchema {
  // Build a transitive closure of interface inheritance: if interface B
  // extends interface A, then a type implementing B also inherits A's fields.
  // GraphQL SDL interfaces can't extend other interfaces in the current
  // parser, but this is forward-compatible if that is added later.
  const expandedInterfaces = expandInterfaceInheritance(schema.interfaces);

  const expandedMap = new Map(expandedInterfaces.map(i => [i.name, i]));

  const objectTypes = schema.objectTypes.map(ot => mergeOne(ot, expandedMap));

  return {
    ...schema,
    objectTypes,
  };
}

/**
 * Merge interface fields into a single ObjectType.
 * Returns the original object if it implements no interfaces.
 */
function mergeOne(
  ot: ObjectType,
  interfaceMap: Map<string, InterfaceDefinition>,
): ObjectType {
  if (ot.interfaces.length === 0) return ot;

  const ownFieldNames = new Set(ot.fields.map(f => f.name));
  const inherited: FieldDefinition[] = [];

  for (const ifaceName of ot.interfaces) {
    const iface = interfaceMap.get(ifaceName);
    if (!iface) continue;

    for (const ifaceField of iface.fields) {
      if (!ownFieldNames.has(ifaceField.name)) {
        inherited.push(ifaceField);
      }
    }
  }

  if (inherited.length === 0) return ot;

  return {
    ...ot,
    fields: [...ot.fields, ...inherited],
  };
}

/**
 * Expand interface inheritance transitively.
 *
 * Currently interfaces cannot extend other interfaces in ODL, so this is
 * a no-op pass-through. It exists so that when interface inheritance is
 * added, the merge logic already handles it correctly.
 */
function expandInterfaceInheritance(
  interfaces: InterfaceDefinition[],
): InterfaceDefinition[] {
  // No interface `implements` clause exists in the parser today, so there
  // is nothing to expand. Return as-is.
  return interfaces;
}
