/**
 * REST routes for embedding storage and vector similarity search.
 *
 *   PUT    /api/v1/embeddings/:type/:id/:field   — upsert embedding
 *   GET    /api/v1/embeddings/:type/:id/:field   — get embedding
 *   DELETE /api/v1/embeddings/:type/:id/:field   — delete embedding
 *   POST   /api/v1/embeddings/:type/:field/search — similarity search
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RequestContext } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): RequestContext {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerEmbeddingRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.embeddingStore) return;
  const store = deps.embeddingStore;

  // ── PUT /api/v1/embeddings/:type/:id/:field — upsert ──
  app.put('/api/v1/embeddings/:type/:id/:field', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as { vector: number[]; model: string; dimensions?: number };
      if (!Array.isArray(body.vector) || body.vector.length === 0) {
        res.status(400).json({ error: 'INVALID', message: 'vector must be a non-empty array' });
        return;
      }
      const stored = await store.upsert(ctx, {
        objectType: req.params['type']!,
        objectId: req.params['id']!,
        field: req.params['field']!,
        vector: body.vector,
        model: body.model ?? 'unknown',
        dimensions: body.dimensions ?? body.vector.length,
      });
      res.status(200).json(stored);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/embeddings/:type/:id/:field — get ──
  app.get('/api/v1/embeddings/:type/:id/:field', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const emb = await store.get(ctx, req.params['type']!, req.params['id']!, req.params['field']!);
      if (!emb) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Embedding not found' });
        return;
      }
      res.status(200).json(emb);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── DELETE /api/v1/embeddings/:type/:id/:field — delete ──
  app.delete('/api/v1/embeddings/:type/:id/:field', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await store.delete(ctx, req.params['type']!, req.params['id']!, req.params['field']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/embeddings/:type/:field/search — similarity search ──
  app.post('/api/v1/embeddings/:type/:field/search', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as { vector: number[]; limit?: number; minScore?: number; allowedObjectIds?: string[] };
      if (!Array.isArray(body.vector) || body.vector.length === 0) {
        res.status(400).json({ error: 'INVALID', message: 'vector must be a non-empty array' });
        return;
      }
      const result = await store.search(ctx, req.params['type']!, req.params['field']!, body.vector, {
        limit: body.limit,
        minScore: body.minScore,
        allowedObjectIds: body.allowedObjectIds,
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
