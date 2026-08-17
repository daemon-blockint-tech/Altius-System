/**
 * Embedding store — manages vector embeddings for ontology objects.
 *
 * Decouples embedding storage and similarity search from the LLM client
 * (which only generates vectors). The store handles:
 *   - persisting embeddings indexed by (tenant, type, objectId, field)
 *   - cosine similarity search over stored vectors
 *   - tenant and authorization scoping
 *
 * The LLMClient.embed() function is used to generate vectors from text;
 * this store persists and queries them.
 */

import type { RequestContext } from './ontology.js';

/** A stored embedding vector. */
export interface StoredEmbedding {
  /** Tenant ID. */
  tenantId: string;
  /** Object type. */
  objectType: string;
  /** Object ID. */
  objectId: string;
  /** Field/property name that was embedded. */
  field: string;
  /** Embedding vector. */
  vector: number[];
  /** Model that produced the embedding. */
  model: string;
  /** Dimensionality. */
  dimensions: number;
  /** ISO 8601 timestamp when the embedding was created. */
  createdAt: string;
}

/** Options for creating an embedding record. */
export interface CreateEmbeddingInput {
  objectType: string;
  objectId: string;
  field: string;
  vector: number[];
  model: string;
  dimensions: number;
}

/** Options for similarity search. */
export interface EmbeddingSearchOptions {
  /** Number of results to return (default 10). */
  limit?: number;
  /** Minimum cosine similarity (0.0 to 1.0). */
  minScore?: number;
  /** Restrict to specific object IDs (authorization filter). */
  allowedObjectIds?: string[];
}

/** A search hit. */
export interface EmbeddingSearchHit {
  objectId: string;
  objectType: string;
  field: string;
  score: number;
}

/** Result of a similarity search. */
export interface EmbeddingSearchResult {
  hits: EmbeddingSearchHit[];
  totalCount: number;
}

/**
 * Embedding store — persistence and similarity search for vector embeddings.
 */
export interface EmbeddingStore {
  /** Store or replace an embedding for an object field. */
  upsert(ctx: RequestContext, input: CreateEmbeddingInput): Promise<StoredEmbedding>;

  /** Get the embedding for a specific object field, if it exists. */
  get(ctx: RequestContext, objectType: string, objectId: string, field: string): Promise<StoredEmbedding | null>;

  /** Delete an embedding for an object field. */
  delete(ctx: RequestContext, objectType: string, objectId: string, field: string): Promise<void>;

  /** Delete all embeddings for an object. */
  deleteAllForObject(ctx: RequestContext, objectType: string, objectId: string): Promise<void>;

  /** Search for similar objects by cosine similarity. */
  search(
    ctx: RequestContext,
    objectType: string,
    field: string,
    queryVector: number[],
    options?: EmbeddingSearchOptions,
  ): Promise<EmbeddingSearchResult>;

  /** Count embeddings for a type/field. */
  count(ctx: RequestContext, objectType: string, field?: string): Promise<number>;
}

/**
 * Cosine similarity between two vectors. Returns a value in [-1, 1].
 * Returns 0 for empty or mismatched-length vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
