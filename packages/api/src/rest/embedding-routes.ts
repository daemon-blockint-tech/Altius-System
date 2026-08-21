/**
 * REST routes for embedding storage and vector similarity search.
 *
 *   PUT    /api/v1/embeddings/:type/:id/:field    — upsert embedding
 *   GET    /api/v1/embeddings/:type/:id/:field    — get embedding
 *   DELETE /api/v1/embeddings/:type/:id/:field    — delete embedding
 *   POST   /api/v1/embeddings/:type/:field/search — similarity search (vector input)
 *   POST   /api/v1/embeddings/:type/:field/query  — text-to-vector similarity search
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RequestContext } from '@altius/spi';
import { extractUser } from '../config.js';
import { checkObjectAccess, viewableObjectIds } from './object-access.js';
import { isTypeVisible } from '../markings/enforce.js';

function ctxFromUser(user: { tenantId: string; id: string }): RequestContext {
  return { tenantId: user.tenantId, actorId: user.id };
}

/** Intersect a caller-supplied id list with what they're authorized to view. */
function narrowAllowedIds(
  callerSupplied: string[] | undefined,
  scope: { allowAll: boolean; ids: string[] },
): string[] | undefined {
  if (scope.allowAll) return callerSupplied; // dev/allow-all: honor caller's optional list
  if (!callerSupplied) return scope.ids;
  const viewable = new Set(scope.ids);
  return callerSupplied.filter(id => viewable.has(id));
}

export function registerEmbeddingRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.embeddingStore) return;
  const store = deps.embeddingStore;
  const llmClient = deps.llmClient;

  // ── PUT /api/v1/embeddings/:type/:id/:field — upsert ──
  app.put('/api/v1/embeddings/:type/:id/:field', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      // Storing an object's embedding requires write access to that object.
      const denied = await checkObjectAccess(deps, user, req.params['type']!, req.params['id']!, 'write');
      if (denied) { res.status(denied.status).json(denied.body); return; }
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
      const denied = await checkObjectAccess(deps, user, req.params['type']!, req.params['id']!, 'read');
      if (denied) { res.status(denied.status).json(denied.body); return; }
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
      const denied = await checkObjectAccess(deps, user, req.params['type']!, req.params['id']!, 'write');
      if (denied) { res.status(denied.status).json(denied.body); return; }
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
      // A vector search returns object ids by similarity; without scoping it
      // discloses objects (and their similarity) the caller cannot see. Hide the
      // whole type behind markings, then restrict hits to viewable ids.
      const type = req.params['type']!;
      if (!isTypeVisible(deps.markingPolicy, user, type)) { res.status(404).json({ error: 'NOT_FOUND', message: 'Not found' }); return; }
      const allowedObjectIds = narrowAllowedIds(body.allowedObjectIds, await viewableObjectIds(deps, user, type));
      const result = await store.search(ctx, type, req.params['field']!, body.vector, {
        limit: body.limit,
        minScore: body.minScore,
        allowedObjectIds,
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/embeddings/:type/:field/query — text-to-vector similarity search ──
  // Accepts a text query, embeds it via LLMClient.embed(), then runs vector search.
  // Requires llmClient to be configured.
  app.post('/api/v1/embeddings/:type/:field/query', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as { query: string; limit?: number; minScore?: number; allowedObjectIds?: string[] };
      if (!body.query || typeof body.query !== 'string') {
        res.status(400).json({ error: 'INVALID', message: 'query must be a non-empty string' });
        return;
      }
      if (!llmClient || !llmClient.isConfigured()) {
        res.status(503).json({ error: 'NOT_CONFIGURED', message: 'LLM client not configured — cannot embed text query' });
        return;
      }
      const type = req.params['type']!;
      if (!isTypeVisible(deps.markingPolicy, user, type)) { res.status(404).json({ error: 'NOT_FOUND', message: 'Not found' }); return; }
      const embedResult = await llmClient.embed(ctx, body.query);
      const allowedObjectIds = narrowAllowedIds(body.allowedObjectIds, await viewableObjectIds(deps, user, type));
      const result = await store.search(ctx, type, req.params['field']!, embedResult.vector, {
        limit: body.limit,
        minScore: body.minScore,
        allowedObjectIds,
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
