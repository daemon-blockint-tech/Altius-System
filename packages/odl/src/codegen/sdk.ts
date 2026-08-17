/**
 * ODL Codegen — TypeScript SDK generation from ParsedSchema.
 *
 * Generates a typed client SDK that provides:
 * - Typed interfaces for each ObjectType, LinkType, and ActionType
 * - Query accessors (get, list) for each ObjectType
 * - Subscription accessors (onChange) for each ObjectType
 * - Typed action methods for each ActionType
 * - Redacted field sentinel type
 *
 * The generated SDK is a complete package source that can be compiled
 * with tsc and published as @altius/sdk.
 */

import type {
  ParsedSchema,
  ObjectType,
  ActionType,
  FieldDefinition,
} from '../parser/types.js';

// ─── ODL scalar → TypeScript type mapping ───

const TS_SCALAR_MAP: Record<string, string> = {
  ID: 'string',
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  Date: 'string',
  DateTime: 'string',
  Duration: 'string',
  GeoPoint: '{ lat: number; lng: number }',
  JSON: 'unknown',
  URI: 'string',
};

// ─── Helpers ───

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function isPrimaryField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'primary');
}

function isLinkField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'link');
}

function isComputedField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'computed');
}

function isParamField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'param');
}

function isSensitiveField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'sensitive');
}

/**
 * Resolve an ODL field type to a TypeScript type string.
 * Enum names and object-type names are kept as-is (they'll be
 * declared as interfaces/types in the generated code).
 */
function fieldToTsType(
  field: FieldDefinition,
  knownEnums: Set<string>,
  knownObjects: Set<string>,
  sensitive: boolean,
): string {
  const { type } = field;
  const baseName = type.name;

  // Link fields reference LinkTypes, not ObjectTypes — no interface is
  // generated for them. Map to string (the target object's ID) since the
  // generated query does not request link fields and the consumer resolves
  // links via traversal or separate queries.
  if (isLinkField(field)) {
    const linkBase = sensitive ? 'string | Redacted' : 'string';
    if (type.isList) {
      const element = type.listElementNonNull ? linkBase : `${linkBase} | null`;
      const arr = `(${element})[]`;
      return type.nonNull ? arr : `${arr} | null`;
    }
    const isPrimary = isPrimaryField(field);
    if (isPrimary) {
      return type.nonNull ? linkBase : `${linkBase} | null`;
    }
    return `${linkBase} | null`;
  }

  // Determine the TS base type
  let tsBase: string;
  if (TS_SCALAR_MAP[baseName] !== undefined) {
    tsBase = TS_SCALAR_MAP[baseName]!;
  } else if (knownEnums.has(baseName) || knownObjects.has(baseName)) {
    tsBase = baseName;
  } else {
    // Unknown type — keep as-is (could be a user-defined scalar or link target)
    tsBase = baseName;
  }

  // Wrap in Redacted for sensitive fields
  if (sensitive) {
    tsBase = `${tsBase} | Redacted`;
  }

  // List handling
  if (type.isList) {
    const element = type.listElementNonNull ? tsBase : `${tsBase} | null`;
    const arr = `(${element})[]`;
    return type.nonNull ? arr : `${arr} | null`;
  }

  // Nullability — non-primary read-side fields are nullable
  const isPrimary = isPrimaryField(field);
  if (isPrimary) {
    return type.nonNull ? tsBase : `${tsBase} | null`;
  }
  // Non-primary fields: always nullable on read-side (Section 7.1.3)
  return `${tsBase} | null`;
}

/**
 * Resolve action param field to TS type (write-side: keeps declared nullability).
 */
function paramToTsType(
  field: FieldDefinition,
  knownEnums: Set<string>,
  knownObjects: Set<string>,
): string {
  const { type } = field;
  const baseName = type.name;

  let tsBase: string;
  if (TS_SCALAR_MAP[baseName] !== undefined) {
    tsBase = TS_SCALAR_MAP[baseName]!;
  } else if (knownEnums.has(baseName) || knownObjects.has(baseName)) {
    tsBase = baseName;
  } else {
    tsBase = baseName;
  }

  // For action inputs, object-type references become ID references
  if (knownObjects.has(baseName)) {
    tsBase = 'string';
  }

  if (type.isList) {
    const element = type.listElementNonNull ? tsBase : `${tsBase} | null`;
    const arr = `(${element})[]`;
    return type.nonNull ? arr : `${arr} | undefined`;
  }

  return type.nonNull ? tsBase : `${tsBase} | undefined`;
}

// ─── File generators ───

function generateRedactedType(): string {
  return [
    '/**',
    ' * Sentinel value indicating a field has been redacted due to',
    ' * access control or consent restrictions.',
    ' */',
    "export const REDACTED = Symbol.for('altius.redacted');",
    '',
    '/** Redacted field sentinel type. */',
    'export type Redacted = typeof REDACTED;',
  ].join('\n');
}

function generateSharedTypes(): string {
  return [
    '// ─── Shared types ───',
    '',
    'export interface PageInfo {',
    '  hasNextPage: boolean;',
    '  hasPreviousPage: boolean;',
    '  startCursor: string | null;',
    '  endCursor: string | null;',
    '}',
    '',
    'export interface Connection<T> {',
    '  edges: Edge<T>[];',
    '  pageInfo: PageInfo;',
    '  totalCount: number;',
    '}',
    '',
    'export interface Edge<T> {',
    '  node: T;',
    '  cursor: string;',
    '}',
    '',
    '/** Matches the SDL `enum SortDirection`. */',
    "export type SortDirection = 'ASC' | 'DESC';",
    '',
    '/**',
    ' * A request that reached the gateway and came back a failure.',
    ' *',
    ' * Carries the HTTP status and any GraphQL `extensions.code` values, because',
    ' * callers have to tell WHY it failed apart to respond correctly: a 401 means',
    ' * the credential is the problem and retrying produces the same answer',
    ' * forever, while a 500 or a network blip is worth a Retry button. Without',
    ' * these fields the only signal is the message, and reading a status back out',
    ' * of prose is a regex that breaks the day the wording changes.',
    ' *',
    ' * The message is unchanged from what this SDK has always thrown, so anything',
    ' * matching on it keeps working.',
    ' */',
    'export class AltiusRequestError extends Error {',
    '  /** HTTP status, absent when the failure arrived as a GraphQL error body on a 200. */',
    '  readonly status?: number;',
    '  /** `extensions.code` values from the GraphQL error array, in order. */',
    '  readonly codes: readonly string[];',
    '',
    '  constructor(message: string, init?: { status?: number; codes?: readonly string[] }) {',
    '    super(message);',
    "    this.name = 'AltiusRequestError';",
    '    if (init?.status !== undefined) this.status = init.status;',
    '    this.codes = init?.codes ?? [];',
    '  }',
    '',
    '  /**',
    '   * The caller was not authenticated.',
    '   *',
    '   * 403 is deliberately NOT included: it means the caller IS identified and',
    '   * lacks permission, so sending them back to sign in would loop them',
    '   * through a login that changes nothing.',
    '   */',
    '  get isUnauthenticated(): boolean {',
    "    return this.status === 401 || this.codes.includes('UNAUTHENTICATED');",
    '  }',
    '}',
    '',
    'export interface ActionError {',
    '  code: string;',
    '  message: string;',
    '  field: string | null;',
    '}',
    '',
    'export interface AffectedObject {',
    '  typeName: string;',
    '  id: string;',
    '  changeType: ChangeType;',
    '}',
    '',
    "export type ChangeType = 'CREATED' | 'UPDATED' | 'DELETED';",
    '',
    'export interface ChangeEvent<T> {',
    '  changeType: ChangeType;',
    '  object: T;',
    '  // Field-level diff ({ field: { old, new } }), not a full object.',
    '  previousValues: Record<string, { old: unknown; new: unknown }> | null;',
    '  causedBy: { actionType: string | null; actionId: string | null } | null;',
    '  timestamp: string;',
    '}',
    '',
    'export interface ActionResult {',
    '  success: boolean;',
    '  actionId: string;',
    '  errors: ActionError[] | null;',
    '  affectedObjects: AffectedObject[] | null;',
    '}',
    '',
    'export interface PaginationArgs {',
    '  first?: number;',
    '  after?: string;',
    '  last?: number;',
    '  before?: string;',
    '}',
    '',
    'export interface Subscription {',
    '  unsubscribe(): void;',
    '}',
    '',
    '/**',
    ' * A token, or a function returning one.',
    ' *',
    ' * Access tokens expire (the shipped Keycloak realm uses an hour), so a',
    ' * client that captured a string at construction is dead after the first',
    ' * expiry with no seam to refresh through. A provider is consulted per',
    ' * request, and',
    ' * again each time the socket re-inits, so refreshing is up to the caller',
    ' * and the client never holds a stale credential.',
    ' */',
    'export type TokenProvider = () => string | Promise<string>;',
    '',
    '/** Runtime descriptor for an action, as served by availableTools. */',
    'export interface ToolDescriptor {',
    '  name: string;',
    '  kind: string;',
    '  description: string;',
    '  /** JSON Schema for the parameters. Enums carry their members; Date and',
    '   *  DateTime carry a `format`, so a generated form can pick the control. */',
    '  parameters: Record<string, unknown>;',
    '  returnType: Record<string, unknown>;',
    '  requiredPermissions: string[];',
    '  dryRunSupported: boolean;',
    '  reversible: boolean;',
    '  tags: string[];',
    '}',
    '',
    '/** Mirrors the ToolKind enum in the SDL. A plain string here let a',
    ' *  lowercase value type-check and then fail GraphQL validation at runtime. */',
    "export type ToolKind = 'ACTION' | 'FUNCTION';",
    '',
    'export interface ToolFilter {',
    '  kind?: ToolKind;',
    '  tags?: string[];',
    '}',
    '',
    'export interface AltiusConfig {',
    '  endpoint: string;',
    '  token: string | TokenProvider;',
    '}',
  ].join('\n');
}

function generateEnums(schema: ParsedSchema): string {
  const sections: string[] = [];

  for (const e of schema.enums) {
    const values = e.values.map(v => `  | '${v.name}'`).join('\n');
    sections.push(`export type ${e.name} =\n${values};`);
  }

  return sections.join('\n\n');
}

function generateObjectInterface(
  obj: ObjectType,
  knownEnums: Set<string>,
  knownObjects: Set<string>,
): string {
  const lines: string[] = [];
  lines.push(`export interface ${obj.name} {`);

  for (const field of obj.fields) {
    const sensitive = isSensitiveField(field);
    const tsType = fieldToTsType(field, knownEnums, knownObjects, sensitive);
    lines.push(`  ${field.name}: ${tsType};`);
  }

  // Redaction metadata fields
  lines.push('  _redactedFields: string[] | null;');
  lines.push('  _consentRestricted: boolean | null;');

  lines.push('}');
  return lines.join('\n');
}

function generateActionInputInterface(
  action: ActionType,
  knownEnums: Set<string>,
  knownObjects: Set<string>,
): string {
  const lines: string[] = [];
  lines.push(`export interface ${action.name}Input {`);

  const paramFields = action.fields.filter(isParamField);
  for (const field of paramFields) {
    const tsType = paramToTsType(field, knownEnums, knownObjects);
    const optional = !field.type.nonNull;
    lines.push(`  ${field.name}${optional ? '?' : ''}: ${tsType};`);
  }

  lines.push('}');
  return lines.join('\n');
}

function generateActionResultType(action: ActionType): string {
  return `export type ${action.name}Result = ActionResult;`;
}

function generateConnectionType(typeName: string): string {
  return `export type ${typeName}Connection = Connection<${typeName}>;`;
}

function generateFilterInterface(obj: ObjectType, knownEnums: Set<string>): string {
  const lines: string[] = [];
  lines.push(`export interface ${obj.name}Filter {`);

  const scalarFields = obj.fields.filter(f => !isLinkField(f) && !isComputedField(f));
  for (const field of scalarFields) {
    const typeName = field.type.name;
    if (TS_SCALAR_MAP[typeName] !== undefined || knownEnums.has(typeName)) {
      lines.push(`  ${field.name}?: unknown;`);
    }
  }

  lines.push(`  AND?: ${obj.name}Filter[];`);
  lines.push(`  OR?: ${obj.name}Filter[];`);
  lines.push(`  NOT?: ${obj.name}Filter;`);

  lines.push('}');
  return lines.join('\n');
}

/**
 * Fields the SDL's `${Name}OrderBy` input accepts.
 *
 * MUST mirror generateOrderBy in codegen/index.ts — the same non-link,
 * non-computed scalar restricted to orderable types or enums. A field this
 * offers that the SDL input lacks is not a loose type, it is a query the
 * server rejects at validation: the caller gets "unknown field" for something
 * the SDK told them existed.
 *
 * Computed fields are excluded here because the SDL excludes them. The engine
 * CAN now sort on a computed field (it materialises candidates and sorts in
 * memory), so this is the remaining half of that capability — widening it is a
 * change to the SDL input first, and to this only in step with it.
 */
const SDK_ORDERABLE_TYPES = new Set(['ID', 'String', 'Int', 'Float', 'Date', 'DateTime', 'Duration', 'URI']);

function generateOrderByInterface(obj: ObjectType, knownEnums: Set<string>): string {
  const lines: string[] = [];
  lines.push(`export interface ${obj.name}OrderBy {`);

  for (const field of obj.fields) {
    if (isLinkField(field) || isComputedField(field)) continue;
    if (SDK_ORDERABLE_TYPES.has(field.type.name) || knownEnums.has(field.type.name)) {
      lines.push(`  ${field.name}?: SortDirection;`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function generateObjectAccessor(obj: ObjectType, schema: ParsedSchema): string {
  const name = obj.name;
  const lower = lowerFirst(name);
  const fields = getFieldNames(obj, schema);

  return [
    `  get ${lower}() {`,
    '    return {',
    `      get: (id: string): Promise<${name} | null> =>`,
    `        this.query<Record<string, unknown>>(\`query { ${lower}(id: "\${id}") { ${fields} } }\`)`,
    `          .then((d) => (d?.['${lower}'] ?? null) as ${name} | null),`,
    '',
    `      list: (filter?: ${name}Filter, pagination?: PaginationArgs, asOf?: string, orderBy?: ${name}OrderBy): Promise<${name}Connection> =>`,
    `        this.query<Record<string, unknown>>(\`query($filter: ${name}Filter, $orderBy: ${name}OrderBy, $first: Int, $after: String, $asOf: DateTime) { ${lower}s(filter: $filter, orderBy: $orderBy, first: $first, after: $after, asOf: $asOf) { edges { node { ${fields} } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }\`, { filter, orderBy, first: pagination?.first, after: pagination?.after, asOf })`,
    `          .then((d) => d?.['${lower}s'] as ${name}Connection),`,
    '',
    `      onChange: (id: string, callback: (event: ChangeEvent<${name}>) => void): Subscription =>`,
    `        this.subscribe<${name}>('${name}', id, '${fields}', callback),`,
    '',
    `      onAnyChange: (callback: (event: ChangeEvent<${name}>) => void, filter?: ${name}Filter, onClose?: () => void, onResume?: () => void): Subscription =>`,
    `        this.subscribe<${name}>('${name}', null, '${fields}', callback, filter as Record<string, unknown> | undefined, onClose, onResume),`,
    '    };',
    '  }',
  ].join('\n');
}

function getFieldNames(obj: ObjectType, schema: ParsedSchema): string {
  const objectTypes = new Map(schema.objectTypes.map(o => [o.name, o]));

  const declared = obj.fields
    .filter(f => !isLinkField(f) && !isComputedField(f))
    .map(f => {
      const nested = objectTypes.get(f.type.name);
      if (!nested) return f.name;

      // An OBJECT-typed field needs a selection set. Emitting it bare made
      // every query for a type that has one invalid — "Field patient of type
      // Patient must have a selection of subfields" — so e.g. no
      // dischargeRecord could be read at all.
      //
      // Expanded exactly one level, scalars only. Never recursing is what makes
      // this safe: Patient.admissions -> AdmittedTo -> Patient is a cycle, and
      // a depth counter would only bound it. Excluding nested object fields
      // from the inner selection makes a cycle structurally impossible instead.
      const inner = nested.fields
        .filter(nf => !isLinkField(nf) && !isComputedField(nf) && !objectTypes.has(nf.type.name))
        .map(nf => nf.name);
      return `${f.name} { ${[...inner, '_redactedFields', '_consentRestricted'].join(' ')} }`;
    });

  // The redaction metadata, which every generated interface declares as a
  // required member (`_redactedFields: string[] | null`) and no generated query
  // asked for — so it was always undefined at runtime and the type lied.
  //
  // It is what separates "you may not see this" from "nobody recorded this".
  // Redaction nulls a value rather than removing the field, so without this a
  // caller cannot tell the two apart, and on a clinical worklist the second
  // reading invites someone to fill the gap in over data that already exists.
  // Both are declared on every object type in the SDL (codegen/index.ts:154).
  return [...declared, '_redactedFields', '_consentRestricted'].join(' ');
}

function generateActionsNamespace(schema: ParsedSchema): string {
  const methods: string[] = [];

  for (const action of schema.actionTypes) {
    const methodName = lowerFirst(action.name);
    methods.push(
      `      ${methodName}: (input: ${action.name}Input): Promise<${action.name}Result> =>`,
      `        this.mutate<${action.name}Result>('${action.name}', input),`,
    );
  }

  return [
    '  get actions() {',
    '    return {',
    '      /**',
    '       * Action metadata, including each parameter JSON Schema.',
    '       *',
    '       * The typed methods below are generated from the schema at build',
    '       * time; this is the RUNTIME view of the same actions, and the only',
    '       * way a client can build a form without hard-coding one per action.',
    '       * It is also caller-scoped, so it reflects what this user may run.',
    '       */',
    '      /**',
    '       * Invoke an action by name.',
    '       *',
    '       * The typed methods below are generated from the schema this build',
    '       * saw. A UI driven by availableTools is working from the RUNTIME',
    '       * list, which can include an action this bundle predates, so it',
    '       * needs a by-name path as well.',
    '       */',
    '      invoke: (name: string, input: Record<string, unknown>): Promise<ActionResult> =>',
    '        this.mutate<ActionResult>(name, input),',
    '',
    '      available: (filter?: ToolFilter): Promise<ToolDescriptor[]> =>',
    "        this.query<ToolDescriptor[]>(`query($filter: ToolFilter) { availableTools(filter: $filter) { name kind description parameters returnType requiredPermissions dryRunSupported reversible tags } }`, { filter }).then(",
    "          (r) => (r as unknown as { availableTools?: ToolDescriptor[] })?.availableTools ?? (r as ToolDescriptor[]) ?? [],",
    '        ),',
    '',
    ...methods,
    '    };',
    '  }',
  ].join('\n');
}

function generateClientClass(schema: ParsedSchema): string {
  const accessors: string[] = [];

  for (const obj of schema.objectTypes) {
    accessors.push(generateObjectAccessor(obj, schema));
  }

  accessors.push(generateActionsNamespace(schema));

  return [
    '// ─── Client class ───',
    '',
    'export class Altius {',
    '  private readonly endpoint: string;',
    '  private readonly token: string | TokenProvider;',
    '  private readonly wsSubscriptions = new Map<string, (payload: unknown) => void>();',
    '  /**',
    '   * Close handlers, one per live subscription.',
    '   *',
    '   * The socket clears its subscriptions on close and does not reconnect, so',
    '   * without this a dropped connection leaves the caller holding a stream',
    '   * that has silently stopped — a table that looks current and is not. The',
    '   * handler lets the caller SAY so; reconnection is a separate concern and',
    '   * a reconnect that quietly misses events during the gap is the same bug.',
    '   */',
    '  private readonly wsCloseHandlers = new Map<string, () => void>();',
    '  /** Replay closures, one per live subscription, used to re-establish after a drop. */',
    '  private readonly wsResubscribers = new Map<string, () => void>();',
    '  /** Fired after a dropped stream is re-established. Callers must RE-READ: */',
    '  /** events that occurred while the socket was down are gone, so resuming */',
    '  /** without re-reading is the silent-staleness bug wearing a fix. */',
    '  private readonly wsResumeHandlers = new Map<string, () => void>();',
    '  private wsReconnectAttempt = 0;',
    '  /** Set when the token provider refuses. A dropped transport is worth',
    '   *  retrying; a credential that will not resolve is not — retrying just',
    '   *  re-resolves the same failure on a timer. */',
    '  private wsAuthFailed = false;',
    '  private wsSocket: WebSocket | null = null;',
    '  private wsReady = false;',
    '  private wsReadyQueue: Array<() => void> = [];',
    '',
    '  constructor(config: AltiusConfig) {',
    '    this.endpoint = config.endpoint;',
    '    this.token = config.token;',
    '  }',
    '',
    '  /** Resolve the current token, calling the provider if one was supplied. */',
    '  private async resolveToken(): Promise<string> {',
    "    return typeof this.token === 'function' ? await this.token() : this.token;",
    '  }',
    '',
    '  private async authHeaders(): Promise<Record<string, string>> {',
    '    const headers: Record<string, string> = {',
    "      'Content-Type': 'application/json',",
    '    };',
    '    const token = await this.resolveToken();',
    '    if (token) {',
    "      headers['Authorization'] = `Bearer ${token}`;",
    '    }',
    '    return headers;',
    '  }',
    '',
    '  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {',
    '    const response = await fetch(this.endpoint, {',
    "      method: 'POST',",
    '      headers: await this.authHeaders(),',
    '      body: JSON.stringify({ query, variables }),',
    '    });',
    '    if (!response.ok) {',
    '      throw new AltiusRequestError(`GraphQL request failed: ${response.status} ${response.statusText}`, { status: response.status });',
    '    }',
    '    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string; extensions?: { code?: string } }> };',
    '    if (json.errors && json.errors.length > 0) {',
    '      throw new AltiusRequestError(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`, { codes: json.errors.map((e) => e.extensions?.code).filter((c): c is string => typeof c === "string") });',
    '    }',
    '    return (json.data ?? null) as T;',
    '  }',
    '',
    '  private async mutate<T>(action: string, input: unknown): Promise<T> {',
    '    const field = action.charAt(0).toLowerCase() + action.slice(1);',
    '    const mutation = `mutation($input: ${action}Input!) { ${field}(input: $input) {',
    '      success actionId',
    '      errors { code message field }',
    '      affectedObjects { typeName id changeType }',
    '    } }`;',
    '    const response = await fetch(this.endpoint, {',
    "      method: 'POST',",
    '      headers: await this.authHeaders(),',
    '      body: JSON.stringify({ query: mutation, variables: { input } }),',
    '    });',
    '    if (!response.ok) {',
    '      throw new AltiusRequestError(`GraphQL mutation failed: ${response.status} ${response.statusText}`, { status: response.status });',
    '    }',
    '    const json = (await response.json()) as { data?: Record<string, T>; errors?: Array<{ message: string; extensions?: { code?: string } }> };',
    '    if (json.errors && json.errors.length > 0) {',
    '      throw new AltiusRequestError(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`, { codes: json.errors.map((e) => e.extensions?.code).filter((c): c is string => typeof c === "string") });',
    '    }',
    '    return (json.data?.[field] ?? null) as T;',
    '  }',
    '',
    '  /**',
    '   * Re-establish the socket after an unexpected close, with backoff.',
    '   *',
    '   * Replay goes through wsReadyQueue, the same path a first subscribe uses,',
    '   * so a reconnected subscription is established exactly like a fresh one',
    '   * rather than by a second code path that can drift from it.',
    '   */',
    '  private scheduleReconnect(): void {',
    '    const attempt = ++this.wsReconnectAttempt;',
    '    // 1s, 2s, 4s... capped. Capped rather than unbounded because a client',
    '    // that gives up entirely leaves the caller with a dead stream and no',
    '    // further notice, which is the state this whole mechanism exists to end.',
    '    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);',
    '    setTimeout(() => {',
    '      if (this.wsResubscribers.size === 0) {',
    '        // Nothing left to recover. Reset the counter, or it stays raised',
    '        // and the next fresh subscribe acks as though it had reconnected —',
    '        // and a caller that answers resume by re-reading would refetch the',
    '        // page it has only just loaded.',
    '        this.wsReconnectAttempt = 0;',
    '        return;',
    '      }',
    '      // REPLACE rather than append. A subscription opened during the',
    '      // backoff window has already queued itself and is also a',
    '      // resubscriber, so appending would queue it twice and the ack would',
    '      // send its subscribe twice under one id. wsResubscribers holds every',
    '      // live subscription exactly once, which makes it the authority.',
    '      this.wsReadyQueue = [...this.wsResubscribers.values()];',
    '      this.ensureWebSocket();',
    '    }, delay);',
    '  }',
    '',
    '  /**',
    '   * Release the socket and every subscription on it.',
    '   *',
    '   * A client is recreated whenever auth state changes — sign-in, session',
    '   * expiry — and without this the previous instance keeps an authenticated',
    '   * socket open, holding its subscriptions and reconnecting when the server',
    '   * drops it, with nothing left holding a reference to it.',
    '   *',
    '   * Clearing the resubscribers first is what makes the close deliberate:',
    '   * the close listener only schedules a retry while subscriptions remain,',
    '   * so an empty map is how it tells a disposal from a drop.',
    '   */',
    '  close(): void {',
    '    this.wsResubscribers.clear();',
    '    this.wsSubscriptions.clear();',
    '    this.wsCloseHandlers.clear();',
    '    this.wsResumeHandlers.clear();',
    '    this.wsReadyQueue = [];',
    '    this.wsReconnectAttempt = 0;',
    "    try { this.wsSocket?.close(); } catch { /* already gone */ }",
    '  }',
    '',
    '  private ensureWebSocket(): WebSocket {',
    '    if (this.wsSocket && (this.wsSocket.readyState === WebSocket.OPEN || this.wsSocket.readyState === WebSocket.CONNECTING)) {',
    '      return this.wsSocket;',
    '    }',
    '    const wsUrl = this.endpoint',
    "      .replace(/^http:/, 'ws:')",
    "      .replace(/^https:/, 'wss:');",
    '    // graphql-ws requires the subprotocol on the handshake. Without it the',
    "    // server closes the socket with 4406 'Subprotocol not acceptable' before",
    '    // any message is exchanged, so every subscription silently never starts.',
    "    const socket = new WebSocket(wsUrl, 'graphql-transport-ws');",
    '    this.wsSocket = socket;',
    '    this.wsReady = false;',
    "    socket.addEventListener('open', () => {",
    '      // Resolved at open time, not captured at construction: a reconnect',
    '      // after a refresh must present the NEW token, or the socket',
    '      // re-authenticates with a credential that has already expired.',
    '      void this.resolveToken().then((token) => {',
    '        // The socket can close while the token is resolving; sending on a',
    '        // closed socket throws InvalidStateError.',
    '        if (socket.readyState !== WebSocket.OPEN) return;',
    "        socket.send(JSON.stringify({ type: 'connection_init', payload: { Authorization: token ? `Bearer ${token}` : '' } }));",
    '      }).catch(() => {',
    '        // The provider refused — an expired session is the usual reason.',
    '        // Flagged so the close below reports the loss WITHOUT scheduling a',
    '        // reconnect: the retry would re-resolve the same failing token.',
    '        // Only the CURRENT socket may set client-wide state. A superseded',
    '        // socket resolving late would otherwise suppress the reconnect of',
    '        // the socket that replaced it. NOT reproduced by a test — I could',
    '        // not construct the interleaving — so this is consistency with the',
    '        // message and close listeners rather than a fixed defect.',
    '        if (this.wsSocket !== socket) return;',
    '        this.wsAuthFailed = true;',
    "        try { socket.close(); } catch { /* already gone */ }",
    '      });',
    '    });',
    "    socket.addEventListener('message', (event) => {",
    '      // Same reason the close listener is guarded: a superseded socket can',
    '      // still deliver. A late connection_ack from one would mark the client',
    '      // ready and flush the queue onto the CURRENT socket before it has',
    '      // handshaken, and a late next/complete would be attributed to a',
    '      // subscription this socket no longer owns.',
    '      if (this.wsSocket !== socket) return;',
    '      const msg = JSON.parse(event.data as string) as { type: string; id?: string; payload?: unknown };',
    "      if (msg.type === 'connection_ack') {",
    '        this.wsReady = true;',
    '        for (const fn of this.wsReadyQueue) fn();',
    '        this.wsReadyQueue = [];',
    '        if (this.wsReconnectAttempt > 0) {',
    '          this.wsReconnectAttempt = 0;',
    '          for (const onResume of this.wsResumeHandlers.values()) {',
    '            try { onResume(); } catch { /* one handler must not stop the rest */ }',
    '          }',
    '        }',
    "      } else if (msg.type === 'next' && msg.id) {",
    '        const handler = this.wsSubscriptions.get(msg.id);',
    '        // Guarded like the close and resume handlers. A subscriber that',
    '        // throws — a render error in a live table being the obvious way —',
    '        // otherwise propagates out of the message listener and every OTHER',
    '        // subscription on this socket stops being delivered, while the',
    '        // connection stays up and looks healthy.',
    "        if (handler) { try { handler(msg.payload); } catch { /* one subscriber must not silence the rest */ } }",
    "      } else if ((msg.type === 'error' || msg.type === 'complete') && msg.id) {",
    '        // The SERVER ended this one — auth expiry, revoked permission, a',
    '        // filter it will not accept. Forgetting only the message handler',
    '        // left the caller believing a dead stream was live, and left the',
    '        // resubscriber in place so the next reconnect re-sent a subscribe',
    '        // the server had already refused.',
    '        //',
    '        // If the caller unsubscribed first these maps are already empty, so',
    '        // the `complete` the server echoes back is correctly silent.',
    '        const endedId = msg.id;',
    '        const onClose = this.wsCloseHandlers.get(endedId);',
    '        this.wsSubscriptions.delete(endedId);',
    '        this.wsResubscribers.delete(endedId);',
    '        this.wsCloseHandlers.delete(endedId);',
    '        this.wsResumeHandlers.delete(endedId);',
    '        if (onClose) { try { onClose(); } catch { /* never break the socket loop */ } }',
    '      }',
    '    });',
    "    socket.addEventListener('close', () => {",
    '      // A socket in CLOSING is not reused, so it can be replaced before its',
    '      // own close fires. Acting on that late event would null the wsSocket',
    '      // of the socket that superseded it, clear the live subscriptions and',
    '      // schedule a reconnect against a connection that is already healthy —',
    '      // leaving the client convinced it has none while holding one.',
    '      if (this.wsSocket !== socket) return;',
    '      for (const onClose of this.wsCloseHandlers.values()) {',
    '        try { onClose(); } catch { /* a handler must not stop the others */ }',
    '      }',
    '      // Deliberately NOT cleared: the handlers are needed again if the',
    '      // socket drops a second time, and the resubscribers are what make',
    '      // recovery possible. Only unsubscribe() removes them.',
    '      // The queue only drains on connection_ack, so anything still in it',
    '      // belongs to the socket that just died. wsResubscribers is the source',
    '      // of truth for replay; leaving stale entries here makes the next',
    '      // retry queue a second copy and the eventual ack send the same',
    '      // subscribe twice under one id.',
    '      this.wsReadyQueue = [];',
    '      if (this.wsAuthFailed) {',
    '        // Cleared so a later subscribe (after the caller re-authenticates)',
    '        // is free to try again; it simply is not retried on a timer.',
    '        this.wsAuthFailed = false;',
    '      } else if (this.wsResubscribers.size > 0) {',
    '        this.scheduleReconnect();',
    '      }',
    '      this.wsSocket = null;',
    '      this.wsReady = false;',
    '      this.wsSubscriptions.clear();',
    '    });',
    '    return socket;',
    '  }',
    '',
    '  /**',
    '   * Subscribe to one object by id, or to the whole type when `id` is null.',
    '   *',
    '   * The type-level form passes the filter the server evaluates per',
    '   * subscriber against the hydrated, redacted object — so a live table needs',
    '   * ONE subscription, not one per visible row.',
    '   */',
    '  private subscribe<T>(',
    '    typeName: string,',
    '    id: string | null,',
    '    fields: string,',
    '    callback: (event: ChangeEvent<T>) => void,',
    '    filter?: Record<string, unknown>,',
        '    onClose?: () => void,',
    '    onResume?: () => void,',
'  ): Subscription {',
    '    const subId = `${typeName}:${id ?? "*"}:${Math.random().toString(36).slice(2)}`;',
    '    const lower = typeName.charAt(0).toLowerCase() + typeName.slice(1);',
    '    const field = id === null ? `${lower}sChanged` : `${lower}Changed`;',
    '    // `causedBy` is a composite (ActionReference); selecting it bare is a',
    '    // GraphQL validation error, which the server reports as an `error`',
    '    // message that this client drops — the subscription then looks alive and',
    '    // delivers nothing. It needs an explicit subselection.',
    '    const args = id === null',
    '      ? (filter ? `(filter: $filter)` : "")',
    '      : `(id: "${id}")`;',
    '    const varDecl = id === null && filter ? "($filter: JSON)" : "";',
    '    const query = `subscription${varDecl} { ${field}${args} {',
    '      changeType object { ${fields} }',
    '      previousValues causedBy { actionType actionId } timestamp',
    '    } }`;',
    '    const sendSubscribe = () => {',
    '      // The queue is a snapshot taken when a retry was scheduled, and it is',
    '      // only flushed on ack. unsubscribe() inside that window cannot send',
    '      // `complete` because the socket is not OPEN yet, so this is the only',
    '      // place left that can stop a cancelled stream being re-established.',
    '      // Guarding here rather than at each queueing site covers the first',
    '      // subscribe, the retry replay, and anything queued later.',
    '      if (!this.wsResubscribers.has(subId)) return;',
    '      const socket = this.ensureWebSocket();',
    '      const payload = filter && id === null ? { query, variables: { filter } } : { query };',
    "      socket.send(JSON.stringify({ id: subId, type: 'subscribe', payload }));",
    '      this.wsSubscriptions.set(subId, (raw) => {',
    '        // graphql-ws `next` carries an ExecutionResult envelope, not the',
    '        // event itself. Handing the envelope to the callback would satisfy',
    '        // no declared type and break every consumer.',
    '        const data = (raw as { data?: Record<string, unknown> } | undefined)?.data;',
    '        const event = data?.[field];',
    '        if (event !== undefined && event !== null) {',
    '          callback(event as ChangeEvent<T>);',
    '        }',
    '      });',
    '    };',
    '    // Registered here rather than inside sendSubscribe, which only runs',
    '    // after connection_ack: a socket that fails before then still has to',
    '    // be reportable, and that is exactly the auth-failure case.',
    '    this.wsResubscribers.set(subId, sendSubscribe);',
    '    if (onClose) this.wsCloseHandlers.set(subId, onClose);',
    '    if (onResume) this.wsResumeHandlers.set(subId, onResume);',
    '    if (this.wsReady) {',
    '      sendSubscribe();',
    '    } else {',
    '      this.wsReadyQueue.push(sendSubscribe);',
    '      this.ensureWebSocket();',
    '    }',
    '    return {',
    '      unsubscribe: () => {',
    '        // Idempotent: React StrictMode runs effect cleanup twice, and a',
    '        // second `complete` for an id the server has already closed is a',
    '        // protocol error it may drop the connection over.',
    '        if (!this.wsResubscribers.has(subId) && !this.wsSubscriptions.has(subId)) return;',
    '        this.wsSubscriptions.delete(subId);',
    '        this.wsCloseHandlers.delete(subId);',
    '        this.wsResumeHandlers.delete(subId);',
    '        this.wsResubscribers.delete(subId);',
    '        if (this.wsSocket && this.wsSocket.readyState === WebSocket.OPEN) {',
    "          this.wsSocket.send(JSON.stringify({ id: subId, type: 'complete' }));",
    '        }',
    '      },',
    '    };',
    '  }',
    '',
    ...accessors,
    '}',
  ].join('\n');
}

// ─── Main SDK generation function ───

/**
 * Generated SDK file map: filename → content string.
 */
export interface SdkOutput {
  files: Map<string, string>;
}

/**
 * Generate a TypeScript SDK package from a ParsedSchema.
 *
 * Returns a map of file paths (relative to package root) to file content.
 * The generated code is self-contained and can be compiled with tsc.
 */
export function generateSdk(schema: ParsedSchema): SdkOutput {
  const knownEnums = new Set(schema.enums.map(e => e.name));
  const knownObjects = new Set(schema.objectTypes.map(o => o.name));

  const sections: string[] = [];

  // 1. Header
  sections.push([
    '/**',
    ' * Auto-generated TypeScript SDK from ODL schema.',
    ' * Do not edit manually — regenerate from the ODL source.',
    ' */',
    '',
  ].join('\n'));

  // 2. Redacted sentinel
  sections.push(generateRedactedType());
  sections.push('');

  // 3. Shared types
  sections.push(generateSharedTypes());
  sections.push('');

  // 4. Enums
  if (schema.enums.length > 0) {
    sections.push('// ─── Enums ───');
    sections.push('');
    sections.push(generateEnums(schema));
    sections.push('');
  }

  // 5. ObjectType interfaces
  sections.push('// ─── Object types ───');
  sections.push('');
  for (const obj of schema.objectTypes) {
    sections.push(generateObjectInterface(obj, knownEnums, knownObjects));
    sections.push('');
    sections.push(generateConnectionType(obj.name));
    sections.push('');
    sections.push(generateFilterInterface(obj, knownEnums));
    sections.push('');
    sections.push(generateOrderByInterface(obj, knownEnums));
    sections.push('');
  }

  // 6. Action input/result types
  if (schema.actionTypes.length > 0) {
    sections.push('// ─── Action types ───');
    sections.push('');
    for (const action of schema.actionTypes) {
      sections.push(generateActionInputInterface(action, knownEnums, knownObjects));
      sections.push('');
      sections.push(generateActionResultType(action));
      sections.push('');
    }
  }

  // 7. Client class
  sections.push(generateClientClass(schema));
  sections.push('');

  const indexTs = sections.join('\n');

  const files = new Map<string, string>();
  files.set('src/index.ts', indexTs);

  return { files };
}
