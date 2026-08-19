/**
 * REST routes for previously-unreachable SPI services.
 *
 * Wires 15 services that had InMemory implementations but no API surface,
 * moving them from "absent" to "partial" in the reachability grading.
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RequestContext } from '@altius/spi';
import { extractUser } from '../config.js';

function sendError(res: any, err: unknown): void {
  const message = err instanceof Error ? err.message : 'Failed';
  res.status(500).json({ error: 'INTERNAL', message });
}

export function registerAbsentServiceRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  const ctx = async (req: any): Promise<RequestContext> => {
    const user = await extractUser(req, authenticator, isDev);
    return { tenantId: user.tenantId, actorId: user.id };
  };

  // ── Change Proposals ──
  if (deps.changeProposalStore) {
    const store = deps.changeProposalStore;
    app.get('/api/v1/change-proposals', async (req, res) => {
      try { const user = await extractUser(req, authenticator, isDev); res.status(200).json(await store.list(user.tenantId, { state: req.query['state'] as any, limit: req.query['limit'] ? parseInt(String(req.query['limit']), 10) : undefined })); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/change-proposals', async (req, res) => {
      try { const user = await extractUser(req, authenticator, isDev); res.status(201).json(await store.create(user.tenantId, user.id, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/change-proposals/:id', async (req, res) => {
      try { const user = await extractUser(req, authenticator, isDev); const p = await store.get(user.tenantId, req.params['id']!); if (!p) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(p); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/change-proposals/:id/submit', async (req, res) => {
      try { const user = await extractUser(req, authenticator, isDev); res.status(200).json(await store.submit(user.tenantId, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/change-proposals/:id/approve', async (req, res) => {
      try { const user = await extractUser(req, authenticator, isDev); res.status(200).json(await store.approve(user.tenantId, req.params['id']!, user.id, req.body?.comments)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/change-proposals/:id/reject', async (req, res) => {
      try { const user = await extractUser(req, authenticator, isDev); res.status(200).json(await store.reject(user.tenantId, req.params['id']!, user.id, req.body?.comments)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/change-proposals/:id/withdraw', async (req, res) => {
      try { const user = await extractUser(req, authenticator, isDev); res.status(200).json(await store.withdraw(user.tenantId, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
  }

  // ── Business Rules ──
  if (deps.businessRulesService) {
    const svc = deps.businessRulesService;
    app.get('/api/v1/business-rules', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.list(c, req.query['state'] as any)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/business-rules', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.create(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/business-rules/:id', async (req, res) => {
      try { const c = await ctx(req); const r = await svc.get(c, req.params['id']!); if (!r) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(r); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/business-rules/:id/propose', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.submitForApproval(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/business-rules/:id/approve', async (req, res) => {
      try { const c = await ctx(req); const user = await extractUser(req, authenticator, isDev); res.status(200).json(await svc.approve(c, req.params['id']!, user.id, req.body?.notes)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/business-rules/:id/activate', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.activate(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/business-rules/:id/deactivate', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.deactivate(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/business-rules/:id/validate', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.validate(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
  }

  // ── Agent Evaluation ──
  if (deps.agentEvaluationService) {
    const svc = deps.agentEvaluationService;
    app.get('/api/v1/agent-evals/suites', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listSuites(c, req.query['agentIdentifier'] as string | undefined)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/agent-evals/suites', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.createSuite(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/agent-evals/suites/:id', async (req, res) => {
      try { const c = await ctx(req); const s = await svc.getSuite(c, req.params['id']!); if (!s) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(s); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/agent-evals/suites/:id/results', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listRunResults(c, req.params['id']!, req.query['limit'] ? parseInt(String(req.query['limit']), 10) : undefined)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/agent-evals/results/:id', async (req, res) => {
      try { const c = await ctx(req); const r = await svc.getRunResult(c, req.params['id']!); if (!r) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(r); } catch (err) { sendError(res, err); }
    });
  }

  // ── Agent Threads ──
  if (deps.agentThreadStore) {
    const store = deps.agentThreadStore;
    app.get('/api/v1/agent-threads', async (req, res) => {
      try { const c = await ctx(req); const user = await extractUser(req, authenticator, isDev); res.status(200).json(await store.listThreads(c, user.id)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/agent-threads', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await store.createThread(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/agent-threads/:id', async (req, res) => {
      try { const c = await ctx(req); const t = await store.getThread(c, req.params['id']!); if (!t) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(t); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/agent-threads/:id/messages', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await store.getMessages(c, req.params['id']!, req.query['limit'] ? parseInt(String(req.query['limit']), 10) : undefined)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/agent-threads/:id/messages', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await store.addMessage(c, req.params['id']!, req.body)); } catch (err) { sendError(res, err); }
    });
    app.delete('/api/v1/agent-threads/:id', async (req, res) => {
      try { const c = await ctx(req); await store.deleteThread(c, req.params['id']!); res.status(204).end(); } catch (err) { sendError(res, err); }
    });
  }

  // ── Conflict Resolution ──
  if (deps.conflictResolutionService) {
    const svc = deps.conflictResolutionService;
    app.get('/api/v1/conflict-resolution/unresolved', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listUnresolved(c, req.query['objectType'] as string | undefined)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/conflict-resolution/resolve', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.resolve(c, req.body?.conflictId, req.body?.strategy, req.body?.manualValue)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/conflict-resolution/auto-resolve', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.autoResolve(c, req.body?.strategy ?? 'user-edits-win')); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/conflict-resolution/strategy', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json({ strategy: await svc.getDefaultStrategy(c) }); } catch (err) { sendError(res, err); }
    });
    app.put('/api/v1/conflict-resolution/strategy', async (req, res) => {
      try { const c = await ctx(req); await svc.setDefaultStrategy(c, req.body?.strategy ?? 'user-edits-win'); res.status(204).end(); } catch (err) { sendError(res, err); }
    });
  }

  // ── Connector Catalog ──
  if (deps.connectorCatalogService) {
    const svc = deps.connectorCatalogService;
    app.get('/api/v1/connectors', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listCatalog(c, req.query['vendor'] as string | undefined)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/connectors/vendors', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listVendors(c)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/connectors/:id', async (req, res) => {
      try { const c = await ctx(req); const e = await svc.getCatalogEntry(c, req.params['id']!); if (!e) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(e); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/connectors/configured', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listConfigured(c)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/connectors/configured', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.configure(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/connectors/configured/:name/validate', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.validateConfigured(c, req.params['name']!)); } catch (err) { sendError(res, err); }
    });
  }

  // ── Data Expectations ──
  if (deps.dataExpectationsService) {
    const svc = deps.dataExpectationsService;
    app.get('/api/v1/data-expectations', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.list(c, req.query['targetType'] as string | undefined)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/data-expectations', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.create(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/data-expectations/:id', async (req, res) => {
      try { const c = await ctx(req); const e = await svc.get(c, req.params['id']!); if (!e) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(e); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/data-expectations/:id/gate-build', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.gateBuild(c, req.body?.targetType ?? req.params['id']!, req.body?.data ?? [])); } catch (err) { sendError(res, err); }
    });
  }

  // ── Embedded Copilots ──
  if (deps.embeddedCopilotService) {
    const svc = deps.embeddedCopilotService;
    app.get('/api/v1/copilots', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listCopilots(c, req.query['appContext'] as any)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/copilots', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.createCopilot(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/copilots/:id', async (req, res) => {
      try { const c = await ctx(req); const cop = await svc.getCopilot(c, req.params['id']!); if (!cop) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(cop); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/copilots/conversations', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.startConversation(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/copilots/conversations/:convId/messages', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.sendMessage(c, { ...req.body, conversationId: req.params['convId']! })); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/copilots/conversations', async (req, res) => {
      try { const c = await ctx(req); const user = await extractUser(req, authenticator, isDev); res.status(200).json(await svc.listConversations(c, user.id)); } catch (err) { sendError(res, err); }
    });
  }

  // ── Event Objects ──
  if (deps.eventObjectService) {
    const svc = deps.eventObjectService;
    app.get('/api/v1/event-objects', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.list(c, { eventType: req.query['eventType'] as string | undefined, caseId: req.query['caseId'] as string | undefined, limit: req.query['limit'] ? parseInt(String(req.query['limit']), 10) : undefined })); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/event-objects', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.create(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/event-objects/:id', async (req, res) => {
      try { const c = await ctx(req); const e = await svc.get(c, req.params['id']!); if (!e) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(e); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/event-objects/timeline', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.getTimeline(c, req.query['start'] as string, req.query['end'] as string, req.query['caseId'] as string | undefined)); } catch (err) { sendError(res, err); }
    });
  }

  // ── Graph Analysis ──
  if (deps.graphAnalysisService) {
    const svc = deps.graphAnalysisService;
    app.get('/api/v1/graph-analyses', async (req, res) => {
      try { const c = await ctx(req); const tags = req.query['tags'] ? String(req.query['tags']).split(',') : undefined; res.status(200).json(await svc.list(c, tags)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/graph-analyses', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.create(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/graph-analyses/:id', async (req, res) => {
      try { const c = await ctx(req); const a = await svc.get(c, req.params['id']!); if (!a) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(a); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/graph-analyses/:id/versions', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listVersions(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/graph-analyses/:id/revert/:version', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.revert(c, req.params['id']!, parseInt(req.params['version']!, 10), req.body?.message)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/graph-analyses/:id/share', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.share(c, req.params['id']!, req.body?.userIds ?? [])); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/graph-analyses/:id/duplicate', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.duplicate(c, req.params['id']!, req.body?.newName ?? 'Copy')); } catch (err) { sendError(res, err); }
    });
  }

  // ── Multi-Ontology Governance ──
  if (deps.multiOntologyGovernanceService) {
    const svc = deps.multiOntologyGovernanceService;
    app.get('/api/v1/ontology-spaces', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listSpaces(c, req.query['orgScope'] as string | undefined)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/ontology-spaces', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.createSpace(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/ontology-spaces/:id/ontologies', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listOntologies(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/ontology-spaces/:id/access', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.resolveAccessibleOntologies(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
  }

  // ── Pipeline Builds ──
  if (deps.pipelineBuildService) {
    const svc = deps.pipelineBuildService;
    app.get('/api/v1/pipeline-builds', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listBuilds(c, req.query['pipelineName'] as string | undefined, req.query['limit'] ? parseInt(String(req.query['limit']), 10) : undefined)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/pipeline-builds', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.startBuild(c, req.body?.pipelineName, req.body?.trigger ?? 'manual')); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/pipeline-builds/:id/abort', async (req, res) => {
      try { const c = await ctx(req); await svc.abortBuild(c, req.params['id']!); res.status(204).end(); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/pipeline-builds/:id/retry', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.retryBuild(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/pipeline-schedules', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listSchedules(c)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/pipeline-schedules', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.createSchedule(c, req.body)); } catch (err) { sendError(res, err); }
    });
  }

  // ── Platform Assistant ──
  if (deps.platformAssistantService) {
    const svc = deps.platformAssistantService;
    app.post('/api/v1/platform-assistant/sessions', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.startSession(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/platform-assistant/sessions', async (req, res) => {
      try { const c = await ctx(req); const user = await extractUser(req, authenticator, isDev); res.status(200).json(await svc.listSessions(c, user.id)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/platform-assistant/sessions/:id/messages', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.sendMessage(c, { ...req.body, sessionId: req.params['id']! })); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/platform-assistant/plans', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.generatePlan(c, req.body?.mode ?? 'ontology-editing', req.body?.request)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/platform-assistant/plans/:id/approve', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.approvePlan(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/platform-assistant/plans/:id/execute', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.executePlan(c, req.params['id']!)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/platform-assistant/tools', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listTools(c, req.query['mode'] as any ?? 'ontology-editing')); } catch (err) { sendError(res, err); }
    });
  }

  // ── Process Mining ──
  if (deps.processMiningService) {
    const svc = deps.processMiningService;
    app.post('/api/v1/process-mining/discover', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.discover(c, req.body?.eventLog ?? [])); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/process-mining/variants', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.discoverVariants(c, req.body?.eventLog ?? [], req.body?.limit)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/process-mining/conformance', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.checkConformance(c, req.body?.eventLog ?? [], req.body?.expectedProcess ?? [])); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/process-mining/case-stats', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.getCaseStatistics(c, req.body?.caseId ?? '', req.body?.eventLog ?? [])); } catch (err) { sendError(res, err); }
    });
  }

  // ── Workshop UX ──
  if (deps.workshopUxService) {
    const svc = deps.workshopUxService;
    app.get('/api/v1/workshop-ux/states', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.listStates(c, req.query['appId'] as string | undefined ?? '')); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/workshop-ux/states', async (req, res) => {
      try { const c = await ctx(req); res.status(201).json(await svc.saveState(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/workshop-ux/states/:id', async (req, res) => {
      try { const c = await ctx(req); const s = await svc.getState(c, req.params['id']!); if (!s) { res.status(404).json({ error: 'NOT_FOUND' }); return; } res.status(200).json(s); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/workshop-ux/redact-mode', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.getRedactMode(c)); } catch (err) { sendError(res, err); }
    });
    app.put('/api/v1/workshop-ux/redact-mode', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.updateRedactMode(c, req.body)); } catch (err) { sendError(res, err); }
    });
    app.get('/api/v1/workshop-ux/translations/:locale', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.getBundle(c, req.params['locale']!)); } catch (err) { sendError(res, err); }
    });
    app.post('/api/v1/workshop-ux/translations/auto-translate', async (req, res) => {
      try { const c = await ctx(req); res.status(200).json(await svc.autoTranslate(c, req.body?.targetLocale ?? 'en', req.body?.baseLocale)); } catch (err) { sendError(res, err); }
    });
  }
}
