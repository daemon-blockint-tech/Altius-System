/**
 * REST routes for ontology branching.
 *
 *   GET    /api/v1/branches                   — list branches
 *   POST   /api/v1/branches                   — create branch
 *   GET    /api/v1/branches/:name             — get branch
 *   DELETE /api/v1/branches/:name             — abandon branch
 *   POST   /api/v1/branches/:name/merge       — merge branch
 *   GET    /api/v1/proposals                  — list proposals
 *   POST   /api/v1/proposals                  — create proposal
 *   POST   /api/v1/proposals/:id/submit       — submit for review
 *   POST   /api/v1/proposals/:id/approve      — approve and merge
 *   POST   /api/v1/proposals/:id/reject       — reject
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import { extractUser } from '../config.js';

export function registerBranchRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.branchStore) return;
  const store = deps.branchStore;

  // ── GET /api/v1/branches — list branches ──
  app.get('/api/v1/branches', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const branches = await store.listBranches(user.tenantId);
      res.status(200).json({ branches });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/branches — create branch ──
  app.post('/api/v1/branches', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const body = req.body as { name: string; parent?: string; description?: string };
      if (!body.name) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'name is required' });
        return;
      }
      const branch = await store.createBranch({
        tenantId: user.tenantId,
        name: body.name,
        parent: body.parent ?? 'main',
        createdBy: user.id,
        description: body.description,
      });
      res.status(201).json(branch);
    } catch (err) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/branches/:name — get branch ──
  app.get('/api/v1/branches/:name', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const branch = await store.getBranch(user.tenantId, req.params['name']!);
      if (!branch) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Branch not found' });
        return;
      }
      res.status(200).json(branch);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── DELETE /api/v1/branches/:name — abandon branch ──
  app.delete('/api/v1/branches/:name', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.abandonBranch(user.tenantId, req.params['name']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/branches/:name/merge — merge branch ──
  app.post('/api/v1/branches/:name/merge', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const result = await store.mergeBranch(user.tenantId, req.params['name']!, user.id);
      res.status(result.success ? 200 : 409).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/proposals — list proposals ──
  app.get('/api/v1/proposals', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const branchName = req.query['branch'] as string | undefined;
      const proposals = await store.listProposals(user.tenantId, branchName);
      res.status(200).json({ proposals });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/proposals — create proposal ──
  app.post('/api/v1/proposals', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const body = req.body as { branchName: string; targetBranch?: string; summary?: string };
      if (!body.branchName) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'branchName is required' });
        return;
      }
      const proposal = await store.createProposal({
        tenantId: user.tenantId,
        branchName: body.branchName,
        targetBranch: body.targetBranch ?? 'main',
        createdBy: user.id,
        summary: body.summary,
      });
      res.status(201).json(proposal);
    } catch (err) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/proposals/:id/submit — submit for review ──
  app.post('/api/v1/proposals/:id/submit', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.submitProposal(user.tenantId, req.params['id']!);
      res.status(200).json({ status: 'submitted' });
    } catch (err) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/proposals/:id/approve — approve and merge ──
  app.post('/api/v1/proposals/:id/approve', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const body = req.body as { comment?: string };
      const result = await store.approveProposal(user.tenantId, req.params['id']!, user.id, body.comment);
      res.status(result.success ? 200 : 409).json(result);
    } catch (err) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/proposals/:id/reject — reject ──
  app.post('/api/v1/proposals/:id/reject', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const body = req.body as { comment?: string };
      await store.rejectProposal(user.tenantId, req.params['id']!, user.id, body.comment);
      res.status(200).json({ status: 'rejected' });
    } catch (err) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
