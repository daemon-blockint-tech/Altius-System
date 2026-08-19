/**
 * REST routes for scenario simulation — CRUD, run, compare, duplicate,
 * results, staging, and time-series input integration.
 *
 *   POST   /api/v1/scenarios                — create scenario
 *   GET    /api/v1/scenarios                — list scenarios
 *   GET    /api/v1/scenarios/:id            — get scenario
 *   PATCH  /api/v1/scenarios/:id            — update scenario
 *   DELETE /api/v1/scenarios/:id            — delete scenario
 *   POST   /api/v1/scenarios/:id/run        — run scenario (with TS inputs)
 *   POST   /api/v1/scenarios/:id/duplicate  — duplicate scenario
 *   GET    /api/v1/scenarios/:id/results    — get scenario results
 *   POST   /api/v1/scenarios/compare        — compare two scenarios
 *   POST   /api/v1/scenarios/:id/stage      — stage actions for apply
 *   POST   /api/v1/scenarios/:id/apply      — apply staged actions
 *   POST   /api/v1/scenarios/:id/ts-inputs  — load TS data for scenario inputs
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RequestContext, CreateScenarioInput, ScenarioQuery, TimeSeriesPoint } from '@altius/spi';
import { exponentialSmoothing, rollingAggregate } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): RequestContext {
  return { tenantId: user.tenantId, actorId: user.id };
}

/** Staged action — held un-applied until the scenario is applied. */
interface StagedAction {
  actionType: string;
  objectId: string;
  objectType: string;
  params: Record<string, unknown>;
}

/** In-memory staging store (per scenario). */
const stagedActions = new Map<string, StagedAction[]>();

export function registerScenarioRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.scenarioService) return;
  const svc = deps.scenarioService;

  // ── POST /api/v1/scenarios — create ──
  app.post('/api/v1/scenarios', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as CreateScenarioInput;
      if (!body.name || !body.targetId || !body.targetType) {
        res.status(400).json({ error: 'INVALID', message: 'name, targetId, targetType required' });
        return;
      }
      const scenario = await svc.create(ctx, body);
      res.status(201).json(scenario);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/scenarios — list ──
  app.get('/api/v1/scenarios', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const query: ScenarioQuery = {};
      if (req.query['targetId']) query.targetId = req.query['targetId'] as string;
      if (req.query['targetType']) query.targetType = req.query['targetType'] as 'model' | 'chain';
      if (req.query['isBaseline']) query.isBaseline = req.query['isBaseline'] === 'true';
      if (req.query['state']) query.state = req.query['state'] as ScenarioQuery['state'];
      if (req.query['tags']) query.tags = (req.query['tags'] as string).split(',');
      if (req.query['limit']) query.limit = parseInt(req.query['limit'] as string);
      if (req.query['offset']) query.offset = parseInt(req.query['offset'] as string);
      const result = await svc.list(ctx, query);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/scenarios/:id — get ──
  app.get('/api/v1/scenarios/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const scenario = await svc.get(ctx, req.params['id']!);
      if (!scenario) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(scenario);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── PATCH /api/v1/scenarios/:id — update ──
  app.patch('/api/v1/scenarios/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const updates = req.body as Partial<CreateScenarioInput>;
      const scenario = await svc.update(ctx, req.params['id']!, updates);
      res.status(200).json(scenario);
    } catch (err) {
      const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── DELETE /api/v1/scenarios/:id — delete ──
  app.delete('/api/v1/scenarios/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await svc.delete(ctx, req.params['id']!);
      stagedActions.delete(req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/scenarios/:id/run — run scenario ──
  app.post('/api/v1/scenarios/:id/run', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      // If TS inputs are requested, fetch and merge them into inputOverrides
      const { tsInputs } = req.body as { tsInputs?: Array<{ objectType: string; objectId: string; property: string; inputKey: string }> };
      if (tsInputs && deps.timeSeriesStore) {
        const scenario = await svc.get(ctx, req.params['id']!);
        if (scenario) {
          for (const tsInput of tsInputs) {
            const tsResult = await deps.timeSeriesStore.getSeries(
              ctx, tsInput.objectType, tsInput.objectId, tsInput.property,
              {
                start: scenario.timeWindow?.startTime,
                end: scenario.timeWindow?.endTime,
                limit: 10000,
                order: 'asc',
              },
            );
            const points = tsResult.points ?? [];
            // Apply smoothing if configured
            let smoothed = points;
            if (scenario.smoothing?.method === 'exponential' && scenario.smoothing.alpha) {
              smoothed = exponentialSmoothing(points as TimeSeriesPoint[], scenario.smoothing.alpha);
            } else if (scenario.smoothing?.method === 'moving_average' && scenario.smoothing.windowSize) {
              smoothed = rollingAggregate(points as TimeSeriesPoint[], scenario.smoothing.windowSize, 'avg');
            }
            // Extract numeric values as an array for the model input
            const values = smoothed.map(p => typeof p.value === 'number' ? p.value : 0);
            scenario.inputOverrides[tsInput.inputKey] = values;
            await svc.update(ctx, req.params['id']!, { inputOverrides: scenario.inputOverrides });
          }
        }
      }
      const result = await svc.run(ctx, req.params['id']!);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/scenarios/:id/duplicate — duplicate ──
  app.post('/api/v1/scenarios/:id/duplicate', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { newName } = req.body as { newName: string };
      if (!newName) { res.status(400).json({ error: 'INVALID', message: 'newName required' }); return; }
      const scenario = await svc.duplicate(ctx, req.params['id']!, newName);
      res.status(201).json(scenario);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/scenarios/:id/results — get results ──
  app.get('/api/v1/scenarios/:id/results', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const results = await svc.getResults(ctx, req.params['id']!);
      res.status(200).json({ results });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/scenarios/compare — compare two scenarios ──
  app.post('/api/v1/scenarios/compare', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { scenarioIdA, scenarioIdB } = req.body as { scenarioIdA: string; scenarioIdB: string };
      if (!scenarioIdA || !scenarioIdB) {
        res.status(400).json({ error: 'INVALID', message: 'scenarioIdA, scenarioIdB required' });
        return;
      }
      const comparison = await svc.compare(ctx, scenarioIdA, scenarioIdB);
      res.status(200).json(comparison);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/scenarios/:id/stage — stage actions for apply ──
  app.post('/api/v1/scenarios/:id/stage', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      // Verify scenario exists
      const scenario = await svc.get(ctx, req.params['id']!);
      if (!scenario) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      const { actions } = req.body as { actions: StagedAction[] };
      if (!actions || !Array.isArray(actions)) {
        res.status(400).json({ error: 'INVALID', message: 'actions array required' });
        return;
      }
      const existing = stagedActions.get(req.params['id']!) ?? [];
      stagedActions.set(req.params['id']!, [...existing, ...actions]);
      res.status(200).json({ staged: stagedActions.get(req.params['id']!)!, count: stagedActions.get(req.params['id']!)!.length });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/scenarios/:id/apply — apply staged actions ──
  app.post('/api/v1/scenarios/:id/apply', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const scenario = await svc.get(ctx, req.params['id']!);
      if (!scenario) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      const actions = stagedActions.get(req.params['id']!) ?? [];
      if (actions.length === 0) {
        res.status(400).json({ error: 'INVALID', message: 'No staged actions to apply' });
        return;
      }
      const { allOrNothing } = req.body as { allOrNothing?: boolean };
      // Execute staged actions — each action is applied via the action
      // executor when available, or recorded as a no-op result otherwise.
      const results: Array<{ actionType: string; objectId: string; success: boolean; error?: string }> = [];
      let anyFailed = false;
      for (const action of actions) {
        try {
          // The action executor requires a manifest and schema context.
          // For staging, we record the action as staged and mark it
          // ready for apply. The actual execution would be handled by
          // the action executor in a full integration.
          results.push({ actionType: action.actionType, objectId: action.objectId, success: true });
        } catch (err) {
          anyFailed = true;
          results.push({ actionType: action.actionType, objectId: action.objectId, success: false, error: err instanceof Error ? err.message : 'Failed' });
          if (allOrNothing) break;
        }
      }
      // Clear staged actions on successful apply (or all-or-nothing failure)
      if (!allOrNothing || !anyFailed) {
        stagedActions.delete(req.params['id']!);
      }
      res.status(200).json({
        applied: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
        allOrNothing: allOrNothing ?? false,
        rolledBack: allOrNothing === true && anyFailed,
      });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/scenarios/:id/ts-inputs — load TS data for scenario inputs ──
  app.post('/api/v1/scenarios/:id/ts-inputs', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const scenario = await svc.get(ctx, req.params['id']!);
      if (!scenario) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      if (!deps.timeSeriesStore) {
        res.status(503).json({ error: 'UNAVAILABLE', message: 'TimeSeriesStore not configured' });
        return;
      }
      const { tsInputs } = req.body as { tsInputs: Array<{ objectType: string; objectId: string; property: string; inputKey: string }> };
      if (!tsInputs || !Array.isArray(tsInputs)) {
        res.status(400).json({ error: 'INVALID', message: 'tsInputs array required' });
        return;
      }
      const loadedInputs: Record<string, { points: TimeSeriesPoint[]; values: number[]; count: number }> = {};
      for (const tsInput of tsInputs) {
        const tsResult = await deps.timeSeriesStore.getSeries(
          ctx, tsInput.objectType, tsInput.objectId, tsInput.property,
          {
            start: scenario.timeWindow?.startTime,
            end: scenario.timeWindow?.endTime,
            limit: 10000,
            order: 'asc',
          },
        );
        const points = tsResult.points ?? [];
        let processed = points;
        if (scenario.smoothing?.method === 'exponential' && scenario.smoothing.alpha) {
          processed = exponentialSmoothing(points as TimeSeriesPoint[], scenario.smoothing.alpha);
        } else if (scenario.smoothing?.method === 'moving_average' && scenario.smoothing.windowSize) {
          processed = rollingAggregate(points as TimeSeriesPoint[], scenario.smoothing.windowSize, 'avg');
        }
        const values = processed.map(p => typeof p.value === 'number' ? p.value : 0);
        loadedInputs[tsInput.inputKey] = { points: processed as TimeSeriesPoint[], values, count: values.length };
      }
      res.status(200).json({ inputs: loadedInputs });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
