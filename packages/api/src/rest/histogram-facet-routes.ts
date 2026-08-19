/**
 * REST routes for histogram and facet queries — convenience endpoints that
 * wrap the aggregate API for Filter List histograms and prominent terms.
 *
 * For each object type (wired by the route generator):
 *   POST   /api/v1/{plural}/histogram   — bucketed histogram (date or numeric)
 *   POST   /api/v1/{plural}/facets      — facet counts for categorical fields
 *
 * These are thin wrappers over the aggregate API that make the common
 * Filter List / prominent-terms patterns a single call rather than
 * requiring the client to construct an AggregateQuery body.
 */

import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import type { ObjectType } from '@altius/odl';
import type { AggregateQuery, AggregateField, FilterExpression, BucketInterval, AggregateFunction } from '@altius/spi';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

/**
 * Generate histogram + facet routes for an object type.
 */
export function generateHistogramFacetRoutes(
  obj: ObjectType,
  plural: string,
  _fgaType: string,
  deps: ApiDependencies,
): RestRoute[] {
  const routes: RestRoute[] = [];

  // POST /api/v1/{plural}/histogram — bucketed histogram
  routes.push({
    method: 'POST',
    readOperation: 'query',
    pattern: `/api/v1/${plural}/histogram`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const field = body['field'] as string | undefined;
        if (!field) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'A "field" string is required',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        const fieldDef = obj.fields.find((f) => f.name === field);
        if (!fieldDef) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: `Field "${field}" does not exist on ${obj.name}`,
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        const isDateField = fieldDef.type.name === 'DateTime' || fieldDef.type.name === 'Date';
        const isNumericField = fieldDef.type.name === 'Int' || fieldDef.type.name === 'Float';

        if (!isDateField && !isNumericField) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: `Field "${field}" is ${fieldDef.type.name}, histogram requires DateTime/Date or Int/Float`,
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        const userFilter = body['filter'] as FilterExpression | undefined;
        const fields: AggregateField[] = [{ field: '*', fn: 'count' as AggregateFunction, alias: 'count' }];

        const aggregateQuery: AggregateQuery = {
          fields,
          filter: userFilter,
        };

        if (isDateField) {
          const interval = (body['interval'] as BucketInterval) ?? 'day';
          aggregateQuery.buckets = [{ field, interval, alias: 'bucket' }];
        } else {
          const min = body['min'] as number | undefined;
          const max = body['max'] as number | undefined;
          const numBuckets = (body['numBuckets'] as number) ?? 10;
          if (min === undefined || max === undefined) {
            return createRestErrorResponse({
              code: 'MISSING_PARAMETER',
              category: 'validation',
              message: 'Numeric histogram requires "min" and "max" parameters',
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          aggregateQuery.buckets = [{ field, min, max, numBuckets, alias: 'bucket' }];
        }

        if (typeof body['limit'] === 'number') aggregateQuery.limit = body['limit'];
        if (typeof body['offset'] === 'number') aggregateQuery.offset = body['offset'];

        const result = await deps.objectManager.aggregate(obj.name, aggregateQuery, ctx.requestContext);
        return { status: 200, body: { data: result } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/{plural}/facets — facet counts for categorical fields
  routes.push({
    method: 'POST',
    readOperation: 'query',
    pattern: `/api/v1/${plural}/facets`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const fields = body['fields'] as string[] | undefined;
        if (!fields || !Array.isArray(fields) || fields.length === 0) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'A "fields" string array is required',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        const userFilter = body['filter'] as FilterExpression | undefined;
        const limit = typeof body['limit'] === 'number' ? body['limit'] : 20;

        // Validate fields exist and are non-link/non-computed
        const aggregatable = new Set(
          obj.fields
            .filter((f) => !f.directives.some((d) => d.kind === 'link' || d.kind === 'computed' || d.kind === 'reducer'))
            .map((f) => f.name),
        );
        const unknown = fields.filter((f) => !aggregatable.has(f));
        if (unknown.length > 0) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: `Cannot facet on ${unknown.join(', ')}: not an aggregatable field of ${obj.name}`,
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        // Run one aggregate per field and combine into a facet result
        const facets: Record<string, Array<{ value: string; count: number }>> = {};
        for (const field of fields) {
          const aggregateQuery: AggregateQuery = {
            fields: [{ field: '*', fn: 'count' as AggregateFunction, alias: 'count' }],
            groupBy: [field],
            filter: userFilter,
            orderBy: [{ field: 'count', direction: 'desc' }],
            limit,
          };
          const result = await deps.objectManager.aggregate(obj.name, aggregateQuery, ctx.requestContext);
          facets[field] = result.groups.map((g) => ({
            value: String(g.keys[field] ?? 'null'),
            count: g.values['count'] ?? 0,
          }));
        }

        return { status: 200, body: { data: { facets } } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  return routes;
}
