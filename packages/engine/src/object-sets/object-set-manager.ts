/**
 * ObjectSetManager — manages saved query definitions and their execution.
 *
 * Provides CRUD operations on ObjectSetDefinitions and the ability to
 * execute a saved query or aggregation against the ObjectManager.
 */

import type {
  RequestContext,
  ObjectSetDefinition,
  ObjectSetStore,
  ObjectPage,
  AggregateQuery,
  AggregateResult,
  PlatformError,
  SetAlgebraInput,
  FilterExpression,
} from '@altius/spi';
import type { ObjectManager } from '../objects/object-manager.js';

export class ObjectSetManager {
  constructor(
    private readonly store: ObjectSetStore,
    private readonly objectManager: ObjectManager,
  ) {}

  async create(
    def: Omit<ObjectSetDefinition, 'id' | 'createdAt' | 'updatedAt'>,
    ctx: RequestContext,
  ): Promise<ObjectSetDefinition> {
    return this.store.create(ctx, def);
  }

  async get(id: string, ctx: RequestContext): Promise<ObjectSetDefinition | null> {
    return this.store.get(ctx, id);
  }

  async getByName(name: string, ctx: RequestContext): Promise<ObjectSetDefinition | null> {
    return this.store.getByName(ctx, name);
  }

  async list(objectType: string | undefined, ctx: RequestContext): Promise<ObjectSetDefinition[]> {
    return this.store.list(ctx, objectType);
  }

  async update(
    id: string,
    updates: Partial<Pick<ObjectSetDefinition, 'name' | 'description' | 'filter' | 'orderBy' | 'limit' | 'aggregation' | 'isPublic'>>,
    ctx: RequestContext,
  ): Promise<ObjectSetDefinition> {
    return this.store.update(ctx, id, updates);
  }

  async delete(id: string, ctx: RequestContext): Promise<void> {
    return this.store.delete(ctx, id);
  }

  /**
   * Execute the saved query, returning a paginated object page.
   */
  async execute(
    id: string,
    ctx: RequestContext,
    pagination?: { limit?: number; offset?: number },
  ): Promise<ObjectPage> {
    const def = await this.store.get(ctx, id);
    if (!def) {
      const error: PlatformError = {
        code: 'OBJECT_SET_NOT_FOUND',
        category: 'not_found',
        message: `Object set ${id} not found`,
        retryable: false,
      };
      throw error;
    }

    const limit = pagination?.limit ?? def.limit;
    const offset = pagination?.offset ?? 0;

    return this.objectManager.query(
      def.objectType,
      def.filter ?? { and: [] },
      {
        limit,
        offset,
        orderBy: def.orderBy,
      },
      ctx,
    );
  }

  /**
   * Execute the saved aggregation query, if one is defined.
   */
  async executeAggregate(
    id: string,
    ctx: RequestContext,
  ): Promise<AggregateResult> {
    const def = await this.store.get(ctx, id);
    if (!def) {
      const error: PlatformError = {
        code: 'OBJECT_SET_NOT_FOUND',
        category: 'not_found',
        message: `Object set ${id} not found`,
        retryable: false,
      };
      throw error;
    }

    if (!def.aggregation) {
      const error: PlatformError = {
        code: 'INVALID_OPERATION',
        category: 'validation',
        message: `Object set ${id} has no aggregation defined`,
        retryable: false,
      };
      throw error;
    }

    // Merge the object set's filter into the aggregation query so the
    // aggregation is scoped to the same objects the set would return.
    const aggregation: AggregateQuery = { ...def.aggregation };
    if (def.filter) {
      if (aggregation.filter) {
        aggregation.filter = { and: [def.filter, aggregation.filter] };
      } else {
        aggregation.filter = def.filter;
      }
    }

    return this.objectManager.aggregate(def.objectType, aggregation, ctx);
  }

  /**
   * Combine two object sets of the same object type into a new set.
   *
   * - UNION: objects in either set (OR of filters)
   * - INTERSECT: objects in both sets (AND of filters)
   * - DIFFERENCE: objects in the left set but not the right (left filter AND NOT right filter)
   *
   * The resulting set inherits the left set's objectType and orderBy. The
   * limit is unset (the union/intersect/difference may need more rows than
   * either input).
   */
  async combine(
    input: SetAlgebraInput,
    ctx: RequestContext,
  ): Promise<ObjectSetDefinition> {
    const left = await this.store.get(ctx, input.leftSetId);
    if (!left) {
      throw {
        code: 'OBJECT_SET_NOT_FOUND',
        category: 'not_found',
        message: `Left object set ${input.leftSetId} not found`,
        retryable: false,
      } as PlatformError;
    }
    const right = await this.store.get(ctx, input.rightSetId);
    if (!right) {
      throw {
        code: 'OBJECT_SET_NOT_FOUND',
        category: 'not_found',
        message: `Right object set ${input.rightSetId} not found`,
        retryable: false,
      } as PlatformError;
    }
    if (left.objectType !== right.objectType) {
      throw {
        code: 'TYPE_MISMATCH',
        category: 'validation',
        message: `Cannot combine sets of different types: ${left.objectType} vs ${right.objectType}`,
        retryable: false,
      } as PlatformError;
    }

    const leftFilter = left.filter ?? { and: [] };
    const rightFilter = right.filter ?? { and: [] };

    let combinedFilter: FilterExpression;
    switch (input.op) {
      case 'UNION':
        combinedFilter = { or: [leftFilter, rightFilter] };
        break;
      case 'INTERSECT':
        combinedFilter = { and: [leftFilter, rightFilter] };
        break;
      case 'DIFFERENCE':
        combinedFilter = { and: [leftFilter, { not: rightFilter }] };
        break;
      default:
        throw {
          code: 'INVALID_OPERATION',
          category: 'validation',
          message: `Unknown set algebra operation: ${input.op}`,
          retryable: false,
        } as PlatformError;
    }

    return this.store.create(ctx, {
      name: input.name,
      description: input.description,
      objectType: left.objectType,
      filter: combinedFilter,
      orderBy: left.orderBy,
      isPublic: input.isPublic ?? false,
      createdBy: ctx.actorId ?? 'system',
      tenantId: ctx.tenantId,
    });
  }
}
