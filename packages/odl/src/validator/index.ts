/**
 * ODL Validator — type checking and constraint validation for parsed ODL schemas.
 *
 * Takes a ParsedSchema and checks structural correctness per the Altius spec.
 */

import type {
  ParsedSchema,
  ObjectType,
  LinkType,
  FunctionType,
  FieldDefinition,
  FieldDirective,
  InterfaceDefinition,
} from '../parser/types.js';

import type { ValidationResult, ValidationIssue } from './types.js';

// Built-in GraphQL and ODL scalar types that don't need enum definitions.
const BUILTIN_SCALARS = new Set([
  'ID', 'String', 'Int', 'Float', 'Boolean',
  // ODL spec scalars
  'Date', 'DateTime', 'Duration', 'GeoPoint', 'JSON', 'URI',
]);

// Scalar types on which @unique is meaningful.
const UNIQUE_SCALARS = new Set([
  'ID', 'String', 'Int', 'Float',
  'Date', 'DateTime', 'URI',
]);

/**
 * Validate a parsed ODL schema.
 *
 * @returns A ValidationResult with errors and warnings.
 */
export function validateSchema(schema: ParsedSchema): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Build lookup sets for cross-referencing
  const objectTypeNames = new Set(schema.objectTypes.map(t => t.name));
  const linkTypeNames = new Set(schema.linkTypes.map(t => t.name));
  const linkTypeMap = new Map(schema.linkTypes.map(t => [t.name, t]));
  const enumNames = new Set(schema.enums.map(e => e.name));
  // enumValues available for future use if needed:
  // const enumValues = new Map(schema.enums.map(e => [e.name, new Set(e.values.map(v => v.name))]));
  const interfaceNames = new Set(schema.interfaces.map(i => i.name));
  const scalarNames = new Set(schema.scalars.map(s => s.name));
  const actionTypeNames = new Set(schema.actionTypes.map(a => a.name));
  const functionTypeNames = new Set(schema.functionTypes.map(f => f.name));

  // All known type names for field type resolution
  const allTypeNames = new Set([
    ...BUILTIN_SCALARS,
    ...objectTypeNames,
    ...linkTypeNames,
    ...enumNames,
    ...interfaceNames,
    ...scalarNames,
    ...actionTypeNames,
    ...functionTypeNames,
  ]);

  // ─── Rule 1: Every ObjectType has exactly one @primary field ───
  for (const ot of schema.objectTypes) {
    validatePrimaryField(ot, errors);
  }

  // ─── Rule 11: LinkType has id: ID! @primary field ───
  for (const lt of schema.linkTypes) {
    validateLinkTypePrimary(lt, errors);
  }

  // ─── Rule 2: @linkType from/to reference valid ObjectTypes ───
  for (const lt of schema.linkTypes) {
    validateLinkTypeEndpoints(lt, objectTypeNames, errors);
  }

  // ─── Rule 3 & 12: @link fields reference valid LinkTypes with correct direction ───
  for (const ot of schema.objectTypes) {
    for (const field of ot.fields) {
      validateLinkFields(ot.name, field, linkTypeMap, objectTypeNames, errors);
    }
  }

  // ─── Rule 4: Cardinality constraints are coherent ───
  for (const lt of schema.linkTypes) {
    validateCardinality(lt, errors);
  }

  // ─── Rule 5: @unique fields are on appropriate scalar types ───
  for (const ot of schema.objectTypes) {
    for (const field of ot.fields) {
      validateUniqueFields(ot.name, field, enumNames, warnings);
    }
  }

  // ─── Rule 6: @constraint expressions are syntactically valid CEL (basic check) ───
  for (const ot of schema.objectTypes) {
    for (const field of ot.fields) {
      validateConstraintExpr(ot.name, field, errors, warnings);
    }
  }

  // ─── Rule 7: @computed fields reference valid functions and args ───
  for (const ot of schema.objectTypes) {
    for (const field of ot.fields) {
      validateComputedFields(ot.name, field, errors);
    }
  }

  // ─── Rule 8: @param fields only appear on @actionType or @function types ───
  validateParamUsage(schema, errors);

  // ─── Rule 12: FunctionTypes declare a non-empty runtime and entry ───
  for (const fn of schema.functionTypes) {
    validateFunctionType(fn, errors);
  }

  // ─── Rule 13: FunctionType entry path is pack-relative and well-formed ───
  for (const fn of schema.functionTypes) {
    validateFunctionEntry(fn, errors);
  }

  // ─── Rule 14: FunctionType names do not collide with ActionType names ───
  for (const fn of schema.functionTypes) {
    if (actionTypeNames.has(fn.name)) {
      errors.push({
        severity: 'error',
        code: 'FUNCTION_NAME_COLLISION',
        message: `FunctionType "${fn.name}" collides with an ActionType of the same name. Function and action types must be distinct.`,
        typeName: fn.name,
      });
    }
    if (objectTypeNames.has(fn.name)) {
      errors.push({
        severity: 'error',
        code: 'FUNCTION_NAME_COLLISION',
        message: `FunctionType "${fn.name}" collides with an ObjectType of the same name. Function and object types must be distinct.`,
        typeName: fn.name,
      });
    }
  }

  // ─── Rule 9: Namespace references (depends) are validated ───
  // Note: The current ParsedSchema doesn't have a "depends" field.
  // This rule validates that if a namespace is declared, it has name and version.
  if (schema.namespace) {
    if (!schema.namespace.name) {
      errors.push({
        severity: 'error',
        code: 'EMPTY_NAMESPACE_NAME',
        message: 'Namespace name must not be empty.',
      });
    }
    if (!schema.namespace.version) {
      errors.push({
        severity: 'error',
        code: 'EMPTY_NAMESPACE_VERSION',
        message: 'Namespace version must not be empty.',
      });
    }
  }

  // ─── Rule 10: Enum values referenced in field types exist ───
  for (const ot of schema.objectTypes) {
    for (const field of ot.fields) {
      validateFieldTypeRef(ot.name, field, allTypeNames, errors);
    }
  }

  // ─── Rule 15: ObjectType implements clauses reference valid interfaces with field conformance ───
  const interfaceMap = new Map(schema.interfaces.map(i => [i.name, i]));
  for (const ot of schema.objectTypes) {
    validateInterfaceConformance(ot, interfaceMap, errors);
  }

  // ─── Rule 16: @display titleProperty/statusProperty reference existing fields ───
  for (const ot of schema.objectTypes) {
    validateDisplayMetadata(ot, errors);
  }
  for (const lt of schema.linkTypes) {
    for (const field of lt.fields) {
      validateFieldTypeRef(lt.name, field, allTypeNames, errors);
    }
  }
  for (const at of schema.actionTypes) {
    for (const field of at.fields) {
      validateFieldTypeRef(at.name, field, allTypeNames, errors);
    }
  }
  for (const fn of schema.functionTypes) {
    for (const field of fn.fields) {
      validateFieldTypeRef(fn.name, field, allTypeNames, errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Validation helpers ───

function findDirectives<K extends FieldDirective['kind']>(
  directives: FieldDirective[],
  kind: K,
): Extract<FieldDirective, { kind: K }>[] {
  return directives.filter(d => d.kind === kind) as Extract<FieldDirective, { kind: K }>[];
}

function hasDirective(directives: FieldDirective[], kind: FieldDirective['kind']): boolean {
  return directives.some(d => d.kind === kind);
}

/**
 * Rule 16: a type-level `@display(titleProperty|statusProperty: "x")` must name
 * a field that exists on the type. A dangling reference would silently give a
 * client a title/status pointer to nothing, so it fails at compile time.
 */
function validateDisplayMetadata(ot: ObjectType, errors: ValidationIssue[]): void {
  const display = ot.directives.find(d => d.kind === 'display');
  if (!display || display.kind !== 'display') return;
  const fieldNames = new Set(ot.fields.map(f => f.name));
  for (const key of ['titleProperty', 'statusProperty'] as const) {
    const prop = display[key];
    if (prop !== undefined && !fieldNames.has(prop)) {
      errors.push({
        severity: 'error',
        code: 'DISPLAY_UNKNOWN_PROPERTY',
        message: `ObjectType "${ot.name}" declares @display(${key}: "${prop}") but has no field named "${prop}".`,
        typeName: ot.name,
      });
    }
  }
}

/**
 * Rule 1: Every ObjectType must have exactly one @primary field of type ID!.
 *
 * The primary field is an alias for the system `_id` column — its value IS the
 * object identity. The field name can be anything (e.g. `id`, `mrn`, `sku`);
 * the API shapers expose `obj._id` under that name. The field does NOT get its
 * own stored column.
 */
function validatePrimaryField(ot: ObjectType, errors: ValidationIssue[]): void {
  const primaryFields = ot.fields.filter(f => hasDirective(f.directives, 'primary'));

  if (primaryFields.length === 0) {
    errors.push({
      severity: 'error',
      code: 'MISSING_PRIMARY',
      message: `ObjectType "${ot.name}" has no @primary field. Every ObjectType must have exactly one @primary field.`,
      typeName: ot.name,
    });
  } else if (primaryFields.length > 1) {
    errors.push({
      severity: 'error',
      code: 'MULTIPLE_PRIMARY',
      message: `ObjectType "${ot.name}" has ${primaryFields.length} @primary fields (${primaryFields.map(f => f.name).join(', ')}). Only one is allowed.`,
      typeName: ot.name,
    });
  } else {
    // The primary field must be ID! — it aliases the system _id column.
    const primary = primaryFields[0]!;
    if (primary.type.name !== 'ID' || !primary.type.nonNull) {
      errors.push({
        severity: 'error',
        code: 'INVALID_PRIMARY_TYPE',
        message: `ObjectType "${ot.name}" @primary field must be of type "ID!". Found "${primary.name}: ${primary.type.name}${primary.type.nonNull ? '!' : ''}".`,
        typeName: ot.name,
        fieldName: primary.name,
      });
    }
  }
}

/**
 * Rule 11: LinkType must have id: ID! @primary field.
 */
function validateLinkTypePrimary(lt: LinkType, errors: ValidationIssue[]): void {
  const primaryFields = lt.fields.filter(f => hasDirective(f.directives, 'primary'));

  if (primaryFields.length === 0) {
    errors.push({
      severity: 'error',
      code: 'LINKTYPE_MISSING_PRIMARY',
      message: `LinkType "${lt.name}" has no @primary field. LinkTypes must have an "id: ID! @primary" field.`,
      typeName: lt.name,
    });
    return;
  }

  if (primaryFields.length > 1) {
    errors.push({
      severity: 'error',
      code: 'LINKTYPE_MULTIPLE_PRIMARY',
      message: `LinkType "${lt.name}" has ${primaryFields.length} @primary fields. Only one is allowed.`,
      typeName: lt.name,
    });
    return;
  }

  const primary = primaryFields[0]!;
  if (primary.name !== 'id' || primary.type.name !== 'ID' || !primary.type.nonNull) {
    errors.push({
      severity: 'error',
      code: 'LINKTYPE_INVALID_PRIMARY',
      message: `LinkType "${lt.name}" @primary field must be "id: ID!". Found "${primary.name}: ${primary.type.name}${primary.type.nonNull ? '!' : ''}".`,
      typeName: lt.name,
      fieldName: primary.name,
    });
  }
}

/**
 * Rule 2: @linkType from and to must reference valid ObjectTypes.
 */
function validateLinkTypeEndpoints(
  lt: LinkType,
  objectTypeNames: Set<string>,
  errors: ValidationIssue[],
): void {
  if (!objectTypeNames.has(lt.from)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_LINKTYPE_FROM',
      message: `LinkType "${lt.name}" references unknown ObjectType "${lt.from}" in "from".`,
      typeName: lt.name,
    });
  }
  if (!objectTypeNames.has(lt.to)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_LINKTYPE_TO',
      message: `LinkType "${lt.name}" references unknown ObjectType "${lt.to}" in "to".`,
      typeName: lt.name,
    });
  }
}

/**
 * Rule 3: @link fields reference valid LinkTypes with correct direction.
 * Rule 12: @link(history: true) only on array fields.
 */
function validateLinkFields(
  typeName: string,
  field: FieldDefinition,
  linkTypeMap: Map<string, LinkType>,
  _objectTypeNames: Set<string>,
  errors: ValidationIssue[],
): void {
  const linkDirs = findDirectives(field.directives, 'link');

  for (const linkDir of linkDirs) {
    const lt = linkTypeMap.get(linkDir.type);
    if (!lt) {
      errors.push({
        severity: 'error',
        code: 'INVALID_LINK_TYPE_REF',
        message: `Field "${typeName}.${field.name}" references unknown LinkType "${linkDir.type}" in @link.`,
        typeName,
        fieldName: field.name,
      });
      continue;
    }

    // Validate direction matches the link type endpoints
    if (linkDir.direction === 'OUTBOUND') {
      // OUTBOUND: this type should be the "from" of the link type
      if (lt.from !== typeName) {
        errors.push({
          severity: 'error',
          code: 'LINK_DIRECTION_MISMATCH',
          message: `Field "${typeName}.${field.name}" uses @link(type: "${linkDir.type}", direction: OUTBOUND) but LinkType "${lt.name}" has from="${lt.from}", not "${typeName}".`,
          typeName,
          fieldName: field.name,
        });
      }
    } else if (linkDir.direction === 'INBOUND') {
      // INBOUND: this type should be the "to" of the link type
      if (lt.to !== typeName) {
        errors.push({
          severity: 'error',
          code: 'LINK_DIRECTION_MISMATCH',
          message: `Field "${typeName}.${field.name}" uses @link(type: "${linkDir.type}", direction: INBOUND) but LinkType "${lt.name}" has to="${lt.to}", not "${typeName}".`,
          typeName,
          fieldName: field.name,
        });
      }
    }

    // Rule 12: @link(history: true) only on array fields
    if (linkDir.history && !field.type.isList) {
      errors.push({
        severity: 'error',
        code: 'LINK_HISTORY_NOT_ARRAY',
        message: `Field "${typeName}.${field.name}" uses @link(history: true) but is not an array type. History links must be array fields.`,
        typeName,
        fieldName: field.name,
      });
    }
  }
}

/**
 * Rule 4: Cardinality constraints are coherent.
 */
function validateCardinality(lt: LinkType, errors: ValidationIssue[]): void {
  const valid: Set<string> = new Set(['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_ONE', 'MANY_TO_MANY']);
  if (!valid.has(lt.cardinality)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_CARDINALITY',
      message: `LinkType "${lt.name}" has invalid cardinality "${lt.cardinality}". Must be one of: ${[...valid].join(', ')}.`,
      typeName: lt.name,
    });
  }
}

/**
 * Rule 5: @unique fields should be on appropriate scalar types.
 */
function validateUniqueFields(
  typeName: string,
  field: FieldDefinition,
  _enumNames: Set<string>,
  warnings: ValidationIssue[],
): void {
  if (!hasDirective(field.directives, 'unique')) return;

  if (field.type.isList) {
    warnings.push({
      severity: 'warning',
      code: 'UNIQUE_ON_LIST',
      message: `Field "${typeName}.${field.name}" has @unique on a list type, which may not behave as expected.`,
      typeName,
      fieldName: field.name,
    });
    return;
  }

  if (!UNIQUE_SCALARS.has(field.type.name) && !BUILTIN_SCALARS.has(field.type.name)) {
    warnings.push({
      severity: 'warning',
      code: 'UNIQUE_ON_NON_SCALAR',
      message: `Field "${typeName}.${field.name}" has @unique on type "${field.type.name}", which is not a scalar type. @unique is typically used on scalar types.`,
      typeName,
      fieldName: field.name,
    });
  }
}

/**
 * Rule 6: @constraint expressions are syntactically valid CEL (basic check).
 */
function validateConstraintExpr(
  typeName: string,
  field: FieldDefinition,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  const constraints = findDirectives(field.directives, 'constraint');

  for (const c of constraints) {
    if (!c.expr || c.expr.trim() === '') {
      errors.push({
        severity: 'error',
        code: 'EMPTY_CONSTRAINT_EXPR',
        message: `Field "${typeName}.${field.name}" has @constraint with empty expression.`,
        typeName,
        fieldName: field.name,
      });
      continue;
    }

    // Basic CEL syntax check: balanced parentheses
    if (!hasBalancedParens(c.expr)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_CONSTRAINT_EXPR',
        message: `Field "${typeName}.${field.name}" has @constraint with unbalanced parentheses in expression: "${c.expr}".`,
        typeName,
        fieldName: field.name,
      });
    }

    // Warn on potential null access patterns (e.g., "foo.bar" without null check)
    if (/\w+\.\w+/.test(c.expr) && !c.expr.includes('has(') && !c.expr.includes('!= null')) {
      warnings.push({
        severity: 'warning',
        code: 'CONSTRAINT_POSSIBLE_NULL_ACCESS',
        message: `Field "${typeName}.${field.name}" @constraint expression "${c.expr}" contains member access that may fail on null values.`,
        typeName,
        fieldName: field.name,
      });
    }
  }
}

function hasBalancedParens(expr: string): boolean {
  let depth = 0;
  for (const ch of expr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Built-in compute functions available at runtime.
 *
 * Must match the registry in packages/engine/src/computed/computed-field-evaluator.ts.
 * The validator and the runtime previously disagreed: the runtime grew
 * lookupField and the four aggregate builtins, while the validator still
 * whitelisted only countLinks — so `odl validate` and `odl apply` rejected
 * every schema that used a function the runtime itself added.
 */
const BUILTIN_COMPUTE_FNS = new Set([
  'countLinks',
  'lookupField',
  'sumLinks',
  'avgLinks',
  'minLinks',
  'maxLinks',
]);

/**
 * Rule 7: @computed fields reference valid functions and args.
 */
function validateComputedFields(
  typeName: string,
  field: FieldDefinition,
  errors: ValidationIssue[],
): void {
  const computedDirs = findDirectives(field.directives, 'computed');

  for (const c of computedDirs) {
    if (!c.fn || c.fn.trim() === '') {
      errors.push({
        severity: 'error',
        code: 'COMPUTED_MISSING_FN',
        message: `Field "${typeName}.${field.name}" has @computed with empty "fn" argument.`,
        typeName,
        fieldName: field.name,
      });
    } else if (!BUILTIN_COMPUTE_FNS.has(c.fn)) {
      errors.push({
        severity: 'error',
        code: 'COMPUTED_UNKNOWN_FN',
        message: `Field "${typeName}.${field.name}" references unknown compute function "${c.fn}". Available: ${[...BUILTIN_COMPUTE_FNS].join(', ')}`,
        typeName,
        fieldName: field.name,
      });
    }
  }
}

/**
 * Rule 8: @param fields only appear on @actionType or @function types.
 */
function validateParamUsage(schema: ParsedSchema, errors: ValidationIssue[]): void {
  // Check objectTypes — @param should NOT be used here
  for (const ot of schema.objectTypes) {
    for (const field of ot.fields) {
      if (hasDirective(field.directives, 'param')) {
        errors.push({
          severity: 'error',
          code: 'PARAM_ON_NON_ACTION',
          message: `Field "${ot.name}.${field.name}" uses @param but "${ot.name}" is an ObjectType, not an ActionType or Function.`,
          typeName: ot.name,
          fieldName: field.name,
        });
      }
    }
  }

  // Check linkTypes — @param should NOT be used here
  for (const lt of schema.linkTypes) {
    for (const field of lt.fields) {
      if (hasDirective(field.directives, 'param')) {
        errors.push({
          severity: 'error',
          code: 'PARAM_ON_NON_ACTION',
          message: `Field "${lt.name}.${field.name}" uses @param but "${lt.name}" is a LinkType, not an ActionType or Function.`,
          typeName: lt.name,
          fieldName: field.name,
        });
      }
    }
  }
}

/**
 * Rule 10: Field type references must resolve to known types (objects, enums, scalars, interfaces).
 */
function validateFieldTypeRef(
  typeName: string,
  field: FieldDefinition,
  allTypeNames: Set<string>,
  errors: ValidationIssue[],
): void {
  if (!allTypeNames.has(field.type.name)) {
    errors.push({
      severity: 'error',
      code: 'UNKNOWN_TYPE_REF',
      message: `Field "${typeName}.${field.name}" references unknown type "${field.type.name}".`,
      typeName,
      fieldName: field.name,
    });
  }
}

/**
 * Rule 12: FunctionType declares a non-empty `runtime` and `entry`.
 * Runtime must be one of the supported adapter names; entry must be a
 * non-empty string. The runtime set is intentionally permissive — new
 * runtimes can be registered without changing the validator — but an
 * empty runtime is always invalid.
 */
function validateFunctionType(fn: FunctionType, errors: ValidationIssue[]): void {
  if (!fn.runtime) {
    errors.push({
      severity: 'error',
      code: 'FUNCTION_MISSING_RUNTIME',
      message: `FunctionType "${fn.name}" has no @function(runtime: ...). A runtime is required.`,
      typeName: fn.name,
    });
  }
  if (!fn.entry) {
    errors.push({
      severity: 'error',
      code: 'FUNCTION_MISSING_ENTRY',
      message: `FunctionType "${fn.name}" has no @function(entry: ...). An entry path is required.`,
      typeName: fn.name,
    });
  }
}

/**
 * Rule 13: FunctionType entry path is well-formed.
 * Accepts pack-relative paths like "compute-score/index.js" or
 * "shared/utils.ts". Rejects absolute paths, parent traversals, and
 * extensions other than .js/.ts/.mjs.
 */
function validateFunctionEntry(fn: FunctionType, errors: ValidationIssue[]): void {
  if (!fn.entry) return; // Already flagged by Rule 12
  if (fn.entry.startsWith('/') || fn.entry.startsWith('\\')) {
    errors.push({
      severity: 'error',
      code: 'FUNCTION_ENTRY_ABSOLUTE',
      message: `FunctionType "${fn.name}" entry "${fn.entry}" must be a pack-relative path, not an absolute path.`,
      typeName: fn.name,
    });
    return;
  }
  if (fn.entry.includes('..')) {
    errors.push({
      severity: 'error',
      code: 'FUNCTION_ENTRY_PARENT_TRAVERSAL',
      message: `FunctionType "${fn.name}" entry "${fn.entry}" must not contain parent-directory (..) segments.`,
      typeName: fn.name,
    });
    return;
  }
  const validExtensions = ['.js', '.ts', '.mjs'];
  if (!validExtensions.some(ext => fn.entry.endsWith(ext))) {
    errors.push({
      severity: 'error',
      code: 'FUNCTION_ENTRY_EXTENSION',
      message: `FunctionType "${fn.name}" entry "${fn.entry}" must end in one of: ${validExtensions.join(', ')}.`,
      typeName: fn.name,
    });
  }
}

/**
 * Rule 15: ObjectType implements clauses reference valid interfaces and
 * each interface field appears on the implementer with identical type and
 * nonNull. An object type declaring `implements Foo` must (a) reference a
 * known interface and (b) carry every field Foo declares with the same
 * type name and nullability. Extra fields on the implementer are allowed.
 */
function validateInterfaceConformance(
  ot: ObjectType,
  interfaceMap: Map<string, InterfaceDefinition>,
  errors: ValidationIssue[],
): void {
  for (const ifaceName of ot.interfaces) {
    const iface = interfaceMap.get(ifaceName);
    if (!iface) {
      errors.push({
        severity: 'error',
        code: 'UNKNOWN_INTERFACE_REF',
        message: `ObjectType "${ot.name}" implements unknown interface "${ifaceName}".`,
        typeName: ot.name,
      });
      continue;
    }
    const otFieldMap = new Map(ot.fields.map(f => [f.name, f]));
    for (const ifaceField of iface.fields) {
      const implField = otFieldMap.get(ifaceField.name);
      if (!implField) {
        errors.push({
          severity: 'error',
          code: 'INTERFACE_FIELD_MISSING',
          message: `ObjectType "${ot.name}" implements "${ifaceName}" but is missing field "${ifaceField.name}".`,
          typeName: ot.name,
          fieldName: ifaceField.name,
        });
        continue;
      }
      if (implField.type.name !== ifaceField.type.name || implField.type.nonNull !== ifaceField.type.nonNull) {
        errors.push({
          severity: 'error',
          code: 'INTERFACE_FIELD_TYPE_MISMATCH',
          message: `ObjectType "${ot.name}.${ifaceField.name}" has type ${implField.type.name}${implField.type.nonNull ? '!' : ''} but interface "${ifaceName}" declares ${ifaceField.type.name}${ifaceField.type.nonNull ? '!' : ''}.`,
          typeName: ot.name,
          fieldName: ifaceField.name,
        });
      }
    }
  }
}

export type { ValidationResult, ValidationIssue, ValidationSeverity } from './types.js';
