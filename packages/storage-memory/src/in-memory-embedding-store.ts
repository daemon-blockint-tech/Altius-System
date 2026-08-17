/**
 * In-memory embedding store with brute-force cosine similarity search.
 */

import type {
  EmbeddingStore,
  StoredEmbedding,
  CreateEmbeddingInput,
  EmbeddingSearchOptions,
  EmbeddingSearchHit,
  EmbeddingSearchResult,
  RequestContext,
} from '@altius/spi';
import { cosineSimilarity } from '@altius/spi';

interface EmbeddingKey {
  tenantId: string;
  objectType: string;
  objectId: string;
  field: string;
}

function keyOf(k: EmbeddingKey): string {
  return `${k.tenantId}|${k.objectType}|${k.objectId}|${k.field}`;
}

export class InMemoryEmbeddingStore implements EmbeddingStore {
  private readonly embeddings = new Map<string, StoredEmbedding>();

  async upsert(ctx: RequestContext, input: CreateEmbeddingInput): Promise<StoredEmbedding> {
    const key = keyOf({
      tenantId: ctx.tenantId,
      objectType: input.objectType,
      objectId: input.objectId,
      field: input.field,
    });
    const stored: StoredEmbedding = {
      tenantId: ctx.tenantId,
      objectType: input.objectType,
      objectId: input.objectId,
      field: input.field,
      vector: input.vector,
      model: input.model,
      dimensions: input.dimensions,
      createdAt: new Date().toISOString(),
    };
    this.embeddings.set(key, stored);
    return stored;
  }

  async get(ctx: RequestContext, objectType: string, objectId: string, field: string): Promise<StoredEmbedding | null> {
    const key = keyOf({ tenantId: ctx.tenantId, objectType, objectId, field });
    return this.embeddings.get(key) ?? null;
  }

  async delete(ctx: RequestContext, objectType: string, objectId: string, field: string): Promise<void> {
    const key = keyOf({ tenantId: ctx.tenantId, objectType, objectId, field });
    this.embeddings.delete(key);
  }

  async deleteAllForObject(ctx: RequestContext, objectType: string, objectId: string): Promise<void> {
    const prefix = `${ctx.tenantId}|${objectType}|${objectId}|`;
    for (const k of Array.from(this.embeddings.keys())) {
      if (k.startsWith(prefix)) this.embeddings.delete(k);
    }
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
    const allowed = options?.allowedObjectIds ? new Set(options.allowedObjectIds) : null;

    const hits: EmbeddingSearchHit[] = [];
    for (const e of this.embeddings.values()) {
      if (e.tenantId !== ctx.tenantId) continue;
      if (e.objectType !== objectType) continue;
      if (e.field !== field) continue;
      if (allowed && !allowed.has(e.objectId)) continue;

      const score = cosineSimilarity(queryVector, e.vector);
      if (score >= minScore) {
        hits.push({ objectId: e.objectId, objectType: e.objectType, field: e.field, score });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    const totalCount = hits.length;
    const top = hits.slice(0, limit);

    return { hits: top, totalCount };
  }

  async count(ctx: RequestContext, objectType: string, field?: string): Promise<number> {
    let count = 0;
    for (const e of this.embeddings.values()) {
      if (e.tenantId !== ctx.tenantId) continue;
      if (e.objectType !== objectType) continue;
      if (field && e.field !== field) continue;
      count++;
    }
    return count;
  }

  /** Test helper: clear all embeddings. */
  clear(): void {
    this.embeddings.clear();
  }
}
