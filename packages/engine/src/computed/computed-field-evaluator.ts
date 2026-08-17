/**
 * ComputedFieldEvaluator — evaluates @computed fields on read (Section 4.4).
 *
 * For MVP, only LAZY evaluation is supported: fields are recomputed on every
 * read with no caching. EAGER and TTL strategies are deferred.
 *
 * Built-in functions:
 * - countLinks: counts active links of a given type in a given direction.
 * - lookupField: reads a scalar from the first linked object.
 * - sumLinks / avgLinks / minLinks / maxLinks: aggregate a numeric field
 *   across every linked object.
 */

import type {
  StorageProvider,
  RequestContext,
  OntologyLink,
} from '@altius/spi';
import type {
  ParsedSchema,
  FieldDefinition,
  ComputedDirective,
  DirectiveArgValue,
} from '@altius/odl';
import type { FunctionExecutor } from '../functions/function-executor.js';
import { MAX_LINK_QUERY_LIMIT } from '@altius/spi';

/** Context passed to built-in compute functions. */
export interface ComputeContext {
  storage: StorageProvider;
  ctx: RequestContext;
  objectType: string;
  objectId: string;
}

/** A built-in compute function signature. */
export type ComputeFunction = (
  args: DirectiveArgValue | undefined,
  context: ComputeContext,
) => Promise<unknown>;

/** Registry of built-in compute functions. */
const BUILT_IN_FUNCTIONS: Record<string, ComputeFunction> = {
  countLinks,
  lookupField,
  sumLinks: aggregateLinks('sum'),
  avgLinks: aggregateLinks('avg'),
  minLinks: aggregateLinks('min'),
  maxLinks: aggregateLinks('max'),
};

/**
 * countLinks — counts active (non-deleted) inbound links of a given type.
 *
 * Args (from @computed directive):
 *   - type: string — the link type name
 *   - direction: 'INBOUND' | 'OUTBOUND' (defaults to 'INBOUND')
 *
 * Example ODL:
 *   currentOccupancy: Int @computed(fn: "countLinks", args: { type: "AdmittedTo" })
 */
async function countLinks(
  args: DirectiveArgValue | undefined,
  context: ComputeContext,
): Promise<number> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('countLinks requires args with { type: string }');
  }

  const argsObj = args as Record<string, DirectiveArgValue>;
  const linkType = argsObj.type;
  if (typeof linkType !== 'string') {
    throw new Error('countLinks requires args.type to be a string');
  }

  const direction = typeof argsObj.direction === 'string'
    ? (argsObj.direction.toLowerCase() as 'inbound' | 'outbound')
    : 'inbound';

  const result = await context.storage.getLinks(
    context.ctx,
    context.objectId,
    linkType,
    direction,
  );

  return result.totalCount;
}

/**
 * lookupField — fetches a scalar field from a related object via a link.
 *
 * Args (from @computed directive):
 *   - linkType: string — the link type to traverse
 *   - direction: 'INBOUND' | 'OUTBOUND' (defaults to 'OUTBOUND')
 *   - field: string — the field to read from the related object
 *
 * Example ODL:
 *   wardName: String @computed(fn: "lookupField", args: { linkType: "AdmittedTo", field: "name" })
 *
 * Returns the first related object's field value, or null if no related
 * object exists. Multi-value lookups are intentionally unsupported — use
 * a FunctionType for richer traversals.
 */
async function lookupField(
  args: DirectiveArgValue | undefined,
  context: ComputeContext,
): Promise<unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('lookupField requires args with { linkType: string, field: string }');
  }
  const argsObj = args as Record<string, DirectiveArgValue>;
  const linkType = argsObj.linkType;
  const field = argsObj.field;
  if (typeof linkType !== 'string' || typeof field !== 'string') {
    throw new Error('lookupField requires args.linkType and args.field to be strings');
  }
  const direction = typeof argsObj.direction === 'string'
    ? (argsObj.direction.toLowerCase() as 'inbound' | 'outbound')
    : 'outbound';

  const result = await context.storage.getLinks(
    context.ctx,
    context.objectId,
    linkType,
    direction,
  );
  if (result.items.length === 0) return null;

  const link = result.items[0]!;
  const target = await loadLinkTarget(link, direction, context);
  if (!target) return null;
  return target[field] ?? null;
}

/**
 * Resolve the object at the far end of a link.
 *
 * Both the id and the type must come from the same end: an inbound traversal
 * reads `_fromId`, so it must also read `_fromType`. Taking the id from one end
 * and the type from the other looks up a real id in the wrong type's table and
 * silently returns null.
 */
async function loadLinkTarget(
  link: OntologyLink,
  direction: 'inbound' | 'outbound',
  context: ComputeContext,
): Promise<Record<string, unknown> | null> {
  const targetId = direction === 'outbound' ? link._toId : link._fromId;
  const targetType = direction === 'outbound' ? link._toType : link._fromType;
  const target = await context.storage.getObject(context.ctx, targetType, targetId);
  return (target as Record<string, unknown> | null) ?? null;
}

/**
 * Aggregate a numeric field across every object linked to this one.
 *
 * Args (from @computed directive):
 *   - linkType: string — the link type to traverse
 *   - field: string — the numeric field to aggregate on the linked objects
 *   - direction: 'INBOUND' | 'OUTBOUND' (defaults to 'OUTBOUND')
 *
 * Example ODL:
 *   totalDose: Float @computed(fn: "sumLinks", args: { linkType: "Prescribed", field: "dose" })
 *
 * Missing values (null/undefined) are skipped rather than counted as zero —
 * an unrecorded reading is not a reading of nothing. A present but
 * non-numeric value is a data or schema error and throws rather than being
 * silently coerced. `sum` over no values is 0; `avg`/`min`/`max` are null.
 */
type NumericAggregate = 'sum' | 'avg' | 'min' | 'max';

function aggregateLinks(op: NumericAggregate): ComputeFunction {
  return async (args, context) => {
    const label = `${op}Links`;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error(`${label} requires args with { linkType: string, field: string }`);
    }
    const argsObj = args as Record<string, DirectiveArgValue>;
    const linkType = argsObj.linkType;
    const field = argsObj.field;
    if (typeof linkType !== 'string' || typeof field !== 'string') {
      throw new Error(`${label} requires args.linkType and args.field to be strings`);
    }
    const direction = typeof argsObj.direction === 'string'
      ? (argsObj.direction.toLowerCase() as 'inbound' | 'outbound')
      : 'outbound';

    // getLinks pages, and its default page is DEFAULT_LINK_QUERY_LIMIT (100).
    // Passing no options meant this aggregated the FIRST 100 links and reported
    // the result as a total: a Patient with 150 readings summed 100 of them,
    // with nothing in the response to say so. `countLinks` on the same object
    // reads `totalCount` and answers 150, so the two computed fields
    // contradicted each other on the same payload.
    //
    // MAX_LINK_QUERY_LIMIT is the largest page the SPI permits, so it is the
    // most this can see in one call — and beyond it the honest answer is an
    // error. An aggregate that cannot reach all its inputs must fail loudly;
    // under-reporting is the failure mode nobody notices.
    const links = await context.storage.getLinks(
      context.ctx, context.objectId, linkType, direction,
      { limit: MAX_LINK_QUERY_LIMIT },
    );
    if (links.hasNextPage) {
      throw new Error(
        `${label}: ${linkType} has more than ${MAX_LINK_QUERY_LIMIT} links from this object ` +
        `(${links.totalCount} total). A computed aggregate cannot page, and silently ` +
        `aggregating the first ${MAX_LINK_QUERY_LIMIT} would report a wrong total.`,
      );
    }

    const values: number[] = [];
    for (const link of links.items) {
      const target = await loadLinkTarget(link, direction, context);
      if (!target) continue;
      const raw = target[field];
      if (raw === null || raw === undefined) continue;
      if (typeof raw !== 'number' || Number.isNaN(raw)) {
        throw new Error(
          `${label}: ${link._toType}.${field} is ${JSON.stringify(raw)}, which is not a number`,
        );
      }
      values.push(raw);
    }

    if (op === 'sum') return values.reduce((a, b) => a + b, 0);
    if (values.length === 0) return null;
    if (op === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
    if (op === 'min') return Math.min(...values);
    return Math.max(...values);
  };
}

/** Configuration for ComputedFieldEvaluator. */
export interface ComputedFieldEvaluatorConfig {
  storage: StorageProvider;
  schema: ParsedSchema;
  /**
   * Optional FunctionExecutor. When present, @computed fields whose `fn`
   * matches a declared FunctionType are dispatched through it instead of
   * the built-in registry. This bridges ODL Functions (Section 6) into
   * the computed-field read path: a field can be declared as
   * `@computed(fn: "ScoreRisk")` and resolved by a user-authored function
   * rather than a platform built-in.
   */
  functionExecutor?: FunctionExecutor;
}

/**
 * Evaluates @computed fields for objects.
 *
 * MVP supports LAZY evaluation only — fields are computed on every read.
 */
export class ComputedFieldEvaluator {
  private readonly storage: StorageProvider;
  private readonly schema: ParsedSchema;
  private readonly functionExecutor?: FunctionExecutor;

  constructor(config: ComputedFieldEvaluatorConfig) {
    this.storage = config.storage;
    this.schema = config.schema;
    this.functionExecutor = config.functionExecutor;
  }

  /**
   * Evaluate a single computed field.
   */
  async evaluate(
    objectType: string,
    objectId: string,
    fieldName: string,
    ctx: RequestContext,
  ): Promise<unknown> {
    const typeDef = this.schema.objectTypes.find((t) => t.name === objectType);
    if (!typeDef) {
      throw new Error(`Unknown object type: ${objectType}`);
    }

    const fieldDef = typeDef.fields.find((f) => f.name === fieldName);
    if (!fieldDef) {
      throw new Error(`Unknown field: ${objectType}.${fieldName}`);
    }

    const computedDirective = fieldDef.directives.find(
      (d): d is ComputedDirective => d.kind === 'computed',
    );
    if (!computedDirective) {
      throw new Error(`Field ${objectType}.${fieldName} is not a computed field`);
    }

    // Dispatch to FunctionExecutor when the fn name matches a declared
    // FunctionType. The args object is passed through as the function's
    // inputs, augmented with the current object's id and type so the
    // function can reference the triggering object.
    if (this.functionExecutor) {
      const fnDef = this.functionExecutor.getFunction(computedDirective.fn);
      if (fnDef) {
        const inputs: Record<string, unknown> = {};
        if (computedDirective.args && typeof computedDirective.args === 'object' && !Array.isArray(computedDirective.args)) {
          Object.assign(inputs, computedDirective.args as Record<string, unknown>);
        }
        inputs['this'] = { _type: objectType, _id: objectId };
        const result = await this.functionExecutor.execute(computedDirective.fn, inputs);
        return result.result;
      }
    }

    const fn = BUILT_IN_FUNCTIONS[computedDirective.fn];
    if (!fn) {
      throw new Error(`Unknown compute function: ${computedDirective.fn}`);
    }

    return fn(computedDirective.args, {
      storage: this.storage,
      ctx,
      objectType,
      objectId,
    });
  }

  /**
   * Get all computed fields for a given object type that should be evaluated
   * on read. Returns field definitions that have @computed with cache LAZY,
   * EAGER, or no cache (LAZY is the default).
   *
   * EAGER fields are evaluated on read the same way as LAZY — the difference
   * is that an EAGER field may eventually be pre-computed at write time and
   * cached, but until that write-time pipeline exists, evaluating on read is
   * the only way to populate them. Excluding EAGER fields left them silently
   * null in every response despite being declared in the SDL/REST shape.
   */
  getComputedFields(objectType: string): FieldDefinition[] {
    const typeDef = this.schema.objectTypes.find((t) => t.name === objectType);
    if (!typeDef) return [];

    return typeDef.fields.filter((field) => {
      const computed = field.directives.find(
        (d): d is ComputedDirective => d.kind === 'computed',
      );
      if (!computed) return false;
      // LAZY is the default. EAGER is treated the same as LAZY for now —
      // both are evaluated on read. A future write-time pipeline may
      // pre-compute and cache EAGER fields, but until then they must not
      // be silently null.
      return !computed.cache || computed.cache === 'LAZY' || computed.cache === 'EAGER';
    });
  }

  /**
   * Evaluate all computed fields for an object and return them as a
   * properties map to merge into the returned object.
   */
  async evaluateAll(
    objectType: string,
    objectId: string,
    ctx: RequestContext,
  ): Promise<Record<string, unknown>> {
    const fields = this.getComputedFields(objectType);
    const result: Record<string, unknown> = {};

    for (const field of fields) {
      result[field.name] = await this.evaluate(
        objectType,
        objectId,
        field.name,
        ctx,
      );
    }

    return result;
  }
}
