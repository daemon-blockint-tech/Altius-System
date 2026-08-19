/**
 * ODL Codegen — GraphQL API schema generation from ParsedSchema.
 *
 * Compiles a validated ParsedSchema into GraphQL SDL following
 * Altius spec Section 8.1.
 */

import type {
  ParsedSchema,
  ObjectType,
  LinkType,
  ActionType,
  FunctionType,
  FieldDefinition,
  InterfaceDefinition,
  StructDefinition,
  LinkDirective,
} from '../parser/types.js';

// ─── Scalar type mapping from ODL to GraphQL ───

const SCALAR_MAP: Record<string, string> = {
  ID: 'ID',
  String: 'String',
  Int: 'Int',
  Float: 'Float',
  Boolean: 'Boolean',
  Date: 'Date',
  DateTime: 'DateTime',
  Duration: 'Duration',
  GeoPoint: 'GeoPoint',
  JSON: 'JSON',
  URI: 'URI',
  Attachment: 'Attachment',
};

const BUILTIN_SCALARS = new Set(Object.keys(SCALAR_MAP));

// ODL custom scalars that need explicit declaration in GraphQL
const CUSTOM_SCALARS = ['Date', 'DateTime', 'Duration', 'GeoPoint', 'JSON', 'URI', 'Attachment'];

// ─── Filter operator types by scalar category ───

// Only expose operators that the SPI and both storage providers support.
// notIn and endsWith are NOT supported — see SPI FieldPredicate.operator.
const STRING_FILTER_OPS = ['eq', 'ne', 'in', 'contains', 'startsWith'];
const NUMERIC_FILTER_OPS = ['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte'];
const BOOLEAN_FILTER_OPS = ['eq', 'ne'];
const ID_FILTER_OPS = ['eq', 'ne', 'in'];

const NUMERIC_TYPES = new Set(['Int', 'Float']);
const ORDERABLE_TYPES = new Set(['ID', 'String', 'Int', 'Float', 'Date', 'DateTime', 'Duration', 'URI']);

function getFilterOps(typeName: string): string[] {
  if (typeName === 'ID') return ID_FILTER_OPS;
  if (typeName === 'Boolean') return BOOLEAN_FILTER_OPS;
  if (NUMERIC_TYPES.has(typeName) || typeName === 'Date' || typeName === 'DateTime' || typeName === 'Duration') {
    return NUMERIC_FILTER_OPS;
  }
  return STRING_FILTER_OPS;
}

function getFilterGqlType(typeName: string, op: string): string {
  if (op === 'in') return `[${typeName}!]`;
  return typeName;
}

// ─── Helpers ───

function isPrimaryField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'primary');
}

function isParamField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'param');
}

function isLinkField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'link');
}

function isComputedField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'computed' || d.kind === 'reducer' || d.kind === 'timeSeries');
}

/** Get scalar fields (non-link, non-computed) suitable for filters. */
function getScalarFields(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.filter(f => !isLinkField(f) && !isComputedField(f));
}

/**
 * Map an ODL field type to a GraphQL type string.
 * Per Section 7.1.3: non-primary fields are made nullable in the generated schema.
 */
function fieldToGqlType(field: FieldDefinition, forceNonNull = false): string {
  const { type } = field;
  const isPrimary = isPrimaryField(field);

  if (type.isList) {
    const elementType = type.listElementNonNull ? `${type.name}!` : type.name;
    // Lists on non-primary fields: outer list nullable per Section 7.1.3
    if (isPrimary || forceNonNull) {
      return type.nonNull ? `[${elementType}]!` : `[${elementType}]`;
    }
    return `[${elementType}]`;
  }

  // Primary fields keep their declared nullability
  if (isPrimary || forceNonNull) {
    return type.nonNull ? `${type.name}!` : type.name;
  }

  // All non-primary fields become nullable (Section 7.1.3)
  return type.name;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Detect the @link directive on a field, if present. */
function linkDirectiveOf(field: FieldDefinition): LinkDirective | undefined {
  return field.directives.find((d): d is LinkDirective => d.kind === 'link');
}

// ─── Type generators ───

function generateObjectType(obj: ObjectType): string {
  const lines: string[] = [];
  const implementsClause = obj.interfaces.length > 0 ? ` implements ${obj.interfaces.join(' & ')}` : '';
  lines.push(`type ${obj.name}${implementsClause} {`);

  for (const field of obj.fields) {
    const gqlType = fieldToGqlType(field);
    // List link fields return a Relay Connection with pagination arguments
    // so callers can page through large collections instead of being silently
    // truncated. Single-valued link fields stay as plain object references.
    const link = linkDirectiveOf(field);
    if (link && field.type.isList) {
      lines.push(`  ${field.name}(first: Int, after: String): ${field.type.name}Connection!`);
    } else {
      lines.push(`  ${field.name}: ${gqlType}`);
    }
  }

  // Optimistic concurrency: the value callers pass back as `_expectedVersion`
  // on action inputs / `expectedVersion` on update mutations.
  lines.push(`  _version: Int`);

  // Actor attribution: who produced this version. Set from
  // RequestContext.actorId on every write, surfaced in history snapshots so
  // the edit timeline can show who made each change.
  lines.push(`  _actorId: String`);

  // Spec: metadata fields for redaction/consent
  lines.push(`  _redactedFields: [String!]`);
  lines.push(`  _consentRestricted: Boolean`);

  // Edit history — returns all stored versions of this object, oldest first.
  // Each entry is the same type, so callers can render a diff timeline.
  // The optional asOf argument narrows the list to the single version that
  // was live at the given instant — the same question REST answers with
  // ?asOf on the history route.
  lines.push(`  """All stored versions of this object, oldest first."""`);
  lines.push(`  history(asOf: String): [${obj.name}!]`);

  lines.push('}');
  return lines.join('\n');
}

/**
 * Interface fields use the same fieldToGqlType policy as ObjectType fields
 * (non-primary fields rendered nullable, Section 7.1.3's redaction rule) —
 * NOT forced non-null. GraphQL requires an implementing type's field to be
 * at least as strict as the interface's; since every implementing
 * ObjectType downgrades its own non-primary fields to nullable, an
 * interface field declared non-null here would make every implementer's
 * matching field an invalid (less-strict) override. Rendering both sides
 * through the identical rule keeps `implements` valid by construction.
 */
function generateInterfaceType(iface: InterfaceDefinition): string {
  const lines: string[] = [];
  if (iface.description) {
    lines.push(`"""${iface.description}"""`);
  }
  lines.push(`interface ${iface.name} {`);
  for (const field of iface.fields) {
    const gqlType = fieldToGqlType(field);
    lines.push(`  ${field.name}: ${gqlType}`);
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Struct types are emitted as GraphQL `type` definitions (not input types)
 * so they can be returned from queries. They have no connections, no filters,
 * no mutations — they are plain value objects nested inside their parent.
 *
 * An `input` companion is also emitted so struct-typed fields can appear in
 * mutation inputs (GraphQL forbids output `type`s inside `input`s).
 */
function generateStructType(st: StructDefinition): string {
  const lines: string[] = [];
  if (st.description) {
    lines.push(`"""${st.description}"""`);
  }
  lines.push(`type ${st.name} {`);
  for (const field of st.fields) {
    const gqlType = fieldToGqlType(field);
    lines.push(`  ${field.name}: ${gqlType}`);
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate the `input` companion for a struct type, so struct-typed fields
 * can appear in mutation inputs. Field types reference `<Name>Input` for
 * nested structs, scalars/enums directly, and `[<Elem>Input!]` for lists.
 */
function generateStructInputType(
  st: StructDefinition,
  structNames: ReadonlySet<string>,
): string {
  const lines: string[] = [`input ${st.name}Input {`];
  for (const field of st.fields) {
    const baseName = field.type.name;
    const inputName = structNames.has(baseName) ? `${baseName}Input` : baseName;
    const elem = field.type.isList
      ? `[${inputName}${field.type.listElementNonNull ? '!' : ''}]`
      : inputName;
    const gqlType = field.type.nonNull ? `${elem}!` : elem;
    lines.push(`  ${field.name}: ${gqlType}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateLinkType(link: LinkType): string {
  const lines: string[] = [];
  lines.push(`type ${link.name} {`);

  for (const field of link.fields) {
    const gqlType = fieldToGqlType(field);
    lines.push(`  ${field.name}: ${gqlType}`);
  }

  lines.push('}');
  return lines.join('\n');
}

function generateConnection(typeName: string): string {
  return [
    `type ${typeName}Connection {`,
    `  edges: [${typeName}Edge!]!`,
    `  pageInfo: PageInfo!`,
    `  totalCount: Int!`,
    `}`,
    '',
    `type ${typeName}Edge {`,
    `  node: ${typeName}!`,
    `  cursor: String!`,
    `}`,
  ].join('\n');
}

/**
 * Input for a generic update mutation.
 *
 * Every field is optional: an update is a partial patch, and requiring the
 * whole object would make a caller read-modify-write just to change one
 * property — and race anyone else doing the same. The @primary field is
 * excluded because storage mints it and it is the mutation's `id` argument;
 * @readonly and @immutable fields are excluded because the write path refuses
 * them anyway, so advertising them would invite a request that always fails.
 */
function generateUpdateInput(
  obj: ObjectType,
  objectTypeNames: ReadonlySet<string>,
  structNames: ReadonlySet<string> = new Set(),
): string {
  const lines: string[] = [`input Update${obj.name}Input {`];
  for (const field of getScalarFields(obj.fields)) {
    if (isPrimaryField(field)) continue;
    if (field.directives.some(d => d.kind === 'readonly' || d.kind === 'immutable')) continue;
    // An ObjectType-typed field is an output type; GraphQL refuses it inside
    // an input. Relationships are edited through link effects, not by
    // patching an embedded object, so skipping it is also the right shape.
    if (objectTypeNames.has(field.type.name)) continue;
    // A struct-typed field uses its `input` companion (e.g. `AddressInput`)
    // because GraphQL forbids output `type`s inside `input`s.
    if (structNames.has(field.type.name)) {
      const inputName = `${field.type.name}Input`;
      const elem = field.type.isList ? `[${inputName}!]` : inputName;
      lines.push(`  ${field.name}: ${elem}`);
      continue;
    }
    // Strip the non-null marker: a partial patch omits what it does not change.
    const gqlType = fieldToGqlType(field).replace(/!$/, '');
    lines.push(`  ${field.name}: ${gqlType}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateFilter(obj: ObjectType, enumNames: Set<string>): string {
  const lines: string[] = [];
  lines.push(`input ${obj.name}Filter {`);

  const scalarFields = getScalarFields(obj.fields);
  for (const field of scalarFields) {
    const typeName = field.type.name;
    if (BUILTIN_SCALARS.has(typeName)) {
      lines.push(`  ${field.name}: ${typeName}Filter`);
    }
    // Enum fields get their own filter. Non-enum, non-builtin types
    // (interfaces, or an ObjectType referenced outside @link) have no
    // generated *Filter input to reference — filtering on them is not
    // supported, so they're excluded rather than emitting a dangling type.
    if (enumNames.has(typeName) && !field.type.isList) {
      lines.push(`  ${field.name}: ${typeName}Filter`);
    }
  }

  lines.push(`  AND: [${obj.name}Filter!]`);
  lines.push(`  OR: [${obj.name}Filter!]`);
  lines.push(`  NOT: ${obj.name}Filter`);
  lines.push('}');
  return lines.join('\n');
}

function generateScalarFilter(typeName: string): string {
  // GeoPoint is a JSONB {lat,lng}; scalar comparison operators are meaningless.
  // Expose spatial bounding-box containment plus presence instead.
  if (typeName === 'GeoPoint') {
    return [
      'input GeoPointFilter {',
      '  within: GeoBoundingBoxInput',
      '  exists: Boolean',
      '}',
    ].join('\n');
  }
  // Attachment is a JSONB blob reference; scalar comparison is meaningless.
  // Expose only presence checking.
  if (typeName === 'Attachment') {
    return [
      'input AttachmentFilter {',
      '  exists: Boolean',
      '}',
    ].join('\n');
  }
  const ops = getFilterOps(typeName);
  const lines: string[] = [];
  lines.push(`input ${typeName}Filter {`);
  for (const op of ops) {
    lines.push(`  ${op}: ${getFilterGqlType(typeName, op)}`);
  }
  lines.push('}');
  return lines.join('\n');
}

/** Inclusive lat/lng bounding box input for the GeoPoint `within` filter. */
function generateGeoBoundingBoxInput(): string {
  return [
    'input GeoBoundingBoxInput {',
    '  minLat: Float!',
    '  minLng: Float!',
    '  maxLat: Float!',
    '  maxLng: Float!',
    '}',
  ].join('\n');
}

function generateOrderBy(obj: ObjectType, enumNames: Set<string>): string {
  const lines: string[] = [];
  lines.push(`input ${obj.name}OrderBy {`);

  const scalarFields = getScalarFields(obj.fields);
  for (const field of scalarFields) {
    if (ORDERABLE_TYPES.has(field.type.name) || enumNames.has(field.type.name)) {
      lines.push(`  ${field.name}: SortDirection`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function generateMutationInputType(
  action: ActionType,
  objectTypeNames: Set<string>,
  structNames: ReadonlySet<string> = new Set(),
): string {
  const lines: string[] = [];
  lines.push(`input ${action.name}Input {`);

  const paramFields = action.fields.filter(isParamField);
  for (const field of paramFields) {
    // For action inputs, param fields referencing ObjectTypes use ID
    const typeName = resolveInputType(field, objectTypeNames, structNames);
    lines.push(`  ${field.name}: ${typeName}`);
  }

  // Optimistic concurrency, opt-in: the `_version` the caller believes the
  // action's target object carries. Mismatch fails with VERSION_CONFLICT
  // before any effect runs. The REST equivalent is the If-Match header.
  lines.push('  """`_version` this action asserts its target object is at. Omit to skip the check."""');
  lines.push('  _expectedVersion: Int');

  // Dry-run, opt-in: validate + authorize + check preconditions but do not
  // apply effects. The REST equivalent is ?dryRun=true.
  lines.push('  """If true, validate and authorize but do not apply effects. Returns success with no affectedObjects."""');
  lines.push('  dryRun: Boolean');

  lines.push('}');
  return lines.join('\n');
}

function resolveInputType(
  field: FieldDefinition,
  objectTypeNames: Set<string>,
  structNames: ReadonlySet<string> = new Set(),
): string {
  const { type } = field;
  // Object references become ID in action inputs — executor resolves by ID
  // Struct types use their `input` companion (e.g. `AddressInput`)
  const baseName = objectTypeNames.has(type.name)
    ? 'ID'
    : structNames.has(type.name)
      ? `${type.name}Input`
      : type.name;
  if (type.isList) {
    const elem = type.listElementNonNull ? `${baseName}!` : baseName;
    return type.nonNull ? `[${elem}]!` : `[${elem}]`;
  }
  return type.nonNull ? `${baseName}!` : baseName;
}

function generateMutationResultType(action: ActionType): string {
  return [
    `type ${action.name}Result {`,
    `  success: Boolean!`,
    `  actionId: ID!`,
    `  errors: [ActionError!]`,
    `  affectedObjects: [AffectedObject!]`,
    `}`,
  ].join('\n');
}

// ─── Function type generation ───

function generateFunctionInputType(
  fn: FunctionType,
  objectTypeNames: Set<string>,
  structNames: ReadonlySet<string> = new Set(),
): string {
  const lines: string[] = [];
  lines.push(`input ${fn.name}FunctionInput {`);
  const paramFields = fn.fields.filter(isParamField);
  for (const field of paramFields) {
    const typeName = resolveInputType(field, objectTypeNames, structNames);
    lines.push(`  ${field.name}: ${typeName}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateFunctionResultType(fn: FunctionType): string {
  return [
    `type ${fn.name}FunctionResult {`,
    `  result: JSON`,
    `  logs: [LogEntry!]`,
    `  durationMs: Int!`,
    `}`,
  ].join('\n');
}

function generateChangeEvent(typeName: string): string {
  return [
    `type ${typeName}ChangeEvent {`,
    `  changeType: ChangeType!`,
    // Nullable: a DELETED event's object no longer exists in storage, so the
    // field resolver returns null rather than erroring the whole delivery.
    // The stub payload carries {id, _type}; the field resolver hydrates the
    // full object from storage for CREATED/UPDATED, and returns the stub
    // (with null fields) for DELETED.
    `  object: ${typeName}`,
    // previousValues is a field-level diff map ({ field: { old, new } }), not a
    // full object; causedBy is structured. Both match the runtime subscription
    // payload and the AsyncAPI event schema.
    `  previousValues: JSON`,
    `  causedBy: ActionReference`,
    `  timestamp: DateTime!`,
    `}`,
  ].join('\n');
}

// ─── Enum filter generation ───

function generateEnumFilter(enumName: string): string {
  return [
    `input ${enumName}Filter {`,
    `  eq: ${enumName}`,
    `  ne: ${enumName}`,
    `  in: [${enumName}!]`,
    `}`,
  ].join('\n');
}

// ─── Shared types ───

function generateSharedTypes(): string {
  return [
    '# ─── Shared types ───',
    '',
    'type PageInfo {',
    '  hasNextPage: Boolean!',
    '  hasPreviousPage: Boolean!',
    '  startCursor: String',
    '  endCursor: String',
    '}',
    '',
    'enum SortDirection {',
    '  ASC',
    '  DESC',
    '}',
    '',
    'enum ChangeType {',
    '  CREATED',
    '  UPDATED',
    '  DELETED',
    '}',
    '',
    '# Provenance of a change event: the action that caused it (null for',
    '# direct/non-action mutations). Mirrors the runtime ChangeEvent.causedBy',
    '# and spec Section 8.1 (causedBy: ActionReference).',
    'type ActionReference {',
    '  actionType: String',
    '  actionId: String',
    '}',
    '',
    'type ActionError {',
    '  code: String!',
    '  message: String!',
    '  field: String',
    '}',
    '',
    'type AffectedObject {',
    '  typeName: String!',
    '  id: ID!',
    '  changeType: ChangeType!',
    '}',
    '',
    '# ─── Function runtime (Section 6 — Functions) ───',
    '',
    'type LogEntry {',
    '  level: LogLevel!',
    '  message: String!',
    '  timestamp: DateTime!',
    '}',
    '',
    'enum LogLevel {',
    '  DEBUG',
    '  INFO',
    '  WARN',
    '  ERROR',
    '}',
    '',
    '# ─── Tool Discovery (Section 5.7) ───',
    '',
    'enum ToolKind {',
    '  ACTION',
    '  FUNCTION',
    '}',
    '',
    'type ToolDescriptor {',
    '  name: String!',
    '  kind: ToolKind!',
    '  description: String!',
    '  parameters: JSON!',
    '  returnType: JSON!',
    '  requiredPermissions: [String!]!',
    '  dryRunSupported: Boolean!',
    '  reversible: Boolean!',
    '  tags: [String!]!',
    '}',
    '',
    'input ToolFilter {',
    '  kind: ToolKind',
    '  tags: [String!]',
    '}',
    '',
    '# ─── Object Sets (Section 8.3) ───',
    '',
    'type ObjectSet {',
    '  id: ID!',
    '  name: String!',
    '  description: String',
    '  objectType: String!',
    '  filter: JSON',
    '  orderBy: JSON',
    '  limit: Int',
    '  aggregation: JSON',
    '  isPublic: Boolean!',
    '  createdBy: String!',
    '  createdAt: DateTime!',
    '  updatedAt: DateTime!',
    '}',
    '',
    'input CreateObjectSetInput {',
    '  name: String!',
    '  description: String',
    '  objectType: String!',
    '  filter: JSON',
    '  orderBy: JSON',
    '  limit: Int',
    '  aggregation: JSON',
    '  isPublic: Boolean',
    '}',
    '',
    'input UpdateObjectSetInput {',
    '  name: String',
    '  description: String',
    '  filter: JSON',
    '  orderBy: JSON',
    '  limit: Int',
    '  aggregation: JSON',
    '  isPublic: Boolean',
    '}',
    '',
    '# ─── Object Set Execution & Algebra ───',
    '',
    'type ObjectSetExecutionResult {',
    '  items: [JSON!]!',
    '  totalCount: Int!',
    '  hasNextPage: Boolean!',
    '  cursor: String',
    '}',
    '',
    'input ObjectSetExecutionInput {',
    '  limit: Int',
    '  offset: Int',
    '  after: String',
    '}',
    '',
    'enum SetAlgebraOp {',
    '  UNION',
    '  INTERSECT',
    '  DIFFERENCE',
    '}',
    '',
    'input SetAlgebraInput {',
    '  op: SetAlgebraOp!',
    '  leftSetId: ID!',
    '  rightSetId: ID!',
    '  name: String!',
    '  description: String',
    '  isPublic: Boolean',
    '}',
    '',
    '# ─── Relationship (care-team) grants (v0.2.0 A1) ───',
    '',
    'input RelationshipInput {',
    '  user: ID!',
    '  relation: String!',
    '  objectType: String!',
    '  objectId: ID!',
    '}',
    '',
    'type RelationshipResult {',
    '  subject: String!',
    '  relation: String!',
    '  object: String!',
    '  ok: Boolean!',
    '}',
    '',
    '# ─── Consent record (v0.2.0 A2) ───',
    '',
    'input ConsentInput {',
    '  subject: ID!',
    '  purpose: String',
    '  decision: String',
    '  evidence: String',
    '}',
    '',
    'type ConsentResult {',
    '  subject: String!',
    '  purpose: String!',
    '  decision: String!',
    '  recorded: Boolean!',
    '}',
    '',
    '# ─── Bulk Actions (Section 5.5) ───',
    '',
    'input BulkActionInput {',
    '  actionType: String!',
    '  items: [JSON!]!',
    '  idempotencyKey: String!',
    '  allOrNothing: Boolean',
    '  dryRun: Boolean',
    '}',
    '',
    'enum BulkJobStatus {',
    '  PENDING',
    '  RUNNING',
    '  COMPLETED',
    '  FAILED',
    '  PARTIAL',
    '}',
    '',
    'type BulkProgress {',
    '  total: Int!',
    '  succeeded: Int!',
    '  failed: Int!',
    '  pending: Int!',
    '}',
    '',
    'type BulkSummary {',
    '  totalItems: Int!',
    '  succeededCount: Int!',
    '  failedCount: Int!',
    '}',
    '',
    'type BulkItemError {',
    '  index: Int!',
    '  code: String!',
    '  message: String!',
    '}',
    '',
    'type BulkActionJob {',
    '  id: ID!',
    '  status: BulkJobStatus!',
    '  submittedAt: DateTime!',
    '  completedAt: DateTime',
    '  progress: BulkProgress!',
    '  summary: BulkSummary',
    '  errors: [BulkItemError!]',
    '}',
    '',
    '# ─── Function Lifecycle (draft → publish → deprecate, test, rollback) ───',
    '',
    'enum FunctionRevisionStatus {',
    '  DRAFT',
    '  PUBLISHED',
    '  DEPRECATED',
    '}',
    '',
    'type FunctionRevision {',
    '  id: ID!',
    '  functionName: String!',
    '  revision: Int!',
    '  status: FunctionRevisionStatus!',
    '  runtime: String!',
    '  entry: String!',
    '  source: String',
    '  testInputs: [JSON!]',
    '  expectedOutputs: [JSON!]',
    '  tenantId: String!',
    '  createdBy: String!',
    '  createdAt: DateTime!',
    '  publishedAt: DateTime',
    '}',
    '',
    'input CreateFunctionRevisionInput {',
    '  functionName: String!',
    '  runtime: String!',
    '  entry: String!',
    '  source: String',
    '  testInputs: [JSON!]',
    '  expectedOutputs: [JSON!]',
    '}',
    '',
    'type TestRunResult {',
    '  passed: Boolean!',
    '  results: [JSON!]!',
    '}',
    '',
    '# ─── LLM / AIP (Section AIP) ───',
    '',
    'input GenerateInput {',
    '  prompt: String!',
    '  model: String',
    '  temperature: Float',
    '  maxTokens: Int',
    '  systemPrompt: String',
    '  stop: [String!]',
    '}',
    '',
    'type GenerateResult {',
    '  text: String!',
    '  model: String!',
    '  promptTokens: Int!',
    '  completionTokens: Int!',
    '  totalTokens: Int!',
    '  finishReason: String!',
    '}',
    '',
    'input EmbedInput {',
    '  text: String!',
    '  model: String',
    '}',
    '',
    'type EmbedResult {',
    '  vector: [Float!]!',
    '  model: String!',
    '  dimensions: Int!',
    '}',
    '',
    '# ─── Audit trail (Section 7.2.1) ───',
    '',
    'type AuditRecord {',
    '  id: ID!',
    '  timestamp: DateTime!',
    '  traceId: String!',
    '  tenantId: String!',
    '  actor: AuditActor!',
    '  operation: AuditOperation!',
    '  detail: AuditDetail',
    '}',
    '',
    'type AuditActor {',
    '  type: String!',
    '  id: String!',
    '  roles: [String!]!',
    '  ip: String',
    '}',
    '',
    'type AuditOperation {',
    '  type: String!',
    '  objectType: String',
    '  objectId: ID',
    '  actionType: String',
    '  actionId: String',
    '  functionName: String',
    '}',
    '',
    'type AuditDetail {',
    '  before: JSON',
    '  after: JSON',
    '  query: String',
    '  result: String',
    '  denialReason: String',
    '  consentDecision: String',
    '}',
    '',
    'input AuditFilter {',
    '  actorId: String',
    '  actorType: String',
    '  objectType: String',
    '  objectId: ID',
    '  actionType: String',
    '  operationType: String',
    '  traceId: String',
    '  from: DateTime',
    '  to: DateTime',
    '}',
    '',
    'type AuditPage {',
    '  records: [AuditRecord!]!',
    '  totalCount: Int!',
    '  hasMore: Boolean!',
    '}',
  ].join('\n');
}

function generateCustomScalars(schema: ParsedSchema): string {
  // Collect all scalar types used across the schema that need explicit declaration
  const usedScalars = new Set<string>();

  const collectFromFields = (fields: FieldDefinition[]) => {
    for (const f of fields) {
      if (CUSTOM_SCALARS.includes(f.type.name)) {
        usedScalars.add(f.type.name);
      }
    }
  };

  for (const obj of schema.objectTypes) collectFromFields(obj.fields);
  for (const link of schema.linkTypes) collectFromFields(link.fields);
  for (const action of schema.actionTypes) collectFromFields(action.fields);
  for (const fn of schema.functionTypes) collectFromFields(fn.fields);

  // Also include user-defined scalars
  for (const scalar of schema.scalars) {
    usedScalars.add(scalar.name);
  }

  // DateTime is always needed for ChangeEvent.timestamp and BulkActionJob
  usedScalars.add('DateTime');
  // JSON needed for ToolDescriptor and BulkActionInput
  usedScalars.add('JSON');

  const lines: string[] = [];
  for (const name of CUSTOM_SCALARS) {
    if (usedScalars.has(name)) {
      lines.push(`scalar ${name}`);
    }
  }
  for (const scalar of schema.scalars) {
    if (!CUSTOM_SCALARS.includes(scalar.name)) {
      lines.push(`scalar ${scalar.name}`);
    }
  }

  return lines.join('\n');
}

function generateEnums(schema: ParsedSchema): string {
  return schema.enums
    .map(e => {
      const lines = [`enum ${e.name} {`];
      for (const v of e.values) {
        lines.push(`  ${v.name}`);
      }
      lines.push('}');
      return lines.join('\n');
    })
    .join('\n\n');
}

// ─── Collect enum names used in filters ───

function collectFilterEnumNames(schema: ParsedSchema): Set<string> {
  const enumNames = new Set(schema.enums.map(e => e.name));
  const usedInFilters = new Set<string>();

  for (const obj of schema.objectTypes) {
    const scalarFields = getScalarFields(obj.fields);
    for (const field of scalarFields) {
      if (enumNames.has(field.type.name)) {
        usedInFilters.add(field.type.name);
      }
    }
  }

  return usedInFilters;
}

// ─── Main generation function ───

/**
 * Generate a complete GraphQL SDL from a ParsedSchema.
 *
 * The generated schema follows the Altius spec Section 8.1:
 * - ObjectTypes become query/subscription types with Relay pagination
 * - ActionTypes become mutations with input/result types
 * - Field nullability follows Section 7.1.3 (non-primary fields nullable)
 * - Includes shared types for tools, bulk actions, and change events
 */
/** Codegen options that gate capability-specific surfaces. */
export interface GraphQLSchemaOptions {
  /**
   * Include the FDP/CDM projection query fields (cdmMetadata/cdmRecord/…).
   * Defaults to included; pass `false` to omit them for deployments whose
   * loaded packs do not declare the `cdm` capability (parity with the
   * capability-gated REST `/api/v1/cdm/*` mount).
   */
  cdm?: boolean;
}

export function generateGraphQLSchema(schema: ParsedSchema, options?: GraphQLSchemaOptions): string {
  const sections: string[] = [];
  const objectTypeNames = new Set(schema.objectTypes.map(o => o.name));
  const enumNames = new Set(schema.enums.map(e => e.name));

  // 1. Custom scalar declarations
  const scalars = generateCustomScalars(schema);
  if (scalars) sections.push(scalars);

  // 2. Enums from the ODL schema
  const enums = generateEnums(schema);
  if (enums) sections.push(enums);

  // 2b. Interface definitions — emit SDL blocks so interface-typed fields
  // and `implements` clauses resolve against a declared GraphQL interface.
  // Must precede ObjectTypes so `implements` targets and any interface-typed
  // field reference an already-declared type. Without this, the generated
  // schema references interfaces that are never declared, which fails
  // `buildSchema`.
  for (const iface of schema.interfaces) {
    sections.push(generateInterfaceType(iface));
  }

  // 2c. Struct types — emit SDL blocks so struct-typed fields resolve against
  // a declared GraphQL type. Must precede ObjectTypes for the same reason
  // interfaces do: a field `headquarters: Address` must find `Address` already
  // declared. Structs are plain value types with no connections or mutations.
  // An `input` companion is emitted for each so struct-typed fields can appear
  // in mutation inputs (GraphQL forbids output `type`s inside `input`s).
  const structNames = new Set((schema.structTypes ?? []).map(s => s.name));
  for (const st of schema.structTypes ?? []) {
    sections.push(generateStructType(st));
    sections.push(generateStructInputType(st, structNames));
  }

  // 3. Shared types
  sections.push(generateSharedTypes());

  // 4. Scalar filter types
  const usedScalarFilters = new Set<string>();
  for (const obj of schema.objectTypes) {
    const scalarFields = getScalarFields(obj.fields);
    for (const field of scalarFields) {
      if (BUILTIN_SCALARS.has(field.type.name)) {
        usedScalarFilters.add(field.type.name);
      }
    }
  }
  for (const name of usedScalarFilters) {
    sections.push(generateScalarFilter(name));
  }
  // GeoPointFilter references GeoBoundingBoxInput; emit it once when geo is used.
  if (usedScalarFilters.has('GeoPoint')) {
    sections.push(generateGeoBoundingBoxInput());
  }

  // 5. Enum filter types
  const filterEnums = collectFilterEnumNames(schema);
  for (const name of filterEnums) {
    sections.push(generateEnumFilter(name));
  }

  // 6. ObjectType types, connections, filters, order-by
  for (const obj of schema.objectTypes) {
    sections.push(generateObjectType(obj));
    sections.push(generateConnection(obj.name));
    sections.push(generateUpdateInput(obj, objectTypeNames, structNames));
    sections.push(generateFilter(obj, enumNames));
    sections.push(generateOrderBy(obj, enumNames));
    sections.push(generateChangeEvent(obj.name));
  }

  // 7. LinkType types (junction/edge types referenced by ObjectType link fields)
  //    Plus Connection types for link-record list fields (e.g. admissions).
  for (const link of schema.linkTypes) {
    sections.push(generateLinkType(link));
    sections.push(generateConnection(link.name));
  }

  // 8. Action input/result types
  for (const action of schema.actionTypes) {
    sections.push(generateMutationInputType(action, objectTypeNames, structNames));
    sections.push(generateMutationResultType(action));
  }

  // 8b. Function input/result types
  for (const fn of schema.functionTypes) {
    sections.push(generateFunctionInputType(fn, objectTypeNames, structNames));
    sections.push(generateFunctionResultType(fn));
  }

  // 9. Search types
  for (const obj of schema.objectTypes) {
    sections.push([
      `type SearchHit_${obj.name} {`,
      `  node: ${obj.name}!`,
      `  score: Float!`,
      `}`,
    ].join('\n'));

    sections.push([
      `type SearchResult_${obj.name} {`,
      `  hits: [SearchHit_${obj.name}!]!`,
      `  totalCount: Int!`,
      `  hasNextPage: Boolean!`,
      `}`,
    ].join('\n'));
  }

  // 10. Aggregation types
  sections.push([
    'enum AggregateFunction {',
    '  COUNT',
    '  SUM',
    '  AVG',
    '  MIN',
    '  MAX',
    '}',
  ].join('\n'));

  sections.push([
    'input AggregateFieldInput {',
    '  field: String!',
    '  fn: AggregateFunction!',
    '  alias: String',
    '}',
  ].join('\n'));

  sections.push([
    'enum BucketInterval {',
    '  DAY',
    '  WEEK',
    '  MONTH',
    '  YEAR',
    '}',
  ].join('\n'));

  sections.push([
    'input DateBucketInput {',
    '  field: String!',
    '  interval: BucketInterval!',
    '  alias: String',
    '}',
  ].join('\n'));

  sections.push([
    'input NumericBucketInput {',
    '  field: String!',
    '  min: Float!',
    '  max: Float!',
    '  numBuckets: Int!',
    '  alias: String',
    '}',
  ].join('\n'));

  // Union input type — GraphQL doesn't support union inputs directly, so we
  // use a wrapper with both date and numeric fields. The resolver checks
  // which is present.
  sections.push([
    'input BucketInput {',
    '  field: String!',
    '  date: DateBucketInput',
    '  numeric: NumericBucketInput',
    '}',
  ].join('\n'));

  sections.push([
    'input AggregateOrderByInput {',
    '  field: String!',
    '  direction: SortDirection = ASC',
    '}',
  ].join('\n'));

  sections.push([
    'type AggregateGroup {',
    '  keys: JSON!',
    '  values: JSON!',
    '}',
  ].join('\n'));

  // Traversal (search-around). Nodes come back with MIXED types — a path can
  // end on any object type — so there is no single GraphQL object type to
  // return. `properties: JSON` carries the record and `type` says what it is;
  // a caller wanting a typed object fetches it by id. A union would need every
  // object type as a member and still could not be selected without an inline
  // fragment per type.
  sections.push([
    'enum LinkDirection {',
    '  OUTBOUND',
    '  INBOUND',
    '}',
  ].join('\n'));

  sections.push([
    'input TraversalStepInput {',
    '  linkType: String!',
    '  direction: LinkDirection',
    '  filter: JSON',
    '}',
  ].join('\n'));

  sections.push([
    'type TraversalNode {',
    '  id: ID!',
    '  type: String!',
    '  properties: JSON!',
    '}',
  ].join('\n'));

  sections.push([
    'type TraversalEdge {',
    '  linkType: String!',
    '  fromId: ID!',
    '  toId: ID!',
    '}',
  ].join('\n'));

  // totalCount is what was RETURNED, not what the traversal reached: the
  // provider count would disclose the size of the part the caller cannot see.
  sections.push([
    'type TraversalResult {',
    '  nodes: [TraversalNode!]!',
    '  edges: [TraversalEdge!]!',
    '  totalCount: Int!',
    '}',
  ].join('\n'));

  sections.push([
    'type AggregateResult {',
    '  groups: [AggregateGroup!]!',
    '  totalGroups: Int!',
    '}',
  ].join('\n'));

  // 10. Query type
  const queryFields: string[] = [];

  // Attachment metadata type — always present so the attachment query
  // resolves even when no ObjectType uses the Attachment scalar.
  sections.push([
    'type AttachmentRef {',
    '  blobId: ID!',
    '  filename: String!',
    '  contentType: String!',
    '  size: Int!',
    '  sha256: String',
    '  thumbnailBlobId: String',
    '  uploadedAt: DateTime!',
    '  uploadedBy: String',
    '}',
  ].join('\n'));
  for (const obj of schema.objectTypes) {
    const lower = lowerFirst(obj.name);
    queryFields.push(`  ${lower}(id: ID!): ${obj.name}`);
    queryFields.push(
      `  ${lower}s(filter: ${obj.name}Filter, orderBy: ${obj.name}OrderBy, first: Int, after: String, last: Int, before: String, asOf: DateTime): ${obj.name}Connection!`,
    );
    queryFields.push(
      `  ${lower}Aggregate(filter: ${obj.name}Filter, groupBy: [String!], buckets: [BucketInput!], fields: [AggregateFieldInput!]!, orderBy: [AggregateOrderByInput!], limit: Int, offset: Int): AggregateResult!`,
    );
    queryFields.push(
      `  search${obj.name}s(query: String!, fields: [String!], filter: ${obj.name}Filter, first: Int, after: String): SearchResult_${obj.name}!`,
    );
    queryFields.push(
      `  traverse${obj.name}(startId: ID!, steps: [TraversalStepInput!]!, limit: Int): TraversalResult!`,
    );
  }
  // Interface-typed queries — the only polymorphic entry point in the schema.
  //
  // Interfaces were emitted as SDL and ObjectTypes carried their `implements`
  // clauses, but nothing in the schema ever RETURNED an interface, so the
  // generated `__resolveType` resolvers could never fire and a caller had no way
  // to ask "every Locatable" without knowing the concrete types up front.
  //
  // One field per interface that something implements. Deliberately no filter
  // argument: a shared filter input would have to be the intersection of every
  // implementor's fields, which is a separate design question.
  const objectQueryFieldNames = new Set(schema.objectTypes.map(o => `${lowerFirst(o.name)}s`));
  for (const iface of schema.interfaces) {
    const implementors = schema.objectTypes.filter(o => o.interfaces.includes(iface.name));
    if (implementors.length === 0) continue;
    const fieldName = `${lowerFirst(iface.name)}s`;
    // An ObjectType plural query already owning this name would make the SDL
    // invalid through a duplicate field rather than fail loudly at generation.
    if (objectQueryFieldNames.has(fieldName)) continue;
    queryFields.push(`  ${fieldName}(first: Int): [${iface.name}!]!`);
  }

  // Audit trail read API (Section 7.2.1) — mirrors REST GET /api/v1/audit.
  // Always in the SDL; the resolver errors when deps.auditStore is absent.
  queryFields.push('  auditRecords(filter: AuditFilter, limit: Int, offset: Int): AuditPage!');
  queryFields.push('  availableTools(filter: ToolFilter): [ToolDescriptor!]!');
  // Attachment metadata query — returns AttachmentRef without the blob bytes.
  // The blob content is fetched via REST GET /api/v1/attachments/:blobId.
  queryFields.push('  attachment(blobId: ID!): AttachmentRef');
  // Per-object action applicability: which actions target this object?
  // Returns action names that have a @param of this objectType and whose
  // preconditions the caller could satisfy — without executing anything.
  queryFields.push('  applicableActions(objectType: String!, objectId: ID!): [String!]!');
  queryFields.push('  objectSet(id: ID!): ObjectSet');
  queryFields.push('  objectSets(objectType: String): [ObjectSet!]!');
  queryFields.push('  executeObjectSet(id: ID!, input: ObjectSetExecutionInput): ObjectSetExecutionResult!');
  queryFields.push('  executeObjectSetAggregate(id: ID!): AggregateResult!');
  // FDP/CDM read-only projection (Section S1.0). Records are a version-pinned
  // CDM shape with per-record provenance; returned as JSON since the projection
  // is profile-driven and intentionally flexible (mirrors GET /api/v1/cdm/*).
  // Capability-gated: omitted when the deployment's packs do not declare `cdm`
  // (parity with the REST mount), so non-NHS deployments expose no CDM surface.
  if (options?.cdm !== false) {
    queryFields.push('  cdmMetadata: JSON!');
    queryFields.push('  cdmRecord(sourceType: String!, id: ID!): JSON');
    queryFields.push('  cdmRecords(sourceType: String!): JSON!');
    // Encounter is a link-kind CDM resource (derived from AdmittedTo), addressed
    // by patient — mirrors REST GET /api/v1/cdm/Encounter?patient={id}.
    queryFields.push('  cdmEncounters(patient: ID!): JSON!');
  }
  sections.push(['type Query {', ...queryFields, '}'].join('\n'));

  // 11. Mutation type
  const mutationFields: string[] = [];
  for (const action of schema.actionTypes) {
    const fieldName = lowerFirst(action.name);
    mutationFields.push(`  ${fieldName}(input: ${action.name}Input!): ${action.name}Result!`);
  }
  // Function invocations (Section 6 — Functions). Each FunctionType gets a
  // mutation field named `${lowerFirst(name)}Function` to avoid collisions
  // with action mutations of the same camelCase form.
  for (const fn of schema.functionTypes) {
    const fieldName = `${lowerFirst(fn.name)}Function`;
    mutationFields.push(`  ${fieldName}(input: ${fn.name}FunctionInput!): ${fn.name}FunctionResult!`);
  }
  // Generic object update/delete.
  //
  // The resolvers for these have always been generated — with FGA checks,
  // write-side field permissions, audit records and optimistic concurrency —
  // but no SDL field referenced them, so graphql-tools warned
  // "defined in resolvers, but not in schema" once per ObjectType at every
  // boot and the mutations were unreachable. REST has exposed PUT and DELETE
  // /{plural}/:id throughout, so this is the parity the platform already
  // claimed rather than a new capability.
  for (const obj of schema.objectTypes) {
    mutationFields.push(
      `  update${obj.name}(id: ID!, input: Update${obj.name}Input!, expectedVersion: Int): ${obj.name}!`,
    );
    mutationFields.push(`  delete${obj.name}(id: ID!, expectedVersion: Int): Boolean!`);
  }

  // Object Set mutations
  mutationFields.push('  createObjectSet(input: CreateObjectSetInput!): ObjectSet!');
  mutationFields.push('  updateObjectSet(id: ID!, input: UpdateObjectSetInput!): ObjectSet!');
  mutationFields.push('  deleteObjectSet(id: ID!): Boolean!');
  mutationFields.push('  combineObjectSets(input: SetAlgebraInput!): ObjectSet!');
  // Care-team relationship grants (v0.2.0 A1) — mirror REST /api/v1/relationships.
  mutationFields.push('  grantRelationship(input: RelationshipInput!): RelationshipResult!');
  mutationFields.push('  revokeRelationship(input: RelationshipInput!): RelationshipResult!');
  // Consent record (v0.2.0 A2) — mirror REST /api/v1/consent.
  mutationFields.push('  recordConsent(input: ConsentInput!): ConsentResult!');
  // LLM generate + embed (Section AIP) — mirror REST /api/v1/llm/*.
  mutationFields.push('  generate(input: GenerateInput!): GenerateResult!');
  mutationFields.push('  embed(input: EmbedInput!): EmbedResult!');
  // Function lifecycle
  queryFields.push('  functionRevision(id: ID!): FunctionRevision');
  queryFields.push('  functionRevisions(functionName: String!): [FunctionRevision!]!');
  mutationFields.push('  createFunctionRevision(input: CreateFunctionRevisionInput!): FunctionRevision!');
  mutationFields.push('  publishFunctionRevision(id: ID!): FunctionRevision!');
  mutationFields.push('  testFunctionRevision(id: ID!): TestRunResult!');
  mutationFields.push('  rollbackFunction(functionName: String!, toRevisionId: ID!): FunctionRevision!');
  // TODO: submitBulkAction mutation deferred — requires BulkActionJob resolver
  // and async job tracking infrastructure. Re-add when bulk action pipeline is built.
  if (mutationFields.length > 0) {
    sections.push(['type Mutation {', ...mutationFields, '}'].join('\n'));
  }

  // 12. Subscription type
  const subFields: string[] = [];
  for (const obj of schema.objectTypes) {
    const lower = lowerFirst(obj.name);
    subFields.push(`  ${lower}Changed(id: ID!): ${obj.name}ChangeEvent!`);
    subFields.push(`  ${lower}sChanged(filter: JSON): ${obj.name}ChangeEvent!`);
  }
  if (subFields.length > 0) {
    sections.push(['type Subscription {', ...subFields, '}'].join('\n'));
  }

  return sections.join('\n\n') + '\n';
}
