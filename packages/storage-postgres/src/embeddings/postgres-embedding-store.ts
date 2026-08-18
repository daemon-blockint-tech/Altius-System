/**
 * PostgreSQL implementation of EmbeddingStore using pgvector.
 *
 * Stores embeddings in "embed"."embeddings" with a vector(1536) column.
 * Cosine similarity search uses pgvector's <=> operator (cosine distance),
 * which is backed by an IVFFlat index for fast nearest-neighbor queries.
 *
 * The vector dimension is fixed at 1536 (OpenAI text-embedding-3-small).
 * Embeddings with different dimensions are stored in a separate column or
 * table in a future revision; for now, the SPI assumes a single dimensionality.
 */

import type { Pool } from 'pg';
import type {
  RequestContext,
  EmbeddingStore,
  StoredEmbedding,
  CreateEmbeddingInput,
  EmbeddingSearchOptions,
  EmbeddingSearchHit,
  EmbeddingSearchResult,
} from '@altius/spi';

export class PostgresEmbeddingStore implements EmbeddingStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async upsert(ctx: RequestContext, input: CreateEmbeddingInput): Promise<StoredEmbedding> {
    const vectorLiteral = `[${input.vector.join(',')}]`;
    const now = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO "embed"."embeddings"
        ("tenant_id", "object_type", "object_id", "field", "vector", "model", "dimensions", "created_at")
       VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)
       ON CONFLICT ("tenant_id", "object_type", "object_id", "field")
       DO UPDATE SET "vector" = EXCLUDED."vector", "model" = EXCLUDED."model",
        "dimensions" = EXCLUDED."dimensions", "created_at" = EXCLUDED."created_at"`,
      [
        ctx.tenantId,
        input.objectType,
        input.objectId,
        input.field,
        vectorLiteral,
        input.model,
        input.dimensions,
        now,
      ],
    );

    return {
      tenantId: ctx.tenantId,
      objectType: input.objectType,
      objectId: input.objectId,
      field: input.field,
      vector: input.vector,
      model: input.model,
      dimensions: input.dimensions,
      createdAt: now,
    };
  }

  async get(
    ctx: RequestContext,
    objectType: string,
    objectId: string,
    field: string,
  ): Promise<StoredEmbedding | null> {
    const result = await this.pool.query(
      `SELECT "vector"::text, "model", "dimensions", "created_at"
       FROM "embed"."embeddings"
       WHERE "tenant_id" = $1 AND "object_type" = $2 AND "object_id" = $3 AND "field" = $4`,
      [ctx.tenantId, objectType, objectId, field],
    );

    if (result.rows.length === 0) return null;

    const r = result.rows[0]!;
    const vector = parseVector(r['vector']);
    return {
      tenantId: ctx.tenantId,
      objectType,
      objectId,
      field,
      vector,
      model: r['model'],
      dimensions: r['dimensions'],
      createdAt: r['created_at'],
    };
  }

  async delete(
    ctx: RequestContext,
    objectType: string,
    objectId: string,
    field: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM "embed"."embeddings"
       WHERE "tenant_id" = $1 AND "object_type" = $2 AND "object_id" = $3 AND "field" = $4`,
      [ctx.tenantId, objectType, objectId, field],
    );
  }

  async deleteAllForObject(
    ctx: RequestContext,
    objectType: string,
    objectId: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM "embed"."embeddings"
       WHERE "tenant_id" = $1 AND "object_type" = $2 AND "object_id" = $3`,
      [ctx.tenantId, objectType, objectId],
    );
  }

  async search(
    ctx: RequestContext,
    objectType: string,
    field: string,
    queryVector: number[],
    options?: EmbeddingSearchOptions,
  ): Promise<EmbeddingSearchResult> {
    const limit = options?.limit ?? 10;
    const minScore = options?.minScore ?? 0;
    const vectorLiteral = `[${queryVector.join(',')}]`;

    // pgvector cosine distance: 0 = identical, 2 = opposite.
    // Cosine similarity = 1 - distance, so we convert for the minScore filter.
    const cleanQuery = options?.allowedObjectIds && options.allowedObjectIds.length > 0
      ? `SELECT "object_id", "object_type", "field",
           1 - ("vector" <=> $4::vector) AS similarity
         FROM "embed"."embeddings"
         WHERE "tenant_id" = $1 AND "object_type" = $2 AND "field" = $3
           AND "object_id" = ANY($5)
           AND 1 - ("vector" <=> $4::vector) >= $6
         ORDER BY "vector" <=> $4::vector
         LIMIT $7`
      : `SELECT "object_id", "object_type", "field",
           1 - ("vector" <=> $4::vector) AS similarity
         FROM "embed"."embeddings"
         WHERE "tenant_id" = $1 AND "object_type" = $2 AND "field" = $3
           AND 1 - ("vector" <=> $4::vector) >= $5
         ORDER BY "vector" <=> $4::vector
         LIMIT $6`;

    const cleanParams = options?.allowedObjectIds && options.allowedObjectIds.length > 0
      ? [ctx.tenantId, objectType, field, vectorLiteral, options.allowedObjectIds, minScore, limit]
      : [ctx.tenantId, objectType, field, vectorLiteral, minScore, limit];

    const result = await this.pool.query(cleanQuery, cleanParams);

    const hits: EmbeddingSearchHit[] = result.rows.map((r) => ({
      objectId: r['object_id'],
      objectType: r['object_type'],
      field: r['field'],
      score: r['similarity'],
    }));

    return { hits, totalCount: hits.length };
  }

  async count(ctx: RequestContext, objectType: string, field?: string): Promise<number> {
    if (field) {
      const result = await this.pool.query(
        `SELECT COUNT(*)::int AS count FROM "embed"."embeddings"
         WHERE "tenant_id" = $1 AND "object_type" = $2 AND "field" = $3`,
        [ctx.tenantId, objectType, field],
      );
      return result.rows[0]!.count;
    }

    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM "embed"."embeddings"
       WHERE "tenant_id" = $1 AND "object_type" = $2`,
      [ctx.tenantId, objectType],
    );
    return result.rows[0]!.count;
  }
}

/** Parse a pgvector text representation "[1,2,3]" into a number[]. */
function parseVector(text: string): number[] {
  const cleaned = text.replace(/[\[\]()]/g, '');
  return cleaned.split(',').map(Number);
}
