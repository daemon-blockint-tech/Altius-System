/**
 * ApprovalWorkflowService conformance — the same assertions against every
 * provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { ApprovalWorkflowService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryApprovalWorkflowService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresApprovalWorkflowService } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

const CTX = (tenantId: string, actorId = 'u1'): RequestContext => ({ tenantId, actorId });

const WORKFLOW = {
  name: 'export-approval',
  description: 'Approve data exports',
  actionType: 'exportData',
  criteria: [],
  approverAttributes: [],
  multiStep: false,
  enabled: true,
};

const WORKFLOW_WITH_CRITERIA = {
  ...WORKFLOW,
  name: 'abac',
  criteria: [
    {
      id: 'c1',
      name: 'manager-only',
      description: '',
      actionType: 'exportData',
      userAttributes: [{ attribute: 'role', operator: 'eq', value: 'manager' }],
      resourceAttributes: [],
      environmentAttributes: [],
      matchMode: 'all',
      requiresSecondReviewer: false,
    },
  ],
};

let counter = 0;
const tenant = (label: string) => `t_awf_${label}_${counter++}`;

function runTests(name: string, factory: () => Promise<ApprovalWorkflowService>): void {
  describe(`[${name}] SPI Conformance: ApprovalWorkflowService`, () => {
    it('creates and gets a workflow', async () => {
      const svc = await factory();
      const t = tenant('create');
      const wf = await svc.createWorkflow(CTX(t), WORKFLOW);
      expect(wf.id).toBeTruthy();
      expect(wf.tenantId).toBe(t);

      const fetched = await svc.getWorkflow(CTX(t), wf.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(wf.id);
      expect(fetched!.name).toBe(WORKFLOW.name);
    });

    it('lists workflows and filters by action type', async () => {
      const svc = await factory();
      const t = tenant('list');
      await svc.createWorkflow(CTX(t), { ...WORKFLOW, name: 'a', actionType: 'A' });
      await svc.createWorkflow(CTX(t), { ...WORKFLOW, name: 'b', actionType: 'B' });

      const all = await svc.listWorkflows(CTX(t));
      expect(all).toHaveLength(2);

      const aOnly = await svc.listWorkflows(CTX(t), 'A');
      expect(aOnly).toHaveLength(1);
      expect(aOnly[0]!.actionType).toBe('A');
    });

    it('updates a workflow', async () => {
      const svc = await factory();
      const t = tenant('update');
      const wf = await svc.createWorkflow(CTX(t), WORKFLOW);
      const updated = await svc.updateWorkflow(CTX(t), wf.id, { name: 'renamed', enabled: false });
      expect(updated.name).toBe('renamed');
      expect(updated.enabled).toBe(false);

      const fetched = await svc.getWorkflow(CTX(t), wf.id);
      expect(fetched!.name).toBe('renamed');
      expect(fetched!.enabled).toBe(false);
    });

    it('deletes a workflow', async () => {
      const svc = await factory();
      const t = tenant('delete');
      const wf = await svc.createWorkflow(CTX(t), WORKFLOW);
      await svc.deleteWorkflow(CTX(t), wf.id);
      const fetched = await svc.getWorkflow(CTX(t), wf.id);
      expect(fetched).toBeNull();
    });

    it('submits and evaluates ABAC criteria', async () => {
      const svc = await factory();
      const t = tenant('submit');
      const wf = await svc.createWorkflow(CTX(t), WORKFLOW_WITH_CRITERIA);

      const pass = await svc.submit(CTX(t), wf.id, {
        parameters: { file: 'data.csv' },
        submitterAttributes: { role: 'manager' },
        resourceAttributes: {},
        riskLevel: 'medium',
      });
      expect(pass.state).toBe('pending');
      expect(pass.criteriaPassed).toBe(true);

      const fail = await svc.submit(CTX(t), wf.id, {
        parameters: {},
        submitterAttributes: { role: 'viewer' },
        resourceAttributes: {},
        riskLevel: 'low',
      });
      expect(fail.criteriaPassed).toBe(false);
    });

    it('approves, rejects, and withdraws submissions', async () => {
      const svc = await factory();
      const t = tenant('decide');
      const wf = await svc.createWorkflow(CTX(t), WORKFLOW);

      const s1 = await svc.submit(CTX(t), wf.id, { parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low' });
      const approved = await svc.approve(CTX(t, 'admin'), s1.id, 'ok');
      expect(approved.state).toBe('approved');
      expect(approved.decidedBy).toBe('admin');
      expect(approved.decisionNotes).toBe('ok');

      const s2 = await svc.submit(CTX(t), wf.id, { parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low' });
      const rejected = await svc.reject(CTX(t, 'admin'), s2.id, 'no');
      expect(rejected.state).toBe('rejected');
      expect(rejected.decisionNotes).toBe('no');

      const s3 = await svc.submit(CTX(t), wf.id, { parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low' });
      const withdrawn = await svc.withdraw(CTX(t), s3.id);
      expect(withdrawn.state).toBe('withdrawn');

      await expect(svc.approve(CTX(t), approved.id)).rejects.toThrow(/Cannot approved a approved submission/);
      await expect(svc.reject(CTX(t), rejected.id, 'again')).rejects.toThrow(/Cannot rejected a rejected submission/);
      await expect(svc.withdraw(CTX(t), withdrawn.id)).rejects.toThrow(/Cannot withdrawn a withdrawn submission/);
    });

    it('lists and gets submissions', async () => {
      const svc = await factory();
      const t = tenant('submissions');
      const wf = await svc.createWorkflow(CTX(t), WORKFLOW);

      const s1 = await svc.submit(CTX(t), wf.id, { parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low' });
      await svc.submit(CTX(t), wf.id, { parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low' });
      await svc.approve(CTX(t), s1.id);

      const pending = await svc.listSubmissions(CTX(t), 'pending');
      expect(pending).toHaveLength(1);

      const approved = await svc.listSubmissions(CTX(t), 'approved');
      expect(approved).toHaveLength(1);

      const got = await svc.getSubmission(CTX(t), s1.id);
      expect(got).not.toBeNull();
      expect(got!.state).toBe('approved');
    });

    it('isolates tenants', async () => {
      const svc = await factory();
      const t1 = tenant('iso_a');
      const t2 = tenant('iso_b');
      const wf = await svc.createWorkflow(CTX(t1), WORKFLOW);

      expect(await svc.getWorkflow(CTX(t2), wf.id)).toBeNull();
      expect(await svc.listWorkflows(CTX(t2))).toHaveLength(0);

      const sub = await svc.submit(CTX(t1), wf.id, { parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low' });
      expect(await svc.getSubmission(CTX(t2), sub.id)).toBeNull();
      expect(await svc.listSubmissions(CTX(t2))).toHaveLength(0);
    });
  });
}

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryApprovalWorkflowService();
runTests('InMemoryApprovalWorkflowService', () => Promise.resolve(memory));

// ── Postgres ──────────────────────────────────────────────────────────────
const PG_TEST_URL = pgTestUrl;

function pgConfig(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 828281;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'ApprovalConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_awf_bootstrap', actorId: 'conformance' };

  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {
          /* table may not exist yet on a fresh database */
        });
      await provider.applySchema(bootstrapCtx, ontology);
    })();
    return ready;
  };

  runTests('PostgresApprovalWorkflowService', async () => {
    await ensureSchema();
    return new PostgresApprovalWorkflowService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."approval_submissions" WHERE "tenant_id" LIKE 't_awf_%'`)
      .catch(() => {});
    await provider.pool
      .query(`DELETE FROM "governance"."approval_workflows" WHERE "tenant_id" LIKE 't_awf_%'`)
      .catch(() => {});
    await provider.close();
  });

  describe('PostgresApprovalWorkflowService durability', () => {
    it('survives a restart: workflows and submissions are still there', async () => {
      const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      const TENANT = 't_awf_restart';
      let wfId: string;
      let subId: string;
      try {
        await first.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929291,
            objectTypes: [{ name: 'ApprovalRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          },
        );
        const svc = new PostgresApprovalWorkflowService(first.pool);
        const wf = await svc.createWorkflow({ tenantId: TENANT, actorId: 'agent' }, WORKFLOW);
        wfId = wf.id;
        const sub = await svc.submit({ tenantId: TENANT, actorId: 'agent' }, wfId, {
          parameters: { file: 'data.csv' },
          submitterAttributes: { role: 'manager' },
          resourceAttributes: {},
          riskLevel: 'medium',
        });
        subId = sub.id;
        const approved = await svc.approve({ tenantId: TENANT, actorId: 'admin' }, subId, 'approved');
        expect(approved.state).toBe('approved');
      } finally {
        await first.close();
      }

      const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      try {
        await second.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929292,
            objectTypes: [{ name: 'ApprovalRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          },
        );
        const fresh = new PostgresApprovalWorkflowService(second.pool);
        const wf = await fresh.getWorkflow({ tenantId: TENANT, actorId: 'restart' }, wfId!);
        expect(wf).not.toBeNull();
        expect(wf!.name).toBe(WORKFLOW.name);

        const sub = await fresh.getSubmission({ tenantId: TENANT, actorId: 'restart' }, subId!);
        expect(sub).not.toBeNull();
        expect(sub!.state).toBe('approved');
        expect(sub!.decidedBy).toBe('admin');
        expect(sub!.decisionNotes).toBe('approved');
        expect(sub!.criteriaPassed).toBe(true);
      } finally {
        await second.pool
          .query(`DELETE FROM "governance"."approval_submissions" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.pool
          .query(`DELETE FROM "governance"."approval_workflows" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.close();
      }
    });
  });
}
