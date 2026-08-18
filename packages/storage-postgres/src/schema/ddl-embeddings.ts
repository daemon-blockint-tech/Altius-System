/**
 * DDL for the embeddings schema.
 *
 * Uses pgvector for cosine similarity search. The extension must be installed
 * in the database before these tables are created — the DDL creates it
 * opportunistically with CREATE EXTENSION IF NOT EXISTS, but pgvector
 * requires a superuser or the trusted-extension flag (PG17+).
 */

export function generateEmbeddingsDDL(): string[] {
  const statements: string[] = [];

  statements.push(`CREATE SCHEMA IF NOT EXISTS "embed";`);

  // pgvector extension — needed for the vector column type.
  // Trusted extension in PG13+, so a non-superuser with CREATE privilege can install it.
  statements.push(`CREATE EXTENSION IF NOT EXISTS vector;`);

  // Embeddings table — one row per (tenant, type, objectId, field).
  // The vector column stores the embedding; pgvector provides the cosine
  // similarity operator <=> for fast nearest-neighbor search.
  statements.push(`CREATE TABLE IF NOT EXISTS "embed"."embeddings" (
  "tenant_id" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "vector" vector(1536),
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("tenant_id", "object_type", "object_id", "field")
);`);

  // IVFFlat index for fast cosine similarity search.
  // The index is built on the vector column using the cosine distance operator.
  // lists=100 is a reasonable default for up to ~100k rows; for larger datasets,
  // increase to sqrt(rows).
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_embeddings_vector" ON "embed"."embeddings" USING ivfflat ("vector" vector_cosine_ops) WITH (lists = 100);`,
  );

  // Tenant + type index for filtered search and count queries.
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_embeddings_tenant_type" ON "embed"."embeddings" ("tenant_id", "object_type");`,
  );

  return statements;
}
