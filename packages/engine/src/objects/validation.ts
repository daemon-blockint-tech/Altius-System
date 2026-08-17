/**
 * Validation pipeline for the Ontology Engine (Section 4.3).
 *
 * Every write operation passes through:
 * 1. Schema validation — field types, required fields, enum values
 * 2. Constraint evaluation — @constraint CEL expressions
 * 3. Uniqueness check — @unique fields checked across all instances
 * 4. Cardinality check — link operations (delegated to link manager)
 * 5. Referential integrity — link targets must exist
 */

import type {
  PlatformError,
  RequestContext,
  StorageProvider,
} from '@altius/spi';
import type {
  ParsedSchema,
  ObjectType,
  FieldDefinition,
  StructDefinition,
} from '@altius/odl';

/** A single validation failure. */
export interface ValidationFailure {
  /** The pipeline step that failed. */
  step: 'schema' | 'constraint' | 'uniqueness' | 'cardinality' | 'referential_integrity' | 'immutable';
  /** The field that caused the failure (if applicable). */
  field?: string;
  /** Human-readable message. */
  message: string;
  /** Severity: 'error' (default, blocks write) or 'warning' (informational, does not block). */
  severity?: 'error' | 'warning';
}

/** Result of running the validation pipeline. */
export interface ValidationResult {
  valid: boolean;
  failures: ValidationFailure[];
}

// ---------------------------------------------------------------------------
// CEL evaluator (injected dependency)
// ---------------------------------------------------------------------------

/**
 * Evaluates CEL expressions. Structurally compatible with
 * `@altius/actions`'s `CelEvaluator` and `CelClient.evaluate` so the same
 * sidecar instance can be injected here without an engine → actions
 * dependency.
 *
 * When omitted, the validation pipeline falls back to a small inline
 * evaluator that handles only the most common comparison/size patterns
 * (see `evaluateCelExpr`). Anything else is recorded as a warning so
 * callers know the constraint was NOT enforced.
 */
export interface CelEvaluator {
  evaluate(
    expression: string,
    variables: Record<string, unknown>,
  ): Promise<CelEvalResult>;
}

export interface CelEvalResult {
  value?: unknown;
  error?: string;
}

// ISO 8601 calendar date: YYYY-MM-DD, no time part.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601 duration, e.g. P3Y6M4DT12H30M5S or PT30M. At least one component.
const ISO_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?!$)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;

/** A string that both parses as a real calendar date and is a well-formed one. */
function isValidDate(v: unknown): boolean {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Reject overflow the Date constructor silently rolls over (2025-02-30).
  return d.toISOString().slice(0, 10) === v;
}

function isValidDateTime(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  // A bare date is not a DateTime: the two map to different Postgres column
  // types, so accepting one for the other is exactly the divergence this
  // table exists to prevent.
  if (!v.includes('T')) return false;
  return !Number.isNaN(new Date(v).getTime());
}

function isValidUri(v: unknown): boolean {
  if (typeof v !== 'string' || v === '') return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

/** A GeoPoint is a lat/lng pair, and the numbers have to be on the globe. */
function isValidGeoPoint(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  const { lat, lng } = p;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * An Attachment is a reference to a stored blob. The shape must include
 * a blobId, filename, contentType, and size — the minimum a client needs
 * to render a preview or download link without a second round-trip.
 */
function isValidAttachment(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  if (typeof p['blobId'] !== 'string' || p['blobId'].length === 0) return false;
  if (typeof p['filename'] !== 'string') return false;
  if (typeof p['contentType'] !== 'string') return false;
  if (typeof p['size'] !== 'number' || p['size'] < 0 || !Number.isFinite(p['size'])) return false;
  if (p['uploadedAt'] !== undefined && typeof p['uploadedAt'] !== 'string') return false;
  if (p['sha256'] !== undefined && typeof p['sha256'] !== 'string') return false;
  if (p['thumbnailBlobId'] !== undefined && typeof p['thumbnailBlobId'] !== 'string') return false;
  if (p['uploadedBy'] !== undefined && typeof p['uploadedBy'] !== 'string') return false;
  return true;
}

/**
 * Built-in scalar type names recognized by the engine.
 *
 * These are FORMAT checks, not just `typeof` checks, and that distinction is
 * the whole point. Date/DateTime/Duration map to TIMESTAMPTZ/DATE/INTERVAL on
 * Postgres and to plain JS values in memory, so a `typeof === 'string'` gate
 * let `"not-a-date"` through the engine and then produced two different
 * outcomes: the memory provider stored it happily while Postgres raised. Same
 * ODL, same write, different behaviour per backend — the class of divergence
 * the conformance suite exists to catch, arriving from above it.
 *
 * GeoPoint was worse than loose: `{}` and `{foo: 1}` both passed, so the one
 * structured type in the language guaranteed nothing about its own shape.
 */
const SCALAR_TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  ID: (v) => typeof v === 'string',
  String: (v) => typeof v === 'string',
  Int: (v) => typeof v === 'number' && Number.isInteger(v),
  Float: (v) => typeof v === 'number',
  Boolean: (v) => typeof v === 'boolean',
  Date: isValidDate,
  DateTime: isValidDateTime,
  Duration: (v) => typeof v === 'string' && ISO_DURATION.test(v),
  GeoPoint: isValidGeoPoint,
  JSON: (_v) => true,
  URI: isValidUri,
  Attachment: isValidAttachment,
};

/**
 * Validates properties for an object create or update.
 *
 * Runs the validation pipeline in the order specified by Section 4.3:
 * 1. Schema validation
 * 2. Constraint evaluation
 * 3. Uniqueness check
 *
 * Steps 4 (cardinality) and 5 (referential integrity) are for link
 * operations and are checked separately by the ObjectManager/LinkManager.
 */
export async function validateObjectProperties(
  schema: ParsedSchema,
  typeName: string,
  properties: Record<string, unknown>,
  ctx: RequestContext,
  storage: StorageProvider,
  existingId?: string,
  patchKeys?: Set<string>,
  celEvaluator?: CelEvaluator,
): Promise<ValidationResult> {
  const failures: ValidationFailure[] = [];

  const objectType = schema.objectTypes.find((t) => t.name === typeName);
  if (!objectType) {
    return {
      valid: false,
      failures: [{
        step: 'schema',
        message: `Unknown object type: ${typeName}`,
      }],
    };
  }

  // Build enum lookup for the schema
  const enumMap = new Map<string, Set<string>>();
  for (const e of schema.enums) {
    enumMap.set(e.name, new Set(e.values.map((v) => v.name)));
  }

  // Build struct lookup for the schema
  const structMap = new Map<string, StructDefinition>(
    (schema.structTypes ?? []).map(s => [s.name, s]),
  );

  // Step 1: Schema validation (uses merged state for required-field checks)
  const schemaFailures = validateSchema(objectType, properties, enumMap, structMap);
  failures.push(...schemaFailures);

  // Step 1b: Immutable field check (updates only, uses patch keys not merged state)
  if (existingId !== undefined && patchKeys) {
    const immutableFailures = checkImmutableFields(objectType, patchKeys);
    failures.push(...immutableFailures);
  }

  // Step 2: Constraint evaluation (field-level).
  // On updates, only evaluate constraints for fields in the patch.
  // On creates, evaluate all field constraints.
  // When a CelEvaluator is provided, route expressions through it; otherwise
  // fall back to the inline evaluator (which can only handle a small subset
  // and emits a warning for anything it cannot evaluate).
  const constraintFailures = await evaluateConstraints(
    objectType,
    properties,
    patchKeys,
    celEvaluator,
  );
  failures.push(...constraintFailures);

  // Step 2b: Type-level constraint evaluation (uses merged state, gated on field-level)
  const fieldConstraintErrors = constraintFailures.filter((f) => f.severity !== 'warning');
  if (fieldConstraintErrors.length === 0) {
    const typeConstraintFailures = await evaluateTypeConstraints(
      objectType,
      properties,
      celEvaluator,
    );
    failures.push(...typeConstraintFailures);
  }

  // Step 3: Uniqueness check (only if no blocking errors so far)
  const errorsSoFar = failures.filter((f) => f.severity !== 'warning');
  if (errorsSoFar.length === 0) {
    const uniquenessFailures = await checkUniqueness(
      objectType,
      properties,
      ctx,
      storage,
      typeName,
      existingId,
    );
    failures.push(...uniquenessFailures);
  }

  // Only errors (non-warning) failures block the write
  const errors = failures.filter((f) => f.severity !== 'warning');
  return {
    valid: errors.length === 0,
    failures,
  };
}

/**
 * Step 1: Schema validation.
 * Checks field types, required fields, and enum values.
 */
function validateSchema(
  objectType: ObjectType,
  properties: Record<string, unknown>,
  enumMap: Map<string, Set<string>>,
  structMap: Map<string, StructDefinition>,
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  for (const field of objectType.fields) {
    // Skip system fields (_id, etc.) and computed/link/primary fields
    if (isSystemField(field) || isComputedField(field) || isLinkField(field)) {
      continue;
    }

    const value = properties[field.name];

    // Check required fields (nonNull means required)
    if (field.type.nonNull && (value === undefined || value === null)) {
      // Skip if field has a @default directive
      const hasDefault = field.directives.some((d) => d.kind === 'default');
      // A @readonly field is platform-owned: the write paths refuse it from a
      // caller, so demanding it makes the type UNCREATABLE by anyone. The core
      // `Auditable` interface declares createdAt/createdBy/updatedAt/updatedBy
      // exactly that way, so every type implementing it — Patient among them —
      // could never be created, by seed, action or API. Nothing populates them
      // either; the real audit values live in the _created_at/_updated_at/
      // _actor_id system columns.
      const isReadonly = field.directives.some((d) => d.kind === 'readonly');
      if (!hasDefault && !isReadonly) {
        failures.push({
          step: 'schema',
          field: field.name,
          message: `Required field '${field.name}' is missing`,
        });
        continue;
      }
    }

    // Skip further checks if value is not provided (optional field)
    if (value === undefined || value === null) {
      continue;
    }

    // Check enum values
    const enumValues = enumMap.get(field.type.name);
    if (enumValues) {
      if (field.type.isList) {
        if (!Array.isArray(value)) {
          failures.push({
            step: 'schema',
            field: field.name,
            message: `Field '${field.name}' must be an array of ${field.type.name}`,
          });
        } else {
          for (const item of value) {
            if (typeof item !== 'string' || !enumValues.has(item)) {
              failures.push({
                step: 'schema',
                field: field.name,
                message: `Invalid enum value '${String(item)}' for field '${field.name}'. Valid values: ${[...enumValues].join(', ')}`,
              });
            }
          }
        }
      } else if (typeof value !== 'string' || !enumValues.has(value)) {
        failures.push({
          step: 'schema',
          field: field.name,
          message: `Invalid enum value '${String(value)}' for field '${field.name}'. Valid values: ${[...enumValues].join(', ')}`,
        });
      }
      continue;
    }

    // Check scalar types
    const typeCheck = SCALAR_TYPE_CHECKS[field.type.name];
    if (typeCheck) {
      if (field.type.isList) {
        if (!Array.isArray(value)) {
          failures.push({
            step: 'schema',
            field: field.name,
            message: `Field '${field.name}' must be an array`,
          });
        } else {
          for (let i = 0; i < value.length; i++) {
            if (!typeCheck(value[i])) {
              failures.push({
                step: 'schema',
                field: field.name,
                message: `Field '${field.name}[${i}]' has invalid type. Expected ${field.type.name}`,
              });
            }
          }
        }
      } else if (!typeCheck(value)) {
        failures.push({
          step: 'schema',
          field: field.name,
          message: `Field '${field.name}' has invalid type. Expected ${field.type.name}, got ${typeof value}`,
        });
      }
    }

    // Check struct types — validate nested fields recursively
    const structDef = structMap?.get(field.type.name);
    if (structDef) {
      if (field.type.isList) {
        if (!Array.isArray(value)) {
          failures.push({
            step: 'schema',
            field: field.name,
            message: `Field '${field.name}' must be an array of ${field.type.name}`,
          });
        } else {
          for (let i = 0; i < value.length; i++) {
            const structFailures = validateStructValue(
              `${field.name}[${i}]`,
              structDef,
              value[i],
              enumMap,
              structMap,
            );
            failures.push(...structFailures);
          }
        }
      } else {
        const structFailures = validateStructValue(
          field.name,
          structDef,
          value,
          enumMap,
          structMap,
        );
        failures.push(...structFailures);
      }
    }
  }

  return failures;
}

/**
 * Validate a struct-typed value against its StructDefinition.
 * Recursively validates nested struct fields.
 */
function validateStructValue(
  fieldPath: string,
  structDef: StructDefinition,
  value: unknown,
  enumMap: Map<string, Set<string>>,
  structMap: Map<string, StructDefinition> | undefined,
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failures.push({
      step: 'schema',
      field: fieldPath,
      message: `Field '${fieldPath}' must be an object`,
    });
    return failures;
  }

  const obj = value as Record<string, unknown>;

  for (const field of structDef.fields) {
    const fieldValue = obj[field.name];

    // Check required fields
    if (field.type.nonNull && (fieldValue === undefined || fieldValue === null)) {
      const hasDefault = field.directives.some((d) => d.kind === 'default');
      if (!hasDefault) {
        failures.push({
          step: 'schema',
          field: `${fieldPath}.${field.name}`,
          message: `Required field '${fieldPath}.${field.name}' is missing`,
        });
      }
      continue;
    }

    // Skip further checks if value is not provided
    if (fieldValue === undefined || fieldValue === null) continue;

    // Check enum values
    const enumValues = enumMap.get(field.type.name);
    if (enumValues) {
      if (typeof fieldValue !== 'string' || !enumValues.has(fieldValue)) {
        failures.push({
          step: 'schema',
          field: `${fieldPath}.${field.name}`,
          message: `Invalid enum value '${String(fieldValue)}' for field '${fieldPath}.${field.name}'`,
        });
      }
      continue;
    }

    // Check scalar types
    const typeCheck = SCALAR_TYPE_CHECKS[field.type.name];
    if (typeCheck) {
      if (!typeCheck(fieldValue)) {
        failures.push({
          step: 'schema',
          field: `${fieldPath}.${field.name}`,
          message: `Field '${fieldPath}.${field.name}' has invalid type. Expected ${field.type.name}`,
        });
      }
      continue;
    }

    // Check nested struct types
    const nestedStruct = structMap?.get(field.type.name);
    if (nestedStruct) {
      if (field.type.isList) {
        if (!Array.isArray(fieldValue)) {
          failures.push({
            step: 'schema',
            field: `${fieldPath}.${field.name}`,
            message: `Field '${fieldPath}.${field.name}' must be an array`,
          });
        } else {
          for (let i = 0; i < fieldValue.length; i++) {
            failures.push(...validateStructValue(
              `${fieldPath}.${field.name}[${i}]`,
              nestedStruct,
              fieldValue[i],
              enumMap,
              structMap,
            ));
          }
        }
      } else {
        failures.push(...validateStructValue(
          `${fieldPath}.${field.name}`,
          nestedStruct,
          fieldValue,
          enumMap,
          structMap,
        ));
      }
    }
  }

  return failures;
}

/**
 * Step 2: Constraint evaluation.
 * Evaluates @constraint CEL expressions against proposed state.
 *
 * When a `CelEvaluator` is provided (production wiring via the gRPC
 * sidecar), expressions are routed through it. Field-level constraints
 * bind the proposed field value as `value` and the full proposed object
 * as `this`, matching the CEL conventions used by the action pipeline.
 *
 * Without a `CelEvaluator` (test/dev mode), a small inline evaluator
 * handles the most common comparison/size patterns. Anything else is
 * recorded as a warning so callers know the constraint was NOT enforced
 * rather than silently passing.
 */
async function evaluateConstraints(
  objectType: ObjectType,
  properties: Record<string, unknown>,
  patchKeys?: Set<string>,
  celEvaluator?: CelEvaluator,
): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];

  for (const field of objectType.fields) {
    // On updates, only evaluate constraints for fields in the patch
    if (patchKeys && !patchKeys.has(field.name)) continue;

    // Skip constraint evaluation for absent optional fields. A constraint
    // validates a *provided* value; an unset optional field has nothing to
    // validate. (Required-field presence is already checked in Step 1.)
    const fieldValue = properties[field.name];
    if (fieldValue === undefined || fieldValue === null) continue;

    const constraints = field.directives.filter(
      (d): d is { kind: 'constraint'; expr: string } => d.kind === 'constraint',
    );

    for (const constraint of constraints) {
      if (celEvaluator) {
        const celResult = await celEvaluator.evaluate(constraint.expr, {
          this: properties,
          value: fieldValue,
        });
        if (celResult.error) {
          failures.push({
            step: 'constraint',
            field: field.name,
            message: `Constraint on field '${field.name}' failed to evaluate: ${celResult.error}`,
          });
        } else if (celResult.value !== true) {
          failures.push({
            step: 'constraint',
            field: field.name,
            message: `Constraint violated on field '${field.name}': ${constraint.expr}`,
          });
        }
      } else {
        const result = evaluateCelExpr(constraint.expr, field.name, properties);
        if (result === false) {
          failures.push({
            step: 'constraint',
            field: field.name,
            message: `Constraint violated on field '${field.name}': ${constraint.expr}`,
          });
        } else if (result === null) {
          // Expression requires CEL sidecar — record as a warning so callers
          // know the constraint was NOT evaluated, rather than silently passing.
          failures.push({
            step: 'constraint',
            field: field.name,
            message: `Constraint on field '${field.name}' could not be evaluated inline (requires CEL sidecar): ${constraint.expr}`,
            severity: 'warning',
          });
        }
      }
    }
  }

  return failures;
}

/**
 * Evaluate a simple CEL-like expression inline.
 * Returns true (pass), false (fail), or null (cannot evaluate).
 */
function evaluateCelExpr(
  expr: string,
  fieldName: string,
  properties: Record<string, unknown>,
): boolean | null {
  // Simple comparison: "this.fieldName > N" or "this.fieldName >= N"
  const comparisonMatch = expr.match(
    /^this\.(\w+)\s*(>=|<=|!=|==|>|<)\s*(.+)$/,
  );
  if (comparisonMatch) {
    const [, refField, op, rawValue] = comparisonMatch;
    const fieldValue = properties[refField!];
    if (typeof fieldValue !== 'number') return null;
    const numValue = Number(rawValue!.trim());
    if (isNaN(numValue)) return null;

    return applyNumericOp(fieldValue, op!, numValue);
  }

  // Bare "value OP N" — for field-level constraints where `value` refers to the field
  const valueCompMatch = expr.match(
    /^value\s*(>=|<=|!=|==|>|<)\s*(.+)$/,
  );
  if (valueCompMatch) {
    const [, op, rawValue] = valueCompMatch;
    const fieldValue = properties[fieldName];
    if (typeof fieldValue !== 'number') return null;
    const numValue = Number(rawValue!.trim());
    if (isNaN(numValue)) return null;

    return applyNumericOp(fieldValue, op!, numValue);
  }

  // size() check: "size(this.fieldName) > N"
  const sizeMatch = expr.match(
    /^size\(this\.(\w+)\)\s*(>|<|>=|<=|==|!=)\s*(\d+)$/,
  );
  if (sizeMatch) {
    const [, refField, op, rawValue] = sizeMatch;
    const fieldValue = properties[refField!];
    return applySizeOp(fieldValue, op!, Number(rawValue));
  }

  // size(value) check: "size(value) > N" — for field-level constraints
  const sizeValueMatch = expr.match(
    /^size\(value\)\s*(>|<|>=|<=|==|!=)\s*(\d+)$/,
  );
  if (sizeValueMatch) {
    const [, op, rawValue] = sizeValueMatch;
    const fieldValue = properties[fieldName];
    return applySizeOp(fieldValue, op!, Number(rawValue));
  }

  // Cannot evaluate — delegate to CEL sidecar
  return null;
}

/** Apply a numeric comparison operator. */
function applyNumericOp(left: number, op: string, right: number): boolean | null {
  switch (op) {
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '==': return left === right;
    case '!=': return left !== right;
    default: return null;
  }
}

/** Apply a size comparison. Returns null if value type is unsupported. */
function applySizeOp(fieldValue: unknown, op: string, target: number): boolean | null {
  let size: number;
  if (typeof fieldValue === 'string') {
    size = fieldValue.length;
  } else if (Array.isArray(fieldValue)) {
    size = fieldValue.length;
  } else {
    return null;
  }
  return applyNumericOp(size, op, target);
}

/**
 * Step 1b: Immutable field check (Section 2.3.3).
 *
 * On update operations, any property that has @immutable must not be present
 * in the update patch. Checks against the raw patch keys (not merged state)
 * so that existing immutable field values from creation don't trigger a false positive.
 */
function checkImmutableFields(
  objectType: ObjectType,
  patchKeys: Set<string>,
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  for (const field of objectType.fields) {
    const isImmutable = field.directives.some((d) => d.kind === 'immutable');
    if (!isImmutable) continue;

    if (patchKeys.has(field.name)) {
      failures.push({
        step: 'immutable',
        field: field.name,
        message: `Field '${field.name}' is @immutable and cannot be changed after creation`,
      });
    }
  }

  return failures;
}

/**
 * Step 2b: Type-level constraint evaluation (Section 2.3.2).
 *
 * Evaluates @constraint directives applied to the type itself (not fields).
 * These use `this` to reference the full object state. When a `CelEvaluator`
 * is provided, expressions are routed through it; otherwise the inline
 * evaluator is used (with the same warning-on-unevaluable semantics as
 * field-level constraints).
 */
async function evaluateTypeConstraints(
  objectType: ObjectType,
  properties: Record<string, unknown>,
  celEvaluator?: CelEvaluator,
): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];

  const constraints = objectType.directives.filter(
    (d): d is { kind: 'constraint'; expr: string } => d.kind === 'constraint',
  );

  for (const constraint of constraints) {
    if (celEvaluator) {
      const celResult = await celEvaluator.evaluate(constraint.expr, {
        this: properties,
      });
      if (celResult.error) {
        failures.push({
          step: 'constraint',
          message: `Type constraint on '${objectType.name}' failed to evaluate: ${celResult.error}`,
        });
      } else if (celResult.value !== true) {
        failures.push({
          step: 'constraint',
          message: `Type constraint violated on '${objectType.name}': ${constraint.expr}`,
        });
      }
    } else {
      const result = evaluateCelExpr(constraint.expr, '', properties);
      if (result === false) {
        failures.push({
          step: 'constraint',
          message: `Type constraint violated on '${objectType.name}': ${constraint.expr}`,
        });
      } else if (result === null) {
        failures.push({
          step: 'constraint',
          message: `Type constraint on '${objectType.name}' could not be evaluated inline (requires CEL sidecar): ${constraint.expr}`,
          severity: 'warning',
        });
      }
    }
  }

  return failures;
}

/**
 * Step 3: Uniqueness check.
 * Queries the storage provider to verify @unique field values don't conflict.
 *
 * CQ-01: TOCTOU race condition — This check is advisory only. The caller MUST
 * run within a serializable transaction or rely on DB UNIQUE constraints to
 * prevent concurrent inserts from creating duplicates between the check and
 * the subsequent INSERT. The PostgreSQL SPI provider should add UNIQUE indexes
 * on all @unique fields during schema migration.
 */
async function checkUniqueness(
  objectType: ObjectType,
  properties: Record<string, unknown>,
  ctx: RequestContext,
  storage: StorageProvider,
  typeName: string,
  existingId?: string,
): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];

  const uniqueFields = objectType.fields.filter((f) =>
    f.directives.some((d) => d.kind === 'unique'),
  );

  for (const field of uniqueFields) {
    const value = properties[field.name];
    if (value === undefined || value === null) continue;

    const result = await storage.queryObjects(ctx, typeName, {
      field: field.name,
      operator: 'eq',
      value,
    });

    // Filter out the current object (for updates)
    const conflicts = existingId
      ? result.items.filter((obj) => obj._id !== existingId)
      : result.items;

    if (conflicts.length > 0) {
      failures.push({
        step: 'uniqueness',
        field: field.name,
        message: `Uniqueness violation: field '${field.name}' with value '${String(value)}' already exists`,
      });
    }
  }

  return failures;
}

/** Check if a field is a system-managed field (primary key). */
function isSystemField(field: FieldDefinition): boolean {
  return field.directives.some((d) => d.kind === 'primary');
}

/** Check if a field is computed (including @reducer fields). */
function isComputedField(field: FieldDefinition): boolean {
  return field.directives.some((d) => d.kind === 'computed' || d.kind === 'reducer');
}

/** Check if a field is a link reference. */
function isLinkField(field: FieldDefinition): boolean {
  return field.directives.some((d) => d.kind === 'link');
}

/**
 * Schema-level field validation only: required (non-null with no `@default`),
 * enum membership, and scalar shape. Deliberately excludes the uniqueness check
 * (needs storage) and constraint evaluation (needs CEL), so it is synchronous
 * and safe to call from inside an open write transaction.
 *
 * Exported for the action pipeline, which writes through the storage
 * transaction directly rather than through ObjectManager and so never reached
 * `validateObjectProperties`. Without it a missing required field surfaced as
 * whatever the provider happened to raise — `EFFECT_EXECUTION_ERROR` on memory,
 * a raw Postgres `23502` on the other — for the same ODL and the same action.
 *
 * Callers validating an UPDATE must pass the merged object (existing state plus
 * the patch), not the patch alone: a patch that omits a required field is
 * legitimate, and checking the patch in isolation would reject it.
 */
export function validateSchemaFields(
  schema: ParsedSchema,
  typeName: string,
  properties: Record<string, unknown>,
): ValidationFailure[] {
  const objectType = schema.objectTypes.find((t) => t.name === typeName);
  if (!objectType) {
    return [{ step: 'schema', message: `Unknown object type: ${typeName}` }];
  }
  const enumMap = new Map<string, Set<string>>();
  for (const e of schema.enums) {
    enumMap.set(e.name, new Set(e.values.map((v) => v.name)));
  }
  const structMap = new Map<string, StructDefinition>(
    (schema.structTypes ?? []).map(s => [s.name, s]),
  );
  return validateSchema(objectType, properties, enumMap, structMap);
}

/**
 * Creates a structured PlatformError for validation failures.
 */
export function validationError(failures: ValidationFailure[]): PlatformError {
  return {
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: failures.map((f) => f.message).join('; '),
    retryable: false,
    details: { failures },
  };
}
