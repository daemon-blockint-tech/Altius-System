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

/**
 * A reducer is a first-class aggregation over linked objects.
 *
 * Unlike `@computed(fn: "sumLinks", args: {...})` which references a
 * function by name, `@reducer` declares the aggregation structurally:
 * which link type to aggregate over, which direction, which function
 * (COUNT/SUM/AVG/MIN/MAX), and which target property to aggregate.
 *
 * Example ODL:
 *   totalOrderValue: Float @reducer(
 *     linkType: "OrderedFrom",
 *     direction: OUTBOUND,
 *     function: SUM,
 *     field: "unitCost"
 *   )
 *
 * The engine evaluates reducers the same way as computed fields — at read
 * time (LAZY) — but the structured declaration makes the aggregation
 * intent explicit and verifiable at schema-load time, rather than opaque
 * inside a function name + args blob.
 */
export interface ReducerDirective {
  kind: 'reducer';
  /** The link type to traverse. */
  linkType: string;
  /** Direction of traversal: INBOUND (links pointing TO this object) or OUTBOUND. */
  direction: Direction;
  /** Aggregation function: COUNT, SUM, AVG, MIN, MAX. */
  function: ReducerFunction;
  /** The property on the linked object to aggregate. Required for SUM/AVG/MIN/MAX; omitted for COUNT. */
  field?: string;
  /** Cache strategy (same as @computed). Defaults to LAZY. */
  cache?: CacheStrategy;
}

export type ReducerFunction = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

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

/**
 * Field-level presentation metadata (Ontology display layer).
 *
 * Purely declarative rendering hints consumed by clients; they never affect
 * storage, validation, or authorization. Exposed on the OpenAPI document as an
 * `x-altius-display` vendor extension so a UI can drive labels, grouping, and
 * formatting without hard-coding them.
 */
export interface DisplayDirective {
  kind: 'display';
  /** Human-readable field label (defaults to the field name in a client). */
  label?: string;
  /** Grouping bucket for laying out related fields (e.g. "Pricing"). */
  group?: string;
  /** Ordinal within a type/group; lower sorts first. */
  order?: number;
  /** Renderer hint, e.g. "badge", "currency", "progress", "text". */
  renderHint?: string;
  /** Value format string, e.g. "0.00" or "YYYY-MM-DD". */
  format?: string;
  /** Hide from default views (a presentation default, not an access control). */
  hidden?: boolean;
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
  | ReducerDirective
  | ConstraintDirective
  | DefaultDirective
  | DeprecatedDirective
  | TerminologyDirective
  | SearchableDirective
  | DisplayDirective;

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

/**
 * Type-level presentation metadata (Ontology display layer).
 *
 * Declarative rendering hints for an ObjectType, consumed by clients and
 * surfaced on the OpenAPI document as an `x-altius-display` vendor extension.
 * `titleProperty`/`statusProperty` name fields on the type (validated), letting
 * a client pick a headline and a status field without platform code.
 */
export interface TypeDisplayDirective {
  kind: 'display';
  /** Singular human-readable name (e.g. "Purchase order"). */
  label?: string;
  /** Plural human-readable name (e.g. "Purchase orders"). */
  pluralLabel?: string;
  /** Icon token a client resolves to a glyph (e.g. "cube"). */
  icon?: string;
  /** Accent color token for the type (e.g. "blue" or a hex string). */
  color?: string;
  /** Field whose value is the object's title/headline. Must exist on the type. */
  titleProperty?: string;
  /** Field whose value represents the object's status. Must exist on the type. */
  statusProperty?: string;
}

export interface StructDirective {
  kind: 'struct';
}

export type TypeDirective =
  | ObjectTypeDirective
  | LinkTypeDirective
  | ActionTypeDirective
  | FunctionDirective
  | DeprecatedDirective
  | TypeConstraintDirective
  | TypeDisplayDirective
  | StructDirective;

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

// ─── Struct (value type) ───

/**
 * A Struct is a nested value type: a named collection of fields stored as a
 * JSONB column on its parent object, with no identity (_id), no storage table,
 * and no links. Structs are validated recursively against their field
 * definitions. A struct field may reference a scalar, an enum, or another
 * struct (nesting), but not an ObjectType, LinkType, or ActionType.
 *
 * Declared with the `@struct` directive on a `type` definition:
 *
 *   type Address @struct {
 *     street: String!
 *     city: String!
 *   }
 */
export interface StructDefinition {
  kind: 'struct';
  name: string;
  description?: string;
  fields: FieldDefinition[];
  directives: TypeDirective[];
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
  /**
   * Struct value types declared with `@struct`. Optional for backward
   * compatibility with test fixtures that construct ParsedSchema manually;
   * the parser always initializes it to `[]`.
   */
  structTypes?: StructDefinition[];
}
