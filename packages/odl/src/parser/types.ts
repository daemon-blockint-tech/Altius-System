/**
 * ODL Parser AST types.
 *
 * These types represent the parsed output of an ODL schema file.
 * ODL files are valid GraphQL SDL with Altius directives.
 */

// ─── Directive argument value types ───

export type DirectiveArgValue = string | number | boolean | null | DirectiveArgValue[] | { [key: string]: DirectiveArgValue };

// ─── Cardinality & Direction enums ───

export type Cardinality = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';

export type Direction = 'INBOUND' | 'OUTBOUND';

export type CacheStrategy = 'LAZY' | 'EAGER' | 'NONE';

// ─── Field Directives ───

export interface PrimaryDirective {
  kind: 'primary';
}

export interface UniqueDirective {
  kind: 'unique';
}

export interface IndexedDirective {
  kind: 'indexed';
}

export interface ReadonlyDirective {
  kind: 'readonly';
}

export interface SensitiveDirective {
  kind: 'sensitive';
}

export interface ParamDirective {
  kind: 'param';
}

export interface LinkDirective {
  kind: 'link';
  type: string;
  direction: Direction;
  history?: boolean;
}

export interface ComputedDirective {
  kind: 'computed';
  fn: string;
  args?: DirectiveArgValue;
  cache?: CacheStrategy;
  ttl?: string;
}

export interface ConstraintDirective {
  kind: 'constraint';
  expr: string;
}

export interface DefaultDirective {
  kind: 'default';
  value: DirectiveArgValue;
}

export interface DeprecatedDirective {
  kind: 'deprecated';
  reason: string;
}

export interface TerminologyDirective {
  kind: 'terminology';
  system: string;
}

export interface SearchableDirective {
  kind: 'searchable';
  weight?: number;
  analyzer?: string;
}

export interface ImmutableDirective {
  kind: 'immutable';
}

export type FieldDirective =
  | PrimaryDirective
  | UniqueDirective
  | IndexedDirective
  | ReadonlyDirective
  | ImmutableDirective
  | SensitiveDirective
  | ParamDirective
  | LinkDirective
  | ComputedDirective
  | ConstraintDirective
  | DefaultDirective
  | DeprecatedDirective
  | TerminologyDirective
  | SearchableDirective;

// ─── Type Directives ───

export interface ObjectTypeDirective {
  kind: 'objectType';
}

export interface LinkTypeDirective {
  kind: 'linkType';
  from: string;
  to: string;
  cardinality: Cardinality;
}

export interface ActionTypeDirective {
  kind: 'actionType';
  /**
   * Explicit OpenFGA permission relation checked before this action runs
   * (e.g. `can_transfer`). Optional: when omitted the name is derived from the
   * action name. Declare it when the derivation is ambiguous — the fallback
   * strips words matching ObjectType names, so introducing an unrelated
   * ObjectType can otherwise rename an existing relation.
   */
  permission?: string;
}

export interface FunctionDirective {
  kind: 'function';
  runtime: string;
  entry: string;
  /**
   * Comma-separated platform roles allowed to invoke this function.
   *
   * Roles rather than an OpenFGA relation (which is what @actionType's
   * `permission` names): a function takes scalar inputs and has no object to
   * check a relation against, so there is nothing for ReBAC to resolve.
   *
   * Absent means nobody may invoke it — see FunctionType.requiredRoles.
   */
  requiredRoles?: string;
}

/** Type-level @constraint directive (Section 2.3.2). Uses `this` to reference the object. */
export interface TypeConstraintDirective {
  kind: 'constraint';
  expr: string;
}

export type TypeDirective =
  | ObjectTypeDirective
  | LinkTypeDirective
  | ActionTypeDirective
  | FunctionDirective
  | DeprecatedDirective
  | TypeConstraintDirective;

// ─── Field type reference ───

export interface FieldTypeRef {
  /** The base type name (e.g., "String", "Patient", "PatientStatus"). */
  name: string;
  /** Whether the field is non-null (has !). */
  nonNull: boolean;
  /** Whether the field is a list type. */
  isList: boolean;
  /** Whether list elements are non-null (e.g., [Patient!]!). */
  listElementNonNull: boolean;
}

// ─── Field definition ───

export interface FieldDefinition {
  name: string;
  type: FieldTypeRef;
  description?: string;
  directives: FieldDirective[];
}

// ─── Object Type ───

export interface ObjectType {
  kind: 'objectType';
  name: string;
  description?: string;
  fields: FieldDefinition[];
  interfaces: string[];
  directives: TypeDirective[];
}

// ─── Link Type ───

export interface LinkType {
  kind: 'linkType';
  name: string;
  description?: string;
  from: string;
  to: string;
  cardinality: Cardinality;
  fields: FieldDefinition[];
  directives: TypeDirective[];
}

// ─── Action Type ───

export interface ActionType {
  kind: 'actionType';
  name: string;
  description?: string;
  fields: FieldDefinition[];
  directives: TypeDirective[];
}

// ─── Function Type ───

/**
 * A FunctionType is a user-authored function invokable directly from the
 * API (analogous to Palantir Foundry Functions). Distinguished from an
 * ActionType by being a pure computation: it has no YAML manifest, no
 * effects, no side-effects, and no transactional mutation. A type with
 * `@function` but no `@actionType` is routed here; a type with both
 * `@actionType @function(...)` remains an ActionType (function-backed
 * action, back-compat).
 */
export interface FunctionType {
  kind: 'functionType';
  name: string;
  description?: string;
  fields: FieldDefinition[];
  directives: TypeDirective[];
  /** Runtime adapter name (e.g. "node20", "cel"). */
  runtime: string;
  /** Pack-relative entry path (e.g. "compute-score/index.js"). */
  entry: string;
  /**
   * Platform roles allowed to invoke this function.
   *
   * Empty means nobody: invocation is denied. Fail-closed is deliberate — a
   * function runs pack-authored code, and defaulting an undeclared function to
   * "any authenticated caller" is how it behaved before this field existed.
   */
  requiredRoles: string[];
}

// ─── Enum ───

export interface EnumValue {
  name: string;
  description?: string;
  directives: FieldDirective[];
}

export interface EnumDefinition {
  kind: 'enum';
  name: string;
  description?: string;
  values: EnumValue[];
}

// ─── Interface ───

export interface InterfaceDefinition {
  kind: 'interface';
  name: string;
  description?: string;
  fields: FieldDefinition[];
}

// ─── Scalar ───

export interface ScalarDefinition {
  kind: 'scalar';
  name: string;
  description?: string;
}

// ─── Namespace ───

export interface NamespaceMetadata {
  name: string;
  version: string;
}

// ─── Parsed Schema (top-level AST) ───

export interface ParsedSchema {
  namespace?: NamespaceMetadata;
  objectTypes: ObjectType[];
  linkTypes: LinkType[];
  actionTypes: ActionType[];
  functionTypes: FunctionType[];
  enums: EnumDefinition[];
  interfaces: InterfaceDefinition[];
  scalars: ScalarDefinition[];
}
